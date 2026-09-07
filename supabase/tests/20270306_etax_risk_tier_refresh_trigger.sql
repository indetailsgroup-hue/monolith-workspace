-- pgTAP regression coverage for the 20270306 refresh-trigger repair.

BEGIN;

SELECT plan(10);

SELECT ok(
  to_regprocedure('public.fn_check_risk_tier_changes()') IS NOT NULL,
  '20270306-01: risk-tier refresh trigger function exists'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_check_risk_tier_changes()'::regprocedure),
  '20270306-02: risk-tier refresh trigger remains SECURITY DEFINER'
);

SELECT ok(
  pg_get_functiondef('public.fn_check_risk_tier_changes()'::regprocedure)
    LIKE '%ranking.org_id%',
  '20270306-03: function reads the canonical ranking org_id'
);

SELECT ok(
  pg_get_functiondef('public.fn_check_risk_tier_changes()'::regprocedure)
    NOT LIKE '%organizations o ON o.id%',
  '20270306-04: removed organizations.id join cannot regress'
);

SELECT ok(
  pg_get_functiondef('public.fn_check_risk_tier_changes()'::regprocedure)
    NOT LIKE '%NEW.org_id%',
  '20270306-05: refresh-log trigger does not read a nonexistent NEW.org_id'
);

SELECT is(
  (
    SELECT count(*)
      FROM pg_trigger
     WHERE tgname IN (
       'trg_check_risk_tier_on_compliance_refresh',
       'trg_check_risk_tier_on_health_trend_refresh'
     )
       AND NOT tgisinternal
  )::bigint,
  2::bigint,
  '20270306-06: both MV refresh triggers remain attached'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.fn_check_risk_tier_changes()',
    'EXECUTE'
  ),
  '20270306-07: PUBLIC revoke prevents anon from executing the trigger function'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.fn_check_risk_tier_changes()',
    'EXECUTE'
  ),
  '20270306-08: authenticated cannot execute the trigger function directly'
);

SELECT lives_ok(
  $$INSERT INTO public.etax_compliance_mv_refresh_log
      (duration_ms, row_count, triggered_by)
    VALUES (1, 0, 'test')$$,
  '20270306-09: compliance refresh-log insert executes the repaired trigger'
);

SELECT lives_ok(
  $$INSERT INTO public.etax_health_trend_mv_refresh_log
      (duration_ms, row_count, triggered_by)
    VALUES (1, 0, 'test')$$,
  '20270306-10: health-trend refresh-log insert executes the repaired trigger'
);

SELECT * FROM finish();
ROLLBACK;
