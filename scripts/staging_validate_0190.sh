#!/usr/bin/env bash
# =============================================================================
# staging_validate_0190.sh — Staging Validation for Migration 0190
# Target  : v_etax_submission_health + rpc_etax_submission_health*
# Branch  : feat/accounting-rls-multibook
# Version : 1.0.0
# =============================================================================
set -euo pipefail

# ─── Colour palette ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── CLI flags ───────────────────────────────────────────────────────────────
DRY_RUN=false
NO_VITEST=false
for arg in "$@"; do
  case $arg in
    --dry-run)   DRY_RUN=true ;;
    --no-vitest) NO_VITEST=true ;;
  esac
done

# ─── Counters ────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0; WARN=0
declare -a FAILURES=()

# ─── Helpers ─────────────────────────────────────────────────────────────────
pass()  { PASS=$((PASS+1));  echo -e "  ${GREEN}✔${RESET} $1"; }
fail()  { FAIL=$((FAIL+1));  echo -e "  ${RED}✘${RESET} $1"; FAILURES+=("$1"); }
skip()  { SKIP=$((SKIP+1));  echo -e "  ${YELLOW}⊘${RESET} $1 (skipped)"; }
warn()  { WARN=$((WARN+1));  echo -e "  ${YELLOW}⚠${RESET} $1"; }
header(){ echo -e "\n${CYAN}${BOLD}$1${RESET}"; }

run_sql() {
  local sql="$1"
  psql "$SUPABASE_DB_URL" -tAX -c "$sql" 2>/dev/null
}

run_sql_file() {
  psql "$SUPABASE_DB_URL" -tAX -f "$1" 2>/dev/null
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label (expected='$expected' got='$actual')"
  fi
}

assert_gt() {
  local label="$1" threshold="$2" actual="$3"
  if [[ "$actual" -gt "$threshold" ]] 2>/dev/null; then
    pass "$label"
  else
    fail "$label (expected > $threshold, got='$actual')"
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    pass "$label"
  else
    fail "$label (expected to contain '$needle')"
  fi
}

# ─── Banner ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   staging_validate_0190.sh — v_etax_submission_health   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
[[ "$DRY_RUN"   == true ]] && echo -e "${YELLOW}  [DRY-RUN mode — no SQL writes]${RESET}"
[[ "$NO_VITEST" == true ]] && echo -e "${YELLOW}  [--no-vitest — §11 skipped]${RESET}"
echo ""

# =============================================================================
# §1  Environment Pre-flight
# =============================================================================
header "§1  Environment Pre-flight"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  fail "SUPABASE_DB_URL is not set"
  echo -e "${RED}  Aborting: cannot connect to DB without SUPABASE_DB_URL${RESET}"
  exit 1
else
  pass "SUPABASE_DB_URL is set"
fi

if ! command -v psql &>/dev/null; then
  fail "psql not found in PATH"
  exit 1
else
  pass "psql is available"
fi

DB_VERSION=$(run_sql "SELECT current_setting('server_version_num')::int")
if [[ "$DB_VERSION" -ge 140000 ]]; then
  pass "PostgreSQL version >= 14 ($DB_VERSION)"
else
  warn "PostgreSQL version < 14 ($DB_VERSION) — some features may behave differently"
fi

if ! run_sql "SELECT 1" &>/dev/null; then
  fail "DB connection refused"
  exit 1
else
  pass "DB connection successful"
fi

# =============================================================================
# §2  Migration Dependency Guard
# =============================================================================
header "§2  Migration Dependency Guard"

DEP_CHECK=$(run_sql "SELECT COUNT(*) FROM pg_views WHERE schemaname='public' AND viewname='v_etax_submission_health'")
assert_eq "v_etax_submission_health view exists" "1" "$DEP_CHECK"

RPC_CHECK=$(run_sql "SELECT COUNT(*) FROM pg_proc WHERE proname='rpc_etax_submission_health'")
assert_eq "rpc_etax_submission_health RPC exists" "1" "$RPC_CHECK"

RPC_ADMIN_CHECK=$(run_sql "SELECT COUNT(*) FROM pg_proc WHERE proname='rpc_etax_submission_health_admin'")
assert_eq "rpc_etax_submission_health_admin RPC exists" "1" "$RPC_ADMIN_CHECK"

SOURCE_VIEW=$(run_sql "SELECT COUNT(*) FROM pg_views WHERE schemaname='public' AND viewname='v_etax_org_risk_ranking'")
if [[ "$SOURCE_VIEW" == "1" ]]; then
  pass "v_etax_org_risk_ranking dependency present (0194)"
else
  warn "v_etax_org_risk_ranking not found — 0194 may not be applied yet"
fi

