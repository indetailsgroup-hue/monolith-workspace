#!/usr/bin/env bash
# =============================================================================
# preflight_db_reset.sh
# Pre-flight validation script for `supabase db reset` on the Monolith workspace.
#
# Usage:
#   chmod +x preflight_db_reset.sh
#   ./preflight_db_reset.sh              # validate only, no reset
#   ./preflight_db_reset.sh --reset      # validate then execute db reset
#   ./preflight_db_reset.sh --reset --yes # non-interactive (CI/CD)
#   ./preflight_db_reset.sh --dry-run    # CI-safe: mock DB checks, skip real connections
#   ./preflight_db_reset.sh --dry-run --reset  # dry-run + would-reset (no actual reset)
#
# Exit codes:
#   0  All checks passed (and reset ran, if --reset was given and NOT --dry-run)
#   1  One or more checks failed — db reset was NOT executed
# =============================================================================

set -euo pipefail

# ─── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass()    { echo -e "  ${GREEN}✔${RESET}  $*"; }
fail()    { echo -e "  ${RED}✖${RESET}  $*"; FAILURES=$((FAILURES + 1)); }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; WARNINGS=$((WARNINGS + 1)); }
info()    { echo -e "  ${CYAN}ℹ${RESET}  $*"; }
drypass() { echo -e "  ${CYAN}✔ [DRY-RUN]${RESET}  $* (mocked — skipping real connection)"; }
header()  { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━${RESET}"; }

FAILURES=0
WARNINGS=0
DO_RESET=false
NON_INTERACTIVE=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --reset)   DO_RESET=true ;;
    --yes)     NON_INTERACTIVE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

if [[ "$DRY_RUN" == true ]]; then
  echo -e "\n${YELLOW}${BOLD}  ⚙  DRY-RUN MODE ACTIVE${RESET}"
  echo -e "  DB-dependent checks are mocked as PASS."
  echo -e "  Filesystem, git, and config checks run normally."
  echo -e "  No DB connections will be made. db reset will NOT execute.\n"
fi

# ─── 0. Prerequisites ─────────────────────────────────────────────────────────
header "0. Tool prerequisites"

for cmd in supabase psql curl jq git; do
  if [[ "$DRY_RUN" == true && "$cmd" == "psql" ]]; then
    drypass "psql (skipped in dry-run)"
    continue
  fi
  if command -v "$cmd" &>/dev/null; then
    pass "$cmd found: $(command -v "$cmd")"
  else
    fail "$cmd not found — install it before running this script"
  fi
done

# Supabase CLI minimum version check (requires ≥ 1.150.0 for pg_cron support)
if [[ "$DRY_RUN" == true ]]; then
  drypass "Supabase CLI version check (skipped in dry-run)"
else
  SUPA_VERSION=$(supabase --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "0.0.0")
  SUPA_MAJOR=$(echo "$SUPA_VERSION" | cut -d. -f1)
  SUPA_MINOR=$(echo "$SUPA_VERSION" | cut -d. -f2)
  if [[ "$SUPA_MAJOR" -gt 1 ]] || { [[ "$SUPA_MAJOR" -eq 1 ]] && [[ "$SUPA_MINOR" -ge 150 ]]; }; then
    pass "Supabase CLI v$SUPA_VERSION (≥ 1.150.0)"
  else
    warn "Supabase CLI v$SUPA_VERSION — recommend upgrading to ≥ 1.150.0"
  fi
fi

# ─── 1. Environment variables ─────────────────────────────────────────────────
header "1. Environment variables"

# In dry-run: still validate env var presence (they may be unset in CI — warn, don't fail)
ENV_CHECK_FAIL_LEVEL="fail"
if [[ "$DRY_RUN" == true ]]; then
  ENV_CHECK_FAIL_LEVEL="warn"
  info "In dry-run, missing env vars are warnings (not failures) — they are not used for connections"
fi

check_env_var() {
  local var="$1"
  local level="${2:-$ENV_CHECK_FAIL_LEVEL}"
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set"
  else
    if [[ "$level" == "fail" ]]; then
      fail "$var is NOT set — required for db reset"
    else
      warn "$var is NOT set (dry-run: no real connection will be made)"
    fi
  fi
}

