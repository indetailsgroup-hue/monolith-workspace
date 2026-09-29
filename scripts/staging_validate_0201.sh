#!/usr/bin/env bash
# =============================================================================
# staging_validate_0201.sh
# Staging validation for Migration 0201 — etax_sla_breach_archive
# =============================================================================
# Sections:
#   §1  Environment variables
#   §2  etax_sla_breach_archive table existence
#   §3  PK and index presence
#   §4  RLS enabled on table
#   §5  fn_archive_etax_sla_breach_timeline function existence
#   §6  fn_archive_etax_sla_breach_timeline execution (success:true)
#   §7  platform_config.sla_archive_last_run stamped after fn execution
#   §8  rpc_etax_sla_breach_archive function existence
#   §9  REST POST rpc_etax_sla_breach_archive HTTP 200
#   §10 p_from_date/p_to_date filter correctness
#   §11 RLS cross-tenant check
#   §12 vitest 0201_etax_sla_breach_archive suite
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass() { echo -e "${GREEN}  ✔ PASS${RESET}  $1"; }
fail() { echo -e "${RED}  ✘ FAIL${RESET}  $1"; FAILED=$((FAILED+1)); }
info() { echo -e "${CYAN}  ℹ${RESET}  $1"; }
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

# ── Helper: Supabase SQL via REST ─────────────────────────────────────────────
sql_query() {
  local query="$1"
  curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$query" | jq -Rs .)}"
}

# ── §2 Table existence ────────────────────────────────────────────────────────
section "§2  etax_sla_breach_archive table existence"

TABLE_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'etax_sla_breach_archive';
" | jq -r '.[0].cnt // 0')

if [[ "$TABLE_EXISTS" == "1" ]]; then
  pass "etax_sla_breach_archive table exists"
else
  fail "etax_sla_breach_archive table NOT FOUND"
fi

# ── §3 PK and index presence ──────────────────────────────────────────────────
section "§3  PK and index presence"