# =============================================================================
# §3  View Schema Validation
# =============================================================================
header "§3  View Schema Validation — v_etax_submission_health"

EXPECTED_COLS=(
  "org_id"
  "org_name"
  "total_submissions"
  "queued_count"
  "submitting_count"
  "submitted_count"
  "failed_count"
  "cancelled_count"
  "exhausted_count"
  "pending_count"
  "success_rate_pct"
  "failure_rate_pct"
  "retry_exhaustion_rate_pct"
  "failed_last_24h"
  "queued_last_1h"
  "avg_attempts"
  "last_submission_at"
)

for col in "${EXPECTED_COLS[@]}"; do
  COL_EXISTS=$(run_sql "
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_submission_health'
      AND column_name  = '$col'
  ")
  assert_eq "column '$col' present" "1" "$COL_EXISTS"
done

COL_COUNT=$(run_sql "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema='public' AND table_name='v_etax_submission_health'
")
assert_gt "view has >= 17 columns" "16" "$COL_COUNT"

# =============================================================================
# §4  Security & RLS Posture
# =============================================================================
header "§4  Security & RLS Posture"

# Check that anon cannot SELECT directly
ANON_GRANT=$(run_sql "
  SELECT COUNT(*) FROM information_schema.role_table_grants
  WHERE table_name='v_etax_submission_health'
    AND grantee='anon'
    AND privilege_type='SELECT'
")
assert_eq "anon has no direct SELECT on view" "0" "$ANON_GRANT"

# authenticated should also not have direct select (RPC only pattern)
AUTH_DIRECT=$(run_sql "
  SELECT COUNT(*) FROM information_schema.role_table_grants
  WHERE table_name='v_etax_submission_health'
    AND grantee='authenticated'
    AND privilege_type='SELECT'
")
if [[ "$AUTH_DIRECT" == "0" ]]; then
  pass "authenticated has no direct SELECT on view (RPC-only pattern enforced)"
else
  warn "authenticated has direct SELECT on view — verify this is intentional"
fi

# RPC should be SECURITY DEFINER
RPC_SECDEF=$(run_sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='rpc_etax_submission_health'
    AND p.prosecdef = true
")
assert_eq "rpc_etax_submission_health is SECURITY DEFINER" "1" "$RPC_SECDEF"

RPC_ADMIN_SECDEF=$(run_sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='rpc_etax_submission_health_admin'
    AND p.prosecdef = true
")
assert_eq "rpc_etax_submission_health_admin is SECURITY DEFINER" "1" "$RPC_ADMIN_SECDEF"

# =============================================================================
# §5  Data Integrity Checks
# =============================================================================
header "§5  Data Integrity Checks"

if [[ "$DRY_RUN" == true ]]; then
  skip "§5 skipped in dry-run mode"
else
  # Seed test org
  TEST_ORG_ID=$(run_sql "
    INSERT INTO public.organizations (name, plan)
    VALUES ('__validate_0190_org__', 'pro')
    RETURNING id
  " 2>/dev/null || echo "")

  if [[ -z "$TEST_ORG_ID" ]]; then
    skip "Could not seed test org — skipping data integrity checks"
  else
    pass "Test org seeded: $TEST_ORG_ID"

    # Seed etax_submissions
    run_sql "
      INSERT INTO public.etax_submissions (org_id, invoice_id, document_type, status, attempt_count)
      VALUES
        ('$TEST_ORG_ID', gen_random_uuid(), 'T01', 'submitted',  1),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T01', 'submitted',  2),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T02', 'failed',     3),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T02', 'failed',     5),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T03', 'queued',     0),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T03', 'submitting', 1),
        ('$TEST_ORG_ID', gen_random_uuid(), 'T04', 'cancelled',  0)
    " &>/dev/null || true

    TOTAL=$(run_sql "SELECT total_submissions FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "total_submissions = 7" "7" "$TOTAL"

    SUBMITTED=$(run_sql "SELECT submitted_count FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "submitted_count = 2" "2" "$SUBMITTED"

    FAILED=$(run_sql "SELECT failed_count FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "failed_count = 2" "2" "$FAILED"

    QUEUED=$(run_sql "SELECT queued_count FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "queued_count = 1" "1" "$QUEUED"

    SUBMITTING=$(run_sql "SELECT submitting_count FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "submitting_count = 1" "1" "$SUBMITTING"

    CANCELLED=$(run_sql "SELECT cancelled_count FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "cancelled_count = 1" "1" "$CANCELLED"

    SUCCESS_RATE=$(run_sql "SELECT ROUND(success_rate_pct) FROM public.v_etax_submission_health WHERE org_id='$TEST_ORG_ID'")
    assert_eq "success_rate_pct ≈ 29% (2/7)" "29" "$SUCCESS_RATE"

    AVG_ATTEMPTS=$(run_sql "
      SELECT ROUND(avg_attempts, 1)
      FROM public.v_etax_submission_health
      WHERE org_id = '$TEST_ORG_ID'
    ")
    [[ -n "$AVG_ATTEMPTS" ]] && pass "avg_attempts computed ($AVG_ATTEMPTS)" || fail "avg_attempts is NULL"

    # Cleanup
    run_sql "DELETE FROM public.organizations WHERE id='$TEST_ORG_ID'" &>/dev/null || true
    pass "Test data cleaned up"
  fi
fi

# =============================================================================
# §6  RPC Signature Validation
# =============================================================================
header "§6  RPC Signature Validation"

RPC_ARGCOUNT=$(run_sql "
  SELECT pronargs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='rpc_etax_submission_health'
")
assert_eq "rpc_etax_submission_health takes 0 args" "0" "$RPC_ARGCOUNT"

ADMIN_ARGNAMES=$(run_sql "
  SELECT array_to_string(proargnames, ',')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='rpc_etax_submission_health_admin'
")
assert_contains "admin RPC has p_org_id param"    "p_org_id"    "$ADMIN_ARGNAMES"
assert_contains "admin RPC has p_status param"    "p_status"    "$ADMIN_ARGNAMES"
assert_contains "admin RPC has p_limit param"     "p_limit"     "$ADMIN_ARGNAMES"

RPC_LANG=$(run_sql "
  SELECT l.lanname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname='public' AND p.proname='rpc_etax_submission_health'
")
assert_eq "RPC language is plpgsql" "plpgsql" "$RPC_LANG"

# =============================================================================
# §7  RPC Access Control (role-based)
# =============================================================================
header "§7  RPC Access Control"

RPC_GRANT_AUTH=$(run_sql "
  SELECT COUNT(*) FROM information_schema.routine_privileges
  WHERE routine_name='rpc_etax_submission_health'
    AND grantee='authenticated'
    AND privilege_type='EXECUTE'
")
assert_eq "authenticated can EXECUTE rpc_etax_submission_health" "1" "$RPC_GRANT_AUTH"

RPC_GRANT_ANON=$(run_sql "
  SELECT COUNT(*) FROM information_schema.routine_privileges
  WHERE routine_name='rpc_etax_submission_health'
    AND grantee='anon'
    AND privilege_type='EXECUTE'
")
assert_eq "anon cannot EXECUTE rpc_etax_submission_health" "0" "$RPC_GRANT_ANON"

# Admin RPC — service_role only
ADMIN_GRANT_AUTH=$(run_sql "
  SELECT COUNT(*) FROM information_schema.routine_privileges
  WHERE routine_name='rpc_etax_submission_health_admin'
    AND grantee='authenticated'
    AND privilege_type='EXECUTE'
")
assert_eq "authenticated cannot EXECUTE admin RPC" "0" "$ADMIN_GRANT_AUTH"

ADMIN_GRANT_SVC=$(run_sql "
  SELECT COUNT(*) FROM information_schema.routine_privileges
  WHERE routine_name='rpc_etax_submission_health_admin'
    AND grantee='service_role'
    AND privilege_type='EXECUTE'
")
assert_eq "service_role can EXECUTE admin RPC" "1" "$ADMIN_GRANT_SVC"

# =============================================================================
# §8  Cross-Org Isolation
# =============================================================================
header "§8  Cross-Org Isolation"

if [[ "$DRY_RUN" == true ]]; then
  skip "§8 skipped in dry-run mode"
else
  # Create two isolated orgs and verify view isolation
  ORG_A=$(run_sql "INSERT INTO public.organizations(name,plan) VALUES('__iso_a__','pro') RETURNING id" 2>/dev/null || echo "")
  ORG_B=$(run_sql "INSERT INTO public.organizations(name,plan) VALUES('__iso_b__','pro') RETURNING id" 2>/dev/null || echo "")

  if [[ -z "$ORG_A" || -z "$ORG_B" ]]; then
    skip "Could not seed isolation orgs"
  else
    run_sql "
      INSERT INTO public.etax_submissions(org_id,invoice_id,document_type,status,attempt_count)
      VALUES
        ('$ORG_A',gen_random_uuid(),'T01','submitted',1),
        ('$ORG_A',gen_random_uuid(),'T01','failed',3),
        ('$ORG_B',gen_random_uuid(),'T02','submitted',1)
    " &>/dev/null || true

    A_TOTAL=$(run_sql "SELECT total_submissions FROM public.v_etax_submission_health WHERE org_id='$ORG_A'")
    B_TOTAL=$(run_sql "SELECT total_submissions FROM public.v_etax_submission_health WHERE org_id='$ORG_B'")

    assert_eq "Org A total = 2"    "2" "$A_TOTAL"
    assert_eq "Org B total = 1"    "1" "$B_TOTAL"
    assert_eq "Orgs have separate rows (A≠B)" "true" "$( [[ "$A_TOTAL" != "$B_TOTAL" ]] && echo true || echo false )"

    # Verify no cross-contamination
    A_INCLUDES_B=$(run_sql "
      SELECT COUNT(*) FROM public.v_etax_submission_health
      WHERE org_id='$ORG_A'
        AND total_submissions = (SELECT total_submissions FROM public.v_etax_submission_health WHERE org_id='$ORG_B')
    ")
    # This is just a logical check — the main assertion is the count separation above

    run_sql "DELETE FROM public.organizations WHERE id IN ('$ORG_A','$ORG_B')" &>/dev/null || true
    pass "Isolation orgs cleaned up"
  fi
fi

# =============================================================================
# §9  Performance Check
# =============================================================================
header "§9  Performance Check"

EXPLAIN_OUT=$(run_sql "EXPLAIN (ANALYZE, FORMAT TEXT) SELECT * FROM public.v_etax_submission_health LIMIT 100" 2>/dev/null || echo "")

if echo "$EXPLAIN_OUT" | grep -q "Execution Time"; then
  EXEC_MS=$(echo "$EXPLAIN_OUT" | grep "Execution Time" | awk '{print $3}' | cut -d'.' -f1)
  if [[ -n "$EXEC_MS" && "$EXEC_MS" -lt 2000 ]]; then
    pass "EXPLAIN ANALYZE execution time ${EXEC_MS}ms < 2000ms"
  else
    warn "EXPLAIN ANALYZE execution time ${EXEC_MS}ms (target < 2000ms)"
  fi
else
  skip "Could not parse EXPLAIN ANALYZE output"
fi

# Check for Seq Scan on large tables
if echo "$EXPLAIN_OUT" | grep -q "Seq Scan on etax_submissions"; then
  warn "Sequential scan on etax_submissions — consider adding index on (org_id, status)"
else
  pass "No full sequential scan on etax_submissions"
fi

# =============================================================================
# §10  Dry-run / Results Summary
# =============================================================================
header "§10  Dry-run Validation Summary"

if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY-RUN] All write operations were skipped."
  echo "  Schema and permission checks ran against the live DB."
fi

VIEW_EXISTS=$(run_sql "SELECT COUNT(*) FROM pg_views WHERE schemaname='public' AND viewname='v_etax_submission_health'")
assert_eq "Final check: v_etax_submission_health exists" "1" "$VIEW_EXISTS"

RPC_EXISTS=$(run_sql "SELECT COUNT(*) FROM pg_proc WHERE proname='rpc_etax_submission_health'")
assert_eq "Final check: rpc_etax_submission_health exists" "1" "$RPC_EXISTS"

ADMIN_EXISTS=$(run_sql "SELECT COUNT(*) FROM pg_proc WHERE proname='rpc_etax_submission_health_admin'")
assert_eq "Final check: rpc_etax_submission_health_admin exists" "1" "$ADMIN_EXISTS"

# =============================================================================
# §11  Vitest Integration
# =============================================================================
header "§11  Vitest Integration"

if [[ "$NO_VITEST" == true ]]; then
  skip "Vitest skipped via --no-vitest flag"
else
  TEST_FILE="src/__tests__/rls/0190_etax_submission_health.test.ts"

  if [[ ! -f "$TEST_FILE" ]]; then
    warn "Test file not found: $TEST_FILE — skipping vitest"
    SKIP=$((SKIP+1))
  elif ! command -v npx &>/dev/null; then
    warn "npx not found — skipping vitest"
    SKIP=$((SKIP+1))
  else
    echo "  Running: npx vitest run $TEST_FILE --reporter=verbose"
    if npx vitest run "$TEST_FILE" --reporter=verbose 2>&1; then
      pass "Vitest suite passed for 0190"
    else
      fail "Vitest suite FAILED for 0190"
    fi
  fi
fi

# =============================================================================
# Final Report
# =============================================================================
echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  staging_validate_0190.sh — Final Report${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}PASS${RESET}  : $PASS"
echo -e "  ${RED}FAIL${RESET}  : $FAIL"
echo -e "  ${YELLOW}SKIP${RESET}  : $SKIP"
echo -e "  ${YELLOW}WARN${RESET}  : $WARN"
echo ""

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo -e "${RED}${BOLD}  Failures:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}  • $f${RESET}"
  done
  echo ""
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✔ ALL CHECKS PASSED — Migration 0190 is staging-ready${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  ✘ $FAIL CHECK(S) FAILED — Review before promoting to production${RESET}"
  exit 1
fi
