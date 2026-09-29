-- Migration: 0172_jobs_quotations_invoices.sql
-- Description: Job lifecycle, quotation, and invoice tables for MONOLITH Manufacturing OS
-- Author: indetailsgroup
-- Date: 2026-08-27

-- ============================================================================
-- ENUM Types
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM (
    'DRAFT', 'QUOTED', 'APPROVED', 'IN_PRODUCTION', 'QC', 'DELIVERED', 'INVOICED', 'CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('TRANSFER', 'CASH', 'CHEQUE', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Customers Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_name ON public.customers(name);

-- ============================================================================
-- Jobs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(customer_id),
  status job_status NOT NULL DEFAULT 'DRAFT',
  priority job_priority NOT NULL DEFAULT 'NORMAL',
  assigned_to UUID,  -- references auth.users
  deadline DATE,
  material_group TEXT NOT NULL DEFAULT 'MDF 18mm White',
  total_panel_count INT NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(12,2),
  quotation_id UUID,
  invoice_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL  -- references auth.users
);

CREATE INDEX IF NOT EXISTS idx_job_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_customer ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_code ON public.jobs(job_code);
CREATE INDEX IF NOT EXISTS idx_job_deadline ON public.jobs(deadline);

-- ============================================================================
-- Job Panels Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_panels (
  panel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  material TEXT NOT NULL,
  width_mm NUMERIC(8,2) NOT NULL,
  height_mm NUMERIC(8,2) NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  is_curved BOOLEAN NOT NULL DEFAULT false,
  arc_radius NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_panel_job ON public.job_panels(job_id);

-- ============================================================================
-- Quotations Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quotations (
  quotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_code TEXT NOT NULL UNIQUE,
  job_id UUID REFERENCES public.jobs(job_id),
  customer_id UUID NOT NULL REFERENCES public.customers(customer_id),
  status quotation_status NOT NULL DEFAULT 'DRAFT',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,4) NOT NULL DEFAULT 0.07,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  terms TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID
);

CREATE INDEX IF NOT EXISTS idx_quotation_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_customer ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotation_job ON public.quotations(job_id);

-- ============================================================================
-- Quotation Line Items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quotation_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(quotation_id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  material TEXT,
  dimensions TEXT,
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_curved BOOLEAN DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotation_line_qt ON public.quotation_lines(quotation_id);

-- ============================================================================
-- Invoices Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_code TEXT NOT NULL UNIQUE,
  quotation_id UUID REFERENCES public.quotations(quotation_id),
  job_id UUID REFERENCES public.jobs(job_id),
  customer_id UUID NOT NULL REFERENCES public.customers(customer_id),
  status invoice_status NOT NULL DEFAULT 'PENDING',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,4) NOT NULL DEFAULT 0.07,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_job ON public.invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoice_due ON public.invoices(due_date);

