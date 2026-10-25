"""TeraPlayz backend: FastAPI app serving the public site, the /admin panel, the JSON API,
and video/thumbnail streaming from Telegram (or local disk in dev mode)."""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import re
import secrets
import shutil
import sys
import tempfile
import time
import uuid
from collections import OrderedDict, defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

from .storage import BaseStorage, LocalStorage, TelegramStorage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("teraplayz")

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# ------------------------------------------------------------------ config (env vars only)
TG_API_ID = os.getenv("TG_API_ID", "").strip()
TG_API_HASH = os.getenv("TG_API_HASH", "").strip()
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "").strip()
TG_CHANNEL_ID = os.getenv("TG_CHANNEL_ID", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
# STORAGE=local is for local development/testing only. Default: telegram.
STORAGE = os.getenv("STORAGE", "telegram").strip().lower()
LOCAL_DATA_DIR = os.getenv("LOCAL_DATA_DIR", str(ROOT / "data"))

if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_hex(32)
    log.warning("SESSION_SECRET not set — using a random one (admin sessions reset on restart)")

SESSION_COOKIE = "tp_admin"
SESSION_MAX_AGE = 7 * 24 * 3600
VISITOR_COOKIE = "tp_vid"
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 15 * 60
LOGIN_GLOBAL_MAX = 50
STATS_FLUSH_SECONDS = 5 * 60
META_SAVE_DEBOUNCE = 2.0
KEEP_DAYS = 90
MAX_VIDEO_BYTES = 2000 * 1024 * 1024  # Telegram bot (MTProto) limit is 2 GB
MAX_THUMB_BYTES = 5 * 1024 * 1024
TEMP_DIR = Path(tempfile.gettempdir()) / "teraplayz-uploads"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

signer = TimestampSigner(SESSION_SECRET, salt="tp-admin-session")
START_TIME = time.time()


def make_storage() -> BaseStorage:
    if STORAGE == "local":
        log.warning("STORAGE=local — files are kept on local disk (development mode only)")
        return LocalStorage(LOCAL_DATA_DIR)
    missing = [k for k, v in {"TG_API_ID": TG_API_ID, "TG_API_HASH": TG_API_HASH,
                               "TG_BOT_TOKEN": TG_BOT_TOKEN, "TG_CHANNEL_ID": TG_CHANNEL_ID}.items() if not v]
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)} (or set STORAGE=local for dev)")
    return TelegramStorage(int(TG_API_ID), TG_API_HASH, TG_BOT_TOKEN, int(TG_CHANNEL_ID))


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ------------------------------------------------------------------ database (JSON doc in Telegram)
class DB:
    """All metadata + analytics in one JSON document, cached in memory.
    Metadata changes are saved (debounced) right away; analytics are flushed periodically."""

    def __init__(self, storage: BaseStorage):
        self.storage = storage
        self.data: dict = {"version": 1, "videos": [], "stats": {"days": {}}}
        self.lock = asyncio.Lock()
        self.dirty = False
        self.last_save: Optional[float] = None
        self.last_error: Optional[str] = None
        self._save_task: Optional[asyncio.Task] = None
        self._visitors_today: set[str] = set()

    async def load(self):
        raw = await self.storage.load_db()
        if raw:
            self.data = json.loads(raw)
            self.data.setdefault("videos", [])
            self.data.setdefault("stats", {}).setdefault("days", {})
        d = self.data["stats"]["days"].get(today())
        if d:
            self._visitors_today = set(d.get("visitors", []))
        log.info("DB loaded: %d videos", len(self.data["videos"]))

    @property
    def videos(self) -> list[dict]:
        return self.data["videos"]

    def get(self, vid: str) -> Optional[dict]:
        return next((v for v in self.videos if v["id"] == vid), None)

    def _prune(self):
        days = self.data["stats"]["days"]
        cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
        t = today()
        for k in list(days):
            if k < cutoff:
                del days[k]
            elif k != t:
                days[k].pop("visitors", None)  # only keep hashed visitor ids for today

    async def save(self):
        async with self.lock:
            self._prune()
            payload = json.dumps(self.data, separators=(",", ":"), ensure_ascii=False).encode()
            try:
                await self.storage.save_db(payload)
                self.dirty = False
                self.last_save = time.time()
                self.last_error = None
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {e}"
                log.exception("DB save failed")
                raise

    def schedule_save(self):
        """Debounced save for metadata changes."""
        self.dirty = True
        if self._save_task and not self._save_task.done():
            return

        async def later():
            await asyncio.sleep(META_SAVE_DEBOUNCE)
            with contextlib.suppress(Exception):
                await self.save()

        self._save_task = asyncio.create_task(later())

    # analytics -----------------------------------------------------
    def track_pageview(self, visitor: str):
        t = today()
        days = self.data["stats"]["days"]
        if t not in days:
            days[t] = {"pv": 0, "uv": 0, "visitors": []}
            self._visitors_today = set()
        d = days[t]
        d["pv"] = d.get("pv", 0) + 1
        h = hashlib.sha256((SESSION_SECRET + t + visitor).encode()).hexdigest()[:12]
        if h not in self._visitors_today:
            self._visitors_today.add(h)
            d.setdefault("visitors", []).append(h)
            d["uv"] = len(self._visitors_today)
        self.dirty = True

    def track_view(self, v: dict):
        v["views"] = v.get("views", 0) + 1
        d = self.data["stats"]["days"].setdefault(today(), {"pv": 0, "uv": 0, "visitors": []})
        d["plays"] = d.get("plays", 0) + 1
        self.dirty = True


