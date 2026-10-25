#!/usr/bin/env bash
# Run TeraPlayz locally in mock mode (no Telegram needed): files + DB go to ./data
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
export STORAGE=local ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}" SESSION_SECRET="${SESSION_SECRET:-dev-secret}"
echo "Site: http://localhost:8000   Admin: http://localhost:8000/admin  (password: $ADMIN_PASSWORD)"
exec .venv/bin/uvicorn server.main:app --reload --port 8000
