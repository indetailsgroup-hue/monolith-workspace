#!/usr/bin/env bash
# =============================================================================
# run_integration_tests.sh
# FPR Field-Purchase sub-system — combined smoke-test runner
#
# Runs all twenty test suites sequentially, reports per-suite PASS/FAIL/SKIP,
# and exits non-zero if any suite fails.
#
# Suites (in execution order):
#   1. line_webhook_handler_test.ts                              — unit tests
#   2. rpc_get_fpr_approval_queue_integration_test.ts            — integration
#   3. rpc_close_field_purchase_request_integration_test.ts      — integration
#   4. rpc_escalate_field_purchase_request_integration_test.ts   — integration
#   5. rpc_reopen_field_purchase_request_integration_test.ts           — integration
#   6. rpc_bulk_close_field_purchase_request_integration_test.ts        — integration
#   7. rpc_bulk_reopen_field_purchase_request_integration_test.ts       — integration
#   8. rpc_bulk_escalate_field_purchase_request_integration_test.ts     — integration
#   9. rpc_bulk_reject_field_purchase_request_integration_test.ts       — integration
#  10. rpc_bulk_approve_field_purchase_request_integration_test.ts      — integration
#  11. rpc_bulk_approve_with_notifications_integration_test.ts           — integration
#  12. rpc_retry_fpr_notifications_integration_test.ts                   — integration
#  13. line_oa_dispatch_worker_integration_test.ts                       — integration
#  14. rpc_cancel_field_purchase_request_integration_test.ts             — integration
#  15. rpc_bulk_cancel_field_purchase_request_integration_test.ts        — integration
#  16. rpc_uncancel_field_purchase_request_integration_test.ts           — integration
#  17. rpc_bulk_uncancel_field_purchase_request_integration_test.ts      — integration
#  18. line_oa_dispatch_worker_drain_retry_integration_test.ts           — integration
#  19. rpc_bulk_force_close_field_purchase_request_integration_test.ts   — integration
#  20. fn_cron_alert_dead_letter_fpr_integration_test.ts                  — integration
#  21. e2e_smoke_test.ts                                                  — e2e
#
# Usage:
#   ./run_integration_tests.sh                     # loads .env from script dir
#   SUPABASE_ENV_FILE=/path/to/.env ./run_integration_tests.sh
#
# .env format (one KEY=VALUE per line, # comments supported):
#   SUPABASE_URL=http://localhost:54321
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...
#   SUPABASE_JWT_SECRET=your-jwt-secret-at-least-32-chars
#
# Required env vars for integration suites:
#   SUPABASE_URL              — PostgREST base URL
#   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS for setup/teardown)
#   SUPABASE_JWT_SECRET       — HS256 secret used to sign test JWTs
#
# The unit test suite (line_webhook_handler_test.ts) uses no network and
# requires no env vars; it runs in every environment.
#
# Deno flags:
#   --allow-env   — required by all suites (Deno.env.get)
#   --allow-net   — required by integration suites (fetch to Supabase)
#   --no-check    — skips TypeScript type-check for faster CI iteration
#                   (remove this flag if you want full type safety enforced)
# Updated for migration 0188 / 0187 additions and migration 0199 dispatch worker:
#   5. rpc_reopen_field_purchase_request_integration_test.ts  — integration
#   6. rpc_bulk_close_field_purchase_request_integration_test.ts — integration
# =============================================================================

# -e intentionally omitted: we capture each suite's exit code manually
set -uo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SUPABASE_ENV_FILE:-${SCRIPT_DIR}/.env}"

# ---------------------------------------------------------------------------
# Load shared .env (if present)
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  echo "  env  : loading $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  echo "  env  : no .env found at $ENV_FILE — relying on shell environment"
fi

# ---------------------------------------------------------------------------
# Suite registry
# Format: "display_name|relative_file_path|requires_network"
#   requires_network=1  → adds --allow-net; =0 → omitted (unit tests)
# ---------------------------------------------------------------------------
SUITES=(
  "unit:line_webhook             |line_webhook_handler_test.ts|0"
  "integration:approval_queue    |rpc_get_fpr_approval_queue_integration_test.ts|1"
  "integration:close_request     |rpc_close_field_purchase_request_integration_test.ts|1"
  "integration:escalate_request  |rpc_escalate_field_purchase_request_integration_test.ts|1"
  "integration:reopen_request    |rpc_reopen_field_purchase_request_integration_test.ts|1"
  "integration:bulk_close        |rpc_bulk_close_field_purchase_request_integration_test.ts|1"
  "integration:bulk_reopen       |rpc_bulk_reopen_field_purchase_request_integration_test.ts|1"
  "integration:bulk_escalate     |rpc_bulk_escalate_field_purchase_request_integration_test.ts|1"
  "integration:bulk_reject        |rpc_bulk_reject_field_purchase_request_integration_test.ts|1"
  "integration:bulk_approve       |rpc_bulk_approve_field_purchase_request_integration_test.ts|1"
  "integration:bulk_approve_notif |rpc_bulk_approve_with_notifications_integration_test.ts|1"
  "integration:retry_fpr_notif    |rpc_retry_fpr_notifications_integration_test.ts|1"
  "integration:dispatch_worker    |line_oa_dispatch_worker_integration_test.ts|1"
  "integration:cancel_request     |rpc_cancel_field_purchase_request_integration_test.ts|1"
  "integration:bulk_cancel        |rpc_bulk_cancel_field_purchase_request_integration_test.ts|1"
  "integration:uncancel_request   |rpc_uncancel_field_purchase_request_integration_test.ts|1"
  "integration:bulk_uncancel      |rpc_bulk_uncancel_field_purchase_request_integration_test.ts|1"
  "integration:dispatch_drain_retry |line_oa_dispatch_worker_drain_retry_integration_test.ts|1"
  "integration:bulk_force_close   |rpc_bulk_force_close_field_purchase_request_integration_test.ts|1"
  "integration:dead_letter_alert  |fn_cron_alert_dead_letter_fpr_integration_test.ts|1"
  "e2e:smoke_test                 |e2e_smoke_test.ts|2"
)

