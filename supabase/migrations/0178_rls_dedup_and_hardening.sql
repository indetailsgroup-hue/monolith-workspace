-- Migration: 0178_rls_dedup_and_hardening.sql
-- Description: Add org_id + proper multi-tenant RLS to jobs/quotations/invoices (0172 fix)
-- Depends on: 0172_jobs_quotations_invoices.sql
-- Author: indetailsgroup
-- Date: 2026-08-28
-- ADR: Multi-Tenant Isolation — all tables must scope by org_id (ARCHITECTURE.md §2)
--
-- This migration:
--   1. Adds org_id to customer, job, job_panel, quotation, quotation_line, invoice, invoice_payment
--   2. Replaces permissive RLS policies with org-scoped policies
--   3. Fixes RPC functions to filter by org_id
--   4. Fixes invoice_code and job_code uniqueness per tenant
--   5. Adds missing updated_at triggers

-- ============================================================================
-- HELPER: get_user_org_id()
-- Returns the org_id of the authenticated user (from JWT / org_members).
-- Must exist from earlier migration (multi_tenant_schema / C12).
-- ============================================================================

-- Verify dependency exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_user_org_id'
  ) THEN
    RAISE EXCEPTION 'get_user_org_id() not found — run 20260828_multi_tenant_schema.sql first';
  END IF;
END
$$;

-- ============================================================================
-- STEP 1: Add org_id columns to all affected tables
-- ============================================================================

-- customer
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
  -- NOTE: DEFAULT gen_random_uuid() ใช้แค่ตอน migrate existing rows
  -- production: ต้องอัปเดตด้วย org_id จริงก่อน DROP DEFAULT

-- จะ set default จริงในภายหลัง (backfill script) — ลบ default หลัง backfill
-- ALTER TABLE public.customers ALTER COLUMN org_id DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(org_id);

-- job
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_jobs_org ON public.jobs(org_id);

-- job_panel (ใช้ org_id ผ่าน job parent — เพิ่มเพื่อ RLS ที่ไม่ต้อง join)
ALTER TABLE public.job_panels
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_job_panels_org ON public.job_panels(org_id);

-- quotation
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_quotations_org ON public.quotations(org_id);

-- quotation_line
ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_quotation_lines_org ON public.quotation_lines(org_id);

-- invoice
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);

-- invoice_payment
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_invoice_payments_org ON public.invoice_payments(org_id);

-- ============================================================================
-- STEP 2: Fix job_code uniqueness — unique per tenant, not globally
-- ============================================================================

-- Drop global unique constraint (which also drops the backing index)
-- Cannot use DROP INDEX directly when a constraint backs the index
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_code_key;

-- Add composite unique per tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_org_id_job_code_unique'
  ) THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_org_id_job_code_unique UNIQUE (org_id, job_code);
  END IF;
END $$;

-- quotation_code unique per tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_org_id_code_unique'
  ) THEN
    ALTER TABLE public.quotations ADD CONSTRAINT quotations_org_id_code_unique UNIQUE (org_id, quotation_code);
  END IF;
END $$;

-- invoice_code unique per tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_org_id_code_unique'
  ) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_code_unique UNIQUE (org_id, invoice_code);
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Replace RLS policies with org-scoped versions
-- ============================================================================

-- ── customer ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_customer" ON public.customers;
DROP POLICY IF EXISTS "write_customer" ON public.customers;

CREATE POLICY "customer_select" ON public.customers
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "customer_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin') OR public.has_app_role('designer'))
  );

CREATE POLICY "customer_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin') OR public.has_app_role('designer'))
  );

CREATE POLICY "customer_delete" ON public.customers
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('admin') OR public.is_governance_role())
  );

-- ── job ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_job" ON public.jobs;
DROP POLICY IF EXISTS "write_job" ON public.jobs;

CREATE POLICY "job_select" ON public.jobs
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "job_insert" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('factory') OR public.has_app_role('admin')
         OR public.has_app_role('designer') OR public.is_governance_role())
  );

