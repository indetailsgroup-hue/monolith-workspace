-- pgTAP coverage for worker claim composite binding and refresh row counts.

BEGIN;

SELECT plan(6);

SELECT ok(
  (
    SELECT procedure.prorettype = 'public.etax_submissions'::REGTYPE
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = '_etax_claim_batch'
      AND procedure.pronargs = 1
  ),
  '20270313-01: worker claim returns partitioned-table composite'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.rpc_etax_compliance_dashboard()',
    'EXECUTE'
  ),
  '20270313-02: anon cannot execute compliance dashboard RPC'
);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73031300-0000-0000-0000-000000000001',
  'pgTAP worker claim',
  'pgtap-worker-claim-20270313'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73031300-0000-0000-0000-000000000002',
  '73031300-0000-0000-0000-000000000001',
  'pgTAP customer',
  '0100000000001'
);

INSERT INTO public.invoices (
  id,
  invoice_id,
  invoice_code,
  code,
  org_id,
  customer_id,
  status,
  total,
  remaining_amount,
  due_date,
  created_by
) VALUES (
  '73031300-0000-0000-0000-000000000003',
  '73031300-0000-0000-0000-000000000003',
  'INV-PGTAP-20270313',
  'INV-PGTAP-20270313',
  '73031300-0000-0000-0000-000000000001',
  '73031300-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE + 30,
  '73031300-0000-0000-0000-000000000004'
);

INSERT INTO public.etax_submissions (
  id,
  org_id,
  invoice_id,
  document_type,
  document_number,
  document_date,
  net_amount,
  vat_amount,
  gross_amount,
  vat_rate,
  buyer_name,
  buyer_tax_id,
  status,
  attempt_count,
  created_by
) VALUES (
  '73031300-0000-0000-0000-000000000005',
  '73031300-0000-0000-0000-000000000001',
  '73031300-0000-0000-0000-000000000003',
  'T01',
  'INV-PGTAP-20270313',
  CURRENT_DATE,
  1000,
  70,
  1070,
  0.0700,
  'pgTAP customer',
  '0100000000001',
  'queued',
  0,
  '73031300-0000-0000-0000-000000000004'
);

SELECT lives_ok(
  $$SELECT * FROM public._etax_claim_batch(1000)$$,
  '20270313-03: worker claim executes without composite mismatch'
);

SELECT is(
  (
    SELECT status
    FROM public.etax_submissions
    WHERE id = '73031300-0000-0000-0000-000000000005'
  ),
  'submitting',
  '20270313-04: worker claim advances queued row'
);

SELECT is(
  public.fn_refresh_etax_health_trend_mv('test') ->> 'status',
  'ok',
  '20270313-05: health-trend refresh succeeds'
);

SELECT is(
  (
    SELECT refresh_log.row_count
    FROM public.etax_health_trend_mv_refresh_log AS refresh_log
    WHERE refresh_log.triggered_by = 'test'
    ORDER BY refresh_log.id DESC
    LIMIT 1
  ),
  (
    SELECT count(*)::INT
    FROM public.mv_etax_health_trend
  ),
  '20270313-06: refresh log stores actual materialized-view row count'
);

SELECT * FROM finish();
ROLLBACK;
