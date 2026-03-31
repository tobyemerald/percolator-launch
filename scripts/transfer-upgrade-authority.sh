#!/usr/bin/env bash
# transfer-upgrade-authority.sh
# Transfer Percolator program upgrade authority to a Squads multisig vault.
# See docs/SQUADS-SETUP.md for full instructions.
#
# Usage:
#   bash scripts/transfer-upgrade-authority.sh --network devnet [--dry-run]
#   bash scripts/transfer-upgrade-authority.sh --network mainnet --new-authority <VAULT_PDA> [--dry-run]
#
# Requirements: solana CLI in PATH

set -euo pipefail

# ────────────────────────────────────────────────────────────
# Defaults
# ────────────────────────────────────────────────────────────
NETWORK=""
NEW_AUTHORITY=""
DRY_RUN=false
VERBOSE=false

# ────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────
MAINNET_PROGRAM="ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv"
MAINNET_KEYPAIR="${HOME}/.percolator-mainnet/keys/deploy-authority.json"

DEVNET_PROGRAM="g9msRSV3sJmmE3r5Twn9HuBsxzuuRGTjKCVTKudm9in"
DEVNET_KEYPAIR="${HOME}/.config/solana/percolator-upgrade-authority.json"

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────
info()    { echo "[INFO]    $*"; }
success() { echo "[SUCCESS] $*"; }
warn()    { echo "[WARN]    $*" >&2; }
error()   { echo "[ERROR]   $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage:
  $0 --network <devnet|mainnet> [--new-authority <VAULT_PDA>] [--dry-run] [--verbose]

Options:
  --network          devnet or mainnet (required)
  --new-authority    Squads vault PDA to transfer authority TO (required for mainnet;
                     for devnet you can pass one or it will prompt)
  --dry-run          Show what would happen without submitting any transaction
  --verbose          Extra output
  -h, --help         Show this message

Examples:
  # Devnet test (dry run)
  bash scripts/transfer-upgrade-authority.sh --network devnet --dry-run

  # Mainnet live (will prompt for confirmation)
  bash scripts/transfer-upgrade-authority.sh \\
    --network mainnet \\
    --new-authority <SQUADS_VAULT_PDA>
EOF
  exit 0
}

# ────────────────────────────────────────────────────────────
# Parse args
# ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)         NETWORK="$2";        shift 2 ;;
    --new-authority)   NEW_AUTHORITY="$2";  shift 2 ;;
    --dry-run)         DRY_RUN=true;        shift ;;
    --verbose)         VERBOSE=true;        shift ;;
    -h|--help)         usage ;;
    *) error "Unknown argument: $1" ;;
  esac
done

[[ -z "$NETWORK" ]] && error "--network is required (devnet|mainnet)"
[[ "$NETWORK" != "devnet" && "$NETWORK" != "mainnet" ]] && error "--network must be devnet or mainnet"

# ────────────────────────────────────────────────────────────
# Set network-specific vars
# ────────────────────────────────────────────────────────────
if [[ "$NETWORK" == "mainnet" ]]; then
  PROGRAM_ID="$MAINNET_PROGRAM"
  KEYPAIR="$MAINNET_KEYPAIR"
  RPC_URL="mainnet-beta"
  EXPLORER_CLUSTER=""
else
  PROGRAM_ID="$DEVNET_PROGRAM"
  KEYPAIR="$DEVNET_KEYPAIR"
  RPC_URL="devnet"
  EXPLORER_CLUSTER="?cluster=devnet"
fi

# ────────────────────────────────────────────────────────────
# Preflight checks
# ────────────────────────────────────────────────────────────
info "Preflight checks..."

if ! command -v solana &>/dev/null; then
  error "solana CLI not found. Install: https://docs.solana.com/cli/install-solana-cli-tools"
fi
info "solana CLI: $(solana --version)"

if [[ ! -f "$KEYPAIR" ]]; then
  error "Keypair not found: $KEYPAIR"
fi

CURRENT_AUTH=$(solana address --keypair "$KEYPAIR" 2>/dev/null) || error "Failed to read keypair: $KEYPAIR"
info "Current authority keypair: $CURRENT_AUTH"

info "Fetching on-chain program info..."
PROGRAM_INFO=$(solana program show "$PROGRAM_ID" --url "$RPC_URL" 2>/dev/null) || error "Failed to fetch program info for $PROGRAM_ID on $RPC_URL"
if $VERBOSE; then echo "$PROGRAM_INFO"; fi

ONCHAIN_AUTH=$(echo "$PROGRAM_INFO" | grep -E "^Authority:|^Upgrade Authority:" | awk '{print $NF}' || true)
if [[ -z "$ONCHAIN_AUTH" ]]; then
  error "Could not parse authority from program info. Run: solana program show $PROGRAM_ID --url $RPC_URL"
