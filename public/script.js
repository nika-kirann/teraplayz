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
    loginContainer.innerHTML = '';
  }
}

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
  premiumBtn.textContent = 'Unlock · 100★';
  renderLoginState();
  location.reload();
}

async function loadVideos() {
  const r = await fetch('/api/videos');
  const videos = await r.json();
  grid.innerHTML = videos.map(v => `
    <div class="rounded-2xl overflow-hidden cursor-pointer" onclick="playVideo(${v.id}, '${v.title.replace(/'/g, "\\'")}', ${v.is_premium})">
      <div class="aspect-video bg-zinc-900 relative">
        <div class="absolute inset-0 flex items-center justify-center text-pink-900/40 text-5xl">▶</div>
        ${v.is_premium ? '<span class="premium-badge absolute top-3 right-3">HQ</span>' : ''}
      </div>
      <div class="p-4">
        <h3 class="font-medium text-sm line-clamp-2 text-pink-50">${v.title}</h3>
        <p class="text-xs text-pink-300/50 mt-1">${v.views || 0} views · ${v.quality}</p>
      </div>
    </div>
  `).join('');
}

async function playVideo(id, title, isPrem) {
  if (isPrem && !isPremium) {
    alert('Premium required. Login and unlock with 100 stars.');
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
  const accents = [
    '<div class="float-accent w-32 h-32 rounded-full bg-rose-900/20 blur-3xl" style="top:15%;left:8%;animation-delay:0s"></div>',
    '<div class="float-accent w-40 h-40 rounded-full bg-fuchsia-900/15 blur-3xl" style="top:55%;right:5%;animation-delay:4s"></div>',
    '<div class="float-accent w-24 h-24 rounded-full bg-pink-800/20 blur-2xl" style="bottom:10%;left:20%;animation-delay:8s"></div>'
  ];
  document.body.insertAdjacentHTML('beforeend', accents.join(''));
}

renderLoginState();
loadVideos();
addFloaters();
