#!/usr/bin/env bash
# =============================================================================
# staging_validate_all.sh
# Master staging validation script — chains all per-migration scripts
# in dependency order (0186 → → 0188 → 0189 → 0190 → 0191 → 0192 → 0193 →
# Master staging validation script — chains all per-migration scripts
# and produces a single pass/fail summary table.
#
# Usage:
#   ./scripts/staging_validate_all.sh [--dry-run] [--no-vitest] [--help]
#
# Flags:
#   --dry-run    Mock-CI mode: skip real DB calls, echo each child script
#                command without executing; scripts that don't exist are SKIP
#   --no-vitest  Pass --no-vitest to every child script AND skip the final
#                combined vitest run at the end
#   --help       Print usage and exit
#
# Exit codes:
#   0  All present scripts passed (SKIP does not count as failure)
#   1  One or more scripts FAILED (or other fatal error)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DRY_RUN=false
NO_VITEST=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true ;;
    --no-vitest) NO_VITEST=true ;;
    --help)
      cat <<'HELP'
Usage: staging_validate_all.sh [--dry-run] [--no-vitest] [--help]

  --dry-run    Echo child script commands without executing them.
               Scripts that do not exist are silently marked SKIP.
  --no-vitest  Skip all vitest runs (passed to each child script and
               suppresses the final combined vitest call at the end).
  --help       Print this message and exit.
HELP
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg  (use --help for usage)" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO ]${RESET} $*"; }
ok()      { echo -e "${GREEN}[PASS ]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[SKIP ]${RESET} $*"; }
fail()    { echo -e "${RED}[FAIL ]${RESET} $*"; }
section() { echo -e "\n${BOLD}━━━ $* ━━━${RESET}"; }

# ---------------------------------------------------------------------------
# Build child-script argument list
# ---------------------------------------------------------------------------
CHILD_ARGS=""
if $NO_VITEST;  then CHILD_ARGS="$CHILD_ARGS --no-vitest"; fi
if $DRY_RUN;   then CHILD_ARGS="$CHILD_ARGS --dry-run"; fi

# ---------------------------------------------------------------------------
# Script registry — ordered by dependency (oldest migration first)
# Each entry: "migration_id|script_path"
# Scripts that are known to NOT exist yet are included so they appear as SKIP
# in the summary (not as errors).
# ---------------------------------------------------------------------------
declare -a SCRIPT_REGISTRY=(
  "0186|${SCRIPT_DIR}/staging_validate_0186.sh"
  "0187|${SCRIPT_DIR}/staging_validate_0187.sh"
  "0188|${SCRIPT_DIR}/staging_validate_0188.sh"
  "0189|${SCRIPT_DIR}/staging_validate_0189.sh"
  "0190|${SCRIPT_DIR}/staging_validate_0190.sh"
  "0191|${SCRIPT_DIR}/staging_validate_0191.sh"
  "0192|${SCRIPT_DIR}/staging_validate_0192.sh"
  "0193|${SCRIPT_DIR}/staging_validate_0193.sh"
  "0194|${SCRIPT_DIR}/staging_validate_0194.sh"
  "0195|${SCRIPT_DIR}/staging_validate_0195.sh"
  "0195b|${SCRIPT_DIR}/staging_validate_0195b.sh"
  "0196|${SCRIPT_DIR}/staging_validate_0196.sh"
  "0197|${SCRIPT_DIR}/staging_validate_0197.sh"
  "0198|${SCRIPT_DIR}/staging_validate_0198.sh"
  "0199|${SCRIPT_DIR}/staging_validate_0199.sh"
  "0200|${SCRIPT_DIR}/staging_validate_0200.sh"
  "0201|${SCRIPT_DIR}/staging_validate_0201.sh"
  "0202|${SCRIPT_DIR}/staging_validate_0202.sh"
  "0203|${SCRIPT_DIR}/staging_validate_0203.sh"
  "0204|${SCRIPT_DIR}/staging_validate_0204.sh"
  "0205|${SCRIPT_DIR}/staging_validate_0205.sh"
)

# ---------------------------------------------------------------------------
# Tracking arrays
# ---------------------------------------------------------------------------
declare -A STATUS_MAP    # migration_id → PASS | FAIL | SKIP
declare -A DURATION_MAP  # migration_id → elapsed seconds
declare -a ORDER         # preserve insertion order

OVERALL_EXIT=0
START_TIME=$(date +%s)

# ---------------------------------------------------------------------------
# §1  Environment check
# ---------------------------------------------------------------------------
section "§1 Environment pre-flight"