CREATE POLICY "job_update" ON public.jobs
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('factory') OR public.has_app_role('admin')
         OR public.has_app_role('designer') OR public.is_governance_role())
  );

CREATE POLICY "job_delete" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('admin') OR public.is_governance_role())
  );

-- ── job_panel ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_panel" ON public.job_panels;
DROP POLICY IF EXISTS "write_panel" ON public.job_panels;

CREATE POLICY "job_panel_select" ON public.job_panels
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "job_panel_write" ON public.job_panels
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('factory') OR public.has_app_role('admin')
         OR public.has_app_role('designer'))
  );

-- ── quotation ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_quotation" ON public.quotations;
DROP POLICY IF EXISTS "write_quotation" ON public.quotations;

CREATE POLICY "quotation_select" ON public.quotations
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "quotation_insert" ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

CREATE POLICY "quotation_update" ON public.quotations
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

-- ── quotation_line ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_qt_line" ON public.quotation_lines;
DROP POLICY IF EXISTS "write_qt_line" ON public.quotation_lines;

CREATE POLICY "quotation_line_select" ON public.quotation_lines
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "quotation_line_write" ON public.quotation_lines
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

-- ── invoice ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_invoice" ON public.invoices;
DROP POLICY IF EXISTS "write_invoice" ON public.invoices;

CREATE POLICY "invoice_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "invoice_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

CREATE POLICY "invoice_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

-- ── invoice_payment ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_payment" ON public.invoice_payments;
DROP POLICY IF EXISTS "write_payment" ON public.invoice_payments;

CREATE POLICY "invoice_payment_select" ON public.invoice_payments
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "invoice_payment_write" ON public.invoice_payments
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('finance') OR public.has_app_role('admin'))
  );

-- ============================================================================
-- STEP 4: Fix RPC functions — add org_id filtering
-- ============================================================================

