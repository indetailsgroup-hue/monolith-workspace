#!/usr/bin/env bash
# =============================================================================
# scripts/apply_migrations.sh
# FPR Field-Purchase sub-system — sequential migration apply script
#
# Applies the hosted-security remediation followed by the FPR migrations
# 0176 → 0215 against the target database.
#
# Usage:
#   ./scripts/apply_migrations.sh                    # uses DATABASE_URL from env
#   DATABASE_URL=postgres://... ./scripts/apply_migrations.sh
#   ./scripts/apply_migrations.sh --check            # validate manifest only
#
# .env support:
#   If DATABASE_URL is not set, the script looks for a .env file in the project
#   root (one level above this script's directory) and sources it.
#
# Rollback guard:
#   Each migration runs inside its own transaction (BEGIN/COMMIT already present
#   in each .sql file). psql exits non-zero on the first error; the script
#   aborts immediately (set -e) so subsequent migrations are never applied after
#   a failure. Re-run the script after fixing the failed migration — idempotent
#   CREATE OR REPLACE / DO $$ IF NOT EXISTS $$ guards make re-runs safe.
#
# Requirements:
#   psql (postgresql-client)  — must be on PATH
# =============================================================================

set -euo pipefail

CHECK_ONLY=false
case "${1:-}" in
  "") ;;
  --check) CHECK_ONLY=true ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# Resolve script directory and project root
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Load .env if DATABASE_URL is not already set
# ---------------------------------------------------------------------------
if [[ "$CHECK_ONLY" == false && -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="${PROJECT_ROOT}/.env"
  if [[ -f "$ENV_FILE" ]]; then
    echo "[migrate] Loading DATABASE_URL from ${ENV_FILE}"
    # shellcheck disable=SC1090
    set -a; source "$ENV_FILE"; set +a
  fi
fi

if [[ "$CHECK_ONLY" == false && -z "${DATABASE_URL:-}" ]]; then
  echo "[migrate] ERROR: DATABASE_URL is not set."
  echo "          Set it in your environment or add it to .env"
  exit 1
fi

if [[ "$CHECK_ONLY" == false ]]; then
  case "${DATABASE_URL}" in
    postgres://*|postgresql://*) ;;
    *)
      echo "[migrate] ERROR: DATABASE_URL must be a PostgreSQL connection URI."
      echo "          Expected a value beginning with postgres:// or postgresql://"
      exit 1
      ;;
  esac
fi

# ---------------------------------------------------------------------------
# Deployment manifest
#
# Raw psql deployment does not discover migrations automatically, so every
# production migration is named explicitly and resolved from the canonical
# supabase/migrations directory.
# ---------------------------------------------------------------------------
MIGRATIONS=(
  "0178_notification_platform_metrics_rls.sql"
  "0176_field_purchase_core.sql"
  "0177_field_purchase_line_flow.sql"
  "0178_vendor_master_seed.sql"
  "0179_field_purchase_cron.sql"
  "0180_field_purchase_ledger.sql"
  "0181_fpr_summary_view.sql"
  "0182_fpr_approval_queue.sql"
  "0183_fpr_close_request.sql"
  "0184_fpr_summary_view_v2.sql"
  "0185_fpr_escalate_request.sql"
  "0186_fpr_summary_cron.sql"
  "0187_fpr_reopen_request.sql"
  "0188_fpr_bulk_close.sql"
  "0189_fpr_bulk_reopen.sql"
  "0190_fpr_bulk_escalate.sql"
  "0191_fpr_bulk_reject.sql"
  "0192_fpr_bulk_approve.sql"
  "0193_fpr_bulk_approve_with_notifications.sql"
  "0194_fpr_approved_flex_card_template.sql"
  "0195_fpr_notification_status_view.sql"
  "0196_fpr_retry_notifications.sql"
  "0197_line_outbound_notify_trigger.sql"
  "0198_fpr_realtime_broadcast.sql"
  "0199_fpr_cancel_request.sql"
  "0200_fpr_bulk_cancel.sql"
  "0201_fpr_bulk_cancel_with_notifications.sql"
  "0202_fpr_uncancel_request.sql"
  "0203_fpr_bulk_uncancel.sql"
  "0204_fpr_bulk_uncancel_with_notifications.sql"
  "0205_fpr_auto_uncancel_cron.sql"
  "0206_fpr_bulk_force_close.sql"
  "0207_fpr_force_close_single.sql"
  "0208_outbound_dead_letter.sql"
  "0209_photo_refs_guard.sql"
  "0210_fpr_dead_letter_monitoring.sql"
  "0211_fpr_receiving_confirmation.sql"
  "0212_fpr_vendor_payment_flow.sql"
  "0213_fpr_budget_ceiling.sql"
  "0214_line_rich_menu_config.sql"
  "0215_fpr_bulk_record_payment.sql"
)

TOTAL=${#MIGRATIONS[@]}
APPLIED=0
SKIPPED=0
FAILED=0

HR="──────────────────────────────────────────────────────────────────"

for migration in "${MIGRATIONS[@]}"; do
  FILE="${PROJECT_ROOT}/supabase/migrations/${migration}"
  if [[ ! -f "$FILE" ]]; then
    echo "[migrate] ERROR: required migration not found: ${FILE}"
    exit 1
  fi
done

if [[ "$CHECK_ONLY" == true ]]; then
  echo "[migrate] Deployment manifest valid: ${TOTAL} required migrations found."
  exit 0
fi

echo ""
echo "$HR"
echo "  FPR Migration Apply — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "  Target: configured (connection value redacted)"
echo "  Migrations: ${TOTAL}"
echo "$HR"
echo ""

# ---------------------------------------------------------------------------
# Apply each migration
# ---------------------------------------------------------------------------
for migration in "${MIGRATIONS[@]}"; do
  FILE="${PROJECT_ROOT}/supabase/migrations/${migration}"

  echo -n "  [RUN]  ${migration} ... "

  # psql -v ON_ERROR_STOP=1 causes psql to exit non-zero on any SQL error.
  # set -e then aborts the script so no further migrations run after a failure.
  if psql "${DATABASE_URL}" \
       -v ON_ERROR_STOP=1 \
       --single-transaction \
       --quiet \
       -f "$FILE" 2>&1; then
    echo "OK"
    APPLIED=$(( APPLIED + 1 ))
  else
    echo "FAILED"
    FAILED=$(( FAILED + 1 ))
    echo ""
    echo "  ERROR: Migration ${migration} failed — aborting."
    echo "  Fix the error and re-run. Already-applied migrations are idempotent."
    echo ""
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "$HR"
printf "  Applied: %-3s  Skipped: %-3s  Failed: %-3s  Total: %s\n" \
  "$APPLIED" "$SKIPPED" "$FAILED" "$TOTAL"
echo "$HR"
echo ""

if [[ $FAILED -gt 0 ]]; then
  echo "  RESULT: FAILED"
  exit 1
fi

echo "  RESULT: ALL MIGRATIONS APPLIED SUCCESSFULLY"
echo ""
exit 0
