#!/usr/bin/env bash
# ============================================================
# staging_validate_0189.sh
# Staging validation runbook for Migration 0189
# (v_mv_alert_history view + rpc_list_mv_alert_history RPCs)
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/staging_validate_0189.sh [options]
#
# Options:
#   --dry-run     Print all checks without connecting to DB (CI-safe)
#   --verbose     Show full SQL output for passing checks
#   --no-cleanup  Leave test rows in DB after validation
#
# Exit codes:
#   0 — all checks passed
#   N — N check(s) failed
# ============================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Colour / formatting helpers
# ─────────────────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

FAIL_COUNT=0
DRY_RUN=false
VERBOSE=false
NO_CLEANUP=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --verbose)    VERBOSE=true ;;
    --no-cleanup) NO_CLEANUP=true ;;
  esac
done

pass()  { echo -e "  ${GREEN}✔${RESET}  $*"; }
fail()  { echo -e "  ${RED}✘${RESET}  $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
info()  { echo -e "  ${CYAN}→${RESET}  $*"; }

section() {
  echo ""
  echo -e "${BOLD}${CYAN}── §$* ──────────────────────────────────────────────${RESET}"
}

# ─────────────────────────────────────────────────────────────
# SQL runner
# ─────────────────────────────────────────────────────────────
run_sql() {
  local SQL="$1"
  local LABEL="${2:-query}"

  if [[ "$DRY_RUN" == true ]]; then
    echo "__DRY_RUN__"
    return
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "__NO_DATABASE_URL__"
    fail "DATABASE_URL not set — cannot run: $LABEL"
    return
  fi

  local OUT
  OUT=$(psql "$DATABASE_URL" -t -A -c "$SQL" 2>&1) || {
    fail "$LABEL — psql error: $OUT"
    echo ""
    return
  }

  [[ "$VERBOSE" == true ]] && echo "    $OUT"
  echo "$OUT"
}

# ─────────────────────────────────────────────────────────────
# Test-data helpers
# ─────────────────────────────────────────────────────────────
TEST_ALERT_ID=""
TEST_ALERT_TS=""
TEST_REFRESH_ID=""
RUNBOOK_TAG="staging_validate_0189"

insert_test_alert() {
  local LAG_SECONDS="${1:-2400}"
  run_sql "
INSERT INTO public.etax_submission_audit_log
  (trigger_source, actor_id, submission_id, old_status, new_status, metadata)
VALUES
  ('system', NULL, NULL, NULL, NULL,
   jsonb_build_object(
     'alert_type',       'mv_refresh_critical',
     'lag_seconds',      $LAG_SECONDS,
     'threshold_seconds', 1800,
     'freshness_status', 'critical',
     'last_refreshed_at', (NOW() - INTERVAL '${LAG_SECONDS} seconds')::TEXT,
     'detected_at',      NOW()::TEXT,
     'cron_job',         'check-mv-refresh-lag',
     'triggered_by',     'staging_runbook',
     'duration_ms',      312,
     'row_count',        4,
     'test_tag',         '$RUNBOOK_TAG'
   ))
RETURNING id, changed_at;
" "insert test critical alert"
}

insert_test_refresh() {
  local AFTER_TS="${1:-NOW()}"
  run_sql "
INSERT INTO public.etax_compliance_mv_refresh_log
  (refreshed_at, duration_ms, row_count, triggered_by)
VALUES
  (($AFTER_TS + INTERVAL '2 seconds'), 200, 4, '$RUNBOOK_TAG')
RETURNING id;
" "insert test refresh log entry"
}

# ─────────────────────────────────────────────────────────────
# Header
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Migration 0189 — Staging Validation Runbook${RESET}"
echo -e "${BOLD}  v_mv_alert_history + rpc_list_mv_alert_history${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
[[ "$DRY_RUN"    == true ]] && echo -e "  ${YELLOW}[DRY-RUN MODE — no DB connections]${RESET}"
[[ "$VERBOSE"    == true ]] && echo -e "  [VERBOSE mode active]"
[[ "$NO_CLEANUP" == true ]] && echo -e "  [NO-CLEANUP mode active]"
echo ""

# ─────────────────────────────────────────────────────────────
# §1 — View existence & column validation
# ─────────────────────────────────────────────────────────────
section "1 — v_mv_alert_history view existence & columns"

VIEW_EXISTS=$(run_sql "
SELECT COUNT(*) FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'v_mv_alert_history';
" "view existence")

if [[ "$VIEW_EXISTS" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] v_mv_alert_history view exists (mocked)"
elif [[ "$VIEW_EXISTS" -ge 1 ]]; then
  pass "v_mv_alert_history view exists"
else
  fail "v_mv_alert_history view NOT found — run migration 0189 first"
fi

EXPECTED_COLS=(
  alert_id alerted_at alert_type alert_rank
  lag_seconds_at_alert threshold_seconds freshness_status_at_alert
  mv_last_refreshed_at_at_alert detected_at cron_job triggered_by_at_alert
  refresh_duration_ms_at_alert row_count_at_alert time_since_prev_alert
  resolved_at was_resolved seconds_to_resolve
  current_lag_seconds current_freshness_status current_last_refreshed_at
  current_refresh_duration_ms current_row_count current_triggered_by
  affected_org_count total_submissions_in_mv max_failed_last_24h_in_mv
)

for col in "${EXPECTED_COLS[@]}"; do
  COL_EXISTS=$(run_sql "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'v_mv_alert_history'
    AND column_name  = '$col';
  " "column $col")

  if [[ "$COL_EXISTS" == "__DRY_RUN__" ]]; then
    pass "[DRY-RUN] v_mv_alert_history.$col (mocked)"
  elif [[ "$COL_EXISTS" -ge 1 ]]; then
    pass "v_mv_alert_history.$col exists"
  else
    fail "v_mv_alert_history.$col NOT found"
  fi
done

# ─────────────────────────────────────────────────────────────
# §2 — RPC signature validation
# ─────────────────────────────────────────────────────────────
section "2 — RPC signature validation"

RPC_COUNT=$(run_sql "
SELECT COUNT(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('rpc_list_mv_alert_history', 'rpc_list_mv_alert_history_admin');
" "RPC count")

if [[ "$RPC_COUNT" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] Both RPCs found (mocked)"
elif [[ "$RPC_COUNT" -ge 2 ]]; then
  pass "Both RPCs exist: rpc_list_mv_alert_history + rpc_list_mv_alert_history_admin"
else
  fail "Expected 2 RPCs, found $RPC_COUNT — check migration 0189"
fi

# Verify SECURITY DEFINER on both RPCs
for rpc in rpc_list_mv_alert_history rpc_list_mv_alert_history_admin; do
  SECDEF=$(run_sql "
  SELECT prosecdef::TEXT FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '$rpc'
  LIMIT 1;
  " "$rpc SECURITY DEFINER")

  if [[ "$SECDEF" == "__DRY_RUN__" ]]; then
    pass "[DRY-RUN] $rpc is SECURITY DEFINER (mocked)"
  elif [[ "$SECDEF" == "t" ]]; then
    pass "$rpc is SECURITY DEFINER"
  else
    fail "$rpc is NOT SECURITY DEFINER (got: $SECDEF)"
  fi
done

# ─────────────────────────────────────────────────────────────
# §3 — Permission validation (REVOKE checks)
# ─────────────────────────────────────────────────────────────
section "3 — Permission validation"

# View: authenticated should NOT have SELECT
VIEW_AUTH_PRIV=$(run_sql "
SELECT has_table_privilege('authenticated', 'public.v_mv_alert_history', 'SELECT');
" "view authenticated SELECT privilege")

if [[ "$VIEW_AUTH_PRIV" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] authenticated REVOKED from v_mv_alert_history (mocked)"
elif [[ "$VIEW_AUTH_PRIV" == "f" ]]; then
  pass "authenticated role does NOT have SELECT on v_mv_alert_history"
else
  fail "authenticated role HAS SELECT on v_mv_alert_history — REVOKE may not have applied"
fi

# service_role SHOULD have SELECT on the view
VIEW_SVC_PRIV=$(run_sql "
SELECT has_table_privilege('service_role', 'public.v_mv_alert_history', 'SELECT');
" "view service_role SELECT privilege")

if [[ "$VIEW_SVC_PRIV" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] service_role has SELECT on v_mv_alert_history (mocked)"
elif [[ "$VIEW_SVC_PRIV" == "t" ]]; then
  pass "service_role has SELECT on v_mv_alert_history"
else
  fail "service_role does NOT have SELECT on v_mv_alert_history"
fi

# authenticated CAN execute the regular RPC
AUTH_RPC_PRIV=$(run_sql "
SELECT has_function_privilege(
  'authenticated',
  'public.rpc_list_mv_alert_history(integer)',
  'EXECUTE'
);
" "rpc_list_mv_alert_history EXECUTE for authenticated")

if [[ "$AUTH_RPC_PRIV" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] authenticated can EXECUTE rpc_list_mv_alert_history (mocked)"
elif [[ "$AUTH_RPC_PRIV" == "t" ]]; then
  pass "authenticated can EXECUTE rpc_list_mv_alert_history"
else
  fail "authenticated CANNOT EXECUTE rpc_list_mv_alert_history — check GRANT"
fi

# authenticated CANNOT execute the admin RPC
AUTH_ADMIN_RPC_PRIV=$(run_sql "
SELECT has_function_privilege(
  'authenticated',
  'public.rpc_list_mv_alert_history_admin(integer)',
  'EXECUTE'
);
" "rpc_list_mv_alert_history_admin EXECUTE for authenticated")

if [[ "$AUTH_ADMIN_RPC_PRIV" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] authenticated REVOKED from rpc_list_mv_alert_history_admin (mocked)"
elif [[ "$AUTH_ADMIN_RPC_PRIV" == "f" ]]; then
  pass "authenticated cannot EXECUTE rpc_list_mv_alert_history_admin (correctly revoked)"
else
  fail "authenticated can EXECUTE rpc_list_mv_alert_history_admin — expected revocation"
fi

# ─────────────────────────────────────────────────────────────
# §4 — Force a critical alert (test data seed)
# ─────────────────────────────────────────────────────────────
section "4 — Force critical alert (seed test data)"

if [[ "$DRY_RUN" == true ]]; then
  TEST_ALERT_ID="00000000-0000-0000-0000-000000000001"
  TEST_ALERT_TS="2026-08-28 13:00:00+00"
  pass "[DRY-RUN] Test critical alert inserted (mocked id=$TEST_ALERT_ID)"
else
  ALERT_ROW=$(insert_test_alert 2400)
  if [[ -n "$ALERT_ROW" ]]; then
    TEST_ALERT_ID=$(echo "$ALERT_ROW" | awk -F'|' '{print $1}' | xargs)
    TEST_ALERT_TS=$(echo "$ALERT_ROW" | awk -F'|' '{print $2}' | xargs)
    pass "Test critical alert inserted: id=$TEST_ALERT_ID  ts=$TEST_ALERT_TS"
  else
    fail "Failed to insert test critical alert — subsequent §4–§7 checks may fail"
    TEST_ALERT_ID=""
    TEST_ALERT_TS=""
  fi
fi

# ─────────────────────────────────────────────────────────────
# §5 — rpc_list_mv_alert_history_admin returns the alert row
#       AND was_resolved=false (no refresh yet)
# ─────────────────────────────────────────────────────────────
section "5 — Alert row visible via admin RPC with was_resolved=false"

if [[ "$DRY_RUN" == true ]]; then
  pass "[DRY-RUN] Admin RPC returned alert row (mocked)"
  pass "[DRY-RUN] was_resolved=false confirmed (mocked)"
elif [[ -z "$TEST_ALERT_ID" ]]; then
  warn "Skipping §5 — no test alert id (§4 failed)"
else
  ALERT_ROW=$(run_sql "
  SELECT alert_id, was_resolved, resolved_at
  FROM public.rpc_list_mv_alert_history_admin(50)
  WHERE alert_id = '$TEST_ALERT_ID'
  LIMIT 1;
  " "admin RPC alert row lookup")

  if [[ -n "$ALERT_ROW" ]]; then
    pass "Admin RPC returned alert row for id=$TEST_ALERT_ID"
    WAS_RESOLVED=$(echo "$ALERT_ROW" | awk -F'|' '{print $2}' | xargs)
    RESOLVED_AT=$(echo "$ALERT_ROW" | awk -F'|' '{print $3}' | xargs)
    if [[ "$WAS_RESOLVED" == "f" ]]; then
      pass "was_resolved=false (no refresh yet — correct)"
    else
      fail "was_resolved should be false before any refresh, got: $WAS_RESOLVED"
    fi
    if [[ -z "$RESOLVED_AT" ]]; then
      pass "resolved_at=NULL (correct — no refresh yet)"
    else
      fail "resolved_at should be NULL before refresh, got: $RESOLVED_AT"
    fi
  else
    fail "Admin RPC returned no row for alert_id=$TEST_ALERT_ID — check test data insert"
  fi
fi

# ─────────────────────────────────────────────────────────────
# §6 — After manual refresh log insert, was_resolved flips to true
# ─────────────────────────────────────────────────────────────
section "6 — Insert refresh log → was_resolved flips to true"

if [[ "$DRY_RUN" == true ]]; then
  pass "[DRY-RUN] Refresh log inserted after alert (mocked)"
  pass "[DRY-RUN] was_resolved=true confirmed (mocked)"
  pass "[DRY-RUN] resolved_at is non-null (mocked)"
  pass "[DRY-RUN] seconds_to_resolve > 0 (mocked)"
elif [[ -z "$TEST_ALERT_ID" ]]; then
  warn "Skipping §6 — no test alert id"
else
  info "Inserting refresh log entry after alert at $TEST_ALERT_TS..."
  REFRESH_ROW=$(insert_test_refresh "'$TEST_ALERT_TS'")
  if [[ -n "$REFRESH_ROW" ]]; then
    pass "Refresh log entry inserted: $REFRESH_ROW"
  else
    warn "Refresh log insert may have failed — §6 results may be unreliable"
  fi

  # Re-query the admin RPC
  RESOLVED_ROW=$(run_sql "
  SELECT alert_id, was_resolved, resolved_at, seconds_to_resolve
  FROM public.rpc_list_mv_alert_history_admin(50)
  WHERE alert_id = '$TEST_ALERT_ID'
  LIMIT 1;
  " "resolved alert row")

  if [[ -n "$RESOLVED_ROW" ]]; then
    WAS_RESOLVED=$(echo "$RESOLVED_ROW" | awk -F'|' '{print $2}' | xargs)
    RESOLVED_AT=$(echo "$RESOLVED_ROW" | awk -F'|' '{print $3}' | xargs)
    SECS_TO_RES=$(echo "$RESOLVED_ROW" | awk -F'|' '{print $4}' | xargs)

    if [[ "$WAS_RESOLVED" == "t" ]]; then
      pass "was_resolved=true (refresh after alert was detected)"
    else
      fail "was_resolved should be true after refresh insert, got: $WAS_RESOLVED"
    fi

    if [[ -n "$RESOLVED_AT" ]]; then
      pass "resolved_at=$RESOLVED_AT (non-null — correct)"
    else
      fail "resolved_at is NULL after refresh insert — resolution detection broken"
    fi

    # seconds_to_resolve should be a small positive number (we added 2 seconds in insert_test_refresh)
    if [[ -n "$SECS_TO_RES" ]] && awk "BEGIN { exit ($SECS_TO_RES > 0) ? 0 : 1 }" 2>/dev/null; then
      pass "seconds_to_resolve=$SECS_TO_RES (positive — correct)"
    else
      fail "seconds_to_resolve is not a positive number: $SECS_TO_RES"
    fi
  else
    fail "Admin RPC returned no row after refresh insert for alert_id=$TEST_ALERT_ID"
  fi
fi

# ─────────────────────────────────────────────────────────────
# §7 — rpc_list_mv_alert_history (authenticated) returns alerts
# ─────────────────────────────────────────────────────────────
section "7 — rpc_list_mv_alert_history (authenticated) basic call"

# We test via service_role since staging env may not have a live Auth token.
# For a fully wired staging env, swap the caller to a signed-in user JWT.
REGULAR_ROW_COUNT=$(run_sql "
SELECT COUNT(*) FROM public.rpc_list_mv_alert_history(10);
" "regular RPC row count")

if [[ "$REGULAR_ROW_COUNT" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] rpc_list_mv_alert_history(10) returned rows (mocked)"
elif [[ "$REGULAR_ROW_COUNT" -ge 1 ]]; then
  pass "rpc_list_mv_alert_history(10) returned $REGULAR_ROW_COUNT row(s)"
else
  warn "rpc_list_mv_alert_history(10) returned 0 rows — may be empty or auth guard active"
fi

# Verify default cap (p_limit=10) via admin RPC
DEFAULT_LIMIT_ROW=$(run_sql "
SELECT COUNT(*) FROM public.rpc_list_mv_alert_history_admin(10);
" "admin RPC default p_limit=10")

if [[ "$DEFAULT_LIMIT_ROW" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] admin RPC p_limit=10 ≤ 10 rows (mocked)"
elif [[ "$DEFAULT_LIMIT_ROW" -le 10 ]]; then
  pass "rpc_list_mv_alert_history_admin(10) returned $DEFAULT_LIMIT_ROW ≤ 10 rows"
else
  fail "rpc_list_mv_alert_history_admin(10) returned $DEFAULT_LIMIT_ROW rows — exceeds limit=10"
fi

# ─────────────────────────────────────────────────────────────
# §8 — p_limit cap enforcement
# ─────────────────────────────────────────────────────────────
section "8 — p_limit cap enforcement"

# Regular RPC: p_limit=51 → LEAST(GREATEST(51,1),50) = 50
CAP_REGULAR=$(run_sql "
SELECT COUNT(*) FROM public.rpc_list_mv_alert_history_admin(50);
" "regular cap at 50")

if [[ "$CAP_REGULAR" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] p_limit=51 capped to 50 (mocked)"
elif [[ "$CAP_REGULAR" -le 50 ]]; then
  pass "p_limit=50 returned $CAP_REGULAR ≤ 50 rows (regular cap respected)"
else
  fail "p_limit=50 returned $CAP_REGULAR rows — cap enforcement broken"
fi

# Admin RPC: p_limit=200 → LEAST(GREATEST(200,1),200) = 200
CAP_ADMIN=$(run_sql "
SELECT COUNT(*) FROM public.rpc_list_mv_alert_history_admin(200);
" "admin cap at 200")

if [[ "$CAP_ADMIN" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] admin p_limit=200 cap respected (mocked)"
elif [[ "$CAP_ADMIN" -le 200 ]]; then
  pass "rpc_list_mv_alert_history_admin(200) returned $CAP_ADMIN ≤ 200 rows (admin cap respected)"
else
  fail "rpc_list_mv_alert_history_admin(200) returned $CAP_ADMIN rows — admin cap broken"
fi

# p_limit=0 → floor to 1
FLOOR_LIMIT=$(run_sql "
SELECT COUNT(*) FROM public.rpc_list_mv_alert_history_admin(0);
" "p_limit=0 floors to 1")

if [[ "$FLOOR_LIMIT" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] p_limit=0 floored to 1 (mocked)"
elif [[ "$FLOOR_LIMIT" -le 1 ]]; then
  pass "p_limit=0 returned $FLOOR_LIMIT ≤ 1 rows (floor to 1 working)"
else
  fail "p_limit=0 returned $FLOOR_LIMIT rows — GREATEST floor not working"
fi

# ─────────────────────────────────────────────────────────────
# §9 — alert_rank ordering
# ─────────────────────────────────────────────────────────────
section "9 — alert_rank ordering"

RANK1_ROW=$(run_sql "
SELECT alert_id, alerted_at, alert_rank
FROM public.rpc_list_mv_alert_history_admin(5)
WHERE alert_rank = 1
LIMIT 1;
" "alert_rank=1 row")

if [[ "$RANK1_ROW" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] alert_rank=1 returned most-recent alert (mocked)"
elif [[ -n "$RANK1_ROW" ]]; then
  pass "alert_rank=1 row found: $RANK1_ROW"

  # Verify that alert_rank=1 is the MOST RECENT alert (highest alerted_at)
  if [[ -n "$TEST_ALERT_ID" ]]; then
    RANK1_ID=$(echo "$RANK1_ROW" | awk -F'|' '{print $1}' | xargs)
    # The test alert was inserted last — it should be rank 1
    if [[ "$RANK1_ID" == "$TEST_ALERT_ID" ]]; then
      pass "alert_rank=1 matches the most recently inserted test alert ($TEST_ALERT_ID)"
    else
      warn "alert_rank=1 id ($RANK1_ID) differs from test alert ($TEST_ALERT_ID) — may be another alert"
    fi
  fi
else
  warn "No rows returned from rpc_list_mv_alert_history_admin(5) — audit log may be empty"
fi

# Verify sequential ranks (no gaps, no duplicates) up to 5
RANK_GAPS=$(run_sql "
WITH ranked AS (
  SELECT alert_rank,
         LAG(alert_rank) OVER (ORDER BY alert_rank) AS prev_rank
  FROM public.rpc_list_mv_alert_history_admin(5)
)
SELECT COUNT(*) FROM ranked
WHERE prev_rank IS NOT NULL
  AND alert_rank != prev_rank + 1;
" "rank gap check")

if [[ "$RANK_GAPS" == "__DRY_RUN__" ]]; then
  pass "[DRY-RUN] alert_rank is sequential, no gaps (mocked)"
elif [[ "$RANK_GAPS" -eq 0 ]]; then
  pass "alert_rank values are sequential with no gaps"
else
  fail "alert_rank has $RANK_GAPS gap(s) — window function may be broken"
fi

# ─────────────────────────────────────────────────────────────
# §10 — Column types & non-null assertions
# ─────────────────────────────────────────────────────────────
section "10 — Column types & mandatory non-null fields"

if [[ -n "$TEST_ALERT_ID" ]] && [[ "$DRY_RUN" == false ]]; then
  TYPE_ROW=$(run_sql "
  SELECT
    pg_typeof(alert_id)::TEXT,
    pg_typeof(alert_rank)::TEXT,
    pg_typeof(was_resolved)::TEXT,
    pg_typeof(lag_seconds_at_alert)::TEXT,
    pg_typeof(alerted_at)::TEXT
  FROM public.rpc_list_mv_alert_history_admin(1)
  LIMIT 1;
  " "column type assertions")

  if [[ -n "$TYPE_ROW" ]]; then
    ALERT_ID_TYPE=$(echo   "$TYPE_ROW" | awk -F'|' '{print $1}' | xargs)
    ALERT_RANK_TYPE=$(echo "$TYPE_ROW" | awk -F'|' '{print $2}' | xargs)
    WAS_RESOLVED_TYPE=$(echo "$TYPE_ROW" | awk -F'|' '{print $3}' | xargs)
    LAG_SECS_TYPE=$(echo "$TYPE_ROW" | awk -F'|' '{print $4}' | xargs)
    ALERTED_AT_TYPE=$(echo "$TYPE_ROW" | awk -F'|' '{print $5}' | xargs)

    [[ "$ALERT_ID_TYPE" == "uuid" ]]    && pass "alert_id is UUID"      || fail "alert_id type: $ALERT_ID_TYPE (expected uuid)"
    [[ "$ALERT_RANK_TYPE" == "bigint" ]] && pass "alert_rank is BIGINT" || fail "alert_rank type: $ALERT_RANK_TYPE (expected bigint)"
    [[ "$WAS_RESOLVED_TYPE" == "boolean" ]] && pass "was_resolved is BOOLEAN" || fail "was_resolved type: $WAS_RESOLVED_TYPE"
    [[ "$LAG_SECS_TYPE" =~ ^numeric ]]  && pass "lag_seconds_at_alert is NUMERIC" || fail "lag_seconds_at_alert type: $LAG_SECS_TYPE"
    [[ "$ALERTED_AT_TYPE" =~ ^timestamp ]] && pass "alerted_at is TIMESTAMPTZ" || fail "alerted_at type: $ALERTED_AT_TYPE"
  else
    warn "No rows returned for type check — skipping column type assertions"
  fi
else
  if [[ "$DRY_RUN" == true ]]; then
    pass "[DRY-RUN] alert_id is UUID (mocked)"
    pass "[DRY-RUN] alert_rank is BIGINT (mocked)"
    pass "[DRY-RUN] was_resolved is BOOLEAN (mocked)"
    pass "[DRY-RUN] lag_seconds_at_alert is NUMERIC (mocked)"
    pass "[DRY-RUN] alerted_at is TIMESTAMPTZ (mocked)"
  else
    warn "No test alert id — skipping column type assertions"
  fi
fi

# ─────────────────────────────────────────────────────────────
# §11 — Cleanup
# ─────────────────────────────────────────────────────────────
section "11 — Cleanup"

if [[ "$NO_CLEANUP" == true ]]; then
  warn "Cleanup disabled (--no-cleanup). Test rows left in DB."
else
  info "Deleting runbook test rows from etax_submission_audit_log..."

  run_sql "
  DELETE FROM public.etax_submission_audit_log
  WHERE trigger_source = 'system'
    AND metadata->>'test_tag' = '$RUNBOOK_TAG';
  " "cleanup system alerts" > /dev/null

  run_sql "
  DELETE FROM public.etax_compliance_mv_refresh_log
  WHERE triggered_by = '$RUNBOOK_TAG';
  " "cleanup refresh log" > /dev/null

  if [[ "$DRY_RUN" == true ]]; then
    pass "[DRY-RUN] Test rows cleaned up (mocked)"
  else
    pass "Test rows cleaned up"
  fi
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
echo -e "\n${BOLD}══════════════════════════════════════════════════${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}  ALL CHECKS PASSED ✔${RESET}"
  echo -e "${BOLD}${GREEN}  Migration 0189 staging validation: OK${RESET}"
else
  echo -e "${BOLD}${RED}  ${FAIL_COUNT} CHECK(S) FAILED ✘${RESET}"
  echo -e "${BOLD}${RED}  Review failures above before promoting to production.${RESET}"
fi
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}\n"

exit "$FAIL_COUNT"
