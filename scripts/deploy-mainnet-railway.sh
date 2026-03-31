#!/usr/bin/env bash
# =============================================================================
# deploy-mainnet-railway.sh — Deploy mainnet Railway services
# =============================================================================
# Prerequisites:
#   1. Railway CLI installed and authenticated: `railway login`
#   2. All env var values ready (see docs/env/*.env.mainnet.example)
#   3. Supabase service_role key has been ROTATED (critical blocker C1)
#   4. Keeper wallet funded with ≥0.5 SOL
#
# Usage:
#   ./scripts/deploy-mainnet-railway.sh [--dry-run] [--service api|keeper|indexer|all]
# =============================================================================

set -euo pipefail

RAILWAY_PROJECT_ID="b3815507-e4d0-4abc-9913-cbc2a6b553e3"  # used for railway link
DRY_RUN=false
TARGET_SERVICE="all"

# Service names on Railway
API_SERVICE="percolator-api-mainnet"
KEEPER_SERVICE="oracle-keeper-mainnet"
INDEXER_SERVICE="percolator-indexer-mainnet"

usage() {
  echo "Usage: $0 [--dry-run] [--service api|keeper|indexer|all]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --service)
      if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
        echo "ERROR: --service requires a value (api|keeper|indexer|all)"
        usage
      fi
      TARGET_SERVICE="$2"; shift 2 ;;
    *) usage ;;
  esac
done

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }
run() {
  if $DRY_RUN; then
    log "[DRY-RUN] $*"
  else
    log "Running: $*"
    "$@"
  fi
}

# --- Preflight checks ---
log "=== Mainnet Railway Deploy ==="
log "Target: $TARGET_SERVICE | Dry-run: $DRY_RUN"

if ! command -v railway &>/dev/null; then
  echo "ERROR: Railway CLI not found. Install: npm i -g @railway/cli"
  exit 1
fi

# Link to the correct Railway project
run railway link "$RAILWAY_PROJECT_ID"

# Check required env files
check_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: $file not found. Copy from docs/env/ and fill in values."
    exit 1
  fi
  # Check for unfilled placeholders
  if grep -q '<.*>' "$file"; then
    echo "WARNING: $file contains unfilled placeholders (<...>). Review before deploying."
    if ! $DRY_RUN; then
      read -rp "Continue anyway? (y/N) " confirm
      [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
    fi
  fi
}

set_env_vars() {
  local service="$1"
  local env_file="$2"
  check_env_file "$env_file"
  log "Setting env vars for $service from $env_file"

  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    local key="${line%%=*}"
    local value="${line#*=}"
    # Use printf to safely handle values with spaces, equals, or special chars
    run railway variables set "$(printf '%s=%s' "$key" "$value")" --service "$service"
  done < "$env_file"
}

deploy_service() {
  local service="$1"
  log "Deploying $service..."
  run railway up --service "$service" --detach
  log "$service deploy triggered."
}

# --- Deploy API ---
if [[ "$TARGET_SERVICE" == "all" || "$TARGET_SERVICE" == "api" ]]; then
  log "--- API Service ---"
  if [[ -f ".env.mainnet.api" ]]; then
    set_env_vars "$API_SERVICE" ".env.mainnet.api"
  else
    log "No .env.mainnet.api found — skipping env var setup (set manually via Railway dashboard)"
  fi
  deploy_service "$API_SERVICE"
fi

# --- Deploy Keeper ---
if [[ "$TARGET_SERVICE" == "all" || "$TARGET_SERVICE" == "keeper" ]]; then
  log "--- Keeper Service ---"
  if [[ -f ".env.mainnet.keeper" ]]; then
    set_env_vars "$KEEPER_SERVICE" ".env.mainnet.keeper"
  else
    log "No .env.mainnet.keeper found — skipping env var setup"
  fi
  deploy_service "$KEEPER_SERVICE"
fi

# --- Deploy Indexer ---
if [[ "$TARGET_SERVICE" == "all" || "$TARGET_SERVICE" == "indexer" ]]; then
  log "--- Indexer Service ---"
  if [[ -f ".env.mainnet.indexer" ]]; then
    set_env_vars "$INDEXER_SERVICE" ".env.mainnet.indexer"
  else
    log "No .env.mainnet.indexer found — skipping env var setup"
  fi
  deploy_service "$INDEXER_SERVICE"
fi

log "=== Deploy complete. Run scripts/verify-mainnet-deploy.sh to verify. ==="