fi
info "On-chain upgrade authority:  $ONCHAIN_AUTH"

if [[ "$CURRENT_AUTH" != "$ONCHAIN_AUTH" ]]; then
  error "Keypair pubkey ($CURRENT_AUTH) does NOT match on-chain upgrade authority ($ONCHAIN_AUTH). Wrong keypair?"
fi
info "Keypair matches on-chain authority ✓"

# ────────────────────────────────────────────────────────────
# Resolve new authority
# ────────────────────────────────────────────────────────────
if [[ -z "$NEW_AUTHORITY" ]]; then
  if [[ "$NETWORK" == "mainnet" ]]; then
    error "--new-authority is required for mainnet. Get the Squads Vault 0 PDA from docs/SQUADS-SETUP.md Step 2."
  else
    echo ""
    read -rp "Enter new upgrade authority (Squads Vault 0 PDA): " NEW_AUTHORITY
    [[ -z "$NEW_AUTHORITY" ]] && error "New authority cannot be empty."
  fi
fi

info "New authority (target):      $NEW_AUTHORITY"

if ! echo "$NEW_AUTHORITY" | grep -qE '^[1-9A-HJ-NP-Za-km-z]{32,44}$'; then
  error "New authority does not look like a valid Solana public key: $NEW_AUTHORITY"
fi

if [[ "$NEW_AUTHORITY" == "$CURRENT_AUTH" ]]; then
  warn "New authority is same as current. Nothing to do."
  exit 0
fi

# ────────────────────────────────────────────────────────────
# Mainnet confirmation prompt
# ────────────────────────────────────────────────────────────
if [[ "$NETWORK" == "mainnet" && "$DRY_RUN" == "false" ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║              ⚠️  MAINNET — IRREVERSIBLE ACTION  ⚠️            ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  Program:        $PROGRAM_ID  ║"
  echo "║  FROM authority: $ONCHAIN_AUTH           ║"
  echo "║  TO authority:   $NEW_AUTHORITY            ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  After this, ALL program upgrades require Squads approval.  ║"
  echo "║  You CANNOT upgrade with just the deploy keypair anymore.   ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  read -rp "Type YES to confirm: " CONFIRM
  if [[ "$CONFIRM" != "YES" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# ────────────────────────────────────────────────────────────
# Execute (or dry-run)
# ────────────────────────────────────────────────────────────
CMD=(
  solana program set-upgrade-authority "$PROGRAM_ID"
  --new-upgrade-authority "$NEW_AUTHORITY"
  --keypair "$KEYPAIR"
  --url "$RPC_URL"
  --skip-new-upgrade-authority-signer-check
)

if $VERBOSE; then
  info "Command: ${CMD[*]}"
fi

if $DRY_RUN; then
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  DRY RUN — No transaction submitted"
  echo "  Would run:"
  echo "    ${CMD[*]}"
  echo "════════════════════════════════════════════════════"
  exit 0
fi

info "Submitting transaction..."
TX_OUTPUT=$("${CMD[@]}" 2>&1) || {
  error "Transaction failed:\n$TX_OUTPUT"
}
echo "$TX_OUTPUT"

SIG=$(echo "$TX_OUTPUT" | grep -oE '[1-9A-HJ-NP-Za-km-z]{87,88}' | head -1 || true)

# ────────────────────────────────────────────────────────────
# Verify on-chain
# ────────────────────────────────────────────────────────────
info "Verifying on-chain authority..."
sleep 3

VERIFY_INFO=$(solana program show "$PROGRAM_ID" --url "$RPC_URL" 2>/dev/null) || warn "Could not fetch program info for verification"
NEW_ONCHAIN_AUTH=$(echo "$VERIFY_INFO" | grep -E "^Authority:|^Upgrade Authority:" | awk '{print $NF}' || true)

if [[ "$NEW_ONCHAIN_AUTH" == "$NEW_AUTHORITY" ]]; then
  success "Upgrade authority transferred successfully!"
  info "Final authority on-chain: $NEW_ONCHAIN_AUTH ✓"
else
  warn "On-chain authority is now: $NEW_ONCHAIN_AUTH"
  warn "Expected: $NEW_AUTHORITY"
  warn "Transaction may still be confirming — verify manually:"
  warn "  solana program show $PROGRAM_ID --url $RPC_URL"
fi

if [[ -n "$SIG" ]]; then
  info "Transaction: https://explorer.solana.com/tx/${SIG}${EXPLORER_CLUSTER}"
fi
info "Program explorer: https://explorer.solana.com/address/${PROGRAM_ID}${EXPLORER_CLUSTER}"

echo ""
success "Done. See docs/SQUADS-SETUP.md Step 5 for how to approve future upgrades via Squads."
