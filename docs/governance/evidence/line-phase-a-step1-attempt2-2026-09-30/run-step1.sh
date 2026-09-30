#!/usr/bin/env bash
# Phase A step 1 evidence run — attempt 2 (docs/PRD-LINE-OA.*.md §9.1).
#
# Run from the repository root:
#   bash docs/governance/evidence/line-phase-a-step1-attempt2-2026-09-30/run-step1.sh
#
# Attempt 1 (../line-phase-a-step1-2026-09-30) stopped at the first migration
# because a bare postgres image has no auth.jwt(); those functions come from the
# auth service. This attempt, as chosen by the owner, starts a small throwaway
# stack from LOCALLY CACHED images only (no downloads, never the shared stack):
#   db       public.ecr.aws/supabase/postgres   (published on 127.0.0.1 only)
#   auth     public.ecr.aws/supabase/gotrue     (runs its own auth migrations)
#   storage  public.ecr.aws/supabase/storage-api (runs its own storage migrations)
# It differs from CI's `supabase start` (no REST, realtime, edge runtime, studio,
# analytics, and no other docker/volumes/db init scripts than 01b).
#
# Order: stack up → service bootstrap (01b, role passwords only) → wait for the
# services' own migrations → baseline → apply supabase/migrations from zero in
# C-locale filename order, one transaction per file, stop at the first failure
# (no shims) → baseline → checks → pgTAP suite → two-client claim race → the 12
# required Python suites → checks → remove everything → SHA256SUMS.
#
# Secrets (database password, JWT secret, derived service keys) are generated per
# run, passed only through the environment, never written to disk, and scrubbed
# from any captured container log. Overridable: STEP1_PORT, PSQL_BIN,
# PYTHON_BIN, STEP1_OUT, STEP1_DB_IMAGE, STEP1_AUTH_IMAGE, STEP1_STORAGE_IMAGE.
set -u

OUT="${STEP1_OUT:-docs/governance/evidence/line-phase-a-step1-attempt2-2026-09-30}"
DB_IMAGE="${STEP1_DB_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.158}"
AUTH_IMAGE="${STEP1_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.195.0}"
STORAGE_IMAGE="${STEP1_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.66.4}"
NET="line-phase-a-step1-net"
DB="line-phase-a-step1-db"
AUTH="line-phase-a-step1-auth"
STORAGE="line-phase-a-step1-storage"
PORT="${STEP1_PORT:-55442}"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
JWT_SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PGPASSWORD="$PW" JWT_SECRET
mkjwt() { node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"});const p=b({role:process.argv[1],iss:"line-phase-a-step1",iat:1700000000,exp:4102444800});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"
export PYTHONDONTWRITEBYTECODE=1
export HYPOTHESIS_STORAGE_DIRECTORY="${TMPDIR:-/tmp}/line-phase-a-step1-hypothesis"

mkdir -p "$OUT"
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }
scrub() { sed -e "s/$PW/[REDACTED]/g" -e "s/$JWT_SECRET/[REDACTED]/g" -e "s/$ANON_KEY/[REDACTED]/g" -e "s/$SERVICE_KEY/[REDACTED]/g"; }

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
  select 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind::text as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  union all select 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema')
  union all select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(coalesce(p.prosrc,'')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')
  union all select 'ext|'||extname||'|'||extversion from pg_extension
) s;"

record_baseline() { # $1 = file
  {
    echo "captured_utc: $(utc)"
    echo "catalog_fingerprint_md5 (relations, columns, function identities + source hashes, extensions): $(q "$FINGERPRINT_SQL")"
    echo "pg_dump_schema_only_sha256 (as supabase_admin, inside the db container): $(docker exec -e PGPASSWORD="$PW" "$DB" pg_dump -h 127.0.0.1 -U supabase_admin -d postgres --schema-only --no-owner 2>/dev/null | sha256sum | cut -d' ' -f1) (e3b0c442... = empty dump, i.e. pg_dump failed)"
    echo "schemas:"; q "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1" | sed 's/^/  /'
    echo "extensions:"; q "select extname||' '||extversion from pg_extension order by 1" | sed 's/^/  /'
  } > "$1"
}

image_line() { echo "$1 id=$(docker image inspect --format '{{.Id}}' "$1" 2>&1) digests=$(docker image inspect --format '{{join .RepoDigests ","}}' "$1" 2>&1)"; }

{
  echo "evidence_bundle: $OUT"
  echo "started_utc: $(utc)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD)"
  echo "accepted_A4_sha: $(git rev-parse 46a203a6)"
  echo "code_under_test_diff_vs_A4 (supabase, tests/line-oa-commerce): [$(git diff --stat 46a203a6 HEAD -- supabase tests/line-oa-commerce | tail -1)] (empty = byte-identical)"
  echo "uncommitted_changes_in_code_under_test: [$(git status --porcelain -- supabase tests/line-oa-commerce | grep -v desktop.ini)] (empty = clean)"
  echo "db_image: $(image_line "$DB_IMAGE")"
  echo "auth_image: $(image_line "$AUTH_IMAGE")"
  echo "storage_image: $(image_line "$STORAGE_IMAGE")"
  echo "network: $NET · containers: $DB (127.0.0.1:$PORT), $AUTH, $STORAGE (all throwaway; removed at the end)"
  echo "dsn: $DSN (password generated per run, passed via PGPASSWORD, never written)"
  echo "node: $(node --version)"
  echo "python: $("$PY" --version 2>&1) · pytest $("$PY" -c 'import pytest;print(pytest.__version__)' 2>&1) · hypothesis $("$PY" -c 'import hypothesis;print(hypothesis.__version__)' 2>&1) · psycopg $("$PY" -c 'import psycopg;print(psycopg.__version__)' 2>&1)"
  echo "psql_client: $("$PSQL" --version)"
  echo "docker: $(docker version --format '{{.Server.Version}}' 2>&1)"
} > "$CTX"

