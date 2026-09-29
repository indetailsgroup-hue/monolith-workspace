#!/usr/bin/env bash
# =============================================================================
# scripts/set_secrets.sh
# Sets all Supabase Edge Function secrets via `supabase secrets set`.
# Reads values from environment variables (loaded from .env file if present).
#
# Usage:
#   source .env && bash scripts/set_secrets.sh
#   # OR
#   bash scripts/set_secrets.sh  (if env vars already exported)
#
# Requires: supabase CLI, authenticated (`supabase login`) and linked project.
# =============================================================================
set -euo pipefail

echo "============================================================"
echo " Monolith FPR — Setting Supabase Secrets"
echo "============================================================"

# Optional: load .env if present and not already loaded
if [ -f ".env" ] && [ "${SUPABASE_SECRETS_LOADED:-}" != "1" ]; then
  echo "  Loading .env …"
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | grep '=' | xargs)
  export SUPABASE_SECRETS_LOADED=1
fi

# Validate required secrets
REQUIRED_VARS=(
  LINE_CHANNEL_SECRET
  LINE_CHANNEL_ACCESS_TOKEN
  LINE_OA_CHANNEL_SECRET
  LINE_OA_CHANNEL_ACCESS_TOKEN
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_ANON_KEY
  JWT_SECRET
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: Required env var ${var} is not set."
    exit 1
  fi
done

echo "[1/2] Setting secrets …"

supabase secrets set \
  LINE_CHANNEL_SECRET="${LINE_CHANNEL_SECRET}" \
  LINE_CHANNEL_ACCESS_TOKEN="${LINE_CHANNEL_ACCESS_TOKEN}" \
  LINE_OA_CHANNEL_SECRET="${LINE_OA_CHANNEL_SECRET}" \
  LINE_OA_CHANNEL_ACCESS_TOKEN="${LINE_OA_CHANNEL_ACCESS_TOKEN}" \
  SUPABASE_URL="${SUPABASE_URL}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}" \
  JWT_SECRET="${JWT_SECRET}" \
  RATE_LIMIT_PER_MIN="${RATE_LIMIT_PER_MIN:-60}" \
  FPR_MAX_PHOTO_REFS="${FPR_MAX_PHOTO_REFS:-10}" \
  FPR_AUTO_UNCANCEL_DAYS="${FPR_AUTO_UNCANCEL_DAYS:-7}" \
  DEAD_LETTER_ALERT_THRESHOLD="${DEAD_LETTER_ALERT_THRESHOLD:-5}"

echo "  Secrets set successfully."

echo "[2/2] Verifying secrets list …"
supabase secrets list

echo ""
echo "============================================================"
echo " Secrets setup complete!"
echo "============================================================"
