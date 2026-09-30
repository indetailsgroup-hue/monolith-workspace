#!/usr/bin/env bash
# P0-10 follow-up evidence runner (owner-approved 30 September 2026).
# Adapted from the reviewed run-p010-red-green.sh. Builds the migration chain
# from zero (it includes the real 0198) on a throwaway stack, then:
#   RED   = the fail-closed suite run against a MUTANT copy of 0198 whose
#           residual-privilege check block is removed (the mutant is never part
#           of the migration chain; it is only passed to the suite with -v);
#   GREEN = the same suite against the real 0198, the P0-10 and original pgTAP
#           suites, the claim race, the 12 required Python files, and the
#           database steps of the modified db-verify.yml run locally.
# Synthetic data only; cron scheduler off; no edge runtime, so no LINE delivery.
# Run from the repository root:
#   P010_MODE=red|green P010_OUT=<new dir> [P010_RED_BUNDLE=<red dir>] bash <this file>
set -u
set -o pipefail

MODE="${P010_MODE:?set P010_MODE=red or green}"
[[ "$MODE" = red || "$MODE" = green ]] || { echo "P010_MODE must be red or green" >&2; exit 2; }
OUT="${P010_OUT:?set P010_OUT to a NEW output directory}"
BASE="3bdd6f3e5217f3252292cd11c858be151c01f977"
BRANCH="codex/repair-intelligence-phase0-trust"
FC_TEST="supabase/tests/line_oa_client_write_revoke_fail_closed.sql"
MIG_0198="supabase/migrations/0198_line_oa_revoke_client_write_grants.sql"
WORKFLOW=".github/workflows/db-verify.yml"
DB_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.158"
AUTH_IMAGE="public.ecr.aws/supabase/gotrue:v2.195.0"
STORAGE_IMAGE="public.ecr.aws/supabase/storage-api:v1.66.4"
NET="line-p010meta-net"; DB="line-p010meta-db"; AUTH="line-p010meta-auth"; STORAGE="line-p010meta-storage"
PORT="55452"
HERE="$(cd "$(dirname "$0")" && pwd)"
VERIFIER="$HERE/verify-p010-failclosed.py"
MUTANT_SRC="$HERE/mutant-0198-no-residual-check.sql"
CI_REPLICA="$HERE/ci-replica.py"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
PSQL_DIR="$(dirname "$PSQL")"
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

# ---- Pre-flight: nothing is created until every check passes. ----------------
refuse() { echo "REFUSED: $1" >&2; exit 2; }
[ -d supabase/migrations ] || refuse "run from the repository root"
[ ! -e "$OUT" ] || refuse "output directory already exists: $OUT"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the accepted base $BASE"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || refuse "branch is not $BRANCH"
actual="$(git status --porcelain --untracked-files=all -- supabase tests scripts .github | LC_ALL=C sort)"
"$PY" - <<'PREFLIGHT' || refuse "out-of-scope source changes"
import subprocess
allowed={'scripts/line-ci-tap.mjs','tests/line-oa-commerce/ci/tap-evidence.test.mjs'}
paths=subprocess.check_output(['git','status','--porcelain','--untracked-files=all','--','supabase','tests','scripts','.github']).decode().splitlines()
assert all(x[3:] in allowed for x in paths), paths
PREFLIGHT
git diff --quiet HEAD -- "$MIG_0198" || refuse "0198 differs from the committed file"
for f in "$VERIFIER" "$CI_REPLICA"; do [ -f "$f" ] || refuse "missing $f"; done
if [ "$MODE" = red ]; then
  [ -f "$MUTANT_SRC" ] || refuse "mutant not found next to the runner"
  ! grep -q "write privileges remain after revoke" "$MUTANT_SRC" || refuse "mutant still contains the residual check"
else
  RED_BUNDLE="${P010_RED_BUNDLE:?set P010_RED_BUNDLE to the RED bundle for the test-identity check}"
  cmp -s "$FC_TEST" "$RED_BUNDLE/source-line_oa_client_write_revoke_fail_closed.sql" || refuse "fail-closed suite differs from the RED run"
