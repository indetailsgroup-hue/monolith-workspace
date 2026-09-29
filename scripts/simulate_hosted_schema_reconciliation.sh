#!/usr/bin/env bash

# Restore a schema-only hosted database snapshot into an isolated local
# Supabase instance, then apply only the canonical migrations that are absent
# from hosted migration history. The hosted database is never connected to by
# this script; callers provide a pg_dump created in a read-only session.

set -u -o pipefail
export LC_ALL=C

if [[ $# -ne 6 ]]; then
  echo "usage: $0 HOSTED_SCHEMA_SQL HOSTED_INVENTORY_JSON RECONCILIATION_JSON CANONICAL_PLAN_DIR OUTPUT_DIR LOCAL_DATABASE_URL" >&2
  exit 2
fi

hosted_schema_sql="$1"
hosted_inventory_json="$2"
reconciliation_json="$3"
canonical_plan_dir="$4"
output_dir="$5"
local_database_url="$6"

for required_file in \
  "$hosted_schema_sql" \
  "$hosted_inventory_json" \
  "$reconciliation_json" \
  "$canonical_plan_dir/migration-manifest.tsv"; do
  if [[ ! -f "$required_file" ]]; then
    echo "[reconciliation-simulation] required file not found: $required_file" >&2
    exit 1
  fi
done

mkdir -p "$output_dir"
restore_log="$output_dir/schema-restore.log"
apply_log="$output_dir/migration-apply.log"
pgtap_log="$output_dir/reconciliation-pgtap.tap"
lint_log="$output_dir/reconciliation-db-lint.txt"
applied_tsv="$output_dir/applied-migrations.tsv"
result_json="$output_dir/reconciliation-simulation.json"
restorable_schema_sql="$(mktemp)"
cleanup() {
  rm -f "$restorable_schema_sql"
}
trap cleanup EXIT

printf 'order\tversion\tfile\n' > "$applied_tsv"
: > "$restore_log"
: > "$apply_log"
: > "$pgtap_log"
: > "$lint_log"

history_ordering_candidate="$(jq -r '.historyOrderingCandidate // false' "$reconciliation_json")"
missing_count="$(jq -r '.canonicalVersionsMissing' "$reconciliation_json")"
hosted_server_version_num="$(jq -r '.serverVersionNum' "$hosted_inventory_json")"

if [[ "$history_ordering_candidate" != "true" ]]; then
  echo "[reconciliation-simulation] migration history is not ordering-compatible" >&2
  exit 1
fi
if [[ ! "$missing_count" =~ ^[0-9]+$ ]] || [[ "$missing_count" -eq 0 ]]; then
  echo "[reconciliation-simulation] expected a positive missing migration count" >&2
  exit 1
fi
if [[ ! "$hosted_server_version_num" =~ ^[0-9]+$ ]]; then
  echo "[reconciliation-simulation] hosted server version is not numeric" >&2
  exit 1
fi

schema_restore_succeeded=false
applied_count=0
failed_order=""
failed_version=""
failed_file=""
core_schema_ready_before=false
core_schema_ready_after=false
pgtap_exit_code=-1
pgtap_test_file_count=0
pgtap_assertion_count=0
pgtap_passed=false
database_lint_exit_code=-1
database_lint_clean=false
legacy_pgtap_routine_count=0
legacy_pgtap_routines_isolated=false
local_dependency_extensions_ready=true
failed_dependency_extension=""
data_bearing_fixture_required=false
data_bearing_fixture_seeded=false
data_bearing_fixture_backfilled=false
data_bearing_fixture_immutability_restored=false
data_bearing_migration_fixture_passed=true
installation_audit_fixture_required=false
installation_audit_fixture_seeded=false
installation_audit_fixture_backfilled=false
installation_audit_fixture_immutability_restored=false
line_oa_audit_fixture_required=false
line_oa_audit_fixture_seeded=false
line_oa_audit_fixture_backfilled=false
line_oa_audit_fixture_immutability_restored=false
capture_audit_fixture_required=false
capture_audit_fixture_seeded=false
capture_audit_fixture_backfilled=false
capture_audit_fixture_immutability_restored=false
form_template_fixture_required=false
form_template_fixture_seeded=false
form_template_fixture_backfilled=false
form_template_fixture_immutability_restored=false
workflow_audit_fixture_required=false
workflow_audit_fixture_seeded=false
workflow_audit_fixture_backfilled=false
workflow_audit_fixture_immutability_restored=false
canonical_static_seed_required=false
canonical_static_seed_restored=true

core_schema_query="SELECT CASE WHEN (
  to_regclass('public.organizations') IS NOT NULL
  AND to_regclass('public.org_members') IS NOT NULL
  AND to_regclass('public.super_admins') IS NOT NULL
  AND to_regclass('public.notification_digest_queue') IS NOT NULL
  AND to_regclass('public.platform_metrics_snapshots') IS NOT NULL
) THEN 'true' ELSE 'false' END;"

# The hosted public-only dump references extension-owned operators by their
# hosted schema (for example public.gin_trgm_ops), but pg_dump intentionally
# omits CREATE EXTENSION. Recreate those dependencies before restoring indexes.
# The dump's schema declaration is made idempotent because public must exist
# first as the extension target.
sed 's/^CREATE SCHEMA public;$/CREATE SCHEMA IF NOT EXISTS public;/' \
  "$hosted_schema_sql" > "$restorable_schema_sql"

if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' \
  >> "$restore_log" 2>&1; then
  for public_extension in pg_trgm unaccent; do
    if jq -e --arg extension "$public_extension" \
      '.installedExtensions[$extension] == "public"' \
      "$hosted_inventory_json" > /dev/null; then
      if ! psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
        -c "CREATE EXTENSION IF NOT EXISTS $public_extension WITH SCHEMA public;" \
        >> "$restore_log" 2>&1; then
        local_dependency_extensions_ready=false
        failed_dependency_extension="$public_extension"
        break
      fi

      extension_schema="$(psql "$local_database_url" --no-psqlrc -X -qAt \
        -v ON_ERROR_STOP=1 \
        -c "SELECT namespace.nspname
            FROM pg_catalog.pg_extension AS extension
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = extension.extnamespace
            WHERE extension.extname = '$public_extension';")"
      if [[ "$extension_schema" != "public" ]] \
        && ! psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
          -c "ALTER EXTENSION $public_extension SET SCHEMA public;" \
          >> "$restore_log" 2>&1; then
        local_dependency_extensions_ready=false
        failed_dependency_extension="$public_extension"
        break
      fi
    fi
  done
fi

if [[ "$local_dependency_extensions_ready" == "true" ]] \
  && psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -f "$restorable_schema_sql" \
    >> "$restore_log" 2>&1; then
  schema_restore_succeeded=true
  core_schema_ready_before="$(psql "$local_database_url" --no-psqlrc -X -tA \
    -v ON_ERROR_STOP=1 -c "$core_schema_query")"
else
  echo "[reconciliation-simulation] hosted schema restore failed" >> "$apply_log"
fi

if [[ "$schema_restore_succeeded" == "true" ]]; then
  for dependency_extension in pg_cron pg_net; do
    if jq -e --arg extension "$dependency_extension" \
      '.installedExtensions | has($extension)' \
      "$hosted_inventory_json" > /dev/null; then
      case "$dependency_extension" in
        pg_cron) extension_sql='CREATE EXTENSION IF NOT EXISTS pg_cron;' ;;
        pg_net) extension_sql='CREATE EXTENSION IF NOT EXISTS pg_net;' ;;
      esac

      if ! psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
        -c "$extension_sql" >> "$restore_log" 2>&1; then
        local_dependency_extensions_ready=false
        failed_dependency_extension="$dependency_extension"
        break
      fi
    fi
  done
