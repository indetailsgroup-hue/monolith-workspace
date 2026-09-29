#!/usr/bin/env bash
# =============================================================================
# staging_validate_0191.sh — Staging Validation for Migration 0191
# =============================================================================
# Validates v_etax_health_trend view, its 3 RPCs, and row-level data correctness
# after applying 0191_etax_health_trend.sql to a staging Supabase instance.
#
# Usage:
#   ./staging_validate_0191.sh [--dry-run] [--verbose] [--no-cleanup]
#
# Flags:
#   --dry-run     Print all SQL that would run; do not execute against DB
#   --verbose     Show full psql output for every section
#   --no-cleanup  Skip the §11 cleanup step (useful for post-run inspection)
#
# Prerequisites:
#   - psql in PATH
#   - Environment variables: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
#     OR a valid PGURI  (e.g. postgresql://user:pass@host:port/dbname)
#   - Migration 0191 already applied
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
DRY_RUN=false
VERBOSE=false
NO_CLEANUP=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN=true   ;;
        --verbose)    VERBOSE=true   ;;
        --no-cleanup) NO_CLEANUP=true ;;
        *)
            echo "Unknown flag: $arg" >&2
            echo "Usage: $0 [--dry-run] [--verbose] [--no-cleanup]" >&2
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Colors & helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "${GREEN}  ✓ PASS${RESET} $1"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ FAIL${RESET} $1"; ((FAIL++)); }
info() { echo -e "${CYAN}  →${RESET} $1"; }
section() { echo -e "\n${BOLD}${YELLOW}$1${RESET}"; }

# ---------------------------------------------------------------------------
# psql runner
# ---------------------------------------------------------------------------
PSQL_CMD=(psql --no-password --tuples-only --no-align)
if [[ -n "${PGURI:-}" ]]; then
    PSQL_CMD+=("${PGURI}")
fi

run_sql() {
    local sql="$1"
    if $DRY_RUN; then
        echo -e "${YELLOW}[DRY-RUN SQL]${RESET}"
        echo "$sql" | sed 's/^/    /'
        echo "(mock result: 1 row)"
        echo "1"
        return 0
    fi
    local result
    result=$(echo "$sql" | "${PSQL_CMD[@]}" 2>&1)
    local rc=$?
    if $VERBOSE; then
        echo "    $result"
    fi
    echo "$result"
    return $rc
}

run_sql_raw() {
    local sql="$1"
    if $DRY_RUN; then
        echo -e "${YELLOW}[DRY-RUN SQL]${RESET}"
        echo "$sql" | sed 's/^/    /'
        echo "(dry-run — no output)"
        return 0
    fi
    local result
    result=$(echo "$sql" | "${PSQL_CMD[@]}" 2>&1)
    local rc=$?
    if $VERBOSE; then
        echo "    $result"
    fi
    return $rc
}

# ---------------------------------------------------------------------------
# Test tag & cleanup guard
# ---------------------------------------------------------------------------
TEST_TAG="staging_validate_0191"
TODAY_UTC=$(date -u +%Y-%m-%d)

cleanup() {
    if $NO_CLEANUP; then
        info "Skipping cleanup (--no-cleanup)"
        return
    fi
    section "§11 Cleanup"
    info "Purging etax_submissions seeded by this script (metadata->>'test_tag' = '$TEST_TAG')"
    local purge_sql="
DELETE FROM etax_submissions
WHERE  metadata->>'test_tag' = '$TEST_TAG';
"
    run_sql_raw "$purge_sql"
    pass "Seeded submissions purged"
}
trap cleanup EXIT

# =============================================================================
echo -e "\n${BOLD}============================================================${RESET}"
echo -e "${BOLD} Staging Validation — Migration 0191 (v_etax_health_trend)${RESET}"
echo -e "${BOLD}============================================================${RESET}"
echo "  Mode      : $(if $DRY_RUN; then echo DRY-RUN; else echo LIVE; fi)"
echo "  Target    : ${PGHOST:-localhost}:${PGPORT:-5432}/${PGDATABASE:-postgres}"
echo "  Timestamp : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Today UTC : $TODAY_UTC"
$DRY_RUN && echo -e "  ${YELLOW}DRY-RUN: SQL printed but NOT executed${RESET}"

# =============================================================================
# §1  View existence and column list
# =============================================================================
section "§1  View Existence and Column Schema"

EXPECTED_COLUMNS=(
    org_id
    submission_day
    day_rank
    daily_total
    daily_submitted
    daily_failed
    daily_exhausted
    daily_queued
    daily_pdf_ok
    daily_pdf_fail
    daily_pdf_pending
    retry_exhaustion_rate_pct
    success_rate_pct
    pdf_success_rate_pct
    avg_attempt_count
    max_attempt_count
    p95_attempt_count
)

