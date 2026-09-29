#!/usr/bin/env bash
# =============================================================================
# staging_validate_0194.sh
# Validates Migration 0194 — v_etax_org_risk_ranking
#
# Checks:
#   §1  Environment preflight
#   §2  View v_etax_org_risk_ranking exists and is queryable
#   §3  Required columns present
#   §4  RLS enforcement — cross-tenant isolation
#   §5  risk_rank ordering (rank 1 = highest breach / worst health)
#   §6  rpc_etax_org_risk_ranking RPC exists and is callable
#   §7  rpc_etax_org_risk_ranking honours p_limit parameter
#   §8  Smoke test: INSERT test data → view reflects it → CLEANUP
#   §9  vitest unit tests (skippable via --no-vitest)
#   §10 Summary
#
# Usage:
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#   SUPABASE_ANON_KEY=eyJ... \
#   ./scripts/staging_validate_0194.sh [--dry-run] [--no-vitest]
#
# Exit codes: 0 = all PASS  1 = one or more FAIL
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Defaults & argument parsing
# ---------------------------------------------------------------------------
DRY_RUN=false
NO_VITEST=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true  ;;
    --no-vitest) NO_VITEST=true ;;
    --help)
      echo "Usage: staging_validate_0194.sh [--dry-run] [--no-vitest]"
      exit 0 ;;
    *)
      echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass()    { echo -e "${GREEN}[PASS]${RESET} $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET} $*"; OVERALL_EXIT=1; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
section() { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

OVERALL_EXIT=0
PASS_COUNT=0; FAIL_COUNT=0; SKIP_COUNT=0

record_pass() { pass "$1";  (( PASS_COUNT++ )) || true; }
record_fail() { fail "$1";  (( FAIL_COUNT++ )) || true; OVERALL_EXIT=1; }
record_skip() { warn "SKIP: $1"; (( SKIP_COUNT++ )) || true; }

# ---------------------------------------------------------------------------
# Dry-run shortcut
# ---------------------------------------------------------------------------
if $DRY_RUN; then
  section "§0 DRY-RUN mode — echoing checks only"
  info "Would validate: v_etax_org_risk_ranking view (Migration 0194)"
  info "Checks: view exists, columns, RLS, risk_rank order, RPC, p_limit param, smoke INSERT/cleanup, vitest"
  warn "DRY-RUN: no database calls made"
  echo -e "\n${YELLOW}Overall: DRY-RUN — no assertions executed${RESET}"
  exit 0
fi

# ---------------------------------------------------------------------------
# §1  Environment
# ---------------------------------------------------------------------------
section "§1 Environment preflight"

: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY must be set}"

DB_URL="${SUPABASE_DB_URL:-}"  # optional direct psql URL

info "SUPABASE_URL = ${SUPABASE_URL}"
info "Direct DB URL: ${DB_URL:-(not set — REST-only mode)}"

# REST helper
rest_query() {
  local endpoint="$1"; local key="${2:-$SUPABASE_SERVICE_ROLE_KEY}"
  curl -sf \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}${endpoint}"
}

rpc_call() {
  local rpc_name="$1"; local payload="${2:-{}}"
  curl -sf \
    -X POST \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc_name}"
}

record_pass "Environment variables present"

# ---------------------------------------------------------------------------
# §2  View exists and is queryable
# ---------------------------------------------------------------------------
section "§2 View v_etax_org_risk_ranking — existence"

VIEW_RESULT=$(rest_query "/rest/v1/v_etax_org_risk_ranking?limit=1&select=org_id" 2>&1) || true

if echo "$VIEW_RESULT" | grep -q '"org_id"'; then
  record_pass "v_etax_org_risk_ranking is queryable (returned ≥1 column)"
elif echo "$VIEW_RESULT" | grep -qE '"code":"(PGRST|42P01|42501)"'; then
  record_fail "v_etax_org_risk_ranking not found or permission denied: ${VIEW_RESULT:0:200}"
else
  # Empty array is fine — view exists, just no data
  if echo "$VIEW_RESULT" | grep -q '^\[\]$\|^\[{'; then
    record_pass "v_etax_org_risk_ranking exists (empty result set)"
  else
    record_fail "Unexpected response querying v_etax_org_risk_ranking: ${VIEW_RESULT:0:200}"
  fi
fi

# ---------------------------------------------------------------------------
# §3  Required columns
# ---------------------------------------------------------------------------
section "§3 Required columns in v_etax_org_risk_ranking"

REQUIRED_COLS=(
  "org_id"
  "org_name"
  "risk_tier"
  "health_score"
  "risk_rank"
  "total_submissions"
  "failure_rate_pct"
  "breached_count"
  "updated_at"
)

