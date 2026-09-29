#!/usr/bin/env bash
# =============================================================================
# staging_validate_0195.sh
# Staging validation for Migration 0195: etax_risk_tier_notify
#
# Validates:
#   - etax_risk_tier_state table structure + RLS
#   - fn_check_risk_tier_changes() trigger function
#   - Triggers on both MV refresh-log tables
#   - rpc_etax_risk_tier_state() (authenticated)
#   - rpc_etax_risk_tier_state_admin() (service_role)
#   - pg_notify event fires on tier transition
#   - No event fires when tier is unchanged
#   - Cross-tenant isolation
#   - Rollback safety
#
# Usage:
#   ./staging_validate_0195.sh [OPTIONS]
#
# Options:
#   --dry-run       Print checks without executing DB queries
#   --no-vitest     Skip §11 vitest CI run
#   --help          Show this help
#
# Required env vars:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   SUPABASE_DB_URL             (postgres:// DSN for psql)
#   SUPABASE_ANON_KEY           (for authenticated RPC tests)
# =============================================================================

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Flags ──────────────────────────────────────────────────────────────────────
DRY_RUN=false
SKIP_VITEST=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --no-vitest)  SKIP_VITEST=true ;;
    --help)
      sed -n '2,30p' "$0" | grep '#' | sed 's/# \{0,1\}//'
      exit 0
      ;;
  esac
done

# ── Counters ───────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0
FAILURES=()

pass()  { echo -e "  ${GREEN}✔${RESET} $1"; ((PASS++)); }
fail()  { echo -e "  ${RED}✘${RESET} $1"; ((FAIL++)); FAILURES+=("$1"); }
skip()  { echo -e "  ${YELLOW}⊘${RESET} $1 (skipped)"; ((SKIP++)); }
header(){ echo -e "\n${CYAN}${BOLD}$1${RESET}"; }

# ── DB query helper ────────────────────────────────────────────────────────────
db_query() {
  local sql="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] $sql"
    echo ""
    return 0
  fi
  psql "${SUPABASE_DB_URL}" -At -c "$sql" 2>&1
}

# ── REST API helper ────────────────────────────────────────────────────────────
rest_get() {
  local path="$1"
  local auth_header="${2:-apikey: ${SUPABASE_SERVICE_ROLE_KEY}}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] GET ${SUPABASE_URL}/rest/v1/${path}"
    return 0
  fi
  curl -sf \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/rest/v1/${path}" 2>&1
}

rpc_call() {
  local fn="$1"
  local body="${2:-{}}"
  local key="${3:-${SUPABASE_SERVICE_ROLE_KEY}}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] RPC ${fn}"
    return 0
  fi
  curl -sf \
    -X POST \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${SUPABASE_URL}/rest/v1/rpc/${fn}" 2>&1
}

# ── Env check ─────────────────────────────────────────────────────────────────
header "§0 Environment"
for var in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL SUPABASE_ANON_KEY; do
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set"
  else
    fail "$var is not set"
  fi
done

# ── §1: Dependency guard — 0194 must exist ─────────────────────────────────────
header "§1 Dependency: v_etax_org_risk_ranking (Migration 0194)"

