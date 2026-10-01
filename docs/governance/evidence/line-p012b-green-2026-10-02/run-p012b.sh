#!/usr/bin/env bash
# B12 / P0-12 round-2 evidence runner (owner-approved 2 October 2026): the
# pre-review fixes to the 0199 test suites. 0199 itself is unchanged. Derived
# from the reviewed run-p012.sh. Builds the migration chain from zero on a
# throwaway stack (cron off, DB on loopback only) and runs:
#   red-a       = the chain WITHOUT 0199 (the committed file is skipped and the
#                 skip is recorded): the matrix suite and all regression suites,
#                 to show what the strengthened assertions catch without 0199;
#   red-mutants = with the real 0199: the fail-closed suite against mutant B
#                 (post-revoke verification removed) and mutant C (missing-
#                 identity check removed); mutants are never in the chain;
#   green       = with 0199: every suite, the Python files, the claim race, the
#                 CI harness tests and the CI suite runner, all locally.
# Synthetic data only; no edge runtime, so no LINE delivery. Run from repo root:
#   P012_MODE=red-a|red-mutants|green P012_OUT=<new dir> [P012_RED_BUNDLE=<red-a dir>] bash <this file>
set -u
set -o pipefail

MODE="${P012_MODE:?set P012_MODE=red-a, red-mutants or green}"
[[ "$MODE" = red-a || "$MODE" = red-mutants || "$MODE" = green ]] || { echo "bad P012_MODE" >&2; exit 2; }
OUT="${P012_OUT:?set P012_OUT to a NEW output directory}"
BASE="48b72d4c7c3f0d3bab197cb19483ca973807add2"
BRANCH="codex/repair-intelligence-phase0-trust"
MIG="supabase/migrations/0199_line_oa_restrict_definer_execute.sql"
CHANGED=(
  supabase/tests/line_oa_definer_execute_fail_closed.sql supabase/tests/line_oa_definer_execute_matrix.sql
  supabase/tests/line_outbound_claim_record.sql
)
DB_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.158"
AUTH_IMAGE="public.ecr.aws/supabase/gotrue:v2.195.0"
STORAGE_IMAGE="public.ecr.aws/supabase/storage-api:v1.66.4"
NET="line-p012b-net"; DB="line-p012b-db"; AUTH="line-p012b-auth"; STORAGE="line-p012b-storage"
PORT="55449"
HERE="$(cd "$(dirname "$0")" && pwd)"
VERIFIER="$HERE/verify-p012b.py"
MUTANT_B_SRC="$HERE/mutant-0199-no-matrix-verification.sql"
MUTANT_C_SRC="$HERE/mutant-0199-no-identity-check.sql"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

refuse() { echo "REFUSED: $1" >&2; exit 2; }
[ -d supabase/migrations ] || refuse "run from the repository root"
[ ! -e "$OUT" ] || refuse "output directory already exists: $OUT"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the base $BASE"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || refuse "branch is not $BRANCH"
expected="$(printf '%s\n' " M supabase/tests/line_oa_definer_execute_fail_closed.sql" \
  " M supabase/tests/line_oa_definer_execute_matrix.sql" " M supabase/tests/line_outbound_claim_record.sql" | LC_ALL=C sort)"
actual="$(git status --porcelain --untracked-files=all -- supabase tests scripts .github | LC_ALL=C sort)"
[ "$actual" = "$expected" ] || refuse "unexpected changes under supabase/tests/scripts/.github: [$actual]"
[ -f "$VERIFIER" ] || refuse "verifier not found next to the runner"
[ -f "$MIG" ] || refuse "committed 0199 not found"
if [ "$MODE" = red-mutants ]; then
  [ -f "$MUTANT_B_SRC" ] && [ -f "$MUTANT_C_SRC" ] || refuse "mutants not found next to the runner"
  ! grep -q "EXECUTE matrix not met after revoke" "$MUTANT_B_SRC" || refuse "mutant B still contains the verification"
  ! grep -q "matrix identity missing" "$MUTANT_C_SRC" || refuse "mutant C still contains the identity check"
fi
if [ "$MODE" != red-a ]; then
  RED_BUNDLE="${P012_RED_BUNDLE:?set P012_RED_BUNDLE to the red-a bundle for the source-identity check}"
  for f in "${CHANGED[@]}"; do
    cmp -s "$f" "$RED_BUNDLE/source/$f" || refuse "$f differs from the red-a run"
  done
