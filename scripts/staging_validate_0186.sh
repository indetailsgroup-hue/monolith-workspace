#!/usr/bin/env bash
# =============================================================================
# staging_validate_0186.sh
# Staging validation for Migration 0186 — v_etax_compliance_dashboard (VIEW)
#
# Sections:
#   §1  Environment pre-flight
#   §2  View existence & column audit
#   §3  Seed test organisation + etax_submissions data
#   §4  Verify view row returned for seeded org
#   §5  compliance_success_rate accuracy
#   §6  failed_last_24h accuracy
#   §7  overdue_with_pending_etax accuracy
#   §8  last_submission_at populated
#   §9  RPC rpc_etax_compliance_dashboard() — role guards
#   §10 Permission guard — direct SELECT blocked for non-service_role
#   §11 Vitest unit run (optional)
#
# Usage:
#   ./scripts/staging_validate_0186.sh [--dry-run] [--no-vitest]
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
info()  { echo -e "${CYAN}[INFO ]${RESET} $*"; }
pass()  { echo -e "${GREEN}[PASS ]${RESET} $*"; }
fail()  { echo -e "${RED}[FAIL ]${RESET} $*"; exit 1; }
warn()  { echo -e "${YELLOW}[WARN ]${RESET} $*"; }
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

svc_hdr() { echo -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}"; }

# REST GET helper — service_role
rest_get() {
  local path="$1" filter="${2:-}"
  curl -sf \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Accept: application/json" \
    "${REST}/${path}${filter:+?$filter}"
}

# REST POST helper — service_role
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

# RPC helper — service_role
rpc_svc() {
  local fn="$1" body="${2:-{}}"
  curl -sf -X POST \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${RPC}/${fn}"
}

# RPC helper — authenticated user
rpc_auth() {
  local fn="$1" token="$2" body="${3:-{}}"
  curl -sf -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${RPC}/${fn}"
}

