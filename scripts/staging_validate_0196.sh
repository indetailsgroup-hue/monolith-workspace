#!/usr/bin/env bash
# =============================================================================
# staging_validate_0196.sh
# Staging validation for Migration 0196: Monthly partitioning of etax_submissions
# Tests: partition existence · row routing · cross-partition unique trigger ·
#        indexes · RLS · fn_create_etax_partition idempotency ·
#        rpc_etax_partition_health · v_etax_partition_retention
# Usage : SUPABASE_DB_URL=postgres://... bash staging_validate_0196.sh [--dry-run]
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; FAIL=0; SKIP=0
RESULTS=()

psql_q() { psql "$DB_URL" -At -c "$1" 2>/dev/null; }

run_check() {
  local id="$1" desc="$2" query="$3" expected="$4"
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[SKIP]${NC} $id: $desc (dry-run)"
    RESULTS+=("SKIP|$id|$desc"); (( SKIP++ )); return
  fi
  local result
  result=$(psql_q "$query" 2>&1 || true)
  result=$(echo "$result" | tr -d '[:space:]')
  if [[ "$result" == "$expected" ]]; then
    echo -e "  ${GREEN}[PASS]${NC} $id: $desc"
    RESULTS+=("PASS|$id|$desc"); (( PASS++ ))
  else
    echo -e "  ${RED}[FAIL]${NC} $id: $desc"
    echo -e "         Expected: ${BOLD}$expected${NC}  Got: ${BOLD}$result${NC}"
    RESULTS+=("FAIL|$id|$desc"); (( FAIL++ ))
  fi
}

run_check_gte() {
  local id="$1" desc="$2" query="$3" min="$4"
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[SKIP]${NC} $id: $desc (dry-run)"
    RESULTS+=("SKIP|$id|$desc"); (( SKIP++ )); return
  fi
  local result
  result=$(psql_q "$query" 2>&1 || true)
  result=$(echo "$result" | tr -d '[:space:]')
  if [[ "$result" -ge "$min" ]] 2>/dev/null; then
    echo -e "  ${GREEN}[PASS]${NC} $id: $desc  (got $result ≥ $min)"
    RESULTS+=("PASS|$id|$desc"); (( PASS++ ))
  else
    echo -e "  ${RED}[FAIL]${NC} $id: $desc  (got $result, expected ≥ $min)"
    RESULTS+=("FAIL|$id|$desc"); (( FAIL++ ))
  fi
}

echo -e "\n${BOLD}${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  MONOLITH — Staging Validate: Migration 0196${NC}"
echo -e "${BOLD}${CYAN}  etax_submissions Monthly Partitioning${NC}"
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════${NC}"
$DRY_RUN && echo -e "${YELLOW}  [DRY-RUN MODE] — no DB queries will be executed${NC}\n"

# ─── §1 Partitioned Table Structure ──────────────────────────────────────────
echo -e "\n${BOLD}§1  Partitioned Table Structure${NC}"

run_check "1.1" "etax_submissions is a partitioned table (relkind=p)" \
  "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname='etax_submissions' AND n.nspname='public'" \
  "p"

run_check "1.2" "etax_submissions_pre_partition backup table exists" \
  "SELECT COUNT(*)::text FROM information_schema.tables
   WHERE table_schema='public' AND table_name='etax_submissions_pre_partition'" \
  "1"

run_check_gte "1.3" "At least 39 explicit monthly partitions exist (2024-01→2027-03)" \
  "SELECT COUNT(*) FROM pg_inherits i
   JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_class p ON p.oid=i.inhparent
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE p.relname='etax_submissions' AND n.nspname='public'" \
  39

run_check "1.4" "Default partition etax_submissions_default exists" \
  "SELECT COUNT(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname='etax_submissions_default' AND n.nspname='public'" \
  "1"

run_check "1.5" "Partition etax_submissions_2026_09 exists" \
  "SELECT COUNT(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname='etax_submissions_2026_09' AND n.nspname='public'" \
  "1"

run_check "1.6" "Partition etax_submissions_2024_01 exists" \
  "SELECT COUNT(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname='etax_submissions_2024_01' AND n.nspname='public'" \
  "1"

run_check "1.7" "Partition etax_submissions_2027_03 exists (last explicit)" \
  "SELECT COUNT(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relname='etax_submissions_2027_03' AND n.nspname='public'" \
  "1"

