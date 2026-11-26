#!/usr/bin/env bash
# Start the demo slice. Creates demo/.env with random secrets on first run (never committed).
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  umask 077
  printf 'DS_JWT_SECRET=%s\nAPP_SECRET=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
  echo "created demo/.env (secrets not printed)"
fi
docker compose up -d --build
echo "waiting for the Document Server (first start can take ~1-2 min)..."
for _ in $(seq 1 90); do
  if curl -fsS http://localhost:8081/healthcheck 2>/dev/null | grep -q true; then
    echo "ready → open http://localhost:3001 in two browser windows"
    exit 0
  fi
  sleep 2
done
echo "Document Server not healthy yet — check: docker compose logs documentserver" >&2
exit 1
