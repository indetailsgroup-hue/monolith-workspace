-- pgTAP coverage for legacy eTax privilege hardening.

BEGIN;

SELECT plan(12);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_compliance_dashboard_cached()',
    'EXECUTE'
  ),
  '20270314-01: anon cannot execute compliance cached RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.rpc_etax_compliance_dashboard_cached()',
    'EXECUTE'
  ),
  '20270314-02: authenticated can execute compliance cached RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_sla_breach_archive(uuid,text,date,date)',
    'EXECUTE'
  ),
  '20270314-03: anon cannot execute SLA breach archive RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_sla_archive_summary(uuid,text,date,date)',
    'EXECUTE'
  ),
  '20270314-04: anon cannot execute SLA archive summary RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_sla_archive_org_rollup(uuid,date,date)',
    'EXECUTE'
  ),
  '20270314-05: anon cannot execute SLA archive rollup RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.fn_archive_etax_sla_breach_timeline()',
    'EXECUTE'
  ),
  '20270314-06: authenticated cannot run SLA archival maintenance'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_partition_health()',
    'EXECUTE'
  ),
  '20270314-07: anon cannot execute partition diagnostics'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_notify_request_status(integer)',
    'EXECUTE'
  ),
  '20270314-08: anon cannot read notification diagnostics'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.fn_create_etax_partition(integer,integer)',
    'EXECUTE'
  ),
  '20270314-09: authenticated cannot create partitions'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.partition_archive_log',
    'SELECT'
  ),
  '20270314-10: authenticated has no direct archive-log SELECT'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.partition_archive_log',
    'INSERT'
  ),
  '20270314-11: authenticated has no direct archive-log INSERT'
);

SELECT ok(
  has_table_privilege(
    'service_role',
    'public.partition_archive_log',
    'SELECT'
  )
  AND has_table_privilege(
    'service_role',
    'public.partition_archive_log',
    'INSERT'
  )
  AND has_table_privilege(
    'service_role',
    'public.partition_archive_log',
    'UPDATE'
  )
  AND has_table_privilege(
    'service_role',
    'public.partition_archive_log',
    'DELETE'
  ),
  '20270314-12: service role retains archive-log maintenance access'
);

SELECT * FROM finish();
ROLLBACK;
