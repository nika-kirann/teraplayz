/* ============ TeraPlayz admin panel ============ */
(function () {
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString();
  const fmtBytes = (b) => { b = Number(b || 0); const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; } return (i ? b.toFixed(1) : b) + " " + u[i]; };
  const fmtDur = (s) => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const fmtUptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + "d " : "") + (h ? h + "h " : "") + m + "m"; };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  let state = { days: 7, videos: [], q: "" };

  /* ---------- theme (shared with the public site) ---------- */
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tp_theme", next);
  });

  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const o = { credentials: "same-origin", ...opts, headers: { "X-TP-Admin": "1", ...(opts.headers || {}) } };
    if (o.json !== undefined) { o.body = JSON.stringify(o.json); o.headers["Content-Type"] = "application/json"; delete o.json; }
    const r = await fetch(path, o);
    let data = null; try { data = await r.json(); } catch {}
    if (r.status === 401 && !path.endsWith("/login")) { showLogin(); throw new Error("Session expired — please log in again"); }
    if (!r.ok) throw new Error((data && data.detail) || `Error ${r.status}`);
    return data;
  }

  /* ---------- login ---------- */
  function setChrome(loggedIn) {
    $("#adminNav").hidden = !loggedIn; $("#adminBottom").hidden = !loggedIn; $("#logoutBtn").hidden = !loggedIn;
    document.body.style.paddingBottom = loggedIn ? "" : "0";
  }
  function showLogin(note) {
    setChrome(false);
    app.innerHTML = `<div class="login-wrap fade-in"><div class="panel login-card">
      <img class="mascot" src="/assets/mascot-premium.jpg" alt="" />
      <h1>TeraPlayz <span class="grad-text">Admin</span></h1>
      <p class="muted" style="margin:0">Log in to upload and manage videos.</p>
      <form id="loginForm" autocomplete="on">
        <div class="field"><label for="pw">Admin password</label><input id="pw" type="password" autocomplete="current-password" required placeholder="••••••••" /></div>
        <div class="err" id="loginErr">${esc(note || "")}</div>
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>
      <p class="hint" style="margin-top:1rem">Too many wrong attempts lock logins for 15 minutes.</p>
    </div></div>`;
    $("#pw").focus();
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#loginForm button"); btn.disabled = true; $("#loginErr").textContent = "";
      try { await api("/admin/api/login", { method: "POST", json: { password: $("#pw").value } }); route(); }
      catch (err) { $("#loginErr").textContent = err.message; $("#pw").select(); }
      finally { btn.disabled = false; }
    };
  }
  $("#logoutBtn").onclick = async () => { try { await api("/admin/api/logout", { method: "POST" }); } catch {} showLogin(); };

  /* ---------- dashboard ---------- */
  function chartSVG(series) {
    const W = 720, H = 240, P = { l: 40, r: 12, t: 14, b: 28 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const max = Math.max(4, ...series.map((s) => Math.max(s.pageviews, s.visitors)));
    const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
    const n = series.length, bw = iw / n;
    let g = "";
    for (let i = 0; i <= 4; i++) { const y = P.t + ih - (ih * i) / 4; g += `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="axis" x="${P.l - 6}" y="${y + 4}" text-anchor="end">${Math.round((top * i) / 4)}</text>`; }
    let bars = "", pts = [], labels = "";
    series.forEach((s, i) => {
      const h = (s.pageviews / top) * ih, x = P.l + i * bw + bw * 0.18;
      bars += `<rect class="bar" x="${x}" y="${P.t + ih - h}" width="${bw * 0.64}" height="${Math.max(h, 0)}" rx="${Math.min(6, bw * 0.2)}"><title>${s.date}: ${s.pageviews} page views, ${s.visitors} visitors</title></rect>`;
      pts.push([P.l + i * bw + bw / 2, P.t + ih - (s.visitors / top) * ih]);
      const every = n > 10 ? 5 : 1;
      if (i % every === 0 || i === n - 1) labels += `<text class="axis" x="${P.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${s.date.slice(5).replace("-", "/")}</text>`;
    });
    const line = `<polyline class="line" points="${pts.map((p) => p.join(",")).join(" ")}"/>` + pts.map((p) => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="3.5"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Page views and visitors chart"><defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>${g}${bars}${line}${labels}</svg>`;
  }

  async function viewDashboard() {
    app.innerHTML = `<h1>Dashboard</h1><div class="muted">Loading…</div>`;
    const d = await api(`/admin/api/stats?days=${state.days}`);
    const t = d.totals, s = d.status;
    const ok = s.connected && !s.lastSaveError;
    app.innerHTML = `<div class="fade-in">
      <h1>Dashboard</h1>
      <div class="stats">
        <div class="stat"><span>Total videos</span><b>${fmtNum(t.videos)}</b><span>${fmtBytes(t.storageBytes)} stored</span></div>
        <div class="stat"><span>Total video views</span><b>${fmtNum(t.views)}</b><span>all time</span></div>
        <div class="stat"><span>Visitors today</span><b>${fmtNum(t.todayVisitors)}</b><span>${fmtNum(t.visitors)} in ${state.days} days</span></div>
        <div class="stat"><span>Page views today</span><b>${fmtNum(t.todayPageviews)}</b><span>${fmtNum(t.pageviews)} in ${state.days} days</span></div>
      </div>
      <div class="dash-grid">
        <section class="panel chart">
          <div class="panel-head"><h2>Daily traffic</h2>
            <div class="seg" role="group" aria-label="Range"><button data-days="7" class="${state.days === 7 ? "on" : ""}">7 days</button><button data-days="30" class="${state.days === 30 ? "on" : ""}">30 days</button></div></div>
          ${chartSVG(d.series)}
          <div class="legend"><span><i style="background:#7c3aed"></i>Page views</span><span><i style="background:var(--pink)"></i>Unique visitors</span></div>
        </section>
        <section class="panel">
          <h2>Top videos</h2>
          ${d.top.length ? `<ol class="top-list">${d.top.map((v, i) => `<li><span class="rank">${i + 1}</span><span class="t" title="${esc(v.title)}">${esc(v.title)}</span><span class="v">${fmtNum(v.views)} 👁</span></li>`).join("")}</ol>` : `<p class="muted">No videos yet — <a href="#upload" class="grad-text" style="font-weight:700">upload your first one</a>.</p>`}
        </section>
        <section class="panel">
          <h2>Views per video</h2>
          ${d.top.length ? `<dl class="status-list" style="max-height:320px;overflow:auto">${d.allViews.map((v) => `<div><dt>${esc(v.title)}</dt><dd>${fmtNum(v.views)}</dd></div>`).join("")}</dl>` : `<p class="muted">—</p>`}
        </section>
        <section class="panel">
          <h2>Server status</h2>
          <dl class="status-list">
            <div><dt>Status</dt><dd><span class="${ok ? "dot-ok" : "dot-bad"}"></span>${ok ? "Healthy" : "Problem"}</dd></div>
            <div><dt>Storage</dt><dd>${s.mode === "telegram" ? "Telegram channel" + (s.channel ? " · " + esc(s.channel) : "") : "Local disk (dev mode)"}</dd></div>
            <div><dt>Storage connected</dt><dd>${s.connected ? "Yes" : "No"}</dd></div>
            <div><dt>Uptime</dt><dd>${fmtUptime(s.uptimeSeconds)}</dd></div>
            <div><dt>DB last saved (this run)</dt><dd>${s.lastSave ? new Date(s.lastSave * 1000).toLocaleString() : "not yet"}</dd></div>
            <div><dt>Unsaved analytics</dt><dd>${s.unsavedChanges ? "Yes (flushes every 5 min)" : "No"}</dd></div>
            ${s.lastSaveError ? `<div><dt>Last save error</dt><dd style="color:#e11d48">${esc(s.lastSaveError)}</dd></div>` : ""}
            <div><dt>Uploads in progress</dt><dd>${s.activeJobs}</dd></div>
            <div><dt>Memory</dt><dd>${s.memoryBytes ? fmtBytes(s.memoryBytes) : "—"}</dd></div>
            <div><dt>Python</dt><dd>${esc(s.python)}</dd></div>
          </dl>
        </section>
      </div></div>`;
    $$(".seg button").forEach((b) => (b.onclick = () => { state.days = +b.dataset.days; viewDashboard().catch(fail); }));
  }

  /* ---------- upload ---------- */
  let pick = { video: null, thumbBlob: null, thumbFromUser: false, duration: "" };

  function captureFrame(video) {
    return new Promise((resolve) => {
      const c = document.createElement("canvas");
      const w = Math.min(1280, video.videoWidth || 1280), h = Math.round(w * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
      c.width = w; c.height = h;
      try { c.getContext("2d").drawImage(video, 0, 0, w, h); c.toBlob((b) => resolve(b), "image/jpeg", 0.85); } catch { resolve(null); }
    });
  }

  async function viewUpload() {
    pick = { video: null, thumbBlob: null, thumbFromUser: false, duration: "" };
    app.innerHTML = `<div class="fade-in"><h1>Upload a video</h1>
      <form id="upForm" class="form-grid two">
        <section class="panel form-grid">
          <label class="drop" id="drop"><span class="big">🎬</span><b id="dropTitle">Choose a video or drop it here</b><span class="hint" id="dropHint">MP4 / WebM · up to 2 GB · stored in your private Telegram channel</span>
            <input type="file" id="fVideo" accept="video/*" /></label>
          <div class="field"><label for="fTitle">Title</label><input type="text" id="fTitle" maxlength="200" required placeholder="e.g. Episode 12 — The Big Day" /></div>
          <div class="field"><label for="fDate">Date</label><input type="date" id="fDate" value="${todayStr()}" /></div>
          <div class="field"><label for="fDesc">Description</label><textarea id="fDesc" maxlength="2000" placeholder="What's this video about?"></textarea></div>
          <label class="switch"><input type="checkbox" id="fFeat" /> ⭐ Mark as featured (shown first on the site)</label>
        </section>
        <section class="panel form-grid" style="align-content:start">
          <div class="preview-box"><span class="label">Thumbnail</span>
            <img id="thumbImg" src="/assets/thumb-placeholder.svg" alt="Thumbnail preview" />
            <div class="thumb-row">
              <button type="button" class="btn btn-ghost btn-sm" id="grabFrame" disabled>📸 Use current frame</button>
              <label class="btn btn-ghost btn-sm" style="cursor:pointer">🖼 Upload image<input type="file" id="fThumb" accept="image/*" hidden /></label>
            </div>
            <span class="hint" id="thumbHint">Auto-generated from the video — or scrub the preview below and press “Use current frame”.</span>
            <video id="pv" controls muted playsinline preload="metadata" hidden></video>
            <span class="hint" id="durHint"></span>
          </div>
          <div id="progWrap" hidden>
            <div class="progress"><i id="progBar"></i></div>
            <div class="progress-meta"><span id="progLabel">Uploading…</span><span id="progPct">0%</span></div>
          </div>
          <div class="err" id="upErr"></div>
          <button class="btn btn-primary btn-lg" id="upBtn" type="submit">⬆️ Upload video</button>
        </section>
      </form></div>`;

    const pv = $("#pv"), drop = $("#drop");
    const setThumb = (blob, fromUser) => { pick.thumbBlob = blob; pick.thumbFromUser = fromUser; if (blob) $("#thumbImg").src = URL.createObjectURL(blob); };

    function onVideo(file) {
      if (!file) return;
      if (!file.type.startsWith("video/")) { $("#upErr").textContent = "That doesn't look like a video file."; return; }
      $("#upErr").textContent = "";
      pick.video = file;
      $("#dropTitle").textContent = file.name; $("#dropHint").textContent = fmtBytes(file.size) + " · click to change";
      if (!$("#fTitle").value) $("#fTitle").value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      pv.hidden = false; pv.src = URL.createObjectURL(file);
      pv.onloadedmetadata = () => {
        if (isFinite(pv.duration)) { pick.duration = fmtDur(pv.duration); $("#durHint").textContent = "Duration: " + pick.duration; }
        pv.currentTime = Math.min(isFinite(pv.duration) ? pv.duration * 0.1 : 1, 8);
      };
      pv.onseeked = async () => { if (!pick.thumbFromUser && !pick.autoDone) { pick.autoDone = true; setThumb(await captureFrame(pv), false); } };
      pick.autoDone = false;
      $("#grabFrame").disabled = false;
    }
    $("#fVideo").onchange = (e) => onVideo(e.target.files[0]);
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => onVideo(e.dataTransfer.files[0]));
    $("#grabFrame").onclick = async () => setThumb(await captureFrame(pv), true);
    $("#fThumb").onchange = (e) => { const f = e.target.files[0]; if (f) setThumb(f, true); };

    $("#upForm").onsubmit = (e) => {
      e.preventDefault();
      if (!pick.video) { $("#upErr").textContent = "Please choose a video first."; return; }
      const fd = new FormData();
      fd.append("video", pick.video, pick.video.name);
      if (pick.thumbBlob) fd.append("thumbnail", pick.thumbBlob, "thumb.jpg");
      fd.append("title", $("#fTitle").value);
      fd.append("description", $("#fDesc").value);
      fd.append("duration", pick.duration);
      fd.append("date", $("#fDate").value);
      fd.append("featured", $("#fFeat").checked ? "true" : "false");
      upload(fd);
    };
  }

  function setProgress(frac, label) {
    const pct = Math.round(frac * 100);
    $("#progBar").style.width = pct + "%"; $("#progPct").textContent = pct + "%"; $("#progLabel").textContent = label;
  }

  function upload(fd) {
    const btn = $("#upBtn"); btn.disabled = true; $("#upErr").textContent = ""; $("#progWrap").hidden = false;
    $$("#upForm input, #upForm textarea, #upForm button").forEach((el) => (el.disabled = true));
    const fail = (msg) => { $("#upErr").textContent = msg; $$("#upForm input, #upForm textarea, #upForm button").forEach((el) => (el.disabled = false)); };
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/api/upload");
    xhr.setRequestHeader("X-TP-Admin", "1");
    // Step 1 (0–50%): browser → server. Step 2 (50–100%): server → Telegram.
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress((e.loaded / e.total) * 0.5, `Step 1/2 · Uploading to server · ${fmtBytes(e.loaded)} of ${fmtBytes(e.total)}`); };
    xhr.onerror = () => fail("Network error — upload failed.");
    xhr.onload = () => {
      let data = {}; try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) { showLogin("Session expired — please log in again."); return; }
      if (xhr.status !== 200) { fail(data.detail || `Upload failed (${xhr.status})`); return; }
      poll(data.job.id);
    };
    xhr.send(fd);

    async function poll(id) {
      try {
        const j = await api(`/admin/api/jobs/${id}`);
        if (j.status === "done") { setProgress(1, "Done! ✨"); toast("Video uploaded 🎉"); setTimeout(() => (location.hash = "#videos"), 700); return; }
        if (j.status === "error") { fail("Saving to storage failed: " + j.error); return; }
        setProgress(0.5 + j.progress * 0.5, `Step 2/2 · Saving to Telegram · ${Math.round(j.progress * 100)}%`);
        setTimeout(() => poll(id), 800);
      } catch (e) { fail(e.message); }
    }
  }

  /* ---------- videos list ---------- */
  async function viewVideos() {
    app.innerHTML = `<h1>Videos</h1><div class="muted">Loading…</div>`;
    state.videos = (await api("/admin/api/videos")).videos;
    app.innerHTML = `<div class="fade-in">
      <div class="panel-head"><h1 style="margin:0">Videos <span class="muted" style="font-size:1rem">(${state.videos.length})</span></h1>
        <div class="list-tools"><input class="input" id="vSearch" type="search" placeholder="Search…" value="${esc(state.q)}" /><a class="btn btn-primary btn-sm" href="#upload">⬆️ Upload</a></div></div>
      <div class="vlist" id="vlist"></div></div>`;
    $("#vSearch").oninput = (e) => { state.q = e.target.value; renderList(); };
    renderList();
  }

  function renderList() {
    const q = state.q.trim().toLowerCase();
    const list = state.videos.filter((v) => !q || (v.title + " " + (v.description || "")).toLowerCase().includes(q));
    $("#vlist").innerHTML = list.length ? list.map((v) => `<article class="vrow" data-id="${esc(v.id)}">
        <img src="${esc(v.thumbnail || "/assets/thumb-placeholder.svg")}" alt="" loading="lazy" />
        <div style="min-width:0"><h3>${esc(v.title)} ${v.featured ? '<span class="feat-pill">⭐ Featured</span>' : ""}</h3>
          <div class="meta"><span>${esc(v.date)}</span><span>${esc(v.duration || "—")}</span><span>👁 ${fmtNum(v.views)}</span><span>${fmtBytes(v.size)}</span></div></div>
        <div class="acts">
          <button class="btn btn-ghost btn-sm star-btn ${v.featured ? "on" : ""}" data-act="feat" title="Toggle featured">⭐ ${v.featured ? "Featured" : "Feature"}</button>
          <button class="btn btn-ghost btn-sm" data-act="edit">✏️ Edit</button>
          <a class="btn btn-ghost btn-sm" href="/#/watch/${encodeURIComponent(v.id)}" target="_blank" rel="noopener">▶ View</a>
          <button class="btn btn-danger btn-sm" data-act="del">🗑 Delete</button>
        </div></article>`).join("")
      : `<div class="panel" style="text-align:center"><p class="muted">${state.videos.length ? "No videos match your search." : "No videos yet."}</p><a class="btn btn-primary" href="#upload">Upload a video</a></div>`;
    $$(".vrow").forEach((row) => {
      const v = state.videos.find((x) => x.id === row.dataset.id);
      $('[data-act="feat"]', row).onclick = () => save(v, { featured: !v.featured }, v.featured ? "Removed from featured" : "Marked as featured ⭐");
      $('[data-act="edit"]', row).onclick = () => editModal(v);
      $('[data-act="del"]', row).onclick = () => confirmDelete(v);
    });
  }

  async function save(v, patch, msg) {
    try { const nv = await api(`/admin/api/videos/${encodeURIComponent(v.id)}`, { method: "PATCH", json: patch }); Object.assign(v, nv); toast(msg || "Saved"); await viewVideos(); }
    catch (e) { toast(e.message); }
  }

  function modal(html) {
    const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<div class="panel fade-in">${html}</div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { m.remove(); document.removeEventListener("keydown", k); } });
    return m;
  }

  function editModal(v) {
    const m = modal(`<h2>Edit video</h2><form class="form-grid" id="editForm">
      <div class="field"><label for="eTitle">Title</label><input type="text" id="eTitle" maxlength="200" required value="${esc(v.title)}" /></div>
      <div class="field"><label for="eDate">Date</label><input type="date" id="eDate" value="${esc(v.date)}" /></div>
      <div class="field"><label for="eDesc">Description</label><textarea id="eDesc" maxlength="2000">${esc(v.description)}</textarea></div>
      <label class="switch"><input type="checkbox" id="eFeat" ${v.featured ? "checked" : ""}/> ⭐ Featured</label>
      <div class="btns"><button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div></form>`);
    $('[data-act="cancel"]', m).onclick = () => m.remove();
    $("#editForm", m).onsubmit = async (e) => {
      e.preventDefault();
      await save(v, { title: $("#eTitle", m).value, date: $("#eDate", m).value, description: $("#eDesc", m).value, featured: $("#eFeat", m).checked }, "Changes saved");
      m.remove();
    };
  }

  function confirmDelete(v) {
    const m = modal(`<h2>Delete “${esc(v.title)}”?</h2><p class="muted">This removes the video and its thumbnail from the site and deletes them from the Telegram channel. This can't be undone.</p>
      <div class="btns"><button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-danger" data-act="ok">Delete video</button></div>`);
    $('[data-act="cancel"]', m).onclick = () => m.remove();
    $('[data-act="ok"]', m).onclick = async () => {
      try { await api(`/admin/api/videos/${encodeURIComponent(v.id)}`, { method: "DELETE" }); toast("Video deleted"); m.remove(); await viewVideos(); }
      catch (e) { toast(e.message); }
    };
  }

  /* ---------- router ---------- */
  function fail(e) { app.innerHTML = `<div class="panel"><h2>Something went wrong</h2><p class="err">${esc(e.message || e)}</p></div>`; }
  async function route() {
    let me;
    try { me = await (await fetch("/admin/api/me", { credentials: "same-origin" })).json(); } catch { me = {}; }
    if (!me.loggedIn) return showLogin(me.passwordConfigured === false ? "ADMIN_PASSWORD is not set on the server." : "");
    setChrome(true);
    const tab = (location.hash.slice(1) || "dashboard");
    $$("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
    document.title = (tab[0].toUpperCase() + tab.slice(1)) + " · TeraPlayz Admin";
    try {
      if (tab === "upload") await viewUpload();
      else if (tab === "videos") await viewVideos();
      else await viewDashboard();
    } catch (e) { if (!/Session expired/.test(e.message)) fail(e); }
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", route);
  route();
})();
