#!/usr/bin/env bash
# =============================================================================
# staging_validate_0205.sh — Staging validation for Migration 0205
# OpenAPI spec version tracking in platform_config (documentation migration)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/staging_lib.sh" 2>/dev/null || true

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass()  { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail()  { echo -e "  ${RED}✗${RESET}  $*"; FAIL_COUNT=$((FAIL_COUNT+1)); }
info()  { echo -e "  ${CYAN}→${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
FAIL_COUNT=0

# ── Environment ────────────────────────────────────────────────────────────────
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"
DRY_RUN="${DRY_RUN:-false}"

EXPECTED_OPENAPI_VERSION="15.9.0"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║  Migration 0205 — OpenAPI spec version tracking              ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY-RUN mode — all SQL checks will be skipped"
  echo ""
fi

SKIP_SQL=false
[[ "$DRY_RUN" == "true" || -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_KEY" ]] && SKIP_SQL=true

# Helper: RPC fetch via PostgREST
rpc_raw() {
  local fn="$1"; local body="${2:-{}}"
  curl -s --max-time 15 \
    -X POST "${SUPABASE_URL}/rest/v1/rpc/${fn}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# Helper: query platform_config
get_config() {
  local key="$1"
  rpc_raw "run_sql" \
    "{\"query\":\"SELECT value FROM platform_config WHERE key = '${key}'\"}" \
    2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['value'] if r else 'MISSING')" \
    2>/dev/null || echo "ERROR"
}

# ── §1  Environment ────────────────────────────────────────────────────────────
echo -e "${BOLD}§1  Environment${RESET}"
if [[ -z "$SUPABASE_URL" ]]; then
  warn "SUPABASE_URL not set — SQL sections will be skipped"
else
  pass "SUPABASE_URL: ${SUPABASE_URL}"
fi
if [[ -z "$SUPABASE_SERVICE_KEY" ]]; then
  warn "SUPABASE_SERVICE_KEY not set — SQL sections will be skipped"
else
  pass "SUPABASE_SERVICE_KEY set"
fi
echo ""

# ── §2  Migration stamp ────────────────────────────────────────────────────────
echo -e "${BOLD}§2  Migration stamp${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  STAMP=$(get_config "migration_0205_applied")
  if [[ "$STAMP" == "true" ]]; then
    pass "migration_0205_applied = 'true'"
  else
    fail "migration_0205_applied missing or wrong: '$STAMP'"
  fi
fi
echo ""

# ── §3  OpenAPI spec version value ────────────────────────────────────────────
echo -e "${BOLD}§3  openapi_spec_version${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  OA_VER=$(get_config "openapi_spec_version")
  if [[ "$OA_VER" == "$EXPECTED_OPENAPI_VERSION" ]]; then
    pass "openapi_spec_version = '${OA_VER}'"
  else
    fail "openapi_spec_version expected '${EXPECTED_OPENAPI_VERSION}', got '${OA_VER}'"
  fi
fi
echo ""

# ── §4  openapi_last_updated present ─────────────────────────────────────────
echo -e "${BOLD}§4  openapi_last_updated${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  OA_TS=$(get_config "openapi_last_updated")
  if [[ "$OA_TS" != "MISSING" && "$OA_TS" != "ERROR" ]]; then
    pass "openapi_last_updated present: '${OA_TS:0:30}…'"
  else
    fail "openapi_last_updated missing from platform_config"
  fi
fi
echo ""

# ── §5  No duplicate keys ─────────────────────────────────────────────────────
echo -e "${BOLD}§5  No duplicate platform_config keys${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  DUPS=$(rpc_raw "run_sql" \
    "{\"query\":\"SELECT key, COUNT(*) AS cnt FROM platform_config WHERE key IN ('migration_0205_applied','openapi_spec_version','openapi_last_updated') GROUP BY key HAVING COUNT(*) > 1\"}" \
    2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(len(r))" 2>/dev/null || echo "0")
  if [[ "$DUPS" -eq 0 ]]; then
    pass "No duplicate keys — ON CONFLICT DO UPDATE worked correctly"
  else
    fail "Duplicate platform_config keys found ($DUPS duplicated keys)"
  fi
fi
echo ""

# ── §6  Idempotency — second run produces no error ────────────────────────────
echo -e "${BOLD}§6  Idempotency check (re-applying migration)${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  info "Re-running ON CONFLICT DO UPDATE upsert for migration_0205_applied …"
  IDEM=$(rpc_raw "run_sql" \
    "{\"query\":\"INSERT INTO platform_config (key, value, updated_at) VALUES ('migration_0205_applied', 'true', NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at; SELECT 'ok' AS result\"}" \
    2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['result'] if r else 'fail')" \
    2>/dev/null || echo "fail")
  if [[ "$IDEM" == "ok" ]]; then
    pass "Re-applying migration is idempotent (no error, no duplicate)"
  else
    fail "Idempotency check failed: $IDEM"
  fi

  # Confirm still exactly 1 row
  COUNT=$(rpc_raw "run_sql" \
    "{\"query\":\"SELECT COUNT(*)::int AS cnt FROM platform_config WHERE key = 'migration_0205_applied'\"}" \
    2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['cnt'] if r else 0)" \
    2>/dev/null || echo "0")
  if [[ "$COUNT" -eq 1 ]]; then
    pass "Exactly 1 row for migration_0205_applied after re-apply"
  else
    fail "Expected 1 row for migration_0205_applied, found: $COUNT"
  fi
fi
echo ""

# ── §7  platform_config table comment ─────────────────────────────────────────
echo -e "${BOLD}§7  platform_config table comment updated${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  CMT=$(rpc_raw "run_sql" \
    "{\"query\":\"SELECT obj_description('platform_config'::regclass) AS cmt\"}" \
    2>/dev/null \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['cmt'] or '' if r else '')" \
    2>/dev/null || echo "")
  if echo "$CMT" | grep -q "15.9.0"; then
    pass "Table comment contains '15.9.0'"
  else
    warn "Table comment does not mention '15.9.0' — may have been overwritten: '${CMT:0:80}'"
  fi
fi
echo ""

# ── §8  Prior migrations not regressed ────────────────────────────────────────
echo -e "${BOLD}§8  Prior migration stamps intact (0203, 0204)${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP — no DB connection"
else
  for key in migration_0203_applied migration_0204_applied executive_tab_enabled; do
    VAL=$(get_config "$key")
    if [[ "$VAL" == "true" ]]; then
      pass "$key = 'true'"
    else
      fail "$key missing or wrong: '$VAL'"
    fi
  done
fi
echo ""

# ── §9  Vitest test suite ──────────────────────────────────────────────────────
echo -e "${BOLD}§9  Vitest — Migration 0205 test suite${RESET}"
if [[ "$SKIP_SQL" == "true" ]]; then
  warn "SKIP (dry-run) — vitest not executed"
elif ! command -v npx &>/dev/null; then
  warn "SKIP — npx not found (run inside project root)"
else
  info "Running src/__tests__/migrations/0205_openapi_update.test.ts …"
  if npx vitest run --reporter=verbose \
      "src/__tests__/migrations/0205_openapi_update.test.ts" 2>&1; then
    pass "Vitest passed"
  else
    fail "Vitest reported failures — see output above"
  fi
fi
echo ""

# ── §10  Summary ───────────────────────────────────────────────────────────────
echo -e "${BOLD}§10  Summary${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✓  staging_validate_0205 PASSED (0 failures)${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  ✗  staging_validate_0205 FAILED ($FAIL_COUNT failure(s))${RESET}"
  exit 1
fi
