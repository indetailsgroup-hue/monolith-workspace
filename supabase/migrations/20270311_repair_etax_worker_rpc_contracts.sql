-- =============================================================================
-- Repair eTax requeue and worker completion RPC contracts.
--
-- The partition-safe auto-submit repair retained stale error details when a
-- failed/cancelled row was requeued and rejected canonical uppercase PAID.
-- Migration 0182 also added a four-argument mark-submitted overload without
-- removing the five-argument 0181 version, making named PostgREST calls
-- ambiguous. Keep one backward-compatible five-argument endpoint.
-- =============================================================================

BEGIN;

-- Remove every legacy/local PDF-state constraint from the parent and its leaf
-- partitions before installing one inherited compatibility contract.
DO $constraints$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT constraint_definition.conname
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.etax_submissions'::REGCLASS
      AND constraint_definition.contype = 'c'
      AND pg_get_constraintdef(constraint_definition.oid) LIKE '%pdf_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.etax_submissions DROP CONSTRAINT %I CASCADE',
      constraint_row.conname
    );
  END LOOP;

  FOR constraint_row IN
    SELECT child_namespace.nspname, child.relname, constraint_definition.conname
    FROM pg_inherits AS inheritance
    JOIN pg_class AS child
      ON child.oid = inheritance.inhrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child.relnamespace
    JOIN pg_constraint AS constraint_definition
      ON constraint_definition.conrelid = child.oid
    WHERE inheritance.inhparent = 'public.etax_submissions'::REGCLASS
      AND constraint_definition.contype = 'c'
      AND constraint_definition.conislocal
      AND pg_get_constraintdef(constraint_definition.oid) LIKE '%pdf_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      constraint_row.nspname,
      constraint_row.relname,
      constraint_row.conname
    );
  END LOOP;
END;
$constraints$;

ALTER TABLE public.etax_submissions
  ADD CONSTRAINT etax_submissions_pdf_status_check CHECK (
    pdf_status IS NULL
    OR pdf_status IN (
      'pending',
      'processing',
      'ready',
      'downloading',
      'downloaded',
      'failed'
    )
  );