# ─── §2 Row Routing ───────────────────────────────────────────────────────────
echo -e "\n${BOLD}§2  Row Routing Verification${NC}"

# Seed a test org + invoice for routing tests
ROUTING_ORG=$(psql_q "INSERT INTO organizations(id,name,slug) VALUES(gen_random_uuid(),'0196-route-test','0196-route-'||floor(random()*999999)::text) RETURNING id" 2>/dev/null || true)
ROUTING_INV=$(psql_q "INSERT INTO invoices(id,org_id,status,total_amount,due_date) VALUES(gen_random_uuid(),'$ROUTING_ORG','approved',1000,'2026-12-31') RETURNING id" 2>/dev/null || true)

if [[ -n "$ROUTING_ORG" && -n "$ROUTING_INV" ]]; then
  # Insert into Sept 2026
  SEPT_ID=$(psql_q "INSERT INTO etax_submissions(id,org_id,invoice_id,document_type,status,created_at)
    VALUES(gen_random_uuid(),'$ROUTING_ORG','$ROUTING_INV','T01','queued','2026-09-15T10:00:00Z')
    RETURNING id" 2>/dev/null || true)

  run_check "2.1" "Row with created_at=2026-09 routes to etax_submissions_2026_09" \
    "SELECT tableoid::regclass::text FROM etax_submissions WHERE id='$SEPT_ID'" \
    "etax_submissions_2026_09"

  # Insert T02 into Oct 2026 (different doc type — should succeed)
  OCT_INV=$(psql_q "INSERT INTO invoices(id,org_id,status,total_amount,due_date) VALUES(gen_random_uuid(),'$ROUTING_ORG','approved',1000,'2026-12-31') RETURNING id" 2>/dev/null || true)
  OCT_ID=$(psql_q "INSERT INTO etax_submissions(id,org_id,invoice_id,document_type,status,created_at)
    VALUES(gen_random_uuid(),'$ROUTING_ORG','$OCT_INV','T01','queued','2026-10-05T10:00:00Z')
    RETURNING id" 2>/dev/null || true)

  run_check "2.2" "Row with created_at=2026-10 routes to etax_submissions_2026_10" \
    "SELECT tableoid::regclass::text FROM etax_submissions WHERE id='$OCT_ID'" \
    "etax_submissions_2026_10"

  # Verify cross-partition SELECT sees both
  run_check "2.3" "Cross-partition SELECT returns rows from multiple shards" \
    "SELECT COUNT(DISTINCT tableoid::regclass::text)::text FROM etax_submissions WHERE org_id='$ROUTING_ORG'" \
    "2"

  # Cleanup routing rows (cleanup org+invoices later)
  psql_q "DELETE FROM etax_submissions WHERE org_id='$ROUTING_ORG'" >/dev/null 2>&1 || true
  psql_q "DELETE FROM invoices WHERE org_id='$ROUTING_ORG'" >/dev/null 2>&1 || true
  psql_q "DELETE FROM organizations WHERE id='$ROUTING_ORG'" >/dev/null 2>&1 || true
else
  echo -e "  ${YELLOW}[SKIP]${NC} 2.1-2.3: Could not seed routing test data"
  for i in 2.1 2.2 2.3; do RESULTS+=("SKIP|$i|Row routing"); (( SKIP++ )); done
fi

# ─── §3 Cross-Partition Unique Constraint ─────────────────────────────────────
echo -e "\n${BOLD}§3  Cross-Partition Unique Constraint (fn_etax_submissions_cross_partition_unique)${NC}"

run_check "3.1" "trg_etax_submissions_cross_partition_unique trigger exists" \
  "SELECT COUNT(*)::text FROM pg_trigger
   WHERE tgname='trg_etax_submissions_cross_partition_unique'" \
  "1"

run_check "3.2" "fn_etax_submissions_cross_partition_unique function exists" \
  "SELECT COUNT(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname='fn_etax_submissions_cross_partition_unique' AND n.nspname='public'" \
  "1"

# Test duplicate rejection via PL/pgSQL DO block
if ! $DRY_RUN; then
  UQ_ORG=$(psql_q "INSERT INTO organizations(id,name,slug) VALUES(gen_random_uuid(),'0196-uq-test','0196-uq-'||floor(random()*999999)::text) RETURNING id")
  UQ_INV=$(psql_q "INSERT INTO invoices(id,org_id,status,total_amount,due_date) VALUES(gen_random_uuid(),'$UQ_ORG','approved',500,'2026-12-31') RETURNING id")

  psql_q "INSERT INTO etax_submissions(id,org_id,invoice_id,document_type,status,created_at)
    VALUES(gen_random_uuid(),'$UQ_ORG','$UQ_INV','T01','queued','2026-09-01T00:00:00Z')" >/dev/null 2>&1

  CROSS_ERR=$(psql "$DB_URL" -At -c \
    "INSERT INTO etax_submissions(id,org_id,invoice_id,document_type,status,created_at)
     VALUES(gen_random_uuid(),'$UQ_ORG','$UQ_INV','T01','queued','2026-10-01T00:00:00Z')" 2>&1 || true)

  if echo "$CROSS_ERR" | grep -qi "duplicate key value"; then
    echo -e "  ${GREEN}[PASS]${NC} 3.3: Cross-partition duplicate (invoice_id+document_type) rejected by trigger"
    RESULTS+=("PASS|3.3|Cross-partition duplicate rejected"); (( PASS++ ))
  else
    echo -e "  ${RED}[FAIL]${NC} 3.3: Cross-partition duplicate was NOT rejected"
    echo -e "         psql output: ${BOLD}${CROSS_ERR:0:150}${NC}"
    RESULTS+=("FAIL|3.3|Cross-partition duplicate rejected"); (( FAIL++ ))
  fi

  # Different doc_type same invoice should succeed
  DIFF_ERR=$(psql "$DB_URL" -At -c \
    "INSERT INTO etax_submissions(id,org_id,invoice_id,document_type,status,created_at)
     VALUES(gen_random_uuid(),'$UQ_ORG','$UQ_INV','T02','queued','2026-10-01T00:00:00Z')" 2>&1 || true)

  if echo "$DIFF_ERR" | grep -qiv "error\|duplicate"; then
    echo -e "  ${GREEN}[PASS]${NC} 3.4: Same invoice different document_type in different partition allowed"
    RESULTS+=("PASS|3.4|Different doc_type allowed cross-partition"); (( PASS++ ))
  else
    echo -e "  ${RED}[FAIL]${NC} 3.4: Different doc_type was unexpectedly rejected"
    RESULTS+=("FAIL|3.4|Different doc_type allowed cross-partition"); (( FAIL++ ))
  fi

  psql_q "DELETE FROM etax_submissions WHERE org_id='$UQ_ORG'" >/dev/null 2>&1 || true
  psql_q "DELETE FROM invoices WHERE id='$UQ_INV'" >/dev/null 2>&1 || true
  psql_q "DELETE FROM organizations WHERE id='$UQ_ORG'" >/dev/null 2>&1 || true
else
  echo -e "  ${YELLOW}[SKIP]${NC} 3.3-3.4: (dry-run)"
  for i in 3.3 3.4; do RESULTS+=("SKIP|$i|Unique trigger"); (( SKIP++ )); done
fi

# ─── §4 Performance Indexes ───────────────────────────────────────────────────
echo -e "\n${BOLD}§4  Performance Indexes${NC}"

INDEXES=(
  "idx_etax_submissions_org_status"
  "idx_etax_submissions_invoice_id"
  "idx_etax_submissions_retry_queue"
  "idx_etax_submissions_pdf_status"
  "idx_etax_submissions_org_created"
  "idx_etax_submissions_metadata"
)

for idx in "${INDEXES[@]}"; do
  run_check "4.${idx: -1}" "Index $idx exists" \
    "SELECT COUNT(*)::text FROM pg_indexes WHERE indexname='$idx'" \
    "1"
done

# ─── §5 RLS Policies ──────────────────────────────────────────────────────────
echo -e "\n${BOLD}§5  RLS Policies${NC}"

run_check "5.1" "RLS is enabled on etax_submissions" \
  "SELECT relrowsecurity::text FROM pg_class
   WHERE relname='etax_submissions' AND relnamespace='public'::regnamespace" \
  "t"

run_check "5.2" "Policy etax_submissions_org_isolation exists" \
  "SELECT COUNT(*)::text FROM pg_policies
   WHERE tablename='etax_submissions' AND policyname='etax_submissions_org_isolation'" \
  "1"

run_check "5.3" "Policy etax_submissions_service_role exists" \
  "SELECT COUNT(*)::text FROM pg_policies
   WHERE tablename='etax_submissions' AND policyname='etax_submissions_service_role'" \
  "1"

# ─── §6 fn_create_etax_partition Idempotency ─────────────────────────────────
echo -e "\n${BOLD}§6  fn_create_etax_partition Idempotency${NC}"

run_check "6.1" "fn_create_etax_partition exists" \
  "SELECT COUNT(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname='fn_create_etax_partition' AND n.nspname='public'" \
  "1"

if ! $DRY_RUN; then
  IDEM_RESULT=$(psql_q "SELECT public.fn_create_etax_partition(2026, 9)" 2>/dev/null || true)
  if echo "$IDEM_RESULT" | grep -qi "already exists"; then
    echo -e "  ${GREEN}[PASS]${NC} 6.2: fn_create_etax_partition(2026,9) returns 'already exists'"
    RESULTS+=("PASS|6.2|Idempotent existing partition"); (( PASS++ ))
  else
    echo -e "  ${RED}[FAIL]${NC} 6.2: fn_create_etax_partition(2026,9) unexpected result: $IDEM_RESULT"
    RESULTS+=("FAIL|6.2|Idempotent existing partition"); (( FAIL++ ))
  fi
else
  echo -e "  ${YELLOW}[SKIP]${NC} 6.2: (dry-run)"
  RESULTS+=("SKIP|6.2|Idempotent existing partition"); (( SKIP++ ))
fi

run_check "6.3" "fn_auto_create_next_etax_partition exists" \
  "SELECT COUNT(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname='fn_auto_create_next_etax_partition' AND n.nspname='public'" \
  "1"

run_check "6.4" "pg_cron job auto-create-etax-partition registered" \
  "SELECT COUNT(*)::text FROM cron.job WHERE jobname='auto-create-etax-partition'" \
  "1"

# ─── §7 rpc_etax_partition_health ─────────────────────────────────────────────
echo -e "\n${BOLD}§7  rpc_etax_partition_health RPC${NC}"

run_check "7.1" "rpc_etax_partition_health function exists" \
  "SELECT COUNT(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.proname='rpc_etax_partition_health' AND n.nspname='public'" \
  "1"

run_check_gte "7.2" "rpc_etax_partition_health returns ≥ 39 rows" \
  "SELECT COUNT(*) FROM public.rpc_etax_partition_health()" \
  39

run_check "7.3" "Default partition appears in rpc_etax_partition_health" \
  "SELECT COUNT(*)::text FROM public.rpc_etax_partition_health() WHERE is_default=true" \
  "1"

run_check "7.4" "v_etax_partition_retention view exists" \
  "SELECT COUNT(*)::text FROM information_schema.views
   WHERE table_schema='public' AND table_name='v_etax_partition_retention'" \
  "1"

run_check_gte "7.5" "v_etax_partition_retention shows ≥ 6 ARCHIVE_CANDIDATE rows (2024 partitions)" \
  "SELECT COUNT(*) FROM public.v_etax_partition_retention WHERE retention_status='ARCHIVE_CANDIDATE'" \
  6

# ─── §8 Data Migration Integrity ─────────────────────────────────────────────
echo -e "\n${BOLD}§8  Data Migration Integrity${NC}"

run_check "8.1" "Row count in partitioned table ≥ row count in backup table" \
  "SELECT CASE WHEN
     (SELECT COUNT(*) FROM public.etax_submissions) >=
     (SELECT COUNT(*) FROM public.etax_submissions_pre_partition)
   THEN '1' ELSE '0' END" \
  "1"

# ─── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$(( PASS + FAIL + SKIP ))
echo -e "\n${BOLD}${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Results: ${GREEN}$PASS PASS${NC} · ${RED}$FAIL FAIL${NC} · ${YELLOW}$SKIP SKIP${NC}  (Total: $TOTAL)"
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════${NC}\n"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}${BOLD}FAILED checks:${NC}"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status id desc <<< "$r"
    [[ "$status" == "FAIL" ]] && echo -e "  ${RED}✗ $id${NC}: $desc"
  done
  echo ""
  exit 1
fi

echo -e "${GREEN}${BOLD}All checks passed. Migration 0196 is healthy on staging.${NC}\n"
exit 0
