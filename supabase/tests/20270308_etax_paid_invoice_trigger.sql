-- pgTAP behavioral coverage for paid-invoice auto-queueing on the partitioned
-- eTax submission table.

BEGIN;

SELECT plan(7);

SELECT ok(
  to_regprocedure('public.fn_auto_queue_etax()') IS NOT NULL,
  '20270308-01: paid-invoice queue trigger function exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.invoices'::regclass
       AND tgname = 'trg_etax_on_invoice_paid'
       AND NOT tgisinternal
  ),
  '20270308-02: paid-invoice trigger is attached to invoices'
);

SELECT ok(
  pg_get_functiondef('public.fn_auto_queue_etax()'::regprocedure)
    NOT LIKE '%ON CONFLICT (invoice_id, document_type)%',
  '20270308-03: trigger does not use an invalid partition-wide ON CONFLICT'
);

INSERT INTO public.organizations (org_id, name, slug)
VALUES (
  '73030800-0000-0000-0000-000000000001',
  'pgTAP eTax paid trigger',
  'pgtap-etax-paid-trigger-20270308'
);

INSERT INTO public.customers (customer_id, org_id, name, tax_id)
VALUES (
  '73030800-0000-0000-0000-000000000002',
  '73030800-0000-0000-0000-000000000001',
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
  '73030800-0000-0000-0000-000000000003',
  '73030800-0000-0000-0000-000000000003',
  'INV-PGTAP-20270308',
  'INV-PGTAP-20270308',
  '73030800-0000-0000-0000-000000000001',
  '73030800-0000-0000-0000-000000000002',
  'approved',
  1070,
  1070,
  CURRENT_DATE + 30,
  '73030800-0000-0000-0000-000000000004'
);

SELECT lives_ok(
  $$UPDATE public.invoices
       SET status = 'paid'
     WHERE id = '73030800-0000-0000-0000-000000000003'$$,
  '20270308-04: lowercase paid transition queues without conflict failure'
);

SELECT is(
  (
    SELECT count(*)
      FROM public.etax_submissions
     WHERE invoice_id = '73030800-0000-0000-0000-000000000003'
       AND document_type = 'T01'
  )::bigint,
  1::bigint,
  '20270308-05: first paid transition creates exactly one submission'
);

UPDATE public.invoices
   SET status = 'draft'
 WHERE id = '73030800-0000-0000-0000-000000000003';

SELECT lives_ok(
  $$UPDATE public.invoices
       SET status = 'PAID'
     WHERE id = '73030800-0000-0000-0000-000000000003'$$,
  '20270308-06: canonical uppercase PAID transition is accepted'
);

SELECT is(
  (
    SELECT count(*)
      FROM public.etax_submissions
     WHERE invoice_id = '73030800-0000-0000-0000-000000000003'
       AND document_type = 'T01'
  )::bigint,
  1::bigint,
  '20270308-07: repeated paid transitions remain globally idempotent'
);

SELECT * FROM finish();
ROLLBACK;