fi
[ -z "$(docker ps -a --filter name=^line-p010meta- --format '{{.Names}}')" ] || refuse "line-p010meta-* containers already exist (not removed)"
[ -z "$(docker network ls --filter name=^${NET}$ --format '{{.Name}}')" ] || refuse "network $NET already exists (not removed)"
! netstat -an 2>/dev/null | grep -qE "[:.]${PORT}[[:space:]]" || refuse "port $PORT already in use"
for img in "$DB_IMAGE" "$AUTH_IMAGE" "$STORAGE_IMAGE"; do
  docker image inspect "$img" >/dev/null 2>&1 || refuse "image not cached locally: $img"
done

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
JWT_SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PGCONNECT_TIMEOUT=3
export PGPASSWORD="$PW" JWT_SECRET
mkjwt() { node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"});const p=b({role:process.argv[1],iss:"line-p010-failclosed",iat:1700000000,exp:4102444800});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"
export PYTHONDONTWRITEBYTECODE=1
export HYPOTHESIS_STORAGE_DIRECTORY="${TMPDIR:-/tmp}/line-p010-hypothesis"

mkdir -p "$OUT"
printf "* -text\n" > "$OUT/.gitattributes"
cp "$0" "$OUT/run-p010-failclosed.sh"
cp "$VERIFIER" "$OUT/verify-p010-failclosed.py"
cp "$CI_REPLICA" "$OUT/ci-replica.py"
cp docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/01b-service-bootstrap.sql "$OUT/01b-service-bootstrap.sql"
cp "$FC_TEST" "$OUT/source-line_oa_client_write_revoke_fail_closed.sql"
cp "$WORKFLOW" "$OUT/source-db-verify.yml"
cp scripts/line-ci-tap.mjs "$OUT/source-line-ci-tap.mjs"
cp scripts/run-line-db-suites.sh "$OUT/source-run-line-db-suites.sh"
cp tests/line-oa-commerce/ci/tap-evidence.test.mjs "$OUT/source-tap-evidence.test.mjs"
git diff HEAD -- "$WORKFLOW" > "$OUT/source-db-verify.diff"
cp "$MIG_0198" "$OUT/source-0198_line_oa_revoke_client_write_grants.sql"
if [ "$MODE" = red ]; then
  cp "$MUTANT_SRC" "$OUT/mutant-0198-no-residual-check.sql"
  diff -u "$MIG_0198" "$OUT/mutant-0198-no-residual-check.sql" > "$OUT/mutant-vs-0198.diff"
  echo "diff_exit=$? (1 = files differ, expected)" >> "$OUT/mutant-vs-0198.diff"
fi
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }
scrub() { sed -e "s/$PW/[REDACTED]/g" -e "s/$JWT_SECRET/[REDACTED]/g" -e "s/$ANON_KEY/[REDACTED]/g" -e "s/$SERVICE_KEY/[REDACTED]/g"; }

FINGERPRINT_SQL="select md5(string_agg(x, E'\n' order by x)) from (
  select 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||pg_get_userbyid(c.relowner)||'|'||coalesce(c.relacl::text,'') as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  union all select 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema')
  union all select 'attacl|'||c.oid::regclass::text||'.'||a.attname||'|'||a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid where a.attacl is not null
  union all select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(coalesce(p.prosrc,''))||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_temp%'
  union all select 'role|'||rolname||'|'||rolsuper::text||rolinherit::text||rolbypassrls::text from pg_roles
  union all select 'member|'||member::regrole::text||'|'||roleid::regrole::text||'|'||inherit_option::text||set_option::text from pg_auth_members
  union all select 'ext|'||extname||'|'||extversion from pg_extension
) s;"
record_baseline() { # $1 = file
  {
    echo "captured_utc: $(utc)"
    echo "catalog_fingerprint_md5 (relations+owners+ACLs, columns, column ACLs, functions+source hashes+owners+ACLs, roles, memberships, extensions): $(q "$FINGERPRINT_SQL")"
    echo "roles_named_p010: $(q "select count(*) from pg_roles where rolname like 'p010%'")"
  } > "$1"
}
image_line() { echo "$1 id=$(docker image inspect --format '{{.Id}}' "$1" 2>&1) digests=$(docker image inspect --format '{{join .RepoDigests ","}}' "$1" 2>&1)"; }