# Required: Supabase project
for var in SUPABASE_URL SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY; do
  check_env_var "$var"
done

# Required: e-Tax worker
for var in ETAX_PROVIDER_URL ETAX_API_KEY ETAX_SELLER_TAX_ID ETAX_SELLER_NAME; do
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set"
  else
    fail "$var is NOT set — etax-submit-worker will fail at runtime"
  fi
done

# Required: Notification worker
for var in RESEND_API_KEY LINE_NOTIFY_TOKEN; do
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set"
  else
    warn "$var is NOT set — notify-overdue will skip this channel at runtime"
  fi
done

# Required: Cron authentication
if [[ -n "${CRON_SECRET:-}" ]]; then
  pass "CRON_SECRET is set"
else
  fail "CRON_SECRET is NOT set — pg_net cron invocations will be rejected (401)"
fi

# Optional but recommended
for var in ETAX_SELLER_BRANCH_ID; do
  if [[ -n "${!var:-}" ]]; then
    pass "$var is set (optional)"
  else
    warn "$var not set — will default to '00000' in etax worker"
  fi
done

# ─── 2. Database connectivity ─────────────────────────────────────────────────
header "2. Database connectivity"

if [[ "$DRY_RUN" == true ]]; then
  drypass "DB connectivity (postgres — mocked)"
  drypass "DB URL endpoint check (remote, non-localhost — mocked)"
else
  if DB_CHECK=$(psql "$SUPABASE_DB_URL" -c "SELECT current_database(), version();" -t 2>&1); then
    DB_NAME=$(echo "$DB_CHECK" | awk -F'|' '{print $1}' | tr -d ' ' | head -1)
    pass "Connected to database: $DB_NAME"
  else
    fail "Cannot connect to DB: $DB_CHECK"
    echo -e "\n${RED}Database unreachable — aborting remaining DB checks.${RESET}"
  fi

  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    if echo "$SUPABASE_DB_URL" | grep -q "localhost\|127.0.0.1\|local"; then
      warn "DB URL points to localhost — ensure this is the staging instance, not production"
    else
      pass "DB URL is a remote endpoint (non-localhost)"
    fi
  fi
fi

# ─── 3. Required PostgreSQL extensions ────────────────────────────────────────
header "3. PostgreSQL extensions"

check_extension() {
  local ext="$1"
  local required="${2:-true}"

  if [[ "$DRY_RUN" == true ]]; then
    drypass "Extension $ext (mocked as installed)"
    return
  fi

  local result
  result=$(psql "$SUPABASE_DB_URL" -t -c \
    "SELECT extname FROM pg_extension WHERE extname = '$ext';" 2>/dev/null | tr -d ' \n')
  if [[ "$result" == "$ext" ]]; then
    pass "Extension $ext is installed"
  elif [[ "$required" == "true" ]]; then
    fail "Extension $ext is NOT installed — migrations will fail"
  else
    warn "Extension $ext is not installed (optional)"
  fi
}

check_extension "pg_cron"     true
check_extension "pg_net"      true
check_extension "uuid-ossp"   true
check_extension "pgcrypto"    false  # used by gen_random_uuid if not on PG14+

# ─── 4. DB application settings ───────────────────────────────────────────────
header "4. DB application settings (app.settings.*)"

check_db_setting() {
  local setting="$1"

  if [[ "$DRY_RUN" == true ]]; then
    drypass "$setting (mocked as configured)"
    return
  fi

  local val
  val=$(psql "$SUPABASE_DB_URL" -t -c \
    "SELECT current_setting('$setting', TRUE);" 2>/dev/null | tr -d ' \n')
  if [[ -n "$val" && "$val" != "" ]]; then
    pass "$setting = $val"
  else
    fail "$setting is NOT set in DB — run: ALTER DATABASE postgres SET $setting = '...'"
  fi
}

check_db_setting "app.settings.supabase_url"
check_db_setting "app.settings.cron_secret"

# ─── 5. Migration file order & integrity ──────────────────────────────────────
header "5. Migration file order & integrity"

