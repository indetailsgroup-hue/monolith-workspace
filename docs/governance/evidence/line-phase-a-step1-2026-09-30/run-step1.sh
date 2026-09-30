#!/usr/bin/env bash
# Phase A step 1 evidence run (docs/PRD-LINE-OA.*.md §9.1).
#
# Run from the repository root:
#   bash docs/governance/evidence/line-phase-a-step1-2026-09-30/run-step1.sh
#
# What it does, in order:
#   1. starts a throwaway Postgres container from a locally cached image
#      (never the shared stack), bound to 127.0.0.1 only;
#   2. records a baseline of the empty image, applies every file in
#      supabase/migrations from zero in C-locale filename order, one
#      transaction per file, and stops at the first failure (no shims);
#   3. records a baseline after the migration chain;
#   4. runs the LINE outbound pgTAP suite, the two-client claim race, and the
#      12 required Python suites, each with before/after checks of stated scope;
#   5. removes the container and writes SHA256SUMS.
#
# The database password is generated per run, passed only through PGPASSWORD,
# and never written to disk. Overridable: STEP1_PORT, PSQL_BIN, PYTHON_BIN,
# STEP1_IMAGE, STEP1_OUT.
set -u

OUT="${STEP1_OUT:-docs/governance/evidence/line-phase-a-step1-2026-09-30}"
IMAGE="${STEP1_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.158}"
NAME="line-phase-a-step1-evidence"
PORT="${STEP1_PORT:-55442}"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
export PGPASSWORD="$PW"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"
export PYTHONDONTWRITEBYTECODE=1
export HYPOTHESIS_STORAGE_DIRECTORY="${TMPDIR:-/tmp}/line-phase-a-step1-hypothesis"

mkdir -p "$OUT"
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }

CHECK_SQL="select 'outbound_columns_A1_A4', count(*)::text from information_schema.columns where table_schema='public' and table_name='line_oa_outbound_messages' and column_name in ('claimed_at','claimed_by','claim_token','next_attempt_at','attempt_count')
union all select 'fn_rpc_claim_line_outbound_batch', count(*)::text from pg_proc where proname='rpc_claim_line_outbound_batch'
union all select 'fn_rpc_record_line_send_result_5arg', count(*)::text from pg_proc where proname='rpc_record_line_send_result' and pronargs=5
union all select 'ext_pgtap_version', coalesce((select extversion from pg_extension where extname='pgtap'),'absent')
union all select 'rows_line_oa_outbound_messages', count(*)::text from public.line_oa_outbound_messages
union all select 'rows_line_oa_audit_log', count(*)::text from public.line_oa_audit_log
union all select 'rows_line_groups', count(*)::text from public.line_groups
union all select 'rows_line_oa_conversations', count(*)::text from public.line_oa_conversations
union all select 'cron_jobs', case when to_regclass('cron.job') is null then 'pg_cron absent' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job', false, true, '')))[1]::text end;"

FINGERPRINT_SQL="select md5(string_agg(x, E'\n' order by x)) from (
  select 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  union all select 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema')
  union all select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(coalesce(p.prosrc,'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')
  union all select 'ext|'||extname||'|'||extversion from pg_extension
) s;"

record_baseline() { # $1 = file
  {
    echo "captured_utc: $(utc)"
    echo "catalog_fingerprint_md5 (relations, columns, function identities + source hashes, extensions): $(q "$FINGERPRINT_SQL")"
    echo "pg_dump_schema_only_sha256 (as supabase_admin, run inside the container): $(docker exec -e PGPASSWORD="$PW" "$NAME" pg_dump -h 127.0.0.1 -U supabase_admin -d postgres --schema-only --no-owner 2>/dev/null | sha256sum | cut -d' ' -f1) (e3b0c442... = empty dump, i.e. pg_dump failed)"
    echo "schemas:"; q "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1" | sed 's/^/  /'
    echo "extensions:"; q "select extname||' '||extversion from pg_extension order by 1" | sed 's/^/  /'
  } > "$1"
}

{
  echo "evidence_bundle: $OUT"
  echo "started_utc: $(utc)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD)"
  echo "accepted_A4_sha: $(git rev-parse 46a203a6)"
  echo "code_under_test_diff_vs_A4 (supabase, tests/line-oa-commerce): [$(git diff --stat 46a203a6 HEAD -- supabase tests/line-oa-commerce | tail -1)] (empty = byte-identical)"
  echo "uncommitted_changes_in_code_under_test: [$(git status --porcelain -- supabase tests/line-oa-commerce | grep -v desktop.ini)] (empty = clean)"
  echo "image: $IMAGE"
  echo "image_id: $(docker image inspect --format '{{.Id}}' "$IMAGE" 2>&1)"
  echo "image_repo_digests: $(docker image inspect --format '{{join .RepoDigests ","}}' "$IMAGE" 2>&1)"
  echo "container: $NAME on 127.0.0.1:$PORT (throwaway; removed at the end)"
  echo "dsn: $DSN (password generated per run, passed via PGPASSWORD, never written)"
  echo "node: $(node --version)"
  echo "python: $("$PY" --version 2>&1) · pytest $("$PY" -c 'import pytest;print(pytest.__version__)' 2>&1) · hypothesis $("$PY" -c 'import hypothesis;print(hypothesis.__version__)' 2>&1) · psycopg $("$PY" -c 'import psycopg;print(psycopg.__version__)' 2>&1)"
  echo "psql_client: $("$PSQL" --version)"
  echo "docker: $(docker version --format '{{.Server.Version}}' 2>&1)"
} > "$CTX"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1
  {
    echo "removed_utc: $(utc)"
    echo "container_present_after_removal: [$(docker ps -a --filter "name=^${NAME}$" --format '{{.Names}}')] (empty = removed)"
  } > "$OUT/09-teardown.txt"
}