{
  echo "evidence_bundle: $OUT"
  echo "mode: $MODE"
  echo "started_utc: $(utc)"
  echo "command (Git Bash, repository root): P010_MODE=$MODE P010_OUT=$OUT${P010_RED_BUNDLE:+ P010_RED_BUNDLE=$P010_RED_BUNDLE} bash $0"
  echo "runner_sha256: $(sha256sum "$0" | cut -d' ' -f1) (copy: run-p010-failclosed.sh)"
  echo "verifier_sha256: $(sha256sum "$VERIFIER" | cut -d' ' -f1) (copy: verify-p010-failclosed.py)"
  echo "ci_replica_sha256: $(sha256sum "$CI_REPLICA" | cut -d' ' -f1) (copy: ci-replica.py)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD) (accepted base: $BASE)"
  echo "working_tree_changes (supabase, tests, scripts, .github): [$actual]"
  echo "fail_closed_suite_sha256: $(sha256sum "$FC_TEST" | cut -d' ' -f1)"
  echo "migration_0198_sha256: $(sha256sum "$MIG_0198" | cut -d' ' -f1) Â· git blob at HEAD: $(git rev-parse HEAD:"$MIG_0198") Â· identical to HEAD: yes"
  echo "workflow_sha256: $(sha256sum "$WORKFLOW" | cut -d' ' -f1) (diff vs HEAD: source-db-verify.diff)"
  if [ "$MODE" = red ]; then
    echo "mutant_sha256: $(sha256sum "$OUT/mutant-0198-no-residual-check.sql" | cut -d' ' -f1) (diff vs real 0198: mutant-vs-0198.diff; never in supabase/migrations)"
  else
    echo "fail_closed_suite_identical_to_red_bundle: yes ($RED_BUNDLE)"
  fi
  echo "core.autocrlf: $(git config --get core.autocrlf)"
  echo "db_image: $(image_line "$DB_IMAGE")"
  echo "auth_image: $(image_line "$AUTH_IMAGE")"
  echo "storage_image: $(image_line "$STORAGE_IMAGE")"
  echo "network: $NET Â· containers: $DB (127.0.0.1:$PORT), $AUTH, $STORAGE (all throwaway; removed at the end)"
  echo "dsn: $DSN (password generated per run, passed via PGPASSWORD, never written)"
  echo "node: $(node --version)"
  echo "python: $("$PY" --version 2>&1) Â· pytest $("$PY" -c 'import pytest;print(pytest.__version__)' 2>&1) Â· pyyaml $("$PY" -c 'import yaml;print(yaml.__version__)' 2>&1)"
  echo "psql_client: $("$PSQL" --version)"
  echo "docker: $(docker version --format '{{.Server.Version}}' 2>&1)"
} > "$CTX"