fi

# Schema-only dumps intentionally omit rows, including deterministic system
# rows created by already-recorded migrations. Recreate the sentinel
# organization from 0182 in the disposable clone when that migration is part
# of hosted history. This is canonical migration data, not production data.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e \
    '.migrationHistoryVersions | index("0182") != null' \
    "$hosted_inventory_json" > /dev/null; then
  canonical_static_seed_required=true
  canonical_static_seed_restored=false

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.organizations (org_id, name, slug)
        VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          '__sentinel_org__',
          '__sentinel__'
        )
        ON CONFLICT (org_id) DO NOTHING;" \
    >> "$restore_log" 2>&1; then
    canonical_static_seed_restored=true
  else
    echo "failed to recreate canonical sentinel organization" >> "$apply_log"
  fi
fi

# A schema-only clone cannot expose migrations that fail only when a table has
# rows. When 0187 is pending, seed one disposable append-only audit row so the
# simulation exercises its tenant-key backfill and trigger restoration. This
# row exists only in the local clone; no production data is copied or changed.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e '.missingFromHosted[] | select(.version == "0187")' \
    "$reconciliation_json" > /dev/null; then
  data_bearing_fixture_required=true
  data_bearing_migration_fixture_passed=false
  installation_audit_fixture_required=true

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.installation_audit_log (event_type, detail)
        VALUES (
          'schema_reconciliation_installation_audit_fixture',
          '{\"fixture\": true}'::jsonb
        );" \
    >> "$restore_log" 2>&1; then
    installation_audit_fixture_seeded=true
  else
    failed_order="$(jq -r \
      '.missingFromHosted[] | select(.version == "0187") | .order' \
      "$reconciliation_json")"
    failed_version="0187"
    failed_file="0187_installation_domain_rls.sql"
    echo "failed to seed installation audit data-bearing fixture" >> "$apply_log"
  fi
