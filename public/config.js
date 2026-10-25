/* =========================================================
   TeraPlayz — SITE CONFIG
   Everything you normally need to change lives in this file.
   ========================================================= */
window.SITE_CONFIG = {
  siteName: "TeraPlayz",
  tagline: "Fresh videos every day ✨",

  // ---- Premium (Telegram Stars) ----
  telegramPremiumLink: "https://t.me/+6SRYKVBk-4tiOGJl", // <-- change to your private group / invite link
  telegramChannelLink: "https://t.me/content_provider_premium", // optional public channel shown in the footer
  premiumPriceStars: 100,
  premiumPeriod: "month",

  // Hover preview length on video cards (teaser only — full videos are always free to watch)
  previewSeconds: 30,

  // ---- Monetag ads ----
  // 1) Put Monetag's site-verification meta tag + main script in index.html <head> (see the MONETAG comment there).
  // 2) For in-page banner zones, paste each zone's code below (as a string) or set enabled:false to hide all slots.
  monetag: {
    enabled: false,          // false = hide all ad slot containers
    zones: {
      belowHero: "",        // paste Monetag zone code here (home page, under the hero)
      betweenGrid: "",      // paste Monetag zone code here (inside the video grid, after the first row)
      belowPlayer: "",      // paste Monetag zone code here (watch page, under the video player)
    },
  },

  // ---- Videos ----
  // Videos are no longer listed here: upload them in the admin panel at /admin.
  // The site loads them from the backend (/api/videos); files are stored in your private Telegram channel.
};