fi
[ -z "$(docker ps -a --filter name=^line-p012b- --format '{{.Names}}')" ] || refuse "line-p012b-* containers already exist (not removed)"
[ -z "$(docker network ls --filter name=^${NET}$ --format '{{.Name}}')" ] || refuse "network $NET already exists (not removed)"
! netstat -an 2>/dev/null | grep -qE "[:.]${PORT}[[:space:]]" || refuse "port $PORT already in use"
for img in "$DB_IMAGE" "$AUTH_IMAGE" "$STORAGE_IMAGE"; do
  docker image inspect "$img" >/dev/null 2>&1 || refuse "image not cached locally: $img"
done

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
JWT_SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PGCONNECT_TIMEOUT=3
export PGPASSWORD="$PW" JWT_SECRET
mkjwt() { node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"});const p=b({role:process.argv[1],iss:"line-p012b",iat:1700000000,exp:4102444800});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"
export PYTHONDONTWRITEBYTECODE=1
export HYPOTHESIS_STORAGE_DIRECTORY="${TMPDIR:-/tmp}/line-p012b-hypothesis"

mkdir -p "$OUT/source"
printf "* -text\n" > "$OUT/.gitattributes"
cp "$0" "$OUT/run-p012b.sh"
cp "$VERIFIER" "$OUT/verify-p012b.py"
cp docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/01b-service-bootstrap.sql "$OUT/01b-service-bootstrap.sql"
for f in "${CHANGED[@]}"; do mkdir -p "$OUT/source/$(dirname "$f")"; cp "$f" "$OUT/source/$f"; done
git diff HEAD -- "${CHANGED[@]}" > "$OUT/source/tracked-changes.diff"
if [ "$MODE" != red-a ]; then mkdir -p "$OUT/source/supabase/migrations"; cp "$MIG" "$OUT/source/$MIG"; fi
if [ "$MODE" = red-mutants ]; then
  for m in b c; do
    src="$MUTANT_B_SRC"; [ "$m" = c ] && src="$MUTANT_C_SRC"
    cp "$src" "$OUT/$(basename "$src")"
    diff -u "$MIG" "$OUT/$(basename "$src")" > "$OUT/mutant-$m-vs-0199.diff"
    echo "diff_exit=$? (1 = files differ, expected)" >> "$OUT/mutant-$m-vs-0199.diff"
  done
fi
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }
scrub() { sed -e "s/$PW/[REDACTED]/g" -e "s/$JWT_SECRET/[REDACTED]/g" -e "s/$ANON_KEY/[REDACTED]/g" -e "s/$SERVICE_KEY/[REDACTED]/g"; }
FINGERPRINT_SQL="select md5(string_agg(x, E'\n' order by x)) from (
  select 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||pg_get_userbyid(c.relowner)||'|'||coalesce(c.relacl::text,'') as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  union all select 'attacl|'||c.oid::regclass::text||'.'||a.attname||'|'||a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid where a.attacl is not null
  union all select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(coalesce(p.prosrc,''))||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_temp%'
  union all select 'trg|'||tgrelid::regclass::text||'|'||tgname||'|'||tgfoid::regprocedure::text from pg_trigger where not tgisinternal
  union all select 'role|'||rolname||'|'||rolsuper::text||rolinherit::text||rolbypassrls::text from pg_roles
  union all select 'member|'||member::regrole::text||'|'||roleid::regrole::text||'|'||inherit_option::text||set_option::text from pg_auth_members
) s;"
record_baseline() {
  {
    echo "captured_utc: $(utc)"
    echo "catalog_fingerprint_md5 (relations+owners+ACLs, column ACLs, functions+source hashes+owners+ACLs, triggers, roles, memberships): $(q "$FINGERPRINT_SQL")"
    echo "roles_named_p01x: $(q "select count(*) from pg_roles where rolname like 'p01%'")"
  } > "$1"
}
image_line() { echo "$1 id=$(docker image inspect --format '{{.Id}}' "$1" 2>&1)"; }
{
  echo "evidence_bundle: $OUT"
  echo "mode: $MODE"
  echo "started_utc: $(utc)"
  echo "command (Git Bash, repository root): P012_MODE=$MODE P012_OUT=$OUT${P012_RED_BUNDLE:+ P012_RED_BUNDLE=$P012_RED_BUNDLE} bash $0"
  echo "runner_sha256: $(sha256sum "$0" | cut -d' ' -f1) (copy: run-p012b.sh)"
  echo "verifier_sha256: $(sha256sum "$VERIFIER" | cut -d' ' -f1) (copy: verify-p012b.py)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD) (base: $BASE)"
  echo "working_tree_changes: [$actual]"
  for f in "${CHANGED[@]}"; do echo "source_sha256 $(sha256sum "$f" | cut -d' ' -f1) $f"; done
  echo "migration_0199_sha256: $(sha256sum "$MIG" | cut -d' ' -f1) (committed; $([ "$MODE" = red-a ] && echo 'SKIPPED in this run' || echo 'applied'))"
  [ "$MODE" != red-a ] && echo "sources_identical_to_red_a_bundle: yes ($RED_BUNDLE)"
  if [ "$MODE" = red-mutants ]; then
    echo "mutant_b_sha256: $(sha256sum "$MUTANT_B_SRC" | cut -d' ' -f1) (never in supabase/migrations)"
    echo "mutant_c_sha256: $(sha256sum "$MUTANT_C_SRC" | cut -d' ' -f1) (never in supabase/migrations)"
  fi
  echo "core.autocrlf: $(git config --get core.autocrlf)"
  echo "db_image: $(image_line "$DB_IMAGE")"
  echo "auth_image: $(image_line "$AUTH_IMAGE")"
  echo "storage_image: $(image_line "$STORAGE_IMAGE")"
  echo "network: $NET · containers: $DB (127.0.0.1:$PORT), $AUTH, $STORAGE (all throwaway; removed at the end)"
  echo "dsn: $DSN (password generated per run, passed via PGPASSWORD, never written)"
  echo "node: $(node --version) · python: $("$PY" --version 2>&1) · psql_client: $("$PSQL" --version) · docker: $(docker version --format '{{.Server.Version}}' 2>&1)"
} > "$CTX"