fi

# The LINE OA tenant backfill in 0189 also touches an append-only audit table.
# Seed a disposable row whenever that canonical version is pending so the
# simulation proves both the one-time backfill and trigger restoration.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e '.missingFromHosted[] | select(.version == "0189")' \
    "$reconciliation_json" > /dev/null; then
  data_bearing_fixture_required=true
  data_bearing_migration_fixture_passed=false
  line_oa_audit_fixture_required=true

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.line_oa_audit_log (
          event_type,
          vertical_context,
          entity_ref,
          performed_by
        ) VALUES (
          'schema_reconciliation_line_oa_audit_fixture',
          'system',
          'schema-reconciliation-fixture',
          'schema-reconciliation'
        );" \
    >> "$restore_log" 2>&1; then
    line_oa_audit_fixture_seeded=true
  else
    failed_order="$(jq -r \
      '.missingFromHosted[] | select(.version == "0189") | .order' \
      "$reconciliation_json")"
    failed_version="0189"
    failed_file="0189_line_oa_domain_rls.sql"
    echo "failed to seed LINE OA audit data-bearing fixture" >> "$apply_log"
  fi
fi

# The capture-domain tenant backfill in 0192 updates its append-only audit log.
# A disposable row makes that data-bearing behavior visible on the schema-only
# clone without copying or changing production data.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e '.missingFromHosted[] | select(.version == "0192")' \
    "$reconciliation_json" > /dev/null; then
  data_bearing_fixture_required=true
  data_bearing_migration_fixture_passed=false
  capture_audit_fixture_required=true

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.capture_audit_log (event_type, actor, detail)
        VALUES (
          'schema_reconciliation_capture_audit_fixture',
          'schema-reconciliation',
          '{\"fixture\": true}'::jsonb
        );" \
    >> "$restore_log" 2>&1; then
    capture_audit_fixture_seeded=true
  else
    failed_order="$(jq -r \
      '.missingFromHosted[] | select(.version == "0192") | .order' \
      "$reconciliation_json")"
    failed_version="0192"
    failed_file="0192_capture_documents_domain_rls.sql"
    echo "failed to seed capture audit data-bearing fixture" >> "$apply_log"
  fi
fi

# Published form templates reject ordinary content updates. Seed one published
# template before 0192 so the clone proves the org_id backfill bypasses only
# that trigger and restores it afterward.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e '.missingFromHosted[] | select(.version == "0192")' \
    "$reconciliation_json" > /dev/null; then
  data_bearing_fixture_required=true
  data_bearing_migration_fixture_passed=false
  form_template_fixture_required=true

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.form_templates (
          template_key,
          title,
          items,
          status,
          published_at,
          created_by
        ) VALUES (
          'schema_reconciliation_form_template_fixture',
          'Schema reconciliation fixture',
          '[]'::jsonb,
          'published',
          timezone('utc', now()),
          'schema-reconciliation'
        );" \
    >> "$restore_log" 2>&1; then
    form_template_fixture_seeded=true
  else
    failed_order="$(jq -r \
      '.missingFromHosted[] | select(.version == "0192") | .order' \
      "$reconciliation_json")"
    failed_version="0192"
    failed_file="0192_capture_documents_domain_rls.sql"
    echo "failed to seed published form-template data-bearing fixture" \
      >> "$apply_log"
  fi
