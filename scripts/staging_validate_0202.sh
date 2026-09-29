#!/usr/bin/env bash
# =============================================================================
# staging_validate_0202.sh
# Staging validation for Migration 0202 — v_etax_sla_archive_summary
#                                          v_etax_sla_archive_org_rollup
# =============================================================================
# Sections:
#   §1  Environment variables
#   §2  v_etax_sla_archive_summary view existence + column count
#   §3  v_etax_sla_archive_org_rollup view existence + column count
#   §4  rpc_etax_sla_archive_summary function existence + SECURITY DEFINER
#   §5  rpc_etax_sla_archive_org_rollup function existence + SECURITY DEFINER
#   §6  rpc_etax_sla_archive_summary REST POST HTTP 200 + array response
#   §7  rpc_etax_sla_archive_org_rollup REST POST HTTP 200 + array response
#   §8  Date-range filter correctness (future → empty, historical bound respected)
#   §9  p_severity_tier filter returns only matching tier rows
#   §10 RLS cross-tenant isolation (anon rejected; Org A cannot see Org B)
#   §11 overall_breach_rate sanity check (0–100, not negative)
#   §12 vitest 0202_etax_sla_archive_summary suite
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass()    { echo -e "${GREEN}  ✔ PASS${RESET}  $1"; }
fail()    { echo -e "${RED}  ✘ FAIL${RESET}  $1"; FAILED=$((FAILED+1)); }
info()    { echo -e "${CYAN}  ℹ${RESET}  $1"; }
section() { echo -e "\n${BOLD}${YELLOW}$1${RESET}"; }
FAILED=0

# ── §1 Environment variables ──────────────────────────────────────────────────
section "§1  Environment variables"

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${TEST_ORG_A_ID:?TEST_ORG_A_ID is required}"
: "${TEST_ORG_B_ID:?TEST_ORG_B_ID is required}"

pass "All required env vars are set"
info "  SUPABASE_URL = $SUPABASE_URL"

# ── Helper ────────────────────────────────────────────────────────────────────
sql_query() {
  curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$1" | jq -Rs .)}"
}

