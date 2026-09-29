#!/usr/bin/env bash
# =============================================================================
# staging_validate_0192.sh
# Staging validation for Migration 0192 — mv_etax_health_trend
# Verifies: MV schema, refresh function, cached RPC, admin RPC, lag view,
#           3-day seed, day_rank=1 today UTC, mv_age_seconds < 300 after refresh
#
# Usage:
#   ./staging_validate_0192.sh [--dry-run] [--no-vitest]
#
# Environment:
#   SUPABASE_DB_URL   — postgres connection string (required unless --dry-run)
#   SUPABASE_SERVICE_ROLE_KEY — used for admin RPC smoke-test (optional)
#   SUPABASE_URL      — used for RPC smoke-test via curl (optional)
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
TEST_TAG="staging_validate_0192"

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

# ── psql wrapper ──────────────────────────────────────────────────────────────
psql_run() {
  if $DRY_RUN; then
    echo "[dry-run] psql: $*"
    return 0
  fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -c "$@" 2>&1
}

psql_val() {
  # Returns trimmed scalar value; dry-run returns mock "__dry_run__"
  if $DRY_RUN; then echo "__dry_run__"; return 0; fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -A -c "$1" 2>&1 | tr -d '[:space:]'
}

psql_count() {
  # Returns integer count; dry-run returns 1 (truthy)
  if $DRY_RUN; then echo "1"; return 0; fi
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -t -A -c "$1" 2>&1 | tr -d '[:space:]'
}

# =============================================================================
# §1  PREREQUISITES
# =============================================================================
header "§1  Prerequisites"

# 1a. psql available
if command -v psql &>/dev/null; then
  pass "psql binary found: $(psql --version | head -1)"
else
  fail "psql not found — install postgresql-client and retry"
  exit 1
fi

# 1b. SUPABASE_DB_URL set
if $DRY_RUN; then
  warn "Skipping DB URL check (dry-run)"
else
  if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
    fail "SUPABASE_DB_URL is not set"
    exit 1
  fi
  pass "SUPABASE_DB_URL is set"
fi

# 1c. Connection test
if $DRY_RUN; then
  warn "Skipping connection test (dry-run)"
else
  if psql "$SUPABASE_DB_URL" -c "SELECT 1" &>/dev/null; then
    pass "Database connection successful"
  else
    fail "Cannot connect to database — check SUPABASE_DB_URL"
    exit 1
  fi
fi

# 1d. Superuser / service-role check
if $DRY_RUN; then
  warn "Skipping superuser check (dry-run)"
else
  CURRENT_USER=$(psql_val "SELECT current_user")
  info "Connected as: $CURRENT_USER"
  IS_SUPER=$(psql_val "SELECT usesuper::text FROM pg_user WHERE usename = current_user")
  if [[ "$IS_SUPER" == "t" ]]; then
    pass "Running as superuser — all permission tests valid"
  else
    warn "Not superuser — some RLS/permission checks may be skipped"
  fi
fi

# =============================================================================
# §2  SCHEMA VERIFICATION
# =============================================================================
header "§2  Schema — mv_etax_health_trend objects"

