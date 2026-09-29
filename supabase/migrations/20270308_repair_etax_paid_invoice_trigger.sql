-- =============================================================================
-- Repair automatic eTax queueing after etax_submissions became partitioned.
--
-- The invoice trigger retained ON CONFLICT (invoice_id, document_type), but a
-- partitioned PostgreSQL table cannot have that global unique constraint unless
-- the partition key is included. Every paid transition therefore failed. The
-- historical trigger also recognized only the lowercase enum value, while the
-- payment workflow publishes the canonical uppercase PAID value.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_auto_queue_etax()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_net          NUMERIC;
  v_vat          NUMERIC;
  v_gross        NUMERIC;
  v_buyer_name   TEXT;
  v_buyer_tax_id TEXT;
BEGIN
  IF lower(NEW.status::text) <> 'paid'
     OR lower(OLD.status::text) = 'paid' THEN
    RETURN NEW;
  END IF;

  -- Serialize on the business key before checking all partitions. This gives
  -- the trigger global idempotency without an invalid parent-table constraint.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.id::text || ':T01', 0)
  );

  IF EXISTS (
    SELECT 1
      FROM public.etax_submissions AS submission
     WHERE submission.invoice_id = NEW.id
       AND submission.document_type = 'T01'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT vat.net_amount, vat.vat_amount, vat.gross_amount
    INTO v_net, v_vat, v_gross
    FROM public._compute_etax_vat(COALESCE(NEW.total, 0), 0.0700) AS vat;

  SELECT customer.name, customer.tax_id
    INTO v_buyer_name, v_buyer_tax_id
    FROM public.customers AS customer
   WHERE customer.customer_id = NEW.customer_id;

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
    NEW.org_id,
    NEW.id,
    'T01',
    COALESCE(NEW.code, NEW.invoice_code),
    COALESCE(NEW.paid_at::date, CURRENT_DATE),
    v_net,
    v_vat,
    v_gross,
    0.0700,
    v_buyer_name,
    v_buyer_tax_id,
    'queued',
    COALESCE(NEW.updated_by, NEW.created_by)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_etax_on_invoice_paid ON public.invoices;
CREATE TRIGGER trg_etax_on_invoice_paid
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (
    lower(NEW.status::text) = 'paid'
    AND lower(OLD.status::text) IS DISTINCT FROM 'paid'
  )
  EXECUTE FUNCTION public.fn_auto_queue_etax();

REVOKE ALL ON FUNCTION public.fn_auto_queue_etax()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_auto_queue_etax() IS
  'Trigger-only paid-invoice eTax queue writer. Uses an advisory lock plus an '
  'explicit cross-partition existence check and accepts either PAID enum '
  'spelling. Repaired 20270308.';

COMMIT;
