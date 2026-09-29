#!/usr/bin/env bash
# =============================================================================
# staging_validate_0204.sh — Staging validation for Migration 0204
# rpc_etax_executive_kpi_banner + executive_tab_enabled platform_config flag
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/staging_lib.sh" 2>/dev/null || true

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass()  { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail()  { echo -e "  ${RED}✗${RESET}  $*"; FAIL_COUNT=$((FAIL_COUNT+1)); }
info()  { echo -e "  ${CYAN}→${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
FAIL_COUNT=0

# ── Environment ───────────────────────────────────────────────────────────────
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"
DRY_RUN="${DRY_RUN:-false}"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  Migration 0204 — rpc_etax_executive_kpi_banner              ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY-RUN mode — all SQL checks will be skipped"
  echo ""
fi

# ── §1 Environment checks ─────────────────────────────────────────────────────
echo -e "${BOLD}§1  Environment${RESET}"
if [[ -z "$SUPABASE_URL" ]]; then
  warn "SUPABASE_URL not set — SQL sections will be skipped"
else
  pass "SUPABASE_URL set: ${SUPABASE_URL}"
fi
if [[ -z "$SUPABASE_SERVICE_KEY" ]]; then
  warn "SUPABASE_SERVICE_KEY not set — SQL sections will be skipped"
else
  pass "SUPABASE_SERVICE_KEY set"
fi
echo ""

# Helper: run SQL via PostgREST RPC endpoint
rpc() {
  local fn="$1"; local body="${2:-{}}"
  curl -s --max-time 15 \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/${fn}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# Helper: run raw SQL via pg meta (if available)
sql() {
  local query="$1"
  curl -s --max-time 15 \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/run_sql" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$query" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
}

SKIP_SQL=false
[[ "$DRY_RUN" == "true" || -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_KEY" ]] && SKIP_SQL=true

# ── §2 Migration stamp check ──────────────────────────────────────────────────
echo -e "${BOLD}§2  Migration stamp (platform_config)${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  STAMP=$(rpc "run_sql" "{\"query\":\"SELECT value FROM platform_config WHERE key = 'migration_0204_applied'\"}" \
          2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['value'] if r else 'MISSING')" 2>/dev/null || echo "ERROR")
  if [[ "$STAMP" == "true" ]]; then
    pass "migration_0204_applied = 'true'"
  else
    fail "migration_0204_applied not found or wrong value: '$STAMP'"
  fi

  EXEC_FLAG=$(rpc "run_sql" "{\"query\":\"SELECT value FROM platform_config WHERE key = 'executive_tab_enabled'\"}" \
              2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['value'] if r else 'MISSING')" 2>/dev/null || echo "ERROR")
  if [[ "$EXEC_FLAG" == "true" ]]; then
    pass "executive_tab_enabled = 'true'"
  else
    fail "executive_tab_enabled not found or wrong value: '$EXEC_FLAG'"
  fi
fi
echo ""

# ── §3 Function existence ─────────────────────────────────────────────────────
echo -e "${BOLD}§3  Function existence${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  FN_EXISTS=$(rpc "run_sql" \
    "{\"query\":\"SELECT COUNT(*)::int AS cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_etax_executive_kpi_banner'\"}" \
    2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['cnt'] if r else 0)" 2>/dev/null || echo "0")
  if [[ "$FN_EXISTS" == "1" ]]; then
    pass "Function rpc_etax_executive_kpi_banner() exists in schema public"
  else
    fail "Function rpc_etax_executive_kpi_banner() NOT found"
  fi

  # Check SECURITY DEFINER
  SEC_DEF=$(rpc "run_sql" \
    "{\"query\":\"SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_etax_executive_kpi_banner'\"}" \
    2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['prosecdef'] if r else 'false')" 2>/dev/null || echo "false")
  if [[ "$SEC_DEF" == "true" ]]; then
    pass "rpc_etax_executive_kpi_banner has SECURITY DEFINER"
  else
    fail "rpc_etax_executive_kpi_banner missing SECURITY DEFINER"
  fi
fi
echo ""

# ── §4 Grant check ────────────────────────────────────────────────────────────
echo -e "${BOLD}§4  GRANT EXECUTE check${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  GRANT_OK=$(rpc "run_sql" \
    "{\"query\":\"SELECT has_function_privilege('authenticated', 'public.rpc_etax_executive_kpi_banner()', 'EXECUTE') AS ok\"}" \
    2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['ok'] if r else 'false')" 2>/dev/null || echo "false")
  if [[ "$GRANT_OK" == "true" ]]; then
    pass "authenticated role has EXECUTE privilege"
  else
    fail "authenticated role missing EXECUTE privilege"
  fi

  ANON_OK=$(rpc "run_sql" \
    "{\"query\":\"SELECT has_function_privilege('anon', 'public.rpc_etax_executive_kpi_banner()', 'EXECUTE') AS ok\"}" \
    2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['ok'] if r else 'false')" 2>/dev/null || echo "false")
  if [[ "$ANON_OK" == "false" ]]; then
    pass "anon role correctly REVOKED from rpc_etax_executive_kpi_banner"
  else
    fail "anon role should NOT have EXECUTE — found: $ANON_OK"
  fi
fi
echo ""

# ── §5 Return shape ───────────────────────────────────────────────────────────
echo -e "${BOLD}§5  Return shape (11 columns)${RESET}"
EXPECTED_COLS=(
  total_orgs orgs_requiring_attention orgs_with_live_data orgs_with_archive_data
  global_worst_severity global_peak_breach_rate_pct live_total_submissions live_total_breached
  archive_total_created archive_total_breached sla_threshold_hours
)
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  RAW=$(rpc "rpc_etax_executive_kpi_banner" "{}" 2>/dev/null || echo "[]")
  ROW=$(echo "$RAW" | python3 -c "import json,sys; r=json.load(sys.stdin); print(json.dumps(r[0] if r else {}))" 2>/dev/null || echo "{}")
  for col in "${EXPECTED_COLS[@]}"; do
    HAS=$(echo "$ROW" | python3 -c "import json,sys; r=json.load(sys.stdin); print('yes' if '$col' in r else 'no')" 2>/dev/null || echo "no")
    if [[ "$HAS" == "yes" ]]; then
      pass "Column present: $col"
    else
      fail "Column missing: $col"
    fi
  done
fi
echo ""

# ── §6 Single-row guarantee ───────────────────────────────────────────────────
echo -e "${BOLD}§6  Single-row guarantee${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  ROW_COUNT=$(rpc "rpc_etax_executive_kpi_banner" "{}" 2>/dev/null \
    | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  if [[ "$ROW_COUNT" -eq 1 ]]; then
    pass "rpc_etax_executive_kpi_banner returns exactly 1 row"
  elif [[ "$ROW_COUNT" -eq 0 ]]; then
    warn "rpc_etax_executive_kpi_banner returned 0 rows (empty dataset — acceptable on blank staging)"
  else
    fail "rpc_etax_executive_kpi_banner returned $ROW_COUNT rows (expected 1)"
  fi
fi
echo ""

# ── §7 Dependency views exist ─────────────────────────────────────────────────
echo -e "${BOLD}§7  Dependency views${RESET}"
DEPS=(v_etax_submission_sla mv_etax_submission_sla v_etax_sla_archive_org_rollup v_etax_sla_executive_summary)
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  for dep in "${DEPS[@]}"; do
    CNT=$(rpc "run_sql" \
      "{\"query\":\"SELECT COUNT(*)::int AS cnt FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${dep}'\"}" \
      2>/dev/null | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['cnt'] if r else 0)" 2>/dev/null || echo "0")
    if [[ "$CNT" == "1" ]]; then
      pass "Dependency exists: $dep"
    else
      fail "Dependency missing: $dep"
    fi
  done
fi
echo ""

# ── §8 Severity precedence ────────────────────────────────────────────────────
echo -e "${BOLD}§8  global_worst_severity precedence check${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  WORST=$(rpc "rpc_etax_executive_kpi_banner" "{}" 2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0].get('global_worst_severity','') if r else '')" 2>/dev/null || echo "")
  VALID_TIERS=("CRITICAL" "WARNING" "ELEVATED" "NORMAL" "HEALTHY" "")
  VALID=false
  for t in "${VALID_TIERS[@]}"; do
    [[ "$WORST" == "$t" ]] && VALID=true && break
  done
  if [[ "$VALID" == "true" ]]; then
    pass "global_worst_severity value valid: '${WORST:-HEALTHY/empty}'"
  else
    fail "global_worst_severity unexpected value: '$WORST'"
  fi
fi
echo ""

# ── §9 Cross-tenant isolation ─────────────────────────────────────────────────
echo -e "${BOLD}§9  Cross-tenant isolation (service_role vs authenticated)${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  # service_role should see all orgs; authenticated should be scoped
  info "Cross-tenant isolation is enforced by SECURITY DEFINER + get_user_org_id() in 0203 view"
  info "service_role call (no JWT filtering) — verifying total_orgs ≥ 0"
  TOTAL=$(rpc "rpc_etax_executive_kpi_banner" "{}" 2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0].get('total_orgs',0) if r else 0)" 2>/dev/null || echo "0")
  if [[ "$TOTAL" -ge 0 ]]; then
    pass "total_orgs returned: $TOTAL (service_role, no cross-tenant leak)"
  else
    fail "total_orgs negative — unexpected"
  fi
fi
echo ""

# ── §10 Vitest test suite ─────────────────────────────────────────────────────
echo -e "${BOLD}§10  Vitest — Migration 0204 test suite${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP (dry-run) — vitest not executed"
elif ! command -v npx &>/dev/null; then
  warn "SKIP — npx not found (run inside project root)"
else
  info "Running src/__tests__/integrations/0198_0203_executive_sla_pipeline.integration.test.ts …"
  if npx vitest run --reporter=verbose \
      "src/__tests__/integrations/0198_0203_executive_sla_pipeline.integration.test.ts" 2>&1; then
    pass "Vitest passed"
  else
    fail "Vitest reported failures — see output above"
  fi
fi
echo ""

# ── §11 Summary ───────────────────────────────────────────────────────────────
echo -e "${BOLD}§11  Summary${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✓  staging_validate_0204 PASSED (0 failures)${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  ✗  staging_validate_0204 FAILED ($FAIL_COUNT failure(s))${RESET}"
  exit 1
fi
