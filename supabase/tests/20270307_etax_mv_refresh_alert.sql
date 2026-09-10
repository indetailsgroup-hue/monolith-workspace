-- pgTAP regression coverage for the system-level MV refresh-lag alert repair.

BEGIN;

SELECT plan(12);

SELECT col_is_null(
  'public',
  'etax_submission_audit_log',
  'submission_id',
  '20270307-01: system alerts may omit submission_id'
);

SELECT col_is_null(
  'public',
  'etax_submission_audit_log',
  'org_id',
  '20270307-02: system alerts may omit org_id'
);

SELECT col_is_null(
  'public',
  'etax_submission_audit_log',
  'new_status',
  '20270307-03: system alerts may omit new_status'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.etax_submission_audit_log'::regclass
       AND conname = 'chk_submission_id_or_system'
       AND contype = 'c'
  ),
  '20270307-04: submission_id NULL is restricted to system rows'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.etax_submission_audit_log'::regclass
       AND conname = 'chk_etax_audit_org_or_system'
       AND contype = 'c'
  ),
  '20270307-05: org_id NULL is restricted to system rows'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.etax_submission_audit_log'::regclass
       AND conname = 'chk_etax_audit_status_or_system'
       AND contype = 'c'
  ),
  '20270307-06: new_status NULL is restricted to system rows'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.fn_mv_refresh_lag_alert()',
    'EXECUTE'
  ),
  '20270307-07: service_role can invoke the operational alert function'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.fn_mv_refresh_lag_alert()',
    'EXECUTE'
  ),
  '20270307-08: authenticated users cannot invoke the alert function'
);

SELECT throws_ok(
  $$INSERT INTO public.etax_submission_audit_log (
      submission_id, org_id, new_status, trigger_source, metadata
    ) VALUES (NULL, NULL, NULL, 'worker', '{}')$$,
  '23514',
  NULL,
  '20270307-09: non-system rows cannot omit audit scope and status'
);

DELETE FROM public.etax_submission_audit_log
 WHERE trigger_source = 'system'
   AND metadata->>'alert_type' = 'mv_refresh_critical';

DELETE FROM public.etax_compliance_mv_refresh_log;

INSERT INTO public.etax_compliance_mv_refresh_log (
  refreshed_at,
  duration_ms,
  row_count,
  triggered_by
) VALUES (
  now() - interval '31 minutes',
  25,
  7,
  'test'
);

SELECT lives_ok(
  $$SELECT public.fn_mv_refresh_lag_alert()$$,
  '20270307-10: critical refresh lag persists without a hidden exception'
);

SELECT is(
  (
    SELECT count(*)
      FROM public.etax_submission_audit_log
     WHERE trigger_source = 'system'
       AND metadata->>'alert_type' = 'mv_refresh_critical'
  )::bigint,
  1::bigint,
  '20270307-11: one critical-lag alert is persisted'
);

SELECT public.fn_mv_refresh_lag_alert();

SELECT is(
  (
    SELECT count(*)
      FROM public.etax_submission_audit_log
     WHERE trigger_source = 'system'
       AND metadata->>'alert_type' = 'mv_refresh_critical'
  )::bigint,
  1::bigint,
  '20270307-12: a repeated call is deduplicated'
);

SELECT * FROM finish();
ROLLBACK;
