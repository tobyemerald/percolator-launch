#!/usr/bin/env bash
# =============================================================================
# verify-mainnet-deploy.sh — Post-deploy verification for mainnet services
# =============================================================================
# Checks health endpoints and basic functionality for all mainnet services.
#
# Usage:
#   ./scripts/verify-mainnet-deploy.sh
#
# Environment variables (override defaults):
#   API_URL       — API base URL (default: https://percolator-api-mainnet.up.railway.app)
#   KEEPER_URL    — Keeper health URL (default: https://percolator-keeper-mainnet.up.railway.app)
#   INDEXER_URL   — Indexer base URL (default: https://percolator-indexer-mainnet.up.railway.app)
#   FRONTEND_URL  — Frontend URL (default: https://percolatorlaunch.com)
# =============================================================================

set -euo pipefail

API_URL="${API_URL:-https://percolator-api-mainnet.up.railway.app}"
KEEPER_URL="${KEEPER_URL:-https://percolator-keeper-mainnet.up.railway.app}"
INDEXER_URL="${INDEXER_URL:-https://percolator-indexer-mainnet.up.railway.app}"
FRONTEND_URL="${FRONTEND_URL:-https://percolatorlaunch.com}"

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  WARN: $1"; WARN=$((WARN+1)); }

check_http() {
  local name="$1" url="$2" expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expected" ]]; then
    pass "$name — HTTP $status"
  else
    fail "$name — expected $expected, got $status"
  fi
}

check_json_nonempty() {
  local name="$1" url="$2"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "")
  if [[ -z "$body" ]]; then
    fail "$name — empty response"
    return
  fi
  # Check if it's a non-empty JSON array
  local len
  len=$(echo "$body" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")
  if [[ "$len" -gt 0 ]]; then
    pass "$name — $len items"
  else
    fail "$name — response is empty array or not JSON array"
  fi
}

check_health_json() {
  local name="$1" url="$2"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "")
  if [[ -z "$body" ]]; then
    fail "$name — no response"
    return
  fi
  local status
  status=$(echo "$body" | jq -r '.status // .ok // empty' 2>/dev/null || echo "")
  local status_lc
  status_lc=$(echo "$status" | tr '[:upper:]' '[:lower:]')
  if [[ "$status_lc" == "ok" || "$status_lc" == "true" || "$status_lc" == "healthy" || "$status_lc" == "online" || "$status_lc" == "degraded" ]]; then
    pass "$name — status: $status"
  elif [[ -n "$body" ]]; then
    warn "$name — responded but status field unclear: $(echo "$body" | head -c 100)"
  else
    fail "$name — unhealthy"
  fi
}

echo "============================================"
echo "  Percolator Mainnet Deploy Verification"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# --- 1. Frontend ---
echo "1. Frontend ($FRONTEND_URL)"
check_http "Site loads" "$FRONTEND_URL"
echo ""

# --- 2. API Service ---
echo "2. API ($API_URL)"
# /api/health is the primary structured health route; /health is a legacy alias
check_http "API /api/health" "$API_URL/api/health"
check_json_nonempty "API /api/markets returns markets" "$API_URL/api/markets"
echo ""

# --- 3. Keeper Service ---
echo "3. Keeper ($KEEPER_URL)"
check_http "Keeper health" "$KEEPER_URL/health"
check_health_json "Keeper health JSON" "$KEEPER_URL/health"
echo ""

# --- 4. Indexer Service ---
echo "4. Indexer ($INDEXER_URL)"
check_http "Indexer health" "$INDEXER_URL/health"
check_health_json "Indexer health JSON" "$INDEXER_URL/health"
echo ""

# --- 5. WebSocket connectivity (quick test) ---
echo "5. WebSocket"
if command -v websocat &>/dev/null; then
  ws_url="${API_URL/https:/wss:}/ws"
  timeout 5 websocat -1 "$ws_url" </dev/null &>/dev/null && pass "WebSocket connects" || warn "WebSocket connection failed (may need auth)"
else
  warn "websocat not installed — skipping WebSocket test"
fi
echo ""

# --- Summary ---
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "⛔ DEPLOY VERIFICATION FAILED — $FAIL check(s) failed."
  echo "Review errors above and check Railway logs."
  exit 1
fi

if [[ $WARN -gt 0 ]]; then
  echo ""
  echo "⚠️  Deploy OK with warnings. Review above."
  exit 0
fi

echo ""
echo "🎉 All checks passed. Mainnet services are healthy."
exit 0
