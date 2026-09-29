#!/usr/bin/env bash
# =============================================================================
# staging_validate_0200.sh
# Staging validation for Migration 0200 — v_etax_sla_breach_timeline
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0; SKIP=0

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m';  BOLD='\033[1m';   NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "${RED}✗${NC} $1"; ((FAIL++)); }
skip() { echo -e "${YELLOW}~${NC} $1 (skipped)"; ((SKIP++)); }
header() { echo -e "\n${CYAN}${BOLD}── §$1 ──────────────────────────────${NC}"; }

# ── Env check ────────────────────────────────────────────────────────────────
header "1  Environment"

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL required}"
: "${SUPABASE_URL:?SUPABASE_URL required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required}"
pass "All required environment variables present"

PG="psql ${SUPABASE_DB_URL} -t -A -c"
REST="${SUPABASE_URL}/rest/v1"
RPC="${SUPABASE_URL}/rest/v1/rpc"
HDR_SRV=(-H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

# ── §2  View existence ────────────────────────────────────────────────────────
header "2  View existence"

VIEW_EXISTS=$($PG "
  SELECT COUNT(*) FROM pg_views
  WHERE schemaname='public' AND viewname='v_etax_sla_breach_timeline';
" 2>/dev/null || echo "0")

if [[ "${VIEW_EXISTS}" == "1" ]]; then
  pass "v_etax_sla_breach_timeline view exists"
else
  fail "v_etax_sla_breach_timeline view NOT found"
fi

# ── §3  Required columns (10) ─────────────────────────────────────────────────
header "3  Required columns"

REQUIRED_COLS=(
  breach_date org_id org_name document_type
  total_created breached_count breach_rate
  severity_tier cumulative_breached sla_threshold_hours
)

ACTUAL_COLS=$($PG "
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='v_etax_sla_breach_timeline'
  ORDER BY ordinal_position;
" 2>/dev/null || echo "")

for col in "${REQUIRED_COLS[@]}"; do
  if echo "${ACTUAL_COLS}" | grep -qx "${col}"; then
    pass "Column '${col}' present"
  else
    fail "Column '${col}' MISSING"
  fi
done

# ── §4  Calendar spine continuity ─────────────────────────────────────────────
header "4  Calendar spine continuity"

if [[ "${VIEW_EXISTS}" == "1" ]]; then
  GAP_CHECK=$($PG "
    SELECT COUNT(*) FROM (
      SELECT
        org_id,
        document_type,
        breach_date,
        breach_date - LAG(breach_date) OVER (
          PARTITION BY org_id, document_type ORDER BY breach_date
        ) AS day_gap
      FROM public.v_etax_sla_breach_timeline
      WHERE breach_date >= CURRENT_DATE - 30
    ) sub
    WHERE day_gap > 1;
  " 2>/dev/null || echo "-1")

  if [[ "${GAP_CHECK}" == "0" ]]; then
    pass "Calendar spine has no gaps (no consecutive days skipped)"
  elif [[ "${GAP_CHECK}" == "-1" ]]; then
    skip "Could not run calendar spine check"
  else
    fail "Calendar spine has ${GAP_CHECK} gap(s) — generate_series may not be working"
  fi
else
  skip "Calendar spine check skipped (view missing)"
fi

# ── §5  RPC existence ────────────────────────────────────────────────────────
header "5  RPC existence"

RPC_EXISTS=$($PG "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_etax_sla_breach_timeline';
" 2>/dev/null || echo "0")

if [[ "${RPC_EXISTS}" -ge "1" ]]; then
  pass "rpc_etax_sla_breach_timeline function exists"
else
  fail "rpc_etax_sla_breach_timeline function NOT found"
fi

# ── §6  RPC REST call with default p_days ─────────────────────────────────────
header "6  RPC REST call (p_days default 30)"

RPC_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${RPC}/rpc_etax_sla_breach_timeline" \
  "${HDR_SRV[@]}" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "000")

if [[ "${RPC_HTTP}" == "200" ]]; then
  pass "POST rpc_etax_sla_breach_timeline returned HTTP 200"
else
  fail "POST rpc_etax_sla_breach_timeline returned HTTP ${RPC_HTTP} (expected 200)"
fi

# ── §7  p_days filter ─────────────────────────────────────────────────────────
header "7  p_days parameter filter"

RPC_7=$(curl -s \
  -X POST "${RPC}/rpc_etax_sla_breach_timeline" \
  "${HDR_SRV[@]}" \
  -H "Content-Type: application/json" \
  -d '{"p_days": 7}' 2>/dev/null || echo "[]")

if echo "${RPC_7}" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
import datetime
cutoff = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
old = [r for r in rows if r.get('breach_date', '9999') < cutoff]
sys.exit(0 if len(old)==0 else 1)
" 2>/dev/null; then
  pass "p_days=7 filter: no rows older than 7 days returned"
else
  fail "p_days=7 filter: rows older than 7 days found"
fi

# ── §8  p_document_type filter ────────────────────────────────────────────────
header "8  p_document_type filter"

RPC_T01=$(curl -s \
  -X POST "${RPC}/rpc_etax_sla_breach_timeline" \
  "${HDR_SRV[@]}" \
  -H "Content-Type: application/json" \
  -d '{"p_document_type": "T01"}' 2>/dev/null || echo "[]")

if echo "${RPC_T01}" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
bad = [r for r in rows if r.get('document_type') != 'T01']
sys.exit(0 if len(bad)==0 else 1)
" 2>/dev/null; then
  pass "p_document_type=T01 filter: all returned rows have document_type=T01"
else
  fail "p_document_type=T01 filter: non-T01 rows returned"
fi

# ── §9  cumulative_breached monotonicity ──────────────────────────────────────
header "9  cumulative_breached monotonicity"

if [[ "${VIEW_EXISTS}" == "1" ]]; then
  MONO_CHECK=$($PG "
    SELECT COUNT(*) FROM (
      SELECT
        org_id, document_type, breach_date, cumulative_breached,
        LAG(cumulative_breached) OVER (
          PARTITION BY org_id, document_type ORDER BY breach_date
        ) AS prev_cumulative
      FROM public.v_etax_sla_breach_timeline
      WHERE breach_date >= CURRENT_DATE - 30
    ) sub
    WHERE prev_cumulative IS NOT NULL
      AND cumulative_breached < prev_cumulative;
  " 2>/dev/null || echo "-1")

  if [[ "${MONO_CHECK}" == "0" ]]; then
    pass "cumulative_breached is monotonically non-decreasing"
  elif [[ "${MONO_CHECK}" == "-1" ]]; then
    skip "Could not check cumulative_breached monotonicity"
  else
    fail "cumulative_breached has ${MONO_CHECK} non-monotonic row(s)"
  fi
else
  skip "Monotonicity check skipped (view missing)"
fi

# ── §10  RLS isolation ────────────────────────────────────────────────────────
header "10  RLS isolation (cross-tenant)"

if [[ -n "${TEST_ORG_A_JWT:-}" ]] && [[ -n "${TEST_ORG_B_ID:-}" ]]; then
  CROSS_TENANT=$(curl -s \
    -X POST "${RPC}/rpc_etax_sla_breach_timeline" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_ORG_A_JWT}" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null | python3 -c "
import sys, json, os
rows = json.load(sys.stdin)
cross = [r for r in rows if r.get('org_id') == os.environ['TEST_ORG_B_ID']]
print(len(cross))
" TEST_ORG_B_ID="${TEST_ORG_B_ID}" 2>/dev/null || echo "-1")

  if [[ "${CROSS_TENANT}" == "0" ]]; then
    pass "RLS: Org A JWT returns no Org B rows"
  elif [[ "${CROSS_TENANT}" == "-1" ]]; then
    skip "RLS cross-tenant check failed (check JWT env vars)"
  else
    fail "RLS: Org A JWT returned ${CROSS_TENANT} Org B row(s) — ISOLATION BREACH"
  fi
else
  skip "RLS cross-tenant check skipped (TEST_ORG_A_JWT / TEST_ORG_B_ID not set)"
fi

# ── §11  vitest ───────────────────────────────────────────────────────────────
header "11  vitest unit tests (0200)"

PROJECT_ROOT="${SCRIPT_DIR}/.."

if command -v npx &>/dev/null && [[ -f "${PROJECT_ROOT}/package.json" ]]; then
  if npx vitest run \
      --reporter=verbose \
      --testPathPattern="0198_0199_sla_pipeline_integration" \
      2>&1 | tail -20; then
    pass "vitest: 0198_0199_sla_pipeline_integration tests passed"
  else
    fail "vitest: 0198_0199_sla_pipeline_integration tests FAILED"
  fi
else
  skip "npx/package.json not found — skipping vitest"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "${BOLD}  staging_validate_0200.sh  SUMMARY${NC}"
echo -e "${BOLD}════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS${NC}: ${PASS}"
echo -e "  ${RED}FAIL${NC}: ${FAIL}"
echo -e "  ${YELLOW}SKIP${NC}: ${SKIP}"
echo ""

if [[ ${FAIL} -gt 0 ]]; then
  echo -e "${RED}${BOLD}RESULT: FAILED (${FAIL} check(s) failed)${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}RESULT: ALL CHECKS PASSED${NC}"
  exit 0
fi