-- ── rpc_approve_quotation (org-scoped) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_approve_quotation(
  p_quotation_id UUID,
  p_due_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qt        quotations%ROWTYPE;
  v_org_id    UUID;
  v_inv_id    UUID;
  v_inv_code  TEXT;
  v_due       DATE;
BEGIN
  -- Auth
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Role check
  IF NOT (public.has_app_role('finance') OR public.has_app_role('admin') OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Fetch quotation scoped to caller's org
  SELECT * INTO v_qt FROM public.quotations
  WHERE quotation_id = p_quotation_id AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_qt.status NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'Cannot approve quotation in % status', v_qt.status;
  END IF;

  v_due    := CURRENT_DATE + p_due_days;
  v_inv_id := gen_random_uuid();

  -- Invoice code unique per org per year
  v_inv_code := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((
    SELECT COALESCE(MAX(SUBSTRING(invoice_code FROM '[0-9]+$')::INT), 0) + 1
    FROM public.invoices
    WHERE org_id = v_org_id  -- ← scoped per tenant
  )::TEXT, 4, '0');

  -- Update quotation
  UPDATE public.quotations SET
    status      = 'APPROVED',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at  = now()
  WHERE quotation_id = p_quotation_id AND org_id = v_org_id;

  -- Create invoice (inherit org_id)
  INSERT INTO public.invoices (
    invoice_id, invoice_code, quotation_id, job_id, customer_id,
    org_id,
    subtotal, vat_rate, vat_amount, discount, total, remaining_amount,
    due_date, created_by
  )
  SELECT
    v_inv_id, v_inv_code, p_quotation_id, v_qt.job_id, v_qt.customer_id,
    v_org_id,
    v_qt.subtotal, v_qt.vat_rate, v_qt.vat_amount, v_qt.discount, v_qt.total, v_qt.total,
    v_due, auth.uid();

  -- Update job (scoped to org)
  IF v_qt.job_id IS NOT NULL THEN
    UPDATE public.jobs SET
      status       = 'QUOTED',
      quotation_id = p_quotation_id,
      invoice_id   = v_inv_id,
      updated_at   = now()
    WHERE job_id = v_qt.job_id AND org_id = v_org_id AND status = 'DRAFT';
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',   v_inv_id,
    'invoice_code', v_inv_code,
    'due_date',     v_due,
    'total',        v_qt.total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_approve_quotation(UUID, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_approve_quotation(UUID, INT) TO authenticated;

-- ── rpc_record_payment (org-scoped) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_record_payment(
  p_invoice_id UUID,
  p_amount     NUMERIC,
  p_method     payment_method DEFAULT 'TRANSFER',
  p_reference  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv           invoices%ROWTYPE;
  v_org_id        UUID;
  v_new_paid      NUMERIC;
  v_new_remaining NUMERIC;
  v_new_status    invoice_status;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_app_role('finance') OR public.has_app_role('admin') OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Fetch invoice scoped to org
  SELECT * INTO v_inv FROM public.invoices
  WHERE invoice_id = p_invoice_id AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.status IN ('PAID', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot record payment for % invoice', v_inv.status;
  END IF;

  -- Insert payment (inherit org_id)
  INSERT INTO public.invoice_payments (invoice_id, org_id, amount, method, reference)
  VALUES (p_invoice_id, v_org_id, p_amount, p_method, p_reference);

  -- Recalculate
  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid
  FROM public.invoice_payments WHERE invoice_id = p_invoice_id AND org_id = v_org_id;

  v_new_remaining := GREATEST(0, v_inv.total - v_new_paid);
  v_new_status    := CASE
    WHEN v_new_remaining <= 0 THEN 'PAID'::invoice_status
    ELSE 'PARTIAL'::invoice_status
  END;

  UPDATE public.invoices SET
    paid_amount      = v_new_paid,
    remaining_amount = v_new_remaining,
    status           = v_new_status
  WHERE invoice_id = p_invoice_id AND org_id = v_org_id;

  -- Auto-transition job (scoped)
  IF v_new_status = 'PAID' AND v_inv.job_id IS NOT NULL THEN
    UPDATE public.jobs SET
      status     = 'INVOICED',
      updated_at = now()
    WHERE job_id = v_inv.job_id AND org_id = v_org_id AND status = 'DELIVERED';
  END IF;

  RETURN jsonb_build_object(
    'paid_amount',      v_new_paid,
    'remaining_amount', v_new_remaining,
    'status',           v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, payment_method, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, payment_method, TEXT) TO authenticated;

-- ── rpc_job_board (org-scoped) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_job_board(
  p_status job_status DEFAULT NULL,
  p_limit  INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.has_app_role('designer') OR public.has_app_role('factory')
       OR public.has_app_role('finance')  OR public.has_app_role('admin')
       OR public.is_governance_role()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_jsonb(j.*) ORDER BY j.updated_at DESC), '[]'::jsonb)
    FROM (
      SELECT j.*, c.name AS customer_name
      FROM public.jobs j
      JOIN public.customers c ON c.customer_id = j.customer_id
      WHERE j.org_id = v_org_id            -- ← scoped per tenant
        AND (p_status IS NULL OR j.status = p_status)
      LIMIT p_limit
    ) j
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_job_board(job_status, INT) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_job_board(job_status, INT) TO authenticated;

-- ============================================================================
-- STEP 5: Missing triggers — invoice & invoice_payment updated_at
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_invoice'
  ) THEN
    CREATE TRIGGER set_updated_at_invoice
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

-- invoice_payment เพิ่ม updated_at column + trigger
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_invoice_payment'
  ) THEN
    CREATE TRIGGER set_updated_at_invoice_payment
      BEFORE UPDATE ON public.invoice_payments
      FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Verification queries (run manually after migration)
-- ============================================================================

-- Verify org_id columns exist:
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND column_name = 'org_id'
-- AND table_name IN ('customers','jobs','job_panels','quotations','quotation_lines','invoices','invoice_payments');

-- Verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('customers','jobs','job_panels','quotations','quotation_lines','invoices','invoice_payments');

-- Verify policies:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('customers','jobs','invoices');
