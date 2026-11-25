#!/usr/bin/env bash
# full-qa-reset.sh — universal QA reset. Every project type.
# Runs all pre-checks, flushes state, seeds DB, then runs the universal
# smoke gauntlet. Contract projects' equivalent script extends this.
#
# Configuration:
#   REDIS_CONTAINER     default redis
#   SEED_COMMAND        default "bun run tests/seed-db.ts"
#   SKIP_SMOKE          set to 1 to skip the smoke gauntlet (do not use)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIS="${REDIS_CONTAINER:-redis}"
SEED="${SEED_COMMAND:-bun run tests/seed-db.ts}"

echo ""; echo "=========================================="
echo "  Full QA Reset — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================="

echo ""; echo "--- Step 1/3: Cache Flush ---"
if command -v docker >/dev/null 2>&1 && docker inspect "$REDIS" >/dev/null 2>&1; then
  docker exec "$REDIS" redis-cli --no-auth-warning FLUSHDB >/dev/null 2>&1 \
    && echo "  [PASS] Redis flushed" \
    || echo "  [WARN] Redis flush failed"
else
  echo "  [SKIP] Redis flush (container '$REDIS' not running)"
fi

echo ""; echo "--- Step 2/3: DB Seed ---"
if eval "$SEED" 2>&1 | tail -20; then
  echo "  [PASS] DB seeded"
else
  echo "✗ Seed failed — check 'already exists' errors. Stop."
  exit 1
fi

if [ "${SKIP_SMOKE:-0}" != "1" ]; then
  echo ""; echo "--- Step 3/3: Smoke Gauntlet ---"
  bash "$SCRIPT_DIR/pre-qa-smoke.sh" || { echo "✗ Smoke gauntlet failed — stop"; exit 1; }
fi

echo ""; echo "=========================================="
echo "  RESET COMPLETE — ready for full test suite"
echo "=========================================="
