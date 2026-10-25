"""Storage backends for TeraPlayz.

TelegramStorage: video files, thumbnails AND the JSON "database" live in a private Telegram channel.
LocalStorage:    same interface, files on local disk. For development/testing only (Render disk is ephemeral).
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import time
import uuid
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

log = logging.getLogger("teraplayz.storage")

DB_FILENAME = "teraplayz-db.json"
DB_CAPTION = "#teraplayz_db — do not delete or unpin (TeraPlayz metadata database)"
CHUNK = 1024 * 1024  # 1 MiB: Telegram's max request size; offsets are aligned to this


class BaseStorage:
    mode = "base"

    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def put(self, path: str, filename: str, mime: str, caption: str = "",
                  progress: Optional[Callable[[int, int], None]] = None) -> dict: ...
    async def size(self, ref: dict) -> int: ...
    def iter_range(self, ref: dict, start: int, end: int) -> AsyncIterator[bytes]: ...
    async def get_bytes(self, ref: dict) -> bytes: ...
    async def delete(self, refs: list[dict]) -> None: ...
    async def load_db(self) -> Optional[bytes]: ...
    async def save_db(self, data: bytes) -> None: ...
    def status(self) -> dict: return {"mode": self.mode}


# ---------------------------------------------------------------- local (dev)
class LocalStorage(BaseStorage):
    mode = "local"

    def __init__(self, root: str):
        self.root = Path(root)
        (self.root / "files").mkdir(parents=True, exist_ok=True)

    def _p(self, ref: dict) -> Path:
        name = os.path.basename(ref["local"])  # no path traversal
        return self.root / "files" / name

    async def put(self, path, filename, mime, caption="", progress=None):
        ext = Path(filename).suffix.lower()[:8]
        name = f"{uuid.uuid4().hex}{ext}"
        dst = self.root / "files" / name
        total = os.path.getsize(path)

        def copy():
            done = 0
            with open(path, "rb") as s, open(dst, "wb") as d:
                while True:
                    b = s.read(CHUNK)
                    if not b:
                        break
                    d.write(b)
                    done += len(b)
                    if progress:
                        progress(done, total)

        await asyncio.to_thread(copy)
        return {"local": name}

    async def size(self, ref):
        return self._p(ref).stat().st_size

    async def iter_range(self, ref, start, end):
        p = self._p(ref)
        remaining = end - start + 1
        with open(p, "rb") as f:
            f.seek(start)
            while remaining > 0:
                b = await asyncio.to_thread(f.read, min(CHUNK, remaining))
                if not b:
                    break
                remaining -= len(b)
                yield b

    async def get_bytes(self, ref):
        return await asyncio.to_thread(self._p(ref).read_bytes)

    async def delete(self, refs):
        for r in refs:
            try:
                self._p(r).unlink()
            except FileNotFoundError:
                pass

    async def load_db(self):
        p = self.root / DB_FILENAME
        return p.read_bytes() if p.exists() else None

    async def save_db(self, data):
        p = self.root / DB_FILENAME
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)

    def status(self):
        return {"mode": self.mode, "connected": True, "path": str(self.root)}


# ---------------------------------------------------------------- telegram
class TelegramStorage(BaseStorage):
    """Uses Telegram's MTProto API (Telethon) logged in as a bot, so files up to 2 GB work
    (the HTTP Bot API is limited to 20 MB downloads / 50 MB uploads)."""
    mode = "telegram"

    def __init__(self, api_id: int, api_hash: str, bot_token: str, channel_id: int):
        from telethon import TelegramClient
        from telethon.sessions import StringSession
        self.client = TelegramClient(StringSession(), api_id, api_hash,
                                     connection_retries=None, retry_delay=2, auto_reconnect=True)
        self.bot_token = bot_token
        self.channel_id = channel_id
        self.entity = None
        self.db_msg_id: Optional[int] = None
        self._msgs: dict[int, tuple[object, float]] = {}
        self.channel_title = None

    async def start(self):
        from telethon.tl.types import PeerChannel
        from telethon import utils
        await self.client.start(bot_token=self.bot_token)
        real_id, peer_type = utils.resolve_id(self.channel_id)
        self.entity = await self.client.get_input_entity(PeerChannel(real_id))
        ent = await self.client.get_entity(self.entity)
        self.channel_title = getattr(ent, "title", None)
        log.info("Connected to Telegram channel %r", self.channel_title)

    async def stop(self):
        await self.client.disconnect()

    async def _msg(self, msg_id: int, fresh: bool = False):
        hit = self._msgs.get(msg_id)
        if hit and not fresh and time.time() - hit[1] < 3600:
            return hit[0]
        m = await self.client.get_messages(self.entity, ids=msg_id)
        if m is None or not m.media:
            raise FileNotFoundError(f"Telegram message {msg_id} not found")
        self._msgs[msg_id] = (m, time.time())
        if len(self._msgs) > 500:
            self._msgs.pop(next(iter(self._msgs)))
        return m

    async def put(self, path, filename, mime, caption="", progress=None):
        from telethon.tl.types import DocumentAttributeFilename
        m = await self.client.send_file(
            self.entity, path, caption=caption[:1000], force_document=True,
            attributes=[DocumentAttributeFilename(filename)],
            progress_callback=(lambda s, t: progress(s, t)) if progress else None,
        )
        self._msgs[m.id] = (m, time.time())
        return {"msg_id": m.id}

    async def size(self, ref):
        m = await self._msg(ref["msg_id"])
        return m.file.size

    async def iter_range(self, ref, start, end):
        from telethon.errors import FileReferenceExpiredError
        remaining = end - start + 1
        pos = start
        retried = False
        while remaining > 0:
            m = await self._msg(ref["msg_id"], fresh=retried)
            aligned = pos - (pos % CHUNK)
            skip = pos - aligned
            it = self.client.iter_download(m.media, offset=aligned, request_size=CHUNK, file_size=m.file.size)
            try:
                async for chunk in it:
                    chunk = bytes(chunk)
                    if skip:
                        chunk, skip = chunk[skip:], 0
                    if len(chunk) > remaining:
                        chunk = chunk[:remaining]
                    if not chunk:
                        continue
                    remaining -= len(chunk)
                    pos += len(chunk)
                    yield chunk
                    if remaining <= 0:
                        break
                else:
                    break  # file ended
            except FileReferenceExpiredError:
                if retried:
                    raise
                retried = True  # refetch the message (new file_reference) and resume at `pos`
                continue
            finally:
                close = getattr(it, "close", None)
                if close:
                    try:
                        await close()
                    except Exception:
                        pass

    async def get_bytes(self, ref):
        m = await self._msg(ref["msg_id"])
        return await self.client.download_media(m, file=bytes)

    async def delete(self, refs):
        ids = [r["msg_id"] for r in refs if r and r.get("msg_id")]
        if ids:
            await self.client.delete_messages(self.entity, ids)
            for i in ids:
                self._msgs.pop(i, None)

    async def load_db(self):
        """The DB is a JSON document pinned in the channel. Find it via the channel's pinned message."""
        from telethon.tl.functions.channels import GetFullChannelRequest
        full = await self.client(GetFullChannelRequest(self.entity))
        pid = getattr(full.full_chat, "pinned_msg_id", None)
        if not pid:
            log.warning("No pinned DB message found in channel — starting with an empty database")
            return None
        m = await self.client.get_messages(self.entity, ids=pid)
        if not m or not m.file or (m.file.name or "") != DB_FILENAME:
            log.warning("Pinned message %s is not %s — starting with an empty database", pid, DB_FILENAME)
            return None
        self.db_msg_id = m.id
        return await self.client.download_media(m, file=bytes)

    async def save_db(self, data):
        bio = io.BytesIO(data)
        bio.name = DB_FILENAME
        if self.db_msg_id:
            try:
                await self.client.edit_message(self.entity, self.db_msg_id, DB_CAPTION, file=bio, force_document=True)
                return
            except Exception as e:  # message deleted / not editable -> post a new one
                log.warning("Editing DB message failed (%s); posting a new one", e)
                bio.seek(0)
        m = await self.client.send_file(self.entity, bio, caption=DB_CAPTION, force_document=True, silent=True)
        old = self.db_msg_id
        self.db_msg_id = m.id
        svc = await self.client.pin_message(self.entity, m, notify=False)
        try:  # remove the "pinned a message" service message to keep the channel tidy
            if svc is not None and getattr(svc, "id", None):
                await self.client.delete_messages(self.entity, [svc.id])
        except Exception:
            pass
        if old and old != m.id:
            try:
                await self.client.delete_messages(self.entity, [old])
            except Exception:
                pass

    def status(self):
        return {"mode": self.mode, "connected": self.client.is_connected(),
                "channel": self.channel_title, "db_message_id": self.db_msg_id}
