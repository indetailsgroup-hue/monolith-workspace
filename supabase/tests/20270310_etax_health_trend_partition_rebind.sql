-- pgTAP coverage for the health-trend dependency repair after partitioning.

BEGIN;

SELECT plan(6);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.view_table_usage
    WHERE view_schema = 'public'
      AND view_name = 'v_etax_health_trend'
      AND table_schema = 'public'
      AND table_name = 'etax_submissions'
  ),
  '20270310-01: health-trend view depends on partitioned etax_submissions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.view_table_usage
    WHERE view_schema = 'public'
      AND view_name = 'v_etax_health_trend'
      AND table_schema = 'public'
      AND table_name = 'etax_submissions_pre_partition'
  ),
  '20270310-02: health-trend view no longer depends on backup table'
);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73031000-0000-0000-0000-000000000001',
  'pgTAP health trend partition rebind',
  'pgtap-health-trend-rebind-20270310'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73031000-0000-0000-0000-000000000002',
  '73031000-0000-0000-0000-000000000001',
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
  '73031000-0000-0000-0000-000000000003',
  '73031000-0000-0000-0000-000000000003',
  'INV-PGTAP-20270310',
  'INV-PGTAP-20270310',
  '73031000-0000-0000-0000-000000000001',
  '73031000-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE + 30,
  '73031000-0000-0000-0000-000000000004'
);

INSERT INTO public.etax_submissions (
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
  submitted_at,
  pdf_status,
  created_by
) VALUES (
  '73031000-0000-0000-0000-000000000001',
  '73031000-0000-0000-0000-000000000003',
  'T01',
  'INV-PGTAP-20270310',
  CURRENT_DATE,
  1000,
  70,
  1070,
  0.0700,
  'pgTAP customer',
  '0100000000001',
  'submitted',
  1,
  NOW(),
  'downloaded',
  '73031000-0000-0000-0000-000000000004'
);

SELECT is(
  (
    SELECT daily_total
    FROM public.v_etax_health_trend
    WHERE org_id = '73031000-0000-0000-0000-000000000001'
      AND day_rank = 1
  ),
  1::BIGINT,
  '20270310-03: live trend sees a new partitioned submission'
);

SELECT is(
  (
    SELECT daily_successful
    FROM public.v_etax_health_trend
    WHERE org_id = '73031000-0000-0000-0000-000000000001'
      AND day_rank = 1
  ),
  1::BIGINT,
  '20270310-04: live trend aggregates the partitioned status'
);

SELECT is(
  public.fn_refresh_etax_health_trend_mv('test') ->> 'status',
  'ok',
  '20270310-05: health-trend materialized view refresh succeeds'
);

SELECT is(
  (
    SELECT daily_total
    FROM public.mv_etax_health_trend
    WHERE org_id = '73031000-0000-0000-0000-000000000001'
      AND day_rank = 1
  ),
  1::BIGINT,
  '20270310-06: materialized trend receives partitioned data'
);

SELECT * FROM finish();
ROLLBACK;