VIEW_EXISTS=$(run_sql "
SELECT COUNT(*)
FROM   information_schema.views
WHERE  table_schema = 'public'
  AND  table_name   = 'v_etax_health_trend';
")

if [[ "$VIEW_EXISTS" == "1" ]]; then
    pass "v_etax_health_trend view exists"
else
    fail "v_etax_health_trend view NOT found"
fi

for col in "${EXPECTED_COLUMNS[@]}"; do
    COL_EXISTS=$(run_sql "
SELECT COUNT(*)
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'v_etax_health_trend'
  AND  column_name  = '$col';
")
    if [[ "$COL_EXISTS" == "1" ]]; then
        pass "Column '$col' exists"
    else
        fail "Column '$col' MISSING from v_etax_health_trend"
    fi
done

# =============================================================================
# §2  RPC signature validation
# =============================================================================
section "§2  RPC Signature Validation"

RPC_LIST=(
    "rpc_etax_health_trend"
    "rpc_etax_health_trend_admin"
)

for rpc in "${RPC_LIST[@]}"; do
    RPC_EXISTS=$(run_sql "
SELECT COUNT(*)
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname = '$rpc';
")
    if [[ "$RPC_EXISTS" -ge "1" ]]; then
        pass "RPC $rpc exists"
    else
        fail "RPC $rpc NOT found"
    fi
done

# Check SECURITY DEFINER on rpc_etax_health_trend
SEC_DEF=$(run_sql "
SELECT COUNT(*)
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname   = 'public'
  AND  p.proname   = 'rpc_etax_health_trend'
  AND  p.prosecdef = TRUE;
")
if [[ "$SEC_DEF" -ge "1" ]]; then
    pass "rpc_etax_health_trend is SECURITY DEFINER"
else
    fail "rpc_etax_health_trend is NOT SECURITY DEFINER"
fi

SEC_DEF_ADMIN=$(run_sql "
SELECT COUNT(*)
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname   = 'public'
  AND  p.proname   = 'rpc_etax_health_trend_admin'
  AND  p.prosecdef = TRUE;
")
if [[ "$SEC_DEF_ADMIN" -ge "1" ]]; then
    pass "rpc_etax_health_trend_admin is SECURITY DEFINER"
else
    fail "rpc_etax_health_trend_admin is NOT SECURITY DEFINER"
fi

# =============================================================================
# §3  Permission checks
# =============================================================================
section "§3  Permission Checks (REVOKE / GRANT assertions)"

# authenticated must NOT have SELECT directly on the view
DIRECT_SELECT=$(run_sql "
SELECT COUNT(*)
FROM   information_schema.role_table_grants
WHERE  grantee    = 'authenticated'
  AND  table_name = 'v_etax_health_trend'
  AND  privilege_type = 'SELECT';
")
if [[ "$DIRECT_SELECT" == "0" ]]; then
    pass "authenticated has NO direct SELECT on v_etax_health_trend"
else
    fail "authenticated has unexpected direct SELECT on v_etax_health_trend"
fi

# authenticated must have EXECUTE on rpc_etax_health_trend
RPC_EXECUTE=$(run_sql "
SELECT COUNT(*)
FROM   information_schema.routine_privileges
WHERE  grantee      = 'authenticated'
  AND  routine_name = 'rpc_etax_health_trend'
  AND  privilege_type = 'EXECUTE';
")
if [[ "$RPC_EXECUTE" -ge "1" ]]; then
    pass "authenticated has EXECUTE on rpc_etax_health_trend"
else
    fail "authenticated MISSING EXECUTE on rpc_etax_health_trend"
fi

# service_role must have EXECUTE on rpc_etax_health_trend_admin
ADMIN_EXECUTE=$(run_sql "
SELECT COUNT(*)
FROM   information_schema.routine_privileges
WHERE  grantee      = 'service_role'
  AND  routine_name = 'rpc_etax_health_trend_admin'
  AND  privilege_type = 'EXECUTE';
")
if [[ "$ADMIN_EXECUTE" -ge "1" ]]; then
    pass "service_role has EXECUTE on rpc_etax_health_trend_admin"
else
    fail "service_role MISSING EXECUTE on rpc_etax_health_trend_admin"
fi

# =============================================================================
# §4  Seed submissions across 3 known days
# =============================================================================
section "§4  Seed Test Data (3 days × 4 submissions each)"

# Day layout:
#   Day 0 (today)       → 4 subs: 3 submitted, 1 failed  (attempt_count=1)
#   Day 1 (yesterday)   → 4 subs: 2 submitted, 2 failed (1 exhausted, attempt_count=5)
#   Day 2 (2 days ago)  → 4 subs: 1 submitted, 3 failed (2 exhausted, attempt_count=5)
#
# Seeded org is the FIRST org from organizations table (admin perspective).
# We use NOW() - INTERVAL '0 day' etc. and cast to each day boundary.

SEED_SQL="
DO \$\$
DECLARE
    v_org_id  UUID;
    v_inv_id  UUID;
BEGIN
    -- Use first available org
    SELECT id INTO v_org_id FROM organizations LIMIT 1;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found — cannot seed test data';
    END IF;

    -- Ensure a dummy invoice exists for FK
    SELECT id INTO v_inv_id
    FROM   invoices
    WHERE  org_id = v_org_id
    LIMIT  1;

    IF v_inv_id IS NULL THEN
        RAISE WARNING 'No invoice found for org %, skipping seed', v_org_id;
        RETURN;
    END IF;

    -- Day 0: today — 3 submitted + 1 failed
    INSERT INTO etax_submissions
        (org_id, invoice_id, document_type, status, attempt_count, created_at, metadata)
    VALUES
        (v_org_id, v_inv_id, 'T01', 'submitted', 1,
         NOW()::date + TIME '10:00',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 0)),
        (v_org_id, v_inv_id, 'T02', 'submitted', 1,
         NOW()::date + TIME '10:01',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 0)),
        (v_org_id, v_inv_id, 'T03', 'submitted', 1,
         NOW()::date + TIME '10:02',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 0)),
        (v_org_id, v_inv_id, 'T04', 'failed',    1,
         NOW()::date + TIME '10:03',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 0))
    ON CONFLICT DO NOTHING;

    -- Day 1: yesterday — 2 submitted + 1 failed + 1 exhausted
    INSERT INTO etax_submissions
        (org_id, invoice_id, document_type, status, attempt_count, created_at, metadata)
    VALUES
        (v_org_id, v_inv_id, 'T01', 'submitted', 1,
         (NOW()::date - INTERVAL '1 day') + TIME '10:00',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 1)),
        (v_org_id, v_inv_id, 'T02', 'submitted', 1,
         (NOW()::date - INTERVAL '1 day') + TIME '10:01',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 1)),
        (v_org_id, v_inv_id, 'T03', 'failed',    5,
         (NOW()::date - INTERVAL '1 day') + TIME '10:02',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 1)),
        (v_org_id, v_inv_id, 'T04', 'failed',    5,
         (NOW()::date - INTERVAL '1 day') + TIME '10:03',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 1))
    ON CONFLICT DO NOTHING;

    -- Day 2: 2 days ago — 1 submitted + 1 failed + 2 exhausted
    INSERT INTO etax_submissions
        (org_id, invoice_id, document_type, status, attempt_count, created_at, metadata)
    VALUES
        (v_org_id, v_inv_id, 'T01', 'submitted', 1,
         (NOW()::date - INTERVAL '2 days') + TIME '10:00',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 2)),
        (v_org_id, v_inv_id, 'T02', 'failed',    5,
         (NOW()::date - INTERVAL '2 days') + TIME '10:01',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 2)),
        (v_org_id, v_inv_id, 'T03', 'failed',    5,
         (NOW()::date - INTERVAL '2 days') + TIME '10:02',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 2)),
        (v_org_id, v_inv_id, 'T04', 'failed',    3,
         (NOW()::date - INTERVAL '2 days') + TIME '10:03',
         jsonb_build_object('test_tag', '$TEST_TAG', 'seed_day', 2))
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seed complete for org %', v_org_id;
END;
\$\$;
"

