-- pgTAP coverage for the dashboard dependency repair after partitioning.

BEGIN;

SELECT plan(6);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.view_table_usage
    WHERE view_schema = 'public'
      AND view_name = 'v_etax_compliance_dashboard'
      AND table_schema = 'public'
      AND table_name = 'etax_submissions'
  ),
  '20270309-01: compliance view depends on partitioned etax_submissions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.view_table_usage
    WHERE view_schema = 'public'
      AND view_name = 'v_etax_compliance_dashboard'
      AND table_schema = 'public'
      AND table_name = 'etax_submissions_pre_partition'
  ),
  '20270309-02: compliance view no longer depends on backup table'
);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73030900-0000-0000-0000-000000000001',
  'pgTAP compliance partition rebind',
  'pgtap-compliance-rebind-20270309'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73030900-0000-0000-0000-000000000002',
  '73030900-0000-0000-0000-000000000001',
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
  '73030900-0000-0000-0000-000000000003',
  '73030900-0000-0000-0000-000000000003',
  'INV-PGTAP-20270309',
  'INV-PGTAP-20270309',
  '73030900-0000-0000-0000-000000000001',
  '73030900-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE + 30,
  '73030900-0000-0000-0000-000000000004'
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
  created_by
) VALUES (
  '73030900-0000-0000-0000-000000000001',
  '73030900-0000-0000-0000-000000000003',
  'T01',
  'INV-PGTAP-20270309',
  CURRENT_DATE,
  1000,
  70,
  1070,
  0.0700,
  'pgTAP customer',
  '0100000000001',
  'submitted',
  '73030900-0000-0000-0000-000000000004'
);

SELECT is(
  (
    SELECT total_submissions
    FROM public.v_etax_compliance_dashboard
    WHERE org_id = '73030900-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '20270309-03: live dashboard sees a new partitioned submission'
);

SELECT is(
  (
    SELECT submitted_count
    FROM public.v_etax_compliance_dashboard
    WHERE org_id = '73030900-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '20270309-04: live dashboard aggregates the partitioned status'
);

SELECT ok(
  COALESCE(
    (
      public.fn_refresh_etax_compliance_mv('pgtap_partition_rebind')
      ->> 'ok'
    )::BOOLEAN,
    FALSE
  ),
  '20270309-05: compliance materialized view refresh succeeds'
);

SELECT is(
  (
    SELECT total_submissions
    FROM public.mv_etax_compliance_dashboard
    WHERE org_id = '73030900-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '20270309-06: materialized dashboard receives partitioned data'
);

SELECT * FROM finish();
ROLLBACK;
