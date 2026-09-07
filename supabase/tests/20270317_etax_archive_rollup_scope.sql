-- pgTAP contract coverage for archive rollup tenant/service-role scoping.

BEGIN;

SELECT plan(4);

SELECT has_function(
  'public',
  'rpc_etax_sla_archive_org_rollup',
  ARRAY['uuid', 'date', 'date'],
  '20270317-01: archive rollup RPC exists'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.rpc_etax_sla_archive_org_rollup(uuid,date,date)',
    'EXECUTE'
  ),
  '20270317-02: service_role can execute archive rollup RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_sla_archive_org_rollup(uuid,date,date)',
    'EXECUTE'
  ),
  '20270317-03: anon cannot execute archive rollup RPC'
);

SELECT ok(
  pg_get_functiondef(
    'public.rpc_etax_sla_archive_org_rollup(uuid,date,date)'::regprocedure
  ) ILIKE '%service_role%'
  AND pg_get_functiondef(
    'public.rpc_etax_sla_archive_org_rollup(uuid,date,date)'::regprocedure
  ) ILIKE '%rollup.org_id = public.get_user_org_id()%',
  '20270317-04: RPC implements service-role bypass plus tenant scope'
);

SELECT * FROM finish();
ROLLBACK;