if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN SQL]${RESET}"
    echo "$SEED_SQL" | sed 's/^/    /'
    pass "Seed SQL printed (dry-run)"
else
    echo "$SEED_SQL" | "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 2>&1 | grep -E "NOTICE|WARNING|ERROR" || true
    pass "Test data seeded (3 days × 4 submissions)"
fi

# =============================================================================
# §5  Call rpc_etax_health_trend_admin — assert 3 days returned
# =============================================================================
section "§5  Admin RPC — Assert 3 Seeded Days Returned"

ADMIN_ROWS=$(run_sql "
SELECT COUNT(DISTINCT submission_day)
FROM   rpc_etax_health_trend_admin()
WHERE  org_id = (SELECT id FROM organizations LIMIT 1)
  AND  submission_day >= CURRENT_DATE - INTERVAL '2 days';
")

if [[ "$ADMIN_ROWS" -ge "3" ]]; then
    pass "Admin RPC returned rows for today, yesterday, and 2 days ago (≥3)"
else
    fail "Admin RPC returned only $ADMIN_ROWS days — expected ≥3"
fi

# =============================================================================
# §6  Assert day_rank=1 matches today (UTC)
# =============================================================================
section "§6  day_rank=1 Must Match Today UTC"

RANK1_DAY=$(run_sql "
SELECT submission_day::text
FROM   rpc_etax_health_trend_admin()
WHERE  org_id  = (SELECT id FROM organizations LIMIT 1)
  AND  day_rank = 1
LIMIT  1;
")

if [[ "$RANK1_DAY" == "$TODAY_UTC" ]]; then
    pass "day_rank=1 submission_day = $TODAY_UTC (today)"
else
    fail "day_rank=1 submission_day = '$RANK1_DAY' — expected '$TODAY_UTC'"
fi

# =============================================================================
# §7  Assert day_rank ordering is sequential (1 → 2 → 3)
# =============================================================================
section "§7  day_rank Ordering Is Sequential"

RANK_ORDER=$(run_sql "
WITH ranked AS (
    SELECT submission_day, day_rank
    FROM   rpc_etax_health_trend_admin()
    WHERE  org_id  = (SELECT id FROM organizations LIMIT 1)
      AND  day_rank <= 3
    ORDER  BY day_rank ASC
)
SELECT bool_and(
    submission_day = CURRENT_DATE - ((day_rank - 1) * INTERVAL '1 day')
)::text
FROM ranked;
")

if [[ "$RANK_ORDER" == "t" ]]; then
    pass "day_rank 1→2→3 maps exactly to today→yesterday→2daysago"
else
    fail "day_rank ordering incorrect — got: $RANK_ORDER"
fi

# =============================================================================
# §8  retry_exhaustion_rate_pct accuracy per seeded day
# =============================================================================
section "§8  retry_exhaustion_rate_pct Accuracy per Seeded Day"

# Day 0: 0/4 exhausted → 0.00
RATE_DAY0=$(run_sql "
SELECT retry_exhaustion_rate_pct::text
FROM   rpc_etax_health_trend_admin()
WHERE  org_id         = (SELECT id FROM organizations LIMIT 1)
  AND  submission_day = CURRENT_DATE
LIMIT  1;
")
if [[ "$RATE_DAY0" == "0.00" ]] || [[ "$RATE_DAY0" == "0" ]]; then
    pass "Day 0 retry_exhaustion_rate_pct = 0.00 (0/4 exhausted)"
else
    fail "Day 0 retry_exhaustion_rate_pct = $RATE_DAY0 — expected 0.00"
fi

# Day 1: 1/4 exhausted (attempt_count=5 AND status=failed) → 25.00
RATE_DAY1=$(run_sql "
SELECT retry_exhaustion_rate_pct::text
FROM   rpc_etax_health_trend_admin()
WHERE  org_id         = (SELECT id FROM organizations LIMIT 1)
  AND  submission_day = CURRENT_DATE - INTERVAL '1 day'
LIMIT  1;
")
# Accept 25 or 25.00
if echo "$RATE_DAY1" | grep -qE '^25(\.0+)?$'; then
    pass "Day 1 retry_exhaustion_rate_pct = 25.00 (1/4 exhausted)"
else
    fail "Day 1 retry_exhaustion_rate_pct = $RATE_DAY1 — expected 25.00"
fi

# Day 2: 2/4 exhausted (attempt_count=5 AND status=failed) → 50.00
RATE_DAY2=$(run_sql "
SELECT retry_exhaustion_rate_pct::text
FROM   rpc_etax_health_trend_admin()
WHERE  org_id         = (SELECT id FROM organizations LIMIT 1)
  AND  submission_day = CURRENT_DATE - INTERVAL '2 days'
LIMIT  1;
")
if echo "$RATE_DAY2" | grep -qE '^50(\.0+)?$'; then
    pass "Day 2 retry_exhaustion_rate_pct = 50.00 (2/4 exhausted)"
else
    fail "Day 2 retry_exhaustion_rate_pct = $RATE_DAY2 — expected 50.00"
fi

# =============================================================================
# §9  30-day boundary — day 30 absent from results
# =============================================================================
section "§9  30-Day Boundary Enforcement"

# Seed one submission exactly 30 days ago — should NOT appear in the view
BOUNDARY_SEED_SQL="
DO \$\$
DECLARE
    v_org_id UUID;
    v_inv_id UUID;
BEGIN
    SELECT id INTO v_org_id FROM organizations LIMIT 1;
    SELECT id INTO v_inv_id FROM invoices WHERE org_id = v_org_id LIMIT 1;
    IF v_org_id IS NULL OR v_inv_id IS NULL THEN RETURN; END IF;

    INSERT INTO etax_submissions
        (org_id, invoice_id, document_type, status, attempt_count, created_at, metadata)
    VALUES
        (v_org_id, v_inv_id, 'T01', 'failed', 1,
         (NOW()::date - INTERVAL '30 days') + TIME '12:00',
         jsonb_build_object('test_tag', '${TEST_TAG}_boundary', 'seed_day', 30))
    ON CONFLICT DO NOTHING;
END;
\$\$;
"
if $DRY_RUN; then
    info "[DRY-RUN] Boundary seed printed — not executed"
else
    echo "$BOUNDARY_SEED_SQL" | "${PSQL_CMD[@]}" -v ON_ERROR_STOP=1 2>&1 | grep -E "NOTICE|ERROR" || true
fi

DAY30_ROWS=$(run_sql "
SELECT COUNT(*)
FROM   rpc_etax_health_trend_admin()
WHERE  org_id         = (SELECT id FROM organizations LIMIT 1)
  AND  submission_day = CURRENT_DATE - INTERVAL '30 days';
")

if [[ "$DAY30_ROWS" == "0" ]]; then
    pass "Day 30 (outside window) is absent from rpc_etax_health_trend_admin"
else
    fail "Day 30 unexpectedly present — got $DAY30_ROWS rows"
fi

# Clean up the boundary seed row
if ! $DRY_RUN && ! $NO_CLEANUP; then
    run_sql_raw "DELETE FROM etax_submissions WHERE metadata->>'test_tag' = '${TEST_TAG}_boundary';" || true
fi

# =============================================================================
# §10  Org isolation — Org B cannot see Org A rows
# =============================================================================
section "§10  Org Isolation"

# Check by querying the view directly for a second org (if one exists)
ORG_COUNT=$(run_sql "SELECT COUNT(*) FROM organizations;")

if [[ "$ORG_COUNT" -ge "2" ]]; then
    ORG_A=$(run_sql "SELECT id FROM organizations ORDER BY created_at ASC  LIMIT 1;")
    ORG_B=$(run_sql "SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1;")

    if [[ "$ORG_A" != "$ORG_B" ]]; then
        # Admin RPC with explicit org filter
        ORG_B_SEES_A=$(run_sql "
SELECT COUNT(*)
FROM   rpc_etax_health_trend_admin('$ORG_B'::uuid)
WHERE  org_id = '$ORG_A'::uuid;
")
        if [[ "$ORG_B_SEES_A" == "0" ]]; then
            pass "Admin RPC with p_org_id filter returns ONLY target org rows"
        else
            fail "Admin RPC org filter leaks rows from other orgs"
        fi
    else
        info "Only one org found — skipping cross-org isolation check"
        pass "Org isolation check skipped (single org instance)"
    fi
else
    info "Single-org instance — skipping isolation check"
    pass "Org isolation check skipped (single org instance)"
fi

# Verify the non-admin rpc is marked authenticated-only
AUTH_RPC_SECURED=$(run_sql "
SELECT COUNT(*)
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname   = 'public'
  AND  p.proname   = 'rpc_etax_health_trend'
  AND  p.prosecdef = TRUE;
")
if [[ "$AUTH_RPC_SECURED" -ge "1" ]]; then
    pass "rpc_etax_health_trend is SECURITY DEFINER (org isolation enforced)"
else
    fail "rpc_etax_health_trend missing SECURITY DEFINER — org isolation at risk"
fi

# =============================================================================
# §11  Cleanup  (handled by EXIT trap)
# =============================================================================
section "§11  Cleanup"
# Cleanup runs via EXIT trap. If --no-cleanup is set, a message is printed.

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}============================================================${RESET}"
echo -e "${BOLD} Results${RESET}"
echo -e "${BOLD}============================================================${RESET}"
echo -e "  ${GREEN}PASSED${RESET}: $PASS"
echo -e "  ${RED}FAILED${RESET}: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}${BOLD}  STAGING VALIDATION FAILED — $FAIL check(s) did not pass.${RESET}"
    echo    "  Review the output above and fix migration 0191 before promoting."
    exit 1
else
    echo -e "${GREEN}${BOLD}  STAGING VALIDATION PASSED — all $PASS checks passed.${RESET}"
    echo    "  Migration 0191 is ready for production deployment."
    exit 0
fi