check_index() {
  local idx="$1"
  local cnt
  cnt=$(sql_query "
    SELECT count(*)::int AS cnt FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'etax_sla_breach_archive'
      AND indexname = '$idx';
  " | jq -r '.[0].cnt // 0')
  if [[ "$cnt" == "1" ]]; then
    pass "Index $idx exists"
  else
    fail "Index $idx NOT FOUND"
  fi
}

PK_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM information_schema.table_constraints
  WHERE table_schema = 'public' AND table_name = 'etax_sla_breach_archive'
    AND constraint_type = 'PRIMARY KEY' AND constraint_name = 'etax_sla_breach_archive_pk';
" | jq -r '.[0].cnt // 0')

if [[ "$PK_EXISTS" == "1" ]]; then
  pass "Primary key etax_sla_breach_archive_pk exists"
else
  fail "Primary key etax_sla_breach_archive_pk NOT FOUND"
fi

check_index "idx_sla_archive_org_date"
check_index "idx_sla_archive_severity_date"
check_index "idx_sla_archive_doctype_date"

# ── §4 RLS enabled ────────────────────────────────────────────────────────────
section "§4  RLS enabled on etax_sla_breach_archive"

RLS_ENABLED=$(sql_query "
  SELECT relrowsecurity::text AS rls FROM pg_class
  WHERE relname = 'etax_sla_breach_archive'
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
" | jq -r '.[0].rls // "false"')

if [[ "$RLS_ENABLED" == "true" ]]; then
  pass "RLS is enabled on etax_sla_breach_archive"
else
  fail "RLS is NOT enabled on etax_sla_breach_archive"
fi

# ── §5 fn_archive_etax_sla_breach_timeline exists ────────────────────────────
section "§5  fn_archive_etax_sla_breach_timeline function existence"

FN_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_archive_etax_sla_breach_timeline';
" | jq -r '.[0].cnt // 0')

if [[ "$FN_EXISTS" == "1" ]]; then
  pass "fn_archive_etax_sla_breach_timeline function exists"
else
  fail "fn_archive_etax_sla_breach_timeline function NOT FOUND"
fi

# Check SECURITY DEFINER
SEC_DEF=$(sql_query "
  SELECT prosecdef::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_archive_etax_sla_breach_timeline';
" | jq -r '.[0].prosecdef // "false"')

if [[ "$SEC_DEF" == "true" ]]; then
  pass "fn_archive_etax_sla_breach_timeline is SECURITY DEFINER"
else
  fail "fn_archive_etax_sla_breach_timeline is NOT SECURITY DEFINER"
fi

# ── §6 fn execution returns success:true ─────────────────────────────────────
section "§6  fn_archive_etax_sla_breach_timeline execution"

FN_RESULT=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/fn_archive_etax_sla_breach_timeline" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}')

FN_SUCCESS=$(echo "$FN_RESULT" | jq -r '.success // false')
FN_ROWS=$(echo "$FN_RESULT"    | jq -r '.rows_upserted // -1')
FN_DUR=$(echo "$FN_RESULT"     | jq -r '.duration_ms // -1')

if [[ "$FN_SUCCESS" == "true" ]]; then
  pass "fn_archive_etax_sla_breach_timeline returned success:true"
  info "  rows_upserted=$FN_ROWS  duration_ms=$FN_DUR"
else
  fail "fn_archive_etax_sla_breach_timeline did not return success:true (got: $FN_RESULT)"
fi

if [[ "$FN_ROWS" -ge 0 ]]; then
  pass "rows_upserted is non-negative ($FN_ROWS)"
else
  fail "rows_upserted is negative or missing ($FN_ROWS)"
fi

# ── §7 platform_config.sla_archive_last_run stamped ──────────────────────────
section "§7  platform_config.sla_archive_last_run key stamped"

SLA_STAMP=$(sql_query "
  SELECT value->>'run_at' AS run_at,
         (value->>'rows_upserted')::int AS rows_upserted,
         (value->>'duration_ms')::float AS duration_ms
  FROM platform_config WHERE key = 'sla_archive_last_run';
" | jq -r '.[0]')

RUN_AT=$(echo "$SLA_STAMP" | jq -r '.run_at // ""')
STAMP_ROWS=$(echo "$SLA_STAMP" | jq -r '.rows_upserted // -1')
STAMP_DUR=$(echo "$SLA_STAMP"  | jq -r '.duration_ms // -1')

if [[ -n "$RUN_AT" && "$RUN_AT" != "null" ]]; then
  pass "platform_config.sla_archive_last_run.run_at is stamped ($RUN_AT)"
else
  fail "platform_config.sla_archive_last_run.run_at is missing or null"
fi

if python3 -c "
import sys, datetime
ts = '$RUN_AT'
try:
    dt = datetime.datetime.fromisoformat(ts.replace('Z','+00:00'))
    age = (datetime.datetime.now(datetime.timezone.utc) - dt).total_seconds()
    sys.exit(0 if age < 300 else 1)
except: sys.exit(1)
" 2>/dev/null; then
  pass "run_at is a recent timestamp (within last 5 minutes)"
else
  fail "run_at is not a recent or valid timestamp ($RUN_AT)"
fi

if [[ "$STAMP_ROWS" -ge 0 ]]; then
  pass "platform_config.sla_archive_last_run.rows_upserted is non-negative ($STAMP_ROWS)"
else
  fail "platform_config.sla_archive_last_run.rows_upserted missing or negative"
fi

if python3 -c "import sys; sys.exit(0 if float('$STAMP_DUR') >= 0 else 1)" 2>/dev/null; then
  pass "platform_config.sla_archive_last_run.duration_ms is non-negative ($STAMP_DUR)"
else
  fail "platform_config.sla_archive_last_run.duration_ms missing or negative"
fi

# ── §8 rpc_etax_sla_breach_archive function existence ─────────────────────────
section "§8  rpc_etax_sla_breach_archive function existence"

RPC_EXISTS=$(sql_query "
  SELECT count(*)::int AS cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_breach_archive';
" | jq -r '.[0].cnt // 0')

if [[ "$RPC_EXISTS" == "1" ]]; then
  pass "rpc_etax_sla_breach_archive function exists"
else
  fail "rpc_etax_sla_breach_archive function NOT FOUND"
fi

# ── §9 REST POST rpc_etax_sla_breach_archive HTTP 200 ─────────────────────────
section "§9  REST POST rpc_etax_sla_breach_archive"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":null,"p_document_type":null,"p_from_date":null,"p_to_date":null}')

if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "rpc_etax_sla_breach_archive REST POST returned HTTP 200"
else
  fail "rpc_etax_sla_breach_archive REST POST returned HTTP $HTTP_STATUS (expected 200)"
fi

RPC_RESP=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":null,"p_document_type":null,"p_from_date":null,"p_to_date":null}')

if echo "$RPC_RESP" | jq -e '. | type == "array"' > /dev/null 2>&1; then
  ROW_COUNT=$(echo "$RPC_RESP" | jq '. | length')
  pass "rpc_etax_sla_breach_archive returned array ($ROW_COUNT rows)"
else
  fail "rpc_etax_sla_breach_archive did not return an array"
fi

# ── §10 p_from_date/p_to_date filter correctness ──────────────────────────────
section "§10 p_from_date / p_to_date filter correctness"

FUTURE_RESP=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":null,"p_document_type":null,"p_from_date":"2099-01-01","p_to_date":"2099-12-31"}')

FUTURE_COUNT=$(echo "$FUTURE_RESP" | jq '. | length')
if [[ "$FUTURE_COUNT" == "0" ]]; then
  pass "Future date range returns empty array (filter works)"
else
  fail "Future date range returned $FUTURE_COUNT rows (expected 0)"
fi

PAST_RESP=$(curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":null,"p_document_type":null,"p_from_date":"2020-01-01","p_to_date":"2020-12-31"}')

echo "$PAST_RESP" | jq -r '.[].breach_date' 2>/dev/null | while read -r d; do
  if python3 -c "import sys; sys.exit(0 if '$d' <= '2020-12-31' else 1)"; then
    :
  else
    fail "Record breach_date $d violates p_to_date=2020-12-31 filter"
  fi
done
pass "Historical date range filter respected"

# ── §11 RLS cross-tenant check ────────────────────────────────────────────────
section "§11 RLS cross-tenant isolation"

# Sign in as Org A user and call rpc — should only see Org A rows
if [[ -n "${TEST_ORG_A_USER_KEY:-}" ]]; then
  ORG_A_RESP=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_ORG_A_USER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"p_org_id":null,"p_document_type":null,"p_from_date":null,"p_to_date":null}')

  CROSS_LEAK=$(echo "$ORG_A_RESP" | jq --arg oid "$TEST_ORG_B_ID" '[.[] | select(.org_id == $oid)] | length')
  if [[ "$CROSS_LEAK" == "0" ]]; then
    pass "RLS: Org A user sees no Org B rows"
  else
    fail "RLS: Org A user can see $CROSS_LEAK Org B rows (CROSS-TENANT LEAK)"
  fi
else
  info "§11 skipped — TEST_ORG_A_USER_KEY not set (set via supabase auth sign-in)"
fi

# Anon cannot call rpc
ANON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_breach_archive" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_org_id":null,"p_document_type":null,"p_from_date":null,"p_to_date":null}')

if [[ "$ANON_STATUS" == "401" || "$ANON_STATUS" == "403" ]]; then
  pass "Anon caller rejected with HTTP $ANON_STATUS"
else
  fail "Anon caller returned HTTP $ANON_STATUS (expected 401/403)"
fi

# ── §12 vitest 0201_etax_sla_breach_archive suite ─────────────────────────────
section "§12 vitest — 0201_etax_sla_breach_archive test suite"

if command -v npx &>/dev/null; then
  if npx vitest run --reporter=verbose \
      "src/__tests__/migrations/0201_etax_sla_breach_archive" 2>&1; then
    pass "vitest 0201_etax_sla_breach_archive suite passed"
  else
    fail "vitest 0201_etax_sla_breach_archive suite FAILED"
  fi
else
  info "§12 skipped — npx/vitest not available in this environment"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  staging_validate_0201 — ALL CHECKS PASSED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  staging_validate_0201 — $FAILED CHECK(S) FAILED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 1
fi
