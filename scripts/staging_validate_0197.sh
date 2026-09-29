#!/usr/bin/env bash
# =============================================================================
# staging_validate_0197.sh
# MONOLITH Manufacturing OS — Staging Validator for Migration 0197
#
# Covers:
#   §1  partition_archive_log table structure (columns, types, PK, CHECK)
#   §2  Indexes (partition_name, archived_at, original_range_start)
#   §3  Row Level Security policies
#   §4  v_partition_archive_summary view
#   §5  rpc_partition_archive_log RPC (signature, grants, behaviour)
#   §6  rpc_partition_archive_log_stats RPC (signature, grants, aggregates)
#   §7  updated_at trigger (fn_partition_archive_log_set_updated_at)
#   §8  End-to-end smoke test: insert → query via RPC → stats reflect insert
#   §9  Vitest integration (CI mode)
#
# Usage:
#   SUPABASE_DB_URL=postgres://... ./staging_validate_0197.sh [--skip-ci]
#
# Exit codes: 0 = all PASS, 1 = one or more FAIL
# =============================================================================

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-}"
SKIP_CI=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)  DB_URL="$2"; shift 2 ;;
    --skip-ci) SKIP_CI=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$DB_URL" ]]; then
  if [[ -n "${SUPABASE_PROJECT_REF:-}" && -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
  else
    echo "[FATAL] Set SUPABASE_DB_URL or pass --db-url" >&2; exit 1
  fi
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

PASS=0; FAIL=0; WARN=0

check_pass() { echo -e "  ${GREEN}[PASS]${RESET} $1"; PASS=$((PASS+1)); }
check_fail() { echo -e "  ${RED}[FAIL]${RESET} $1"; FAIL=$((FAIL+1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${RESET} $1"; WARN=$((WARN+1)); }
section()    { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }

sql()  { psql "$DB_URL" -X -A -t -c "$1" 2>/dev/null | tr -d ' \n'; }
sqlv() { psql "$DB_URL" -X -A -t -c "$1" 2>/dev/null; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  MONOLITH — staging_validate_0197.sh                         ║${RESET}"
echo -e "${BOLD}║  Migration 0197: partition_archive_log                       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── §1 Table structure ───────────────────────────────────────────────────────
section "§1 — partition_archive_log table structure"

col_exists() {
  local tbl="$1" col="$2"
  sql "SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='${tbl}' AND column_name='${col}';"
}

TABLE_EXISTS=$(sql "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='partition_archive_log';")
[[ "$TABLE_EXISTS" == "1" ]] \
  && check_pass "partition_archive_log table exists" \
  || check_fail "partition_archive_log table NOT found — run Migration 0197"

for COL in id partition_name original_range_start original_range_end \
           row_count_at_archive size_bytes_at_archive action archived_name \
           backup_file_path backup_size_bytes archived_by archived_at \
           notes script_version hostname created_at updated_at; do
  [[ "$(col_exists partition_archive_log $COL)" == "1" ]] \
    && check_pass "Column: $COL" \
    || check_fail "Column MISSING: $COL"
done

# Primary key on id
PK=$(sql "SELECT COUNT(*) FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema='public' AND tc.table_name='partition_archive_log'
    AND tc.constraint_type='PRIMARY KEY' AND kcu.column_name='id';")
[[ "$PK" == "1" ]] \
  && check_pass "PRIMARY KEY on id confirmed" \
  || check_fail "PRIMARY KEY on id NOT found"

# CHECK constraint on action
CHECK_CONST=$(sql "SELECT COUNT(*) FROM information_schema.check_constraints cc
  JOIN information_schema.constraint_column_usage ccu
    ON cc.constraint_name = ccu.constraint_name
  WHERE ccu.table_schema='public' AND ccu.table_name='partition_archive_log'
    AND ccu.column_name='action';")
[[ "$CHECK_CONST" -ge "1" ]] \
  && check_pass "CHECK constraint on action column exists" \
  || check_fail "CHECK constraint on action column NOT found"

# Verify invalid action value is rejected
BAD_ACTION=$(psql "$DB_URL" -X -A -t -c "
  INSERT INTO public.partition_archive_log
    (partition_name, original_range_start, original_range_end, row_count_at_archive, action, archived_by)
  VALUES ('_validate_bad_action','2024-01-01','2024-02-01',0,'INVALID_ACTION','validate')
  RETURNING id;" 2>&1)
if echo "$BAD_ACTION" | grep -qi "error\|violates\|check"; then
  check_pass "CHECK constraint rejects invalid action value 'INVALID_ACTION'"
else
  check_fail "CHECK constraint did NOT reject invalid action value 'INVALID_ACTION'"
fi

# ─── §2 Indexes ───────────────────────────────────────────────────────────────
section "§2 — Indexes"

check_index() {
  local idx="$1"
  local cnt
  cnt=$(sql "SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public' AND tablename='partition_archive_log' AND indexname='${idx}';")
  [[ "$cnt" == "1" ]] \
    && check_pass "Index exists: $idx" \
    || check_fail "Index MISSING: $idx"
}

check_index "idx_partition_archive_log_partition_name"
check_index "idx_partition_archive_log_archived_at"
check_index "idx_partition_archive_log_range_start"

# ─── §3 RLS policies ──────────────────────────────────────────────────────────
section "§3 — Row Level Security"

RLS_ENABLED=$(sql "SELECT relrowsecurity::TEXT FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname='public' AND c.relname='partition_archive_log';")
[[ "$RLS_ENABLED" == "t" ]] \
  && check_pass "RLS is ENABLED on partition_archive_log" \
  || check_fail "RLS is NOT enabled on partition_archive_log"

SVC_POLICY=$(sql "SELECT COUNT(*) FROM pg_policies
  WHERE schemaname='public' AND tablename='partition_archive_log'
    AND roles::TEXT ILIKE '%service_role%';")
[[ "$SVC_POLICY" -ge "1" ]] \
  && check_pass "service_role policy exists on partition_archive_log" \
  || check_fail "service_role policy NOT found on partition_archive_log"

AUTH_POLICY=$(sql "SELECT COUNT(*) FROM pg_policies
  WHERE schemaname='public' AND tablename='partition_archive_log'
    AND roles::TEXT ILIKE '%authenticated%';")
[[ "$AUTH_POLICY" -ge "1" ]] \
  && check_pass "authenticated policy exists on partition_archive_log (blocks direct read)" \
  || check_warn "authenticated policy not found — direct read may be open"

# ─── §4 v_partition_archive_summary view ─────────────────────────────────────
section "§4 — v_partition_archive_summary view"

VIEW_EXISTS=$(sql "SELECT COUNT(*) FROM information_schema.views
  WHERE table_schema='public' AND table_name='v_partition_archive_summary';")
[[ "$VIEW_EXISTS" == "1" ]] \
  && check_pass "v_partition_archive_summary view exists" \
  || check_fail "v_partition_archive_summary view NOT found"

# Insert a seed row and verify it appears in the view
SEED_NAME="_validate_view_test_$(date +%s)"
psql "$DB_URL" -X -q -c "
  INSERT INTO public.partition_archive_log
    (partition_name, original_range_start, original_range_end, row_count_at_archive, action, archived_by)
  VALUES ('${SEED_NAME}','2020-01-01','2020-02-01',42,'DETACH_RENAME','validate');" 2>/dev/null

VIEW_ROW=$(sql "SELECT COUNT(*) FROM public.v_partition_archive_summary
  WHERE partition_name = '${SEED_NAME}';")
[[ "$VIEW_ROW" == "1" ]] \
  && check_pass "v_partition_archive_summary reflects newly inserted rows" \
  || check_fail "v_partition_archive_summary does NOT show newly inserted row"

# Verify has_backup column is computed correctly
HAS_BACKUP_COMPUTED=$(sql "SELECT has_backup FROM public.v_partition_archive_summary
  WHERE partition_name = '${SEED_NAME}';")
[[ "$HAS_BACKUP_COMPUTED" == "f" ]] \
  && check_pass "v_partition_archive_summary.has_backup = FALSE when no backup_file_path" \
  || check_fail "v_partition_archive_summary.has_backup incorrect for null backup_file_path"

# Verify size_pretty is NULL when size_bytes_at_archive is null
SIZE_PRETTY=$(sql "SELECT size_pretty FROM public.v_partition_archive_summary
  WHERE partition_name = '${SEED_NAME}';")
[[ -z "$SIZE_PRETTY" ]] \
  && check_pass "v_partition_archive_summary.size_pretty is NULL when size_bytes_at_archive is null" \
  || check_warn "v_partition_archive_summary.size_pretty unexpected value: '$SIZE_PRETTY'"

# Check days_since_archive is a non-negative numeric
DAYS=$(sql "SELECT ROUND(days_since_archive::NUMERIC,0)::INT FROM public.v_partition_archive_summary
  WHERE partition_name = '${SEED_NAME}';")
[[ "$DAYS" -ge "0" ]] 2>/dev/null \
  && check_pass "v_partition_archive_summary.days_since_archive is non-negative ($DAYS)" \
  || check_warn "v_partition_archive_summary.days_since_archive could not be verified numerically"

# Cleanup seed
psql "$DB_URL" -X -q -c "
  DELETE FROM public.partition_archive_log WHERE partition_name='${SEED_NAME}';" 2>/dev/null

# ─── §5 rpc_partition_archive_log ────────────────────────────────────────────
section "§5 — rpc_partition_archive_log RPC"

RPC_EXISTS=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log';")
[[ "$RPC_EXISTS" -ge "1" ]] \
  && check_pass "rpc_partition_archive_log function exists" \
  || check_fail "rpc_partition_archive_log NOT found"

# Check parameters
PARAMS=$(sql "SELECT pg_get_function_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log' LIMIT 1;")
for EXPECTED in "p_partition_name" "p_from_date" "p_to_date" "p_limit"; do
  if echo "$PARAMS" | grep -qi "$EXPECTED"; then
    check_pass "Parameter $EXPECTED present in rpc_partition_archive_log signature"
  else
    check_fail "Parameter $EXPECTED MISSING from rpc_partition_archive_log signature"
  fi
done

# SECURITY DEFINER
SEC_DEF=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log'
    AND p.prosecdef = true;")
[[ "$SEC_DEF" -ge "1" ]] \
  && check_pass "rpc_partition_archive_log is SECURITY DEFINER" \
  || check_fail "rpc_partition_archive_log is NOT SECURITY DEFINER"

# GRANT to authenticated
GRANT_AUTH=$(sql "SELECT COUNT(*) FROM information_schema.role_routine_grants
  WHERE routine_schema='public' AND routine_name='rpc_partition_archive_log'
    AND grantee='authenticated' AND privilege_type='EXECUTE';")
[[ "$GRANT_AUTH" -ge "1" ]] \
  && check_pass "EXECUTE granted to 'authenticated' on rpc_partition_archive_log" \
  || check_warn "EXECUTE grant to 'authenticated' not confirmed (check role hierarchy)"

# Callable with no args
CALL_RESULT=$(sqlv "SELECT COUNT(*) FROM public.rpc_partition_archive_log() LIMIT 1;" 2>/dev/null || echo "ERROR")
if echo "$CALL_RESULT" | grep -qi "ERROR"; then
  check_fail "rpc_partition_archive_log() call with no args failed"
else
  check_pass "rpc_partition_archive_log() callable with no arguments"
fi

# p_limit = 1 returns <= 1 row
LIMIT_RESULT=$(sql "SELECT COUNT(*) FROM public.rpc_partition_archive_log(p_limit => 1);")
[[ "$LIMIT_RESULT" -le "1" ]] \
  && check_pass "rpc_partition_archive_log(p_limit=>1) returns at most 1 row" \
  || check_fail "rpc_partition_archive_log(p_limit=>1) returned $LIMIT_RESULT rows (expected <= 1)"

# ─── §6 rpc_partition_archive_log_stats ──────────────────────────────────────
section "§6 — rpc_partition_archive_log_stats RPC"

STATS_EXISTS=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log_stats';")
[[ "$STATS_EXISTS" -ge "1" ]] \
  && check_pass "rpc_partition_archive_log_stats function exists" \
  || check_fail "rpc_partition_archive_log_stats NOT found"

# No required parameters
STATS_PARAMS=$(sql "SELECT pg_get_function_arguments(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log_stats' LIMIT 1;")
[[ -z "$STATS_PARAMS" ]] \
  && check_pass "rpc_partition_archive_log_stats takes no parameters (correct)" \
  || check_warn "rpc_partition_archive_log_stats has unexpected parameters: $STATS_PARAMS"

# SECURITY DEFINER
STATS_SEC=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname='rpc_partition_archive_log_stats'
    AND p.prosecdef = true;")
[[ "$STATS_SEC" -ge "1" ]] \
  && check_pass "rpc_partition_archive_log_stats is SECURITY DEFINER" \
  || check_fail "rpc_partition_archive_log_stats is NOT SECURITY DEFINER"

# GRANT to authenticated
STATS_GRANT=$(sql "SELECT COUNT(*) FROM information_schema.role_routine_grants
  WHERE routine_schema='public' AND routine_name='rpc_partition_archive_log_stats'
    AND grantee='authenticated' AND privilege_type='EXECUTE';")
[[ "$STATS_GRANT" -ge "1" ]] \
  && check_pass "EXECUTE granted to 'authenticated' on rpc_partition_archive_log_stats" \
  || check_warn "EXECUTE grant to 'authenticated' not confirmed (check role hierarchy)"

# Returns exactly 1 row
STATS_ROWS=$(sql "SELECT COUNT(*) FROM public.rpc_partition_archive_log_stats();")
[[ "$STATS_ROWS" == "1" ]] \
  && check_pass "rpc_partition_archive_log_stats() returns exactly 1 row" \
  || check_fail "rpc_partition_archive_log_stats() returned $STATS_ROWS rows (expected 1)"

# total_archived_partitions >= 0
TOTAL=$(sql "SELECT total_archived_partitions FROM public.rpc_partition_archive_log_stats();")
[[ "$TOTAL" -ge "0" ]] 2>/dev/null \
  && check_pass "total_archived_partitions = $TOTAL (valid non-negative integer)" \
  || check_fail "total_archived_partitions value invalid: '$TOTAL'"

# total_rows_archived >= 0
ROWS_ARCH=$(sql "SELECT total_rows_archived FROM public.rpc_partition_archive_log_stats();")
[[ "$ROWS_ARCH" -ge "0" ]] 2>/dev/null \
  && check_pass "total_rows_archived = $ROWS_ARCH (valid non-negative integer)" \
  || check_fail "total_rows_archived value invalid: '$ROWS_ARCH'"

# ─── §7 updated_at trigger ────────────────────────────────────────────────────
section "§7 — fn_partition_archive_log_set_updated_at trigger"

TRIG_FN=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname='fn_partition_archive_log_set_updated_at';")
[[ "$TRIG_FN" -ge "1" ]] \
  && check_pass "fn_partition_archive_log_set_updated_at function exists" \
  || check_fail "fn_partition_archive_log_set_updated_at function NOT found"

TRIG_EXISTS=$(sql "SELECT COUNT(*) FROM information_schema.triggers
  WHERE event_object_schema='public'
    AND event_object_table='partition_archive_log'
    AND trigger_name='trg_partition_archive_log_updated_at';")
[[ "$TRIG_EXISTS" -ge "1" ]] \
  && check_pass "trg_partition_archive_log_updated_at trigger exists" \
  || check_fail "trg_partition_archive_log_updated_at trigger NOT found"

TRIG_TIMING=$(sql "SELECT action_timing FROM information_schema.triggers
  WHERE event_object_schema='public'
    AND event_object_table='partition_archive_log'
    AND trigger_name='trg_partition_archive_log_updated_at'
    AND event_manipulation='UPDATE' LIMIT 1;")
[[ "$TRIG_TIMING" == "BEFORE" ]] \
  && check_pass "Trigger is BEFORE UPDATE (correct for updated_at stamp)" \
  || check_fail "Trigger timing is '$TRIG_TIMING' — expected BEFORE"

# ─── §8 End-to-end smoke test ────────────────────────────────────────────────
section "§8 — End-to-end smoke test: insert → RPC query → stats"

E2E_NAME="_validate_e2e_$(date +%s)"
E2E_ROWS=777

# Insert
psql "$DB_URL" -X -q -c "
  INSERT INTO public.partition_archive_log
    (partition_name, original_range_start, original_range_end,
     row_count_at_archive, action, archived_by, notes)
  VALUES
    ('${E2E_NAME}','2019-01-01','2019-02-01',${E2E_ROWS},'DETACH_BACKUP_RENAME','validate-e2e',
     'end-to-end smoke test row');" 2>/dev/null

# Query via RPC
RPC_FOUND=$(sql "SELECT COUNT(*) FROM public.rpc_partition_archive_log(
  p_partition_name => '${E2E_NAME}');")
[[ "$RPC_FOUND" == "1" ]] \
  && check_pass "E2E: rpc_partition_archive_log found inserted row by partition_name" \
  || check_fail "E2E: rpc_partition_archive_log did NOT find row '${E2E_NAME}'"

# Check has_backup false (no backup_file_path set)
HAS_BACKUP=$(sql "SELECT has_backup FROM public.rpc_partition_archive_log(
  p_partition_name => '${E2E_NAME}') LIMIT 1;")
[[ "$HAS_BACKUP" == "f" ]] \
  && check_pass "E2E: has_backup=FALSE (no backup_file_path set)" \
  || check_warn "E2E: unexpected has_backup value: '$HAS_BACKUP'"

# Stats reflect the insert (total_rows_archived includes our E2E_ROWS)
STATS_TOTAL=$(sql "SELECT total_rows_archived FROM public.rpc_partition_archive_log_stats();")
[[ "$STATS_TOTAL" -ge "$E2E_ROWS" ]] 2>/dev/null \
  && check_pass "E2E: rpc_partition_archive_log_stats().total_rows_archived >= $E2E_ROWS (includes smoke row)" \
  || check_fail "E2E: total_rows_archived=$STATS_TOTAL, expected >= $E2E_ROWS"

# Trigger — update notes and verify updated_at advances
psql "$DB_URL" -X -q -c "
  UPDATE public.partition_archive_log
  SET notes = 'updated by staging validator'
  WHERE partition_name = '${E2E_NAME}';" 2>/dev/null

UPDATED_YEAR=$(sql "SELECT EXTRACT(YEAR FROM updated_at)::INT
  FROM public.partition_archive_log WHERE partition_name='${E2E_NAME}';")
[[ "$UPDATED_YEAR" -ge "2026" ]] 2>/dev/null \
  && check_pass "E2E: updated_at trigger stamped current year ($UPDATED_YEAR) after UPDATE" \
  || check_fail "E2E: updated_at year=$UPDATED_YEAR — trigger may not have fired"

# Cleanup
psql "$DB_URL" -X -q -c "
  DELETE FROM public.partition_archive_log WHERE partition_name='${E2E_NAME}';" 2>/dev/null
check_pass "E2E: cleanup complete"

# ─── §9 Vitest integration ────────────────────────────────────────────────────
section "§9 — Vitest: 0197_partition_archive_log.test.ts (CI mode)"

if $SKIP_CI; then
  check_warn "§9 skipped via --skip-ci flag"
else
  TEST_FILE="src/__tests__/migrations/0197_partition_archive_log.test.ts"
  if [[ -f "$TEST_FILE" ]]; then
    echo "  Running vitest for $TEST_FILE ..."
    if npx vitest run "$TEST_FILE" --reporter=verbose 2>&1 | tail -20; then
      check_pass "Vitest: 0197_partition_archive_log.test.ts passed"
    else
      check_fail "Vitest: 0197_partition_archive_log.test.ts reported failures"
    fi
  else
    check_warn "$TEST_FILE not found — skipping vitest (not checked out locally)"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║            staging_validate_0197.sh — Summary                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GREEN}PASS : $PASS${RESET}"
echo -e "  ${RED}FAIL : $FAIL${RESET}"
echo -e "  ${YELLOW}WARN : $WARN${RESET}"
echo ""
if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}  Result: FAIL — $FAIL check(s) did not pass.${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}  Result: PASS — All required checks passed.${RESET}"
  exit 0
fi
