#!/usr/bin/env bash
# pre-qa-smoke.sh — universal pre-QA smoke gauntlet. Every project type.
# Source: Project A engagement, 2026 — the universal portion of QA-2.
#
# 7 checks (all universal — no blockchain assumptions). Contract projects
# layer chain-specific checks on top via scripts/pre-qa-blockchain.sh,
# which calls this script first.
#
# Configuration (env vars, all optional):
#   GATEWAY_URL              default http://localhost:3000
#   REDIS_CONTAINER          default redis (auto-detected; check skipped if missing)
#   AUTH_CONTAINER           docker container with auth service (chainId log check)
#   ADMIN_LOGIN_EMAIL        for auth round-trip check (else skipped)
#   ADMIN_LOGIN_PASSWORD     for auth round-trip check
#   LIST_ENDPOINT            default /api/v1/users — endpoint for list-shape check
#   HEALTH_ENDPOINT          default /api/v1/healthz
#   REGISTER_ENDPOINT        default /api/v1/lands (for XSS reject check — any text-accepting endpoint works)
#   LARGE_BODY_ENDPOINT      default /api/v1/auth/register (for 413 check)

set -uo pipefail
GATEWAY="${GATEWAY_URL:-http://localhost:3000}"
REDIS="${REDIS_CONTAINER:-redis}"
AUTH_CTR="${AUTH_CONTAINER:-}"
HEALTH_EP="${HEALTH_ENDPOINT:-/api/v1/healthz}"
LIST_EP="${LIST_ENDPOINT:-/api/v1/users}"
REGISTER_EP="${REGISTER_ENDPOINT:-/api/v1/lands}"
LARGE_BODY_EP="${LARGE_BODY_ENDPOINT:-/api/v1/auth/register}"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILED=$((FAILED+1)); }
FAILED=0

echo ""; echo "=== Universal Smoke Gauntlet ==="; echo ""

# 1. Health endpoint
H=$(curl -sf --max-time 5 "$GATEWAY$HEALTH_EP" 2>/dev/null \
  || curl -sf --max-time 5 "${GATEWAY}/healthz" 2>/dev/null \
  || echo "{}")
if echo "$H" | jq -e '.status == "ok" or .gateway == "ok" or .health == "ok"' >/dev/null 2>&1; then
  pass "Health endpoint OK"
else
  fail "Health endpoint: $H — SE Backend (BE-I startup log)"
fi

# 2. (Optional) Auth round-trip
ADMIN_TOKEN=""
if [ -n "${ADMIN_LOGIN_EMAIL:-}" ] && [ -n "${ADMIN_LOGIN_PASSWORD:-}" ]; then
  ADMIN_TOKEN=$(curl -sf -X POST "$GATEWAY/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_LOGIN_EMAIL\",\"password\":\"$ADMIN_LOGIN_PASSWORD\"}" 2>/dev/null \
    | jq -r '.data.token // .token // empty' 2>/dev/null || true)
  if [ -n "$ADMIN_TOKEN" ]; then
    pass "Auth round-trip OK"
  else
    fail "Auth round-trip failed — SE Backend (login flow broken)"
  fi
else
  echo "  [SKIP] Auth round-trip (ADMIN_LOGIN_EMAIL / PASSWORD not set)"
fi

# 3. List response shape — {data, meta, success}
if [ -n "$ADMIN_TOKEN" ]; then
  SHAPE=$(curl -sf "$GATEWAY$LIST_EP" -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null \
    | jq -c 'keys | sort | join(",")' 2>/dev/null || echo '"parse_error"')
  if [ "$SHAPE" = '"data,meta,success"' ]; then
    pass "List shape: {data, meta, success}"
  else
    fail "List shape wrong: $SHAPE — SE Backend (BE-F response helper)"
  fi
else
  echo "  [SKIP] List shape (no auth token)"
fi

# 4. XSS rejection
XSS_STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST "$GATEWAY$REGISTER_EP" \
  -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(1)</script>","district":"Colombo"}' 2>/dev/null || echo "000")
