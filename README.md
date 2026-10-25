# TeraPlayz — video site (static front-end)

Purple, mobile-first video site with dark mode, 30-second previews, a "watch 3 ads to unlock" flow,
and a Premium plan (100 Telegram Stars / month) that links to a private Telegram group.
Plain HTML/CSS/JS, no build step.

```
index.html    page shell (header, footer, mobile nav)
styles.css    all styling (light + dark theme)
app.js        router, video grid, preview cap, ad flow, premium page
config.js     ← the ONLY file you normally edit (videos, Telegram link, ad settings)
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
     previewUrl: "https://cdn.example.com/my-video-preview.mp4", // can be the full file; playback stops at 30s
     fullUrl:    "https://cdn.example.com/my-video-720p.mp4",
     hdUrl:      "https://cdn.example.com/my-video-1080p.mp4",
   },
   ```
4. Commit and push. Render redeploys automatically.

Tip: for real protection, make `previewUrl` a separate 30-second clip
(`ffmpeg -i full.mp4 -t 30 -c copy preview.mp4`) so the full file isn't exposed in the free preview.

## Change the Telegram Premium link / price
In `config.js`:
```js
telegramPremiumLink: "https://t.me/YOUR_PREMIUM_GROUP",  // your private group invite / subscription link
telegramChannelLink: "https://t.me/YOUR_PUBLIC_CHANNEL", // footer link (optional)
premiumPriceStars: 100,
```
In Telegram you can create a **subscription invite link** for a channel or group priced in Stars
(Manage → Invite links → Create link → "Charge subscription fee"). Paste that link here.

## Connect real ads
Ad settings are in `config.js` (`adsToUnlock`, `adSeconds`, `adPlaceholderVideo`).
The site currently shows clearly-marked **AD PLACEHOLDER** slots with a countdown.
To use a real network, define `window.TeraPlayzAds.showAd(n, total, containerEl)` in a script loaded
before `app.js`. It must return a Promise that resolves when ad `n` finishes:
```html
<script src="//imasdk.googleapis.com/js/sdkloader/ima3.js"></script>
<script>
  window.TeraPlayzAds = {
    showAd(n, total, el) {
      return new Promise((resolve) => {
        // Request a VAST ad with Google IMA (or your network's SDK) into `el`,
        // and call resolve() on ALL_ADS_COMPLETED / SKIPPED / AD_ERROR.
      });
    },
  };
</script>
```
Video ad networks to look at: Google Ad Manager / IMA (VAST), Adsterra, PropellerAds, ExoClick.
Check each network's content policy for your videos.

## Important: what needs a backend
This is a front-end prototype. Everything runs in the browser, so:
- The "unlocked" state is saved in `localStorage`, per device. A user can clear it or bypass it with dev tools,
  and the full video URL is visible in the page source.
- Real ad-gating needs a server that checks ad completion and then gives out a short-lived signed video URL
  (e.g. Cloudflare/Bunny/S3 signed URLs).
- Premium is handled by Telegram: the Stars payment and group access happen inside Telegram. HD files are meant
  to be posted in the premium group. If you want Premium members to watch HD ad-free **on the website**, you need
  a Telegram bot + backend (Telegram Login, check active Stars subscription via the Bot API, issue a session).

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