save_logs() { for c in "$DB" "$AUTH" "$STORAGE"; do docker logs "$c" 2>&1 | scrub > "$OUT/logs-$c.txt"; done; }
cleanup() {
  docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  {
    echo "removed_utc: $(utc)"
    echo "containers_present_after_removal: [$(docker ps -a --filter "name=^line-phase-a-step1-" --format '{{.Names}}' | tr '\n' ' ')] (empty = removed)"
    echo "network_present_after_removal: [$(docker network ls --filter "name=^${NET}$" --format '{{.Name}}')] (empty = removed)"
  } > "$OUT/09-teardown.txt"
}
finish() { # $1 = exit code
  echo "finished_utc: $(utc)" >> "$CTX"
  (cd "$OUT" && sha256sum $(ls | grep -v '^SHA256SUMS$' | LC_ALL=C sort) > SHA256SUMS)
  exit "$1"
}
fail() { # $1 = code, $2 = reason
  echo "result: STOPPED — $2" >> "$CTX"; save_logs; cleanup; finish "$1"
}

docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
docker network rm "$NET" >/dev/null 2>&1
docker network create "$NET" >/dev/null || fail 2 "could not create docker network"
docker run -d --name "$DB" --network "$NET" --network-alias db -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD="$PW" "$DB_IMAGE" >/dev/null 2>&1 || fail 2 "db container did not start"

ok=0
for _ in $(seq 1 90); do
  if "$PSQL" "$DSN" -X -tA -c 'select 1' >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
  [ "$ok" -ge 3 ] && break
  sleep 2
done
[ "$ok" -ge 3 ] || fail 3 "db not ready within 180 s"
echo "db_ready_utc: $(utc)" >> "$CTX"
echo "db_server: $(q 'select version()')" >> "$CTX"

record_baseline "$OUT/01a-baseline-empty-image.txt"

"$PSQL" "$ADMIN_DSN" -X -q -v ON_ERROR_STOP=1 -v pw="$PW" -f "$OUT/01b-service-bootstrap.sql" > "$OUT/01b-service-bootstrap-output.txt" 2>&1 \
  || fail 3 "service bootstrap (01b) failed"
echo "service_bootstrap: ok (01b-service-bootstrap.sql)" >> "$CTX"

docker run -d --name "$AUTH" --network "$NET" \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://localhost:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${PW}@db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_DISABLE_SIGNUP=true \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  "$AUTH_IMAGE" >/dev/null 2>&1 || fail 3 "auth container did not start"

docker run -d --name "$STORAGE" --network "$NET" \
  -e DATABASE_URL="postgres://supabase_storage_admin:${PW}@db:5432/postgres" \
  -e ANON_KEY="$ANON_KEY" -e SERVICE_KEY="$SERVICE_KEY" \
  -e AUTH_JWT_SECRET="$JWT_SECRET" -e PGRST_JWT_SECRET="$JWT_SECRET" -e POSTGREST_URL=http://rest.invalid:3000 \
  -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/tmp/storage -e FILE_SIZE_LIMIT=52428800 \
  -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false \
  "$STORAGE_IMAGE" >/dev/null 2>&1 || fail 3 "storage container did not start"

ready=0
for _ in $(seq 1 90); do
  a=$(q "select to_regprocedure('auth.jwt()') is not null and to_regclass('auth.users') is not null")
  s=$(q "select to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null")
  if [ "$a" = "t" ] && [ "$s" = "t" ]; then ready=1; break; fi
  sleep 2
done
echo "auth_schema_ready: $a · storage_schema_ready: $s" >> "$CTX"
[ "$ready" -eq 1 ] || fail 3 "auth/storage services did not finish their own migrations within 180 s"
echo "services_ready_utc: $(utc)" >> "$CTX"

record_baseline "$OUT/01c-baseline-after-services.txt"

MIG="$OUT/02-migrations-applied.txt"
: > "$MIG"
mig_failed=0
for f in $(ls supabase/migrations/*.sql | LC_ALL=C sort); do
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  if out=$("$PSQL" "$DSN" -X -q -1 -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok  $sum  $f" >> "$MIG"
  else
    echo "FAIL $sum  $f" >> "$MIG"
    { echo "failed_migration: $f"; echo "$out"; } | scrub > "$OUT/02-migration-failure.txt"
    mig_failed=1
    break
  fi
done
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIG") · failed: $mig_failed" >> "$CTX"
[ "$mig_failed" -eq 0 ] || fail 4 "at first failing migration (no shims applied); tests not run"

record_baseline "$OUT/03-baseline-after-migrations.txt"
{ echo "cron jobs created by the migration chain itself (throwaway stack; no vault secrets are seeded, so no job can reach an HTTP target):"; q "select jobname||' | '||schedule||' | '||command from cron.job order by jobname" | sed 's/^/  /'; } >> "$OUT/03-baseline-after-migrations.txt"

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

echo "result: COMPLETED (see exit codes above)" >> "$CTX"
save_logs
cleanup
finish 0