-- ============================================================================
-- Invoice Payments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(invoice_id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method payment_method NOT NULL DEFAULT 'TRANSFER',
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_invoice ON public.invoice_payments(invoice_id);

-- ============================================================================
-- RPC: Approve Quotation (atomic: update quotation + create invoice + update job)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_approve_quotation(
  p_quotation_id UUID,
  p_due_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qt public.quotations%ROWTYPE;
  v_inv_id UUID;
  v_inv_code TEXT;
  v_due DATE;
BEGIN
  -- Check caller role
  IF NOT (has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role';
  END IF;

  SELECT * INTO v_qt FROM public.quotations WHERE quotation_id = p_quotation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;
  IF v_qt.status NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'Cannot approve quotation in % status', v_qt.status;
  END IF;

  v_due := CURRENT_DATE + p_due_days;
  v_inv_id := gen_random_uuid();
  v_inv_code := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((
    SELECT COALESCE(MAX(SUBSTRING(invoice_code FROM '[0-9]+$')::INT), 0) + 1
    FROM public.invoices
  )::TEXT, 4, '0');

  -- Update quotation
  UPDATE public.quotations SET
    status = 'APPROVED',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE quotation_id = p_quotation_id;

  -- Create invoice
  INSERT INTO public.invoices (invoice_id, invoice_code, quotation_id, job_id, customer_id, subtotal, vat_rate, vat_amount, discount, total, remaining_amount, due_date, created_by)
  SELECT v_inv_id, v_inv_code, p_quotation_id, v_qt.job_id, v_qt.customer_id, v_qt.subtotal, v_qt.vat_rate, v_qt.vat_amount, v_qt.discount, v_qt.total, v_qt.total, v_due, auth.uid();

  -- Copy line items to invoice (stored as quotation_line, referenced via quotation_id→invoice.quotation_id)

  -- Update job status if linked
  IF v_qt.job_id IS NOT NULL THEN
    UPDATE public.jobs SET
      status = 'QUOTED',
      quotation_id = p_quotation_id,
      invoice_id = v_inv_id,
      updated_at = now()
    WHERE job_id = v_qt.job_id AND status = 'DRAFT';
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_inv_id,
    'invoice_code', v_inv_code,
    'due_date', v_due,
    'total', v_qt.total
  );
END;
$$;

-- ============================================================================
-- RPC: Record Payment (atomic: insert payment + update invoice status)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_record_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_method payment_method DEFAULT 'TRANSFER',
  p_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_new_paid NUMERIC;
  v_new_remaining NUMERIC;
  v_new_status invoice_status;
BEGIN
  IF NOT (has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE invoice_id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_inv.status IN ('PAID', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot record payment for % invoice', v_inv.status;
  END IF;

  -- Insert payment
  INSERT INTO public.invoice_payments (invoice_id, amount, method, reference)
  VALUES (p_invoice_id, p_amount, p_method, p_reference);

  -- Recalculate totals
  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM public.invoice_payments WHERE invoice_id = p_invoice_id;
  v_new_remaining := GREATEST(0, v_inv.total - v_new_paid);
  v_new_status := CASE WHEN v_new_remaining <= 0 THEN 'PAID'::invoice_status ELSE 'PARTIAL'::invoice_status END;

  UPDATE public.invoices SET
    paid_amount = v_new_paid,
    remaining_amount = v_new_remaining,
    status = v_new_status
  WHERE invoice_id = p_invoice_id;

  -- If fully paid and job linked, transition job to INVOICED
  IF v_new_status = 'PAID' AND v_inv.job_id IS NOT NULL THEN
    UPDATE public.jobs SET status = 'INVOICED', updated_at = now()
    WHERE job_id = v_inv.job_id AND status = 'DELIVERED';
  END IF;

  RETURN jsonb_build_object(
    'paid_amount', v_new_paid,
    'remaining_amount', v_new_remaining,
    'status', v_new_status
  );
END;
$$;

-- ============================================================================
-- RPC: Get Job Board (dashboard query)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_job_board(
  p_status job_status DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF NOT (has_app_role('designer') OR has_app_role('factory') OR has_app_role('finance') OR has_app_role('admin') OR is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT jsonb_agg(row_to_jsonb(j.*) ORDER BY j.updated_at DESC)
    FROM (
      SELECT jb.*, c.name AS customer_name
      FROM public.jobs jb
      JOIN public.customers c ON c.customer_id = jb.customer_id
      WHERE (p_status IS NULL OR jb.status = p_status)
      LIMIT p_limit
    ) j
  );
END;
$$;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read jobs/customers (role filtering done at app level)
CREATE POLICY "authenticated_read_customer" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_job" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_panel" ON public.job_panels FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_quotation" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_qt_line" ON public.quotation_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_invoice" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_payment" ON public.invoice_payments FOR SELECT TO authenticated USING (true);

-- Write: only FINANCE + ADMIN + DESIGNER (for job creation)
CREATE POLICY "write_customer" ON public.customers FOR ALL TO authenticated
  USING (has_app_role('finance') OR has_app_role('admin') OR has_app_role('designer'));
CREATE POLICY "write_job" ON public.jobs FOR ALL TO authenticated
  USING (has_app_role('factory') OR has_app_role('admin') OR has_app_role('designer'));
CREATE POLICY "write_panel" ON public.job_panels FOR ALL TO authenticated
  USING (has_app_role('factory') OR has_app_role('admin') OR has_app_role('designer'));
CREATE POLICY "write_quotation" ON public.quotations FOR ALL TO authenticated
  USING (has_app_role('finance') OR has_app_role('admin'));
CREATE POLICY "write_qt_line" ON public.quotation_lines FOR ALL TO authenticated
  USING (has_app_role('finance') OR has_app_role('admin'));
CREATE POLICY "write_invoice" ON public.invoices FOR ALL TO authenticated
  USING (has_app_role('finance') OR has_app_role('admin'));
CREATE POLICY "write_payment" ON public.invoice_payments FOR ALL TO authenticated
  USING (has_app_role('finance') OR has_app_role('admin'));

-- ============================================================================
-- Realtime subscriptions (for Job Board live updates)
-- ============================================================================

DO $pub$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs; EXCEPTION WHEN OTHERS THEN NULL; END $pub$;
DO $pub$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices; EXCEPTION WHEN OTHERS THEN NULL; END $pub$;

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_customer BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_job BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_quotation BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
