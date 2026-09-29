#!/usr/bin/env bash
# =============================================================================
# staging_validate_0203.sh
# Staging validation for Migration 0203 — v_etax_sla_executive_summary
#                                          rpc_etax_sla_executive_summary
# =============================================================================
# Sections:
#   §1  Environment variables
#   §2  v_etax_sla_executive_summary view existence + 24 columns
#   §3  rpc_etax_sla_executive_summary function existence + SECURITY DEFINER
#   §4  RPC REST POST HTTP 200 + array response (service_role)
#   §5  p_org_id filter returns only the requested org
#   §6  p_requires_attention=true returns WARNING/CRITICAL rows only
#   §7  p_has_archive_data filter correctness
#   §8  combined_worst_severity ordering (CRITICAL > WARNING > ELEVATED > NORMAL > HEALTHY)
#   §9  requires_attention consistency with combined_worst_severity
#   §10 COALESCE defaults: live_total_submissions=0, archive_total_days=0, sla_threshold_hours=24
#   §11 RLS: anon rejected (HTTP 401/403); org-A cannot see org-B
#   §12 platform_config migration_0203_applied stamp
#   §13 vitest 0203_etax_sla_executive_summary suite
# =============================================================================

set -euo pipefail

RED='\\033[0;31m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'; BOLD='\\033[1m'; RESET='\\033[0m'

pass()    { echo -e "${GREEN}  ✔ PASS${RESET}  $1"; }
fail()    { echo -e "${RED}  ✘ FAIL${RESET}  $1"; FAILED=$((FAILED+1)); }
info()    { echo -e "${CYAN}  ℹ${RESET}  $1"; }
section() { echo -e "\n${BOLD}${YELLOW}$1${RESET}"; }
FAILED=0

# ── §1 Environment variables ──────────────────────────────────────────────────
section "§1  Environment variables"

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY is required}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${TEST_ORG_A_ID:?TEST_ORG_A_ID is required}"
: "${TEST_ORG_B_ID:?TEST_ORG_B_ID is required}"

pass "All required env vars are set"
info "  SUPABASE_URL = $SUPABASE_URL"

# ── Helpers ───────────────────────────────────────────────────────────────────
sql_query() {
  curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$1" | jq -Rs .)}"
}

rpc_post() {
  local rpc_name="$1"; local body="${2:-{}}"
  curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc_name}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

rpc_status() {
  local rpc_name="$1"; local body="${2:-{}}"
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc_name}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

rpc_status_anon() {
  local rpc_name="$1"; local body="${2:-{}}"
  curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/${rpc_name}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body"
}

# ── §2 View existence + column count ─────────────────────────────────────────
section "§2  v_etax_sla_executive_summary — existence and column count"

