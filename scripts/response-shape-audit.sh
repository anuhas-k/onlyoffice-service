#!/usr/bin/env bash
# response-shape-audit.sh — universal {data, meta, success} shape audit.
# Hits every list endpoint and confirms no double-wrap regressions.
# Run before sign-off (Phase 7 gate).
#
# Configuration:
#   GATEWAY_URL                   default http://localhost:3000
#   ADMIN_LOGIN_EMAIL/PASSWORD    REQUIRED
#   LIST_ENDPOINTS                space-separated list of endpoints to audit
#                                 (override per project — defaults are illustrative)

set -uo pipefail
GATEWAY="${GATEWAY_URL:-http://localhost:3000}"
EMAIL="${ADMIN_LOGIN_EMAIL:?ADMIN_LOGIN_EMAIL not set}"
PASSWORD="${ADMIN_LOGIN_PASSWORD:?ADMIN_LOGIN_PASSWORD not set}"
DEFAULT_EPS="/api/v1/users /api/v1/items"
ENDPOINTS=("${LIST_ENDPOINTS:-$DEFAULT_EPS}")
# shellcheck disable=SC2206
ENDPOINTS=(${ENDPOINTS[@]})

ADMIN_TOKEN=$(curl -sf -X POST "$GATEWAY/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null \
  | jq -r '.data.token // .token // empty' 2>/dev/null || true)

[ -z "$ADMIN_TOKEN" ] && { echo "✗ admin login failed"; exit 1; }

FAIL=0
echo "=== Response Shape Audit ==="
for ep in "${ENDPOINTS[@]}"; do
  BODY=$(curl -sf "$GATEWAY$ep" -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "{}")
  KEYS=$(echo "$BODY" | jq -c 'keys | sort | join(",")' 2>/dev/null || echo "parse_error")
  DATA_TYPE=$(echo "$BODY" | jq -r '.data | type' 2>/dev/null || echo "unknown")
  HAS_META=$(echo "$BODY" | jq -r '.meta | type' 2>/dev/null || echo "null")

  if [ "$KEYS" = '"data,meta,success"' ] && [ "$DATA_TYPE" = "array" ] && [ "$HAS_META" != "null" ]; then
    echo "  [PASS] $ep"
  else
    echo "  [FAIL] $ep — keys=$KEYS data=$DATA_TYPE meta=$HAS_META"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "=== Shape audit OK ==="
else
  echo "=== Shape audit FAILED — SE Backend (BE-F response helper) ==="
  exit 1
fi