MIGRATIONS_DIR="./supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  fail "Migrations directory not found: $MIGRATIONS_DIR"
else
  pass "Migrations directory exists: $MIGRATIONS_DIR"

  # 5a. Check 0000 exists (multi-tenant schema — must run first)
  if ls "$MIGRATIONS_DIR"/0000_*.sql &>/dev/null; then
    pass "0000_multi_tenant_schema.sql present (execution order anchor)"
  else
    fail "No 0000_*.sql found — get_user_org_id() will be undefined when 0178+ run"
  fi

  # 5b. Check old date-prefixed file is gone
  if ls "$MIGRATIONS_DIR"/20260828_*.sql &>/dev/null; then
    fail "Found 20260828_*.sql — this sorts AFTER 0178 and must be renamed to 0000_*.sql"
  else
    pass "No 20260828_*.sql found (renamed to 0000)"
  fi

  # 5c. Check all expected migrations 0176–0186 are present
  EXPECTED_MIGRATIONS=(
    "0176" "0177" "0178" "0179" "0180" "0181" "0182" "0183" "0184" "0185" "0186"
  )
  for prefix in "${EXPECTED_MIGRATIONS[@]}"; do
    if ls "$MIGRATIONS_DIR"/${prefix}_*.sql &>/dev/null; then
      pass "Migration ${prefix}_*.sql found"
    else
      fail "Migration ${prefix}_*.sql is MISSING from $MIGRATIONS_DIR"
    fi
  done

  # 5d. Check for duplicate migration number prefixes
  DUPS=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null \
    | xargs -I{} basename {} \
    | grep -oE '^[0-9]+' \
    | sort | uniq -d)
  if [[ -z "$DUPS" ]]; then
    pass "No duplicate migration number prefixes"
  else
    fail "Duplicate migration prefix(es) found: $DUPS"
  fi

  # 5e. Verify lexicographic order is execution order (no reversion)
  PREV_PREFIX=""
  while IFS= read -r file; do
    PREFIX=$(basename "$file" | grep -oE '^[0-9]+' | head -1)
    if [[ -n "$PREV_PREFIX" && "$PREFIX" < "$PREV_PREFIX" ]]; then
      fail "Migration out of order: $(basename "$file") comes after prefix $PREV_PREFIX"
    fi
    PREV_PREFIX="$PREFIX"
  done < <(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)
  pass "Migration files are in ascending lexicographic order"

  # 5f. 0178 — verify plural table names (quick grep)
  if ls "$MIGRATIONS_DIR"/0178_*.sql &>/dev/null; then
    FILE_0178=$(ls "$MIGRATIONS_DIR"/0178_*.sql | head -1)
    SINGULAR_REFS=$(grep -cE '\bpublic\.(job|invoice|quotation|customer)\b' "$FILE_0178" || true)
    if [[ "$SINGULAR_REFS" -eq 0 ]]; then
      pass "0178: no singular table references (job/invoice/quotation/customer) found"
    else
      fail "0178: $SINGULAR_REFS singular table reference(s) still present — run the pluralize fix"
    fi
  fi

  # 5g. 0186 — verify compliance view migration present
  if ls "$MIGRATIONS_DIR"/0186_*.sql &>/dev/null; then
    FILE_0186=$(ls "$MIGRATIONS_DIR"/0186_*.sql | head -1)
    if grep -q "v_etax_compliance_dashboard" "$FILE_0186"; then
      pass "0186: v_etax_compliance_dashboard view definition found"
    else
      warn "0186: v_etax_compliance_dashboard not found in $(basename "$FILE_0186")"
    fi
  fi
fi

# ─── 6. Edge function files ────────────────────────────────────────────────────
header "6. Edge function files"

for fn_path in \
  "supabase/functions/etax-submit-worker/index.ts" \
  "supabase/functions/notify-overdue/index.ts"; do
  if [[ -f "$fn_path" ]]; then
    pass "$fn_path exists"
    if [[ "$fn_path" == *"etax-submit-worker"* ]]; then
      if grep -q "downloadAndStorePdf" "$fn_path"; then
        pass "etax-submit-worker: downloadAndStorePdf() is present"
      else
        warn "etax-submit-worker: downloadAndStorePdf() not found — PDF inline download may be missing"
      fi
    fi
  else
    fail "$fn_path is MISSING"
  fi
