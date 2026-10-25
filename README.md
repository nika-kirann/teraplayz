# TeraPlayz — video site + admin panel (Telegram storage)

Purple, mobile-first video site with dark mode. Every video is free to watch (with Monetag ads).
Premium members (100 Telegram Stars / month) join a private Telegram group for HD and ad-free viewing.

You upload videos in the **admin panel at `/admin`**. The files, thumbnails **and** the site's
database are stored in **your private Telegram channel**, so there's no external database or file host.

```
public/              front-end (served by the backend)
  index.html         site shell · Monetag <head> slot
  styles.css         theme (light + dark)
  app.js             router, grid, hover teasers, watch page, premium page, ad slots
  config.js          ← site name, Telegram Premium link, price, Monetag zones
  sw.js              placeholder — replace with Monetag's sw.js
  admin/             admin panel (index.html, admin.js, admin.css)
  assets/            mascot art, favicon
server/
  main.py            FastAPI app: public API, streaming, admin API, auth, analytics, JSON DB
  storage.py         TelegramStorage (MTProto via Telethon) + LocalStorage (dev mock)
requirements.txt     Python deps
render.yaml          Render Blueprint (free Web Service)
.env.example         every environment variable, with fake example values
run_local.sh         run locally in mock mode (no Telegram needed)
```

## How it works

