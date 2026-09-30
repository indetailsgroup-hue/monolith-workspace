#!/usr/bin/env bash
# P0-10 catalog evidence runner — one owner-approved run (30 September 2026).
# Adapted from the reviewed scripts/run-line-p011-evidence.sh stack pattern.
# Builds the migration chain from zero on a throwaway stack and runs the approved
# read-only catalog-checklist.sql. No pgTAP/Python/DML/REVOKE, no shared stack,
# no production. Run from the repository root:
#   P010_OUT=<new dir> P010_SQL=<approved catalog-checklist.sql> bash <this file>
set -u
set -o pipefail

BASE="6a41ebb691ff3020838774f34aa4afebe2fdd61c"
BRANCH="codex/repair-intelligence-phase0-trust"
SQL_SHA256="5ed8f00dea517687b658401dc570e8ab24b59d71ae0a5b845f808f6887a3d987"
OUT="${P010_OUT:?set P010_OUT to a NEW output directory}"
SQL_SRC="${P010_SQL:?set P010_SQL to the approved catalog-checklist.sql}"
DB_IMAGE="public.ecr.aws/supabase/postgres:17.6.1.158"
AUTH_IMAGE="public.ecr.aws/supabase/gotrue:v2.195.0"
STORAGE_IMAGE="public.ecr.aws/supabase/storage-api:v1.66.4"
NET="line-p010-net"
DB="line-p010-db"
AUTH="line-p010-auth"
STORAGE="line-p010-storage"
PORT="55444"
BOOTSTRAP_SRC="docs/governance/evidence/line-phase-a-step1-attempt3-2026-09-30/01b-service-bootstrap.sql"
if [ -n "${PSQL_BIN:-}" ]; then PSQL="$PSQL_BIN"
elif command -v psql >/dev/null 2>&1; then PSQL="psql"
else PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"; fi
if [ -n "${PYTHON_BIN:-}" ]; then PY="$PYTHON_BIN"
elif command -v py >/dev/null 2>&1; then PY="py"
else PY="python3"; fi

# ---- Pre-flight: nothing is created until every check passes. ----------------
refuse() { echo "REFUSED: $1" >&2; exit 2; }
[ -d supabase/migrations ] || refuse "run from the repository root"
[ ! -e "$OUT" ] || refuse "output directory already exists: $OUT"
[ "$(git rev-parse HEAD)" = "$BASE" ] || refuse "HEAD is not the approved base $BASE"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || refuse "branch is not $BRANCH"
[ -z "$(git status --porcelain -- supabase)" ] || refuse "uncommitted or untracked changes under supabase/"
[ -f "$SQL_SRC" ] || refuse "approved SQL not found"
[ "$(sha256sum "$SQL_SRC" | cut -d' ' -f1)" = "$SQL_SHA256" ] || refuse "catalog SQL sha256 mismatch (not modified, not substituted)"
[ -z "$(docker ps -a --filter name=^line-p010- --format '{{.Names}}')" ] || refuse "line-p010-* containers already exist (not removed)"
[ -z "$(docker network ls --filter name=^${NET}$ --format '{{.Name}}')" ] || refuse "network $NET already exists (not removed)"
! netstat -an 2>/dev/null | grep -qE "[:.]${PORT}[[:space:]]" || refuse "port $PORT already in use"
for img in "$DB_IMAGE" "$AUTH_IMAGE" "$STORAGE_IMAGE"; do
  docker image inspect "$img" >/dev/null 2>&1 || refuse "image not cached locally: $img"
done

PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
JWT_SECRET="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
export PGCONNECT_TIMEOUT=3
export PGPASSWORD="$PW" JWT_SECRET
mkjwt() { node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"});const p=b({role:process.argv[1],iss:"line-p010-catalog",iat:1700000000,exp:4102444800});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"))' "$1"; }
ANON_KEY="$(mkjwt anon)"
SERVICE_KEY="$(mkjwt service_role)"
DSN="postgresql://postgres@127.0.0.1:${PORT}/postgres"
ADMIN_DSN="postgresql://supabase_admin@127.0.0.1:${PORT}/postgres"

mkdir -p "$OUT"
printf "* -text\n" > "$OUT/.gitattributes"
cp "$0" "$OUT/run-p010-catalog.sh"
cp "$SQL_SRC" "$OUT/catalog-checklist.sql"
cp "$BOOTSTRAP_SRC" "$OUT/01b-service-bootstrap.sql"
CTX="$OUT/00-context.txt"
utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
q() { "$PSQL" "$DSN" -X -tA -F'|' -c "$1" 2>&1; }
scrub() { sed -e "s/$PW/[REDACTED]/g" -e "s/$JWT_SECRET/[REDACTED]/g" -e "s/$ANON_KEY/[REDACTED]/g" -e "s/$SERVICE_KEY/[REDACTED]/g"; }

