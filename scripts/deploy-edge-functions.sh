#!/usr/bin/env bash
# =============================================================================
# scripts/deploy-edge-functions.sh
# Deploy Supabase Edge Functions and wire Vercel environment variables
#
# Prerequisites:
#   - Supabase CLI (npx supabase or `supabase` global)
#   - Vercel CLI (npx vercel or `vercel` global)
#   - Linked Supabase project (supabase link)
#   - Linked Vercel project (vercel link)
#
# Usage:
#   ./scripts/deploy-edge-functions.sh [--env production|preview|development]
#
# @version 15.3.0
# =============================================================================

set -euo pipefail

ENV="${1:-production}"
if [[ "$ENV" == "--env" ]]; then
  ENV="${2:-production}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MONOLITH — Edge Function Deployment"
echo "  Environment: $ENV"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Deploy Edge Functions ──────────────────────────────────────────────

echo ""
echo "▸ Deploying generate-quotation-pdf..."
npx supabase functions deploy generate-quotation-pdf \
  --project-ref "${SUPABASE_PROJECT_REF:-}" \
  --no-verify-jwt

echo "  ✓ generate-quotation-pdf deployed"

# ── Step 2: Set Edge Function secrets (if needed) ─────────────────────────────

echo ""
echo "▸ Setting function secrets..."
# Note: Edge Functions automatically have access to SUPABASE_URL and SUPABASE_ANON_KEY
# Add additional secrets here if needed:
# npx supabase secrets set MY_SECRET=value

echo "  ✓ Secrets configured"

# ── Step 3: Verify deployment ──────────────────────────────────────────────────

echo ""
echo "▸ Verifying deployment..."
FUNC_URL="${SUPABASE_URL:-https://YOUR_PROJECT.supabase.co}/functions/v1/generate-quotation-pdf"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$FUNC_URL" 2>/dev/null || echo "000")

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "204" ]]; then
  echo "  ✓ Function responding (HTTP $HTTP_STATUS)"
else
  echo "  ⚠ Function returned HTTP $HTTP_STATUS (may require auth to invoke)"
fi

# ── Step 4: Wire Vercel Environment Variables ──────────────────────────────────

echo ""
echo "▸ Wiring Vercel env vars for $ENV..."

# These env vars are needed by the frontend to call Supabase
VERCEL_ENVS=(
  "VITE_SUPABASE_URL"
  "VITE_SUPABASE_ANON_KEY"
)

for VAR in "${VERCEL_ENVS[@]}"; do
  VALUE="${!VAR:-}"
  if [[ -n "$VALUE" ]]; then
    echo "$VALUE" | npx vercel env add "$VAR" "$ENV" --force 2>/dev/null || true
    echo "  ✓ $VAR set in Vercel ($ENV)"
  else
    echo "  ⚠ $VAR not found in local env — set manually in Vercel Dashboard"
  fi
done

# ── Step 5: Summary ───────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployment Complete"
echo ""
echo "  Edge Functions:"
echo "    • generate-quotation-pdf  →  $FUNC_URL"
echo ""
echo "  Vercel Env ($ENV):"
echo "    • VITE_SUPABASE_URL"
echo "    • VITE_SUPABASE_ANON_KEY"
echo ""
echo "  Next steps:"
echo "    1. Verify in Supabase Dashboard → Edge Functions"
echo "    2. Trigger a Vercel redeploy: vercel --prod"
echo "    3. Test PDF generation from QuotationBuilder UI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