fi

# Migration 0194 already attempted to bypass workflow audit immutability, but
# it disabled every trigger. Exercise the safer single-trigger recovery block
# and prove the audit table remains immutable afterward.
if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" ]] \
  && jq -e '.missingFromHosted[] | select(.version == "0194")' \
    "$reconciliation_json" > /dev/null; then
  data_bearing_fixture_required=true
  data_bearing_migration_fixture_passed=false
  workflow_audit_fixture_required=true

  if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c "INSERT INTO public.workflow_audit_log (event_type, performed_by, detail)
        VALUES (
          'schema_reconciliation_workflow_audit_fixture',
          'schema-reconciliation',
          '{\"fixture\": true}'::jsonb
        );" \
    >> "$restore_log" 2>&1; then
    workflow_audit_fixture_seeded=true
  else
    failed_order="$(jq -r \
      '.missingFromHosted[] | select(.version == "0194") | .order' \
      "$reconciliation_json")"
    failed_version="0194"
    failed_file="0194_operational_misc_domain_rls.sql"
    echo "failed to seed workflow audit data-bearing fixture" >> "$apply_log"
  fi
fi

if [[ "$schema_restore_succeeded" == "true" \
  && "$local_dependency_extensions_ready" == "true" \
  && "$canonical_static_seed_restored" == "true" \
  && -z "$failed_file" ]]; then
  while IFS=$'\t' read -r order version file; do
    migration_path="$canonical_plan_dir/supabase/migrations/$file"
    if [[ ! -f "$migration_path" ]]; then
      failed_order="$order"
      failed_version="$version"
      failed_file="$file"
      echo "missing rendered migration: $migration_path" >> "$apply_log"
      break
    fi

    echo "[reconciliation-simulation] applying $version ($file)" >> "$apply_log"
    if psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
      -f "$migration_path" >> "$apply_log" 2>&1; then
      applied_count=$((applied_count + 1))
      printf '%s\t%s\t%s\n' "$order" "$version" "$file" >> "$applied_tsv"
    else
      failed_order="$order"
      failed_version="$version"
      failed_file="$file"
      break
    fi
  done < <(jq -r '.missingFromHosted[] | [.order, .version, .file] | @tsv' \
    "$reconciliation_json")

  core_schema_ready_after="$(psql "$local_database_url" --no-psqlrc -X -tA \
    -v ON_ERROR_STOP=1 -c "$core_schema_query")"
fi

all_missing_migrations_applied=false
if [[ "$schema_restore_succeeded" == "true" \
  && -z "$failed_file" \
  && "$applied_count" -eq "$missing_count" ]]; then
  all_missing_migrations_applied=true
fi

if [[ "$installation_audit_fixture_required" == "true" \
  && "$installation_audit_fixture_seeded" == "true" \
  && "$all_missing_migrations_applied" == "true" ]]; then
  fixture_org_id="$(psql "$local_database_url" --no-psqlrc -X -qAt \
    -v ON_ERROR_STOP=1 \
    -c "SELECT org_id::text
        FROM public.installation_audit_log
        WHERE event_type =
          'schema_reconciliation_installation_audit_fixture';")"
  if [[ "$fixture_org_id" == "00000000-0000-0000-0000-000000000000" ]]; then
    installation_audit_fixture_backfilled=true
  fi

  if ! psql "$local_database_url" --no-psqlrc -X -q \
    -v ON_ERROR_STOP=1 \
    -c "UPDATE public.installation_audit_log
        SET detail = '{\"fixture\": false}'::jsonb
        WHERE event_type =
          'schema_reconciliation_installation_audit_fixture';" \
    >> "$apply_log" 2>&1; then
    installation_audit_fixture_immutability_restored=true
  fi
fi

