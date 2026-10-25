# TeraPlayz — video site (static front-end)

Purple, mobile-first video site with dark mode. Every video is free to watch (supported by Monetag ads);
Premium members (100 Telegram Stars / month) join a private Telegram group for HD and ad-free viewing.
Plain HTML/CSS/JS, no build step.

```
index.html    page shell (header, footer, mobile nav)
styles.css    all styling (light + dark theme)
app.js        router, video grid, hover previews, watch page, ad slots, premium page
config.js     ← the ONLY file you normally edit (videos, Telegram link, Monetag slots)
sw.js         placeholder — replace with the sw.js Monetag gives you
assets/       mascot art, favicon, video thumbnails
render.yaml   Render Blueprint (static site)
```

Run locally: `python3 -m http.server 8000` in this folder, then open http://localhost:8000

## Add a daily video
1. Upload your video files (normal + HD) to a host that serves MP4/WebM over HTTPS
   (Cloudflare R2, Bunny.net, Backblaze B2, S3, etc.). Use H.264 MP4 or VP9 WebM.
2. Put a thumbnail (16:9 JPG, ~640px wide) in `assets/thumbs/`.
3. Add an entry at the **top** of `videos` in `config.js`:
   ```js
   {
     id: "my-video-2026-10-26",          // unique, used in the URL
     title: "My new video",
     description: "Short description",
     category: "Comedy",                 // new categories appear automatically as filter chips
     date: "2026-10-26",                 // newest date gets the "NEW TODAY" badge
     duration: "8:12",
     thumbnail: "assets/thumbs/my-video.jpg",
     previewUrl: "https://cdn.example.com/my-video-preview.mp4", // hover teaser on cards (can be the same as fullUrl)
     fullUrl:    "https://cdn.example.com/my-video-720p.mp4",
     hdUrl:      "https://cdn.example.com/my-video-1080p.mp4",
   },
   ```
4. Commit and push. Render redeploys automatically.

Tip: a small 30-second clip makes the hover teaser load faster:
`ffmpeg -i full.mp4 -t 30 -c copy preview.mp4`

## Change the Telegram Premium link / price
In `config.js`:
```js
telegramPremiumLink: "https://t.me/YOUR_PREMIUM_GROUP",  // your private group invite / subscription link
telegramChannelLink: "https://t.me/YOUR_PUBLIC_CHANNEL", // footer link (optional)
premiumPriceStars: 100,
```
In Telegram you can create a **subscription invite link** for a channel or group priced in Stars
(Manage → Invite links → Create link → "Charge subscription fee"). Paste that link here.

## Monetag ads
Free visitors watch every video in standard quality, with Monetag ads on the page. There is no ad gate.

1. Sign up at https://monetag.com and add your site (e.g. `https://teraplayz.onrender.com`).
2. **Verification / main script:** open `index.html` and find the `MONETAG` comment in `<head>`.
   Paste the verification `<meta>` tag and the main/MultiTag `<script>` Monetag gives you there.
3. **sw.js (push ads):** Monetag's push-notification formats usually need a `sw.js` file in the **site root**.
   This repo has a placeholder `sw.js` that does nothing. Replace it with the one Monetag gives you (same name, same place).
4. **Banner / in-page zones:** in `config.js` → `monetag.zones`, paste each zone's code as a string:
   - `belowHero` (home page, under the hero)
   - `betweenGrid` (inside the video grid, after the first row)
   - `belowPlayer` (watch page, under the player)

   There is also a static slot above the footer in `index.html` (`<!-- paste Monetag zone code here -->`).
   Set `monetag.enabled: false` to hide all slots.
5. Commit and push, and Render redeploys. Empty slots show a faint "Ad space" box until you paste code.

## Premium & what a backend would add
- Premium is handled entirely by Telegram: the 100 Stars/month payment and group access happen inside Telegram,
  and HD files are shared in the Premium group. The site's HD button and Premium CTAs link to that group.
- The site can't tell who is Premium, so it can't hide ads or serve HD on the website for members.
  To do that you'd need a Telegram bot + small backend (Telegram Login, check the Stars subscription via the
  Bot API, then set a session that turns off ad slots and enables HD URLs).
- Video URLs in `config.js` are public. Use signed URLs from your video host if you need to protect files.

## Deploy on Render (free Static Site)
No build step. The publish directory is the repo root.

1. **Push to GitHub**
   ```bash
   cd videosite
   git init && git add . && git commit -m "TeraPlayz site"
   git branch -M main
   git remote add origin https://github.com/<you>/teraplayz.git
   git push -u origin main
   ```
2. Go to https://dashboard.render.com and click **New → Static Site**.
3. Connect your GitHub account and pick the `teraplayz` repo.
4. Settings:
   - **Name:** `teraplayz`
   - **Branch:** `main`
   - **Root Directory:** *(leave blank)*
   - **Build Command:** *(leave blank)* (or `echo "no build"` if the field is required)
   - **Publish Directory:** `.`
5. Click **Create Static Site**. Your site goes live at `https://teraplayz.onrender.com` in about a minute.
6. Each daily `git push` (for example a new entry in `config.js`) redeploys automatically.
7. Optional: **Settings → Custom Domains** to add your own domain (HTTPS is free).

**Or use the Blueprint:** this repo includes `render.yaml`. In Render choose **New → Blueprint**, pick the repo,
and it creates the static site with the same settings plus cache/security headers.

Pages use hash URLs (`/#/premium`, `/#/watch/<id>`), so no rewrite rules are needed.

## Credits
Sample films: Blender Foundation open movies (CC BY), streamed from Wikimedia Commons.
Mascot art is original and generated for TeraPlayz.