CREATE OR REPLACE FUNCTION public.rpc_etax_auto_submit(
  p_invoice_id UUID,
  p_document_type public.etax_document_type DEFAULT 'T01'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org_id UUID;
  v_invoice public.invoices%ROWTYPE;
  v_net NUMERIC;
  v_vat NUMERIC;
  v_gross NUMERIC;
  v_buyer_name TEXT;
  v_buyer_tax TEXT;
  v_sub_id UUID;
BEGIN
  IF NOT (
    public.has_app_role('finance')
    OR public.has_app_role('admin')
    OR public.is_governance_role()
  ) THEN
    RAISE EXCEPTION
      'Forbidden: rpc_etax_auto_submit requires FINANCE or ADMIN role';
  END IF;

  v_org_id := public.get_user_org_id();

  SELECT invoice.*
    INTO v_invoice
    FROM public.invoices AS invoice
   WHERE invoice.id = p_invoice_id
     AND invoice.org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;

  IF lower(v_invoice.status::TEXT) <> 'paid' THEN
    RAISE EXCEPTION
      'Invoice % must be in paid status to submit eTax (current: %)',
      p_invoice_id,
      v_invoice.status;
  END IF;

  SELECT vat.net_amount, vat.vat_amount, vat.gross_amount
    INTO v_net, v_vat, v_gross
    FROM public._compute_etax_vat(
      COALESCE(v_invoice.total, 0),
      0.0700
    ) AS vat;

  SELECT customer.name, customer.tax_id
    INTO v_buyer_name, v_buyer_tax
    FROM public.customers AS customer
   WHERE customer.customer_id = v_invoice.customer_id;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_invoice_id::TEXT || ':' || p_document_type::TEXT,
      0
    )
  );

  SELECT submission.id
    INTO v_sub_id
    FROM public.etax_submissions AS submission
   WHERE submission.invoice_id = p_invoice_id
     AND submission.document_type = p_document_type::TEXT
   ORDER BY submission.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_sub_id IS NOT NULL THEN
    UPDATE public.etax_submissions AS submission
       SET status = CASE
             WHEN submission.status IN ('failed', 'cancelled') THEN 'queued'
             ELSE submission.status
           END,
           error_detail = CASE
             WHEN submission.status IN ('failed', 'cancelled') THEN NULL
             ELSE submission.error_detail
           END,
           error_message = CASE
             WHEN submission.status IN ('failed', 'cancelled') THEN NULL
             ELSE submission.error_message
           END,
           updated_at = NOW()
     WHERE submission.id = v_sub_id
       AND submission.invoice_id = p_invoice_id
       AND submission.document_type = p_document_type::TEXT;
  ELSE
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
      v_org_id,
      p_invoice_id,
      p_document_type::TEXT,
      COALESCE(v_invoice.code, v_invoice.invoice_code),
      COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE),
      v_net,
      v_vat,
      v_gross,
      0.0700,
      v_buyer_name,
      v_buyer_tax,
      'queued',
      auth.uid()
    )
    RETURNING id INTO v_sub_id;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id,
    'invoice_id', p_invoice_id,
    'document_type', p_document_type,
    'document_number', COALESCE(v_invoice.code, v_invoice.invoice_code),
    'document_date', COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE),
    'net_amount', v_net,
    'vat_amount', v_vat,
    'gross_amount', v_gross,
    'status', 'queued',
    'created_at', NOW()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_etax_auto_submit(
  UUID,
  public.etax_document_type
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_auto_submit(
  UUID,
  public.etax_document_type
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_etax_mark_submitted(
  UUID,
  TEXT,
  TEXT,
  TEXT
);
DROP FUNCTION IF EXISTS public.rpc_etax_mark_submitted(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);

CREATE FUNCTION public.rpc_etax_mark_submitted(
  p_submission_id UUID,
  p_rd_ref_no TEXT,
  p_rd_response_code TEXT DEFAULT '200',
  p_xml_payload TEXT DEFAULT NULL,
  p_pdf_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  claims JSONB := COALESCE(
    NULLIF(current_setting('request.jwt.claims', TRUE), ''),
    '{}'
  )::JSONB;
BEGIN
  IF claims ->> 'role' IS DISTINCT FROM 'service_role'
     AND NOT public.has_app_role('admin')
     AND NOT public.is_governance_role() THEN
    RAISE EXCEPTION
      'Forbidden: rpc_etax_mark_submitted requires service role or ADMIN';
  END IF;

  IF NULLIF(p_rd_ref_no, '') IS NULL THEN
    RAISE EXCEPTION 'rd_ref_no is required to mark submission as submitted';
  END IF;

  UPDATE public.etax_submissions AS submission
     SET status = 'submitted',
         rd_ref_no = p_rd_ref_no,
         rd_response_code = p_rd_response_code,
         xml_payload = COALESCE(p_xml_payload, submission.xml_payload),
         pdf_path = COALESCE(p_pdf_path, submission.pdf_path),
         submitted_at = NOW(),
         last_attempt_at = NOW(),
         error_detail = NULL,
         error_message = NULL,
         updated_at = NOW()
   WHERE submission.id = p_submission_id
     AND submission.status = 'submitting';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Submission % not found or not in submitting state',
      p_submission_id;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'status', 'submitted',
    'rd_ref_no', p_rd_ref_no,
    'rd_response_code', p_rd_response_code,
    'submitted_at', NOW()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_etax_mark_submitted(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_etax_mark_submitted(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_etax_mark_submitted(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
  'Canonical worker completion RPC. One backward-compatible five-argument '
  'signature replaces the ambiguous 0181/0182 overload pair. Repaired 20270311.';

COMMIT;
