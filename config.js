/* =========================================================
   TeraPlayz — SITE CONFIG
   Everything you normally need to change lives in this file.
   ========================================================= */
const W = "https://upload.wikimedia.org/wikipedia/commons/transcoded";

window.SITE_CONFIG = {
  siteName: "TeraPlayz",
  tagline: "Fresh videos every day ✨",

  // ---- Premium (Telegram Stars) ----
  telegramPremiumLink: "https://t.me/YOUR_PREMIUM_GROUP", // <-- change to your private group / invite link
  telegramChannelLink: "https://t.me/YOUR_PUBLIC_CHANNEL", // optional public channel shown in the footer
  premiumPriceStars: 100,
  premiumPeriod: "month",

  // ---- Ads ----
  previewSeconds: 30,        // free preview length
  adsToUnlock: 3,            // ads a visitor must watch to unlock a full video
  adSeconds: 5,              // length of each placeholder ad (real ads control their own length)
  // Optional: a sample video to play inside each ad placeholder. Leave "" for an animated placeholder.
  adPlaceholderVideo: "",

  // ---- Videos ----
  // Add the newest video at the TOP of this list. Fields:
  // id (unique, url-safe), title, description, category, date (YYYY-MM-DD), duration (label),
  // thumbnail, previewUrl (can be the full file — playback is cut at previewSeconds),
  // fullUrl (normal quality), hdUrl (premium / high quality)
  videos: [
    {
      id: "spring",
      title: "Spring — Spirit of the Mountain",
      description: "A shepherd girl and her dog face ancient spirits to bring back the spring. Blender open movie (CC BY).",
      category: "Fantasy",
      date: "2026-10-25",
      duration: "7:44",
      thumbnail: "assets/thumbs/spring.jpg",
      previewUrl: `${W}/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.480p.vp9.webm`,
      fullUrl:    `${W}/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.480p.vp9.webm`,
      hdUrl:      `${W}/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.1080p.vp9.webm`,
    },
    {
      id: "sintel",
      title: "Sintel — The Dragon Quest",
      description: "A lonely young woman searches for her baby dragon across a dangerous world. Blender open movie (CC BY).",
      category: "Action",
      date: "2026-10-24",
      duration: "14:48",
      thumbnail: "assets/thumbs/sintel.jpg",
      previewUrl: `${W}/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm`,
      fullUrl:    `${W}/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm`,
      hdUrl:      `${W}/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.1080p.vp9.webm`,
    },
    {
      id: "tears-of-steel",
      title: "Tears of Steel",
      description: "Sci-fi warriors try to save the world from robots in futuristic Amsterdam. Blender open movie (CC BY).",
      category: "Sci-Fi",
      date: "2026-10-23",
      duration: "12:14",
      thumbnail: "assets/thumbs/tears.jpg",
      previewUrl: `${W}/c/cb/Tears_of_Steel_1080p.webm/Tears_of_Steel_1080p.webm.480p.vp9.webm`,
      fullUrl:    `${W}/c/cb/Tears_of_Steel_1080p.webm/Tears_of_Steel_1080p.webm.480p.vp9.webm`,
      hdUrl:      `${W}/c/cb/Tears_of_Steel_1080p.webm/Tears_of_Steel_1080p.webm.1080p.vp9.webm`,
    },
    {
      id: "big-buck-bunny",
      title: "Big Buck Bunny",
      description: "A giant gentle rabbit gets payback on three pesky rodents. Blender open movie (CC BY).",
      category: "Comedy",
      date: "2026-10-22",
      duration: "10:34",
      thumbnail: "assets/thumbs/bbb.jpg",
      previewUrl: `${W}/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm`,
      fullUrl:    `${W}/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm`,
      hdUrl:      `${W}/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.1080p.vp9.webm`,
    },
    {
      id: "cosmos-laundromat",
      title: "Cosmos Laundromat",
      description: "A suicidal sheep meets a mysterious salesman who offers him the gift of a lifetime. Blender open movie (CC BY).",
      category: "Sci-Fi",
      date: "2026-10-21",
      duration: "12:10",
      thumbnail: "assets/thumbs/cosmos.jpg",
      previewUrl: `${W}/3/36/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm.480p.vp9.webm`,
      fullUrl:    `${W}/3/36/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm.480p.vp9.webm`,
      hdUrl:      `${W}/3/36/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm.1080p.vp9.webm`,
    },
    {
      id: "llama-drama",
      title: "Caminandes: Llama Drama",
      description: "Koro the llama really wants to cross the road. Blender short (CC BY).",
      category: "Comedy",
      date: "2026-10-20",
      duration: "1:30",
      thumbnail: "assets/thumbs/llama.jpg",
      previewUrl: `${W}/d/d0/Caminandes-_Llama_Drama_-_Short_Movie.ogv/Caminandes-_Llama_Drama_-_Short_Movie.ogv.480p.vp9.webm`,
      fullUrl:    `${W}/d/d0/Caminandes-_Llama_Drama_-_Short_Movie.ogv/Caminandes-_Llama_Drama_-_Short_Movie.ogv.480p.vp9.webm`,
      hdUrl:      `${W}/d/d0/Caminandes-_Llama_Drama_-_Short_Movie.ogv/Caminandes-_Llama_Drama_-_Short_Movie.ogv.1080p.vp9.webm`,
    },
  ],
};