if [[ -z "${SUPABASE_URL:-}" ]]; then
  warn "SUPABASE_URL is not set — child scripts may fail unless they default to localhost"
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  warn "SUPABASE_SERVICE_ROLE_KEY is not set"
fi
if [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
  warn "SUPABASE_ANON_KEY is not set"
fi

if $DRY_RUN; then
  info "DRY-RUN mode active — no scripts will be executed"
fi
if $NO_VITEST; then
  info "NO-VITEST mode active — vitest runs suppressed in all child scripts"
fi

# ---------------------------------------------------------------------------
# §2  Run each child script in order
# ---------------------------------------------------------------------------
section "§2 Running child scripts in dependency order"

for entry in "${SCRIPT_REGISTRY[@]}"; do
  MIG_ID="${entry%%|*}"
  SCRIPT_PATH="${entry##*|}"
  ORDER+=("$MIG_ID")

  echo ""
  info "Migration ${MIG_ID}: ${SCRIPT_PATH}"

  # Check if script exists
  if [[ ! -f "$SCRIPT_PATH" ]]; then
    warn "Script not found — marking as SKIP (migration ${MIG_ID})"
    STATUS_MAP["$MIG_ID"]="SKIP"
    DURATION_MAP["$MIG_ID"]="—"
    continue
  fi

  # Ensure executable
  chmod +x "$SCRIPT_PATH" 2>/dev/null || true

  if $DRY_RUN; then
    info "DRY-RUN: would execute: bash \"${SCRIPT_PATH}\" ${CHILD_ARGS}"
    STATUS_MAP["$MIG_ID"]="SKIP(dry)"
    DURATION_MAP["$MIG_ID"]="—"
    continue
  fi

  # Execute with timing
  T_START=$(date +%s)
  set +e
  # shellcheck disable=SC1090
  bash "$SCRIPT_PATH" $CHILD_ARGS
  EXIT_CODE=$?
  set -e
  T_END=$(date +%s)
  ELAPSED=$(( T_END - T_START ))
  DURATION_MAP["$MIG_ID"]="${ELAPSED}s"

  if [[ $EXIT_CODE -eq 0 ]]; then
    ok "Migration ${MIG_ID} PASSED in ${ELAPSED}s"
    STATUS_MAP["$MIG_ID"]="PASS"
  else
    fail "Migration ${MIG_ID} FAILED (exit ${EXIT_CODE}) after ${ELAPSED}s"
    STATUS_MAP["$MIG_ID"]="FAIL"
    OVERALL_EXIT=1
  fi
done

# ---------------------------------------------------------------------------
# §3  Optional combined vitest run
# ---------------------------------------------------------------------------
section "§3 Combined vitest run"

if $NO_VITEST; then
  warn "Vitest suppressed via --no-vitest"
else
  info "Running all eTax observability test suites (0186–0205) with vitest..."
  info "  Covers: src/__tests__/rls/ (0186-0195), src/__tests__/migrations/ (0195b-0203), and src/__tests__/integrations/ (0198_0203)"
  TEST_PATTERN="src/__tests__/(rls|migrations|integrations)/(0186|0187|0188|0189|0190|0191|0192|0193|0194|0195|0195b|0196|0197|0198|0199|0200|0201|0202|0203|0205|0198_0203)"

  T_VIT_START=$(date +%s)
  set +e
  cd "$REPO_ROOT"
  npx vitest run --reporter=verbose "$TEST_PATTERN" 2>&1
  VIT_EXIT=$?
  set -e
  T_VIT_END=$(date +%s)
  VIT_ELAPSED=$(( T_VIT_END - T_VIT_START ))

  if [[ $VIT_EXIT -eq 0 ]]; then
    ok "Combined vitest PASSED in ${VIT_ELAPSED}s"
    STATUS_MAP["vitest"]="PASS"
    DURATION_MAP["vitest"]="${VIT_ELAPSED}s"
  else
    fail "Combined vitest FAILED (exit ${VIT_EXIT}) after ${VIT_ELAPSED}s"
    STATUS_MAP["vitest"]="FAIL"
    DURATION_MAP["vitest"]="${VIT_ELAPSED}s"
    OVERALL_EXIT=1
  fi
  ORDER+=("vitest")
fi

# ---------------------------------------------------------------------------
# §4  Summary table
# ---------------------------------------------------------------------------
section "§4 Pass / Fail Summary"

TOTAL_TIME=$(( $(date +%s) - START_TIME ))

echo ""
printf "%-12s %-55s %-10s %s\n" "Migration" "Script" "Duration" "Status"
printf "%s\n" "$(printf '─%.0s' {1..90})"

for MIG_ID in "${ORDER[@]}"; do
  case "$MIG_ID" in
    vitest)
      LABEL="(combined vitest)"
      SCRIPT_LABEL="npx vitest run (all 0186–0205 test suites)"
      ;;
    *)
      LABEL="$MIG_ID"
      SCRIPT_LABEL="staging_validate_${MIG_ID}.sh"
      ;;
  esac

  STATUS="${STATUS_MAP[$MIG_ID]}"
  DUR="${DURATION_MAP[$MIG_ID]}"

  case "$STATUS" in
    PASS)
      STATUS_COL="${GREEN}PASS${RESET}"
      ;;
    FAIL)
      STATUS_COL="${RED}FAIL${RESET}"
      ;;
    SKIP|SKIP\(dry\))
      STATUS_COL="${YELLOW}SKIP${RESET}"
      ;;
    *)
      STATUS_COL="$STATUS"
      ;;
  esac

  printf "%-12s %-55s %-10s " "$LABEL" "$SCRIPT_LABEL" "$DUR"
  echo -e "$STATUS_COL"
done

printf "%s\n" "$(printf '─%.0s' {1..90})"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
for MIG_ID in "${ORDER[@]}"; do
  case "${STATUS_MAP[$MIG_ID]}" in
    PASS)       (( PASS_COUNT++ )) ;;
    FAIL)       (( FAIL_COUNT++ )) ;;
    SKIP|SKIP\(dry\)) (( SKIP_COUNT++ )) ;;
  esac
done

echo ""
echo -e "  ${GREEN}Passed:${RESET} ${PASS_COUNT}   ${RED}Failed:${RESET} ${FAIL_COUNT}   ${YELLOW}Skipped:${RESET} ${SKIP_COUNT}"
echo -e "  Total elapsed: ${TOTAL_TIME}s"
echo ""

if [[ $OVERALL_EXIT -ne 0 ]]; then
  echo -e "${RED}${BOLD}Overall result: FAILED${RESET}"
else
  echo -e "${GREEN}${BOLD}Overall result: PASSED${RESET}"
fi

echo ""
exit $OVERALL_EXIT




