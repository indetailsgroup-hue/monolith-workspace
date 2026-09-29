#!/usr/bin/env bash
# =============================================================================
# etax_partition_lifecycle.sh
# MONOLITH Manufacturing OS — eTax Submissions Partition Lifecycle Manager
#
# Purpose:
#   - Queries v_etax_partition_retention for ARCHIVE_CANDIDATE partitions
#   - Dry-run (default): lists partitions that WOULD be archived/detached
#   - --execute: DETACHes each candidate partition, optionally pg_dump backup,
#     renames it with _archived_ prefix, and logs all actions to an audit file
#
# Usage:
#   ./etax_partition_lifecycle.sh [OPTIONS]
#
# Options:
#   --execute              Run destructive operations (DETACH + rename/drop)
#   --backup               pg_dump each partition before detaching (requires PG access)
#   --drop                 DROP the partition after detaching (irreversible!)
#   --backup-dir DIR       Directory to store pg_dump files (default: ./partition_backups)
#   --audit-log FILE       Path to audit log (default: ./etax_partition_lifecycle_audit.log)
#   --db-url URL           Postgres connection URL (overrides SUPABASE_DB_URL env var)
#   --min-row-count N      Refuse to detach if partition has > N rows without --force
#                          (default: 0 = no cap, but will print row count)
#   --force                Skip row-count safety confirmation
#   --help                 Show this help message
#
# Environment variables (fallbacks):
#   SUPABASE_DB_URL        Full postgres:// connection string
#   SUPABASE_PROJECT_REF   Supabase project reference (used if DB_URL not set)
#   SUPABASE_DB_PASSWORD   DB password (used with PROJECT_REF)
#
# Exit codes:
#   0  Success (or dry-run completed cleanly)
#   1  Fatal error
#   2  User aborted safety check
#   3  No ARCHIVE_CANDIDATE partitions found
# =============================================================================

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
DRY_RUN=true
DO_BACKUP=false
DO_DROP=false
FORCE=false
BACKUP_DIR="./partition_backups"
AUDIT_LOG="./etax_partition_lifecycle_audit.log"
DB_URL="${SUPABASE_DB_URL:-}"
MIN_ROW_COUNT=0

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)    DRY_RUN=false; shift ;;
    --backup)     DO_BACKUP=true; shift ;;
    --drop)       DO_DROP=true; shift ;;
    --force)      FORCE=true; shift ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --audit-log)  AUDIT_LOG="$2"; shift 2 ;;
    --db-url)     DB_URL="$2"; shift 2 ;;
    --min-row-count) MIN_ROW_COUNT="$2"; shift 2 ;;
    --help)
      sed -n '/^# Usage:/,/^# =/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo -e "${RED}Unknown option: $1${RESET}" >&2; exit 1 ;;
  esac
done

