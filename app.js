/* ============ TeraPlayz app (vanilla JS, hash router) ============ */
(function () {
  const C = window.SITE_CONFIG;
  const PREVIEW = C.previewSeconds;
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const videos = [...C.videos].sort((a, b) => b.date.localeCompare(a.date));
  const newestDate = videos[0] && videos[0].date;
  let cleanup = []; // functions to run when leaving a page
  const state = { cat: "All", q: "" };

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- theme ---------- */
  const themeBtn = $("#themeToggle");
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tp_theme", next);
    toast(next === "dark" ? "🌙 Dark mode on" : "☀️ Light mode on");
  });

  /* ---------- helpers ---------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const categories = ["All", ...new Set(videos.map((v) => v.category))];
  const tgLink = () => esc(C.telegramPremiumLink);
  const playIcon = '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

  if (!(C.monetag && C.monetag.enabled)) { const f = $("#adFooter"); if (f) f.remove(); }
  $("#year").textContent = new Date().getFullYear();
  $("#footerTelegram").href = C.telegramChannelLink || C.telegramPremiumLink;

  /* ---------- views ---------- */
  function cardHTML(v) {
    return `<article class="card" data-id="${esc(v.id)}">
      <a href="#/watch/${encodeURIComponent(v.id)}" class="thumb" aria-label="Watch ${esc(v.title)}">
        <img src="${esc(v.thumbnail)}" alt="" loading="lazy" />
        <video muted playsinline preload="none"></video>
        <span class="play">${playIcon}</span>
        ${v.date === newestDate ? '<span class="badge new">NEW TODAY</span>' : ""}
        
        <span class="badge dur">${esc(v.duration)}</span>
        <span class="preview-bar"></span>
      </a>
      <div class="card-body">
        <h3><a href="#/watch/${encodeURIComponent(v.id)}">${esc(v.title)}</a></h3>
        <div class="meta"><span class="tag">${esc(v.category)}</span><span>${fmtDate(v.date)}</span></div>
      </div>
    </article>`;
  }

  function gridSection(title, sub) {
    return `<section class="section container" id="videos">
      <div class="section-head"><div><h2>${title}</h2><div class="muted">${sub}</div></div></div>
      <div class="filters">
        <div class="chips" role="tablist">${categories.map((c) => `<button class="chip ${c === state.cat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <label class="search"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>
          <input id="search" type="search" placeholder="Search videos…" value="${esc(state.q)}" aria-label="Search videos" /></label>
      </div>
      <div class="grid" id="grid"></div>
    </section>`;
  }

  function renderGrid() {
    const g = $("#grid"); if (!g) return;
    const q = state.q.trim().toLowerCase();
    const list = videos.filter((v) => (state.cat === "All" || v.category === state.cat) &&
      (!q || (v.title + " " + v.description + " " + v.category).toLowerCase().includes(q)));
    const cards = list.map(cardHTML);
    const mid = C.monetag && C.monetag.enabled && list.length > 4 ? `<div class="grid-ad">${adSlot("betweenGrid").replace("ad-slot container", "ad-slot")}</div>` : "";
    if (mid) cards.splice(4, 0, mid);
    g.innerHTML = list.length ? cards.join("") :
      `<div class="empty fade-in"><img src="assets/mascot-empty.jpg" alt="Mascot searching with a magnifying glass" />
        <h3>Nothing here… yet!</h3><p class="muted">No videos match “${esc(state.q || state.cat)}”. New videos drop every day — try another search.</p>
        <button class="btn btn-ghost" id="resetFilters">Show all videos</button></div>`;
    const r = $("#resetFilters"); if (r) r.onclick = () => { state.q = ""; state.cat = "All"; $("#search").value = ""; syncChips(); renderGrid(); };
    runAdScripts(g);
    bindPreviews(g);
  }
  function syncChips() { document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.cat === state.cat)); }

  function bindFilters() {
    document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { state.cat = c.dataset.cat; syncChips(); renderGrid(); }));
    const s = $("#search"); let t;
    s.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = s.value; renderGrid(); }, 150); });
    renderGrid();
  }

  // Hover-to-preview on cards (desktop). Playback is capped at PREVIEW seconds.
  function bindPreviews(root) {
    if (!matchMedia("(hover:hover)").matches) return;
    root.querySelectorAll(".card").forEach((card) => {
      const v = videos.find((x) => x.id === card.dataset.id);
      const vid = $("video", card), bar = $(".preview-bar", card);
      let timer;
      card.addEventListener("mouseenter", () => {
        timer = setTimeout(() => {
          if (!vid.src) vid.src = v.previewUrl + "#t=0," + PREVIEW;
          vid.currentTime = 0; vid.play().then(() => card.classList.add("previewing")).catch(() => {});
        }, 350);
      });
      card.addEventListener("mouseleave", () => { clearTimeout(timer); vid.pause(); card.classList.remove("previewing"); bar.style.width = 0; });
      vid.addEventListener("timeupdate", () => {
        bar.style.width = Math.min(100, (vid.currentTime / PREVIEW) * 100) + "%";
        if (vid.currentTime >= PREVIEW) { vid.currentTime = 0; } // loop the 30s preview
      });
    });
  }

  function viewHome() {
    app.innerHTML = `
      <section class="hero container fade-in">
        <div class="hero-grid">
          <div>
            <span class="pill"><span class="dot"></span> New video uploaded today</span>
            <h1>Welcome to <span class="grad-text">TeraPlayz</span> — fresh videos, every single day.</h1>
            <p class="lead">New videos drop every day — watch them free right here. Want them in HD with zero ads? Go Premium on Telegram for just ${C.premiumPriceStars} ⭐ a ${C.premiumPeriod}.</p>
            <div class="hero-ctas">
              <a href="#/videos" class="btn btn-primary btn-lg">${playIcon.replace('26" height="26','20" height="20')} Start watching</a>
              <a href="#/premium" class="btn btn-gold btn-lg">👑 Go Premium · ${C.premiumPriceStars} ⭐</a>
            </div>
            <div class="hero-stats">
              <div><b>${videos.length}+</b><span>videos</span></div>
              <div><b>Daily</b><span>new uploads</span></div>
              <div><b>HD</b><span>for Premium</span></div>
            </div>
          </div>
          <div class="mascot-wrap">
            <span class="bubble b1">Hi! I'm Tera~ 💜</span>
            <img src="assets/mascot-hero.jpg" alt="TeraPlayz mascot: a cheerful anime girl in a purple cat-ear hoodie holding a play button" />
            <span class="bubble b2">▶ New drop today!</span>
          </div>
        </div>
      </section>
      ${adSlot("belowHero")}
      ${gridSection("Latest videos", "Hover a card for a quick preview · tap to watch free")}
      <section class="container">${teaserHTML()}</section>`;
    runAdScripts(app);
    bindFilters();
  }

  function viewVideos() {
    app.innerHTML = gridSection("All videos", `${videos.length} videos · newest first`) + `<section class="container">${teaserHTML()}</section>`;
    bindFilters();
  }

  function teaserHTML() {
    return `<div class="teaser">
      <img src="assets/mascot-premium.jpg" alt="Premium mascot with a crown holding a golden star" />
      <div><h2>Go Premium on Telegram 👑</h2><p>All videos in high quality, no ads, ever. Just ${C.premiumPriceStars} Telegram Stars a ${C.premiumPeriod}.</p></div>
      <a href="#/premium" class="btn btn-gold btn-lg">See Premium</a>
    </div>`;
  }

  /* ---------- ad slots (Monetag) ---------- */
  // Renders an empty ad container. Paste your Monetag zone code into config.js (monetag.zones)
  // or directly inside the matching <div class="ad-slot"> in index.html templates.
  function adSlot(name) {
    const M = C.monetag || {};
    if (!M.enabled) return "";
    const code = (M.zones || {})[name] || "";
    return `<div class="ad-slot container" data-ad-slot="${esc(name)}"><span class="ad-slot-label">Advertisement</span>
      <div class="ad-slot-inner"><!-- paste Monetag zone code here (slot: ${esc(name)}) -->${code}</div></div>`;
  }
  function runAdScripts(root) {
    // Scripts inserted via innerHTML do not run; re-create them so Monetag zone snippets execute.
    root.querySelectorAll(".ad-slot script").forEach((old) => {
      const s = document.createElement("script");
      [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
      s.text = old.text; old.replaceWith(s);
    });
  }

  /* ---------- watch page ---------- */
  function viewWatch(id) {
    const v = videos.find((x) => x.id === id);
    if (!v) { app.innerHTML = `<section class="container section"><div class="empty"><img src="assets/mascot-empty.jpg" alt="" /><h3>Video not found</h3><a class="btn btn-primary" href="#/videos">Browse videos</a></div></section>`; return; }
    const others = videos.filter((x) => x.id !== id);
    app.innerHTML = `
      <section class="container watch fade-in">
        <div>
          <div class="player" id="player">
            <video id="vid" controls playsinline preload="metadata" poster="${esc(v.thumbnail)}" src="${esc(v.fullUrl)}"></video>
          </div>
          ${adSlot("belowPlayer").replace("ad-slot container", "ad-slot")}
          <div class="watch-info">
            <h1>${esc(v.title)}</h1>
            <div class="meta"><span class="tag">${esc(v.category)}</span><span>${fmtDate(v.date)}</span><span>· ${esc(v.duration)}</span></div>
            <div class="watch-actions" id="actions">
              <div class="quality" role="group" aria-label="Quality"><button class="on" data-q="sd">SD</button><button data-q="hd">HD 👑</button></div>
              <a class="btn btn-gold btn-sm" href="${tgLink()}" target="_blank" rel="noopener">👑 HD &amp; ad-free with Premium</a>
              <button class="btn btn-ghost btn-sm" id="shareBtn">🔗 Share</button>
            </div>
            <div class="info-box"><p style="margin:0">${esc(v.description)}</p></div>
          </div>
        </div>
        <aside>
          <div class="upnext"><h3>Up next</h3>
            ${others.map((o) => `<a class="mini-card" href="#/watch/${encodeURIComponent(o.id)}"><img src="${esc(o.thumbnail)}" alt="" loading="lazy"/><div><b>${esc(o.title)}</b><div class="meta"><span>${esc(o.category)}</span><span>${esc(o.duration)}</span></div></div></a>`).join("")}
          </div>
          <div class="side-premium"><img src="assets/mascot-premium.jpg" alt="" /><b>Go ad-free in HD</b><p class="muted small">Premium: ${C.premiumPriceStars} ⭐ / ${C.premiumPeriod} on Telegram</p><a href="${tgLink()}" target="_blank" rel="noopener" class="btn btn-gold btn-sm">Join Premium on Telegram</a></div>
        </aside>
      </section>`;
    runAdScripts(app);

    const player = $("#player"), vid = $("#vid");
    function removeOverlay() { player.querySelectorAll(".overlay").forEach((o) => o.remove()); }
    $('[data-q="hd"]').onclick = () => {
      // HD is a Premium perk: HD files are shared in the Premium Telegram group.
      vid.pause(); removeOverlay();
      const o = document.createElement("div"); o.className = "overlay";
      o.innerHTML = `<div><img class="mini" src="assets/mascot-premium.jpg" alt="" /><h3>HD is a Premium perk 👑</h3>
        <p>Join TeraPlayz Premium on Telegram for ${C.premiumPriceStars} ⭐ / ${C.premiumPeriod}: every video in high quality, ad-free.</p>
        <div class="btns"><a class="btn btn-gold" href="${tgLink()}" target="_blank" rel="noopener">Join Premium</a><button class="btn btn-ghost" data-act="close" style="color:var(--text)">Keep watching in SD</button></div></div>`;
      player.appendChild(o);
      $('[data-act="close"]', o).onclick = () => { removeOverlay(); vid.play().catch(() => {}); };
    };
    $("#shareBtn").onclick = async () => {
      const url = location.href;
      try { if (navigator.share) await navigator.share({ title: v.title, url }); else { await navigator.clipboard.writeText(url); toast("Link copied!"); } } catch {}
    };
    cleanup.push(() => { vid.pause(); vid.removeAttribute("src"); vid.load(); });
  }

  /* ---------- premium page ---------- */
  function viewPremium() {
    const S = C.premiumPriceStars;
    app.innerHTML = `
      <section class="container prem-hero fade-in">
        <div>
          <span class="pill">👑 TeraPlayz Premium</span>
          <h1>Every video. <span class="grad-text">HD. Zero ads.</span></h1>
          <p class="muted" style="font-size:1.1rem;max-width:34rem">Join the private TeraPlayz Premium group on Telegram for just <b class="star">${S} ⭐ Telegram Stars</b> a ${C.premiumPeriod}. Get every daily upload in high quality, with no ads at all.</p>
          <div class="hero-ctas"><a href="${tgLink()}" target="_blank" rel="noopener" class="btn btn-gold btn-lg" id="joinPremium">✈️ Join on Telegram</a><a href="#/videos" class="btn btn-ghost btn-lg">Browse free previews</a></div>
        </div>
        <div class="price-card">
          <span class="ribbon">Most loved 💜</span>
          <div class="head"><img src="assets/mascot-premium.jpg" alt="Premium mascot with a crown and a golden star" />
            <div><div class="muted small" style="font-weight:700">PREMIUM MONTHLY</div><div class="price"><span class="star">⭐</span>${S} <small>Stars / ${C.premiumPeriod}</small></div></div></div>
          <ul class="benefits">
            <li><i>✓</i><span><b>All videos in HD</b> — high-quality files for every upload</span></li>
            <li><i>✓</i><span><b>100% ad-free</b> — no banners, no pop-ups, no ad breaks</span></li>
            <li><i>✓</i><span><b>Daily drops first</b> — new videos posted in the group</span></li>
            <li><i>✓</i><span><b>Private Telegram group</b> — chat with the community</span></li>
            <li><i>✓</i><span><b>Cancel anytime</b> — managed inside Telegram</span></li>
          </ul>
          <a href="${tgLink()}" target="_blank" rel="noopener" class="btn btn-primary btn-lg">Join Premium for ${S} ⭐</a>
          <p class="muted small" style="text-align:center;margin:.7rem 0 0">Payment is handled securely by Telegram Stars.</p>
        </div>
      </section>
      <section class="container section">
        <div class="section-head"><h2>How to join</h2></div>
        <div class="steps">
          <div class="step"><div class="n">1</div><h3>Tap “Join on Telegram”</h3><p class="muted">Opens the TeraPlayz Premium group in the Telegram app.</p></div>
          <div class="step"><div class="n">2</div><h3>Pay ${S} Stars</h3><p class="muted">Subscribe with Telegram Stars — ${S} ⭐ per ${C.premiumPeriod}.</p></div>
          <div class="step"><div class="n">3</div><h3>Enjoy HD, ad-free</h3><p class="muted">Every video in high quality, posted daily in the group.</p></div>
        </div>
      </section>
      <section class="container section">
        <div class="section-head"><h2>Free vs Premium</h2></div>
        <div style="overflow-x:auto"><table class="compare">
          <tr><th></th><th>Free</th><th>Premium 👑</th></tr>
          <tr><td>Watch every video</td><td>✓</td><td>✓</td></tr>
          <tr><td>Quality</td><td>Standard (SD)</td><td>✓ High quality (HD)</td></tr>
          <tr><td>Ads</td><td>Yes</td><td>None — 100% ad-free</td></tr>
          <tr><td>Price</td><td>Free</td><td>${S} ⭐ / ${C.premiumPeriod}</td></tr>
          <tr><td>Private Telegram group</td><td>—</td><td>✓</td></tr>
        </table></div>
      </section>
      <section class="container section">
        <div class="section-head"><h2>FAQ</h2></div>
        <details><summary>What are Telegram Stars?</summary><p class="muted">Stars are Telegram's in-app currency. You can buy them inside Telegram and use them to pay for subscriptions like TeraPlayz Premium.</p></details>
        <details><summary>How often are new videos added?</summary><p class="muted">Every day! Premium members get them in HD in the Telegram group.</p></details>
        <details><summary>Is TeraPlayz free?</summary><p class="muted">Yes! Every video is free to watch on the website, supported by ads. Premium removes the ads and gives you HD.</p></details>
        <details><summary>Can I cancel?</summary><p class="muted">Yes — manage or cancel your subscription anytime in Telegram.</p></details>
      </section>`;
  }

  /* ---------- router ---------- */
  function route() {
    cleanup.forEach((f) => { try { f(); } catch {} }); cleanup = [];
    const h = location.hash.replace(/^#\/?/, "");
    const [page, arg] = h.split("/");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active",
      a.dataset.nav === (page === "watch" ? "videos" : page || "home")));
    if (page === "watch") { viewWatch(decodeURIComponent(arg || "")); document.title = (videos.find((x) => x.id === decodeURIComponent(arg || "")) || {}).title + " · TeraPlayz"; }
    else if (page === "premium") { viewPremium(); document.title = "Premium · TeraPlayz"; }
    else if (page === "videos") { viewVideos(); document.title = "All videos · TeraPlayz"; }
    else { viewHome(); document.title = "TeraPlayz — Fresh videos every day"; }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  window.addEventListener("hashchange", route);
  route();
})();