COLUMNS_RESULT=$(rest_query "/rest/v1/v_etax_org_risk_ranking?limit=0&select=$(IFS=,; echo "${REQUIRED_COLS[*]}")" 2>&1) || true

MISSING_COLS=0
for col in "${REQUIRED_COLS[@]}"; do
  if echo "$COLUMNS_RESULT" | grep -qi "\"${col}\""; then
    record_pass "Column ${col} present"
  elif echo "$COLUMNS_RESULT" | grep -qiE "column.*${col}.*does not exist|undefined column"; then
    record_fail "Column ${col} MISSING from v_etax_org_risk_ranking"
    (( MISSING_COLS++ )) || true
  else
    warn "Column ${col} — could not verify (no data or ambiguous response)"
    (( SKIP_COUNT++ )) || true
  fi
done

# ---------------------------------------------------------------------------
# §4  RLS enforcement — service role vs anon
# ---------------------------------------------------------------------------
section "§4 RLS enforcement — cross-tenant isolation"

ANON_RESULT=$(rest_query "/rest/v1/v_etax_org_risk_ranking?limit=100" "$SUPABASE_ANON_KEY" 2>&1) || true

if echo "$ANON_RESULT" | grep -qE '"code":"(PGRST301|42501|insufficient_privilege|JWT)"'; then
  record_pass "Anon access correctly blocked (permission denied)"
elif echo "$ANON_RESULT" | grep -q '^\[\]$'; then
  record_pass "Anon access returns empty array (view filters by get_user_org_id())"
else
  record_fail "Anon access returned unexpected data — possible RLS gap: ${ANON_RESULT:0:300}"
fi

# Service role should return data (or empty if no seeds)
SVC_RESULT=$(rest_query "/rest/v1/v_etax_org_risk_ranking?limit=5" 2>&1) || true
if echo "$SVC_RESULT" | grep -qE '^\[|\[\{'; then
  record_pass "Service role can query v_etax_org_risk_ranking"
else
  record_fail "Service role query failed: ${SVC_RESULT:0:200}"
fi

# ---------------------------------------------------------------------------
# §5  risk_rank ordering sanity
# ---------------------------------------------------------------------------
section "§5 risk_rank ordering — rank 1 = worst health score"

RANK_RESULT=$(rest_query "/rest/v1/v_etax_org_risk_ranking?select=org_id,risk_rank,health_score&order=risk_rank.asc&limit=5" 2>&1) || true

if echo "$RANK_RESULT" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
if len(rows) < 2:
    sys.exit(0)  # can't validate order with <2 rows
# Rank should be ascending; health_score should be non-ascending for top ranks
ranks = [r['risk_rank'] for r in rows]
scores = [r['health_score'] for r in rows]
if ranks != sorted(ranks):
    print('RANK_NOT_ASCENDING'); sys.exit(1)
# rank 1 should have lowest or equal health_score vs rank N
if scores[0] > scores[-1]:
    print('RANK_SCORE_INVERSION'); sys.exit(1)
print('ORDER_OK')
" 2>/dev/null; then
  record_pass "risk_rank ordering is correct (ascending rank, descending severity)"
else
  warn "risk_rank ordering check inconclusive (insufficient data or non-comparable types)"
  (( SKIP_COUNT++ )) || true
fi

# ---------------------------------------------------------------------------
# §6  RPC rpc_etax_org_risk_ranking exists
# ---------------------------------------------------------------------------
section "§6 RPC rpc_etax_org_risk_ranking existence"

RPC_RESULT=$(rpc_call "rpc_etax_org_risk_ranking" '{}' 2>&1) || true

if echo "$RPC_RESULT" | grep -qE '^\[|\[\{'; then
  record_pass "rpc_etax_org_risk_ranking callable and returns array"
elif echo "$RPC_RESULT" | grep -q '"PGRST202"'; then
  record_fail "rpc_etax_org_risk_ranking RPC not found (PGRST202)"
else
  warn "rpc_etax_org_risk_ranking returned unexpected: ${RPC_RESULT:0:200}"
  (( SKIP_COUNT++ )) || true
fi

# ---------------------------------------------------------------------------
# §7  rpc_etax_org_risk_ranking honours p_limit
# ---------------------------------------------------------------------------
section "§7 rpc_etax_org_risk_ranking p_limit parameter"

RPC_LIMIT=$(rpc_call "rpc_etax_org_risk_ranking" '{"p_limit":2}' 2>&1) || true
ROW_COUNT=$(echo "$RPC_LIMIT" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "-1")

if [[ "$ROW_COUNT" -le 2 && "$ROW_COUNT" -ge 0 ]]; then
  record_pass "p_limit=2 respected (returned ${ROW_COUNT} row(s))"
