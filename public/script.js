// teraplayz frontend
const grid = document.getElementById('grid');
const modal = document.getElementById('modal');
const player = document.getElementById('player');
const playerTitle = document.getElementById('playerTitle');
const ads = document.getElementById('ads');
const premiumBtn = document.getElementById('premiumBtn');
const loginContainer = document.getElementById('loginContainer');

let isPremium = false;
let currentUser = null;

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('tg_user') || 'null');
  } catch { return null; }
}

async function checkPremium(telegramId) {
  if (!telegramId) return false;
  try {
    const r = await fetch(`/api/premium/${telegramId}`);
    const d = await r.json();
    isPremium = d.is_premium;
    if (isPremium) {
      ads.style.display = 'none';
      premiumBtn.textContent = 'Premium Active';
    }
    return isPremium;
  } catch (e) {
    return false;
  }
}

function renderLoginState() {
  const user = getStoredUser();
  if (user) {
    currentUser = user;
    loginContainer.innerHTML = `
      <div class="flex items-center gap-2 text-sm">
        <img src="${user.photo_url || ''}" class="w-8 h-8 rounded-full" onerror="this.style.display='none'">
        <span class="text-zinc-300">${user.first_name || user.username}</span>
        <button onclick="logout()" class="text-xs text-zinc-500 hover:text-white">logout</button>
      </div>
    `;
    checkPremium(user.id);
  } else {
    // Widget is injected by the script tag; container is for fallback display
    loginContainer.innerHTML = '';
  }
}

// Called by Telegram widget
window.telegramLogin = async function(user) {
  try {
    const r = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    const d = await r.json();
    if (d.ok) {
      localStorage.setItem('tg_user', JSON.stringify(user));
      renderLoginState();
    } else {
      alert('Login verification failed');
    }
  } catch (e) {
    alert('Login error');
  }
};

function logout() {
  localStorage.removeItem('tg_user');
  currentUser = null;
  isPremium = false;
  ads.style.display = '';
  premiumBtn.textContent = 'Go Premium · 100★';
  renderLoginState();
  location.reload();
}

async function loadVideos() {
  const r = await fetch('/api/videos');
  const videos = await r.json();
  grid.innerHTML = videos.map(v => `
    <div class="bg-zinc-900 rounded-xl overflow-hidden cursor-pointer border border-zinc-800" onclick="playVideo(${v.id}, '${v.title.replace(/'/g, "\\'")}', ${v.is_premium})">
      <div class="aspect-video bg-zinc-800 relative">
        <div class="absolute inset-0 flex items-center justify-center text-zinc-600 text-4xl">▶</div>
        ${v.is_premium ? '<span class="premium-badge absolute top-2 right-2">HQ</span>' : ''}
      </div>
      <div class="p-3">
        <h3 class="font-medium text-sm line-clamp-2">${v.title}</h3>
        <p class="text-xs text-zinc-500 mt-1">${v.views || 0} views · ${v.quality}</p>
      </div>
    </div>
  `).join('');
}

async function playVideo(id, title, isPrem) {
  if (isPrem && !isPremium) {
    alert('Premium required for this video. Login with Telegram and subscribe with 100 stars.');
    return;
  }
  const r = await fetch(`/api/videos/${id}/stream`);
  const d = await r.json();
  player.src = d.url;
  playerTitle.textContent = title;
  modal.classList.remove('hidden');
  player.play();
}

document.getElementById('closeModal').onclick = () => {
  modal.classList.add('hidden');
  player.pause();
  player.src = '';
};

premiumBtn.onclick = () => {
  if (!currentUser) {
    alert('Login with Telegram first');
    return;
  }
  window.open('https://t.me/YOUR_BOT_USERNAME?start=premium', '_blank');
};

function addFloaters() {
  const svgs = [
    '<svg class="float-girl w-16 h-24 opacity-30" viewBox="0 0 64 96" fill="none"><path d="M32 8c-6 0-10 6-10 12s4 10 10 10 10-4 10-10-4-12-10-12zm-14 28c-8 4-14 14-14 24v20h56V60c0-10-6-20-14-24-4 6-10 8-14 8s-10-2-14-8z" fill="#ec4899"/></svg>',
    '<svg class="float-girl w-14 h-20 opacity-20" viewBox="0 0 56 80" fill="none"><path d="M28 6c-5 0-8 5-8 10s3 8 8 8 8-3 8-8-3-10-8-10zm-12 24c-7 3-12 12-12 20v16h48V50c0-8-5-17-12-20-3 5-8 7-12 7s-9-2-12-7z" fill="#a855f7"/></svg>'
  ];
  document.body.insertAdjacentHTML('beforeend', svgs.join(''));
}

renderLoginState();
loadVideos();
addFloaters();