| Part | What it does |
|---|---|
| **Backend** | Python **FastAPI + uvicorn**. Serves `public/`, the JSON API and `/stream/<id>`. |
| **Telegram client** | **Telethon** (Telegram's MTProto API) logged in **as your bot** (bot token + API_ID/API_HASH). Unlike the HTTP Bot API (20 MB download limit), MTProto lets a bot upload/download files up to **2 GB**. |
| **Upload** | Admin picks a file → browser uploads it to the server (progress bar step 1) → server posts it to the private channel as a document (step 2). The optional thumbnail is posted too. |
| **Streaming** | `/stream/<id>` reads the file from Telegram in 1 MB chunks and supports HTTP **Range** requests (`206 Partial Content`), so the player can seek anywhere without downloading the whole file. |
| **Thumbnails** | `/thumb/<id>` serves the thumbnail from Telegram, cached in memory. The admin panel auto-creates one from a frame of the video (or you pick a frame / upload an image). |
| **Database** | One JSON document, `teraplayz-db.json`, **pinned in the channel**. See below. |
| **Analytics** | Daily page views, daily unique visitors and per-video views are stored in the same JSON document. |

### The Telegram "database" (pinned JSON)
- All metadata (titles, descriptions, featured flag, dates, Telegram message ids of each file
  and thumbnail) and analytics live in one JSON file posted in the channel with the caption `#teraplayz_db`,
  and **pinned**.
- **On startup** the server reads the channel's pinned message, downloads the JSON and keeps it **in memory**.
  The public site reads from memory, so it's fast and makes no Telegram calls for listings.
- **On change** (upload, edit, delete, featured), the server saves within about 2 seconds by **editing the pinned
  message's file** (the same message id). If that fails, for example because the message was deleted, it posts a new
  JSON file, pins it silently and removes the old one.
- **Analytics** (page views, visitors, video views) are counted in memory and **flushed every 5 minutes**, and on
  shutdown (Render sends SIGTERM before it sleeps or redeploys). A crash can lose up to 5 minutes of counts. Videos
  and metadata are never in that buffer.
- Only hashed visitor ids for **today** are kept (to count unique visitors). Older days keep only totals, and
  daily stats are kept for 90 days.
- ⚠️ **Don't unpin or delete the `teraplayz-db.json` message** or the video messages in the channel.
  If you unpin it, re-pin it and restart the service.
- Run **one** instance/worker only (the free plan does this by default), because the DB is cached in memory.

## 1. Telegram setup (one time)
1. **Create a private channel.** In Telegram, go to *New Channel*, give it a name (e.g. "TeraPlayz Storage") and set it to **Private**.
   Nobody else needs to join it.
2. **Create a bot.** Open [@BotFather](https://t.me/BotFather), send `/newbot` and follow the steps. Copy the **bot token**
   (looks like `1234567890:AA...`). That's `TG_BOT_TOKEN`.
3. **Make the bot a channel admin.** In the channel, go to *Settings → Administrators → Add Admin*, search for your bot's
   @username and add it with **Post messages**, **Edit messages of others** and **Delete messages of others**
   turned on. Editing also covers pinning in channels.
4. **Get API_ID and API_HASH.** Log in at <https://my.telegram.org> → *API development tools* → create an app
   (any name and platform). Copy **App api_id** (`TG_API_ID`) and **App api_hash** (`TG_API_HASH`).
   These belong to your Telegram account, but the server only ever logs in **as the bot**.
5. **Find the channel id** (`TG_CHANNEL_ID`, a negative number starting with `-100`):
   - Easiest: open <https://web.telegram.org/a/>, click your channel and look at the URL. It ends with `#-100…`.
     That full number including `-100` is the id.
   - Or forward any post from the channel to a bot like [@JsonDumpBot](https://t.me/JsonDumpBot) and read
     `forward_from_chat.id`.
6. Nothing else is needed. The server creates and pins `teraplayz-db.json` itself the first time it saves
   (your first upload).

## 2. Deploy on Render (free Web Service)
1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to <https://dashboard.render.com>, click **New → Blueprint** and pick the `teraplayz` repo. Render reads `render.yaml`.
3. Render asks for the secret values. Fill in:
   - `TG_API_ID`, `TG_API_HASH`, `TG_BOT_TOKEN`, `TG_CHANNEL_ID` (from step 1)
   - `ADMIN_PASSWORD`: choose a long password for `/admin`
   - `PREMIUM_TELEGRAM_LINK`: your premium group invite link, e.g. `https://t.me/+abc123`
   - `SESSION_SECRET`: generated automatically, nothing to do
4. Click **Apply**. The build runs `pip install -r requirements.txt` and starts
   `uvicorn server.main:app --host 0.0.0.0 --port $PORT`.
5. Open `https://<your-service>.onrender.com`. The admin panel is at `https://<your-service>.onrender.com/admin`.

*Manual alternative:* **New → Web Service**, runtime **Python 3**, build `pip install -r requirements.txt`,
start `uvicorn server.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`,
instance type **Free**. Add the 6 environment variables in **Environment**, plus `PYTHON_VERSION=3.12.7`.

Each `git push` to `main` redeploys automatically. Your videos and database are safe in Telegram across redeploys.

## 3. Using the admin panel
- Go to `/admin` and log in with `ADMIN_PASSWORD`. The session lasts 7 days.
  After 5 wrong passwords from the same IP, login is locked for 15 minutes.
- **Upload**
  1. Choose or drag a video (MP4 H.264 or WebM recommended, up to 2 GB).
  2. Fill in the title, date and description, and optionally tick ⭐ *featured*.
  3. A thumbnail is auto-generated. You can scrub the preview and press *Use current frame*, or upload an image instead.
  4. Press **Upload**. The bar shows step 1 (your browser to the server) and step 2 (the server to Telegram).
     Keep the tab open until it says Done.
- **Videos:** search, ⭐ feature or unfeature, ✏️ edit details, ▶ view on the site, and 🗑 delete. Deleting also removes the
  files from the channel.
- **Dashboard:** totals, a daily traffic chart (7 or 30 days), top videos, views per video and server status.
- Featured videos are shown first on the site with a ⭐ badge. The rest are sorted newest first.

## Site settings (`public/config.js`)
```js
siteName: "TeraPlayz",
telegramPremiumLink: "https://t.me/YOUR_PREMIUM_GROUP",  // your private Premium group / subscription invite link
telegramChannelLink: "https://t.me/YOUR_PUBLIC_CHANNEL", // footer link (optional)
premiumPriceStars: 100,
monetag: { enabled: true, zones: { belowHero: "", betweenGrid: "", belowPlayer: "" } },
```
Videos are **not** listed here any more. They come from `/api/videos`.
In Telegram you can create a **subscription invite link** priced in Stars for the Premium group
(Manage → Invite links → Create link → "Charge subscription fee").

## Monetag ads
1. Sign up at <https://monetag.com> and add your site.
2. Paste the verification `<meta>` tag and the main/MultiTag `<script>` into `public/index.html`, at the `MONETAG` comment in `<head>`.
3. Push ads: replace `public/sw.js` with the `sw.js` Monetag gives you. It's served at `/sw.js`.
4. Banner zones: paste each zone's code as a string in `public/config.js` → `monetag.zones`:
   `belowHero`, `betweenGrid` and `belowPlayer`. There is also a static slot above the footer in `index.html`.
   Set `monetag.enabled: false` to hide all slots.

## Environment variables
| Variable | Required | What |
|---|---|---|
| `TG_API_ID` | yes | api_id from my.telegram.org |
| `TG_API_HASH` | yes | api_hash from my.telegram.org |
| `TG_BOT_TOKEN` | yes | bot token from @BotFather (bot must be channel admin) |
| `TG_CHANNEL_ID` | yes | private channel id, `-100…` |
| `ADMIN_PASSWORD` | yes | password for `/admin` |
| `PREMIUM_TELEGRAM_LINK` | no | invite link to your premium Telegram group (overrides config.js) |
| `PUBLIC_TELEGRAM_LINK` | no | public Telegram channel link shown in the footer |
| `SESSION_SECRET` | yes | random string that signs the admin cookie (Render generates it) |
| `STORAGE` | no | `telegram` (default) or `local` for development |
| `LOCAL_DATA_DIR` | no | folder for `STORAGE=local` (default `./data`) |

Never commit real values. `.env` is git-ignored, and `.env.example` shows the format.

## Run locally (mock mode, no Telegram)
```bash
./run_local.sh            # creates .venv, installs deps, runs on http://localhost:8000
# admin: http://localhost:8000/admin   password: admin123  (override: ADMIN_PASSWORD=... ./run_local.sh)
```
`STORAGE=local` keeps files and `db.json` in `./data/` (git-ignored) using the exact same API, so you can test
uploads, editing, stats and seeking without Telegram. To run against real Telegram locally, put your values in the
environment (see `.env.example`) and run `uvicorn server.main:app --port 8000`.

## Limits & things to know
- **Render free tier sleeps** after about 15 minutes without traffic. The next visitor waits about 30–60 seconds while it wakes,
  reconnects to Telegram and reloads the DB. Free instances also have 512 MB RAM and a monthly hours cap.
  A paid instance (Starter) stays awake.
- **Streaming speed depends on Telegram.** Video bytes flow Telegram → your Render server → viewer, so every view uses
  server bandwidth. Expect roughly a few MB/s per stream. Seeking starts a new chunked download, so there can be
  a short delay after each jump. Telegram may throttle very heavy traffic (FloodWait). For a big audience, a CDN or video host
  is faster.
- **Uploads** go through the server's temporary disk first, so keep the tab open. Max 2 GB per file (Telegram limit).
  Very large uploads on the free tier can be slow.
- **Analytics** are simple counts. IPs are not stored; only a salted hash of today's visitor ids is kept. A crash can lose up to 5 minutes of counts.
- Premium membership is handled entirely inside Telegram (Stars subscription on the group). The website does not check who is Premium.

## Credits
Mascot art is original and generated for TeraPlayz.