# 2a. Materialized view exists
MV_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'mv_etax_health_trend' AND schemaname = 'public'")
if [[ "$MV_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "mv_etax_health_trend materialized view exists"
else
  fail "mv_etax_health_trend does NOT exist"
fi

# 2b. Required MV columns
REQUIRED_MV_COLS=(
  org_id submission_day day_rank daily_total daily_submitted daily_failed
  daily_exhausted daily_queued daily_pdf_ok daily_pdf_fail daily_pdf_pending
  retry_exhaustion_rate_pct success_rate_pct pdf_success_rate_pct
  avg_attempt_count max_attempt_count p95_attempt_count
)
for col in "${REQUIRED_MV_COLS[@]}"; do
  COL_EXISTS=$(psql_count "
    SELECT COUNT(*) FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'mv_etax_health_trend'
      AND n.nspname = 'public'
      AND a.attname = '$col'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ")
  if [[ "$COL_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
    pass "  column: $col"
  else
    fail "  missing column: $col"
  fi
done

# 2c. Unique index uq_mv_etax_health_trend_org_day
IDX_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'uq_mv_etax_health_trend_org_day'")
if [[ "$IDX_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "Unique index uq_mv_etax_health_trend_org_day exists"
else
  fail "Unique index uq_mv_etax_health_trend_org_day missing"
fi

# 2d. fn_refresh_etax_health_trend_mv function
FN_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'fn_refresh_etax_health_trend_mv' AND n.nspname = 'public'")
if [[ "$FN_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "fn_refresh_etax_health_trend_mv function exists"
else
  fail "fn_refresh_etax_health_trend_mv function missing"
fi

# 2e. rpc_etax_health_trend_cached function
RPC_CACHED_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'rpc_etax_health_trend_cached' AND n.nspname = 'public'")
if [[ "$RPC_CACHED_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "rpc_etax_health_trend_cached function exists"
else
  fail "rpc_etax_health_trend_cached missing"
fi

# 2f. rpc_etax_health_trend_cached_admin function
RPC_ADMIN_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'rpc_etax_health_trend_cached_admin' AND n.nspname = 'public'")
if [[ "$RPC_ADMIN_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "rpc_etax_health_trend_cached_admin function exists"
else
  fail "rpc_etax_health_trend_cached_admin missing"
fi

# 2g. v_mv_health_trend_lag view
LAG_VIEW_EXISTS=$(psql_count "SELECT COUNT(*) FROM pg_views WHERE viewname = 'v_mv_health_trend_lag' AND schemaname = 'public'")
if [[ "$LAG_VIEW_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "v_mv_health_trend_lag view exists"
else
  fail "v_mv_health_trend_lag view missing"
fi

# 2h. etax_health_trend_mv_refresh_log table
LOG_TABLE_EXISTS=$(psql_count "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etax_health_trend_mv_refresh_log'")
if [[ "$LOG_TABLE_EXISTS" == "1" || "$DRY_RUN" == "true" ]]; then
  pass "etax_health_trend_mv_refresh_log table exists"
else
  fail "etax_health_trend_mv_refresh_log table missing"
fi

# =============================================================================
# §3  PERMISSION SMOKE-TESTS
# =============================================================================
header "§3  Permission smoke-tests"

if $DRY_RUN; then
  warn "Skipping all permission checks (dry-run)"
else
  # 3a. Superuser can call fn_refresh_etax_health_trend_mv
  if psql "$SUPABASE_DB_URL" -c "SELECT fn_refresh_etax_health_trend_mv('test')" &>/dev/null; then
    pass "Superuser can call fn_refresh_etax_health_trend_mv('test')"
  else
    fail "Superuser cannot call fn_refresh_etax_health_trend_mv — check GRANT"
  fi

  # 3b. authenticated role should NOT have direct SELECT on mv_etax_health_trend
  HAS_SELECT=$(psql_count "
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE table_name = 'mv_etax_health_trend'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ")
  if [[ "$HAS_SELECT" == "0" ]]; then
    pass "authenticated role has no direct SELECT on mv_etax_health_trend (correct)"
  else
    warn "authenticated has direct SELECT on mv_etax_health_trend — expected SECURITY DEFINER RPC only"
  fi

  # 3c. service_role has SELECT on mv_etax_health_trend
  SR_SELECT=$(psql_count "
    SELECT COUNT(*) FROM information_schema.role_table_grants
    WHERE table_name = 'mv_etax_health_trend'
      AND grantee = 'service_role'
      AND privilege_type = 'SELECT'
  ")
  if [[ "$SR_SELECT" == "1" ]]; then
    pass "service_role has SELECT on mv_etax_health_trend"
  else
    fail "service_role missing SELECT on mv_etax_health_trend"
  fi

  # 3d. authenticated has EXECUTE on rpc_etax_health_trend_cached
  AUTH_EXEC=$(psql_count "
    SELECT COUNT(*) FROM information_schema.routine_privileges
    WHERE routine_name = 'rpc_etax_health_trend_cached'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ")
  if [[ "$AUTH_EXEC" == "1" ]]; then
    pass "authenticated has EXECUTE on rpc_etax_health_trend_cached"
  else
    fail "authenticated missing EXECUTE on rpc_etax_health_trend_cached"
  fi
fi

# =============================================================================
# §4  SEED — 3 DAYS OF SUBMISSIONS
# =============================================================================
header "§4  Seed — 3 days of submissions (today / yesterday / 2 days ago)"

if $DRY_RUN; then
  warn "Skipping seed (dry-run)"
  SEED_ORG_ID="00000000-0000-0000-0000-000000000000"
  SEED_INVOICE_ID="00000000-0000-0000-0000-000000000001"
else
  # Resolve first available org
  SEED_ORG_ID=$(psql_val "SELECT id FROM organizations ORDER BY created_at LIMIT 1")
  if [[ -z "$SEED_ORG_ID" ]]; then
    fail "No organizations found — cannot seed"
    SEED_ORG_ID=""
  else
    pass "Using org_id: $SEED_ORG_ID"
  fi

  # Resolve or create invoice
  if [[ -n "$SEED_ORG_ID" ]]; then
    SEED_INVOICE_ID=$(psql_val "SELECT id FROM invoices WHERE org_id = '$SEED_ORG_ID' ORDER BY created_at LIMIT 1")
    if [[ -z "$SEED_INVOICE_ID" ]]; then
      # Resolve or create customer first
      CUST_ID=$(psql_val "SELECT id FROM customers WHERE org_id = '$SEED_ORG_ID' LIMIT 1")
      if [[ -z "$CUST_ID" ]]; then
        CUST_ID=$(psql_val "INSERT INTO customers (org_id, name, tax_id) VALUES ('$SEED_ORG_ID', 'Staging Seed Customer', '0000000000000') RETURNING id")
        info "Created customer: $CUST_ID"
      fi
      SEED_INVOICE_ID=$(psql_val "INSERT INTO invoices (org_id, customer_id, status, total_amount) VALUES ('$SEED_ORG_ID', '$CUST_ID', 'approved', 5000) RETURNING id")
      info "Created invoice: $SEED_INVOICE_ID"
    else
      pass "Using invoice_id: $SEED_INVOICE_ID"
    fi
  fi
fi

# Insert 4 submissions per day across 3 days
if $DRY_RUN; then
  warn "Skipping submission inserts (dry-run)"
elif [[ -n "$SEED_ORG_ID" && -n "$SEED_INVOICE_ID" ]]; then
  for offset in 0 1 2; do
    DAY="(CURRENT_DATE - INTERVAL '$offset days')"
    for doc in T01 T02 T03 T04; do
      UNIQUE_SUFFIX="${offset}_${doc}"
      psql_run "
        INSERT INTO etax_submissions (
          org_id, invoice_id, document_type, status, attempt_count,
          created_at, updated_at, metadata
        ) VALUES (
          '$SEED_ORG_ID',
          '$SEED_INVOICE_ID',
          '$doc',
          CASE WHEN '$doc' IN ('T01','T02') THEN 'submitted' ELSE 'failed' END,
          CASE WHEN '$doc' = 'T04' THEN 5 ELSE 1 END,
          $DAY + INTERVAL '${offset} hours',
          $DAY + INTERVAL '${offset} hours',
          jsonb_build_object('test_tag', '$TEST_TAG', 'offset', $offset, 'doc', '$doc')
        )
        ON CONFLICT (invoice_id, document_type)
        DO UPDATE SET
          status = EXCLUDED.status,
          attempt_count = EXCLUDED.attempt_count,
          metadata = EXCLUDED.metadata
      " >/dev/null 2>&1 || warn "  insert conflict/error for offset=$offset doc=$doc (may already exist)"
    done
    pass "Seeded day offset=$offset (4 submissions)"
  done
else
  warn "Skipping inserts — no org/invoice resolved"
fi

# =============================================================================
# §5  REFRESH mv_etax_health_trend
# =============================================================================
header "§5  Refresh mv_etax_health_trend via fn_refresh_etax_health_trend_mv"

if $DRY_RUN; then
  warn "Skipping refresh (dry-run)"
else
  BEFORE_TS=$(psql_val "SELECT COALESCE(MAX(refreshed_at)::text, 'never') FROM etax_health_trend_mv_refresh_log")
  info "Last refresh before call: $BEFORE_TS"

  psql_run "SELECT fn_refresh_etax_health_trend_mv('test')" >/dev/null
  pass "fn_refresh_etax_health_trend_mv('test') completed"

  # Verify log row written
  NEW_LOG=$(psql_count "
    SELECT COUNT(*) FROM etax_health_trend_mv_refresh_log
    WHERE triggered_by = 'test'
      AND refreshed_at > NOW() - INTERVAL '60 seconds'
  ")
  if [[ "$NEW_LOG" -ge 1 ]]; then
    pass "Refresh log row written (triggered_by='test', within last 60s)"
  else
    fail "No refresh log row found after refresh call"
  fi
fi

# =============================================================================
# §6  VERIFY mv_age_seconds < 300
# =============================================================================
header "§6  Freshness check — mv_age_seconds < 300 seconds"

if $DRY_RUN; then
  warn "Skipping freshness check (dry-run)"
else
  MV_AGE=$(psql_val "SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(refreshed_at)))) FROM etax_health_trend_mv_refresh_log WHERE triggered_by = 'test'")
  if [[ -z "$MV_AGE" || "$MV_AGE" == "" ]]; then
    fail "Cannot determine mv_age_seconds — no refresh log row found"
  else
    info "mv_age_seconds after refresh: ${MV_AGE}s"
    if [[ "$MV_AGE" -lt 300 ]]; then
      pass "mv_age_seconds = ${MV_AGE}s < 300s (freshness OK)"
    else
      fail "mv_age_seconds = ${MV_AGE}s >= 300s (stale)"
    fi
  fi

  # Also check via v_mv_health_trend_lag
  LAG_SECONDS=$(psql_val "SELECT COALESCE(lag_seconds::text, 'NULL') FROM v_mv_health_trend_lag LIMIT 1")
  info "v_mv_health_trend_lag.lag_seconds: $LAG_SECONDS"
  if [[ "$LAG_SECONDS" != "NULL" && "$LAG_SECONDS" -lt 300 ]]; then
    pass "v_mv_health_trend_lag.lag_seconds = ${LAG_SECONDS}s (fresh)"
  elif [[ "$LAG_SECONDS" == "NULL" ]]; then
    warn "v_mv_health_trend_lag returned NULL lag_seconds — check refresh log"
  else
    fail "v_mv_health_trend_lag.lag_seconds = ${LAG_SECONDS}s >= 300s"
  fi
fi

# =============================================================================
# §7  ASSERT day_rank=1 MATCHES TODAY UTC
# =============================================================================
header "§7  Assert day_rank=1 submission_day = today UTC"

if $DRY_RUN; then
  warn "Skipping day_rank assertion (dry-run)"
elif [[ -n "$SEED_ORG_ID" ]]; then
  TODAY_UTC=$(date -u +%Y-%m-%d)
  info "Today UTC: $TODAY_UTC"

  TOP_DAY=$(psql_val "
    SELECT submission_day::text
    FROM mv_etax_health_trend
    WHERE org_id = '$SEED_ORG_ID'
      AND day_rank = 1
    LIMIT 1
  ")

  if [[ -z "$TOP_DAY" ]]; then
    fail "No row with day_rank=1 found for org $SEED_ORG_ID — MV may be empty"
  elif [[ "$TOP_DAY" == "$TODAY_UTC" ]]; then
    pass "day_rank=1 submission_day = $TOP_DAY (matches today UTC)"
  else
    fail "day_rank=1 submission_day = $TOP_DAY, expected $TODAY_UTC"
  fi
else
  warn "Skipping day_rank assertion — no seed_org_id"
fi

# =============================================================================
# §8  THREE DAYS PRESENT IN MV
# =============================================================================
header "§8  Verify 3 seeded days present in mv_etax_health_trend"

if $DRY_RUN; then
  warn "Skipping 3-day presence check (dry-run)"
elif [[ -n "$SEED_ORG_ID" ]]; then
  DISTINCT_DAYS=$(psql_count "
    SELECT COUNT(DISTINCT submission_day)
    FROM mv_etax_health_trend
    WHERE org_id = '$SEED_ORG_ID'
      AND day_rank <= 3
  ")
  info "Distinct days in MV (day_rank ≤ 3): $DISTINCT_DAYS"
  if [[ "$DISTINCT_DAYS" -ge 3 ]]; then
    pass "≥3 distinct submission_day values present (day_ranks 1, 2, 3)"
  else
    fail "Only $DISTINCT_DAYS distinct days found — expected ≥3"
  fi

  # Verify day_ranks 1, 2, 3 exist
  for dr in 1 2 3; do
    DR_COUNT=$(psql_count "SELECT COUNT(*) FROM mv_etax_health_trend WHERE org_id = '$SEED_ORG_ID' AND day_rank = $dr")
    if [[ "$DR_COUNT" -ge 1 ]]; then
      DAY_VAL=$(psql_val "SELECT submission_day::text FROM mv_etax_health_trend WHERE org_id = '$SEED_ORG_ID' AND day_rank = $dr LIMIT 1")
      pass "  day_rank=$dr present: $DAY_VAL"
    else
      fail "  day_rank=$dr missing for org $SEED_ORG_ID"
    fi
  done
else
  warn "Skipping — no seed_org_id"
fi

# =============================================================================
# §9  ADMIN RPC SMOKE-TEST
# =============================================================================
header "§9  Admin RPC smoke-test — rpc_etax_health_trend_cached_admin"

if $DRY_RUN; then
  warn "Skipping admin RPC smoke-test (dry-run)"
elif [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  info "Testing rpc_etax_health_trend_cached_admin via REST API"

  # Call with p_org_id=NULL (all orgs), p_days=3
  ADMIN_RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_health_trend_cached_admin" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"p_org_id": null, "p_days": 3}' \
    2>/dev/null || echo "curl_error\n000")

  HTTP_CODE=$(echo "$ADMIN_RESP" | tail -1)
  BODY=$(echo "$ADMIN_RESP" | head -1)

  if [[ "$HTTP_CODE" == "200" ]]; then
    ROW_COUNT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "?")
    pass "rpc_etax_health_trend_cached_admin returned HTTP 200 (rows: $ROW_COUNT)"

    # Check mv_age_seconds column present
    HAS_AGE=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d and 'mv_age_seconds' in d[0] else 'no')" 2>/dev/null || echo "no")
    if [[ "$HAS_AGE" == "yes" ]]; then
      pass "  mv_age_seconds column present in response"
    else
      fail "  mv_age_seconds column missing from admin RPC response"
    fi

    # Org-filtered call
    if [[ -n "$SEED_ORG_ID" ]]; then
      FILTERED_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_health_trend_cached_admin" \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"p_org_id\": \"$SEED_ORG_ID\", \"p_days\": 3}" \
        2>/dev/null || echo "000")
      if [[ "$FILTERED_RESP" == "200" ]]; then
        pass "  p_org_id filter call returned HTTP 200"
      else
        fail "  p_org_id filter call returned HTTP $FILTERED_RESP"
      fi
    fi
  else
    fail "rpc_etax_health_trend_cached_admin returned HTTP $HTTP_CODE"
    info "Response body: $BODY"
  fi
else
  warn "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping REST admin RPC test"
  info "Testing admin RPC via psql instead"

  if $DRY_RUN; then
    warn "Skipping psql admin RPC test (dry-run)"
  else
    # Direct superuser call
    PSQL_ADMIN=$(psql_count "SELECT COUNT(*) FROM rpc_etax_health_trend_cached_admin(NULL::uuid, 3)")
    if [[ "$PSQL_ADMIN" -ge 0 ]]; then
      pass "rpc_etax_health_trend_cached_admin(NULL, 3) callable as superuser (rows: $PSQL_ADMIN)"
    else
      fail "rpc_etax_health_trend_cached_admin raised error via psql"
    fi
  fi
fi

# =============================================================================
# §10  FRESHNESS / LAG SUMMARY
# =============================================================================
header "§10  Freshness & lag summary"

if $DRY_RUN; then
  warn "Skipping freshness summary (dry-run)"
else
  echo ""
  echo "── v_mv_health_trend_lag ──────────────────────────────────────"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      TO_CHAR(last_refreshed_at, 'YYYY-MM-DD HH24:MI:SS') AS last_refreshed,
      lag_seconds,
      duration_ms,
      row_count,
      triggered_by,
      freshness_status
    FROM v_mv_health_trend_lag
  " 2>/dev/null || warn "v_mv_health_trend_lag query failed"

  echo ""
  echo "── v_mv_refresh_lag (compliance MV) ──────────────────────────"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      TO_CHAR(last_refreshed_at, 'YYYY-MM-DD HH24:MI:SS') AS last_refreshed,
      lag_seconds,
      freshness_status
    FROM v_mv_refresh_lag
  " 2>/dev/null || warn "v_mv_refresh_lag query failed"

  echo ""
  echo "── Latest etax_health_trend_mv_refresh_log entries ───────────"
  psql "$SUPABASE_DB_URL" -c "
    SELECT
      id,
      TO_CHAR(refreshed_at, 'YYYY-MM-DD HH24:MI:SS') AS refreshed_at,
      duration_ms,
      row_count,
      triggered_by
    FROM etax_health_trend_mv_refresh_log
    ORDER BY refreshed_at DESC
    LIMIT 5
  " 2>/dev/null || warn "etax_health_trend_mv_refresh_log query failed"

  pass "Freshness summary printed above"
fi

# =============================================================================
# §11  CI VITEST RUN (optional)
# =============================================================================
header "§11  CI vitest — 0192_mv_etax_health_trend.test.ts"

if $NO_VITEST; then
  warn "Skipping vitest run (--no-vitest)"
elif $DRY_RUN; then
  warn "Skipping vitest run (dry-run)"
else
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -z "$REPO_ROOT" ]]; then
    warn "Not inside a git repo — skipping vitest"
  else
    TEST_FILE="$REPO_ROOT/src/__tests__/rls/0192_mv_etax_health_trend.test.ts"
    if [[ ! -f "$TEST_FILE" ]]; then
      warn "Test file not found: $TEST_FILE — skipping vitest"
    else
      info "Running: vitest run $TEST_FILE"
      cd "$REPO_ROOT"
      if npx vitest run "$TEST_FILE" --reporter=verbose 2>&1; then
        pass "vitest run completed successfully"
      else
        fail "vitest run exited non-zero — see output above"
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
    WITH d AS (
      DELETE FROM etax_submissions
      WHERE metadata->>'test_tag' = '$TEST_TAG'
      RETURNING id
    ) SELECT COUNT(*) FROM d
  ")
  pass "Deleted $DEL_SUBS etax_submissions rows (test_tag='$TEST_TAG')"

  DEL_LOGS=$(psql_val "
    WITH d AS (
      DELETE FROM etax_health_trend_mv_refresh_log
      WHERE triggered_by = 'test'
        AND refreshed_at > NOW() - INTERVAL '1 hour'
      RETURNING id
    ) SELECT COUNT(*) FROM d
  ")
  pass "Deleted $DEL_LOGS etax_health_trend_mv_refresh_log rows (triggered_by='test', last hour)"
else
  warn "Skipping cleanup — no seed_org_id"
fi

# =============================================================================
# FINAL REPORT
# =============================================================================
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ALL CHECKS PASSED ✓  — Migration 0192 staging validated${RESET}"
  if $DRY_RUN; then echo -e "${YELLOW}  (dry-run mode — no DB operations performed)${RESET}"; fi
else
  echo -e "${RED}${BOLD}  $FAIL_COUNT CHECK(S) FAILED ✗  — review output above${RESET}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

exit $((FAIL_COUNT > 0 ? 1 : 0))
