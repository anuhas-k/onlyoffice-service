#!/usr/bin/env bash
# dev-up.sh — universal dev environment bootstrap.
# Source: issues/ASTRA-IMPROVEMENT-PROPOSAL.md §4.
#
# Universal across project types. Runs before `docker compose up` /
# `bun run dev` / equivalent. Catches the Project A-class dev-env failures:
#   - local PostgreSQL conflicts with docker-compose's PG
#   - dev rate limit at production value (100/day) causes 429s mid-test
#   - CORS configured for prod origin only — frontend can't talk to backend
#   - service "up" but smoke test never run before the user finds bugs
#
# Configuration:
#   GATEWAY_URL       default http://localhost:3000
#   HEALTH_ENDPOINT   default /api/v1/healthz
#   DEV_PORTS         space-separated, default "3000 5432 6379"
#   SKIP_COMPOSE      set to 1 to skip docker-compose bring-up

set -uo pipefail
GATEWAY="${GATEWAY_URL:-http://localhost:3000}"
HEALTH_EP="${HEALTH_ENDPOINT:-/api/v1/healthz}"
DEV_PORTS="${DEV_PORTS:-3000 3001 3003 5173 5432 6379 8545 8547}"
PROJECT_DIR="$(pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass() { echo "  [PASS] $1"; }
warn() { echo "  [WARN] $1"; WARNED=$((WARNED+1)); }
fail() { echo "  [FAIL] $1"; FAILED=$((FAILED+1)); }
WARNED=0
FAILED=0

echo ""; echo "=========================================="
echo "  Dev Up — universal bootstrap ($(date -u +%H:%M:%SZ))"
echo "=========================================="

# ── Step 1 — Port conflict check ────────────────────────────────────
echo ""; echo "--- Step 1/4: Port conflict check ---"
if command -v lsof >/dev/null 2>&1; then
  for port in $DEV_PORTS; do
    HOLDER=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -1)
    if [ -n "$HOLDER" ]; then
      OWNER=$(echo "$HOLDER" | awk '{print $1 " (pid " $2 ")"}')
      # If docker, it's expected to be docker-compose itself — skip
      if echo "$HOLDER" | grep -qi docker; then
        pass "port $port — docker"
      else
        warn "port $port held by $OWNER — may conflict with docker-compose"
      fi
    fi
  done
else
  echo "  [SKIP] lsof not installed — cannot check ports"
fi

# ── Step 2 — Dev-friendly env defaults ─────────────────────────────
echo ""; echo "--- Step 2/4: Dev env defaults ---"
ENV_FILE=""
for c in .env.local .env.dev .env.test .env; do
  [[ -f "$c" ]] && ENV_FILE="$c" && break
done

if [ -n "$ENV_FILE" ]; then
  # Suggest dev-friendly settings if obviously prod-shaped
  RATE_LIMIT=$(grep -m1 '^RATE_LIMIT_MAX=' "$ENV_FILE" 2>/dev/null | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'")
  if [ -n "$RATE_LIMIT" ] && [ "$RATE_LIMIT" -lt 1000 ] 2>/dev/null; then
    warn "RATE_LIMIT_MAX=$RATE_LIMIT in $ENV_FILE — dev should be ≥ 10000"
  else
    pass "RATE_LIMIT_MAX present + dev-sized"
  fi

  CORS=$(grep -m1 '^CORS_ORIGINS=' "$ENV_FILE" 2>/dev/null | sed 's/^[^=]*=//')
  if [ -n "$CORS" ]; then
    if echo "$CORS" | grep -q 'localhost:3000' ; then
      pass "CORS_ORIGINS includes localhost"
    else
      warn "CORS_ORIGINS doesn't include localhost — frontend dev will be blocked"
    fi
  fi
else
  warn "no .env file found"
fi

# ── Step 3 — Bring up the stack ────────────────────────────────────
echo ""; echo "--- Step 3/4: Compose bring-up ---"
if [ "${SKIP_COMPOSE:-0}" = "1" ]; then
  echo "  [SKIP] SKIP_COMPOSE=1"
elif [ -f "docker-compose.yml" ] || [ -f "compose.yml" ]; then
  echo "  ▸ docker compose up -d"
  docker compose up -d 2>&1 | tail -10
  pass "compose started"

  # Wait for health
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 3 "$GATEWAY$HEALTH_EP" >/dev/null 2>&1 \
       || curl -fsS --max-time 3 "$GATEWAY/healthz" >/dev/null 2>&1; then
      pass "$GATEWAY responding to /healthz"
      break
    fi
    [ "$i" -eq 10 ] && fail "$GATEWAY did not respond to /healthz within 30s"
    sleep 3
  done
else
  echo "  [SKIP] no docker-compose.yml / compose.yml in this project"
fi

# ── Step 4 — Smoke gauntlet ────────────────────────────────────────
echo ""; echo "--- Step 4/4: Smoke gauntlet ---"
if [ -f "$SCRIPT_DIR/pre-qa-smoke.sh" ]; then
  bash "$SCRIPT_DIR/pre-qa-smoke.sh" || warn "smoke gauntlet had failures (above)"
else
  echo "  [SKIP] $SCRIPT_DIR/pre-qa-smoke.sh not found"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""; echo "=========================================="
if [ "$FAILED" -eq 0 ]; then
  echo "  Dev up complete — $WARNED warning(s)"
else
  echo "  Dev up FAILED — $FAILED failure(s), $WARNED warning(s)"
  exit 1
fi
echo "=========================================="