save_logs() { for c in "$DB" "$AUTH" "$STORAGE"; do docker logs "$c" 2>&1 | scrub > "$OUT/logs-$c.txt"; done; }
cleanup() {
  docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  if [ -n "${WORKDIR:-}" ]; then
    case "$(realpath -m "$WORKDIR")" in
      "$(realpath -m "${TMPDIR:-/tmp}")"/line-p010-ci-workdir.*) rm -r -- "$WORKDIR" 2>/dev/null ;;
      *) echo "REFUSED unsafe cleanup path" >&2 ;;
    esac
  fi
  {
    echo "removed_utc: $(utc)"
    echo "containers_present_after_removal: [$(docker ps -a --filter "name=^line-p010meta-" --format '{{.Names}}' | tr '\n' ' ')] (empty = removed)"
    echo "network_present_after_removal: [$(docker network ls --filter "name=^${NET}$" --format '{{.Name}}')] (empty = removed)"
    echo "ci_workdir_present_after_removal: [$([ -n "${WORKDIR:-}" ] && [ -e "$WORKDIR" ] && echo "$WORKDIR")] (empty = removed)"
  } > "$OUT/09-teardown.txt"
}
credential_scan() {
  P010_SCAN_PW="$PW" P010_SCAN_JWT="$JWT_SECRET" P010_SCAN_ANON="$ANON_KEY" P010_SCAN_SERVICE="$SERVICE_KEY" \
  "$PY" - "$OUT" > "$OUT/10a-credential-scan.txt" 2>&1 <<'PYEOF'
import os, pathlib, sys
out = pathlib.Path(sys.argv[1])
secrets = [os.environ[k].encode() for k in ("P010_SCAN_PW", "P010_SCAN_JWT", "P010_SCAN_ANON", "P010_SCAN_SERVICE")]
assert all(len(s) > 20 for s in secrets), "generated credential inputs missing"
hit = lambda data: any(s in data for s in secrets)
assert hit(b"control=" + secrets[0]), "positive control failed"
print("PASS: positive control detects a generated credential")
files = sorted(p for p in out.rglob("*") if p.is_file() and p.name != "10a-credential-scan.txt")
found = [p.relative_to(out).as_posix() for p in files if hit(p.read_bytes())]
print(f"scanned_files: {len(files)}")
if found:
    print("FAIL: generated credential bytes found in:", found); sys.exit(1)
print("PASS: no generated credential bytes in any captured file")
PYEOF
}
finish() { # $1 = exit code
  credential_scan; scan_exit=$?
  echo "credential_scan_exit=$scan_exit" >> "$CTX"
  "$PY" "$OUT/verify-p010-failclosed.py" "$OUT" "$MODE" > "$OUT/10b-verification.txt" 2>&1; verify_exit=$?
  echo "verification_exit=$verify_exit" >> "$CTX"
  rc="$1"; [ "$rc" -eq 0 ] && [ "$scan_exit" -ne 0 ] && rc=5; [ "$rc" -eq 0 ] && [ "$verify_exit" -ne 0 ] && rc=9
  echo "runner_exit=$rc" >> "$CTX"
  echo "finished_utc: $(utc)" >> "$CTX"
  (cd "$OUT" && find . -type f ! -name SHA256SUMS.run | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha256sum > SHA256SUMS.run)
  exit "$rc"
}
fail() { echo "result: STOPPED â€” $2" >> "$CTX"; save_logs; cleanup; finish "$1"; }

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
echo "db_port_binding: $(docker port "$DB" 5432/tcp | tr '\n' ' ')" >> "$CTX"
echo "cron_launch_active_jobs: $(q 'show cron.launch_active_jobs')" >> "$CTX"
[ "$(q 'show cron.launch_active_jobs')" = off ] || fail 3 "cron scheduler not disabled"
echo "db_server: $(q 'select version()')" >> "$CTX"
"$PSQL" "$ADMIN_DSN" -X -q -v ON_ERROR_STOP=1 -v pw="$PW" -f "$OUT/01b-service-bootstrap.sql" > "$OUT/01b-service-bootstrap-output.txt" 2>&1 \
  || fail 3 "service bootstrap (01b) failed"
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
echo "auth_schema_ready: $a Â· storage_schema_ready: $s" >> "$CTX"
[ "$ready" -eq 1 ] || fail 3 "auth/storage services did not finish their own migrations within 180 s"
echo "services_ready_utc: $(utc)" >> "$CTX"

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
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIG") of $(ls supabase/migrations/*.sql | wc -l) Â· failed: $mig_failed" >> "$CTX"
[ "$mig_failed" -eq 0 ] || fail 4 "at first failing migration (no shims applied); tests not run"
record_baseline "$OUT/03-baseline-after-migrations.txt"

if [ "$MODE" = red ]; then
  "$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -v p010_migration="$(cygpath -m "$(cd "$OUT" && pwd)")/mutant-0198-no-residual-check.sql" \
    -c "begin;" -f "$FC_TEST" > "$OUT/04-fail-closed-vs-mutant.tap" 2>&1
  echo "fail_closed_vs_mutant_exit=$?" >> "$CTX"
