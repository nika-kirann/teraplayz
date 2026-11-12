# teraplayz

Admin-only video platform. Videos hosted on Telegram private channel. Metadata on Neon Postgres. Premium via Telegram Stars (100/month).

## Setup

1. Create Neon project, copy connection string to NEON_DATABASE_URL
2. Create Telegram bot via @BotFather, get token
3. Create private channel, add bot as admin, get channel ID (negative number)
4. Set ADMIN_TELEGRAM_ID and ADMIN_KEY
5. Deploy to Koyeb

## Env

See .env.example

## Admin

Visit /admin.html , enter ADMIN_KEY, upload videos (sent to Telegram channel).

## Premium (Telegram Stars)
- User logs in with widget.
- Clicks “Go Premium” → opens bot with `/start premium`.
- Bot sends invoice for 100 XTR (Stars).
- On successful_payment the webhook updates `premium_until` in Neon.
- Reload site → ads gone, HQ unlocked.

Set `SITE_URL` so the bot auto-registers the webhook on boot.

## Deploy Koyeb

Push to GitHub, connect to Koyeb, set env vars, start command: npm start
Port: 3000
