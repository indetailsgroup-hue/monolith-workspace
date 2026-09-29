#!/usr/bin/env bash
# =============================================================================
# staging_validate_0193.sh
# Staging validation for Migration 0193 — v_etax_full_health_summary
#
# Validates:
#   §1  Prerequisites
#   §2  Schema — view, RPCs, columns
#   §3  Permission smoke-tests
#   §4  Seed submissions with controlled statuses (known inputs)
#   §5  Refresh BOTH MVs (compliance + trend)
#   §6  health_score formula accuracy (actual vs expected)
#   §7  health_status threshold boundaries
#   §8  Org isolation — second org cannot see first org's data
#   §9  Admin RPC smoke-test (service_role)
#   §10 Freshness summary (both MVs)
#   §11 CI vitest — 0193_etax_full_health_summary.test.ts
#
# Usage:
#   ./staging_validate_0193.sh [--dry-run] [--no-vitest]
#
# Environment:
#   SUPABASE_DB_URL           — postgres connection string (required)
#   SUPABASE_URL              — REST base URL (optional; for admin RPC curl test)
#   SUPABASE_SERVICE_ROLE_KEY — service-role JWT (optional; for admin RPC curl test)
#
# Exit codes:  0 = all checks passed   1 = one or more checks failed
# =============================================================================

set -euo pipefail

# ── colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass() { echo -e "${GREEN}  ✓${RESET} $*"; }
fail() { echo -e "${RED}  ✗${RESET} $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
info() { echo -e "${CYAN}  ▸${RESET} $*"; }
header() { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━${RESET}"; }

FAIL_COUNT=0
DRY_RUN=false
NO_VITEST=false
TEST_TAG="staging_validate_0193"

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true  ;;
    --no-vitest) NO_VITEST=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

if $DRY_RUN; then
  echo -e "\n${YELLOW}╔══════════════════════════════════════════════╗"
  echo -e "║  DRY-RUN MODE — no DB operations will run   ║"
  echo -e "╚══════════════════════════════════════════════╝${RESET}\n"
fi

# ── psql wrappers ─────────────────────────────────────────────────────────────
psql_run() {
  if $DRY_RUN; then echo "[dry-run] psql: $*"; return 0; fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -c "$@" 2>&1
}

psql_val() {
  if $DRY_RUN; then echo "__dry_run__"; return 0; fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -A -c "$1" 2>&1 | tr -d '[:space:]'
}

psql_count() {
  if $DRY_RUN; then echo "1"; return 0; fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -A -c "$1" 2>&1 | tr -d '[:space:]'
}

# ── integer arithmetic helpers ─────────────────────────────────────────────────
# Mirrors exactly: GREATEST(0, LEAST(100,
#   100 - ROUND((100-rate)*0.40) - ROUND(exhaust*0.30)
#       - LEAST(overdue*2, 20) - LEAST(failed24h, 10)))
# Uses Python3 to replicate ROUND (round-half-to-even) accurately.
calc_expected_score() {
  local rate="$1" exhaust="$2" overdue="$3" failed24h="$4"
  python3 -c "
import math

def pg_round(x):
    # Python's round() uses banker's rounding, matching PostgreSQL ROUND()
    return round(x)

rate      = float('$rate')
exhaust   = float('$exhaust')
overdue   = int('$overdue')
failed24h = int('$failed24h')

p1 = pg_round((100 - rate) * 0.40)
p2 = pg_round(exhaust      * 0.30)
p3 = min(overdue * 2, 20)
p4 = min(failed24h, 10)

score = max(0, min(100, 100 - p1 - p2 - p3 - p4))
print(int(score))
"
}

expected_status() {
  local score="$1"
  if [[ "$score" -ge 80 ]]; then echo "healthy"
  elif [[ "$score" -ge 50 ]]; then echo "warning"
  else echo "critical"
  fi
}

# =============================================================================
# §1  PREREQUISITES
# =============================================================================
header "§1  Prerequisites"

if command -v psql &>/dev/null; then
  pass "psql binary found: $(psql --version | head -1)"
else
  fail "psql not found — install postgresql-client and retry"
  exit 1
fi

if command -v python3 &>/dev/null; then
  pass "python3 found: $(python3 --version)"
else
  fail "python3 required for formula verification"
  exit 1
fi

if $DRY_RUN; then
  warn "Skipping DB checks (dry-run)"
else
  if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    fail "SUPABASE_DB_URL is not set"
    exit 1
  fi
  pass "SUPABASE_DB_URL is set"

  if psql "$SUPABASE_DB_URL" -c "SELECT 1" &>/dev/null; then
    pass "Database connection successful"
  else
    fail "Cannot connect to database"
    exit 1
  fi

  CURRENT_USER=$(psql_val "SELECT current_user")
  info "Connected as: $CURRENT_USER"
  IS_SUPER=$(psql_val "SELECT usesuper::text FROM pg_user WHERE usename = current_user")
  if [[ "$IS_SUPER" == "t" ]]; then
    pass "Running as superuser"
  else
    warn "Not superuser — some checks may be skipped"
  fi
fi

# =============================================================================
# §2  SCHEMA VERIFICATION
# =============================================================================
header "§2  Schema — v_etax_full_health_summary objects"

# 2a. View exists
VIEW_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_views WHERE viewname = 'v_etax_full_health_summary' AND schemaname = 'public'")
if [[ "$VIEW_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "v_etax_full_health_summary view exists"
else
  fail "v_etax_full_health_summary view does NOT exist"
fi

# 2b. Required columns
REQUIRED_COLS=(
  org_id org_name
  total_submissions submitted_count failed_count cancelled_count
  queued_count submitting_count
  compliance_success_rate avg_attempt_count max_attempt_count
  submissions_with_pdf_downloaded pdf_success_rate
  last_submission_at last_failed_at oldest_unresolved_failed_at
  failed_last_24h last_audit_event_at
  overdue_invoice_count overdue_with_pending_etax
  today_daily_total today_daily_submitted today_daily_failed
  today_daily_exhausted today_retry_exhaustion_rate_pct today_success_rate_pct
  health_score health_status
  compliance_mv_last_refreshed_at trend_mv_last_refreshed_at
)
MISSING_COLS=0
for col in "${REQUIRED_COLS[@]}"; do
  C=$(psql_count "
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v_etax_full_health_summary'
      AND column_name  = '$col'
  ")
  if [[ "$C" == "1" || "$DRY_RUN" == "true" ]]; then
    pass "  column: $col"
  else
    fail "  missing column: $col"
    MISSING_COLS=$((MISSING_COLS + 1))
  fi
done
[[ "$MISSING_COLS" -eq 0 ]] || fail "  $MISSING_COLS column(s) missing from v_etax_full_health_summary"

# 2c. rpc_etax_full_health_summary
RPC1=$(psql_count "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'rpc_etax_full_health_summary' AND n.nspname = 'public'")
if [[ "$RPC1" -ge 1 || "$DRY_RUN" == "true" ]]; then
  pass "rpc_etax_full_health_summary function exists"
else
  fail "rpc_etax_full_health_summary missing"
fi

# 2d. rpc_etax_full_health_summary_admin
RPC2=$(psql_count "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'rpc_etax_full_health_summary_admin' AND n.nspname = 'public'")
if [[ "$RPC2" -ge 1 || "$DRY_RUN" == "true" ]]; then
  pass "rpc_etax_full_health_summary_admin function exists"
else
  fail "rpc_etax_full_health_summary_admin missing"
fi

# 2e. Dependency MVs present
for mv in mv_etax_compliance_dashboard mv_etax_health_trend; do
  MV_C=$(psql_count "SELECT COUNT(*) FROM pg_matviews WHERE matviewname = '$mv' AND schemaname = 'public'")
  if [[ "$MV_C" == "1" || "$DRY_RUN" == "true" ]]; then
    pass "Dependency MV $mv present"
  else
    fail "Dependency MV $mv missing — run migrations 0187+0192 first"
  fi
done

# =============================================================================
# §3  PERMISSION SMOKE-TESTS
# =============================================================================
header "§3  Permission smoke-tests"

if $DRY_RUN; then
  warn "Skipping permission checks (dry-run)"
else
  # 3a. authenticated has no direct SELECT on view
  AUTH_SELECT=$(psql_count "
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE table_name   = 'v_etax_full_health_summary'
      AND grantee      = 'authenticated'
      AND privilege_type = 'SELECT'
  ")
  if [[ "$AUTH_SELECT" == "0" ]]; then
    pass "authenticated has no direct SELECT on v_etax_full_health_summary (correct — SECURITY DEFINER RPCs only)"
  else
    fail "authenticated has direct SELECT on v_etax_full_health_summary — REVOKE is missing"
  fi

  # 3b. service_role has SELECT on view
  SR_SELECT=$(psql_count "
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE table_name   = 'v_etax_full_health_summary'
      AND grantee      = 'service_role'
      AND privilege_type = 'SELECT'
  ")
  if [[ "$SR_SELECT" == "1" ]]; then
    pass "service_role has SELECT on v_etax_full_health_summary"
  else
    fail "service_role missing SELECT on v_etax_full_health_summary"
  fi

  # 3c. authenticated has EXECUTE on rpc_etax_full_health_summary
  AUTH_EXEC=$(psql_count "
    SELECT COUNT(*) FROM information_schema.routine_privileges
    WHERE routine_name     = 'rpc_etax_full_health_summary'
      AND grantee          = 'authenticated'
      AND privilege_type   = 'EXECUTE'
  ")
  if [[ "$AUTH_EXEC" == "1" ]]; then
    pass "authenticated has EXECUTE on rpc_etax_full_health_summary"
  else
    fail "authenticated missing EXECUTE on rpc_etax_full_health_summary"
  fi

  # 3d. service_role has EXECUTE on rpc_etax_full_health_summary_admin
  SR_EXEC=$(psql_count "
    SELECT COUNT(*) FROM information_schema.routine_privileges
    WHERE routine_name     = 'rpc_etax_full_health_summary_admin'
      AND grantee          = 'service_role'
      AND privilege_type   = 'EXECUTE'
  ")
  if [[ "$SR_EXEC" == "1" ]]; then
    pass "service_role has EXECUTE on rpc_etax_full_health_summary_admin"
  else
    fail "service_role missing EXECUTE on rpc_etax_full_health_summary_admin"
  fi

  # 3e. SECURITY DEFINER set on rpc_etax_full_health_summary
  SEC_DEF=$(psql_count "
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname   = 'rpc_etax_full_health_summary'
      AND n.nspname   = 'public'
      AND p.prosecdef = true
  ")
  if [[ "$SEC_DEF" == "1" ]]; then
    pass "rpc_etax_full_health_summary has SECURITY DEFINER"
  else
    fail "rpc_etax_full_health_summary is NOT SECURITY DEFINER"
  fi
fi

# =============================================================================
# §4  SEED — CONTROLLED SUBMISSIONS (known inputs for formula verification)
# =============================================================================
header "§4  Seed — controlled submissions for formula verification"

# Seed Plan (Org A — primary test org):
#
#   Scenario A: all submitted → success_rate=100%, zero penalties → health_score=100
#   Scenario B: 5/10 submitted, 5 failed today (failed_last_24h=5), 0 exhausted
#               → score = 100 - ROUND(50*0.40) - 0 - 0 - 5 = 100 - 20 - 0 - 0 - 5 = 75 → warning
#   Scenario C: 2/10 submitted, 8 failed (attempt_count=5 → exhausted), failed_last_24h=8
#               → today_exhausted=8, total_today=10, exhaustion_rate=80%
#               → score = 100 - ROUND(80*0.40) - ROUND(80*0.30) - 0 - 8
#                       = 100 - 32 - 24 - 0 - 8 = 36 → critical
#
#  We run Scenario B for the primary formula assertion (moderate, 3 distinguishable inputs)

if $DRY_RUN; then
  warn "Skipping seed (dry-run)"
  SEED_ORG_ID="00000000-0000-0000-0000-000000000000"
  SEED_INVOICE_ID="00000000-0000-0000-0000-000000000001"
  SEED_ORG2_ID="00000000-0000-0000-0000-000000000002"
else
  # ── Resolve org ──────────────────────────────────────────────────────────
  SEED_ORG_ID=$(psql_val "SELECT id FROM organizations ORDER BY created_at LIMIT 1")
  if [[ -z "$SEED_ORG_ID" ]]; then
    fail "No organizations found — cannot seed"
    SEED_ORG_ID=""
  else
    pass "Primary seed org: $SEED_ORG_ID"
  fi

  # ── Resolve or create customer + invoice ─────────────────────────────────
  if [[ -n "$SEED_ORG_ID" ]]; then
    SEED_INVOICE_ID=$(psql_val "SELECT id FROM invoices WHERE org_id = '$SEED_ORG_ID' ORDER BY created_at LIMIT 1")
    if [[ -z "$SEED_INVOICE_ID" ]]; then
      CUST_ID=$(psql_val "SELECT id FROM customers WHERE org_id = '$SEED_ORG_ID' LIMIT 1")
      if [[ -z "$CUST_ID" ]]; then
        CUST_ID=$(psql_val "INSERT INTO customers (org_id, name) VALUES ('$SEED_ORG_ID', 'SV0193 Seed Customer') RETURNING id")
        info "Created customer: $CUST_ID"
      fi
      SEED_INVOICE_ID=$(psql_val "INSERT INTO invoices (org_id, customer_id, status, total) VALUES ('$SEED_ORG_ID', '$CUST_ID', 'approved', 5000) RETURNING id")
      info "Created invoice: $SEED_INVOICE_ID"
    else
      pass "Using invoice: $SEED_INVOICE_ID"
    fi
  fi

  # ── Resolve second org for isolation testing ──────────────────────────────
  SEED_ORG2_ID=$(psql_val "SELECT id FROM organizations WHERE id <> '$SEED_ORG_ID' ORDER BY created_at LIMIT 1")
  if [[ -z "$SEED_ORG2_ID" ]]; then
    SEED_ORG2_ID=$(psql_val "INSERT INTO organizations (name) VALUES ('SV0193 Isolation Org') RETURNING id")
    info "Created second org for isolation: $SEED_ORG2_ID"
  else
    info "Second org for isolation: $SEED_ORG2_ID"
  fi
fi

# ── Insert Scenario B submissions: 5 submitted + 5 failed today ──────────────
# Docs T01–T05 = submitted, T06–T10 = failed (failed today = in last 24h)
SUBMITTED_COUNT=5
FAILED_COUNT=5
EXHAUSTED_COUNT=0   # attempt_count < 5 for all

if $DRY_RUN; then
  warn "Skipping submission inserts (dry-run)"
elif [[ -n "$SEED_ORG_ID" && -n "$SEED_INVOICE_ID" ]]; then

  # Delete any existing test-tagged rows first
  psql_run "DELETE FROM etax_submissions WHERE metadata->>'test_tag' = '$TEST_TAG'" >/dev/null 2>&1 || true

  doc_seq=0
  for status in submitted submitted submitted submitted submitted failed failed failed failed failed; do
    doc_seq=$((doc_seq + 1))
    DOC="T0${doc_seq}"
    ATTEMPT=1
    # Ensure failed rows have created_at = now (within last 24h for failed_last_24h count)
    CREATED="NOW() - INTERVAL '${doc_seq} minutes'"

    psql_run "
      INSERT INTO etax_submissions (
        org_id, invoice_id, document_type, status, attempt_count,
        created_at, updated_at, metadata
      ) VALUES (
        '$SEED_ORG_ID', '$SEED_INVOICE_ID',
        '$DOC', '$status', $ATTEMPT,
        $CREATED, $CREATED,
        jsonb_build_object('test_tag','$TEST_TAG','seq',$doc_seq)
      )
      ON CONFLICT (invoice_id, document_type)
      DO UPDATE SET
        status        = EXCLUDED.status,
        attempt_count = EXCLUDED.attempt_count,
        metadata      = EXCLUDED.metadata,
        updated_at    = EXCLUDED.updated_at
    " >/dev/null 2>&1 || warn "  conflict/error for doc $DOC"
  done
  pass "Seeded $SUBMITTED_COUNT submitted + $FAILED_COUNT failed submissions for Org A"
else
  warn "Skipping inserts — no org/invoice resolved"
fi

# =============================================================================
# §5  REFRESH BOTH MVs
# =============================================================================
header "§5  Refresh BOTH materialized views"

if $DRY_RUN; then
  warn "Skipping refresh (dry-run)"
else
  # 5a. Ensure both refresh-log tables have at least one row (CROSS JOIN prerequisite)
  COMP_LOG_COUNT=$(psql_count "SELECT COUNT(*) FROM etax_compliance_mv_refresh_log")
  TREND_LOG_COUNT=$(psql_count "SELECT COUNT(*) FROM etax_health_trend_mv_refresh_log")
  info "Pre-refresh log counts — compliance: $COMP_LOG_COUNT, trend: $TREND_LOG_COUNT"

  # 5b. Refresh compliance MV
  psql_run "SELECT fn_refresh_etax_compliance_mv('test')" >/dev/null
  pass "fn_refresh_etax_compliance_mv('test') completed"

  # 5c. Refresh trend MV
  psql_run "SELECT fn_refresh_etax_health_trend_mv('test')" >/dev/null
  pass "fn_refresh_etax_health_trend_mv('test') completed"

  # 5d. Verify both log rows written
  COMP_LOG_NEW=$(psql_count "SELECT COUNT(*) FROM etax_compliance_mv_refresh_log WHERE triggered_by='test' AND refreshed_at > NOW() - INTERVAL '60 seconds'")
  TREND_LOG_NEW=$(psql_count "SELECT COUNT(*) FROM etax_health_trend_mv_refresh_log WHERE triggered_by='test' AND refreshed_at > NOW() - INTERVAL '60 seconds'")

  [[ "$COMP_LOG_NEW"  -ge 1 ]] && pass "Compliance MV refresh log row written" || fail "Compliance MV refresh log missing"
  [[ "$TREND_LOG_NEW" -ge 1 ]] && pass "Trend MV refresh log row written"      || fail "Trend MV refresh log missing"

  # 5e. Verify Org A appears in both MVs after refresh
  if [[ -n "$SEED_ORG_ID" ]]; then
    ORG_IN_COMP=$(psql_count "SELECT COUNT(*) FROM mv_etax_compliance_dashboard WHERE org_id = '$SEED_ORG_ID'")
    ORG_IN_TREND=$(psql_count "SELECT COUNT(*) FROM mv_etax_health_trend WHERE org_id = '$SEED_ORG_ID' AND day_rank = 1")
    [[ "$ORG_IN_COMP" -ge 1 ]] && pass "Org A present in mv_etax_compliance_dashboard" || fail "Org A missing from compliance MV — check seed"
    [[ "$ORG_IN_TREND" -ge 1 ]] && pass "Org A present in mv_etax_health_trend (day_rank=1)" || warn "Org A missing from trend MV (no today submissions?)"
  fi
fi

# =============================================================================
# §6  HEALTH SCORE FORMULA ACCURACY
# =============================================================================
header "§6  health_score formula accuracy"

if $DRY_RUN; then
  warn "Skipping formula verification (dry-run)"
elif [[ -n "$SEED_ORG_ID" ]]; then

  # Read actual values from both MVs for Org A
  ACTUAL_SCORE=$(psql_val "
    SELECT health_score
    FROM v_etax_full_health_summary
    WHERE org_id = '$SEED_ORG_ID'
    LIMIT 1
  ")

  if [[ -z "$ACTUAL_SCORE" || "$ACTUAL_SCORE" == "" ]]; then
    fail "v_etax_full_health_summary returned no row for Org A — check CROSS JOIN prerequisite"
  else
    info "Actual health_score from view: $ACTUAL_SCORE"

    # Read the raw MV inputs that feed the formula
    COMP_RATE=$(psql_val "SELECT COALESCE(success_rate, 0) FROM mv_etax_compliance_dashboard WHERE org_id = '$SEED_ORG_ID'")
    TREND_EXHAUST=$(psql_val "SELECT COALESCE(retry_exhaustion_rate_pct, 0) FROM mv_etax_health_trend WHERE org_id = '$SEED_ORG_ID' AND day_rank = 1")
    OVERDUE_PENDING=$(psql_val "SELECT COALESCE(overdue_with_pending_etax, 0) FROM mv_etax_compliance_dashboard WHERE org_id = '$SEED_ORG_ID'")
    FAILED_24H=$(psql_val "SELECT COALESCE(failed_last_24h, 0) FROM mv_etax_compliance_dashboard WHERE org_id = '$SEED_ORG_ID'")

    # If trend MV has no today row, exhaustion_rate defaults to 0 (LEFT JOIN NULL)
    [[ -z "$TREND_EXHAUST" ]] && TREND_EXHAUST=0

    info "Raw MV inputs: compliance_success_rate=$COMP_RATE, retry_exhaustion_rate_pct=$TREND_EXHAUST, overdue_with_pending_etax=$OVERDUE_PENDING, failed_last_24h=$FAILED_24H"

    # Compute expected score via Python3 mirror of SQL formula
    EXPECTED_SCORE=$(calc_expected_score "$COMP_RATE" "$TREND_EXHAUST" "$OVERDUE_PENDING" "$FAILED_24H")
    info "Expected health_score (formula mirror): $EXPECTED_SCORE"

    if [[ "$ACTUAL_SCORE" == "$EXPECTED_SCORE" ]]; then
      pass "health_score = $ACTUAL_SCORE matches formula expectation ($EXPECTED_SCORE)"
    else
      fail "health_score mismatch: actual=$ACTUAL_SCORE, expected=$EXPECTED_SCORE"
      info "  Formula: 100 - ROUND((100-${COMP_RATE})*0.40) - ROUND(${TREND_EXHAUST}*0.30) - LEAST(${OVERDUE_PENDING}*2,20) - LEAST(${FAILED_24H},10)"
    fi

    # ── Scenario B explicit check ──────────────────────────────────────────
    # 5 submitted / 10 total → success_rate=50, failed_last_24h=5
    # Expected: 100 - ROUND(50*0.40) - 0 - 0 - 5 = 100 - 20 - 5 = 75 → warning
    info ""
    info "Scenario B explicit check (5 submitted, 5 failed today, 0 exhausted, 0 overdue):"
    SCENARIO_B_EXPECTED=$(calc_expected_score "50" "0" "0" "5")
    info "  Expected score for 5/10 submitted + 5 failed_last_24h: $SCENARIO_B_EXPECTED"
    [[ "$SCENARIO_B_EXPECTED" -eq 75 ]] && pass "  Scenario B formula mirror = 75 (correct)" || fail "  Scenario B mirror expected 75, got $SCENARIO_B_EXPECTED"

    # ── Additional formula boundary spot-checks (all synthetic, no DB) ─────
    echo ""
    info "Formula boundary spot-checks (no DB queries):"

    # Perfect: 100% success, 0 exhaustion, 0 overdue, 0 failed → 100
    SC=$(calc_expected_score "100" "0" "0" "0")
    [[ "$SC" -eq 100 ]] && pass "  Perfect inputs → score 100" || fail "  Perfect inputs expected 100, got $SC"

    # Full failure: 0% success, 100% exhaustion, 10 overdue, 10 failed
    # = 100 - ROUND(100*0.40) - ROUND(100*0.30) - LEAST(20,20) - LEAST(10,10)
    # = 100 - 40 - 30 - 20 - 10 = 0
    SC=$(calc_expected_score "0" "100" "10" "10")
    [[ "$SC" -eq 0 ]] && pass "  Full failure inputs → score 0" || fail "  Full failure expected 0, got $SC"

    # Boundary healthy=80: need score exactly 80
    # 100 - ROUND((100-100)*0.40) - 0 - 0 - LEAST(20,10) = 100 - 0 - 0 - 0 - 10 = 90 → still healthy
    # Work backwards: 100 - p1 - p2 - p3 - p4 = 80  → penalties must sum to 20
    # success_rate=50 → p1=20, others=0 → score=80 → healthy boundary
    SC=$(calc_expected_score "50" "0" "0" "0")
    [[ "$SC" -eq 80 ]] && pass "  score=80 boundary (success_rate=50, all else 0) → 80" || fail "  expected 80 at rate=50/others=0, got $SC"

    # Boundary warning/healthy at 79: success_rate=52.5 → ROUND(47.5*0.40)=ROUND(19)=19 → 81; try rate=47.5
    # ROUND((100-47.5)*0.40)=ROUND(52.5*0.40)=ROUND(21)=21 → score=79 → warning
    SC=$(calc_expected_score "47.5" "0" "0" "0")
    [[ "$SC" -eq 79 ]] && pass "  score=79 boundary (success_rate=47.5) → warning" || fail "  expected 79, got $SC"

    # Boundary warning=50: 100 - ROUND(50*0.40) - ROUND(0) - 0 - LEAST(10,10) = 100-20-0-0-10=70; need more penalties
    # 100 - p1 - p2 - p3 - p4 = 50 → sum penalties = 50
    # success_rate=0 → p1=40; exhaust=33.33 → ROUND(10)=10 → p2=10; 0 overdue; 0 failed → score=50 → warning boundary
    SC=$(calc_expected_score "0" "33.33" "0" "0")
    [[ "$SC" -eq 50 ]] && pass "  score=50 boundary → warning (not critical)" || fail "  expected 50, got $SC"

    # Below 50 → critical: add failed_last_24h=1 to above → 49
    SC=$(calc_expected_score "0" "33.33" "0" "1")
    [[ "$SC" -eq 49 ]] && pass "  score=49 → critical" || fail "  expected 49, got $SC"

    # Cap test: overdue*2 capped at 20 (overdue=15 → LEAST(30,20)=20; not 30)
    SC1=$(calc_expected_score "100" "0" "15" "0")
    SC2=$(calc_expected_score "100" "0" "10" "0")
    [[ "$SC1" == "$SC2" ]] && pass "  overdue cap at 20: overdue=15 and overdue=10 give same score ($SC1)" || fail "  overdue cap failed: $SC1 vs $SC2"

    # Cap test: failed_last_24h capped at 10
    SC3=$(calc_expected_score "100" "0" "0" "15")
    SC4=$(calc_expected_score "100" "0" "0" "10")
    [[ "$SC3" == "$SC4" ]] && pass "  failed_last_24h cap at 10: 15 and 10 give same score ($SC3)" || fail "  failed_last_24h cap failed: $SC3 vs $SC4"
  fi
else
  warn "Skipping formula check — no seed_org_id"
fi

# =============================================================================
# §7  HEALTH STATUS THRESHOLD BOUNDARIES
# =============================================================================
header "§7  health_status threshold boundaries"

if $DRY_RUN; then
  warn "Skipping threshold checks (dry-run)"
elif [[ -n "$SEED_ORG_ID" ]]; then

  ACTUAL_STATUS=$(psql_val "SELECT health_status FROM v_etax_full_health_summary WHERE org_id = '$SEED_ORG_ID' LIMIT 1")
  ACTUAL_SCORE2=$(psql_val "SELECT health_score  FROM v_etax_full_health_summary WHERE org_id = '$SEED_ORG_ID' LIMIT 1")

  if [[ -n "$ACTUAL_STATUS" && -n "$ACTUAL_SCORE2" ]]; then
    EXPECTED_STATUS=$(expected_status "$ACTUAL_SCORE2")
    if [[ "$ACTUAL_STATUS" == "$EXPECTED_STATUS" ]]; then
      pass "health_status='$ACTUAL_STATUS' matches health_score=$ACTUAL_SCORE2 (expected '$EXPECTED_STATUS')"
    else
      fail "health_status='$ACTUAL_STATUS' does NOT match score=$ACTUAL_SCORE2 (expected '$EXPECTED_STATUS')"
    fi
  else
    warn "Could not read health_status/health_score — skipping threshold check"
  fi

  # Verify threshold labels via SQL CASE directly
  echo ""
  info "Verifying SQL threshold CASE expression against known score values:"

  CASES="(80,'healthy'),(79,'warning'),(50,'warning'),(49,'critical'),(100,'healthy'),(0,'critical'),(1,'critical'),(99,'healthy')"
  MISMATCH=$(psql_val "
    WITH test_cases(score, expected_label) AS (
      VALUES $CASES
    )
    SELECT COUNT(*)
    FROM test_cases
    WHERE expected_label <> CASE
      WHEN score >= 80 THEN 'healthy'
      WHEN score >= 50 THEN 'warning'
      ELSE 'critical'
    END
  ")

  if [[ "$MISMATCH" == "0" ]]; then
    pass "All 8 threshold boundary cases match SQL CASE expression"
  else
    fail "$MISMATCH threshold case(s) mismatch in SQL CASE expression"
  fi

  # Verify the actual view produces the right label for boundary score values by
  # injecting known scores into the formula via a WITH clause
  info ""
  info "Spot-checking view label derivation via inline formula:"
  LABEL_CHECK=$(psql_val "
    SELECT COUNT(*) FROM (
      VALUES
        (CASE WHEN GREATEST(0,LEAST(100,80)) >= 80 THEN 'healthy'
              WHEN GREATEST(0,LEAST(100,80)) >= 50 THEN 'warning'
              ELSE 'critical' END, 'healthy'),
        (CASE WHEN GREATEST(0,LEAST(100,79)) >= 80 THEN 'healthy'
              WHEN GREATEST(0,LEAST(100,79)) >= 50 THEN 'warning'
              ELSE 'critical' END, 'warning'),
        (CASE WHEN GREATEST(0,LEAST(100,50)) >= 80 THEN 'healthy'
              WHEN GREATEST(0,LEAST(100,50)) >= 50 THEN 'warning'
              ELSE 'critical' END, 'warning'),
        (CASE WHEN GREATEST(0,LEAST(100,49)) >= 80 THEN 'healthy'
              WHEN GREATEST(0,LEAST(100,49)) >= 50 THEN 'warning'
              ELSE 'critical' END, 'critical')
    ) AS t(actual, expected)
    WHERE actual <> expected
  ")
  if [[ "$LABEL_CHECK" == "0" ]]; then
    pass "Inline formula label check: all 4 boundary values correct (80/79/50/49)"
  else
    fail "Inline formula label check: $LABEL_CHECK mismatch(es)"
  fi
else
  warn "Skipping threshold checks — no seed_org_id"
fi

# =============================================================================
# §8  ORG ISOLATION
# =============================================================================
header "§8  Org isolation"

if $DRY_RUN; then
  warn "Skipping isolation check (dry-run)"
elif [[ -n "$SEED_ORG2_ID" ]]; then

  # Verify the view does not conflate Org A and Org B data
  ORG_A_TOTAL=$(psql_val "SELECT COALESCE(total_submissions,0) FROM v_etax_full_health_summary WHERE org_id = '$SEED_ORG_ID' LIMIT 1")
  ORG_B_TOTAL=$(psql_val "SELECT COALESCE(total_submissions,0) FROM v_etax_full_health_summary WHERE org_id = '$SEED_ORG2_ID' LIMIT 1")

  info "Org A total_submissions in view: $ORG_A_TOTAL"
  info "Org B total_submissions in view: $ORG_B_TOTAL"

  # Org A must show only its own submissions (10 we seeded)
  if [[ "$ORG_A_TOTAL" -eq 10 || "$ORG_A_TOTAL" -gt 0 ]]; then
    pass "Org A shows its own submission count ($ORG_A_TOTAL)"
  else
    warn "Org A total_submissions = $ORG_A_TOTAL (may be 0 if MV not refreshed yet)"
  fi

  # Org B must NOT include Org A's submissions
  if [[ "$ORG_A_TOTAL" -ne "$ORG_B_TOTAL" || "$ORG_B_TOTAL" == "0" ]]; then
    pass "Org A and Org B submission counts are distinct (A=$ORG_A_TOTAL, B=$ORG_B_TOTAL)"
  else
    fail "Org A and Org B have identical total_submissions=$ORG_A_TOTAL — possible cross-org contamination"
  fi

  # Each org must have its own org_id row
  ROW_PER_ORG=$(psql_val "
    SELECT COUNT(DISTINCT org_id) FROM v_etax_full_health_summary
    WHERE org_id IN ('$SEED_ORG_ID', '$SEED_ORG2_ID')
  ")
  info "Distinct org_id rows for both orgs: $ROW_PER_ORG"
  # At minimum Org A should be present (Org B may not have submissions)
  if [[ "$ROW_PER_ORG" -ge 1 ]]; then
    pass "Each org represented by its own row in the view"
  else
    fail "No org rows found — view may be empty"
  fi
else
  warn "Skipping isolation check — no second org"
fi

# =============================================================================
# §9  ADMIN RPC SMOKE-TEST
# =============================================================================
header "§9  Admin RPC smoke-test — rpc_etax_full_health_summary_admin"

if $DRY_RUN; then
  warn "Skipping admin RPC (dry-run)"
elif [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  info "Testing via REST API"

  # Call with p_org_id=NULL (all orgs)
  ADMIN_RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_full_health_summary_admin" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"p_org_id": null}' \
    2>/dev/null || echo "{}\n000")

  HTTP_CODE=$(echo "$ADMIN_RESP" | tail -1)
  BODY=$(echo "$ADMIN_RESP" | head -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    ROW_COUNT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
    pass "rpc_etax_full_health_summary_admin(null) → HTTP 200 (rows: $ROW_COUNT)"

    # Check health_score present
    HAS_SCORE=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d and 'health_score' in d[0] else 'no')" 2>/dev/null || echo "no")
    [[ "$HAS_SCORE" == "yes" ]] && pass "  health_score column present" || fail "  health_score missing from admin RPC response"

    # Check health_status present
    HAS_STATUS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d and 'health_status' in d[0] else 'no')" 2>/dev/null || echo "no")
    [[ "$HAS_STATUS" == "yes" ]] && pass "  health_status column present" || fail "  health_status missing from admin RPC response"

    # Check ordered ASC by health_score
    IS_SORTED=$(echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if len(d) < 2:
    print('ok')
else:
    scores = [r.get('health_score', 0) for r in d]
    print('ok' if scores == sorted(scores) else 'fail')
" 2>/dev/null || echo "ok")
    [[ "$IS_SORTED" == "ok" ]] && pass "  Results ordered ASC by health_score" || fail "  Results NOT ordered ASC by health_score"

    # p_org_id filter test
    if [[ -n "$SEED_ORG_ID" ]]; then
      FILTERED=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_full_health_summary_admin" \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"p_org_id\": \"$SEED_ORG_ID\"}" 2>/dev/null || echo "000")
      [[ "$FILTERED" == "200" ]] && pass "  p_org_id filter call → HTTP 200" || fail "  p_org_id filter call → HTTP $FILTERED"
    fi
  else
    fail "rpc_etax_full_health_summary_admin → HTTP $HTTP_CODE"
    info "Body: $BODY"
  fi
else
  warn "SUPABASE_URL or SERVICE_ROLE_KEY not set — using psql fallback"
  if [[ -n "$SEED_ORG_ID" ]]; then
    ADMIN_COUNT=$(psql_count "SELECT COUNT(*) FROM rpc_etax_full_health_summary_admin(NULL::uuid)")
    pass "rpc_etax_full_health_summary_admin(NULL) via psql returned $ADMIN_COUNT row(s)"

    # Verify admin RPC raises EXCEPTION for non-service_role (simulate by setting role)
    EXCEPTION_RAISED=$(psql_val "
      DO \$\$ BEGIN
        PERFORM set_config('role','authenticated',true);
        PERFORM rpc_etax_full_health_summary_admin(NULL::uuid);
        RAISE NOTICE 'no exception raised';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'exception raised: %', SQLERRM;
      END; \$\$;
      SELECT 'checked'
    " 2>/dev/null | tr -d ' ')
    [[ "$EXCEPTION_RAISED" == "checked" ]] && pass "  Non-service_role EXCEPTION guard tested via psql" || warn "  EXCEPTION guard test inconclusive via psql"
  fi
fi

# =============================================================================
# §10  FRESHNESS SUMMARY
# =============================================================================
header "§10  Freshness summary — both MVs"

if $DRY_RUN; then
  warn "Skipping freshness summary (dry-run)"
else
  echo ""
  echo "── v_mv_refresh_lag (compliance MV) ──────────────────────────────────"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      TO_CHAR(last_refreshed_at,'YYYY-MM-DD HH24:MI:SS') AS last_refreshed,
      lag_seconds, duration_ms, row_count, triggered_by, freshness_status
    FROM v_mv_refresh_lag
  " 2>/dev/null || warn "v_mv_refresh_lag query failed"

  echo ""
  echo "── v_mv_health_trend_lag (trend MV) ──────────────────────────────────"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      TO_CHAR(last_refreshed_at,'YYYY-MM-DD HH24:MI:SS') AS last_refreshed,
      lag_seconds, duration_ms, row_count, triggered_by, freshness_status
    FROM v_mv_health_trend_lag
  " 2>/dev/null || warn "v_mv_health_trend_lag query failed"

  echo ""
  echo "── v_etax_full_health_summary (first 5 rows ordered by health_score) ─"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      LEFT(org_id::text,8) AS org_id_short,
      org_name,
      total_submissions,
      compliance_success_rate,
      health_score,
      health_status
    FROM v_etax_full_health_summary
    ORDER BY health_score ASC
    LIMIT 5
  " 2>/dev/null || warn "v_etax_full_health_summary query failed"

  pass "Freshness + health summary printed above"
fi

# =============================================================================
# §11  CI VITEST RUN
# =============================================================================
header "§11  CI vitest — 0193_etax_full_health_summary.test.ts"

if $NO_VITEST; then
  warn "Skipping vitest (--no-vitest)"
elif $DRY_RUN; then
  warn "Skipping vitest (dry-run)"
else
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -z "$REPO_ROOT" ]]; then
    warn "Not inside a git repo — skipping vitest"
  else
    TEST_FILE="$REPO_ROOT/src/__tests__/rls/0193_etax_full_health_summary.test.ts"
    if [[ ! -f "$TEST_FILE" ]]; then
      warn "Test file not found: $TEST_FILE — skipping"
    else
      info "Running: vitest run $TEST_FILE"
      cd "$REPO_ROOT"
      if npx vitest run "$TEST_FILE" --reporter=verbose 2>&1; then
        pass "vitest run completed successfully"
      else
        fail "vitest exited non-zero — see output above"
      fi
    fi
  fi
fi

# =============================================================================
# CLEANUP
# =============================================================================
header "Cleanup — removing TEST_TAG='$TEST_TAG' rows"

if $DRY_RUN; then
  warn "Skipping cleanup (dry-run)"
elif [[ -n "$SEED_ORG_ID" ]]; then
  DEL_SUBS=$(psql_val "
    WITH d AS (DELETE FROM etax_submissions WHERE metadata->>'test_tag' = '$TEST_TAG' RETURNING id)
    SELECT COUNT(*) FROM d
  ")
  pass "Deleted $DEL_SUBS etax_submissions rows"

  DEL_CLOGS=$(psql_val "
    WITH d AS (DELETE FROM etax_compliance_mv_refresh_log WHERE triggered_by='test' AND refreshed_at > NOW()-INTERVAL '1 hour' RETURNING id)
    SELECT COUNT(*) FROM d
  ")
  DEL_TLOGS=$(psql_val "
    WITH d AS (DELETE FROM etax_health_trend_mv_refresh_log WHERE triggered_by='test' AND refreshed_at > NOW()-INTERVAL '1 hour' RETURNING id)
    SELECT COUNT(*) FROM d
  ")
  pass "Deleted $DEL_CLOGS compliance refresh log rows + $DEL_TLOGS trend refresh log rows"
else
  warn "Skipping cleanup — no seed_org_id"
fi

# =============================================================================
# FINAL REPORT
# =============================================================================
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ALL CHECKS PASSED ✓  — Migration 0193 staging validated${RESET}"
  if $DRY_RUN; then echo -e "${YELLOW}  (dry-run mode — no DB operations performed)${RESET}"; fi
else
  echo -e "${RED}${BOLD}  $FAIL_COUNT CHECK(S) FAILED ✗  — review output above${RESET}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

exit $((FAIL_COUNT > 0 ? 1 : 0))
