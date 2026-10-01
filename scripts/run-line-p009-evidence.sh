#!/usr/bin/env bash
# P0-9 isolated evidence runner, adapted from scripts/run-line-p011-evidence.sh.
#   P009_MODE=red   apply every migration except 0200 (the schema before P0-9)
#   P009_MODE=green apply every migration including 0200
#   STEP1_OUT       a new output directory (never overwritten)
# Builds a throwaway stack (postgres + gotrue + storage-api from cached images)
# on its own docker network, runs the P0-9 suite, the fifteen-suite loop, both
# two-client races, the CI harness tests and every Python property suite, then
# removes the stack. Never touches the shared stack. cron.launch_active_jobs=off.
set -u
set -o pipefail
MODE="${P009_MODE:?set P009_MODE=red or green}"
[[ "$MODE" = red || "$MODE" = green ]] || exit 2

OUT="${STEP1_OUT:?set a new output directory}"
[ ! -e "$OUT" ] || { echo "Refusing to overwrite evidence"; exit 2; }
DB_IMAGE="${STEP1_DB_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.158}"
AUTH_IMAGE="${STEP1_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.195.0}"
STORAGE_IMAGE="${STEP1_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.66.4}"
NET="line-p009-net"
DB="line-p009-db"
AUTH="line-p009-auth"
STORAGE="line-p009-storage"
PORT="${STEP1_PORT:-55448}"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
JWT_SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PGCONNECT_TIMEOUT=3 PGCLIENTENCODING=UTF8
export PGPASSWORD="$PW" JWT_SECRET
mkjwt() { node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"});const p=b({role:process.argv[1],iss:"line-p009",iat:1700000000,exp:4102444800});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"
export PYTHONDONTWRITEBYTECODE=1
export HYPOTHESIS_STORAGE_DIRECTORY="${TMPDIR:-/tmp}/line-p009-hypothesis"

mkdir -p "$OUT"
printf "* -text\n" > "$OUT/.gitattributes"
cp docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/01b-service-bootstrap.sql "$OUT/01b-service-bootstrap.sql"
cp scripts/run-line-p009-evidence.sh scripts/verify-line-p009-evidence.py "$OUT/"
sha256sum supabase/migrations/*.sql supabase/tests/*.sql tests/line-oa-commerce/concurrency/*.mjs \
  scripts/line-ci-tap.mjs scripts/run-line-db-suites.sh scripts/run-line-p009-evidence.sh \
  scripts/verify-line-p009-evidence.py > "$OUT/source-SHA256SUMS"
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }
scrub() { sed -e "s/$PW/[REDACTED]/g" -e "s/$JWT_SECRET/[REDACTED]/g" -e "s/$ANON_KEY/[REDACTED]/g" -e "s/$SERVICE_KEY/[REDACTED]/g"; }

CHECK_SQL="select 'fn_rpc_line_inbound_retry_sweep', count(*)::text from pg_proc where proname='rpc_line_inbound_retry_sweep'
union all select 'tbl_line_oa_inbound_retry', (to_regclass('public.line_oa_inbound_retry') is not null)::text
union all select 'rows_line_oa_inbound_retry', case when to_regclass('public.line_oa_inbound_retry') is null then 'absent' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.line_oa_inbound_retry', false, true, '')))[1]::text end
union all select 'rows_line_oa_inbound_messages', count(*)::text from public.line_oa_inbound_messages
union all select 'rows_line_oa_outbound_messages', count(*)::text from public.line_oa_outbound_messages
union all select 'rows_line_oa_audit_log', count(*)::text from public.line_oa_audit_log
union all select 'rows_line_groups', count(*)::text from public.line_groups
union all select 'cron_jobs', case when to_regclass('cron.job') is null then 'pg_cron absent' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job', false, true, '')))[1]::text end
union all select 'cron_jobs_inbound_retry', case when to_regclass('cron.job') is null then 'pg_cron absent' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where command ilike ''%inbound_retry%''', false, true, '')))[1]::text end
union all select 'cron_job_runs', case when to_regclass('cron.job_run_details') is null then 'absent' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job_run_details', false, true, '')))[1]::text end;"

image_line() { echo "$1 id=$(docker image inspect --format '{{.Id}}' "$1" 2>&1)"; }

{
  echo "evidence_bundle: $OUT"
  echo "mode: $MODE"
  echo "started_utc: $(utc)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD)"
  echo "uncommitted_changes_in_code_under_test: [$(git status --porcelain -- supabase tests scripts .github | grep -v desktop.ini)] (empty = clean)"
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

save_logs() { for c in "$DB" "$AUTH" "$STORAGE"; do docker logs "$c" 2>&1 | scrub | tail -n 200 > "$OUT/logs-$c.tail200.txt"; done; }
cleanup() {
  docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  {
    echo "removed_utc: $(utc)"
    echo "containers_present_after_removal: [$(docker ps -a --filter "name=^line-p009-" --format '{{.Names}}' | tr '\n' ' ')] (empty = removed)"
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

[ -z "$(docker ps -a --filter name=^line-p009- --format '{{.Names}}')" ] || { echo "P0-9 containers already exist; refusing cleanup"; exit 2; }
[ -z "$(docker network ls --filter name=^line-p009-net$ --format '{{.Name}}')" ] || exit 2
for img in "$DB_IMAGE" "$AUTH_IMAGE" "$STORAGE_IMAGE"; do docker image inspect "$img" >/dev/null 2>&1 || exit 2; done
trap 'save_logs; cleanup' INT TERM
docker network create "$NET" >/dev/null || fail 2 "could not create docker network"
MSYS_NO_PATHCONV=1 docker run -d --name "$DB" --network "$NET" --network-alias db -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD="$PW" "$DB_IMAGE" postgres -D /etc/postgresql -c cron.launch_active_jobs=off >/dev/null 2>&1 || fail 2 "db container did not start"

ok=0
for _ in $(seq 1 90); do
  [ "$(docker inspect --format '{{.State.Running}}' "$DB")" = true ] || fail 3 "db process exited during startup"
  if "$PSQL" "$DSN" -X -tA -c 'select 1' >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; fi
  [ "$ok" -ge 3 ] && break
  sleep 2
done
[ "$ok" -ge 3 ] || fail 3 "db not ready within 180 s"
echo "db_ready_utc: $(utc)" >> "$CTX"
echo "cron_launch_active_jobs: $(q 'show cron.launch_active_jobs')" >> "$CTX"
[ "$(q 'show cron.launch_active_jobs')" = off ] || fail 3 "cron scheduler not disabled"
echo "db_server: $(q 'select version()')" >> "$CTX"

"$PSQL" "$ADMIN_DSN" -X -q -v ON_ERROR_STOP=1 -v pw="$PW" -f "$OUT/01b-service-bootstrap.sql" > "$OUT/01b-service-bootstrap-output.txt" 2>&1 \
  || fail 3 "service bootstrap (01b) failed"
echo "service_bootstrap: ok (01b-service-bootstrap.sql)" >> "$CTX"

MSYS_NO_PATHCONV=1 docker run -d --name "$AUTH" --network "$NET" \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://localhost:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${PW}@db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_DISABLE_SIGNUP=true \
  -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  "$AUTH_IMAGE" >/dev/null 2>&1 || fail 3 "auth container did not start"

MSYS_NO_PATHCONV=1 docker run -d --name "$STORAGE" --network "$NET" \
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

MIG="$OUT/02-migrations-applied.txt"
: > "$MIG"
mig_failed=0
for f in $(ls supabase/migrations/*.sql | LC_ALL=C sort); do
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  case "$f" in
    *0200_line_inbound_handler_retry.sql)
      if [ "$MODE" = red ]; then echo "skip $sum  $f (RED: schema before P0-9)" >> "$MIG"; continue; fi ;;
  esac
  if out=$("$PSQL" "$DSN" -X -q -1 -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok  $sum  $f" >> "$MIG"
  else
    echo "FAIL $sum  $f" >> "$MIG"
    { echo "failed_migration: $f"; echo "$out"; } | scrub > "$OUT/02-migration-failure.txt"
    mig_failed=1
    break
  fi
done
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIG") · skipped: $(grep -c '^skip ' "$MIG") · failed: $mig_failed" >> "$CTX"
[ "$mig_failed" -eq 0 ] || fail 4 "at first failing migration (no shims applied); tests not run"
{ echo "cron jobs created by the migration chain itself (throwaway stack; cron.launch_active_jobs=off):"; q "select jobname||' | '||schedule||' | '||command from cron.job order by jobname" | sed 's/^/  /'; } > "$OUT/03-cron-jobs.txt"

{ echo "scope: exactly the values listed below, nothing else"; echo "captured_utc: $(utc)"; q "$CHECK_SQL"; } > "$OUT/04-precheck.txt"

"$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" -f supabase/tests/line_inbound_handler_retry.sql > "$OUT/05-p009-pgtap.tap" 2> "$OUT/05-p009-pgtap.stderr"
p009_exit=$?
echo "p009_pgtap_exit=$p009_exit" >> "$CTX"

LINE_DB_TEST_DSN="$DSN" LINE_DB_TAP_DIR="$OUT/06-suite-loop" PSQL_BIN="$PSQL" LINE_DB_RUN_ID="p009-$MODE" \
  bash scripts/run-line-db-suites.sh > "$OUT/06-suite-loop.txt" 2>&1
loop_exit=$?
echo "suite_loop_exit=$loop_exit" >> "$CTX"

LINE_CLAIM_RACE_DSN="$DSN" LINE_CLAIM_RACE_EPHEMERAL=1 PSQL_BIN="$PSQL" node tests/line-oa-commerce/concurrency/inbound-retry-race.mjs > "$OUT/07a-inbound-retry-race.txt" 2>&1
inbound_race_exit=$?
echo "inbound_retry_race_exit=$inbound_race_exit" >> "$CTX"
LINE_CLAIM_RACE_DSN="$DSN" LINE_CLAIM_RACE_EPHEMERAL=1 PSQL_BIN="$PSQL" node tests/line-oa-commerce/concurrency/claim-race.mjs > "$OUT/07b-claim-race.txt" 2>&1
claim_race_exit=$?
echo "claim_race_exit=$claim_race_exit" >> "$CTX"

node --test tests/line-oa-commerce/ci/tap-evidence.test.mjs tests/line-oa-commerce/ci/source-evidence.test.mjs > "$OUT/07c-ci-harness-tests.txt" 2>&1
ci_tests_exit=$?
echo "ci_harness_tests_exit=$ci_tests_exit" >> "$CTX"

LINE_OA_TEST_DATABASE_URL="$DSN" "$PY" -m pytest -c tests/line-oa-commerce/py/pytest.ini --rootdir tests/line-oa-commerce/py \
  -p no:cacheprovider -rA --junitxml="$OUT/08-pytest-junit.xml" tests/line-oa-commerce/py > "$OUT/08-pytest-output.txt" 2>&1
py_exit=$?
echo "pytest_exit=$py_exit" >> "$CTX"

{ echo "scope: exactly the values listed below, nothing else"; echo "captured_utc: $(utc)"; q "$CHECK_SQL"; } > "$OUT/04b-postcheck.txt"

echo "result: COMPLETED (see exit codes above)" >> "$CTX"
save_logs
cleanup
# Credential gate scans every captured artifact using in-memory generated values.
export P009_SCAN_PW="$PW" P009_SCAN_JWT="$JWT_SECRET" P009_SCAN_ANON="$ANON_KEY" P009_SCAN_SERVICE="$SERVICE_KEY"
"$PY" scripts/verify-line-p009-evidence.py "$OUT" "$MODE" "$p009_exit" "$loop_exit" "$inbound_race_exit" "$claim_race_exit" "$ci_tests_exit" "$py_exit" > "$OUT/10-verification.txt" 2>&1
verify_exit=$?
echo "verification_exit=$verify_exit" >> "$CTX"
finish "$verify_exit"