docker rm -f "$NAME" >/dev/null 2>&1
if ! docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:5432" -e POSTGRES_PASSWORD="$PW" "$IMAGE" >/dev/null 2>"$OUT/docker-run-error.txt"; then
  echo "container_start: FAILED (see docker-run-error.txt)" >> "$CTX"; cleanup; exit 2
fi
rm -f "$OUT/docker-run-error.txt"

ok=0
for _ in $(seq 1 90); do
  if "$PSQL" "$DSN" -X -tA -c 'select 1' >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
  [ "$ok" -ge 3 ] && break
  sleep 2
done
if [ "$ok" -lt 3 ]; then echo "db_ready: TIMEOUT" >> "$CTX"; docker logs "$NAME" > "$OUT/docker-logs.txt" 2>&1; cleanup; exit 3; fi
echo "db_ready_utc: $(utc)" >> "$CTX"
echo "db_server: $(q 'select version()')" >> "$CTX"

record_baseline "$OUT/01-baseline-empty-image.txt"

MIG="$OUT/02-migrations-applied.txt"
: > "$MIG"
mig_failed=0
for f in $(ls supabase/migrations/*.sql | LC_ALL=C sort); do
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  if out=$("$PSQL" "$DSN" -X -q -1 -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok  $sum  $f" >> "$MIG"
  else
    echo "FAIL $sum  $f" >> "$MIG"
    { echo "failed_migration: $f"; echo "$out"; } > "$OUT/02-migration-failure.txt"
    mig_failed=1
    break
  fi
done
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIG") · failed: $mig_failed" >> "$CTX"
if [ "$mig_failed" -ne 0 ]; then
  echo "result: STOPPED at first failing migration (no shims applied); tests not run" >> "$CTX"
  cleanup
  echo "finished_utc: $(utc)" >> "$CTX"
  (cd "$OUT" && sha256sum $(ls | grep -v '^SHA256SUMS$' | LC_ALL=C sort) > SHA256SUMS)
  exit 4
fi

record_baseline "$OUT/03-baseline-after-migrations.txt"
{ echo "cron jobs created by the migration chain itself (disposable container; no vault secrets are seeded, so no job can reach an HTTP target):"; q "select jobname||' | '||schedule||' | '||command from cron.job order by jobname" | sed 's/^/  /'; } >> "$OUT/03-baseline-after-migrations.txt"

{ echo "scope: exactly the values listed below, nothing else"; echo "captured_utc: $(utc)"; q "$CHECK_SQL"; } > "$OUT/04-precheck.txt"

"$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" -f supabase/tests/line_outbound_claim_record.sql > "$OUT/05-pgtap-output.tap" 2>&1
echo "pgtap_exit=$?" >> "$CTX"

LINE_CLAIM_RACE_DSN="$DSN" LINE_CLAIM_RACE_EPHEMERAL=1 PSQL_BIN="$PSQL" node tests/line-oa-commerce/concurrency/claim-race.mjs > "$OUT/06-claim-race-output.txt" 2>&1
echo "claim_race_exit=$?" >> "$CTX"

REQUIRED=$(grep -lE "rpc_record_line_send_result|rpc_claim_line_outbound_batch|line_oa_outbound_messages" tests/line-oa-commerce/py/*.py | LC_ALL=C sort)
echo "required_python_suites ($(echo "$REQUIRED" | wc -l | tr -d ' ')): $(echo $REQUIRED)" >> "$CTX"
LINE_OA_TEST_DATABASE_URL="$DSN" "$PY" -m pytest -c tests/line-oa-commerce/py/pytest.ini --rootdir tests/line-oa-commerce/py \
  -p no:cacheprovider -rA --junitxml="$OUT/07-pytest-junit.xml" $REQUIRED > "$OUT/07-pytest-output.txt" 2>&1
echo "pytest_exit=$?" >> "$CTX"

{ echo "scope: exactly the values listed below, nothing else"; echo "captured_utc: $(utc)"; q "$CHECK_SQL"; } > "$OUT/08-postcheck.txt"

cleanup
echo "finished_utc: $(utc)" >> "$CTX"
(cd "$OUT" && sha256sum $(ls | grep -v '^SHA256SUMS$' | LC_ALL=C sort) > SHA256SUMS)
exit 0