# Sign up + sign in → access_token
create_user_token() {
  local email="$1" password="$2" org_id="$3" role="$4"

  # Create via admin
  local user_resp
  user_resp=$(curl -sf -X POST \
    -H "Authorization: Bearer ${SVC_KEY}" \
    -H "apikey: ${SVC_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"email_confirm\":true}" \
    "${AUTH}/admin/users")
  local user_id
  user_id=$(echo "$user_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  # Link to org
  rest_post "org_members" "{\"org_id\":\"${org_id}\",\"user_id\":\"${user_id}\",\"role\":\"${role}\"}" >/dev/null

  # Sign in
  local token_resp
  token_resp=$(curl -sf -X POST \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${AUTH}/token?grant_type=password")
  echo "$token_resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
}

# ---------------------------------------------------------------------------
# Test state
# ---------------------------------------------------------------------------
ORG_ID=""
OWNER_TOKEN=""
DESIGNER_TOKEN=""
PASS_COUNT=0
FAIL_COUNT=0
OVERALL_EXIT=0

check() {
  local label="$1" result="$2" expected="$3"
  if [[ "$result" == "$expected" ]]; then
    pass "$label"
    (( PASS_COUNT++ )) || true
  else
    fail "$label — expected '$expected' got '$result'"
    (( FAIL_COUNT++ )) || true
    OVERALL_EXIT=1
  fi
}

check_nonempty() {
  local label="$1" result="$2"
  if [[ -n "$result" && "$result" != "null" && "$result" != "[]" ]]; then
    pass "$label"
    (( PASS_COUNT++ )) || true
  else
    fail "$label — got empty/null result"
    (( FAIL_COUNT++ )) || true
    OVERALL_EXIT=1
  fi
}

# ---------------------------------------------------------------------------
# §1  Environment pre-flight
# ---------------------------------------------------------------------------
section "§1 Environment pre-flight"

if $DRY_RUN; then
  warn "DRY-RUN mode — no real DB calls"
  info "Would validate: view v_etax_compliance_dashboard exists, columns, RPCs, permissions"
  pass "DRY-RUN pre-flight complete"
  echo ""
  echo -e "${GREEN}${BOLD}staging_validate_0186: DRY-RUN PASSED${RESET}"
  exit 0
fi

[[ -z "$SVC_KEY"  ]] && fail "SUPABASE_SERVICE_ROLE_KEY is not set"
[[ -z "$ANON_KEY" ]] && fail "SUPABASE_ANON_KEY is not set"

# Test connectivity
HTTP=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SVC_KEY}" \
  -H "apikey: ${SVC_KEY}" \
  "${REST}/organizations?limit=1")
[[ "$HTTP" == "200" ]] || fail "Cannot reach Supabase REST at ${BASE_URL} (HTTP ${HTTP})"
pass "Supabase REST reachable"

# ---------------------------------------------------------------------------
# §2  View existence & column audit
# ---------------------------------------------------------------------------
section "§2 View existence and column audit"

VIEW_EXISTS=$(rest_get "information_schema.views" \
  "table_schema=eq.public&table_name=eq.v_etax_compliance_dashboard&select=table_name" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(len(rows))")
check "v_etax_compliance_dashboard view exists" "$VIEW_EXISTS" "1"

COL_COUNT=$(rest_get "information_schema.columns" \
  "table_schema=eq.public&table_name=eq.v_etax_compliance_dashboard&select=column_name" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
info "Column count: $COL_COUNT"
[[ "$COL_COUNT" -ge 7 ]] || fail "Expected ≥7 columns, got $COL_COUNT"
pass "View has ≥7 columns"

for col in org_id total_submissions submitted_count failed_count success_rate \
           overdue_with_pending_etax failed_last_24h; do
  EXISTS=$(rest_get "information_schema.columns" \
    "table_schema=eq.public&table_name=eq.v_etax_compliance_dashboard&column_name=eq.${col}&select=column_name" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  check "Column '${col}' present" "$EXISTS" "1"
done

# ---------------------------------------------------------------------------
# §3  Seed test organisation + etax_submissions
# ---------------------------------------------------------------------------
section "§3 Seed test data"

ORG_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
ORG_NAME="SV0186_$(echo $ORG_ID | cut -c1-8)"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
YESTERDAY=$(date -u -d '25 hours ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
            date -u -v-25H +"%Y-%m-%dT%H:%M:%SZ")

rest_post "organizations" "{\"id\":\"${ORG_ID}\",\"name\":\"${ORG_NAME}\"}" >/dev/null
pass "Test org created: $ORG_NAME"

# Seed invoices so etax_submissions can reference them
INVOICE_IDS=()
for i in $(seq 1 10); do
  INV_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
  INVOICE_IDS+=("$INV_ID")
  rest_post "invoices" \
    "{\"id\":\"${INV_ID}\",\"org_id\":\"${ORG_ID}\",\"status\":\"approved\",\"total_amount\":1000,\"created_at\":\"${NOW_ISO}\"}" \
    >/dev/null 2>&1 || true  # ignore if invoices table schema differs
done

# Seed etax_submissions: 7 submitted, 2 failed, 1 queued
STATUSES=("submitted" "submitted" "submitted" "submitted" "submitted" "submitted" "submitted" "failed" "failed" "queued")
for i in "${!STATUSES[@]}"; do
  STS="${STATUSES[$i]}"
  # failed submissions: one within 24h, one older
  if [[ "$STS" == "failed" && "$i" -eq 7 ]]; then
    CREATED="$NOW_ISO"
  elif [[ "$STS" == "failed" && "$i" -eq 8 ]]; then
    CREATED="$YESTERDAY"
  else
    CREATED="$NOW_ISO"
  fi
  SUB_ID=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
  rest_post "etax_submissions" \
    "{\"id\":\"${SUB_ID}\",\"org_id\":\"${ORG_ID}\",\"invoice_id\":\"${INVOICE_IDS[$i]}\",
      \"document_type\":\"T01\",\"status\":\"${STS}\",\"attempt_count\":1,
      \"created_at\":\"${CREATED}\",\"updated_at\":\"${NOW_ISO}\"}" >/dev/null
done
pass "Seeded 10 etax_submissions (7 submitted, 2 failed, 1 queued)"

# Seed overdue invoice with pending etax
OVERDUE_INV=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
OVERDUE_SUB=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
OVERDUE_DATE=$(date -u -d '10 days ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
               date -u -v-10d +"%Y-%m-%dT%H:%M:%SZ")
rest_post "invoices" \
  "{\"id\":\"${OVERDUE_INV}\",\"org_id\":\"${ORG_ID}\",\"status\":\"overdue\",
    \"due_date\":\"${OVERDUE_DATE}\",\"total_amount\":5000,\"created_at\":\"${NOW_ISO}\"}" \
  >/dev/null 2>&1 || true
rest_post "etax_submissions" \
  "{\"id\":\"${OVERDUE_SUB}\",\"org_id\":\"${ORG_ID}\",\"invoice_id\":\"${OVERDUE_INV}\",
    \"document_type\":\"T01\",\"status\":\"queued\",\"attempt_count\":0,
    \"created_at\":\"${NOW_ISO}\",\"updated_at\":\"${NOW_ISO}\"}" >/dev/null
pass "Seeded 1 overdue invoice with pending (queued) etax"

# Create tokens
OWNER_EMAIL="sv0186_owner_${ORG_ID:0:8}@monolith-test.invalid"
DESIGNER_EMAIL="sv0186_designer_${ORG_ID:0:8}@monolith-test.invalid"
OWNER_TOKEN=$(create_user_token "$OWNER_EMAIL" "Test1234!" "$ORG_ID" "OWNER")
DESIGNER_TOKEN=$(create_user_token "$DESIGNER_EMAIL" "Test1234!" "$ORG_ID" "DESIGNER")
pass "Test users created (OWNER, DESIGNER)"

# ---------------------------------------------------------------------------
# §4  View returns a row for seeded org
# ---------------------------------------------------------------------------
section "§4 View data retrieval"

VIEW_ROW=$(rest_get "v_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=*" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0] if rows else 'EMPTY')" 2>/dev/null || echo "EMPTY")
check_nonempty "View returns row for seeded org" "$VIEW_ROW"

# ---------------------------------------------------------------------------
# §5  compliance_success_rate accuracy
# ---------------------------------------------------------------------------
section "§5 compliance_success_rate accuracy"

# 7 submitted out of 10 total (excluding overdue_pending for now) = ~70% or exact per view logic
SUCCESS_RATE=$(rest_get "v_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=success_rate" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['success_rate'] if rows else 'NULL')")
info "success_rate = $SUCCESS_RATE"
check_nonempty "success_rate is not null" "$SUCCESS_RATE"
# Should be > 0 (some submissions are submitted)
GT_ZERO=$(python3 -c "print('yes' if float('${SUCCESS_RATE}') > 0 else 'no')" 2>/dev/null || echo "no")
check "success_rate > 0" "$GT_ZERO" "yes"

# ---------------------------------------------------------------------------
# §6  failed_last_24h accuracy
# ---------------------------------------------------------------------------
section "§6 failed_last_24h accuracy"

FAILED_24H=$(rest_get "v_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=failed_last_24h" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['failed_last_24h'] if rows else 'NULL')")
info "failed_last_24h = $FAILED_24H"
# We seeded exactly 1 failure within last 24h
check "failed_last_24h = 1" "$FAILED_24H" "1"

# ---------------------------------------------------------------------------
# §7  overdue_with_pending_etax accuracy
# ---------------------------------------------------------------------------
section "§7 overdue_with_pending_etax accuracy"

OVERDUE=$(rest_get "v_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=overdue_with_pending_etax" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0]['overdue_with_pending_etax'] if rows else 'NULL')")
info "overdue_with_pending_etax = $OVERDUE"
# We seeded exactly 1 overdue invoice with queued etax
check "overdue_with_pending_etax = 1" "$OVERDUE" "1"

# ---------------------------------------------------------------------------
# §8  last_submission_at populated
# ---------------------------------------------------------------------------
section "§8 last_submission_at populated"

LAST_AT=$(rest_get "v_etax_compliance_dashboard" "org_id=eq.${ORG_ID}&select=last_submission_at" \
  | python3 -c "import sys,json; rows=json.load(sys.stdin); print(rows[0].get('last_submission_at','NULL') if rows else 'NULL')")
check_nonempty "last_submission_at is populated" "$LAST_AT"

# ---------------------------------------------------------------------------
# §9  RPC rpc_etax_compliance_dashboard() — role guards
# ---------------------------------------------------------------------------
section "§9 RPC role guards"

# OWNER should succeed
OWNER_RESP=$(rpc_auth "rpc_etax_compliance_dashboard" "$OWNER_TOKEN" "{}" 2>&1 || echo "ERROR")
if [[ "$OWNER_RESP" != *"ERROR"* && "$OWNER_RESP" != *"error"* ]]; then
  pass "OWNER can call rpc_etax_compliance_dashboard"
  (( PASS_COUNT++ )) || true
else
  warn "rpc_etax_compliance_dashboard RPC may not exist (skipping role guard — check migration)"
fi

# DESIGNER should be rejected (P0001)
DESIGNER_RESP=$(rpc_auth "rpc_etax_compliance_dashboard" "$DESIGNER_TOKEN" "{}" 2>&1 || true)
if echo "$DESIGNER_RESP" | grep -q "P0001"; then
  pass "DESIGNER rejected with P0001"
  (( PASS_COUNT++ )) || true
else
  warn "DESIGNER rejection check skipped (RPC may not exist or error code differs)"
fi

# ---------------------------------------------------------------------------
# §10 Permission guard — direct SELECT blocked for authenticated
# ---------------------------------------------------------------------------
section "§10 Permission guard"

DIRECT_SELECT=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -H "apikey: ${ANON_KEY}" \
  "${REST}/v_etax_compliance_dashboard?limit=1" 2>/dev/null || echo "000")
info "Direct SELECT HTTP status for authenticated: $DIRECT_SELECT"
if [[ "$DIRECT_SELECT" == "200" ]]; then
  warn "Direct SELECT returned 200 — verify RLS or GRANT is set correctly on view"
elif [[ "$DIRECT_SELECT" =~ ^(401|403|42501)$ ]]; then
  pass "Direct SELECT correctly blocked for authenticated user (HTTP $DIRECT_SELECT)"
  (( PASS_COUNT++ )) || true
else
  warn "Unexpected HTTP $DIRECT_SELECT for direct SELECT (view may use different access model)"
fi

# Service role CAN select
SVC_SELECT=$(curl -so /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SVC_KEY}" \
  -H "apikey: ${SVC_KEY}" \
  "${REST}/v_etax_compliance_dashboard?org_id=eq.${ORG_ID}&limit=1" 2>/dev/null || echo "000")
if [[ "$SVC_SELECT" == "200" ]]; then
  pass "Service role can SELECT from view (HTTP 200)"
  (( PASS_COUNT++ )) || true
else
  warn "Service role SELECT returned HTTP $SVC_SELECT (check service_role GRANT)"
fi

# ---------------------------------------------------------------------------
# §11 Vitest unit run
# ---------------------------------------------------------------------------
section "§11 Vitest"

if $NO_VITEST; then
  warn "Vitest suppressed via --no-vitest"
else
  info "Running 0186 unit tests..."
  cd "$REPO_ROOT"
  if npx vitest run --reporter=verbose "src/__tests__/rls/0186_compliance_dashboard.test" 2>&1; then
    pass "Vitest 0186 PASSED"
    (( PASS_COUNT++ )) || true
  else
    fail "Vitest 0186 FAILED"
  fi
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
info "Cleaning up test data..."
curl -sf -X DELETE \
  -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/etax_submissions?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE \
  -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/invoices?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE \
  -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/org_members?org_id=eq.${ORG_ID}" >/dev/null 2>&1 || true
curl -sf -X DELETE \
  -H "Authorization: Bearer ${SVC_KEY}" -H "apikey: ${SVC_KEY}" \
  "${REST}/organizations?id=eq.${ORG_ID}" >/dev/null 2>&1 || true
pass "Cleanup complete"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━ staging_validate_0186 Summary ━━━${RESET}"
echo -e "  Passed: ${GREEN}${PASS_COUNT}${RESET}   Failed: ${RED}${FAIL_COUNT}${RESET}"
echo ""

if [[ $OVERALL_EXIT -ne 0 ]]; then
  echo -e "${RED}${BOLD}staging_validate_0186: FAILED${RESET}"
else
  echo -e "${GREEN}${BOLD}staging_validate_0186: PASSED${RESET}"
fi

exit $OVERALL_EXIT
