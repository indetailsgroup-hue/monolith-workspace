-- pgTAP regression coverage for post-partition dependency rebinding and
-- observability privilege hardening.

BEGIN;

SELECT plan(16);

SELECT has_trigger(
  'public', 'etax_submissions', 'trg_queue_pdf_on_submitted',
  '20270318-01: PDF lifecycle trigger is attached to partitioned parent'
);

SELECT has_trigger(
  'public', 'etax_submissions', 'trg_etax_audit_on_status_change',
  '20270318-02: audit trigger is attached to partitioned parent'
);

SELECT ok(
  (
    SELECT procedure.prorettype = relation.reltype
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_class relation ON relation.oid = 'public.etax_submissions'::REGCLASS
    WHERE namespace.nspname = 'public'
      AND procedure.proname = '_etax_claim_pdf_batch'
      AND procedure.pronargs = 1
  ),
  '20270318-03: PDF batch claim returns the current parent composite type'
);

SELECT ok(
  pg_get_viewdef('public.v_etax_submission_health'::REGCLASS, TRUE)
    ILIKE '%FROM etax_submissions%',
  '20270318-04: submission health reads the partitioned parent'
);

SELECT ok(
  pg_get_viewdef('public.v_etax_submission_health'::REGCLASS, TRUE)
    NOT ILIKE '%etax_submissions_pre_partition%',
  '20270318-05: submission health no longer reads the legacy table'
);

SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';

SELECT lives_ok(
  $$SELECT COUNT(*) FROM public.v_etax_submission_sla$$,
  '20270318-06: service role can read the live SLA view for cache refreshes'
);

RESET ROLE;

SELECT ok(
  COALESCE(
    (
      SELECT 'security_invoker=true' = ANY(relation.reloptions)
      FROM pg_class relation
      WHERE relation.oid = 'public.v_etax_sla_breach_timeline'::REGCLASS
    ),
    FALSE
  ),
  '20270318-07: timeline view evaluates underlying RLS as the caller'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.rpc_etax_submission_health_admin()',
    'EXECUTE'
  ),
  '20270318-08: authenticated cannot execute health admin RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.rpc_etax_health_trend_admin()',
    'EXECUTE'
  ),
  '20270318-09: authenticated cannot execute trend admin RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.rpc_list_mv_alert_history_admin(integer)',
    'EXECUTE'
  ),
  '20270318-10: authenticated cannot execute alert-history admin RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_submission_sla_cached(text,text)',
    'EXECUTE'
  ),
  '20270318-11: anon cannot execute cached SLA RPC'
);

SELECT ok(
  pg_get_functiondef(
    'public.fn_post_payment_receipt_journal()'::REGPROCEDURE
  ) NOT ILIKE '%is_default%',
  '20270318-12: payment journal trigger uses the canonical book schema'
);

SELECT ok(
  pg_get_functiondef(
    'public.fn_post_payment_receipt_journal()'::REGPROCEDURE
  ) ILIKE '%registry.is_active%',
  '20270318-13: payment journal trigger selects an active book'
);

SELECT ok(
  pg_get_functiondef(
    'public.rpc_list_overdue_invoices(boolean,integer,integer)'::REGPROCEDURE
  ) ILIKE '%invoice.invoice_id%',
  '20270318-14: overdue pagination has a deterministic invoice tie-breaker'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.mv_etax_submission_sla',
    'SELECT'
  ),
  '20270318-15: cached SLA materialized view is service-only'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'public.v_mv_alert_history',
    'SELECT'
  ),
  '20270318-16: anon cannot read alert history directly'
);

SELECT * FROM finish();
ROLLBACK;