if [[ "$line_oa_audit_fixture_required" == "true" \
  && "$line_oa_audit_fixture_seeded" == "true" \
  && "$all_missing_migrations_applied" == "true" ]]; then
  line_oa_fixture_org_id="$(psql "$local_database_url" --no-psqlrc -X -qAt \
    -v ON_ERROR_STOP=1 \
    -c "SELECT org_id::text
        FROM public.line_oa_audit_log
        WHERE event_type =
          'schema_reconciliation_line_oa_audit_fixture';")"
  if [[ "$line_oa_fixture_org_id" == "00000000-0000-0000-0000-000000000000" ]]; then
    line_oa_audit_fixture_backfilled=true
  fi

  if ! psql "$local_database_url" --no-psqlrc -X -q \
    -v ON_ERROR_STOP=1 \
    -c "UPDATE public.line_oa_audit_log
        SET entity_ref = 'schema-reconciliation-fixture-modified'
        WHERE event_type =
          'schema_reconciliation_line_oa_audit_fixture';" \
    >> "$apply_log" 2>&1; then
    line_oa_audit_fixture_immutability_restored=true
  fi
fi

if [[ "$capture_audit_fixture_required" == "true" \
  && "$capture_audit_fixture_seeded" == "true" \
  && "$all_missing_migrations_applied" == "true" ]]; then
  capture_fixture_org_id="$(psql "$local_database_url" --no-psqlrc -X -qAt \
    -v ON_ERROR_STOP=1 \
    -c "SELECT org_id::text
        FROM public.capture_audit_log
        WHERE event_type =
          'schema_reconciliation_capture_audit_fixture';")"
  if [[ "$capture_fixture_org_id" == "00000000-0000-0000-0000-000000000000" ]]; then
    capture_audit_fixture_backfilled=true
  fi

  if ! psql "$local_database_url" --no-psqlrc -X -q \
    -v ON_ERROR_STOP=1 \
    -c "UPDATE public.capture_audit_log
        SET detail = '{\"fixture\": false}'::jsonb
        WHERE event_type =
          'schema_reconciliation_capture_audit_fixture';" \
    >> "$apply_log" 2>&1; then
    capture_audit_fixture_immutability_restored=true
  fi
fi

if [[ "$form_template_fixture_required" == "true" \
  && "$form_template_fixture_seeded" == "true" \
  && "$all_missing_migrations_applied" == "true" ]]; then
  form_template_fixture_org_id="$(psql "$local_database_url" \
    --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 \
    -c "SELECT org_id::text
        FROM public.form_templates
        WHERE template_key =
          'schema_reconciliation_form_template_fixture';")"
  if [[ "$form_template_fixture_org_id" == "00000000-0000-0000-0000-000000000000" ]]; then
    form_template_fixture_backfilled=true
  fi

  if ! psql "$local_database_url" --no-psqlrc -X -q \
    -v ON_ERROR_STOP=1 \
    -c "UPDATE public.form_templates
        SET title = 'Modified schema reconciliation fixture'
        WHERE template_key =
          'schema_reconciliation_form_template_fixture';" \
    >> "$apply_log" 2>&1; then
    form_template_fixture_immutability_restored=true
  fi
fi

if [[ "$workflow_audit_fixture_required" == "true" \
  && "$workflow_audit_fixture_seeded" == "true" \
  && "$all_missing_migrations_applied" == "true" ]]; then
  workflow_fixture_org_id="$(psql "$local_database_url" --no-psqlrc -X -qAt \
    -v ON_ERROR_STOP=1 \
    -c "SELECT org_id::text
        FROM public.workflow_audit_log
        WHERE event_type =
          'schema_reconciliation_workflow_audit_fixture';")"
  if [[ "$workflow_fixture_org_id" == "00000000-0000-0000-0000-000000000000" ]]; then
    workflow_audit_fixture_backfilled=true
  fi

  if ! psql "$local_database_url" --no-psqlrc -X -q \
    -v ON_ERROR_STOP=1 \
    -c "UPDATE public.workflow_audit_log
        SET detail = '{\"fixture\": false}'::jsonb
        WHERE event_type =
          'schema_reconciliation_workflow_audit_fixture';" \
    >> "$apply_log" 2>&1; then
    workflow_audit_fixture_immutability_restored=true
  fi
fi

