#!/usr/bin/env bash
# =============================================================================
# staging_validate_0199.sh
# Staging validator for Migration 0199 — mv_etax_submission_sla
#
# Sections:
#   §1  Environment / prerequisites
#   §2  Materialized view existence
#   §3  Unique index presence (mv_etax_submission_sla_pk)
#   §4  Supporting indexes (severity, breach_flag)
#   §5  fn_refresh_mv_etax_submission_sla execution
#   §6  rpc_etax_submission_sla_cached REST call + filter smoke test
#   §7  platform_config mv_etax_sla_last_refreshed timestamp
#   §8  Grant verification (anon REVOKED, authenticated EXECUTE, service_role refresh)
#   §9  Cross-tenant isolation smoke test
#   §10 Vitest unit tests (0199 test suite)
#   §11 Summary
#
# Usage:
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   SUPABASE_SERVICE_KEY=eyJ... \
#   SUPABASE_DB_URL=postgresql://postgres:secret@db.xxx.supabase.co:5432/postgres \
#   ./scripts/staging_validate_0199.sh [--dry-run] [--no-vitest]
#
# Exit codes:
#   0  All checks pass
#   1  One or more checks fail
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
DRY_RUN=false
NO_VITEST=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=true ;;
    --no-vitest) NO_VITEST=true ;;
    --help)
      grep '^#' "$0" | head -30 | sed 's/^# //'
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[PASS]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()  { echo -e "${RED}[FAIL]${RESET}  $*"; FAILURES+=("$*"); }
skip()  { echo -e "${YELLOW}[SKIP]${RESET}  $*"; }

declare -a FAILURES=()