# ─── Resolve DB connection ────────────────────────────────────────────────────
if [[ -z "$DB_URL" ]]; then
  if [[ -n "${SUPABASE_PROJECT_REF:-}" && -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    DB_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
  else
    echo -e "${RED}[FATAL] No DB connection. Set SUPABASE_DB_URL or pass --db-url.${RESET}" >&2
    exit 1
  fi
fi

# Mask password in logs
SAFE_DB_URL=$(echo "$DB_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')

# ─── Helpers ─────────────────────────────────────────────────────────────────
TS()       { date '+%Y-%m-%dT%H:%M:%S%z'; }
log_info() { echo -e "${CYAN}[INFO  $(TS())]${RESET} $*"; }
log_ok()   { echo -e "${GREEN}[OK    $(TS())]${RESET} $*"; }
log_warn() { echo -e "${YELLOW}[WARN  $(TS())]${RESET} $*"; }
log_err()  { echo -e "${RED}[ERROR $(TS())]${RESET} $*" >&2; }
log_dry()  { echo -e "${YELLOW}[DRY   $(TS())]${RESET} $*"; }

audit() {
  echo "[$(TS())] $*" >> "$AUDIT_LOG"
}

psql_exec() {
  psql "$DB_URL" --no-password -X -A -t -c "$1" 2>/dev/null
}

psql_csv() {
  psql "$DB_URL" --no-password -X -A -F'|' -t -c "$1" 2>/dev/null
}

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║      MONOLITH — eTax Partition Lifecycle Manager             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Mode       : $(if $DRY_RUN; then echo -e "${YELLOW}DRY RUN (no changes will be made)${RESET}"; else echo -e "${RED}EXECUTE (live changes)${RESET}"; fi)"
echo -e "  Backup     : $DO_BACKUP"
echo -e "  Drop after : $DO_DROP"
echo -e "  DB         : $SAFE_DB_URL"
echo -e "  Audit log  : $AUDIT_LOG"
echo ""

audit "=== etax_partition_lifecycle.sh started ==="
audit "Mode: $(if $DRY_RUN; then echo DRY_RUN; else echo EXECUTE; fi) | DB: $SAFE_DB_URL"

# ─── Section 1: Connectivity check ───────────────────────────────────────────
log_info "§1 — Checking database connectivity..."
if ! psql_exec "SELECT 1" | grep -q "1"; then
  log_err "Cannot connect to database at $SAFE_DB_URL"
  audit "FATAL: DB connection failed"
  exit 1
fi
log_ok "Database reachable."

# ─── Section 2: Check prerequisites ──────────────────────────────────────────
log_info "§2 — Checking prerequisites (v_etax_partition_retention view)..."

VIEW_EXISTS=$(psql_exec "
  SELECT COUNT(*) FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name = 'v_etax_partition_retention';
" | tr -d ' ')

if [[ "$VIEW_EXISTS" != "1" ]]; then
  log_err "v_etax_partition_retention view not found. Run Migration 0196 first."
  audit "FATAL: v_etax_partition_retention missing"
  exit 1
fi
log_ok "v_etax_partition_retention view found."

# ─── Section 3: Query ARCHIVE_CANDIDATE partitions ────────────────────────────
log_info "§3 — Querying ARCHIVE_CANDIDATE partitions from v_etax_partition_retention..."

# Columns: partition_name | partition_start | partition_end | row_count | retention_status
CANDIDATES_RAW=$(psql_csv "
  SELECT
    partition_name,
    partition_start,
    partition_end,
    row_count,
    retention_status
  FROM v_etax_partition_retention
  WHERE retention_status = 'ARCHIVE_CANDIDATE'
  ORDER BY partition_start ASC;
")

if [[ -z "$CANDIDATES_RAW" ]]; then
  log_ok "No ARCHIVE_CANDIDATE partitions found. Nothing to do."
  audit "No ARCHIVE_CANDIDATE partitions found — exiting cleanly."
  exit 3
fi

# Parse into arrays
declare -a PART_NAMES=()
declare -a PART_STARTS=()
declare -a PART_ENDS=()
declare -a PART_ROWS=()

while IFS='|' read -r pname pstart pend rowcount _status; do
  PART_NAMES+=("$pname")
  PART_STARTS+=("$pstart")
  PART_ENDS+=("$pend")
  PART_ROWS+=("$rowcount")
done <<< "$CANDIDATES_RAW"

TOTAL_CANDIDATES=${#PART_NAMES[@]}
log_ok "Found ${TOTAL_CANDIDATES} ARCHIVE_CANDIDATE partition(s)."

echo ""
echo -e "${BOLD}  Partitions to be processed:${RESET}"
printf "  %-40s %-12s %-12s %12s\n" "Partition Name" "Start" "End" "Row Count"
printf "  %-40s %-12s %-12s %12s\n" "──────────────────────────────────────" "──────────" "──────────" "──────────"
for i in "${!PART_NAMES[@]}"; do
  printf "  %-40s %-12s %-12s %12s\n" "${PART_NAMES[$i]}" "${PART_STARTS[$i]}" "${PART_ENDS[$i]}" "${PART_ROWS[$i]}"
done
echo ""

audit "Found $TOTAL_CANDIDATES ARCHIVE_CANDIDATE partitions: ${PART_NAMES[*]}"

# ─── Section 4: Safety confirmation ──────────────────────────────────────────
TOTAL_ROWS=0
for rc in "${PART_ROWS[@]}"; do
  TOTAL_ROWS=$((TOTAL_ROWS + rc))
done

if $DRY_RUN; then
  log_dry "DRY RUN — The above ${TOTAL_CANDIDATES} partition(s) (${TOTAL_ROWS} total rows) WOULD be detached."
  log_dry "Re-run with --execute to apply changes."
  audit "DRY RUN completed. Would process $TOTAL_CANDIDATES partitions / $TOTAL_ROWS rows."
  echo ""
  exit 0
fi

# Live mode — safety check
echo -e "${RED}${BOLD}[WARNING] EXECUTE MODE: This will DETACH ${TOTAL_CANDIDATES} partition(s) containing ${TOTAL_ROWS} rows.${RESET}"
if $DO_DROP; then
  echo -e "${RED}${BOLD}[WARNING] --drop is set: partitions will be PERMANENTLY DROPPED after detaching.${RESET}"
fi
echo ""

if ! $FORCE; then
  if [[ $MIN_ROW_COUNT -gt 0 && $TOTAL_ROWS -gt $MIN_ROW_COUNT ]]; then
    log_err "Total rows ($TOTAL_ROWS) exceeds --min-row-count limit ($MIN_ROW_COUNT). Use --force to override."
    audit "Aborted: row count $TOTAL_ROWS > min_row_count $MIN_ROW_COUNT"
    exit 2
  fi

  echo -n "  Type 'CONFIRM' to proceed: "
  read -r CONFIRM_INPUT
  if [[ "$CONFIRM_INPUT" != "CONFIRM" ]]; then
    log_warn "User did not confirm. Aborting."
    audit "User aborted safety confirmation."
    exit 2
  fi
fi

audit "Safety check passed. Proceeding with EXECUTE mode."

# ─── Section 5: Setup backup directory ───────────────────────────────────────
if $DO_BACKUP; then
  log_info "§5 — Setting up backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  log_ok "Backup directory ready: $BACKUP_DIR"
fi

# ─── Section 6: Process each partition ───────────────────────────────────────
log_info "§6 — Processing partitions..."
echo ""

SUCCESS_COUNT=0
FAILED_COUNT=0

for i in "${!PART_NAMES[@]}"; do
  PNAME="${PART_NAMES[$i]}"
  PSTART="${PART_STARTS[$i]}"
  PEND="${PART_ENDS[$i]}"
  PROWCOUNT="${PART_ROWS[$i]}"
  ARCHIVED_NAME="${PNAME}_archived_$(date +%Y%m%d)"

  echo -e "${BOLD}  ── Processing: $PNAME (${PROWCOUNT} rows, ${PSTART} → ${PEND}) ──${RESET}"

  # 6a: Final row count check (live, from the partition itself)
  LIVE_ROWCOUNT=$(psql_exec "SELECT COUNT(*) FROM public.${PNAME};" 2>/dev/null | tr -d ' ' || echo "0")
  log_info "  Live row count: $LIVE_ROWCOUNT"
  audit "Processing $PNAME | live_rows=$LIVE_ROWCOUNT | range=$PSTART->$PEND"

  if [[ "$LIVE_ROWCOUNT" != "$PROWCOUNT" ]]; then
    log_warn "  Row count mismatch (view=$PROWCOUNT, live=$LIVE_ROWCOUNT). Proceeding with live count."
  fi

  # 6b: pg_dump backup
  if $DO_BACKUP; then
    BACKUP_FILE="${BACKUP_DIR}/${PNAME}_$(date +%Y%m%dT%H%M%S).sql"
    log_info "  Backing up to $BACKUP_FILE ..."
    if pg_dump "$DB_URL" --table="public.${PNAME}" --file="$BACKUP_FILE" 2>/dev/null; then
      BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
      log_ok "  Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"
      audit "  BACKUP OK: $BACKUP_FILE size=$BACKUP_SIZE"
    else
      log_err "  pg_dump failed for $PNAME. Skipping this partition."
      audit "  BACKUP FAILED: $PNAME — skipping"
      FAILED_COUNT=$((FAILED_COUNT + 1))
      continue
    fi
  fi

  # 6c: DETACH partition
  log_info "  Detaching partition $PNAME from etax_submissions..."
  DETACH_SQL="ALTER TABLE public.etax_submissions DETACH PARTITION public.${PNAME};"
  if psql_exec "$DETACH_SQL" 2>/dev/null; then
    log_ok "  Detached: $PNAME"
    audit "  DETACH OK: $PNAME"
  else
    log_err "  DETACH failed for $PNAME."
    audit "  DETACH FAILED: $PNAME"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    continue
  fi

  # 6d: Rename to archived name (unless --drop)
  if ! $DO_DROP; then
    RENAME_SQL="ALTER TABLE public.${PNAME} RENAME TO ${ARCHIVED_NAME};"
    if psql_exec "$RENAME_SQL" 2>/dev/null; then
      log_ok "  Renamed to: $ARCHIVED_NAME"
      audit "  RENAME OK: $PNAME -> $ARCHIVED_NAME"
    else
      log_warn "  Rename failed for $PNAME (already detached, table still exists as $PNAME)."
      audit "  RENAME FAILED: $PNAME -> $ARCHIVED_NAME (non-fatal, partition detached)"
    fi
  fi

  # 6e: DROP if requested
  if $DO_DROP; then
    log_warn "  Dropping partition table $PNAME..."
    DROP_SQL="DROP TABLE IF EXISTS public.${PNAME};"
    if psql_exec "$DROP_SQL" 2>/dev/null; then
      log_ok "  Dropped: $PNAME"
      audit "  DROP OK: $PNAME"
    else
      log_err "  DROP failed for $PNAME."
      audit "  DROP FAILED: $PNAME"
      FAILED_COUNT=$((FAILED_COUNT + 1))
      continue
    fi
  fi

  # 6f: Write audit note to partition_archive_log if table exists
  psql_exec "
    INSERT INTO public.partition_archive_log (
      partition_name, original_range_start, original_range_end,
      row_count_at_archive, archived_at, archived_by, notes
    )
    SELECT
      '${PNAME}',
      '${PSTART}'::date,
      '${PEND}'::date,
      ${LIVE_ROWCOUNT},
      NOW(),
      current_user,
      'lifecycle script: $(if $DO_DROP; then echo DETACH+DROP; else echo DETACH+RENAME; fi) | backup=$(if $DO_BACKUP; then echo YES; else echo NO; fi)'
    WHERE EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'partition_archive_log'
    );
  " 2>/dev/null || true

  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  echo ""
done

# ─── Section 7: Summary ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║                    Lifecycle Summary                         ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Total candidates  : $TOTAL_CANDIDATES"
echo -e "  ${GREEN}Processed OK      : $SUCCESS_COUNT${RESET}"
echo -e "  ${RED}Failed            : $FAILED_COUNT${RESET}"
echo -e "  Audit log         : $AUDIT_LOG"
echo ""

audit "=== Summary: total=$TOTAL_CANDIDATES ok=$SUCCESS_COUNT failed=$FAILED_COUNT ==="
audit "=== etax_partition_lifecycle.sh completed ==="

if [[ $FAILED_COUNT -gt 0 ]]; then
  log_warn "Some partitions failed. Review $AUDIT_LOG for details."
  exit 1
fi

log_ok "Partition lifecycle completed successfully."
exit 0