if [[ "$data_bearing_fixture_required" == "true" ]]; then
  if [[ "$installation_audit_fixture_required" == "false" \
      || ( "$installation_audit_fixture_seeded" == "true" \
        && "$installation_audit_fixture_backfilled" == "true" \
        && "$installation_audit_fixture_immutability_restored" == "true" ) ]] \
    && [[ "$line_oa_audit_fixture_required" == "false" \
      || ( "$line_oa_audit_fixture_seeded" == "true" \
        && "$line_oa_audit_fixture_backfilled" == "true" \
        && "$line_oa_audit_fixture_immutability_restored" == "true" ) ]] \
    && [[ "$capture_audit_fixture_required" == "false" \
      || ( "$capture_audit_fixture_seeded" == "true" \
        && "$capture_audit_fixture_backfilled" == "true" \
        && "$capture_audit_fixture_immutability_restored" == "true" ) ]] \
    && [[ "$form_template_fixture_required" == "false" \
      || ( "$form_template_fixture_seeded" == "true" \
        && "$form_template_fixture_backfilled" == "true" \
        && "$form_template_fixture_immutability_restored" == "true" ) ]] \
    && [[ "$workflow_audit_fixture_required" == "false" \
      || ( "$workflow_audit_fixture_seeded" == "true" \
        && "$workflow_audit_fixture_backfilled" == "true" \
        && "$workflow_audit_fixture_immutability_restored" == "true" ) ]]; then
    data_bearing_fixture_seeded=true
    data_bearing_fixture_backfilled=true
    data_bearing_fixture_immutability_restored=true
    data_bearing_migration_fixture_passed=true
  fi
fi