storage: BaseStorage
db: DB
jobs: dict[str, dict] = {}
thumb_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()
login_attempts: dict[str, deque] = defaultdict(deque)
login_failures_all: deque = deque()  # global cap across all IPs
view_seen: dict[str, float] = {}


async def flusher():
    while True:
        await asyncio.sleep(STATS_FLUSH_SECONDS)
        if db.dirty:
            with contextlib.suppress(Exception):
                await db.save()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    global storage, db
    storage = make_storage()
    await storage.start()
    db = DB(storage)
    await db.load()
    task = asyncio.create_task(flusher())
    try:
        yield
    finally:
        task.cancel()
        if db.dirty:  # flush analytics on shutdown (Render sends SIGTERM before sleeping/redeploying)
            with contextlib.suppress(Exception):
                await db.save()
        await storage.stop()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    p = request.url.path
    if p.startswith("/admin"):
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["X-Frame-Options"] = "DENY"
    elif p in ("/", "/index.html", "/config.js", "/sw.js", "/app.js", "/styles.css"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


# ------------------------------------------------------------------ helpers
def client_ip(request: Request) -> str:
    # Render's proxy appends the real client IP as the LAST X-Forwarded-For entry; earlier entries
    # are client-supplied and could be spoofed to dodge the login rate limit.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "?"


def is_https(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto", "") == "https"


def public_video(v: dict) -> dict:
    return {
        "id": v["id"], "title": v["title"], "description": v.get("description", ""),
        "category": v.get("category", "Other"), "date": v.get("date"), "duration": v.get("duration", ""),
        "featured": bool(v.get("featured")), "views": v.get("views", 0),
        "thumbnail": f"/thumb/{v['id']}" if v.get("thumb") else None,
        "previewUrl": f"/stream/{v['id']}", "fullUrl": f"/stream/{v['id']}",
    }


def admin_video(v: dict) -> dict:
    d = public_video(v)
    d.update({"size": v.get("size", 0), "mime": v.get("mime"), "filename": v.get("filename"),
              "created_at": v.get("created_at")})
    return d


def sorted_videos() -> list[dict]:
    return sorted(db.videos, key=lambda v: (bool(v.get("featured")), v.get("date") or "", v.get("created_at", 0)),
                  reverse=True)


def is_admin(request: Request) -> bool:
    tok = request.cookies.get(SESSION_COOKIE)
    if not tok:
        return False
    try:
        val = signer.unsign(tok, max_age=SESSION_MAX_AGE).decode()
    except (BadSignature, SignatureExpired):
        return False
    return val == "admin"


def require_admin(request: Request, mutating: bool = False):
    if not is_admin(request):
        raise HTTPException(401, "Not logged in")
    # CSRF protection: SameSite=Strict cookie + custom header that cross-site forms can't send
    if mutating and request.headers.get("x-tp-admin") != "1":
        raise HTTPException(403, "Missing admin header")


def clean_text(s: Optional[str], n: int) -> str:
    return (s or "").strip()[:n]


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DURATION_RE = re.compile(r"^\d{1,2}(:\d{2}){1,2}$")


# ------------------------------------------------------------------ public API
@app.get("/api/videos")
async def api_videos():
    return {"videos": [public_video(v) for v in sorted_videos()]}


@app.get("/api/videos/{vid}")
async def api_video(vid: str):
    v = db.get(vid)
    if not v:
        raise HTTPException(404, "Video not found")
    return public_video(v)


@app.post("/api/track")
async def api_track(request: Request):
    vid = request.cookies.get(VISITOR_COOKIE)
    resp = JSONResponse({"ok": True})
    if not vid or not re.fullmatch(r"[a-f0-9]{32}", vid):
        vid = uuid.uuid4().hex
        resp.set_cookie(VISITOR_COOKIE, vid, max_age=365 * 86400, httponly=True, samesite="lax",
                        secure=is_https(request))
    db.track_pageview(vid)
    return resp


@app.post("/api/videos/{vid}/view")
async def api_view(vid: str, request: Request):
    v = db.get(vid)
    if not v:
        raise HTTPException(404, "Video not found")
    key = f"{request.cookies.get(VISITOR_COOKIE) or client_ip(request)}:{vid}"
    now = time.time()
    if now - view_seen.get(key, 0) > 30 * 60:  # one view per visitor per video per 30 min
        view_seen[key] = now
        db.track_view(v)
        if len(view_seen) > 50000:
            view_seen.clear()
    return {"ok": True, "views": v.get("views", 0)}


RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@app.get("/stream/{vid}")
async def stream(vid: str, request: Request):
    v = db.get(vid)
    if not v:
        raise HTTPException(404, "Video not found")
    size = v.get("size") or await storage.size(v["file"])
    mime = v.get("mime") or "video/mp4"
    headers = {"Accept-Ranges": "bytes", "Content-Type": mime, "Cache-Control": "public, max-age=3600"}
    rng = request.headers.get("range")
    if rng:
        m = RANGE_RE.fullmatch(rng.strip())
        if not m or (not m.group(1) and not m.group(2)):
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:  # suffix range: last N bytes
            start = max(0, size - int(m.group(2)))
            end = size - 1
        end = min(end, size - 1)
        if start >= size or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        headers["Content-Length"] = str(end - start + 1)
        return StreamingResponse(storage.iter_range(v["file"], start, end), status_code=206,
                                 headers=headers, media_type=mime)
    headers["Content-Length"] = str(size)
    return StreamingResponse(storage.iter_range(v["file"], 0, size - 1), headers=headers, media_type=mime)


@app.get("/thumb/{vid}")
async def thumb(vid: str):
    v = db.get(vid)
    if not v or not v.get("thumb"):
        raise HTTPException(404, "No thumbnail")
    key = f"{vid}:{json.dumps(v['thumb'], sort_keys=True)}"
    if key in thumb_cache:
        thumb_cache.move_to_end(key)
        data, mime = thumb_cache[key]
    else:
        data = await storage.get_bytes(v["thumb"])
        mime = v.get("thumb_mime") or "image/jpeg"
        thumb_cache[key] = (data, mime)
        while len(thumb_cache) > 300:
            thumb_cache.popitem(last=False)
    return Response(data, media_type=mime, headers={"Cache-Control": "public, max-age=86400"})


# ------------------------------------------------------------------ admin auth
@app.post("/admin/api/login")
async def admin_login(request: Request):
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "ADMIN_PASSWORD is not set on the server")
    ip = client_ip(request)
    q = login_attempts[ip]
    now = time.time()
    while q and now - q[0] > LOGIN_WINDOW:
        q.popleft()
    while login_failures_all and now - login_failures_all[0] > LOGIN_WINDOW:
        login_failures_all.popleft()
    if len(q) >= LOGIN_MAX_ATTEMPTS or len(login_failures_all) >= LOGIN_GLOBAL_MAX:
        retry = int(LOGIN_WINDOW - (now - (q[0] if q else login_failures_all[0]))) + 1
        raise HTTPException(429, f"Too many attempts. Try again in {retry // 60 + 1} min.",
                            headers={"Retry-After": str(retry)})
    try:
        body = await request.json()
    except Exception:
        body = {}
    pw = str(body.get("password", ""))
    if not hmac.compare_digest(pw.encode(), ADMIN_PASSWORD.encode()):
        q.append(now)
        login_failures_all.append(now)
        await asyncio.sleep(0.5)
        left = LOGIN_MAX_ATTEMPTS - len(q)
        raise HTTPException(401, f"Wrong password. {left} attempt{'s' if left != 1 else ''} left.")
    q.clear()
    resp = JSONResponse({"ok": True})
    resp.set_cookie(SESSION_COOKIE, signer.sign("admin").decode(), max_age=SESSION_MAX_AGE, httponly=True,
                    secure=is_https(request), samesite="strict", path="/")
    return resp


@app.post("/admin/api/logout")
async def admin_logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


@app.get("/admin/api/me")
async def admin_me(request: Request):
    return {"loggedIn": is_admin(request), "passwordConfigured": bool(ADMIN_PASSWORD)}


# ------------------------------------------------------------------ admin data
@app.get("/admin/api/stats")
async def admin_stats(request: Request, days: int = 7):
    require_admin(request)
    days = 30 if days > 7 else 7
    sd = db.data["stats"]["days"]
    now = datetime.now(timezone.utc)
    series = []
    for i in range(days - 1, -1, -1):
        k = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        d = sd.get(k, {})
        series.append({"date": k, "pageviews": d.get("pv", 0), "visitors": d.get("uv", 0), "plays": d.get("plays", 0)})
    vids = db.videos
    by_views = sorted(vids, key=lambda v: v.get("views", 0), reverse=True)
    top = by_views[:5]
    rss = None
    with contextlib.suppress(Exception):
        with open("/proc/self/statm") as f:
            rss = int(f.read().split()[1]) * os.sysconf("SC_PAGE_SIZE")
    return {
        "totals": {
            "videos": len(vids), "views": sum(v.get("views", 0) for v in vids),
            "storageBytes": sum(v.get("size", 0) for v in vids),
            "pageviews": sum(s["pageviews"] for s in series), "visitors": sum(s["visitors"] for s in series),
            "todayPageviews": series[-1]["pageviews"], "todayVisitors": series[-1]["visitors"],
        },
        "series": series,
        "top": [{"id": v["id"], "title": v["title"], "views": v.get("views", 0), "category": v.get("category")}
                for v in top],
        "allViews": [{"id": v["id"], "title": v["title"], "views": v.get("views", 0)} for v in by_views],
        "status": {
            **storage.status(),
            "uptimeSeconds": int(time.time() - START_TIME),
            "lastSave": db.last_save, "lastSaveError": db.last_error, "unsavedChanges": db.dirty,
            "python": sys.version.split()[0], "memoryBytes": rss,
            "activeJobs": sum(1 for j in jobs.values() if j["status"] in ("receiving", "uploading")),
        },
    }


@app.get("/admin/api/videos")
async def admin_videos(request: Request):
    require_admin(request)
    return {"videos": [admin_video(v) for v in sorted_videos()]}


@app.patch("/admin/api/videos/{vid}")
async def admin_edit(vid: str, request: Request):
    require_admin(request, mutating=True)
    v = db.get(vid)
    if not v:
        raise HTTPException(404, "Video not found")
    body = await request.json()
    if "title" in body:
        t = clean_text(body["title"], 200)
        if not t:
            raise HTTPException(400, "Title is required")
        v["title"] = t
    if "category" in body:
        v["category"] = clean_text(body["category"], 40) or "Other"
    if "description" in body:
        v["description"] = clean_text(body["description"], 2000)
    if "featured" in body:
        v["featured"] = bool(body["featured"])
    if "date" in body and DATE_RE.match(str(body["date"])):
        v["date"] = body["date"]
    if "duration" in body and (body["duration"] == "" or DURATION_RE.match(str(body["duration"]))):
        v["duration"] = body["duration"]
    db.schedule_save()
    return admin_video(v)


@app.delete("/admin/api/videos/{vid}")
async def admin_delete(vid: str, request: Request):
    require_admin(request, mutating=True)
    v = db.get(vid)
    if not v:
        raise HTTPException(404, "Video not found")
    db.videos.remove(v)
    db.schedule_save()
    with contextlib.suppress(Exception):
        await storage.delete([r for r in (v.get("file"), v.get("thumb")) if r])
    return {"ok": True}


def _safe_name(name: str) -> str:
    name = os.path.basename(name or "video.mp4")
    return re.sub(r"[^\w.\- ]+", "_", name)[:120] or "video.mp4"


@app.post("/admin/api/upload")
async def admin_upload(
    request: Request,
    video: UploadFile = File(...),
    thumbnail: Optional[UploadFile] = File(None),
    title: str = Form(...),
    category: str = Form("Other"),
    description: str = Form(""),
    duration: str = Form(""),
    featured: str = Form("false"),
    date: str = Form(""),
):
    require_admin(request, mutating=True)
    title = clean_text(title, 200)
    if not title:
        raise HTTPException(400, "Title is required")
    vname = _safe_name(video.filename)
    vmime = video.content_type if (video.content_type or "").startswith("video/") else \
        (mimetypes.guess_type(vname)[0] or "video/mp4")
    if not vmime.startswith("video/"):
        raise HTTPException(400, "Please upload a video file")

    # FastAPI closes the upload's temp file after the response, so move it to our own temp file
    job_id = uuid.uuid4().hex[:12]
    vpath = TEMP_DIR / f"{job_id}{Path(vname).suffix}"
    def _copy():
        with open(vpath, "wb") as out:
            shutil.copyfileobj(video.file, out, 1024 * 1024)

    await asyncio.to_thread(_copy)
    vsize = vpath.stat().st_size
    if vsize == 0 or vsize > MAX_VIDEO_BYTES:
        vpath.unlink(missing_ok=True)
        raise HTTPException(400, "Video is empty or larger than 2 GB")
    tpath = tmime = None
    if thumbnail is not None and thumbnail.filename:
        data = await thumbnail.read()
        if data and len(data) <= MAX_THUMB_BYTES and (thumbnail.content_type or "").startswith("image/"):
            tmime = thumbnail.content_type
            tpath = TEMP_DIR / f"{job_id}-thumb{mimetypes.guess_extension(tmime) or '.jpg'}"
            tpath.write_bytes(data)

    meta = {
        "id": job_id, "title": title, "category": clean_text(category, 40) or "Other",
        "description": clean_text(description, 2000),
        "duration": duration if DURATION_RE.match(duration or "") else "",
        "featured": featured.lower() in ("1", "true", "on", "yes"),
        "date": date if DATE_RE.match(date or "") else today(),
        "views": 0, "size": vsize, "mime": vmime, "filename": vname, "created_at": time.time(),
    }
    job = {"id": job_id, "status": "uploading", "progress": 0.0, "error": None, "videoId": None,
           "title": title, "started": time.time()}
    jobs[job_id] = job
    asyncio.create_task(_upload_job(job, meta, vpath, vname, vmime, tpath, tmime))
    return {"job": job}


async def _upload_job(job, meta, vpath: Path, vname, vmime, tpath: Optional[Path], tmime):
    def prog(done, total):
        job["progress"] = round(done / max(total, 1), 4)

    try:
        caption = f"🎬 {meta['title']}\n#teraplayz id:{meta['id']}"
        meta["file"] = await storage.put(str(vpath), vname, vmime, caption=caption, progress=prog)
        if tpath:
            meta["thumb"] = await storage.put(str(tpath), f"{meta['id']}-thumb{tpath.suffix}", tmime,
                                              caption=f"🖼 thumbnail id:{meta['id']}")
            meta["thumb_mime"] = tmime
        db.videos.append(meta)
        await db.save()
        job.update(status="done", progress=1.0, videoId=meta["id"])
    except Exception as e:
        log.exception("Upload job failed")
        job.update(status="error", error=f"{type(e).__name__}: {e}")
    finally:
        vpath.unlink(missing_ok=True)
        if tpath:
            tpath.unlink(missing_ok=True)
        # forget finished jobs after an hour
        for k in [k for k, j in jobs.items() if j["status"] in ("done", "error") and time.time() - j["started"] > 3600]:
            jobs.pop(k, None)


@app.get("/admin/api/jobs/{job_id}")
async def admin_job(job_id: str, request: Request):
    require_admin(request)
    j = jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


# ------------------------------------------------------------------ static frontend
@app.get("/admin")
async def admin_redirect():
    return RedirectResponse("/admin/")


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/config.js")
async def config_js():
    """Serve public/config.js, swapping in Telegram links from env vars when set."""
    from fastapi.responses import Response
    js = (PUBLIC / "config.js").read_text(encoding="utf-8")
    premium = os.environ.get("PREMIUM_TELEGRAM_LINK", "").strip()
    channel = os.environ.get("PUBLIC_TELEGRAM_LINK", "").strip()
    if premium:
        js = js.replace("https://t.me/YOUR_PREMIUM_GROUP", premium.replace('"', ""))
    if channel:
        js = js.replace("https://t.me/YOUR_PUBLIC_CHANNEL", channel.replace('"', ""))
    return Response(js, media_type="application/javascript", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=str(PUBLIC), html=True), name="public")
