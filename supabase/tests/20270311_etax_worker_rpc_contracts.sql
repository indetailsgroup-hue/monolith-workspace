-- pgTAP coverage for the eTax worker RPC convergence.

BEGIN;

SELECT plan(8);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'rpc_etax_mark_submitted'
  ),
  1::BIGINT,
  '20270311-01: mark-submitted has one unambiguous overload'
);

SELECT ok(
  pg_get_functiondef(
    'public.rpc_etax_auto_submit(uuid,public.etax_document_type)'::regprocedure
  ) LIKE '%error_detail = CASE%',
  '20270311-02: auto-submit clears stale requeue error detail'
);

SELECT ok(
  pg_get_functiondef(
    'public.rpc_etax_auto_submit(uuid,public.etax_document_type)'::regprocedure
  ) LIKE '%lower(v_invoice.status::TEXT)%',
  '20270311-03: auto-submit accepts canonical PAID spelling'
);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73031100-0000-0000-0000-000000000001',
  'pgTAP eTax worker RPC',
  'pgtap-etax-worker-rpc-20270311'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73031100-0000-0000-0000-000000000002',
  '73031100-0000-0000-0000-000000000001',
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
  '73031100-0000-0000-0000-000000000003',
  '73031100-0000-0000-0000-000000000003',
  'INV-PGTAP-20270311',
  'INV-PGTAP-20270311',
  '73031100-0000-0000-0000-000000000001',
  '73031100-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE + 30,
  '73031100-0000-0000-0000-000000000004'
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
  error_detail,
  created_by
) VALUES (
  '73031100-0000-0000-0000-000000000005',
  '73031100-0000-0000-0000-000000000001',
  '73031100-0000-0000-0000-000000000003',
  'T01',
  'INV-PGTAP-20270311',
  CURRENT_DATE,
  1000,
  70,
  1070,
  0.0700,
  'pgTAP customer',
  '0100000000001',
  'submitting',
  'stale provider error',
  '73031100-0000-0000-0000-000000000004'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  TRUE
);

SELECT lives_ok(
  $$SELECT public.rpc_etax_mark_submitted(
      '73031100-0000-0000-0000-000000000005'::UUID,
      'RD-PGTAP-20270311',
      '200',
      NULL,
      NULL
    )$$,
  '20270311-04: canonical worker completion call succeeds'
);

SELECT is(
  (
    SELECT status
    FROM public.etax_submissions
    WHERE invoice_id = '73031100-0000-0000-0000-000000000003'
  ),
  'submitted',
  '20270311-05: worker completion advances to submitted'
);

SELECT is(
  (
    SELECT rd_ref_no
    FROM public.etax_submissions
    WHERE invoice_id = '73031100-0000-0000-0000-000000000003'
  ),
  'RD-PGTAP-20270311',
  '20270311-06: worker completion stores RD reference'
);

SELECT lives_ok(
  $$UPDATE public.etax_submissions
       SET pdf_status = 'downloaded'
     WHERE invoice_id = '73031100-0000-0000-0000-000000000003'$$,
  '20270311-07: partition constraints accept worker downloaded state'
);

SELECT ok(
  (
    SELECT error_detail
    FROM public.etax_submissions
    WHERE invoice_id = '73031100-0000-0000-0000-000000000003'
  ) IS NULL,
  '20270311-08: worker completion clears stale error detail'
);

SELECT * FROM finish();
ROLLBACK;