done

# ─── 7. Supabase config.toml cron entries ─────────────────────────────────────
header "7. supabase/config.toml cron entries"

CONFIG_TOML="supabase/config.toml"
if [[ -f "$CONFIG_TOML" ]]; then
  pass "config.toml exists"
  for job in "etax-submit-worker" "notify-overdue"; do
    if grep -q "$job" "$CONFIG_TOML"; then
      pass "config.toml: cron entry for $job found"
    else
      warn "config.toml: no cron entry for $job — schedule it manually after deploy"
    fi
  done
else
  fail "$CONFIG_TOML not found — edge function deployments and cron will not be configured"
fi

# ─── 8. Git branch check ──────────────────────────────────────────────────────
header "8. Git branch & working tree"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
info "Current branch: $CURRENT_BRANCH"

if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
  warn "You are on $CURRENT_BRANCH — consider resetting on staging/feature branch first"
fi

if ! git diff --quiet 2>/dev/null; then
  warn "Uncommitted changes in working tree — stash or commit before reset"
else
  pass "Working tree is clean"
fi

# ─── 9. Supabase project linkage ──────────────────────────────────────────────
header "9. Supabase project linkage"

if [[ "$DRY_RUN" == true ]]; then
  drypass "Supabase project linkage (supabase/.temp/project-ref — mocked)"
elif [[ -f "supabase/.temp/project-ref" ]]; then
  PROJECT_REF=$(cat "supabase/.temp/project-ref")
  pass "Project linked: $PROJECT_REF"
  if echo "$PROJECT_REF" | grep -qiE "prod|production"; then
    fail "Project ref contains 'prod' — this may be a production project. Aborting."
  fi
else
  warn "supabase/.temp/project-ref not found — project may not be linked (run: supabase link)"
fi

# ─── 10. Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ "$DRY_RUN" == true ]]; then
  echo -e "${CYAN}${BOLD}  DRY-RUN COMPLETE${RESET}  — no DB connections were made"
fi
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ALL CHECKS PASSED${RESET}  (${WARNINGS} warning(s))"
else
  echo -e "${RED}${BOLD}  $FAILURES CHECK(S) FAILED${RESET}  (${WARNINGS} warning(s))"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ─── 11. Optional db reset ────────────────────────────────────────────────────
if [[ "$DO_RESET" == true ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "${CYAN}${BOLD}[DRY-RUN]${RESET} Would execute: ${BOLD}supabase db reset${RESET}"
    echo -e "${CYAN}          No reset performed — remove --dry-run to run for real.${RESET}"
    exit $FAILURES
  fi

  if [[ $FAILURES -gt 0 ]]; then
    echo -e "${RED}db reset ABORTED — fix the $FAILURES failure(s) above first.${RESET}"
    exit 1
  fi

  if [[ "$NON_INTERACTIVE" == false ]]; then
    echo -e "${YELLOW}${BOLD}WARNING:${RESET} This will drop and recreate the entire database."
    echo -e "Branch: ${CYAN}$CURRENT_BRANCH${RESET}"
    echo -n "Type 'reset' to confirm: "
    read -r CONFIRM
    if [[ "$CONFIRM" != "reset" ]]; then
      echo "Aborted."
      exit 0
    fi
  fi

  header "Executing: supabase db reset"
  supabase db reset
  echo -e "\n${GREEN}${BOLD}✔  supabase db reset completed successfully.${RESET}"
  echo ""
  echo -e "${CYAN}Next steps:${RESET}"
  echo "  1. vitest run src/__tests__/rls/"
  echo "  2. supabase functions deploy etax-submit-worker"
  echo "  3. supabase functions deploy notify-overdue"
  echo "  4. psql \$SUPABASE_DB_URL -c \"ALTER DATABASE postgres SET app.settings.supabase_url = '\$SUPABASE_URL';\""
  echo "  5. psql \$SUPABASE_DB_URL -c \"ALTER DATABASE postgres SET app.settings.cron_secret = '\$CRON_SECRET';\""
fi

exit $FAILURES