if [[ "$all_missing_migrations_applied" == "true" ]]; then
  psql "$local_database_url" --no-psqlrc -X -v ON_ERROR_STOP=1 \
    -c 'CREATE EXTENSION IF NOT EXISTS pgtap;' >> "$pgtap_log" 2>&1

  shopt -s nullglob
  pgtap_files=("$canonical_plan_dir"/supabase/tests/*.sql)
  shopt -u nullglob
  pgtap_test_file_count="${#pgtap_files[@]}"

  set +e
  if [[ "$pgtap_test_file_count" -eq 0 ]]; then
    echo "No pgTAP SQL files found in $canonical_plan_dir/supabase/tests" \
      >> "$pgtap_log"
    pgtap_exit_code=2
  else
    pg_prove --dbname "$local_database_url" --verbose \
      "${pgtap_files[@]}" >> "$pgtap_log" 2>&1
    pgtap_exit_code=$?
  fi

  # Keep pgTAP available in `public` while the assertions run, then move the
  # extension into a dedicated schema on the disposable clone. Supabase's
  # linter inspects every routine in the requested schema, including
  # extension-owned routines, so merely attaching an unpackaged pgTAP install
  # to the extension catalog is not sufficient. Hosted is never modified.
  pgtap_isolation_result="$(psql "$local_database_url" \
    --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE EXTENSION pgtap FROM unpackaged;'
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_extension
  WHERE extname = 'pgtap'
) \gexec

SELECT count(*)
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = routine.pronamespace
JOIN pg_catalog.pg_depend AS dependency
  ON dependency.classid = 'pg_catalog.pg_proc'::regclass
 AND dependency.objid = routine.oid
 AND dependency.deptype = 'e'
JOIN pg_catalog.pg_extension AS extension
  ON extension.oid = dependency.refobjid
 AND extension.extname = 'pgtap'
WHERE namespace.nspname = 'public';

CREATE SCHEMA IF NOT EXISTS pgtap_lint_excluded;
ALTER EXTENSION pgtap SET SCHEMA pgtap_lint_excluded;

SELECT count(*)
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = routine.pronamespace
JOIN pg_catalog.pg_depend AS dependency
  ON dependency.classid = 'pg_catalog.pg_proc'::regclass
 AND dependency.objid = routine.oid
 AND dependency.deptype = 'e'
JOIN pg_catalog.pg_extension AS extension
  ON extension.oid = dependency.refobjid
 AND extension.extname = 'pgtap'
WHERE namespace.nspname = 'public';
SQL
  )"
  isolate_exit_code=$?
  legacy_pgtap_routine_count="$(printf '%s\n' "$pgtap_isolation_result" | sed -n '1p')"
  remaining_public_pgtap_routine_count="$(printf '%s\n' "$pgtap_isolation_result" | sed -n '2p')"
  if [[ "$isolate_exit_code" -eq 0 \
    && "$legacy_pgtap_routine_count" =~ ^[0-9]+$ \
    && "$remaining_public_pgtap_routine_count" == "0" ]]; then
    legacy_pgtap_routines_isolated=true
  else
    legacy_pgtap_routine_count=0
    echo "Failed to isolate pgTAP routines from the public lint schema" >> "$lint_log"
  fi

  supabase db lint \
    --db-url "$local_database_url" \
    --schema public \
    --level error \
    --fail-on error \
    > "$lint_log" 2>&1
  database_lint_exit_code=$?
  set -e

  pgtap_assertion_count="$(grep -Ec '^ok ' "$pgtap_log" || true)"
  if [[ "$pgtap_exit_code" -eq 0 && "$pgtap_assertion_count" -gt 0 ]]; then
    pgtap_passed=true
  fi
  if [[ "$database_lint_exit_code" -eq 0 ]]; then
    database_lint_clean=true
  fi
fi

jq -n \
  --argjson hostedServerVersionNum "$hosted_server_version_num" \
  --argjson missingMigrationCount "$missing_count" \
  --argjson appliedMigrationCount "$applied_count" \
  --arg failedOrder "$failed_order" \
  --arg failedVersion "$failed_version" \
  --arg failedFile "$failed_file" \
  --argjson schemaRestoreSucceeded "$schema_restore_succeeded" \
  --argjson coreSchemaReadyBefore "$core_schema_ready_before" \
  --argjson coreSchemaReadyAfter "$core_schema_ready_after" \
  --argjson allMissingMigrationsApplied "$all_missing_migrations_applied" \
  --argjson pgtapExitCode "$pgtap_exit_code" \
  --argjson pgtapTestFileCount "$pgtap_test_file_count" \
  --argjson pgtapAssertionCount "$pgtap_assertion_count" \
  --argjson pgtapPassed "$pgtap_passed" \
  --argjson databaseLintExitCode "$database_lint_exit_code" \
  --argjson databaseLintClean "$database_lint_clean" \
  --argjson legacyPgTapRoutineCount "$legacy_pgtap_routine_count" \
  --argjson legacyPgTapRoutinesIsolated "$legacy_pgtap_routines_isolated" \
  --argjson localDependencyExtensionsReady "$local_dependency_extensions_ready" \
  --arg failedDependencyExtension "$failed_dependency_extension" \
  --argjson dataBearingFixtureRequired "$data_bearing_fixture_required" \
  --argjson dataBearingFixtureSeeded "$data_bearing_fixture_seeded" \
  --argjson dataBearingFixtureBackfilled "$data_bearing_fixture_backfilled" \
  --argjson dataBearingFixtureImmutabilityRestored "$data_bearing_fixture_immutability_restored" \
  --argjson dataBearingMigrationFixturePassed "$data_bearing_migration_fixture_passed" \
  --argjson installationAuditFixtureRequired "$installation_audit_fixture_required" \
  --argjson installationAuditFixtureSeeded "$installation_audit_fixture_seeded" \
  --argjson installationAuditFixtureBackfilled "$installation_audit_fixture_backfilled" \
  --argjson installationAuditFixtureImmutabilityRestored "$installation_audit_fixture_immutability_restored" \
  --argjson lineOaAuditFixtureRequired "$line_oa_audit_fixture_required" \
  --argjson lineOaAuditFixtureSeeded "$line_oa_audit_fixture_seeded" \
  --argjson lineOaAuditFixtureBackfilled "$line_oa_audit_fixture_backfilled" \
  --argjson lineOaAuditFixtureImmutabilityRestored "$line_oa_audit_fixture_immutability_restored" \
  --argjson captureAuditFixtureRequired "$capture_audit_fixture_required" \
  --argjson captureAuditFixtureSeeded "$capture_audit_fixture_seeded" \
  --argjson captureAuditFixtureBackfilled "$capture_audit_fixture_backfilled" \
  --argjson captureAuditFixtureImmutabilityRestored "$capture_audit_fixture_immutability_restored" \
  --argjson formTemplateFixtureRequired "$form_template_fixture_required" \
  --argjson formTemplateFixtureSeeded "$form_template_fixture_seeded" \
  --argjson formTemplateFixtureBackfilled "$form_template_fixture_backfilled" \
  --argjson formTemplateFixtureImmutabilityRestored "$form_template_fixture_immutability_restored" \
  --argjson workflowAuditFixtureRequired "$workflow_audit_fixture_required" \
  --argjson workflowAuditFixtureSeeded "$workflow_audit_fixture_seeded" \
  --argjson workflowAuditFixtureBackfilled "$workflow_audit_fixture_backfilled" \
  --argjson workflowAuditFixtureImmutabilityRestored "$workflow_audit_fixture_immutability_restored" \
  --argjson canonicalStaticSeedRequired "$canonical_static_seed_required" \
  --argjson canonicalStaticSeedRestored "$canonical_static_seed_restored" \
  '{
    formatVersion: 1,
    simulationKind: "hosted-public-schema-only",
    hostedServerVersionNum: $hostedServerVersionNum,
    schemaRestoreSucceeded: $schemaRestoreSucceeded,
    localDependencyExtensionsReady: $localDependencyExtensionsReady,
    failedDependencyExtension: (
      if $failedDependencyExtension == "" then null
      else $failedDependencyExtension
      end
    ),
    coreSchemaReadyBefore: $coreSchemaReadyBefore,
    missingMigrationCount: $missingMigrationCount,
    appliedMigrationCount: $appliedMigrationCount,
    allMissingMigrationsApplied: $allMissingMigrationsApplied,
    failedMigration: (
      if $failedFile == "" then null
      else {
        order: ($failedOrder | tonumber),
        version: $failedVersion,
        file: $failedFile
      }
      end
    ),
    coreSchemaReadyAfter: $coreSchemaReadyAfter,
    pgtapExitCode: $pgtapExitCode,
    pgtapTestFileCount: $pgtapTestFileCount,
    pgtapAssertionCount: $pgtapAssertionCount,
    pgtapPassed: $pgtapPassed,
    databaseLintExitCode: $databaseLintExitCode,
    databaseLintClean: $databaseLintClean,
    databaseLintScope: "public application routines; pgTAP extension moved to pgtap_lint_excluded after assertions",
    legacyPgTapRoutineCount: $legacyPgTapRoutineCount,
    legacyPgTapRoutinesIsolated: $legacyPgTapRoutinesIsolated,
    dataBearingFixtureRequired: $dataBearingFixtureRequired,
    dataBearingFixtureSeeded: $dataBearingFixtureSeeded,
    dataBearingFixtureBackfilled: $dataBearingFixtureBackfilled,
    dataBearingFixtureImmutabilityRestored: $dataBearingFixtureImmutabilityRestored,
    dataBearingMigrationFixturePassed: $dataBearingMigrationFixturePassed,
    dataBearingFixtures: {
      installationAudit: {
        required: $installationAuditFixtureRequired,
        seeded: $installationAuditFixtureSeeded,
        backfilled: $installationAuditFixtureBackfilled,
        immutabilityRestored: $installationAuditFixtureImmutabilityRestored
      },
      lineOaAudit: {
        required: $lineOaAuditFixtureRequired,
        seeded: $lineOaAuditFixtureSeeded,
        backfilled: $lineOaAuditFixtureBackfilled,
        immutabilityRestored: $lineOaAuditFixtureImmutabilityRestored
      },
      captureAudit: {
        required: $captureAuditFixtureRequired,
        seeded: $captureAuditFixtureSeeded,
        backfilled: $captureAuditFixtureBackfilled,
        immutabilityRestored: $captureAuditFixtureImmutabilityRestored
      },
      publishedFormTemplate: {
        required: $formTemplateFixtureRequired,
        seeded: $formTemplateFixtureSeeded,
        backfilled: $formTemplateFixtureBackfilled,
        immutabilityRestored: $formTemplateFixtureImmutabilityRestored
      },
      workflowAudit: {
        required: $workflowAuditFixtureRequired,
        seeded: $workflowAuditFixtureSeeded,
        backfilled: $workflowAuditFixtureBackfilled,
        immutabilityRestored: $workflowAuditFixtureImmutabilityRestored
      }
    },
    canonicalStaticSeedRequired: $canonicalStaticSeedRequired,
    canonicalStaticSeedRestored: $canonicalStaticSeedRestored,
    productionDataCopied: false,
    productionWritesPerformed: false
  }' > "$result_json"

jq . "$result_json"
