#!/usr/bin/env bash
# =============================================================================
# scripts/deploy_supabase.sh
# Full Supabase remote deployment: link → secrets → migrations → functions → verify
#
# Usage:
#   SUPABASE_PROJECT_REF=xxxxxxxxxxxxxxxxxxxx \
#   SUPABASE_DB_PASSWORD=xxx \
#   source .env && bash scripts/deploy_supabase.sh
#
# Requires:
#   - supabase CLI (>= 1.150) installed and authenticated
#   - All env vars from .env / set_secrets.sh
#   - Postgres connection available for migration apply
# =============================================================================
set -euo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"

MIGRATIONS_DIR="supabase/migrations"
FUNCTIONS_DIR="supabase/functions"
MIGRATION_START="0176"
MIGRATION_END="0214"

echo "============================================================"
echo " Monolith FPR — Supabase Remote Deployment"
echo " Project ref : ${SUPABASE_PROJECT_REF}"
echo "============================================================"

# ---------- Step 1: Link project ----------------------------------------------
echo ""
echo "[1/6] Linking Supabase project …"

supabase link \
  --project-ref "${SUPABASE_PROJECT_REF}" \
  --password     "${SUPABASE_DB_PASSWORD}"

echo "  Project linked."

# ---------- Step 2: Set secrets -----------------------------------------------
echo ""
echo "[2/6] Setting secrets …"
bash scripts/set_secrets.sh

# ---------- Step 3: Apply migrations ------------------------------------------
echo ""
echo "[3/6] Applying migrations ${MIGRATION_START}–${MIGRATION_END} …"

# Use supabase db push which handles migration tracking
supabase db push --include-all

echo "  Migrations applied."

# ---------- Step 4: Deploy Edge Functions ------------------------------------
echo ""
echo "[4/6] Deploying Edge Functions …"

for fn_dir in "${FUNCTIONS_DIR}"/*/; do
  fn_name=$(basename "${fn_dir}")
  echo "  Deploying function: ${fn_name} …"
  supabase functions deploy "${fn_name}" \
    --project-ref "${SUPABASE_PROJECT_REF}" \
    --no-verify-jwt
  echo "  ✓ ${fn_name}"
done

# ---------- Step 5: Verify health -------------------------------------------
echo ""
echo "[5/6] Verifying deployment …"

SUPABASE_URL="${SUPABASE_URL:-https://${SUPABASE_PROJECT_REF}.supabase.co}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Health: check v_fpr_notification_status view exists
HEALTH_RESP=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/rest/v1/v_fpr_notification_status?limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

HEALTH_CODE=$(echo "${HEALTH_RESP}" | tail -n 1)

if [ "${HEALTH_CODE}" != "200" ]; then
  echo "  WARNING: health check returned HTTP ${HEALTH_CODE} — verify manually."
else
  echo "  Health check passed (v_fpr_notification_status accessible)."
fi

# Verify budget view
BUDGET_RESP=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/rest/v1/v_fpr_budget_usage?limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

BUDGET_CODE=$(echo "${BUDGET_RESP}" | tail -n 1)
[ "${BUDGET_CODE}" = "200" ] \
  && echo "  Budget ceiling view accessible." \
  || echo "  WARNING: v_fpr_budget_usage returned HTTP ${BUDGET_CODE}"

# ---------- Step 6: Summary --------------------------------------------------
echo ""
echo "[6/6] Deployment summary"
supabase functions list --project-ref "${SUPABASE_PROJECT_REF}" 2>/dev/null || true

echo ""
echo "============================================================"
echo " Deployment complete!"
echo " Supabase URL : ${SUPABASE_URL}"
echo " Dashboard    : https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}"
echo "============================================================"