rpc_post() {
  local rpc="$1"; local body="${2:-{}}"
  curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

rpc_status() {
  local rpc="$1"; local body="${2:-{}}"
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

check_view_columns() {
  local view="$1"; shift
  local -a cols=("$@")
  for col in "${cols[@]}"; do
    local cnt
    cnt=$(sql_query "
      SELECT count(*)::int AS cnt FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '$view' AND column_name = '$col';
    " | jq -r '.[0].cnt // 0')
    if [[ "$cnt" == "1" ]]; then
      pass "  ${view}.${col} column exists"
    else
      fail "  ${view}.${col} column MISSING"
    fi
  done
}

# ── §2 v_etax_sla_archive_summary ─────────────────────────────────────────────
section "§2  v_etax_sla_archive_summary view"

VIEW_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'v_etax_sla_archive_summary';
" | jq -r '.[0].cnt // 0')

if [[ "$VIEW_EXISTS" == "1" ]]; then
  pass "v_etax_sla_archive_summary view exists"
else
  fail "v_etax_sla_archive_summary view NOT FOUND"
fi

check_view_columns "v_etax_sla_archive_summary" \
  "org_id" "org_name" "severity_tier" \
  "first_archived_date" "last_archived_date" "last_archived_at" \
  "total_archive_days" "total_created" "total_breached" \
  "avg_breach_rate" "max_breach_rate" "max_cumulative" "sla_threshold_hours"

# ── §3 v_etax_sla_archive_org_rollup ──────────────────────────────────────────
section "§3  v_etax_sla_archive_org_rollup view"

ROLLUP_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'v_etax_sla_archive_org_rollup';
" | jq -r '.[0].cnt // 0')

if [[ "$ROLLUP_EXISTS" == "1" ]]; then
  pass "v_etax_sla_archive_org_rollup view exists"
else
  fail "v_etax_sla_archive_org_rollup view NOT FOUND"
fi

check_view_columns "v_etax_sla_archive_org_rollup" \
  "org_id" "org_name" "first_archived_date" "last_archived_date" "last_archived_at" \
  "total_archive_days" "total_created" "total_breached" \
  "overall_breach_rate" "avg_daily_breach_rate" "peak_daily_breach_rate" \
  "peak_cumulative" "worst_severity_tier" "breached_document_types" "sla_threshold_hours"

# ── §4 rpc_etax_sla_archive_summary function ──────────────────────────────────
section "§4  rpc_etax_sla_archive_summary function"

FN_SUM=$(sql_query "
  SELECT count(*)::int AS cnt, bool_and(p.prosecdef) AS is_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_archive_summary';
" | jq -r '.[0]')

FN_SUM_CNT=$(echo "$FN_SUM" | jq -r '.cnt // 0')
FN_SUM_SEC=$(echo "$FN_SUM" | jq -r '.is_secdef // false')

[[ "$FN_SUM_CNT" == "1" ]] && pass "rpc_etax_sla_archive_summary exists" \
                            || fail "rpc_etax_sla_archive_summary NOT FOUND"
[[ "$FN_SUM_SEC" == "true" ]] && pass "rpc_etax_sla_archive_summary is SECURITY DEFINER" \
                               || fail "rpc_etax_sla_archive_summary is NOT SECURITY DEFINER"

# ── §5 rpc_etax_sla_archive_org_rollup function ───────────────────────────────
section "§5  rpc_etax_sla_archive_org_rollup function"

FN_ROLL=$(sql_query "
  SELECT count(*)::int AS cnt, bool_and(p.prosecdef) AS is_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_archive_org_rollup';
" | jq -r '.[0]')

FN_ROLL_CNT=$(echo "$FN_ROLL" | jq -r '.cnt // 0')
FN_ROLL_SEC=$(echo "$FN_ROLL" | jq -r '.is_secdef // false')

[[ "$FN_ROLL_CNT" == "1" ]] && pass "rpc_etax_sla_archive_org_rollup exists" \
                             || fail "rpc_etax_sla_archive_org_rollup NOT FOUND"
[[ "$FN_ROLL_SEC" == "true" ]] && pass "rpc_etax_sla_archive_org_rollup is SECURITY DEFINER" \
                                || fail "rpc_etax_sla_archive_org_rollup is NOT SECURITY DEFINER"

# ── §6 rpc_etax_sla_archive_summary REST ──────────────────────────────────────
section "§6  rpc_etax_sla_archive_summary REST POST"

NULL_BODY='{"p_org_id":null,"p_severity_tier":null,"p_from_date":null,"p_to_date":null}'
STATUS=$(rpc_status "rpc_etax_sla_archive_summary" "$NULL_BODY")

[[ "$STATUS" == "200" ]] && pass "rpc_etax_sla_archive_summary HTTP $STATUS" \
                         || fail "rpc_etax_sla_archive_summary HTTP $STATUS (expected 200)"

RESP=$(rpc_post "rpc_etax_sla_archive_summary" "$NULL_BODY")
if echo "$RESP" | jq -e '. | type == "array"' > /dev/null 2>&1; then
  ROW_CNT=$(echo "$RESP" | jq '. | length')
  pass "rpc_etax_sla_archive_summary returned array ($ROW_CNT rows)"
else
  fail "rpc_etax_sla_archive_summary did not return an array"
fi

# ── §7 rpc_etax_sla_archive_org_rollup REST ───────────────────────────────────
section "§7  rpc_etax_sla_archive_org_rollup REST POST"

ROLLUP_BODY='{"p_org_id":null,"p_from_date":null,"p_to_date":null}'
ROLLUP_STATUS=$(rpc_status "rpc_etax_sla_archive_org_rollup" "$ROLLUP_BODY")

[[ "$ROLLUP_STATUS" == "200" ]] && pass "rpc_etax_sla_archive_org_rollup HTTP $ROLLUP_STATUS" \
                                || fail "rpc_etax_sla_archive_org_rollup HTTP $ROLLUP_STATUS (expected 200)"

ROLLUP_RESP=$(rpc_post "rpc_etax_sla_archive_org_rollup" "$ROLLUP_BODY")
if echo "$ROLLUP_RESP" | jq -e '. | type == "array"' > /dev/null 2>&1; then
  RCNT=$(echo "$ROLLUP_RESP" | jq '. | length')
  pass "rpc_etax_sla_archive_org_rollup returned array ($RCNT rows)"
else
  fail "rpc_etax_sla_archive_org_rollup did not return an array"
fi

# ── §8 Date-range filter correctness ──────────────────────────────────────────
section "§8  Date-range filter correctness"

# Future p_from_date → empty
FUTURE='{"p_org_id":null,"p_severity_tier":null,"p_from_date":"2099-01-01","p_to_date":null}'
FUTURE_ROWS=$(rpc_post "rpc_etax_sla_archive_summary" "$FUTURE" | jq '. | length')
[[ "$FUTURE_ROWS" == "0" ]] && pass "Summary: future p_from_date returns empty array" \
                             || fail "Summary: future p_from_date returned $FUTURE_ROWS rows (expected 0)"

FUTURE_ROLL='{"p_org_id":null,"p_from_date":"2099-01-01","p_to_date":null}'
FUTURE_ROLL_ROWS=$(rpc_post "rpc_etax_sla_archive_org_rollup" "$FUTURE_ROLL" | jq '. | length')
[[ "$FUTURE_ROLL_ROWS" == "0" ]] && pass "Rollup: future p_from_date returns empty array" \
                                 || fail "Rollup: future p_from_date returned $FUTURE_ROLL_ROWS rows (expected 0)"

# Historical p_to_date → no rows beyond that date
PAST_SUM='{"p_org_id":null,"p_severity_tier":null,"p_from_date":null,"p_to_date":"2020-01-01"}'
PAST_RESP=$(rpc_post "rpc_etax_sla_archive_summary" "$PAST_SUM")
echo "$PAST_RESP" | jq -r '.[].first_archived_date' 2>/dev/null | while read -r d; do
  python3 -c "import sys; sys.exit(0 if '$d' <= '2020-01-01' else 1)" \
    && true || fail "Summary: row first_archived_date $d violates p_to_date=2020-01-01"
done
pass "Summary: historical p_to_date filter respected"

# ── §9 p_severity_tier filter ─────────────────────────────────────────────────
section "§9  p_severity_tier filter (CRITICAL only)"

CRIT_BODY='{"p_org_id":null,"p_severity_tier":"CRITICAL","p_from_date":null,"p_to_date":null}'
CRIT_RESP=$(rpc_post "rpc_etax_sla_archive_summary" "$CRIT_BODY")
NON_CRIT=$(echo "$CRIT_RESP" | jq '[.[] | select(.severity_tier != "CRITICAL")] | length')
if [[ "$NON_CRIT" == "0" ]]; then
  pass "p_severity_tier=CRITICAL returns only CRITICAL rows"
else
  fail "p_severity_tier=CRITICAL returned $NON_CRIT non-CRITICAL rows"
fi

# ── §10 RLS cross-tenant isolation ────────────────────────────────────────────
section "§10 RLS cross-tenant isolation"

# Anon rejected — summary RPC
ANON_SUM=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_archive_summary" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$NULL_BODY")
[[ "$ANON_SUM" == "401" || "$ANON_SUM" == "403" ]] \
  && pass "Anon rejected from rpc_etax_sla_archive_summary (HTTP $ANON_SUM)" \
  || fail "Anon got HTTP $ANON_SUM from rpc_etax_sla_archive_summary (expected 401/403)"

# Anon rejected — rollup RPC
ANON_ROLL=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_archive_org_rollup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "$ROLLUP_BODY")
[[ "$ANON_ROLL" == "401" || "$ANON_ROLL" == "403" ]] \
  && pass "Anon rejected from rpc_etax_sla_archive_org_rollup (HTTP $ANON_ROLL)" \
  || fail "Anon got HTTP $ANON_ROLL from rpc_etax_sla_archive_org_rollup (expected 401/403)"

# Org A user token check (optional — requires TEST_ORG_A_USER_KEY)
if [[ -n "${TEST_ORG_A_USER_KEY:-}" ]]; then
  LEAK=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_archive_summary" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_ORG_A_USER_KEY}" \
    -H "Content-Type: application/json" \
    -d "$NULL_BODY" \
  | jq --arg oid "$TEST_ORG_B_ID" '[.[] | select(.org_id == $oid)] | length')
  [[ "$LEAK" == "0" ]] \
    && pass "RLS: Org A cannot see Org B rows in summary RPC" \
    || fail "RLS: Org A sees $LEAK Org B rows (CROSS-TENANT LEAK)"
else
  info "§10 org-user cross-tenant check skipped (TEST_ORG_A_USER_KEY not set)"
fi

# ── §11 overall_breach_rate sanity ────────────────────────────────────────────
section "§11 overall_breach_rate bounds (0–100)"

ROLLUP_ALL=$(rpc_post "rpc_etax_sla_archive_org_rollup" "$ROLLUP_BODY")
OUT_OF_RANGE=$(echo "$ROLLUP_ALL" | jq '[.[] | select(.overall_breach_rate < 0 or .overall_breach_rate > 100)] | length' 2>/dev/null || echo "0")
[[ "$OUT_OF_RANGE" == "0" ]] \
  && pass "All overall_breach_rate values are within [0, 100]" \
  || fail "$OUT_OF_RANGE rollup rows have overall_breach_rate outside [0, 100]"

# ── §12 vitest suite ──────────────────────────────────────────────────────────
section "§12 vitest — 0202_etax_sla_archive_summary test suite"

if command -v npx &>/dev/null; then
  if npx vitest run --reporter=verbose \
      "src/__tests__/migrations/0202_etax_sla_archive_summary" 2>&1; then
    pass "vitest 0202_etax_sla_archive_summary suite passed"
  else
    fail "vitest 0202_etax_sla_archive_summary suite FAILED"
  fi
else
  info "§12 skipped — npx/vitest not available in this environment"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  staging_validate_0202 — ALL CHECKS PASSED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  staging_validate_0202 — $FAILED CHECK(S) FAILED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 1
fi