else
  "$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" -f "$FC_TEST" > "$OUT/04a-fail-closed-vs-0198.tap" 2>&1
  echo "fail_closed_vs_0198_exit=$?" >> "$CTX"
  "$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" -f supabase/tests/line_oa_client_write_revoke.sql > "$OUT/04b-pgtap-p010.tap" 2>&1
  echo "pgtap_p010_exit=$?" >> "$CTX"
  "$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 -c "begin;" -f supabase/tests/line_outbound_claim_record.sql > "$OUT/04c-pgtap-original.tap" 2>&1
  echo "pgtap_original_exit=$?" >> "$CTX"
  LINE_CLAIM_RACE_DSN="$DSN" LINE_CLAIM_RACE_EPHEMERAL=1 PSQL_BIN="$PSQL" node tests/line-oa-commerce/concurrency/claim-race.mjs > "$OUT/05-claim-race-output.txt" 2>&1
  echo "claim_race_exit=$?" >> "$CTX"
  REQUIRED=$(grep -lE "rpc_record_line_send_result|rpc_claim_line_outbound_batch|line_oa_outbound_messages" tests/line-oa-commerce/py/*.py | LC_ALL=C sort)
  echo "required_python_suites ($(echo "$REQUIRED" | wc -l | tr -d ' ')): $(echo $REQUIRED)" >> "$CTX"
  LINE_OA_TEST_DATABASE_URL="$DSN" "$PY" -m pytest -c tests/line-oa-commerce/py/pytest.ini --rootdir tests/line-oa-commerce/py \
    -p no:cacheprovider -rA --junitxml="$OUT/06-pytest-junit.xml" $REQUIRED > "$OUT/06-pytest-output.txt" 2>&1
  echo "pytest_exit=$?" >> "$CTX"

  # Database steps of the modified workflow, run in a scratch copy of the files
  # they read (so tap/ and db-verify-evidence.json never land in the repo).
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/line-p010-ci-workdir.XXXXXX")"
  mkdir -p "$WORKDIR/.github/workflows" "$WORKDIR/supabase" "$WORKDIR/tests/line-oa-commerce"
  cp "$WORKFLOW" "$WORKDIR/.github/workflows/"
  cp -r supabase/migrations supabase/tests "$WORKDIR/supabase/"
  cp -r tests/line-oa-commerce/concurrency "$WORKDIR/tests/line-oa-commerce/"
  mkdir -p "$WORKDIR/scripts"
  cp scripts/line-ci-tap.mjs scripts/run-line-db-suites.sh "$WORKDIR/scripts/"
  mkdir -p "$OUT/07-ci-local/full"
  # Explicit provenance for the local replica; base SHA plus tested-source manifest.
  export LINE_DB_EVIDENCE_COMMIT="$BASE"
  export LINE_DB_EVIDENCE_REF="$(git symbolic-ref HEAD)"
  export LINE_DB_RUN_ID="p010-evidence-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  "$PY" "$HERE/capture-source-manifest.py" "$OUT/tested-source-manifest.json" || exit 8
  cp "$HERE/capture-source-manifest.py" "$OUT/capture-source-manifest.py"
  export LINE_DB_EVIDENCE_SOURCE_SHA256="$(sha256sum "$OUT/tested-source-manifest.json" | cut -d' ' -f1)"
  wc -l < "$OUT/02-migrations-applied.txt" | tr -d ' ' > "$WORKDIR/migrations_applied.txt"
  cp "$WORKDIR/migrations_applied.txt" "$OUT/migrations_applied.txt"
  echo "local_run_id: $LINE_DB_RUN_ID" >> "$CTX"
  echo "tested_source_sha256: $LINE_DB_EVIDENCE_SOURCE_SHA256" >> "$CTX"
  PATH="$PSQL_DIR:$PATH" BASH_BIN="$(command -v bash)" "$PY" "$OUT/ci-replica.py" "$WORKFLOW" "$DSN" "$WORKDIR" "$OUT/07-ci-local/full" > "$OUT/07-ci-local/full/summary.txt" 2>&1
  echo "ci_local_full_exit=$?" >> "$CTX"
  mkdir -p "$OUT/07-ci-local/full/tap"; cp "$WORKDIR"/tap/*.tap "$OUT/07-ci-local/full/tap/" 2>/dev/null
  cp "$WORKDIR/db-verify-evidence.json" "$OUT/07-ci-local/full/" 2>/dev/null
  cp "$WORKDIR"/tap/*.stderr "$WORKDIR"/tap/*.result.json "$OUT/07-ci-local/full/tap/" 2>/dev/null

fi

record_baseline "$OUT/08-baseline-after-tests.txt"
echo "cron_job_run_details_rows: $(q 'select count(*) from cron.job_run_details')" >> "$OUT/08-baseline-after-tests.txt"
fp() { grep '^catalog_fingerprint_md5' "$1" | sed 's/.*: //'; }
same=no; [ "$(fp "$OUT/03-baseline-after-migrations.txt")" = "$(fp "$OUT/08-baseline-after-tests.txt")" ] && same=yes
echo "catalog_fingerprint_unchanged_by_tests: $same" >> "$CTX"
echo "result: COMPLETED (see exit codes above; expectations are checked by the verifier)" >> "$CTX"
save_logs
cleanup
finish 0
