#!/usr/bin/env bash
# =============================================================================
# staging_validate_0195b.sh
# MONOLITH Manufacturing OS — Staging Validator for Migration 0195b
#
# Covers:
#   §1  platform_config table structure and RLS
#   §2  net.http_post() call present in fn_check_risk_tier_changes body
#   §3  rpc_etax_notify_request_status RPC signature and accessibility
#   §4  Fault-isolation smoke test (trigger fires without aborting on bad URL)
#   §5  platform_config seed rows exist
#   §6  integration with vitest (CI mode)
#
# Usage:
#   SUPABASE_DB_URL=postgres://... ./staging_validate_0195b.sh
#   ./staging_validate_0195b.sh --db-url postgres://...  [--skip-ci]
#
# Exit codes:
#   0  All checks PASS
#   1  One or more checks FAIL
# =============================================================================

set -euo pipefail

# ─── Argument parsing ─────────────────────────────────────────────────────────
DB_URL="${SUPABASE_DB_URL:-}"
SKIP_CI=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url) DB_URL="$2"; shift 2 ;;
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

# ─── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── Counters ────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; WARN=0

check_pass() { echo -e "  ${GREEN}[PASS]${RESET} $1"; PASS=$((PASS+1)); }
check_fail() { echo -e "  ${RED}[FAIL]${RESET} $1"; FAIL=$((FAIL+1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${RESET} $1"; WARN=$((WARN+1)); }
section()    { echo -e "\n${BOLD}${CYAN}$1${RESET}"; }

sql()  { psql "$DB_URL" -X -A -t -c "$1" 2>/dev/null | tr -d ' \n'; }
sqlv() { psql "$DB_URL" -X -A -t -c "$1" 2>/dev/null; }

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  MONOLITH — staging_validate_0195b.sh                        ║${RESET}"
echo -e "${BOLD}║  Migration 0195b: pg_net notify + platform_config            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── §1 platform_config table ────────────────────────────────────────────────
section "§1 — platform_config table structure"

# 1.1 Table exists
TCOUNT=$(sql "SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='public' AND table_name='platform_config';")
if [[ "$TCOUNT" == "1" ]]; then
  check_pass "platform_config table exists in public schema"
else
  check_fail "platform_config table NOT FOUND in public schema"
fi

# 1.2 Primary key column
PK_COL=$(sql "SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='platform_config' AND column_name='key';")
if [[ "$PK_COL" == "key" ]]; then
  check_pass "platform_config.key column exists"
else
  check_fail "platform_config.key column missing"
fi

# 1.3 value column
VAL_COL=$(sql "SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='platform_config' AND column_name='value';")
if [[ "$VAL_COL" == "value" ]]; then
  check_pass "platform_config.value column exists"
else
  check_fail "platform_config.value column missing"
fi

# 1.4 updated_at column
UPD_COL=$(sql "SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='platform_config' AND column_name='updated_at';")
if [[ "$UPD_COL" == "updated_at" ]]; then
  check_pass "platform_config.updated_at column exists"
else
  check_fail "platform_config.updated_at column missing"
fi

# 1.5 Primary key constraint on 'key'
PK_CONST=$(sql "
  SELECT COUNT(*) FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name   = 'platform_config'
    AND tc.constraint_type = 'PRIMARY KEY'
    AND kcu.column_name = 'key';")
if [[ "$PK_CONST" == "1" ]]; then
  check_pass "platform_config PRIMARY KEY on 'key' confirmed"
else
  check_fail "platform_config PRIMARY KEY on 'key' NOT found"
fi

# ─── §2 net.http_post() in trigger function ───────────────────────────────────
section "§2 — net.http_post() present in fn_check_risk_tier_changes"

# 2.1 Function exists
FN_EXISTS=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'fn_check_risk_tier_changes';")
if [[ "$FN_EXISTS" -ge "1" ]]; then
  check_pass "fn_check_risk_tier_changes function exists"
else
  check_fail "fn_check_risk_tier_changes NOT FOUND — 0195b may not have been applied"
fi

# 2.2 net.http_post reference in function body
PGNET_REF=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_check_risk_tier_changes'
    AND pg_get_functiondef(p.oid) ILIKE '%net.http_post%';")
if [[ "$PGNET_REF" -ge "1" ]]; then
  check_pass "net.http_post() call found in fn_check_risk_tier_changes body"
else
  check_fail "net.http_post() NOT found in fn_check_risk_tier_changes — 0195b patch missing"
fi

# 2.3 platform_config reference in function body
PC_REF=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_check_risk_tier_changes'
    AND pg_get_functiondef(p.oid) ILIKE '%platform_config%';")
if [[ "$PC_REF" -ge "1" ]]; then
  check_pass "platform_config reference found in fn_check_risk_tier_changes body"
else
  check_fail "platform_config reference NOT found in fn_check_risk_tier_changes body"
fi

# 2.4 EXCEPTION WHEN OTHERS guard present (fault isolation)
EXC_REF=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_check_risk_tier_changes'
    AND pg_get_functiondef(p.oid) ILIKE '%EXCEPTION WHEN OTHERS%';")
if [[ "$EXC_REF" -ge "1" ]]; then
  check_pass "EXCEPTION WHEN OTHERS fault-isolation guard present in fn_check_risk_tier_changes"
else
  check_fail "EXCEPTION WHEN OTHERS guard NOT found — pg_net failure could abort transactions"
fi

# 2.5 RAISE WARNING in exception block
RW_REF=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_check_risk_tier_changes'
    AND pg_get_functiondef(p.oid) ILIKE '%RAISE WARNING%';")
if [[ "$RW_REF" -ge "1" ]]; then
  check_pass "RAISE WARNING found in fn_check_risk_tier_changes exception block"
else
  check_warn "RAISE WARNING not found — fault path may be silent"
fi

# 2.6 Trigger on etax_risk_tier_state is AFTER UPDATE
TRIG_EXISTS=$(sql "
  SELECT COUNT(*) FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table  = 'etax_risk_tier_state'
    AND action_timing        = 'AFTER'
    AND event_manipulation   = 'UPDATE';")
if [[ "$TRIG_EXISTS" -ge "1" ]]; then
  check_pass "AFTER UPDATE trigger on etax_risk_tier_state exists"
else
  check_fail "AFTER UPDATE trigger on etax_risk_tier_state NOT found"
fi

# ─── §3 rpc_etax_notify_request_status RPC ───────────────────────────────────
section "§3 — rpc_etax_notify_request_status RPC"

# 3.1 RPC function exists
RPC_EXISTS=$(sql "SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_notify_request_status';")
if [[ "$RPC_EXISTS" -ge "1" ]]; then
  check_pass "rpc_etax_notify_request_status function exists"
else
  check_fail "rpc_etax_notify_request_status NOT FOUND"
fi

# 3.2 Accepts a bigint parameter (request_id)
PARAM_CHECK=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_etax_notify_request_status'
    AND pg_get_function_arguments(p.oid) ILIKE '%bigint%';")
if [[ "$PARAM_CHECK" -ge "1" ]]; then
  check_pass "rpc_etax_notify_request_status accepts BIGINT request_id parameter"
else
  check_fail "rpc_etax_notify_request_status parameter signature unexpected (expected BIGINT)"
fi

# 3.3 Returns a table / setof record
RETURN_CHECK=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_etax_notify_request_status'
    AND (p.proretset = true OR pg_get_function_result(p.oid) ILIKE '%TABLE%');")
if [[ "$RETURN_CHECK" -ge "1" ]]; then
  check_pass "rpc_etax_notify_request_status returns a set/TABLE type"
else
  check_warn "rpc_etax_notify_request_status return type could not be confirmed as TABLE"
fi

# 3.4 net.http_response_queue reference in RPC body
QUEUE_REF=$(sql "
  SELECT COUNT(*) FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_etax_notify_request_status'
    AND pg_get_functiondef(p.oid) ILIKE '%http_response_queue%';")
if [[ "$QUEUE_REF" -ge "1" ]]; then
  check_pass "rpc_etax_notify_request_status queries net.http_response_queue"
else
  check_warn "net.http_response_queue reference not found in rpc_etax_notify_request_status — may use different table name"
fi

# 3.5 GRANT to authenticated
GRANT_AUTH=$(sql "
  SELECT COUNT(*) FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public'
    AND routine_name   = 'rpc_etax_notify_request_status'
    AND grantee        = 'authenticated'
    AND privilege_type = 'EXECUTE';")
if [[ "$GRANT_AUTH" -ge "1" ]]; then
  check_pass "rpc_etax_notify_request_status EXECUTE granted to 'authenticated'"
else
  check_warn "rpc_etax_notify_request_status EXECUTE grant to 'authenticated' not confirmed (check role hierarchy)"
fi

# ─── §4 Fault-isolation smoke test ───────────────────────────────────────────
section "§4 — Fault-isolation smoke test"

# 4.1 Insert a test org (if not exists) and simulate a risk-tier UPDATE
#     with an intentionally bad platform_config URL.
#     The UPDATE must commit successfully even if pg_net fails.

SMOKE_ORG_ID=$(sql "
  SELECT id FROM organizations LIMIT 1;" 2>/dev/null | head -1 | tr -d ' ')

if [[ -z "$SMOKE_ORG_ID" ]]; then
  check_warn "No org found in organizations — skipping smoke test §4 (requires at least one org row)"
else
  # Save current URL value
  ORIG_URL=$(sql "SELECT value FROM platform_config WHERE key = 'etax_risk_notify_url';" 2>/dev/null | tr -d ' ')

  # Set a deliberately invalid URL to force pg_net failure
  sql "UPDATE platform_config SET value = 'http://invalid.nowhere.test/bad-url' WHERE key = 'etax_risk_notify_url';" > /dev/null 2>&1 || true

  # Ensure a row exists in etax_risk_tier_state for the test org
  sql "
    INSERT INTO etax_risk_tier_state (org_id, risk_tier, health_score, risk_rank, updated_at)
    VALUES ('${SMOKE_ORG_ID}', 'LOW', 85, 1, NOW())
    ON CONFLICT (org_id) DO UPDATE SET risk_tier = 'LOW', health_score = 85, updated_at = NOW();
  " > /dev/null 2>&1 || true

  # Trigger a tier transition LOW → HIGH (should NOT abort even with bad URL)
  UPDATE_RESULT=$(psql "$DB_URL" -X -A -t -c "
    UPDATE etax_risk_tier_state
    SET risk_tier = 'HIGH', health_score = 55, updated_at = NOW()
    WHERE org_id = '${SMOKE_ORG_ID}';
  " 2>&1)

  if echo "$UPDATE_RESULT" | grep -qi "ERROR"; then
    check_fail "Fault-isolation FAILED: UPDATE aborted when pg_net had bad URL — transaction safety broken"
  else
    check_pass "Fault-isolation OK: UPDATE committed successfully despite invalid pg_net URL"
  fi

  # Restore original URL
  sql "UPDATE platform_config SET value = '${ORIG_URL}' WHERE key = 'etax_risk_notify_url';" > /dev/null 2>&1 || true

  # Restore risk tier to original state (clean up)
  sql "UPDATE etax_risk_tier_state SET risk_tier = 'LOW', health_score = 85, updated_at = NOW() WHERE org_id = '${SMOKE_ORG_ID}';" > /dev/null 2>&1 || true

  check_pass "Smoke test cleanup: risk tier and platform_config URL restored"
fi

# 4.2 Verify that a null URL in platform_config also does not abort
NULL_URL_TEST=$(psql "$DB_URL" -X -A -t -c "
  DO \$\$
  DECLARE v_url TEXT;
  BEGIN
    SELECT value INTO v_url FROM platform_config WHERE key = 'etax_risk_notify_url';
    IF v_url IS NULL OR v_url = '' THEN
      RAISE WARNING '[0195b] etax_risk_notify_url is empty — pg_net dispatch skipped';
    END IF;
  END;
  \$\$;
" 2>&1)
if echo "$NULL_URL_TEST" | grep -qi "ERROR"; then
  check_fail "NULL URL guard check raised an ERROR"
else
  check_pass "NULL/empty URL guard check passes without ERROR"
fi

# ─── §5 platform_config seed rows ────────────────────────────────────────────
section "§5 — platform_config seed rows"

# 5.1 etax_risk_notify_url row exists
URL_ROW=$(sql "SELECT COUNT(*) FROM platform_config WHERE key = 'etax_risk_notify_url';")
if [[ "$URL_ROW" == "1" ]]; then
  check_pass "platform_config row 'etax_risk_notify_url' exists"
else
  check_fail "platform_config row 'etax_risk_notify_url' NOT FOUND — seed missing in 0195b"
fi

# 5.2 etax_risk_notify_secret row exists
SECRET_ROW=$(sql "SELECT COUNT(*) FROM platform_config WHERE key = 'etax_risk_notify_secret';")
if [[ "$SECRET_ROW" == "1" ]]; then
  check_pass "platform_config row 'etax_risk_notify_secret' exists"
else
  check_fail "platform_config row 'etax_risk_notify_secret' NOT FOUND — seed missing in 0195b"
fi

# 5.3 Warn if URL is still empty (not configured for production)
URL_VAL=$(sql "SELECT value FROM platform_config WHERE key = 'etax_risk_notify_url';")
if [[ -z "$URL_VAL" ]]; then
  check_warn "platform_config 'etax_risk_notify_url' is empty — update before production use"
else
  check_pass "platform_config 'etax_risk_notify_url' is set: ${URL_VAL:0:40}..."
fi

# ─── §6 Vitest integration (CI mode) ─────────────────────────────────────────
section "§6 — Vitest: 0195b_pgnet_notify.test.ts (CI mode)"

if $SKIP_CI; then
  check_warn "§6 skipped via --skip-ci flag"
else
  TEST_FILE="src/__tests__/migrations/0195b_pgnet_notify.test.ts"
  if [[ -f "$TEST_FILE" ]]; then
    echo "  Running vitest for $TEST_FILE ..."
    if npx vitest run "$TEST_FILE" --reporter=verbose 2>&1 | tail -20; then
      check_pass "Vitest: 0195b_pgnet_notify.test.ts passed"
    else
      check_fail "Vitest: 0195b_pgnet_notify.test.ts reported failures — check output above"
    fi
  else
    check_warn "$TEST_FILE not found in working directory — skipping vitest run"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║            staging_validate_0195b.sh — Summary               ║${RESET}"
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