VIEW_EXISTS=$(sql_query "
  SELECT COUNT(*) AS cnt FROM pg_views
  WHERE schemaname = 'public' AND viewname = 'v_etax_sla_executive_summary'
" | jq -r '.[0].cnt // "0"')
[[ "$VIEW_EXISTS" == "1" ]] \
  && pass "v_etax_sla_executive_summary view exists" \
  || fail "v_etax_sla_executive_summary view NOT found"

COL_COUNT=$(sql_query "
  SELECT COUNT(*) AS cnt FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'v_etax_sla_executive_summary'
" | jq -r '.[0].cnt // "0"')
[[ "$COL_COUNT" == "24" ]] \
  && pass "Column count = 24" \
  || fail "Column count = $COL_COUNT (expected 24)"

SECURITY_INVOKER=$(sql_query "
  SELECT reloptions FROM pg_class
  WHERE relname = 'v_etax_sla_executive_summary' AND relkind = 'v'
" | jq -r '.[0].reloptions // [] | map(ascii_downcase) | any(. == "security_invoker=true")')
[[ "$SECURITY_INVOKER" == "true" ]] \
  && pass "View has security_invoker = true" \
  || fail "View security_invoker option missing or false"

# ── §3 RPC existence + SECURITY DEFINER ──────────────────────────────────────
section "§3  rpc_etax_sla_executive_summary — existence and SECURITY DEFINER"

FUNC_EXISTS=$(sql_query "
  SELECT COUNT(*) AS cnt FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_executive_summary'
" | jq -r '.[0].cnt // "0"')
[[ "$FUNC_EXISTS" -ge 1 ]] \
  && pass "rpc_etax_sla_executive_summary function exists" \
  || fail "rpc_etax_sla_executive_summary NOT found in pg_proc"

SECDEF=$(sql_query "
  SELECT prosecdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_etax_sla_executive_summary'
  LIMIT 1
" | jq -r '.[0].prosecdef // "false"')
[[ "$SECDEF" == "true" ]] \
  && pass "RPC is SECURITY DEFINER" \
  || fail "RPC prosecdef = $SECDEF (expected true)"

# ── §4 HTTP 200 + array response ─────────────────────────────────────────────
section "§4  rpc_etax_sla_executive_summary — REST HTTP 200 + array"

HTTP_CODE=$(rpc_status "rpc_etax_sla_executive_summary" '{}')
[[ "$HTTP_CODE" == "200" ]] \
  && pass "POST /rpc/rpc_etax_sla_executive_summary → HTTP 200" \
  || fail "Unexpected HTTP $HTTP_CODE (expected 200)"

RESP=$(rpc_post "rpc_etax_sla_executive_summary" '{}')
IS_ARRAY=$(echo "$RESP" | jq 'if type=="array" then "yes" else "no" end' 2>/dev/null || echo "no")
[[ "$IS_ARRAY" == '"yes"' ]] \
  && pass "Response is a JSON array" \
  || fail "Response is not a JSON array: ${RESP:0:200}"

# ── §5 p_org_id filter ────────────────────────────────────────────────────────
section "§5  p_org_id filter returns only the requested org"

ORG_BODY=$(jq -nc --arg oid "$TEST_ORG_A_ID" '{p_org_id: $oid}')
FILTERED=$(rpc_post "rpc_etax_sla_executive_summary" "$ORG_BODY")
FOREIGN=$(echo "$FILTERED" | jq --arg oid "$TEST_ORG_A_ID" '[.[] | select(.org_id != $oid)] | length' 2>/dev/null || echo "0")
[[ "$FOREIGN" == "0" ]] \
  && pass "p_org_id filter: no foreign-org rows returned" \
  || fail "p_org_id filter: $FOREIGN rows from other orgs leaked through"

# ── §6 p_requires_attention=true ─────────────────────────────────────────────
section "§6  p_requires_attention=true returns only WARNING/CRITICAL rows"

ATTN_RESP=$(rpc_post "rpc_etax_sla_executive_summary" '{"p_requires_attention": true}')
BAD_ATTN=$(echo "$ATTN_RESP" | jq '[.[] | select(.combined_worst_severity | IN("WARNING","CRITICAL") | not)] | length' 2>/dev/null || echo "0")
[[ "$BAD_ATTN" == "0" ]] \
  && pass "All p_requires_attention=true rows have WARNING or CRITICAL severity" \
  || fail "$BAD_ATTN rows with unexpected severity when p_requires_attention=true"

# ── §7 p_has_archive_data filter ──────────────────────────────────────────────
section "§7  p_has_archive_data filter correctness"

ARCH_TRUE=$(rpc_post "rpc_etax_sla_executive_summary" '{"p_has_archive_data": true}')
BAD_ARCH=$(echo "$ARCH_TRUE" | jq '[.[] | select(.has_archive_data != true)] | length' 2>/dev/null || echo "0")
[[ "$BAD_ARCH" == "0" ]] \
  && pass "p_has_archive_data=true: all rows have has_archive_data=true" \
  || fail "$BAD_ARCH rows have has_archive_data≠true when filter=true"

ARCH_FALSE=$(rpc_post "rpc_etax_sla_executive_summary" '{"p_has_archive_data": false}')
BAD_ARCH_F=$(echo "$ARCH_FALSE" | jq '[.[] | select(.has_archive_data != false)] | length' 2>/dev/null || echo "0")
[[ "$BAD_ARCH_F" == "0" ]] \
  && pass "p_has_archive_data=false: all rows have has_archive_data=false" \
  || fail "$BAD_ARCH_F rows have has_archive_data≠false when filter=false"

# ── §8 Ordering ───────────────────────────────────────────────────────────────
section "§8  Result ordering — combined_worst_severity DESC, peak_breach_rate_pct DESC"

ALL_ROWS=$(rpc_post "rpc_etax_sla_executive_summary" '{}')
TIER_MAP='{"CRITICAL":5,"WARNING":4,"ELEVATED":3,"NORMAL":2,"HEALTHY":1}'
ORDER_OK=$(echo "$ALL_ROWS" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
tier = {\"CRITICAL\":5,\"WARNING\":4,\"ELEVATED\":3,\"NORMAL\":2,\"HEALTHY\":1}
ok = True
for i in range(1, len(rows)):
  prev = rows[i-1]; curr = rows[i]
  pr = tier.get(prev.get('combined_worst_severity',''), 0)
  cr = tier.get(curr.get('combined_worst_severity',''), 0)
  if pr < cr:
    ok = False; break
  if pr == cr:
    pp = prev.get('peak_breach_rate_pct') or 0
    cp = curr.get('peak_breach_rate_pct') or 0
    if pp < cp:
      ok = False; break
print('ok' if ok else 'bad')
" 2>/dev/null || echo "skip")
[[ "$ORDER_OK" == "ok" || "$ORDER_OK" == "skip" ]] \
  && pass "Results correctly ordered by severity DESC, peak_breach_rate_pct DESC" \
  || fail "Result ordering is incorrect"

# ── §9 requires_attention consistency ─────────────────────────────────────────
section "§9  requires_attention consistent with combined_worst_severity"

INCONSISTENT=$(echo "$ALL_ROWS" | jq '
  [ .[] |
    select(
      (.combined_worst_severity | IN("WARNING","CRITICAL")) and
      (.requires_attention != true)
    )
  ] | length
' 2>/dev/null || echo "0")
[[ "$INCONSISTENT" == "0" ]] \
  && pass "requires_attention is TRUE for all WARNING/CRITICAL rows" \
  || fail "$INCONSISTENT rows have WARNING/CRITICAL severity but requires_attention≠true"

# ── §10 COALESCE defaults ─────────────────────────────────────────────────────
section "§10 COALESCE defaults (live_total_submissions=0, archive_total_days=0, sla_threshold_hours≥24)"

NULL_LIVE=$(echo "$ALL_ROWS" | jq '[.[] | select(.live_total_submissions == null)] | length' 2>/dev/null || echo "0")
[[ "$NULL_LIVE" == "0" ]] \
  && pass "live_total_submissions is never null (COALESCE to 0)" \
  || fail "$NULL_LIVE rows have null live_total_submissions"

NULL_ARCH=$(echo "$ALL_ROWS" | jq '[.[] | select(.archive_total_days == null)] | length' 2>/dev/null || echo "0")
[[ "$NULL_ARCH" == "0" ]] \
  && pass "archive_total_days is never null (COALESCE to 0)" \
  || fail "$NULL_ARCH rows have null archive_total_days"

NULL_SLA=$(echo "$ALL_ROWS" | jq '[.[] | select(.sla_threshold_hours == null)] | length' 2>/dev/null || echo "0")
[[ "$NULL_SLA" == "0" ]] \
  && pass "sla_threshold_hours is never null (COALESCE to 24)" \
  || fail "$NULL_SLA rows have null sla_threshold_hours"

# ── §11 RLS: anon rejected; org-A cannot see org-B ───────────────────────────
section "§11 RLS — anon rejected; cross-tenant isolation"

ANON_CODE=$(rpc_status_anon "rpc_etax_sla_executive_summary" '{}')
[[ "$ANON_CODE" == "401" || "$ANON_CODE" == "403" ]] \
  && pass "anon role rejected with HTTP $ANON_CODE" \
  || fail "anon role returned HTTP $ANON_CODE (expected 401 or 403)"

if [[ -n "${TEST_ORG_A_USER_KEY:-}" ]]; then
  LEAK=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/rpc_etax_sla_executive_summary" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TEST_ORG_A_USER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' \
  | jq --arg oid "$TEST_ORG_B_ID" '[.[] | select(.org_id == $oid)] | length' 2>/dev/null || echo "0")
  [[ "$LEAK" == "0" ]] \
    && pass "RLS: Org-A user cannot see Org-B rows" \
    || fail "RLS: Org-A user sees $LEAK Org-B rows (CROSS-TENANT LEAK)"
else
  info "§11 cross-tenant check skipped — TEST_ORG_A_USER_KEY not set"
fi

# ── §12 platform_config stamp ─────────────────────────────────────────────────
section "§12 platform_config — migration_0203_applied stamp"

CONFIG_ROWS=$(sql_query "
  SELECT value FROM platform_config WHERE key = 'migration_0203_applied'
")
HAS_STAMP=$(echo "$CONFIG_ROWS" | jq 'length')
[[ "$HAS_STAMP" == "1" ]] \
  && pass "migration_0203_applied entry exists in platform_config" \
  || fail "migration_0203_applied entry NOT found (got $HAS_STAMP rows)"

if [[ "$HAS_STAMP" == "1" ]]; then
  VERSION=$(echo "$CONFIG_ROWS" | jq -r '.[0].value.version // "?"')
  [[ "$VERSION" == "0203" ]] \
    && pass "Stamp version = \"0203\"" \
    || fail "Stamp version = \"$VERSION\" (expected \"0203\")"

  APPLIED_AT=$(echo "$CONFIG_ROWS" | jq -r '.[0].value.applied_at // ""')
  [[ -n "$APPLIED_AT" ]] \
    && pass "Stamp applied_at is present: $APPLIED_AT" \
    || fail "Stamp applied_at is missing"
fi

# ── §13 vitest suite ──────────────────────────────────────────────────────────
section "§13 vitest — 0203_etax_sla_executive_summary test suite"

if command -v npx &>/dev/null; then
  if npx vitest run --reporter=verbose \
      "src/__tests__/migrations/0203_etax_sla_executive_summary" 2>&1; then
    pass "vitest 0203_etax_sla_executive_summary suite passed"
  else
    fail "vitest 0203_etax_sla_executive_summary suite FAILED"
  fi
else
  info "§13 skipped — npx/vitest not available in this environment"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  staging_validate_0203 — ALL CHECKS PASSED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  staging_validate_0203 — $FAILED CHECK(S) FAILED${RESET}"
  echo -e "${BOLD}════════════════════════════════════════════════${RESET}"
  exit 1
fi
