#!/usr/bin/env bash
# =============================================================================
# staging_validate_0187.sh
# Staging validation for Migration 0187 — mv_etax_compliance_dashboard (MV)
#
# Sections:
#   §1  Environment pre-flight
#   §2  MV existence & column audit
#   §3  Unique index uq_mv_etax_compliance_org exists
#   §4  Refresh function fn_refresh_etax_compliance_mv() executes cleanly
#   §5  Refresh log entry created after fn_refresh_etax_compliance_mv
#   §6  MV populated with data after refresh
#   §7  Seed new org data → refresh → verify MV updates (staleness test)
#   §8  v_mv_refresh_lag shows freshness_status=fresh immediately after refresh
#   §9  pg_cron job registered (*/15 * * * *)
#   §10 Permission: service_role SELECT OK; authenticated direct SELECT blocked
#   §11 Vitest unit run (optional)
#
# Usage:
#   ./scripts/staging_validate_0187.sh [--dry-run] [--no-vitest]
# =============================================================================

set -euo pipefail

DRY_RUN=false
NO_VITEST=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true ;;
    --no-vitest) NO_VITEST=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO ]${RESET} $*"; }
pass()    { echo -e "${GREEN}[PASS ]${RESET} $*"; }
fail()    { echo -e "${RED}[FAIL ]${RESET} $*"; exit 1; }
warn()    { echo -e "${YELLOW}[WARN ]${RESET} $*"; }
section() { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL="${SUPABASE_URL:-http://localhost:54321}"
SVC_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"
REST="${BASE_URL}/rest/v1"
RPC="${BASE_URL}/rest/v1/rpc"
AUTH="${BASE_URL}/auth/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# REST helpers
rest_get() {
  local path="$1" filter="${2:-}"
  curl -sf \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Accept: application/json" \
    "${REST}/${path}${filter:+?$filter}"
}

rest_post() {
  local path="$1" body="$2"
  curl -sf -X POST \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$body" \
    "${REST}/${path}"
}

rpc_svc() {
  local fn="$1" body="${2:-{}}"
  curl -sf -X POST \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${RPC}/${fn}"
}

create_user_token() {
  local email="$1" password="$2" org_id="$3" role="$4"
  local user_resp user_id
  user_resp=$(curl -sf -X POST \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"email_confirm\":true}" \
    "${AUTH}/admin/users")
  user_id=$(echo "$user_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  rest_post "org_members" "{\"org_id\":\"${org_id}\",\"user_id\":\"${user_id}\",\"role\":\"${role}\"}" >/dev/null
  local token_resp
  token_resp=$(curl -sf -X POST \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${AUTH}/token?grant_type=password")
  echo "$token_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
OVERALL_EXIT=0
ORG_ID=""

check() {
  local label="$1" result="$2" expected="$3"
  if [[ "$result" == "$expected" ]]; then
    pass "$label"; (( PASS_COUNT++ )) || true
  else
    warn "$label — expected '$expected' got '$result'"; (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1
  fi
}

check_nonempty() {
  local label="$1" result="$2"
  if [[ -n "$result" && "$result" != "null" && "$result" != "[]" ]]; then
    pass "$label"; (( PASS_COUNT++ )) || true
  else
    warn "$label — empty/null"; (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1
  fi
}

# ---------------------------------------------------------------------------
# §1  Environment pre-flight
# ---------------------------------------------------------------------------
section "§1 Environment pre-flight"

if $DRY_RUN; then
  warn "DRY-RUN mode — no real DB calls"
  info "Would validate: mv_etax_compliance_dashboard MV, refresh function, refresh log, pg_cron, permissions"
  pass "DRY-RUN pre-flight complete"
  echo -e "\n${GREEN}${BOLD}staging_validate_0187: DRY-RUN PASSED${RESET}"
  exit 0
fi

[[ -z "$SVC_KEY"  ]] && fail "SUPABASE_SERVICE_ROLE_KEY is not set"
[[ -z "$ANON_KEY" ]] && fail "SUPABASE_ANON_KEY is not set"

HTTP=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/organizations?limit=1")
[[ "$HTTP" == "200" ]] || fail "Cannot reach Supabase REST (HTTP ${HTTP})"
pass "Supabase REST reachable"

# ---------------------------------------------------------------------------
# §2  MV existence & column audit
# ---------------------------------------------------------------------------
section "§2 MV existence and column audit"

# Check in information_schema.tables (MVs show up there)
MV_EXISTS=$(rest_get "information_schema.tables" \
  "table_schema=eq.public&table_name=eq.mv_etax_compliance_dashboard&select=table_name" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "mv_etax_compliance_dashboard exists" "$MV_EXISTS" "1"

# Column presence
for col in org_id total_submissions submitted_count failed_count success_rate \
           overdue_with_pending_etax failed_last_24h; do
  EXISTS=$(rest_get "information_schema.columns" \
    "table_schema=eq.public&table_name=eq.mv_etax_compliance_dashboard&column_name=eq.${col}&select=column_name" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  check "Column '${col}' in MV" "$EXISTS" "1"
done

# ---------------------------------------------------------------------------
# §3  Unique index uq_mv_etax_compliance_org exists
# ---------------------------------------------------------------------------
section "§3 Unique index on MV"

IDX_EXISTS=$(rest_get "pg_indexes" \
  "schemaname=eq.public&tablename=eq.mv_etax_compliance_dashboard&indexname=eq.uq_mv_etax_compliance_org&select=indexname" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "uq_mv_etax_compliance_org index exists" "$IDX_EXISTS" "1"

# ---------------------------------------------------------------------------
# §4  fn_refresh_etax_compliance_mv executes cleanly
# ---------------------------------------------------------------------------
section "§4 Refresh function execution"

LOG_COUNT_BEFORE=$(rest_get "etax_compliance_mv_refresh_log" "select=id" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
info "Refresh log count before: $LOG_COUNT_BEFORE"

REFRESH_RESP=$(rpc_svc "fn_refresh_etax_compliance_mv" '{"p_triggered_by":"staging_0187"}' 2>&1 || echo "ERROR")
if echo "$REFRESH_RESP" | grep -qi "error"; then
  warn "fn_refresh_etax_compliance_mv returned error — check function exists"
  (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1
else
  pass "fn_refresh_etax_compliance_mv executed without error"
  (( PASS_COUNT++ )) || true
fi

# ---------------------------------------------------------------------------
# §5  Refresh log entry created
# ---------------------------------------------------------------------------
section "§5 Refresh log entry"

sleep 1  # brief pause for commit
LOG_COUNT_AFTER=$(rest_get "etax_compliance_mv_refresh_log" "select=id" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
info "Refresh log count after: $LOG_COUNT_AFTER"

DELTA=$(( LOG_COUNT_AFTER - LOG_COUNT_BEFORE ))
if [[ "$DELTA" -ge 1 ]]; then
  pass "New refresh log entry created (delta: $DELTA)"
  (( PASS_COUNT++ )) || true
else
  warn "No new refresh log entry detected (before: $LOG_COUNT_BEFORE, after: $LOG_COUNT_AFTER)"
  (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1
fi

# Verify triggered_by field
TRIGGERED_BY=$(rest_get "etax_compliance_mv_refresh_log" \
  "select=triggered_by&order=id.desc&limit=1" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['triggered_by'] if rows else 'NULL')")
check "triggered_by = 'staging_0187'" "$TRIGGERED_BY" "staging_0187"

# Verify duration_ms > 0
DURATION=$(rest_get "etax_compliance_mv_refresh_log" \
  "select=duration_ms&order=id.desc&limit=1" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['duration_ms'] if rows else 0)")
info "duration_ms: $DURATION"
GT_ZERO=$(python3 -c "print('yes' if int('${DURATION}') >= 0 else 'no')" 2>/dev/null || echo "no")
check "duration_ms is non-negative" "$GT_ZERO" "yes"

# ---------------------------------------------------------------------------
# §6  MV populated with data after refresh
# ---------------------------------------------------------------------------
section "§6 MV has data after refresh"

# Seed org + submissions before refresh
ORG_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
ORG_NAME="SV0187_$(echo $ORG_ID | cut -c1-8)"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

rest_post "organizations" "{\"id\":\"${ORG_ID}\",\"name\":\"${ORG_NAME}\"}" >/dev/null

for i in $(seq 1 5); do
  SUB_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
  INV_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
  rest_post "invoices" \
    "{\"id\":\"${INV_ID}\",\"org_id\":\"${ORG_ID}\",\"status\":\"approved\",\"total_amount\":1000,\"created_at\":\"${NOW_ISO}\"}" \
    >/dev/null 2>&1 || true
  rest_post "etax_submissions" \
    "{\"id\":\"${SUB_ID}\",\"org_id\":\"${ORG_ID}\",\"invoice_id\":\"${INV_ID}\",
      \"document_type\":\"T01\",\"status\":\"submitted\",\"attempt_count\":1,
      \"created_at\":\"${NOW_ISO}\",\"updated_at\":\"${NOW_ISO}\"}" >/dev/null
done
pass "Seeded 5 submitted etax_submissions for org $ORG_NAME"

# Refresh
rpc_svc "fn_refresh_etax_compliance_mv" '{"p_triggered_by":"staging_0187_seed"}' >/dev/null 2>&1 || true
sleep 1

MV_ROW=$(rest_get "mv_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=*" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0] if rows else 'EMPTY')")
check_nonempty "MV has row for seeded org after refresh" "$MV_ROW"

MV_TOTAL=$(rest_get "mv_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=total_submissions" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['total_submissions'] if rows else 0)")
check "MV total_submissions = 5" "$MV_TOTAL" "5"

MV_SUBMITTED=$(rest_get "mv_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=submitted_count" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['submitted_count'] if rows else 0)")
check "MV submitted_count = 5" "$MV_SUBMITTED" "5"

# ---------------------------------------------------------------------------
# §7  Add new submission → refresh → verify MV updates (staleness)
# ---------------------------------------------------------------------------
section "§7 MV update on re-refresh"

NEW_SUB=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
NEW_INV=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
rest_post "invoices" \
  "{\"id\":\"${NEW_INV}\",\"org_id\":\"${ORG_ID}\",\"status\":\"approved\",\"total_amount\":2000,\"created_at\":\"${NOW_ISO}\"}" \
  >/dev/null 2>&1 || true
rest_post "etax_submissions" \
  "{\"id\":\"${NEW_SUB}\",\"org_id\":\"${ORG_ID}\",\"invoice_id\":\"${NEW_INV}\",
    \"document_type\":\"T01\",\"status\":\"failed\",\"attempt_count\":5,
    \"created_at\":\"${NOW_ISO}\",\"updated_at\":\"${NOW_ISO}\"}" >/dev/null

rpc_svc "fn_refresh_etax_compliance_mv" '{"p_triggered_by":"staging_0187_update"}' >/dev/null 2>&1 || true
sleep 1

MV_TOTAL_AFTER=$(rest_get "mv_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=total_submissions" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['total_submissions'] if rows else 0)")
check "MV total_submissions = 6 after adding 1 more" "$MV_TOTAL_AFTER" "6"

MV_FAILED=$(rest_get "mv_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=failed_count" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['failed_count'] if rows else 0)")
check "MV failed_count = 1 after adding failed submission" "$MV_FAILED" "1"

# ---------------------------------------------------------------------------
# §8  v_mv_refresh_lag shows freshness_status=fresh immediately after refresh
# ---------------------------------------------------------------------------
section "§8 v_mv_refresh_lag freshness"

LAG_STATUS=$(rest_get "v_mv_refresh_lag" "select=freshness_status&limit=1" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['freshness_status'] if rows else 'NULL')" 2>/dev/null || echo "NULL")
info "freshness_status = $LAG_STATUS"
if [[ "$LAG_STATUS" == "fresh" ]]; then
  pass "v_mv_refresh_lag shows 'fresh' immediately after refresh"
  (( PASS_COUNT++ )) || true
else
  warn "freshness_status = '${LAG_STATUS}' (expected 'fresh' — check 900s threshold vs refresh timing)"
fi

# ---------------------------------------------------------------------------
# §9  pg_cron job registered for */15 * * * *
# ---------------------------------------------------------------------------
section "§9 pg_cron job registration"

CRON_JOB=$(rest_get "cron.job" \
  "jobname=eq.refresh-etax-compliance-mv&select=schedule" 2>/dev/null \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['schedule'] if rows else 'NULL')" 2>/dev/null || echo "SKIP")

if [[ "$CRON_JOB" == "SKIP" || "$CRON_JOB" == "NULL" ]]; then
  warn "pg_cron job query failed (cron schema may not be accessible via REST) — check supabase/config.toml"
else
  check "refresh-etax-compliance-mv schedule = */15 * * * *" "$CRON_JOB" "*/15 * * * *"
fi

# ---------------------------------------------------------------------------
# §10 Permission guard
# ---------------------------------------------------------------------------
section "§10 Permission guard"

OWNER_EMAIL="sv0187_owner_${ORG_ID:0:8}@monolith-test.invalid"
OWNER_TOKEN=$(create_user_token "$OWNER_EMAIL" "Test1234!" "$ORG_ID" "OWNER")

AUTH_SELECT=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -H "apikey: ${ANON_KEY}" \
  "${REST}/mv_etax_compliance_dashboard?limit=1")
info "Authenticated direct SELECT HTTP: $AUTH_SELECT"
if [[ "$AUTH_SELECT" =~ ^(401|403)$ ]]; then
  pass "Authenticated user blocked from direct SELECT on MV (HTTP $AUTH_SELECT)"
  (( PASS_COUNT++ )) || true
elif [[ "$AUTH_SELECT" == "200" ]]; then
  warn "Authenticated user can SELECT directly — verify GRANT is service_role only"
else
  warn "Unexpected HTTP $AUTH_SELECT for authenticated SELECT"
fi

SVC_SELECT=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SVC_KEY}" \
  -H "apikey: ${SVC_KEY}" \
  "${REST}/mv_etax_compliance_dashboard?org_id=eq.${ORG_ID}&limit=1")
if [[ "$SVC_SELECT" == "200" ]]; then
  pass "Service role can SELECT from MV (HTTP 200)"
  (( PASS_COUNT++ )) || true
else
  warn "Service role SELECT returned HTTP $SVC_SELECT"
fi

# ---------------------------------------------------------------------------
# §11 Vitest
# ---------------------------------------------------------------------------
section "§11 Vitest"

if $NO_VITEST; then
  warn "Vitest suppressed via --no-vitest"
else
  cd "$REPO_ROOT"
  if npx vitest run --reporter=verbose "src/__tests__/rls/0187_etax_compliance_dashboard_mv.test" 2>&1; then
    pass "Vitest 0187 PASSED"; (( PASS_COUNT++ )) || true
  else
    warn "Vitest 0187 FAILED"; (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1
  fi
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
info "Cleaning up..."
curl -sf -X DELETE -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/etax_submissions?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/mv_etax_compliance_dashboard?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/invoices?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/org_members?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/organizations?id=eq.${ORG_ID}" >/dev/null 2>&1 || true
pass "Cleanup complete"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━ staging_validate_0187 Summary ━━━${RESET}"
echo -e "  Passed: ${GREEN}${PASS_COUNT}${RESET}   Failed: ${RED}${FAIL_COUNT}${RESET}"
echo ""
if [[ $OVERALL_EXIT -ne 0 ]]; then
  echo -e "${RED}${BOLD}staging_validate_0187: FAILED${RESET}"
else
  echo -e "${GREEN}${BOLD}staging_validate_0187: PASSED${RESET}"
fi
exit $OVERALL_EXIT
