-- =============================================================================
-- Migration: RPC contract repairs for partitioning and enum drift
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_record_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice public.invoices%ROWTYPE;
  v_new_remaining NUMERIC;
  v_payment_id UUID := gen_random_uuid();
BEGIN
  PERFORM public.fn_verify_org_claim();
  v_org_id := COALESCE(p_org_id, public.get_user_org_id());
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_record_payment: caller has no active org membership';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.org_id = v_org_id
      AND om.role IN ('FINANCE', 'ADMIN', 'OWNER') AND om.is_active
  ) THEN
    RAISE EXCEPTION 'rpc_record_payment: insufficient privileges for org %', v_org_id;
  END IF;

  SELECT * INTO STRICT v_invoice
  FROM public.invoices i
  WHERE i.invoice_id = p_invoice_id AND i.org_id = v_org_id;

  v_new_remaining := v_invoice.remaining_amount - p_amount;
  INSERT INTO public.invoice_payments (
    payment_id, invoice_id, org_id, amount, method, reference, paid_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_org_id, p_amount,
    p_method::public.payment_method, p_reference, now()
  );

  UPDATE public.invoices i
  SET remaining_amount = v_new_remaining,
      status = CASE WHEN v_new_remaining <= 0
                    THEN 'PAID'::public.invoice_status
                    ELSE 'PARTIAL'::public.invoice_status END
  WHERE i.invoice_id = p_invoice_id AND i.org_id = v_org_id;

  UPDATE public.jobs j SET updated_at = now()
  WHERE j.job_id = v_invoice.job_id AND j.org_id = v_org_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'new_remaining', v_new_remaining,
    'invoice_status', CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
  );
END;
$$;

-- Partitioned tables cannot enforce a unique constraint that omits the
-- partition key, so ON CONFLICT(invoice_id, document_type) is invalid. Serialize
-- each business key and perform an explicit update-or-insert instead.
CREATE OR REPLACE FUNCTION public.rpc_etax_auto_submit(
  p_invoice_id UUID,
  p_document_type public.etax_document_type DEFAULT 'T01'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT (public.has_app_role('finance') OR public.has_app_role('admin')
          OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: rpc_etax_auto_submit requires FINANCE or ADMIN role';
  END IF;
  v_org_id := public.get_user_org_id();

  SELECT * INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id AND i.org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found or access denied', p_invoice_id;
  END IF;
  IF v_invoice.status::text <> 'paid' THEN
    RAISE EXCEPTION 'Invoice % must be in paid status to submit eTax (current: %)',
      p_invoice_id, v_invoice.status;
  END IF;

  SELECT vat.net_amount, vat.vat_amount, vat.gross_amount
  INTO v_net, v_vat, v_gross
  FROM public._compute_etax_vat(COALESCE(v_invoice.total, 0), 0.0700) vat;

  SELECT c.name, c.tax_id INTO v_buyer_name, v_buyer_tax
  FROM public.customers c WHERE c.customer_id = v_invoice.customer_id;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_invoice_id::text || ':' || p_document_type::text, 0)
  );

  SELECT s.id INTO v_sub_id
  FROM public.etax_submissions s
  WHERE s.invoice_id = p_invoice_id
    AND s.document_type = p_document_type::text
  ORDER BY s.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sub_id IS NOT NULL THEN
    UPDATE public.etax_submissions s
    SET status = CASE WHEN s.status IN ('failed', 'cancelled')
                      THEN 'queued' ELSE s.status END,
        updated_at = now()
    WHERE s.id = v_sub_id
      AND s.invoice_id = p_invoice_id
      AND s.document_type = p_document_type::text;
  ELSE
    INSERT INTO public.etax_submissions (
      org_id, invoice_id, document_type, document_number, document_date,
      net_amount, vat_amount, gross_amount, vat_rate, buyer_name, buyer_tax_id,
      status, created_by
    ) VALUES (
      v_org_id, p_invoice_id, p_document_type::text, v_invoice.code,
      COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE), v_net, v_vat, v_gross,
      0.0700, v_buyer_name, v_buyer_tax, 'queued', auth.uid()
    ) RETURNING id INTO v_sub_id;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'invoice_id', p_invoice_id,
    'document_type', p_document_type, 'document_number', v_invoice.code,
    'document_date', COALESCE(v_invoice.paid_at::DATE, CURRENT_DATE),
    'net_amount', v_net, 'vat_amount', v_vat, 'gross_amount', v_gross,
    'status', 'queued', 'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_etax_list_submissions(
  p_status public.etax_submission_status DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
BEGIN
  IF NOT (public.has_app_role('finance') OR public.has_app_role('admin')
          OR public.has_app_role('designer') OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: requires at least DESIGNER role';
  END IF;
  v_org_id := public.get_user_org_id();

  SELECT jsonb_agg(list_row.row_data ORDER BY list_row.document_date DESC)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'submission_id', s.id, 'invoice_id', s.invoice_id,
      'document_type', s.document_type, 'document_number', s.document_number,
      'document_date', s.document_date, 'buyer_name', s.buyer_name,
      'net_amount', s.net_amount, 'vat_amount', s.vat_amount,
      'gross_amount', s.gross_amount, 'status', s.status,
      'rd_ref_no', s.rd_ref_no, 'attempt_count', s.attempt_count,
      'last_attempt_at', s.last_attempt_at, 'submitted_at', s.submitted_at,
      'error_detail', s.error_detail, 'pdf_path', s.pdf_path,
      'created_at', s.created_at
    ) AS row_data, s.document_date
    FROM public.etax_submissions s
    WHERE s.org_id = v_org_id
      AND (p_status IS NULL OR s.status = p_status::text)
      AND (p_from_date IS NULL OR s.document_date >= p_from_date)
      AND (p_to_date IS NULL OR s.document_date <= p_to_date)
    ORDER BY s.document_date DESC
    LIMIT p_limit OFFSET p_offset
  ) AS list_row;
  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_outbound_mark_failed(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_count INT4;
  v_new_status public.line_oa_outbound_status;
BEGIN
  UPDATE public.line_oa_outbound_messages m
  SET retried_count = m.retried_count + 1,
      status = CASE WHEN m.retried_count + 1 >= 3
                    THEN 'dead'::public.line_oa_outbound_status
                    ELSE 'failed'::public.line_oa_outbound_status END
  WHERE m.id = p_id AND m.status = 'pending'
  RETURNING m.retried_count, m.status INTO v_new_count, v_new_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'id', p_id,
      'reason', 'lost_race_or_not_found', 'retried_count', NULL, 'status', NULL);
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id,
    'status', v_new_status, 'retried_count', v_new_count);
END;
$$;

COMMIT;
