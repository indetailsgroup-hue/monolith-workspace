#!/usr/bin/env bash
# Run the fifteen db-verify pgTAP suites, each in its own psql process, and check
# every TAP output with scripts/line-ci-tap.mjs. A failing suite never stops the
# ones after it; the script exits 1 if any suite failed, was incomplete, was
# skipped or left no result file.
#
#   LINE_DB_TEST_DSN     connection string of an existing test database (required).
#                        This script never creates or starts a database.
#   LINE_DB_TAP_DIR      output directory (default: tap)
#   PSQL_BIN             psql executable (default: psql)
#   NODE_BIN             node executable (default: node)
#   LINE_DB_SHOW_STDERR  set to 1 to also print each suite's stderr
#
# Per suite it writes <suite>.tap (psql stdout), <suite>.stderr (psql stderr) and
# <suite>.result.json (parser verdict with the psql exit code). The DSN is never
# echoed; stderr stays in its file unless LINE_DB_SHOW_STDERR=1.
set -u
set -o pipefail

: "${LINE_DB_TEST_DSN:?LINE_DB_TEST_DSN is required}"
TAP_DIR="${LINE_DB_TAP_DIR:-tap}"
PSQL="${PSQL_BIN:-psql}"
NODE="${NODE_BIN:-node}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Git Bash: psql.exe and node.exe need C:/ style paths (pwd -W); elsewhere keep ROOT.
if NATIVE_ROOT="$(cd "$ROOT" && pwd -W 2>/dev/null)" && [ -n "$NATIVE_ROOT" ]; then
  ROOT="$NATIVE_ROOT"
fi
PARSER="$ROOT/scripts/line-ci-tap.mjs"
# The real migration, by absolute path. The fail-closed suite only reads it.
P010_MIGRATION="$ROOT/supabase/migrations/0198_line_oa_revoke_client_write_grants.sql"
P012_MIGRATION="$ROOT/supabase/migrations/0199_line_oa_restrict_definer_execute.sql"

SUITES=(
  workflow_db_invariants trust_kernel_tenancy trust_kernel_governance
  trust_kernel_release trust_kernel_bundles trust_kernel_containment
  trust_kernel_safety repair_phase0_organization repair_phase0_containment
  line_outbound_claim_record line_oa_client_write_revoke
  line_oa_client_write_revoke_fail_closed line_oa_definer_execute_matrix
  line_oa_definer_execute_fail_closed line_inbound_handler_retry
)

mkdir -p "$TAP_DIR" || exit 2
# One id per run, so the assembler can refuse result files left by another run.
export LINE_DB_RUN_ID="${LINE_DB_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LINE_DB_RUN_ID=$LINE_DB_RUN_ID" >> "$GITHUB_ENV"
fi

failed=0
failed_names=""
for suite in "${SUITES[@]}"; do
  out="$TAP_DIR/${suite}.tap"
  err="$TAP_DIR/${suite}.stderr"
  res="$TAP_DIR/${suite}.result.json"
  # Outputs of an earlier run must not stand in for this one.
  rm -f -- "$out" "$err" "$res"

  args=(-X -tA -v ON_ERROR_STOP=1)
  case "$suite" in
    line_outbound_claim_record|line_oa_client_write_revoke|line_oa_definer_execute_matrix|line_inbound_handler_retry)
      # These suites own only ROLLBACK; open their transaction in the same psql
      # session so fixtures, audit rows, throwaway roles, grants and test-only
      # triggers can never autocommit.
      args+=(-c "begin;") ;;
    line_oa_client_write_revoke_fail_closed)
      # Same wrapper; the suite re-runs the real 0198 via \ir.
      args+=(-v "p010_migration=$P010_MIGRATION" -c "begin;") ;;
    line_oa_definer_execute_fail_closed)
      # Same wrapper; the suite re-runs the real 0199 via \ir.
      args+=(-v "p012_migration=$P012_MIGRATION" -c "begin;") ;;
  esac
  args+=(-f "$ROOT/supabase/tests/${suite}.sql")

  echo "== ${suite}"
  "$PSQL" "${args[@]}" -d "$LINE_DB_TEST_DSN" >"$out" 2>"$err" </dev/null
  rc=$?
  [ -f "$out" ] && cat -- "$out"
  if [ "${LINE_DB_SHOW_STDERR:-0}" = "1" ] && [ -s "$err" ]; then
    echo "-- ${suite} stderr" >&2
    cat -- "$err" >&2
  fi

  "$NODE" "$PARSER" check "$out" "$rc" "$suite" "$res" "$err"
  parser_rc=$?
  if [ "$rc" -ne 0 ] || [ "$parser_rc" -ne 0 ] || [ ! -s "$res" ]; then
    failed=$((failed + 1))
    failed_names="$failed_names $suite"
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "FAILED: $failed of ${#SUITES[@]} suites:$failed_names" >&2
  exit 1
fi
echo "all ${#SUITES[@]} suites passed the strict TAP check"