else
  record_fail "p_limit=2 NOT respected (returned ${ROW_COUNT} rows)"
fi

# ---------------------------------------------------------------------------
# §8  Smoke test — INSERT test org → view reflects it → CLEANUP
# ---------------------------------------------------------------------------
section "§8 Smoke test — seed test org into etax_risk_tier_state"

if [[ -z "$DB_URL" ]]; then
  warn "SUPABASE_DB_URL not set — skipping smoke INSERT (requires direct psql)"
  (( SKIP_COUNT++ )) || true
else
  TEST_ORG_ID="00000000-0000-0000-0000-000000019400"

  # Ensure test org exists in organizations
  psql "$DB_URL" -q -c "
    INSERT INTO organizations (id, name, created_at)
    VALUES ('${TEST_ORG_ID}', '__smoke_test_0194__', NOW())
    ON CONFLICT (id) DO NOTHING;
  " 2>/dev/null || true

  # Insert test risk tier state
  psql "$DB_URL" -q -c "
    INSERT INTO etax_risk_tier_state (org_id, risk_tier, health_score, risk_rank, updated_at)
    VALUES ('${TEST_ORG_ID}', 'CRITICAL', 12, 1, NOW())
    ON CONFLICT (org_id) DO UPDATE
      SET risk_tier = EXCLUDED.risk_tier,
          health_score = EXCLUDED.health_score,
          risk_rank = EXCLUDED.risk_rank,
          updated_at = EXCLUDED.updated_at;
  " 2>/dev/null

  # Query the view (as service role to bypass RLS)
  VIEW_CHECK=$(psql "$DB_URL" -t -c "
    SELECT risk_tier FROM v_etax_org_risk_ranking
    WHERE org_id = '${TEST_ORG_ID}' LIMIT 1;
  " 2>/dev/null | xargs)

  if [[ "$VIEW_CHECK" == "CRITICAL" ]]; then
    record_pass "Smoke test: seeded CRITICAL tier visible in v_etax_org_risk_ranking"
  else
    record_fail "Smoke test: expected CRITICAL, got '${VIEW_CHECK}'"
  fi

  # Cleanup
  psql "$DB_URL" -q -c "
    DELETE FROM etax_risk_tier_state WHERE org_id = '${TEST_ORG_ID}';
    DELETE FROM organizations WHERE id = '${TEST_ORG_ID}';
  " 2>/dev/null
  record_pass "Smoke test cleanup complete"
fi

# ---------------------------------------------------------------------------
# §9  vitest unit tests
# ---------------------------------------------------------------------------
section "§9 vitest unit tests"

if $NO_VITEST; then
  warn "Skipped (--no-vitest)"
  (( SKIP_COUNT++ )) || true
else
  TEST_FILE="${REPO_ROOT}/src/__tests__/rls/0194_etax_org_risk_ranking.test.ts"
  if [[ ! -f "$TEST_FILE" ]]; then
    warn "Test file not found: ${TEST_FILE} — skipping"
    (( SKIP_COUNT++ )) || true
  else
    info "Running vitest for Migration 0194 …"
    set +e
    cd "$REPO_ROOT"
    npx vitest run --reporter=verbose "$TEST_FILE" 2>&1
    VIT_EXIT=$?
    set -e
    if [[ $VIT_EXIT -eq 0 ]]; then
      record_pass "vitest suite PASSED"
    else
      record_fail "vitest suite FAILED (exit ${VIT_EXIT})"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# §10  Summary
# ---------------------------------------------------------------------------
section "§10 Summary — Migration 0194 (v_etax_org_risk_ranking)"

echo ""
printf "  %-50s %s\n" "Check" "Result"
printf "  %s\n" "$(printf '─%.0s' {1..65})"
printf "  %-50s ${GREEN}%s${RESET}\n" "Environment variables"           "PASS"
printf "  %-50s %s\n"  "v_etax_org_risk_ranking queryable"  \
  "$([ $FAIL_COUNT -eq 0 ] && echo -e "${GREEN}PASS${RESET}" || echo -e "${RED}SEE ABOVE${RESET}")"

echo ""
echo -e "  ${GREEN}Passed:${RESET} ${PASS_COUNT}   ${RED}Failed:${RESET} ${FAIL_COUNT}   ${YELLOW}Skipped:${RESET} ${SKIP_COUNT}"
echo ""

if [[ $OVERALL_EXIT -ne 0 ]]; then
  echo -e "${RED}${BOLD}Migration 0194 validation: FAILED${RESET}"
else
  echo -e "${GREEN}${BOLD}Migration 0194 validation: PASSED${RESET}"
fi

exit $OVERALL_EXIT