case "$XSS_STATUS" in
  400|401|403) pass "XSS rejected ($XSS_STATUS)" ;;
  *)           fail "XSS not rejected: $XSS_STATUS — SE Backend (BE-J safeText)" ;;
esac

# 5. Body size limit
BIG_STATUS=$(curl -so /dev/null -w "%{http_code}" -X POST "$GATEWAY$LARGE_BODY_EP" \
  -H "Content-Type: application/json" \
  --data-binary "$(python3 -c 'print("{\"x\":\"" + "A"*102400 + "\"}")' 2>/dev/null \
    || printf '{"x":"%s"}' "$(head -c 102400 /dev/zero | tr '\0' 'A')")" \
  2>/dev/null || echo "000")
if [ "$BIG_STATUS" = "413" ]; then
  pass "Body size limit returns 413"
else
  fail "Body size limit not enforced: $BIG_STATUS — SE Backend (BE-H)"
fi

# 6. Rate-limit headers
RL=$(curl -si "$GATEWAY$LIST_EP" \
  -H "Authorization: Bearer ${ADMIN_TOKEN:-x}" 2>/dev/null \
  | grep -i "x-ratelimit" | head -3 || true)
if [ -n "$RL" ]; then
  pass "Rate-limit headers present"
else
  fail "Rate-limit headers missing — SE Backend (BE-G)"
fi

# 7. Redis FLUSHDB (only if container is set)
if command -v docker >/dev/null 2>&1 && docker inspect "$REDIS" >/dev/null 2>&1; then
  if docker exec "$REDIS" redis-cli --no-auth-warning FLUSHDB >/dev/null 2>&1; then
    pass "Redis FLUSHDB"
  else
    fail "Redis FLUSHDB failed — DevOps (DO-D)"
  fi
else
  echo "  [SKIP] Redis FLUSHDB (container '$REDIS' not running)"
fi

# 8. Enum-drift probe (v7.9.60, QA-S — catches silent 0-rows enum filter bugs)
if [ -f "qa/scripts/enum-drift-check.ts" ] && command -v bun >/dev/null 2>&1; then
  if bun qa/scripts/enum-drift-check.ts; then
    pass "Enum-drift probe (QA-S)"
  else
    fail "Enum-drift probe — see qa/reports/enum-drift-*.md, fix per qa-patterns.md QA-S"
  fi
else
  echo "  [SKIP] Enum-drift probe (qa/scripts/enum-drift-check.ts or bun missing)"
fi


# 9. Test design technique coverage (v7.9.61, QA-T)
if [ -f "qa/scripts/technique-coverage.ts" ] && command -v bun >/dev/null 2>&1; then
  if bun qa/scripts/technique-coverage.ts --strict >/dev/null 2>&1; then
    pass "Technique coverage (QA-T): 10/10"
  else
    fail "Technique coverage gap \u2014 run: bun qa/scripts/technique-coverage.ts"
  fi
else
  echo "  [SKIP] Technique coverage (qa/scripts/technique-coverage.ts missing)"
fi

# 10. API doc coverage (v7.9.63, QA-U) \u2014 every endpoint in docs/api.md needs a TC.
if [ -f "docs/api.md" ] && [ -f "qa/scripts/api-coverage.ts" ] && command -v bun >/dev/null 2>&1; then
  if bun qa/scripts/api-coverage.ts --strict >/dev/null 2>&1; then
    pass "API coverage (QA-U): every endpoint covered, no failed/skipped"
  else
    fail "API coverage gap \u2014 run: bun qa/scripts/api-coverage.ts --report && cat qa/API_COVERAGE.md"
  fi
elif [ ! -f "docs/api.md" ]; then
  echo "  [SKIP] API coverage (no docs/api.md \u2014 not an API project)"
else
  echo "  [SKIP] API coverage (qa/scripts/api-coverage.ts or bun missing)"
fi
echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "=== ALL UNIVERSAL CHECKS PASSED ==="
  echo "    (project-type-specific checks run next, if any)"
else
  echo "=== $FAILED CHECK(S) FAILED — fix per qa-patterns.md QA-M mapping, re-run ==="
  exit 1
fi