save_logs() { for c in "$DB" "$AUTH" "$STORAGE"; do docker logs "$c" 2>&1 | scrub > "$OUT/logs-$c.txt"; done; }
cleanup() {
  docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  {
    echo "removed_utc: $(utc)"
    echo "containers_present_after_removal: [$(docker ps -a --filter "name=^line-p012b-" --format '{{.Names}}' | tr '\n' ' ')] (empty = removed)"
    echo "network_present_after_removal: [$(docker network ls --filter "name=^${NET}$" --format '{{.Name}}')] (empty = removed)"
  } > "$OUT/09-teardown.txt"
}
credential_scan() {
  P012_SCAN_PW="$PW" P012_SCAN_JWT="$JWT_SECRET" P012_SCAN_ANON="$ANON_KEY" P012_SCAN_SERVICE="$SERVICE_KEY" \
  "$PY" - "$OUT" > "$OUT/10a-credential-scan.txt" 2>&1 <<'PYEOF'
import os, pathlib, sys
out = pathlib.Path(sys.argv[1])
secrets = [os.environ[k].encode() for k in ("P012_SCAN_PW", "P012_SCAN_JWT", "P012_SCAN_ANON", "P012_SCAN_SERVICE")]
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
finish() {
  credential_scan; scan_exit=$?
  echo "credential_scan_exit=$scan_exit" >> "$CTX"
  "$PY" "$OUT/verify-p012b.py" "$OUT" "$MODE" > "$OUT/10b-verification.txt" 2>&1; verify_exit=$?
  echo "verification_exit=$verify_exit" >> "$CTX"
  rc="$1"; [ "$rc" -eq 0 ] && [ "$scan_exit" -ne 0 ] && rc=5; [ "$rc" -eq 0 ] && [ "$verify_exit" -ne 0 ] && rc=9
  echo "runner_exit=$rc" >> "$CTX"
  echo "finished_utc: $(utc)" >> "$CTX"
  (cd "$OUT" && find . -type f ! -name SHA256SUMS.run | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha256sum > SHA256SUMS.run)
  exit "$rc"
}
fail() { echo "result: STOPPED — $2" >> "$CTX"; save_logs; cleanup; finish "$1"; }

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
echo "auth_schema_ready: $a · storage_schema_ready: $s" >> "$CTX"
[ "$ready" -eq 1 ] || fail 3 "auth/storage services did not finish their own migrations within 180 s"

MIGS="$OUT/02-migrations-applied.txt"
: > "$MIGS"
mig_failed=0
for f in $(ls supabase/migrations/*.sql | LC_ALL=C sort); do
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  if [ "$MODE" = red-a ] && [ "$f" = "$MIG" ]; then echo "skip $sum  $f (red-a: chain without 0199)" >> "$MIGS"; continue; fi
  if out=$("$PSQL" "$DSN" -X -q -1 -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    echo "ok  $sum  $f" >> "$MIGS"
  else
    echo "FAIL $sum  $f" >> "$MIGS"
    { echo "failed_migration: $f"; echo "$out"; } | scrub > "$OUT/02-migration-failure.txt"
    mig_failed=1
    break
  fi
done
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIGS") of $(ls supabase/migrations/*.sql | wc -l) · failed: $mig_failed" >> "$CTX"
[ "$mig_failed" -eq 0 ] || fail 4 "at first failing migration (no shims applied); tests not run"
record_baseline "$OUT/03-baseline-after-migrations.txt"

tap() { # $1 = output name, $2 = suite file, extra psql args follow
  local name="$1" suite="$2"; shift 2
  "$PSQL" "$DSN" -X -tA -v ON_ERROR_STOP=1 "$@" -c "begin;" -f "$suite" > "$OUT/$name" 2>&1
  echo "${name%.tap}_exit=$?" >> "$CTX"
}
NATIVE="$(pwd -W)"
if [ "$MODE" = red-mutants ]; then
  tap 04f-fc0199-vs-mutant-b.tap supabase/tests/line_oa_definer_execute_fail_closed.sql \
    -v p012_migration="$(cygpath -m "$(cd "$OUT" && pwd)")/mutant-0199-no-matrix-verification.sql"
  tap 04g-fc0199-vs-mutant-c.tap supabase/tests/line_oa_definer_execute_fail_closed.sql \
    -v p012_migration="$(cygpath -m "$(cd "$OUT" && pwd)")/mutant-0199-no-identity-check.sql"
else
  tap 04a-matrix.tap supabase/tests/line_oa_definer_execute_matrix.sql
  tap 04c-original.tap supabase/tests/line_outbound_claim_record.sql
  tap 04d-p010.tap supabase/tests/line_oa_client_write_revoke.sql
  tap 04e-fc0198.tap supabase/tests/line_oa_client_write_revoke_fail_closed.sql \
    -v p010_migration="$NATIVE/supabase/migrations/0198_line_oa_revoke_client_write_grants.sql"
  [ "$MODE" = green ] && tap 04b-fc0199.tap supabase/tests/line_oa_definer_execute_fail_closed.sql
  LINE_CLAIM_RACE_DSN="$DSN" LINE_CLAIM_RACE_EPHEMERAL=1 PSQL_BIN="$PSQL" node tests/line-oa-commerce/concurrency/claim-race.mjs > "$OUT/05-claim-race-output.txt" 2>&1
  echo "claim_race_exit=$?" >> "$CTX"
  REQUIRED=$(grep -lE "rpc_record_line_send_result|rpc_claim_line_outbound_batch|line_oa_outbound_messages" tests/line-oa-commerce/py/*.py | LC_ALL=C sort)
  echo "required_python_suites ($(echo "$REQUIRED" | wc -l | tr -d ' ')): $(echo $REQUIRED)" >> "$CTX"
  LINE_OA_TEST_DATABASE_URL="$DSN" "$PY" -m pytest -c tests/line-oa-commerce/py/pytest.ini --rootdir tests/line-oa-commerce/py \
    -p no:cacheprovider -rA --junitxml="$OUT/06-pytest-junit.xml" $REQUIRED > "$OUT/06-pytest-output.txt" 2>&1
  echo "pytest_exit=$?" >> "$CTX"
fi
if [ "$MODE" = green ]; then
  node --test tests/line-oa-commerce/ci/tap-evidence.test.mjs tests/line-oa-commerce/ci/source-evidence.test.mjs > "$OUT/07a-ci-harness-tests.txt" 2>&1
  echo "ci_harness_tests_exit=$?" >> "$CTX"
  LINE_DB_TEST_DSN="$DSN" LINE_DB_TAP_DIR="$OUT/07b-ci-suite-runner" LINE_DB_RUN_ID="p012b-green-local" \
    bash scripts/run-line-db-suites.sh > "$OUT/07b-ci-suite-runner.txt" 2>&1
  echo "ci_suite_runner_exit=$?" >> "$CTX"
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
