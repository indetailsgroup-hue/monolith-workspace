#!/usr/bin/env bash

# Capture structural hosted-database evidence without reading application rows.
# DATABASE_URL is accepted only through the environment so it is never printed
# in a command line or included in the generated JSON artifact.

set -euo pipefail
export LC_ALL=C

if [[ $# -ne 1 ]]; then
  echo "usage: DATABASE_URL=postgresql://... $0 OUTPUT_JSON" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[hosted-inventory] DATABASE_URL is required" >&2
  exit 1
fi

case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *)
    echo "[hosted-inventory] DATABASE_URL must be a PostgreSQL connection URI" >&2
    exit 1
    ;;
esac

output_json="$1"
mkdir -p "$(dirname "$output_json")"

inventory_tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$inventory_tmp_dir"
}
trap cleanup EXIT

count_rows_if_present() {
  local relation="$1"
  if [[ "$(psql "$DATABASE_URL" --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 \
    -c "BEGIN TRANSACTION READ ONLY;
        SELECT to_regclass('$relation') IS NOT NULL;
        COMMIT;")" == "t" ]]; then
    psql "$DATABASE_URL" --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 \
      -c "BEGIN TRANSACTION READ ONLY;
          SELECT count(*) FROM $relation;
          COMMIT;"
  else
    echo 0
  fi
}

auth_user_count="$(count_rows_if_present auth.users)"
storage_object_count="$(count_rows_if_present storage.objects)"
migration_history_count="$(count_rows_if_present supabase_migrations.schema_migrations)"

for count in "$auth_user_count" "$storage_object_count" "$migration_history_count"; do
  if [[ ! "$count" =~ ^[0-9]+$ ]]; then
    echo "[hosted-inventory] expected a numeric structural count" >&2
    exit 1
  fi
done

if [[ "$migration_history_count" -gt 0 ]]; then
  psql "$DATABASE_URL" --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 \
    -c "BEGIN TRANSACTION READ ONLY;
        SELECT COALESCE(jsonb_agg(version ORDER BY version), '[]'::jsonb)
        FROM supabase_migrations.schema_migrations;
        COMMIT;" \
    > "$inventory_tmp_dir/migration-versions.json"
else
  echo '[]' > "$inventory_tmp_dir/migration-versions.json"
fi

psql "$DATABASE_URL" --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 \
  -c "BEGIN TRANSACTION READ ONLY;
      WITH public_tables AS (
        SELECT relation.relname
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_depend AS dependency
            WHERE dependency.classid = 'pg_class'::regclass
              AND dependency.objid = relation.oid
              AND dependency.deptype = 'e'
          )
      ), installed_extensions AS (
        SELECT COALESCE(
          jsonb_object_agg(extension.extname, namespace.nspname ORDER BY extension.extname),
          '{}'::jsonb
        ) AS value
        FROM pg_catalog.pg_extension AS extension
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = extension.extnamespace
      ), core_state AS (
        SELECT jsonb_build_object(
          'organizations', to_regclass('public.organizations') IS NOT NULL,
          'orgMembers', to_regclass('public.org_members') IS NOT NULL,
          'superAdmins', to_regclass('public.super_admins') IS NOT NULL,
          'notificationDigestQueue', to_regclass('public.notification_digest_queue') IS NOT NULL,
          'platformMetricsSnapshots', to_regclass('public.platform_metrics_snapshots') IS NOT NULL
        ) AS value
      ), security_state AS (
        SELECT jsonb_build_object(
          'notificationDigestQueueRls', COALESCE((
            SELECT relation.relrowsecurity
            FROM pg_catalog.pg_class AS relation
            WHERE relation.oid = to_regclass('public.notification_digest_queue')
          ), false),
          'notificationDigestQueuePolicy', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'notification_digest_queue'
              AND policyname = 'digest_queue_own_user_select'
              AND cmd = 'SELECT'
              AND qual ILIKE '%user_id%'
              AND qual ILIKE '%uid()%'
          ),
          'notificationDigestQueuePermissiveBypass', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'notification_digest_queue'
              AND cmd = 'SELECT'
              AND permissive = 'PERMISSIVE'
              AND (qual = 'true' OR qual = '(1 = 1)')
          ),
          'platformMetricsSnapshotsRls', COALESCE((
            SELECT relation.relrowsecurity
            FROM pg_catalog.pg_class AS relation
            WHERE relation.oid = to_regclass('public.platform_metrics_snapshots')
          ), false),
          'platformMetricsSelectPolicy', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'platform_metrics_snapshots'
              AND policyname = 'platform_metrics_super_admin_select'
              AND cmd = 'SELECT'
          ),
          'platformMetricsInsertPolicy', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'platform_metrics_snapshots'
              AND policyname = 'platform_metrics_super_admin_insert'
              AND cmd = 'INSERT'
          )
        ) AS value
      )
      SELECT jsonb_build_object(
        'database', current_database(),
        'serverVersionNum', current_setting('server_version_num')::integer,
        'transactionReadOnly', current_setting('transaction_read_only')::boolean,
        'publicUserTableCount', (SELECT count(*) FROM public_tables),
        'publicUserTables', COALESCE(
          (SELECT jsonb_agg(relname ORDER BY relname) FROM public_tables),
          '[]'::jsonb
        ),
        'installedExtensions', (SELECT value FROM installed_extensions),
        'coreTables', (SELECT value FROM core_state),
        'securityState', (SELECT value FROM security_state),
        'authUserCount', $auth_user_count,
        'storageObjectCount', $storage_object_count,
        'migrationHistoryCount', $migration_history_count,
        'bootstrapCandidate', (
          (SELECT count(*) FROM public_tables) = 0
          AND NOT (
            SELECT bool_or(entry.value::boolean)
            FROM core_state
            CROSS JOIN LATERAL jsonb_each_text(core_state.value) AS entry
          )
        ),
        'productionWritesPerformed', false
      );
      COMMIT;" > "$inventory_tmp_dir/inventory-base.json"

jq --slurpfile versions "$inventory_tmp_dir/migration-versions.json" \
  '. + {migrationHistoryVersions: $versions[0]}' \
  "$inventory_tmp_dir/inventory-base.json" > "$output_json"

jq . "$output_json"
