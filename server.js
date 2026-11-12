// teraplayz server - Node/Express + Neon + Telegram
// Language: Node.js | Runtime: Node 18+ | Target: Koyeb free tier
// Dependencies: express, @neondatabase/serverless, node-telegram-bot-api, multer
// Gotcha: Telegram getFile URLs expire (~1h); refresh on play. Neon free has connection limits.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { neon } = require('@neondatabase/serverless');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const sql = neon(process.env.NEON_DATABASE_URL);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 80 * 1024 * 1024 // 80 MB hard cap to stay under 512 MB free tier
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Init DB tables
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      telegram_file_id TEXT NOT NULL,
      telegram_message_id BIGINT,
      quality TEXT DEFAULT 'sd',
      is_premium BOOLEAN DEFAULT false,
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      premium_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('DB ready');
}
initDB().catch(console.error);

// Admin middleware
function adminOnly(req, res, next) {
  const key = req.headers['x-admin-key'] || req.body.admin_key;
  if (key !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  next();
}

// List videos (public)
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await sql`SELECT id, title, description, quality, is_premium, views, created_at FROM videos ORDER BY created_at DESC`;
    res.json(videos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get stream URL (refreshes Telegram file link)
app.get('/api/videos/:id/stream', async (req, res) => {
  try {
    const [video] = await sql`SELECT * FROM videos WHERE id = ${req.params.id}`;
    if (!video) return res.status(404).json({ error: 'not found' });

    // Premium gate example: free users get SD only if marked premium content
    // Real check would use user session; here simplified
    const file = await bot.getFile(video.telegram_file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    await sql`UPDATE videos SET views = views + 1 WHERE id = ${req.params.id}`;
    res.json({ url, quality: video.quality, is_premium: video.is_premium });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin upload video -> Telegram channel + Neon
// Streams the file instead of loading it fully into memory
app.post('/api/admin/upload', adminOnly, upload.single('video'), async (req, res) => {
  let filePath;
  try {
    if (!req.file) return res.status(400).json({ error: 'no video' });
    filePath = req.file.path;
    const { title, description, quality = 'sd', is_premium = false } = req.body;

    // Stream to Telegram (node-telegram-bot-api accepts ReadStream)
    const stream = fs.createReadStream(filePath);
    const sent = await bot.sendVideo(process.env.TELEGRAM_CHANNEL_ID, stream, {
      caption: `${title}\n${description || ''}`,
      supports_streaming: true
    });

    const fileId = sent.video.file_id;
    const messageId = sent.message_id;

    await sql`
      INSERT INTO videos (title, description, telegram_file_id, telegram_message_id, quality, is_premium)
      VALUES (${title}, ${description || ''}, ${fileId}, ${messageId}, ${quality}, ${is_premium === 'true'})
    `;

    res.json({ success: true, file_id: fileId });
  } catch (e) {
    if (e.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file too large (max 80 MB on free tier)' });
    }
    res.status(500).json({ error: e.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
});

// Telegram Login Widget verification
function verifyTelegramAuth(data) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (hmac !== hash) return false;

  // Optional: reject if auth_date older than 1 day
  const authDate = parseInt(data.auth_date, 10);
  if (Date.now() / 1000 - authDate > 86400) return false;

  return true;
}

app.post('/api/auth/telegram', async (req, res) => {
  try {
    const user = req.body;
    if (!verifyTelegramAuth(user)) {
      return res.status(401).json({ ok: false, error: 'invalid hash' });
    }

    // Upsert user
    await sql`
      INSERT INTO users (telegram_id, username)
      VALUES (${user.id}, ${user.username || null})
      ON CONFLICT (telegram_id) DO UPDATE SET username = ${user.username || null}
    `;

    res.json({ ok: true, id: user.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Premium status check
app.get('/api/premium/:telegramId', async (req, res) => {
  try {
    const [user] = await sql`SELECT premium_until FROM users WHERE telegram_id = ${req.params.telegramId}`;
    const isPremium = user && user.premium_until && new Date(user.premium_until) > new Date();
    res.json({ is_premium: !!isPremium, until: user?.premium_until || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Telegram Stars webhook / invoice handler (bot will call this or use polling)
// For simplicity, expose endpoint for bot to update on successful payment
app.post('/api/premium/grant', async (req, res) => {
  const { telegram_id, username, months = 1, secret } = req.body;
  if (secret !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'no' });

  const until = new Date();
  until.setMonth(until.getMonth() + months);

  await sql`
    INSERT INTO users (telegram_id, username, premium_until)
    VALUES (${telegram_id}, ${username}, ${until})
    ON CONFLICT (telegram_id) DO UPDATE SET premium_until = ${until}, username = ${username}
  `;
  res.json({ success: true, until });
});

// Telegram Stars invoice
async function sendPremiumInvoice(chatId) {
  const stars = parseInt(process.env.PREMIUM_STARS || '100', 10);
  await bot.sendInvoice(chatId, 
    'teraplayz Premium',
    '1 month ads-free + high quality videos',
    'premium_1m',
    '', // provider_token empty for Stars
    'XTR',
    [{ label: 'Premium 1 month', amount: stars }]
  );
}

// Webhook for Telegram updates
app.post('/api/telegram/webhook', express.json(), (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Direct Telegram upload path (bypasses Koyeb memory)
// Admin sends video to the bot; bot forwards to channel and stores file_id
bot.on('video', async (msg) => {
  try {
    if (msg.from.id !== parseInt(process.env.ADMIN_TELEGRAM_ID, 10)) return;

    const video = msg.video;
    const caption = msg.caption || 'Untitled';
    const title = caption.split('\n')[0].slice(0, 100);
    const description = caption;

    const sent = await bot.sendVideo(process.env.TELEGRAM_CHANNEL_ID, video.file_id, {
      caption,
      supports_streaming: true
    });

    await sql`
      INSERT INTO videos (title, description, telegram_file_id, telegram_message_id, quality, is_premium)
      VALUES (${title}, ${description}, ${sent.video.file_id}, ${sent.message_id}, 'hd', false)
    `;

    await bot.sendMessage(msg.chat.id, `Uploaded: ${title}\nFile ID stored.`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `Upload failed: ${e.message}`);
  }
});

// Bot payment handler setup
async function setupBot() {
  // Handle /start premium or /premium
  bot.onText(/\/start premium|\/premium/, async (msg) => {
    await sendPremiumInvoice(msg.chat.id);
  });

  bot.on('pre_checkout_query', (query) => {
    bot.answerPreCheckoutQuery(query.id, true).catch(console.error);
  });

  bot.on('successful_payment', async (msg) => {
    const telegramId = msg.from.id;
    const username = msg.from.username || null;
    const paid = msg.successful_payment.total_amount;
    const stars = parseInt(process.env.PREMIUM_STARS || '100', 10);
    const months = Math.max(1, Math.floor(paid / stars));
    const until = new Date();
    until.setMonth(until.getMonth() + months);

    await sql`
      INSERT INTO users (telegram_id, username, premium_until)
      VALUES (${telegramId}, ${username}, ${until})
      ON CONFLICT (telegram_id) DO UPDATE SET premium_until = ${until}, username = EXCLUDED.username
    `;

    await bot.sendMessage(telegramId, `Premium active until ${until.toDateString()}. Reload teraplayz to unlock ads-free HQ.`);
  });

  // Set webhook if SITE_URL present
  if (process.env.SITE_URL) {
    const webhookUrl = `${process.env.SITE_URL.replace(/\/$/, '')}/api/telegram/webhook`;
    await bot.setWebHook(webhookUrl).catch(e => console.error('webhook set failed', e.message));
    console.log('Webhook set to', webhookUrl);
  }
}
setupBot().catch(console.error);

app.listen(PORT, () => console.log(`teraplayz running on ${PORT}`));