FINGERPRINT_SQL="select md5(string_agg(x, E'\n' order by x)) from (
  select 'rel|'||n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||pg_get_userbyid(c.relowner)||'|'||coalesce(c.relacl::text,'') as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%'
  union all select 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema')
  union all select 'fn|'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(coalesce(p.prosrc,''))||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema')
  union all select 'role|'||rolname||'|'||rolsuper::text||rolinherit::text||rolbypassrls::text from pg_roles
  union all select 'member|'||member::regrole::text||'|'||roleid::regrole::text||'|'||inherit_option::text||set_option::text from pg_auth_members
  union all select 'ext|'||extname||'|'||extversion from pg_extension
) s;"

record_baseline() { # $1 = file
  {
    echo "captured_utc: $(utc)"
    echo "catalog_fingerprint_md5 (relations+owners+ACLs, columns, functions+source hashes+owners+ACLs, roles, memberships, extensions): $(q "$FINGERPRINT_SQL")"
    echo "pg_dump_schema_only_sha256 (as supabase_admin, inside the db container): $(docker exec -e PGPASSWORD="$PW" "$DB" pg_dump -h 127.0.0.1 -U supabase_admin -d postgres --schema-only 2>/dev/null | sha256sum | cut -d' ' -f1) (e3b0c442... = empty dump, i.e. pg_dump failed)"
    echo "schemas:"; q "select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1" | sed 's/^/  /'
    echo "extensions:"; q "select extname||' '||extversion from pg_extension order by 1" | sed 's/^/  /'
  } > "$1"
}
image_line() { echo "$1 id=$(docker image inspect --format '{{.Id}}' "$1" 2>&1) digests=$(docker image inspect --format '{{join .RepoDigests ","}}' "$1" 2>&1)"; }

{
  echo "evidence_bundle: $OUT"
  echo "started_utc: $(utc)"
  echo "command (Git Bash, repository root): P010_OUT=$OUT P010_SQL=$SQL_SRC bash $0"
  echo "runner_sha256: $(sha256sum "$0" | cut -d' ' -f1) (copy: run-p010-catalog.sh)"
  echo "catalog_sql_source: $SQL_SRC"
  echo "catalog_sql_sha256: $(sha256sum "$OUT/catalog-checklist.sql" | cut -d' ' -f1) (approved: $SQL_SHA256; copy: catalog-checklist.sql)"
  echo "branch: $(git rev-parse --abbrev-ref HEAD)"
  echo "head_sha: $(git rev-parse HEAD) (approved base: $BASE)"
  echo "supabase_status_porcelain: [$(git status --porcelain -- supabase)] (empty = clean)"
  echo "core.autocrlf: $(git config --get core.autocrlf)"
  echo "db_image: $(image_line "$DB_IMAGE")"
  echo "auth_image: $(image_line "$AUTH_IMAGE")"
  echo "storage_image: $(image_line "$STORAGE_IMAGE")"
  echo "network: $NET · containers: $DB (127.0.0.1:$PORT), $AUTH, $STORAGE (all throwaway; removed at the end)"
  echo "dsn: $DSN (password generated per run, passed via PGPASSWORD, never written)"
  echo "node: $(node --version)"
  echo "python: $("$PY" --version 2>&1)"
  echo "psql_client: $("$PSQL" --version)"
  echo "docker: $(docker version --format '{{.Server.Version}}' 2>&1)"
} > "$CTX"

# Per-migration provenance: disk bytes applied vs the approved base commit blob.
"$PY" - "$BASE" > "$OUT/02a-migration-sources.txt" 2>&1 <<'PYEOF'
import hashlib, pathlib, subprocess, sys
base = sys.argv[1]
files = sorted(pathlib.Path("supabase/migrations").glob("*.sql"), key=lambda p: p.as_posix().encode())
raw = eol = 0
print("disk_sha256 base_blob_sha256 relation path")
for f in files:
    disk = f.read_bytes()
    blob = subprocess.run(["git", "show", f"{base}:{f.as_posix()}"], capture_output=True, check=True).stdout
    if disk == blob: rel, raw = "identical", raw + 1
    elif disk.replace(b"\r\n", b"\n") == blob.replace(b"\r\n", b"\n"): rel, eol = "crlf_lf_only", eol + 1
    else: sys.exit(f"SUBSTANTIVE DIFFERENCE vs base: {f}")
    print(hashlib.sha256(disk).hexdigest(), hashlib.sha256(blob).hexdigest(), rel, f.as_posix())
print(f"files={len(files)} identical={raw} crlf_lf_only={eol} substantive=0")
PYEOF
src_exit=$?
echo "migration_source_check_exit=$src_exit" >> "$CTX"
[ "$src_exit" -eq 0 ] || { echo "result: STOPPED — migration sources differ from approved base; nothing started" >> "$CTX"; exit 2; }

