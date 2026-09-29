-- pgTAP coverage for overdue-only org visibility and true UTC-today metrics.

BEGIN;

SELECT plan(8);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73031200-0000-0000-0000-000000000001',
  'pgTAP dashboard scope',
  'pgtap-dashboard-scope-20270312'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73031200-0000-0000-0000-000000000002',
  '73031200-0000-0000-0000-000000000001',
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
  '73031200-0000-0000-0000-000000000003',
  '73031200-0000-0000-0000-000000000003',
  'INV-PGTAP-20270312',
  'INV-PGTAP-20270312',
  '73031200-0000-0000-0000-000000000001',
  '73031200-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE - 7,
  '73031200-0000-0000-0000-000000000004'
);

INSERT INTO public.invoice_notifications (
  org_id,
  invoice_id,
  notification_type,
  status,
  days_overdue,
  amount_remaining,
  invoice_code
) VALUES (
  '73031200-0000-0000-0000-000000000001',
  '73031200-0000-0000-0000-000000000003',
  'overdue_7d',
  'pending',
  7,
  1070,
  'INV-PGTAP-20270312'
);

SELECT is(
  (
    SELECT total_submissions
    FROM public.v_etax_compliance_dashboard
    WHERE org_id = '73031200-0000-0000-0000-000000000001'
  ),
  0::BIGINT,
  '20270312-01: overdue-only org appears with zero submissions'
);

SELECT is(
  (
    SELECT overdue_invoice_count
    FROM public.v_etax_compliance_dashboard
    WHERE org_id = '73031200-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '20270312-02: overdue-only invoice is visible to compliance metrics'
);

SELECT is(
  (
    SELECT overdue_with_pending_etax
    FROM public.v_etax_compliance_dashboard
    WHERE org_id = '73031200-0000-0000-0000-000000000001'
  ),
  0::BIGINT,
  '20270312-03: overdue invoice without eTax is not pending eTax'
);

SELECT ok(
  COALESCE(
    (
      public.fn_refresh_etax_compliance_mv('pgtap_dashboard_scope')
      ->> 'ok'
    )::BOOLEAN,
    FALSE
  ),
  '20270312-04: compliance MV refresh accepts overdue-only org'
);

SELECT is(
  (
    SELECT overdue_invoice_count
    FROM public.mv_etax_compliance_dashboard
    WHERE org_id = '73031200-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '20270312-05: compliance MV retains overdue-only metrics'
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
  submitted_at,
  created_at,
  created_by
) VALUES (
  '73031200-0000-0000-0000-000000000005',
  '73031200-0000-0000-0000-000000000001',
  '73031200-0000-0000-0000-000000000003',
  'T01',
  'INV-PGTAP-20270312',
  CURRENT_DATE - 1,
  1000,
  70,
  1070,
  0.0700,
  'pgTAP customer',
  '0100000000001',
  'submitted',
  1,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day',
  '73031200-0000-0000-0000-000000000004'
);

SELECT ok(
  COALESCE(
    (
      public.fn_refresh_etax_compliance_mv('pgtap_dashboard_scope')
      ->> 'ok'
    )::BOOLEAN,
    FALSE
  ),
  '20270312-06: compliance MV refresh includes yesterday submission'
);

SELECT is(
  public.fn_refresh_etax_health_trend_mv('test') ->> 'status',
  'ok',
  '20270312-07: health-trend MV refresh includes yesterday submission'
);

SELECT is(
  (
    SELECT today_total
    FROM public.v_etax_full_health_summary
    WHERE org_id = '73031200-0000-0000-0000-000000000001'
  ),
  0::BIGINT,
  '20270312-08: yesterday is not misreported as today'
);

SELECT * FROM finish();
ROLLBACK;