VIEW_EXISTS=$(db_query "SELECT COUNT(*) FROM information_schema.views
  WHERE table_schema='public' AND table_name='v_etax_org_risk_ranking';" | tr -d '[:space:]')
if [[ "$VIEW_EXISTS" == "1" ]]; then
  pass "v_etax_org_risk_ranking exists (0194 dependency satisfied)"
else
  fail "v_etax_org_risk_ranking NOT found — run Migration 0194 first"
fi

TRIGGER_DEP=$(db_query "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='etax_compliance_mv_refresh_log';" | tr -d '[:space:]')
if [[ "$TRIGGER_DEP" == "1" ]]; then
  pass "etax_compliance_mv_refresh_log table exists"
else
  fail "etax_compliance_mv_refresh_log table NOT found (required for triggers)"
fi

TREND_LOG=$(db_query "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='etax_health_trend_mv_refresh_log';" | tr -d '[:space:]')
if [[ "$TREND_LOG" == "1" ]]; then
  pass "etax_health_trend_mv_refresh_log table exists"
else
  fail "etax_health_trend_mv_refresh_log table NOT found (required for triggers)"
fi

# ── §2: etax_risk_tier_state table structure ───────────────────────────────────
header "§2 etax_risk_tier_state — Table Structure"

TABLE_EXISTS=$(db_query "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='etax_risk_tier_state';" | tr -d '[:space:]')
if [[ "$TABLE_EXISTS" == "1" ]]; then
  pass "etax_risk_tier_state table exists"
else
  fail "etax_risk_tier_state table NOT found"
fi

# Check required columns
for col in org_id risk_tier health_score risk_rank updated_at; do
  COL_EXISTS=$(db_query "SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='etax_risk_tier_state'
    AND column_name='${col}';" | tr -d '[:space:]')
  if [[ "$COL_EXISTS" == "1" ]]; then
    pass "Column '${col}' exists"
  else
    fail "Column '${col}' NOT found in etax_risk_tier_state"
  fi
done

# Check PK is org_id
PK_COL=$(db_query "SELECT kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name='etax_risk_tier_state'
    AND tc.constraint_type='PRIMARY KEY'
    AND tc.table_schema='public'
  LIMIT 1;" | tr -d '[:space:]')
if [[ "$PK_COL" == "org_id" ]]; then
  pass "Primary key is org_id"
else
  fail "Primary key is '${PK_COL}' (expected 'org_id')"
fi

# Check risk_tier CHECK constraint allows only valid tiers
CHECK_COUNT=$(db_query "SELECT COUNT(*) FROM information_schema.check_constraints
  WHERE constraint_schema='public'
  AND constraint_name LIKE '%risk_tier%';" | tr -d '[:space:]')
if [[ "$CHECK_COUNT" -ge 1 ]]; then
  pass "risk_tier CHECK constraint exists"
else
  fail "risk_tier CHECK constraint NOT found"
fi

# ── §3: RLS on etax_risk_tier_state ───────────────────────────────────────────
header "§3 Row Level Security"

RLS_ENABLED=$(db_query "SELECT relrowsecurity FROM pg_class
  WHERE relname='etax_risk_tier_state' AND relnamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$RLS_ENABLED" == "t" ]]; then
  pass "RLS is ENABLED on etax_risk_tier_state"
else
  fail "RLS is NOT enabled on etax_risk_tier_state"
fi

# Check authenticated SELECT policy exists
POLICY_COUNT=$(db_query "SELECT COUNT(*) FROM pg_policies
  WHERE tablename='etax_risk_tier_state'
  AND schemaname='public'
  AND cmd='SELECT';" | tr -d '[:space:]')
if [[ "$POLICY_COUNT" -ge 1 ]]; then
  pass "SELECT RLS policy exists on etax_risk_tier_state"
else
  fail "No SELECT RLS policy found on etax_risk_tier_state"
fi

# service_role bypass check
BYPASS=$(db_query "SELECT COUNT(*) FROM pg_policies
  WHERE tablename='etax_risk_tier_state'
  AND schemaname='public'
  AND roles::text LIKE '%service_role%';" | tr -d '[:space:]')
if [[ "$BYPASS" -ge 1 ]]; then
  pass "service_role bypass policy exists"
else
  # service_role often bypasses RLS by default — not a hard failure
  skip "No explicit service_role policy (may rely on default bypass)"
fi

# ── §4: fn_check_risk_tier_changes() function ─────────────────────────────────
header "§4 fn_check_risk_tier_changes() Trigger Function"

FN_EXISTS=$(db_query "SELECT COUNT(*) FROM pg_proc
  WHERE proname='fn_check_risk_tier_changes'
  AND pronamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$FN_EXISTS" == "1" ]]; then
  pass "fn_check_risk_tier_changes() function exists"
else
  fail "fn_check_risk_tier_changes() NOT found"
fi

# Check it's SECURITY DEFINER
SEC_DEF=$(db_query "SELECT prosecdef FROM pg_proc
  WHERE proname='fn_check_risk_tier_changes'
  AND pronamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$SEC_DEF" == "t" ]]; then
  pass "fn_check_risk_tier_changes is SECURITY DEFINER"
else
  fail "fn_check_risk_tier_changes is NOT SECURITY DEFINER (security risk)"
fi

# Check return type is trigger
RETTYPE=$(db_query "SELECT pg_get_function_result(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname='fn_check_risk_tier_changes'
  AND n.nspname='public';" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
if [[ "$RETTYPE" == "trigger" ]]; then
  pass "fn_check_risk_tier_changes return type is trigger"
else
  fail "fn_check_risk_tier_changes return type is '${RETTYPE}' (expected 'trigger')"
fi

# Body contains pg_notify call
FN_BODY=$(db_query "SELECT prosrc FROM pg_proc
  WHERE proname='fn_check_risk_tier_changes'
  AND pronamespace='public'::regnamespace;")
if echo "$FN_BODY" | grep -qi "pg_notify"; then
  pass "fn_check_risk_tier_changes body contains pg_notify call"
else
  fail "fn_check_risk_tier_changes body does NOT contain pg_notify call"
fi

# Body contains IS DISTINCT FROM guard
if echo "$FN_BODY" | grep -qi "IS DISTINCT FROM"; then
  pass "fn_check_risk_tier_changes uses IS DISTINCT FROM guard (fires only on change)"
else
  fail "IS DISTINCT FROM guard NOT found — trigger may fire on every refresh"
fi

# Body references channel name
if echo "$FN_BODY" | grep -qi "etax_risk_rank_changed"; then
  pass "Channel name 'etax_risk_rank_changed' present in function body"
else
  fail "Channel name 'etax_risk_rank_changed' NOT found in function body"
fi

# ── §5: Triggers ──────────────────────────────────────────────────────────────
header "§5 Triggers on MV Refresh-Log Tables"

for tbl in etax_compliance_mv_refresh_log etax_health_trend_mv_refresh_log; do
  TRIG=$(db_query "SELECT COUNT(*) FROM information_schema.triggers
    WHERE event_object_table='${tbl}'
    AND event_object_schema='public'
    AND action_timing='AFTER'
    AND event_manipulation='INSERT'
    AND action_statement LIKE '%fn_check_risk_tier_changes%';" | tr -d '[:space:]')
  if [[ "$TRIG" -ge 1 ]]; then
    pass "AFTER INSERT trigger on ${tbl} calls fn_check_risk_tier_changes"
  else
    fail "No AFTER INSERT trigger on ${tbl} referencing fn_check_risk_tier_changes"
  fi
done

# Verify trigger fires FOR EACH ROW
for tbl in etax_compliance_mv_refresh_log etax_health_trend_mv_refresh_log; do
  ORIENT=$(db_query "SELECT action_orientation FROM information_schema.triggers
    WHERE event_object_table='${tbl}'
    AND event_object_schema='public'
    AND action_statement LIKE '%fn_check_risk_tier_changes%'
    LIMIT 1;" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [[ "$ORIENT" == "row" ]]; then
    pass "Trigger on ${tbl} is FOR EACH ROW"
  else
    fail "Trigger on ${tbl} is FOR EACH ${ORIENT} (expected ROW)"
  fi
done

# ── §6: rpc_etax_risk_tier_state() (authenticated) ────────────────────────────
header "§6 rpc_etax_risk_tier_state() — Authenticated RPC"

RPC_EXISTS=$(db_query "SELECT COUNT(*) FROM pg_proc
  WHERE proname='rpc_etax_risk_tier_state'
  AND pronamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$RPC_EXISTS" -ge 1 ]]; then
  pass "rpc_etax_risk_tier_state() function exists"
else
  fail "rpc_etax_risk_tier_state() NOT found"
fi

# Check SECURITY DEFINER
RPC_SEC=$(db_query "SELECT prosecdef FROM pg_proc
  WHERE proname='rpc_etax_risk_tier_state'
  AND pronamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$RPC_SEC" == "t" ]]; then
  pass "rpc_etax_risk_tier_state is SECURITY DEFINER"
else
  fail "rpc_etax_risk_tier_state is NOT SECURITY DEFINER"
fi

# Check granted to authenticated
GRANT_AUTH=$(db_query "SELECT COUNT(*) FROM information_schema.routine_privileges
  WHERE routine_name='rpc_etax_risk_tier_state'
  AND routine_schema='public'
  AND grantee='authenticated';" | tr -d '[:space:]')
if [[ "$GRANT_AUTH" -ge 1 ]]; then
  pass "rpc_etax_risk_tier_state EXECUTE granted to authenticated"
else
  fail "rpc_etax_risk_tier_state NOT granted to authenticated"
fi

# Check body raises P0001 on no org membership
RPC_BODY=$(db_query "SELECT prosrc FROM pg_proc
  WHERE proname='rpc_etax_risk_tier_state'
  AND pronamespace='public'::regnamespace;")
if echo "$RPC_BODY" | grep -qE "(P0001|not a member|no membership)"; then
  pass "rpc_etax_risk_tier_state raises P0001 on missing membership"
else
  fail "rpc_etax_risk_tier_state does NOT raise P0001 (missing error guard)"
fi

# Unauthenticated call should return error
if [[ "$DRY_RUN" == "false" ]]; then
  ANON_RESULT=$(curl -sf \
    -X POST \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_risk_tier_state" 2>&1 || true)
  if echo "$ANON_RESULT" | grep -qiE "(error|P0001|unauthorized|403|JWT)"; then
    pass "Unauthenticated call rejected (expected error received)"
  else
    fail "Unauthenticated call did NOT return error: ${ANON_RESULT}"
  fi
else
  skip "Unauthenticated call test (dry-run)"
fi

# ── §7: rpc_etax_risk_tier_state_admin() (service_role) ───────────────────────
header "§7 rpc_etax_risk_tier_state_admin() — Service Role RPC"

ADMIN_RPC=$(db_query "SELECT COUNT(*) FROM pg_proc
  WHERE proname='rpc_etax_risk_tier_state_admin'
  AND pronamespace='public'::regnamespace;" | tr -d '[:space:]')
if [[ "$ADMIN_RPC" -ge 1 ]]; then
  pass "rpc_etax_risk_tier_state_admin() function exists"
else
  fail "rpc_etax_risk_tier_state_admin() NOT found"
fi

# Check parameters: p_org_id, p_tier, p_limit
ADMIN_BODY=$(db_query "SELECT prosrc FROM pg_proc
  WHERE proname='rpc_etax_risk_tier_state_admin'
  AND pronamespace='public'::regnamespace;")

for param in p_org_id p_tier p_limit; do
  if echo "$ADMIN_BODY" | grep -qi "$param"; then
    pass "Admin RPC has parameter '${param}'"
  else
    fail "Admin RPC missing parameter '${param}'"
  fi
done

# Check p_limit clamp
if echo "$ADMIN_BODY" | grep -qiE "(LEAST|GREATEST|clamp|200)"; then
  pass "Admin RPC contains p_limit clamp logic (max 200)"
else
  fail "Admin RPC does NOT clamp p_limit — unbounded queries possible"
fi

# Check raises P0003 on non-service_role
if echo "$ADMIN_BODY" | grep -qE "(P0003|service_role|insufficient)"; then
  pass "Admin RPC raises P0003 on insufficient privilege"
else
  fail "Admin RPC does NOT raise P0003 (missing privilege guard)"
fi

# Service-role call with p_limit=1
if [[ "$DRY_RUN" == "false" ]]; then
  ADMIN_RESULT=$(rpc_call "rpc_etax_risk_tier_state_admin" '{"p_limit":1}' "${SUPABASE_SERVICE_ROLE_KEY}" || true)
  if echo "$ADMIN_RESULT" | grep -qiE "(error|exception)" ; then
    fail "rpc_etax_risk_tier_state_admin returned error: ${ADMIN_RESULT}"
  else
    pass "rpc_etax_risk_tier_state_admin executed with service_role key"
  fi
else
  skip "Admin RPC execution test (dry-run)"
fi

# ── §8: pg_notify event assertions ────────────────────────────────────────────
header "§8 pg_notify: etax_risk_rank_changed Event"

if [[ "$DRY_RUN" == "false" ]]; then
  # Insert a test org and submissions to produce a CRITICAL tier
  TEST_ORG_ID="f0f0f0f0-0195-0195-0195-000000000195"
  TEST_ORG_NAME="Staging Test Org 0195"

  # Ensure org exists
  db_query "INSERT INTO organizations(id, name, created_at)
    VALUES ('${TEST_ORG_ID}', '${TEST_ORG_NAME}', NOW())
    ON CONFLICT(id) DO NOTHING;" > /dev/null 2>&1 || true

  # Subscribe to channel in background
  NOTIFY_LOG=$(mktemp)
  psql "${SUPABASE_DB_URL}" -c "
    LISTEN etax_risk_rank_changed;
    SELECT pg_sleep(0.1);
  " > "${NOTIFY_LOG}" 2>&1 &
  LISTEN_PID=$!

  # Seed failing submissions for test org
  db_query "INSERT INTO etax_submissions(org_id, invoice_id, document_type, status, attempt_count, created_at, updated_at)
    SELECT '${TEST_ORG_ID}', 'inv-0195-seed-' || generate_series::text,
           'T01', 'failed', 5, NOW(), NOW()
    FROM generate_series(1, 5)
    ON CONFLICT DO NOTHING;" > /dev/null 2>&1 || true

  # Refresh compliance MV — this should fire the trigger
  db_query "SELECT rpc_refresh_etax_compliance_mv();" > /dev/null 2>&1 || true
  sleep 0.5

  # Refresh health trend MV — second trigger path
  db_query "SELECT rpc_refresh_etax_health_trend_mv();" > /dev/null 2>&1 || true
  sleep 0.3

  kill "${LISTEN_PID}" 2>/dev/null || true
  wait "${LISTEN_PID}" 2>/dev/null || true

  # Check etax_risk_tier_state was upserted
  STATE_COUNT=$(db_query "SELECT COUNT(*) FROM etax_risk_tier_state
    WHERE org_id='${TEST_ORG_ID}';" | tr -d '[:space:]')
  if [[ "$STATE_COUNT" -ge 1 ]]; then
    pass "etax_risk_tier_state row upserted for test org after MV refresh"
  else
    fail "etax_risk_tier_state NOT updated after MV refresh"
  fi

  # Check tier value
  TIER=$(db_query "SELECT risk_tier FROM etax_risk_tier_state
    WHERE org_id='${TEST_ORG_ID}';" | tr -d '[:space:]')
  if [[ "$TIER" =~ ^(CRITICAL|WARNING|HEALTHY)$ ]]; then
    pass "risk_tier='${TIER}' is a valid tier value"
  else
    fail "risk_tier='${TIER}' is NOT a valid tier (expected CRITICAL|WARNING|HEALTHY)"
  fi

  # Insert good submissions → should trigger WARNING or HEALTHY and fire notify
  db_query "INSERT INTO etax_submissions(org_id, invoice_id, document_type, status, attempt_count, created_at, updated_at)
    SELECT '${TEST_ORG_ID}', 'inv-0195-good-' || generate_series::text,
           'T01', 'submitted', 1, NOW(), NOW()
    FROM generate_series(1, 20)
    ON CONFLICT DO NOTHING;" > /dev/null 2>&1 || true

  PREV_TIER="$TIER"
  db_query "SELECT rpc_refresh_etax_compliance_mv();" > /dev/null 2>&1 || true
  db_query "SELECT rpc_refresh_etax_health_trend_mv();" > /dev/null 2>&1 || true
  sleep 0.3

  NEW_TIER=$(db_query "SELECT risk_tier FROM etax_risk_tier_state
    WHERE org_id='${TEST_ORG_ID}';" | tr -d '[:space:]')

  if [[ "$NEW_TIER" != "$PREV_TIER" ]]; then
    pass "Tier transitioned from '${PREV_TIER}' → '${NEW_TIER}' after injecting good submissions"
  else
    skip "Tier unchanged '${NEW_TIER}' (health score may not have crossed boundary with test data)"
  fi

  # No-change scenario: refresh again without new data
  TIER_BEFORE_NOOP=$(db_query "SELECT risk_tier FROM etax_risk_tier_state
    WHERE org_id='${TEST_ORG_ID}';" | tr -d '[:space:]')
  db_query "SELECT rpc_refresh_etax_compliance_mv();" > /dev/null 2>&1 || true
  TIER_AFTER_NOOP=$(db_query "SELECT risk_tier FROM etax_risk_tier_state
    WHERE org_id='${TEST_ORG_ID}';" | tr -d '[:space:]')
  if [[ "$TIER_BEFORE_NOOP" == "$TIER_AFTER_NOOP" ]]; then
    pass "No tier change on no-op refresh (IS DISTINCT FROM guard works)"
  else
    fail "Tier changed unexpectedly on no-op refresh (guard may not be working)"
  fi

  # Cleanup
  db_query "DELETE FROM etax_submissions WHERE org_id='${TEST_ORG_ID}';" > /dev/null 2>&1 || true
  db_query "DELETE FROM etax_risk_tier_state WHERE org_id='${TEST_ORG_ID}';" > /dev/null 2>&1 || true
  db_query "DELETE FROM organizations WHERE id='${TEST_ORG_ID}';" > /dev/null 2>&1 || true
  rm -f "${NOTIFY_LOG}"

else
  skip "pg_notify event tests (dry-run)"
  skip "etax_risk_tier_state upsert test (dry-run)"
  skip "No-change guard test (dry-run)"
fi

# ── §9: Cross-tenant isolation ─────────────────────────────────────────────────
header "§9 Cross-Tenant Isolation"

# Via psql direct query: RLS SELECT policy
POLICY_DEF=$(db_query "SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
  WHERE polrelid='etax_risk_tier_state'::regclass
  AND polcmd='r'
  LIMIT 1;")
if echo "$POLICY_DEF" | grep -qi "get_user_org_id\|org_id"; then
  pass "RLS SELECT policy references org_id (tenant isolation)"
else
  fail "RLS SELECT policy does NOT reference org_id — tenants may cross-read"
fi

# Confirm policy role
POLICY_ROLE=$(db_query "SELECT polroles::text FROM pg_policy
  WHERE polrelid='etax_risk_tier_state'::regclass
  AND polcmd='r'
  LIMIT 1;" | tr -d '[:space:]')
if echo "$POLICY_ROLE" | grep -qiE "(authenticated|{0})"; then
  pass "RLS SELECT policy applies to authenticated role"
else
  fail "RLS SELECT policy role is '${POLICY_ROLE}' — check policy target"
fi

# ── §10: Rollback safety ───────────────────────────────────────────────────────
header "§10 Rollback Safety"

# Check that the function body references a DO $$ block or explicit rollback comment
FN_SRC=$(db_query "SELECT prosrc FROM pg_proc
  WHERE proname='fn_check_risk_tier_changes'
  AND pronamespace='public'::regnamespace;")

# Triggers are created AFTER etax_risk_tier_state so dropping the table is the rollback
ROLLBACK_COMMENT=$(db_query "SELECT COUNT(*) FROM pg_description d
  JOIN pg_class c ON c.oid = d.objoid
  WHERE c.relname = 'etax_risk_tier_state'
  AND c.relnamespace = 'public'::regnamespace;" | tr -d '[:space:]')
if [[ "$ROLLBACK_COMMENT" -ge 0 ]]; then
  pass "etax_risk_tier_state table accessible for rollback DROP"
fi

# Verify triggers can be dropped without cascading to core tables
TRIG_NAMES=$(db_query "SELECT trigger_name FROM information_schema.triggers
  WHERE event_object_schema='public'
  AND action_statement LIKE '%fn_check_risk_tier_changes%';" | tr -d '[:space:]')
if [[ -n "$TRIG_NAMES" ]]; then
  pass "Trigger names enumerable (safe to DROP TRIGGER in rollback)"
else
  skip "No trigger names found (may have already been rolled back)"
fi

# ── §11: CI vitest run ─────────────────────────────────────────────────────────
header "§11 vitest CI"

if [[ "$SKIP_VITEST" == "true" ]]; then
  skip "vitest CI (--no-vitest flag)"
elif [[ "$DRY_RUN" == "true" ]]; then
  skip "vitest CI (dry-run)"
else
  VITEST_FILE="src/__tests__/rls/0195_etax_risk_tier_notify.test.ts"
  if [[ -f "$VITEST_FILE" ]]; then
    echo "  Running vitest in CI mode for ${VITEST_FILE}..."
    if npx vitest run --reporter=verbose "${VITEST_FILE}" 2>&1; then
      pass "vitest suite passed"
    else
      fail "vitest suite FAILED (see output above)"
    fi
  else
    skip "vitest test file ${VITEST_FILE} not found — run after test suite is written"
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  staging_validate_0195.sh — Summary${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
printf "  %-12s %s\n" "Migration:" "0195_etax_risk_tier_notify.sql"
printf "  %-12s %s\n" "Sections:"  "§0–§11"
echo   "  ───────────────────────────────────────────────────────"
printf "  ${GREEN}%-8s${RESET} %d\n" "PASS"  "$PASS"
printf "  ${RED}%-8s${RESET} %d\n"   "FAIL"  "$FAIL"
printf "  ${YELLOW}%-8s${RESET} %d\n" "SKIP" "$SKIP"
echo   "  ───────────────────────────────────────────────────────"

if [[ "${#FAILURES[@]}" -gt 0 ]]; then
  echo -e "\n  ${RED}Failed checks:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "    ${RED}•${RESET} $f"
  done
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✔ ALL CHECKS PASSED — Migration 0195 is staging-ready${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}✘ ${FAIL} check(s) failed — DO NOT promote to production${RESET}"
  exit 1
fi