save_logs() { for c in "$DB" "$AUTH" "$STORAGE"; do docker logs "$c" 2>&1 | scrub > "$OUT/logs-$c.txt"; done; }
cleanup() {
  docker rm -f "$STORAGE" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  {
    echo "removed_utc: $(utc)"
    echo "containers_present_after_removal: [$(docker ps -a --filter "name=^line-p010-" --format '{{.Names}}' | tr '\n' ' ')] (empty = removed)"
    echo "network_present_after_removal: [$(docker network ls --filter "name=^${NET}$" --format '{{.Name}}')] (empty = removed)"
  } > "$OUT/06-teardown.txt"
}
credential_scan() {
  # Exact-bytes scan for the four generated credentials over every captured file,
  # with a positive control. Values stay in memory; only a verdict is written.
  P010_SCAN_PW="$PW" P010_SCAN_JWT="$JWT_SECRET" P010_SCAN_ANON="$ANON_KEY" P010_SCAN_SERVICE="$SERVICE_KEY" \
  "$PY" - "$OUT" > "$OUT/07-credential-scan.txt" 2>&1 <<'PYEOF'
import os, pathlib, sys
out = pathlib.Path(sys.argv[1])
secrets = [os.environ[k].encode() for k in ("P010_SCAN_PW", "P010_SCAN_JWT", "P010_SCAN_ANON", "P010_SCAN_SERVICE")]
assert all(len(s) > 20 for s in secrets), "generated credential inputs missing"
hit = lambda data: any(s in data for s in secrets)
assert hit(b"control=" + secrets[0]), "positive control failed"
print("PASS: positive control detects a generated credential")
files = sorted(p for p in out.rglob("*") if p.is_file() and p.name != "07-credential-scan.txt")
found = [p.name for p in files if hit(p.read_bytes())]
print(f"scanned_files: {len(files)}")
if found:
    print("FAIL: generated credential bytes found in:", found); sys.exit(1)
print("PASS: no generated credential bytes in any captured file")
PYEOF
}
finish() { # $1 = exit code
  credential_scan; scan_exit=$?
  echo "credential_scan_exit=$scan_exit" >> "$CTX"
  [ "$scan_exit" -eq 0 ] || set -- 5
  echo "runner_exit=$1" >> "$CTX"
  echo "finished_utc: $(utc)" >> "$CTX"
  (cd "$OUT" && sha256sum $(ls -A | grep -v '^SHA256SUMS.run$' | LC_ALL=C sort) > SHA256SUMS.run)
  exit "$1"
}
fail() { # $1 = code, $2 = reason
  echo "result: STOPPED — $2" >> "$CTX"; save_logs; cleanup; finish "$1"
}

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

record_baseline "$OUT/01a-baseline-empty-image.txt"

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
echo "migrations_applied_ok: $(grep -c '^ok ' "$MIG") of $(ls supabase/migrations/*.sql | wc -l) · failed: $mig_failed" >> "$CTX"
[ "$mig_failed" -eq 0 ] || fail 4 "at first failing migration (no shims applied); catalog not captured"

record_baseline "$OUT/03-baseline-after-migrations.txt"
{
  echo "cron jobs created by the migration chain (throwaway stack; cron.launch_active_jobs=off; dedicated network; DB on host loopback only):"
  q "select jobname||' | '||schedule||' | '||active::text from cron.job order by jobname" | sed 's/^/  /'
  echo "cron_job_run_details_rows: $(q 'select count(*) from cron.job_run_details')"
} >> "$OUT/03-baseline-after-migrations.txt"

# Approved read-only checklist, executed from the bundle copy. Two client output
# formats of the same file: aligned (human) and unaligned US/RS (machine).
echo "catalog_started_utc: $(utc)" >> "$CTX"
"$PSQL" "$DSN" -X -v ON_ERROR_STOP=1 -f "$OUT/catalog-checklist.sql" > "$OUT/04a-catalog-output-aligned.txt" 2>&1
cat_a=$?
"$PSQL" "$DSN" -X -A -F $'\x1f' -R $'\x1e' -P footer=on -v ON_ERROR_STOP=1 -f "$OUT/catalog-checklist.sql" > "$OUT/04b-catalog-output-unaligned.txt" 2>&1
cat_b=$?
echo "catalog_aligned_exit=$cat_a · catalog_unaligned_exit=$cat_b" >> "$CTX"

record_baseline "$OUT/05-baseline-after-catalog.txt"
fp() { grep '^catalog_fingerprint_md5' "$1" | sed 's/.*: //'; }
same=no; [ "$(fp "$OUT/03-baseline-after-migrations.txt")" = "$(fp "$OUT/05-baseline-after-catalog.txt")" ] && same=yes
echo "catalog_fingerprint_unchanged_by_checklist: $same" >> "$CTX"

save_logs
cleanup
rc=0
[ "$cat_a" -eq 0 ] && [ "$cat_b" -eq 0 ] || rc=6
[ "$same" = yes ] || rc=7
grep -q 'containers_present_after_removal: \[\]' "$OUT/06-teardown.txt" && grep -q 'network_present_after_removal: \[\]' "$OUT/06-teardown.txt" || rc=8
echo "result: $([ "$rc" -eq 0 ] && echo COMPLETED || echo "FAILED rc=$rc")" >> "$CTX"
finish "$rc"