# Parallel arrays to accumulate results (bash 3 compatible — no associative arrays)
RESULT_LABELS=()   # PASS | FAIL | SKIP
ELAPSED_LABELS=()  # e.g. "3s"
SUITE_NAMES=()     # display names
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ---------------------------------------------------------------------------
# Separator helpers
# ---------------------------------------------------------------------------
HR_HEAVY="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
HR_LIGHT="────────────────────────────────────────────────────────────────────────"
HR_DOUBLE="════════════════════════════════════════════════════════════════════════"

# ---------------------------------------------------------------------------
# Run each suite
# ---------------------------------------------------------------------------
echo ""
echo "$HR_DOUBLE"
echo "  FPR SMOKE-TEST RUNNER"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "$HR_DOUBLE"

for entry in "${SUITES[@]}"; do
  # Parse entry fields
  DISPLAY_NAME="$(echo "$entry" | cut -d'|' -f1 | xargs)"
  REL_PATH="$(echo "$entry"     | cut -d'|' -f2 | xargs)"
  NEEDS_NET="$(echo "$entry"    | cut -d'|' -f3 | xargs)"

  FILE="${SCRIPT_DIR}/${REL_PATH}"

  echo ""
  echo "$HR_HEAVY"
  printf "  SUITE : %s\n" "$DISPLAY_NAME"
  printf "  FILE  : %s\n" "$REL_PATH"
  echo "$HR_HEAVY"

  SUITE_NAMES+=("$DISPLAY_NAME")

  # Skip if file does not exist
  if [[ ! -f "$FILE" ]]; then
    echo "  [SKIP] file not found — $FILE"
    RESULT_LABELS+=("SKIP")
    ELAPSED_LABELS+=("—")
    SKIP_COUNT=$(( SKIP_COUNT + 1 ))
    continue
  fi

  # Build deno flags
  DENO_FLAGS="--allow-env"
  if [[ "$NEEDS_NET" == "1" ]]; then
    DENO_FLAGS="$DENO_FLAGS --allow-net"
  fi

  START_TS=$(date +%s)

  # Run deno test; capture exit code without triggering set -e
  deno test $DENO_FLAGS --no-check "$FILE" 2>&1
  EXIT_CODE=$?

  END_TS=$(date +%s)
  ELAPSED=$(( END_TS - START_TS ))

  ELAPSED_LABELS+=("${ELAPSED}s")

  if [[ $EXIT_CODE -eq 0 ]]; then
    RESULT_LABELS+=("PASS")
    PASS_COUNT=$(( PASS_COUNT + 1 ))
  else
    RESULT_LABELS+=("FAIL")
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
  fi
done

# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------
echo ""
echo "$HR_DOUBLE"
echo "  SMOKE-TEST SUMMARY"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "$HR_DOUBLE"
echo ""
printf "  %-8s  %-6s  %s\n" "RESULT" "TIME" "SUITE"
echo "  $HR_LIGHT"

OVERALL_EXIT=0
for i in "${!SUITE_NAMES[@]}"; do
  result="${RESULT_LABELS[$i]}"
  elapsed="${ELAPSED_LABELS[$i]}"
  name="${SUITE_NAMES[$i]}"

  case "$result" in
    PASS) icon="✓ PASS" ;;
    FAIL) icon="✗ FAIL" ; OVERALL_EXIT=1 ;;
    SKIP) icon="  SKIP" ;;
    *)    icon="? ????" ;;
  esac

  printf "  %-8s  %-6s  %s\n" "$icon" "$elapsed" "$name"
done

echo "  $HR_LIGHT"
echo ""
printf "  Passed: %-3s  Failed: %-3s  Skipped: %-3s  Total: %s\n" \
  "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT" "${#SUITE_NAMES[@]}"
echo ""
echo "$HR_DOUBLE"

if [[ $OVERALL_EXIT -ne 0 ]]; then
  echo ""
  echo "  RESULT: FAILED — one or more suites did not pass."
  echo ""
  exit 1
fi

echo ""
echo "  RESULT: ALL PASSED"
echo ""
exit 0