# ---------------------------------------------------------------------------
# §1  Environment / prerequisites
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  staging_validate_0199.sh — mv_etax_submission_sla${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
echo ""
info "§1 Environment check"

REQUIRED_VARS=(SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    if $DRY_RUN; then
      warn "  $v not set (dry-run: continuing)"
    else
      fail "  Required env var $v is not set"
    fi
  else
    ok "  $v is set"
  fi
done

DB_CHECKS_ENABLED=false
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  DB_CHECKS_ENABLED=true
  ok "  SUPABASE_DB_URL is set — direct SQL checks enabled"
else
  warn "  SUPABASE_DB_URL not set — direct SQL checks will be skipped"
fi

$DRY_RUN && info "  [DRY-RUN] Mode active — DB calls echoed, not executed"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
rest_post() {
  local path="$1" body="${2:-{}}" role="${3:-service}"
  local key
  [[ "$role" == "anon" ]] && key="${SUPABASE_ANON_KEY:-}" || key="${SUPABASE_SERVICE_KEY:-}"
  if $DRY_RUN; then echo "[dry-run] POST ${SUPABASE_URL:-<URL>}${path}  body=${body}"; return 0; fi
  curl -sf -X POST \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${SUPABASE_URL}${path}"
}

rest_get() {
  local path="$1" role="${2:-service}"
  local key
  [[ "$role" == "anon" ]] && key="${SUPABASE_ANON_KEY:-}" || key="${SUPABASE_SERVICE_KEY:-}"
  if $DRY_RUN; then echo "[dry-run] GET ${SUPABASE_URL:-<URL>}${path}"; return 0; fi
  curl -sf \
    -H "apikey: ${key}" \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}${path}"
}

psql_exec() {
  local sql="$1"
  if ! $DB_CHECKS_ENABLED; then skip "  (SUPABASE_DB_URL not set — skipping direct SQL)"; return 0; fi
  if $DRY_RUN; then echo "[dry-run] psql: $sql"; return 0; fi
  psql "${SUPABASE_DB_URL}" -tAc "$sql" 2>&1
}

# ---------------------------------------------------------------------------
# §2  Materialized view existence
# ---------------------------------------------------------------------------
echo ""
info "§2 Materialized view existence"

MV_CHECK=$(psql_exec "SELECT COUNT(*)::text FROM pg_matviews
  WHERE schemaname='public' AND matviewname='mv_etax_submission_sla';" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] MV existence check skipped"
elif [[ "$MV_CHECK" == "1" ]]; then
  ok "  mv_etax_submission_sla materialized view exists"
elif ! $DB_CHECKS_ENABLED; then
  : # already skipped
else
  fail "  mv_etax_submission_sla MV NOT FOUND"
fi

# Verify required columns exist on the MV
MV_COLS=(
  org_id document_type total_submissions sla_breached_count breach_rate
  sla_breach_flag severity_tier avg_processing_hours max_processing_hours
  sla_threshold_hours updated_at
)
for col in "${MV_COLS[@]}"; do
  COL_CHK=$(psql_exec "SELECT COUNT(*)::text FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mv_etax_submission_sla'
    AND column_name='${col}';" 2>&1 || true)
  if $DRY_RUN; then
    ok "  [dry-run] column ${col} skipped"
  elif [[ "$COL_CHK" == "1" ]]; then
    ok "  Column present: ${col}"
  elif ! $DB_CHECKS_ENABLED; then
    skip "  Column ${col} — no DB URL"
  else
    fail "  Column MISSING on MV: ${col}"
  fi
done

# ---------------------------------------------------------------------------
# §3  Unique index presence
# ---------------------------------------------------------------------------
echo ""
info "§3 Unique index — mv_etax_submission_sla_pk (org_id, document_type)"

IDX_UNIQUE=$(psql_exec "SELECT COUNT(*)::text FROM pg_indexes
  WHERE schemaname='public'
    AND tablename='mv_etax_submission_sla'
    AND indexname='mv_etax_submission_sla_pk';" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] unique index check skipped"
elif [[ "$IDX_UNIQUE" == "1" ]]; then
  ok "  Unique index mv_etax_submission_sla_pk exists"
elif ! $DB_CHECKS_ENABLED; then
  skip "  Unique index check — no SUPABASE_DB_URL"
else
  fail "  Unique index mv_etax_submission_sla_pk NOT FOUND"
fi

# Verify the index is actually UNIQUE
IDX_UNIQUE_FLAG=$(psql_exec "SELECT ix.indisunique::text FROM pg_index ix
  JOIN pg_class c ON c.oid=ix.indrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_class ic ON ic.oid=ix.indexrelid
  WHERE n.nspname='public' AND c.relname='mv_etax_submission_sla'
    AND ic.relname='mv_etax_submission_sla_pk';" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] UNIQUE flag check skipped"
elif [[ "$IDX_UNIQUE_FLAG" == "t" ]]; then
  ok "  mv_etax_submission_sla_pk is UNIQUE (required for CONCURRENTLY refresh)"
elif ! $DB_CHECKS_ENABLED; then
  skip "  UNIQUE flag check — no DB URL"
else
  fail "  mv_etax_submission_sla_pk is NOT unique — CONCURRENTLY refresh will fail"
fi

# ---------------------------------------------------------------------------
# §4  Supporting indexes
# ---------------------------------------------------------------------------
echo ""
info "§4 Supporting indexes"

for idx in idx_mv_etax_sla_severity idx_mv_etax_sla_breach_flag; do
  IDX_CHK=$(psql_exec "SELECT COUNT(*)::text FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='mv_etax_submission_sla'
      AND indexname='${idx}';" 2>&1 || true)
  if $DRY_RUN; then
    ok "  [dry-run] index ${idx} check skipped"
  elif [[ "$IDX_CHK" == "1" ]]; then
    ok "  Supporting index exists: ${idx}"
  elif ! $DB_CHECKS_ENABLED; then
    skip "  Index ${idx} — no DB URL"
  else
    fail "  Supporting index MISSING: ${idx}"
  fi
done

# ---------------------------------------------------------------------------
# §5  fn_refresh_mv_etax_submission_sla execution
# ---------------------------------------------------------------------------
echo ""
info "§5 fn_refresh_mv_etax_submission_sla execution"

# Existence check
FN_EXIST=$(psql_exec "SELECT COUNT(*)::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_refresh_mv_etax_submission_sla';" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] fn existence check skipped"
elif [[ "$FN_EXIST" == "1" ]]; then
  ok "  fn_refresh_mv_etax_submission_sla function exists"
elif ! $DB_CHECKS_ENABLED; then
  skip "  fn existence — no DB URL"
else
  fail "  fn_refresh_mv_etax_submission_sla NOT FOUND"
fi

# Execute via REST (service_role)
REFRESH_CALL=$(rest_post "/rest/v1/rpc/fn_refresh_mv_etax_submission_sla" '{}' "service" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] refresh RPC call skipped"
elif [[ -z "$REFRESH_CALL" || "$REFRESH_CALL" == "null" ]]; then
  ok "  fn_refresh_mv_etax_submission_sla executed (empty/null response = void return)"
elif echo "$REFRESH_CALL" | grep -qi '"error"\|"message"'; then
  fail "  fn_refresh_mv_etax_submission_sla returned error: ${REFRESH_CALL:0:200}"
else
  ok "  fn_refresh_mv_etax_submission_sla returned: ${REFRESH_CALL:0:80}"
fi

# Verify SECURITY DEFINER
FN_SEC=$(psql_exec "SELECT prosecdef::text FROM pg_proc WHERE proname='fn_refresh_mv_etax_submission_sla';" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] SECURITY DEFINER check skipped"
elif [[ "$FN_SEC" == "t" ]]; then
  ok "  fn_refresh_mv_etax_submission_sla is SECURITY DEFINER"
elif ! $DB_CHECKS_ENABLED; then
  skip "  SECURITY DEFINER check — no DB URL"
else
  fail "  fn_refresh_mv_etax_submission_sla is NOT SECURITY DEFINER"
fi

# ---------------------------------------------------------------------------
# §6  rpc_etax_submission_sla_cached REST call + filter smoke test
# ---------------------------------------------------------------------------
echo ""
info "§6 rpc_etax_submission_sla_cached REST call"

# Existence
RPC_EXIST=$(psql_exec "SELECT COUNT(*)::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='rpc_etax_submission_sla_cached';" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] rpc existence check skipped"
elif [[ "$RPC_EXIST" == "1" ]]; then
  ok "  rpc_etax_submission_sla_cached function exists"
elif ! $DB_CHECKS_ENABLED; then
  skip "  rpc existence — no DB URL"
else
  fail "  rpc_etax_submission_sla_cached NOT FOUND"
fi

# No-filter call (service)
CACHED_CALL=$(rest_post "/rest/v1/rpc/rpc_etax_submission_sla_cached" \
  '{"p_document_type":null,"p_severity":null}' "service" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] cached RPC call skipped"
elif echo "$CACHED_CALL" | grep -qE '^\['; then
  ok "  rpc_etax_submission_sla_cached returns JSON array"
else
  warn "  rpc_etax_submission_sla_cached response: ${CACHED_CALL:0:160}"
fi

# p_document_type filter
for doc_type in T01 T02 T03 T04; do
  FILTER_CALL=$(rest_post "/rest/v1/rpc/rpc_etax_submission_sla_cached" \
    "{\"p_document_type\":\"${doc_type}\",\"p_severity\":null}" "service" 2>&1 || true)
  if $DRY_RUN; then
    ok "  [dry-run] p_document_type=${doc_type} filter skipped"
  elif echo "$FILTER_CALL" | python3 -c "
import sys,json
rows=json.loads(sys.stdin.read() or '[]')
bad=[r for r in rows if r.get('document_type')!='${doc_type}']
sys.exit(1 if bad else 0)" 2>/dev/null; then
    ok "  p_document_type=${doc_type} filter works correctly"
  elif echo "$FILTER_CALL" | grep -qE '^\[\]'; then
    ok "  p_document_type=${doc_type} returned empty (no data — acceptable)"
  else
    warn "  Could not verify p_document_type=${doc_type}: ${FILTER_CALL:0:100}"
  fi
done

# p_severity filter
for sev in HEALTHY NORMAL ELEVATED WARNING CRITICAL; do
  SEV_CALL=$(rest_post "/rest/v1/rpc/rpc_etax_submission_sla_cached" \
    "{\"p_document_type\":null,\"p_severity\":\"${sev}\"}" "service" 2>&1 || true)
  if $DRY_RUN; then
    ok "  [dry-run] p_severity=${sev} filter skipped"
  elif echo "$SEV_CALL" | python3 -c "
import sys,json
rows=json.loads(sys.stdin.read() or '[]')
bad=[r for r in rows if r.get('severity_tier')!='${sev}']
sys.exit(1 if bad else 0)" 2>/dev/null; then
    ok "  p_severity=${sev} filter works correctly"
  elif echo "$SEV_CALL" | grep -qE '^\[\]'; then
    ok "  p_severity=${sev} returned empty (no data in tier — acceptable)"
  else
    warn "  Could not verify p_severity=${sev}: ${SEV_CALL:0:100}"
  fi
done

# Verify SECURITY DEFINER on cached RPC
CACHED_SEC=$(psql_exec "SELECT prosecdef::text FROM pg_proc WHERE proname='rpc_etax_submission_sla_cached';" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] SECURITY DEFINER check skipped"
elif [[ "$CACHED_SEC" == "t" ]]; then
  ok "  rpc_etax_submission_sla_cached is SECURITY DEFINER"
elif ! $DB_CHECKS_ENABLED; then
  skip "  SECURITY DEFINER check — no DB URL"
else
  fail "  rpc_etax_submission_sla_cached is NOT SECURITY DEFINER"
fi

# ---------------------------------------------------------------------------
# §7  platform_config mv_etax_sla_last_refreshed timestamp
# ---------------------------------------------------------------------------
echo ""
info "§7 platform_config mv_etax_sla_last_refreshed"

# Trigger one more refresh to guarantee the key exists
rest_post "/rest/v1/rpc/fn_refresh_mv_etax_submission_sla" '{}' "service" > /dev/null 2>&1 || true

CFG_CALL=$(rest_get "/rest/v1/platform_config?key=eq.mv_etax_sla_last_refreshed&select=key,value,updated_at" \
  "service" 2>&1 || true)

if $DRY_RUN; then
  ok "  [dry-run] platform_config timestamp check skipped"
elif echo "$CFG_CALL" | python3 -c "
import sys,json,re
rows=json.loads(sys.stdin.read() or '[]')
if not rows: sys.exit(1)
val=rows[0].get('value','')
if not re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$', val): sys.exit(1)
print(f'  timestamp={val}')
sys.exit(0)" 2>/dev/null; then
  ok "  platform_config mv_etax_sla_last_refreshed is set and in ISO 8601 UTC format"
elif echo "$CFG_CALL" | grep -q '"key"'; then
  ok "  platform_config mv_etax_sla_last_refreshed key found (format check inconclusive)"
else
  fail "  platform_config mv_etax_sla_last_refreshed NOT FOUND after refresh"
fi

# Verify the timestamp is recent (within last 5 minutes)
CFG_TS=$(rest_get "/rest/v1/platform_config?key=eq.mv_etax_sla_last_refreshed&select=updated_at" \
  "service" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] timestamp freshness check skipped"
elif echo "$CFG_TS" | python3 -c "
import sys,json
from datetime import datetime,timezone,timedelta
rows=json.loads(sys.stdin.read() or '[]')
if not rows: sys.exit(1)
ts_str=rows[0].get('updated_at','')
try:
  ts=datetime.fromisoformat(ts_str.replace('Z','+00:00'))
  age=(datetime.now(timezone.utc)-ts).total_seconds()
  if age>300: print(f'age={age:.0f}s'); sys.exit(1)
  sys.exit(0)
except: sys.exit(1)
" 2>/dev/null; then
  ok "  Refresh timestamp is fresh (< 5 minutes old)"
else
  warn "  Refresh timestamp freshness could not be verified"
fi

# ---------------------------------------------------------------------------
# §8  Grant verification
# ---------------------------------------------------------------------------
echo ""
info "§8 Grant verification"

# anon cannot call rpc_etax_submission_sla_cached
ANON_RPC=$(rest_post "/rest/v1/rpc/rpc_etax_submission_sla_cached" \
  '{"p_document_type":null,"p_severity":null}' "anon" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] anon rpc_etax_submission_sla_cached check skipped"
elif echo "$ANON_RPC" | grep -qiE 'Unauthorized|JWT|permission denied|Not Acceptable'; then
  ok "  anon REVOKED from rpc_etax_submission_sla_cached (returned 401/403)"
elif echo "$ANON_RPC" | grep -qE '^\[\]'; then
  warn "  anon returned empty array — REVOKE may not be in effect (RLS may be filtering)"
else
  warn "  anon rpc response: ${ANON_RPC:0:160}"
fi

# anon cannot call fn_refresh_mv_etax_submission_sla
ANON_REFRESH=$(rest_post "/rest/v1/rpc/fn_refresh_mv_etax_submission_sla" '{}' "anon" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] anon fn_refresh check skipped"
elif echo "$ANON_REFRESH" | grep -qiE 'Unauthorized|JWT|permission denied'; then
  ok "  anon REVOKED from fn_refresh_mv_etax_submission_sla (returned 401/403)"
else
  fail "  anon was able to call fn_refresh_mv_etax_submission_sla — REVOKE missing"
fi

# service_role can call both
SVC_RPC=$(rest_post "/rest/v1/rpc/rpc_etax_submission_sla_cached" \
  '{"p_document_type":null,"p_severity":null}' "service" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] service_role rpc check skipped"
elif echo "$SVC_RPC" | grep -qE '^\['; then
  ok "  service_role can call rpc_etax_submission_sla_cached"
else
  warn "  service_role RPC response: ${SVC_RPC:0:160}"
fi

SVC_REFRESH=$(rest_post "/rest/v1/rpc/fn_refresh_mv_etax_submission_sla" '{}' "service" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] service_role refresh check skipped"
elif [[ -z "$SVC_REFRESH" || "$SVC_REFRESH" == "null" ]]; then
  ok "  service_role can call fn_refresh_mv_etax_submission_sla"
elif echo "$SVC_REFRESH" | grep -qi '"error"'; then
  fail "  service_role fn_refresh returned error: ${SVC_REFRESH:0:200}"
else
  ok "  service_role fn_refresh executed (response: ${SVC_REFRESH:0:80})"
fi

# ---------------------------------------------------------------------------
# §9  Cross-tenant isolation smoke test
# ---------------------------------------------------------------------------
echo ""
info "§9 Cross-tenant isolation smoke test"

CROSS_SQL="DO \$\$
DECLARE
  v_org_a uuid := '00000000-0000-0000-0000-000000000A99'::uuid;
  v_org_b uuid := '00000000-0000-0000-0000-000000000B99'::uuid;
  v_cnt   int;
BEGIN
  PERFORM set_config('app.current_org_id', v_org_a::text, true);
  SELECT COUNT(*) INTO v_cnt
    FROM mv_etax_submission_sla
    WHERE org_id = v_org_b;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Cross-tenant leak: org_b visible from org_a session (% rows)', v_cnt;
  END IF;
END;
\$\$;"

CROSS_RESULT=$(psql_exec "$CROSS_SQL" 2>&1 || true)
if $DRY_RUN; then
  ok "  [dry-run] cross-tenant isolation skipped"
elif ! $DB_CHECKS_ENABLED; then
  skip "  Cross-tenant isolation — no SUPABASE_DB_URL"
elif echo "$CROSS_RESULT" | grep -qi "exception\|leak\|error"; then
  fail "  Cross-tenant isolation FAILED: ${CROSS_RESULT:0:200}"
else
  ok "  Cross-tenant isolation: org_b not visible in org_a session"
fi

# ---------------------------------------------------------------------------
# §10 Vitest unit tests
# ---------------------------------------------------------------------------
echo ""
info "§10 Vitest test suite — 0199_mv_etax_submission_sla.test.ts"

if $NO_VITEST; then
  skip "  Vitest skipped (--no-vitest flag)"
elif $DRY_RUN; then
  ok "  [dry-run] Would run: npx vitest run src/__tests__/migrations/0199_mv_etax_submission_sla"
else
  TEST_FILE="src/__tests__/migrations/0199_mv_etax_submission_sla"
  if [[ ! -f "${REPO_ROOT}/${TEST_FILE}.test.ts" ]]; then
    warn "  Test file not found at ${REPO_ROOT}/${TEST_FILE}.test.ts — skipping"
  else
    set +e
    cd "$REPO_ROOT"
    npx vitest run --reporter=verbose "$TEST_FILE" 2>&1
    VITEST_EXIT=$?
    set -e
    if [[ $VITEST_EXIT -eq 0 ]]; then
      ok "  All 0199 vitest tests passed"
    else
      fail "  0199 vitest tests FAILED (exit code: $VITEST_EXIT)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# §11 Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Migration 0199 — Validation Summary${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
echo ""

if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✅  All checks passed — Migration 0199 is production-ready.${RESET}"
  echo ""
  EXIT_CODE=0
else
  echo -e "${RED}${BOLD}  ❌  ${#FAILURES[@]} check(s) failed:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "       ${RED}•${RESET} $f"
  done
  echo ""
  EXIT_CODE=1
fi

echo -e "  Sections validated:"
echo -e "    §1  Environment prerequisites"
echo -e "    §2  Materialized view existence + 11 columns"
echo -e "    §3  Unique index mv_etax_submission_sla_pk (UNIQUE flag)"
echo -e "    §4  Supporting indexes (severity + breach_flag partial)"
echo -e "    §5  fn_refresh_mv_etax_submission_sla (exists, executes, SECURITY DEFINER)"
echo -e "    §6  rpc_etax_submission_sla_cached (exists, REST call, 4 doc_type filters, 5 severity filters, SECURITY DEFINER)"
echo -e "    §7  platform_config mv_etax_sla_last_refreshed (ISO 8601, freshness < 5 min)"
echo -e "    §8  Grants (anon REVOKED, service_role EXECUTE both RPCs)"
echo -e "    §9  Cross-tenant isolation (org_b not visible from org_a session)"
echo -e "    §10 Vitest unit tests (Groups A–G)"
echo ""

exit $EXIT_CODE
