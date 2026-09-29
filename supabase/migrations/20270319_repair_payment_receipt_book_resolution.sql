-- Migration 0177 was authored before the canonical multi-book table landed in
-- 0179.  Its trigger still queried the removed book_registry.is_default column.
-- Resolve the active internal book deterministically against the final schema.

-- The modern chart_of_accounts and the legacy ledger_account catalogue use
-- the same account_code column on journal_line.  Keep the accounting aliases
-- used by the invoice/payment modules present in the legacy catalogue too.
INSERT INTO public.ledger_account (code, name, type, active)
VALUES
  ('1100', 'Cash/Bank', 'asset', TRUE),
  ('1200', 'Accounts Receivable', 'asset', TRUE),
  ('2200', 'VAT Payable', 'liability', TRUE),
  ('4100', 'Sales Revenue', 'revenue', TRUE)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_post_payment_receipt_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_org_id UUID;
  v_book_id TEXT;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_entry_id UUID;
  v_new_paid NUMERIC(12,2);
  v_new_remaining NUMERIC(12,2);
  v_new_status public.invoice_status;
  v_desc TEXT;
  v_total_debit NUMERIC(12,2);
  v_total_credit NUMERIC(12,2);
BEGIN
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE invoice_id = NEW.invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_receipt trigger: invoice % not found', NEW.invoice_id;
  END IF;

  IF lower(v_inv.status::TEXT) NOT IN ('approved', 'partial') THEN
    RAISE EXCEPTION
      'Cannot record payment: invoice % has status %. Must be APPROVED or PARTIAL.',
      v_inv.invoice_id, v_inv.status;
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_inv.org_id THEN
    RAISE EXCEPTION
      'Cannot record payment: invoice % belongs to org %, not org %',
      v_inv.invoice_id, v_inv.org_id, NEW.org_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_org_id := v_inv.org_id;
  NEW.org_id := v_org_id;

  SELECT registry.book_id
  INTO v_book_id
  FROM public.book_registry registry
  WHERE registry.org_id = v_org_id
    AND registry.is_active
  ORDER BY (registry.book_id = 'internal') DESC, registry.created_at, registry.book_id
  LIMIT 1;
  v_book_id := COALESCE(v_book_id, 'internal');

  v_cash_account_id := public._get_account_id(v_org_id, '1100');
  v_ar_account_id := public._get_account_id(v_org_id, '1200');

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 1100 (Cash/Bank) not found for org %',
      v_org_id;
  END IF;
  IF v_ar_account_id IS NULL THEN
    RAISE EXCEPTION
      'Auto-journal failed: account code 1200 (Accounts Receivable) not found for org %',
      v_org_id;
  END IF;

  v_desc := format(
    'Payment received — Invoice %s | Method: %s | Ref: %s',
    v_inv.invoice_code,
    NEW.method,
    COALESCE(NEW.reference_no, 'N/A')
  );

  INSERT INTO public.journal_entry (
    org_id,
    book_id,
    entry_date,
    description,
    source_type,
    source_id,
    created_by,
    status
  )
  VALUES (
    v_org_id,
    v_book_id,
    COALESCE(NEW.received_at::DATE, CURRENT_DATE),
    v_desc,
    'payment_receipt',
    NEW.id,
    NEW.created_by,
    'posted'
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_line (
    journal_entry_id, org_id, account_code, account_id,
    debit, credit, base_debit, base_credit, description
  ) VALUES (
    v_entry_id, v_org_id, '1100', v_cash_account_id,
    NEW.amount, 0, NEW.amount, 0,
    format('Cash/Bank received — %s', COALESCE(NEW.reference_no, 'no reference'))
  );

  INSERT INTO public.journal_line (
    journal_entry_id, org_id, account_code, account_id,
    debit, credit, base_debit, base_credit, description
  ) VALUES (
    v_entry_id, v_org_id, '1200', v_ar_account_id,
    0, NEW.amount, 0, NEW.amount,
    format('Accounts Receivable — Invoice %s', v_inv.invoice_code)
  );

  SELECT COALESCE(SUM(line.debit), 0), COALESCE(SUM(line.credit), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_line line
  WHERE line.journal_entry_id = v_entry_id;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION
      'Double-entry balance violation: debit=% credit=% for entry %',
      v_total_debit, v_total_credit, v_entry_id;
  END IF;

  NEW.journal_entry_id := v_entry_id;

  SELECT COALESCE(SUM(receipt.amount), 0) + NEW.amount
  INTO v_new_paid
  FROM public.payment_receipt receipt
  WHERE receipt.invoice_id = NEW.invoice_id;

  v_new_remaining := GREATEST(0, COALESCE(v_inv.total, 0) - v_new_paid);
  v_new_status := CASE
    WHEN v_new_remaining <= 0.005 THEN 'paid'::public.invoice_status
    WHEN v_new_paid > 0 THEN 'partial'::public.invoice_status
    ELSE v_inv.status
  END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = v_new_status,
      paid_at = CASE
        WHEN v_new_status = 'paid'::public.invoice_status THEN NOW()
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE invoice_id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

-- Recreate the void RPC so reversal lines satisfy the final tenant/accounting
-- contract (org_id and account_code are both NOT NULL after Migration 0190).
CREATE OR REPLACE FUNCTION public.rpc_void_payment_receipt(
  p_receipt_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_receipt public.payment_receipt%ROWTYPE;
  v_inv public.invoices%ROWTYPE;
  v_reversal_id UUID;
  v_new_paid NUMERIC(12,2);
  v_new_remaining NUMERIC(12,2);
  v_new_status public.invoice_status;
BEGIN
  IF NOT (
    public.has_app_role('admin')
    OR public.has_app_role('executive_owner')
  ) THEN
    RAISE EXCEPTION 'Forbidden: rpc_void_payment_receipt requires ADMIN role';
  END IF;

  v_org_id := public.get_user_org_id();

  SELECT * INTO v_receipt
  FROM public.payment_receipt
  WHERE id = p_receipt_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment receipt % not found or access denied', p_receipt_id;
  END IF;
  IF v_receipt.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Payment receipt % has no journal entry to reverse', p_receipt_id;
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE invoice_id = v_receipt.invoice_id;

  INSERT INTO public.journal_entry (
    org_id, book_id, entry_date, description, source_type, source_id,
    created_by, status, reversal_of
  )
  SELECT
    entry.org_id,
    entry.book_id,
    CURRENT_DATE,
    format(
      'REVERSAL: %s | Reason: %s',
      entry.description,
      COALESCE(p_reason, 'Voided by admin')
    ),
    'payment_void',
    p_receipt_id,
    auth.uid(),
    'posted',
    v_receipt.journal_entry_id
  FROM public.journal_entry entry
  WHERE entry.id = v_receipt.journal_entry_id
  RETURNING id INTO v_reversal_id;

  INSERT INTO public.journal_line (
    journal_entry_id, org_id, account_code, account_id,
    debit, credit, base_debit, base_credit, description
  )
  SELECT
    v_reversal_id,
    line.org_id,
    line.account_code,
    line.account_id,
    line.credit,
    line.debit,
    line.base_credit,
    line.base_debit,
    format('REVERSAL: %s', line.description)
  FROM public.journal_line line
  WHERE line.journal_entry_id = v_receipt.journal_entry_id;

  v_new_paid := GREATEST(0, COALESCE(v_inv.paid_amount, 0) - v_receipt.amount);
  v_new_remaining := GREATEST(0, COALESCE(v_inv.total, 0) - v_new_paid);
  v_new_status := CASE
    WHEN v_new_paid <= 0 THEN 'approved'::public.invoice_status
    WHEN v_new_remaining > 0.005 THEN 'partial'::public.invoice_status
    ELSE v_inv.status
  END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      remaining_amount = v_new_remaining,
      status = v_new_status,
      paid_at = NULL,
      updated_at = NOW()
  WHERE invoice_id = v_receipt.invoice_id;

  RETURN jsonb_build_object(
    'voided_receipt_id', p_receipt_id,
    'reversal_entry_id', v_reversal_id,
    'invoice_id', v_receipt.invoice_id,
    'amount_reversed', v_receipt.amount,
    'new_paid_amount', v_new_paid,
    'new_remaining', v_new_remaining,
    'new_invoice_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_void_payment_receipt(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_void_payment_receipt(UUID, TEXT)
  TO authenticated;

CREATE OR REPLACE VIEW public.v_invoice_payment_status
WITH (security_invoker = true)
AS
SELECT
  invoice.invoice_id,
  invoice.invoice_code,
  invoice.org_id,
  invoice.status AS invoice_status,
  COALESCE(invoice.total, 0) AS total_amount,
  COALESCE(invoice.paid_amount, 0) AS paid_amount,
  COALESCE(invoice.remaining_amount, invoice.total) AS remaining_amount,
  COALESCE(invoice.paid_amount, 0) / NULLIF(invoice.total, 0) AS payment_pct,
  invoice.due_date,
  invoice.paid_at,
  CASE
    WHEN lower(invoice.status::TEXT) = 'paid' THEN 'FULLY_PAID'
    WHEN COALESCE(invoice.paid_amount, 0) > 0 THEN 'PARTIAL'
    WHEN invoice.due_date < CURRENT_DATE
      AND lower(invoice.status::TEXT) NOT IN ('paid', 'cancelled', 'voided')
      THEN 'OVERDUE'
    ELSE 'PENDING'
  END AS payment_state,
  COUNT(receipt.id)::INT AS receipt_count,
  MAX(receipt.received_at) AS last_payment_at
FROM public.invoices invoice
LEFT JOIN public.payment_receipt receipt
  ON receipt.invoice_id = invoice.invoice_id
 AND receipt.org_id = invoice.org_id
WHERE invoice.org_id = public.get_user_org_id()
GROUP BY
  invoice.invoice_id,
  invoice.invoice_code,
  invoice.org_id,
  invoice.status,
  invoice.total,
  invoice.paid_amount,
  invoice.remaining_amount,
  invoice.due_date,
  invoice.paid_at;

REVOKE ALL ON public.v_invoice_payment_status FROM PUBLIC, anon;
GRANT SELECT ON public.v_invoice_payment_status TO authenticated;

-- Stable ordering is required when OFFSET pagination crosses equal due dates.
CREATE OR REPLACE FUNCTION public.rpc_list_overdue_invoices(
  p_include_due_soon BOOLEAN DEFAULT TRUE,
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
  v_today DATE := CURRENT_DATE;
BEGIN
  IF NOT (
    public.has_app_role('finance')
    OR public.has_app_role('admin')
    OR public.has_app_role('designer')
    OR public.is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires at least DESIGNER role';
  END IF;

  v_org_id := public.get_user_org_id();

  SELECT jsonb_agg(page.row_data ORDER BY page.days_overdue DESC, page.invoice_id)
  INTO v_result
  FROM (
    SELECT
      invoice.invoice_id,
      (v_today - invoice.due_date::DATE)::INT AS days_overdue,
      jsonb_build_object(
        'invoice_id', invoice.invoice_id,
        'invoice_code', invoice.invoice_code,
        'customer_name', COALESCE(customer.name, 'Unknown'),
        'due_date', invoice.due_date,
        'days_overdue', (v_today - invoice.due_date::DATE)::INT,
        'total_amount', invoice.total,
        'paid_amount', COALESCE(invoice.paid_amount, 0),
        'remaining_amount', invoice.remaining_amount,
        'payment_pct', ROUND(
          COALESCE(invoice.paid_amount, 0) / NULLIF(invoice.total, 0) * 100,
          1
        ),
        'invoice_status', invoice.status,
        'notification_count', (
          SELECT COUNT(*)
          FROM public.invoice_notifications notification
          WHERE notification.invoice_id = invoice.invoice_id
            AND notification.org_id = invoice.org_id
        ),
        'last_notification', (
          SELECT jsonb_build_object(
            'type', notification.notification_type,
            'status', notification.status,
            'created_at', notification.created_at
          )
          FROM public.invoice_notifications notification
          WHERE notification.invoice_id = invoice.invoice_id
          ORDER BY notification.created_at DESC, notification.id
          LIMIT 1
        )
      ) AS row_data
    FROM public.invoices invoice
    LEFT JOIN public.customers customer
      ON customer.customer_id = invoice.customer_id
    WHERE invoice.org_id = v_org_id
      AND invoice.remaining_amount > 0
      AND lower(invoice.status::TEXT) NOT IN ('paid', 'cancelled', 'voided')
      AND (
        invoice.due_date < v_today
        OR (
          p_include_due_soon
          AND invoice.due_date BETWEEN v_today AND v_today + 7
        )
      )
    ORDER BY (v_today - invoice.due_date::DATE) DESC, invoice.invoice_id
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    OFFSET GREATEST(p_offset, 0)
  ) page;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_list_overdue_invoices(BOOLEAN, INT, INT)
  TO authenticated;
