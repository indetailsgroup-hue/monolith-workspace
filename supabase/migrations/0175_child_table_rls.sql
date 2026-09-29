-- ============================================================================
-- Migration: 0175_child_table_rls.sql
-- Created: 2026-08-28
-- Author: Security audit — v16.8.0 hardening pass (cont.)
--
-- Adds RLS isolation to child tables that inherit org membership from their
-- parent but had no row-level security enforced. 0174 covered:
--   job ✓  quotation ✓  invoice ✓  platform_search_logs ✓
--
-- This migration covers the remaining child tables:
--   job_panel       — child of job       (org scope via job.org_id)
--   quotation_line  — child of quotation (org scope via quotation.org_id)
--   invoice_payment — child of invoice   (org scope via invoice.org_id)
--
-- Pattern: child tables do not carry their own org_id column. Instead, RLS
-- uses an EXISTS sub-select joining back to the parent table which already
-- has org_id = get_user_org_id() enforced. This avoids denormalising org_id
-- into every child row while still preventing cross-tenant row access.
--
-- Super-admin bypass: an OR EXISTS (SELECT 1 FROM super_admins …) clause is
-- added to every USING / WITH CHECK expression so platform admins retain
-- unrestricted access for support and backfill operations.
-- ============================================================================

-- ============================================================================
-- SECTION 1: job_panel
-- Inherits tenant scope from job.org_id
-- Operations: SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

ALTER TABLE public.job_panels ENABLE ROW LEVEL SECURITY;

-- SELECT: panel belongs to a job the caller can see
DROP POLICY IF EXISTS "job_panel_org_select" ON public.job_panels;
CREATE POLICY "job_panel_org_select" ON public.job_panels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.job_id = job_panels.job_id
        AND j.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- INSERT: new panels must be for a job in the caller's org
DROP POLICY IF EXISTS "job_panel_org_insert" ON public.job_panels;
CREATE POLICY "job_panel_org_insert" ON public.job_panels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.job_id = job_panels.job_id
        AND j.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- UPDATE: can only modify panels for jobs in the caller's org
DROP POLICY IF EXISTS "job_panel_org_update" ON public.job_panels;
CREATE POLICY "job_panel_org_update" ON public.job_panels
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.job_id = job_panels.job_id
        AND j.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- DELETE: can only remove panels for jobs in the caller's org
DROP POLICY IF EXISTS "job_panel_org_delete" ON public.job_panels;
CREATE POLICY "job_panel_org_delete" ON public.job_panels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.job_id = job_panels.job_id
        AND j.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- ============================================================================
-- SECTION 2: quotation_line
-- Inherits tenant scope from quotation.org_id
-- Operations: SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "quotation_line_org_select" ON public.quotation_lines;
CREATE POLICY "quotation_line_org_select" ON public.quotation_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.quotation_id = quotation_lines.quotation_id
        AND q.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- INSERT
DROP POLICY IF EXISTS "quotation_line_org_insert" ON public.quotation_lines;
CREATE POLICY "quotation_line_org_insert" ON public.quotation_lines
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.quotation_id = quotation_lines.quotation_id
        AND q.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- UPDATE
DROP POLICY IF EXISTS "quotation_line_org_update" ON public.quotation_lines;
CREATE POLICY "quotation_line_org_update" ON public.quotation_lines
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.quotation_id = quotation_lines.quotation_id
        AND q.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- DELETE
DROP POLICY IF EXISTS "quotation_line_org_delete" ON public.quotation_lines;
CREATE POLICY "quotation_line_org_delete" ON public.quotation_lines
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.quotation_id = quotation_lines.quotation_id
        AND q.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- ============================================================================
-- SECTION 3: invoice_payment
-- Inherits tenant scope from invoice.org_id
-- Operations: SELECT, INSERT, UPDATE, DELETE
-- Note: invoice_payment was created in 0172 but RLS was never enabled.
-- ============================================================================

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "invoice_payment_org_select" ON public.invoice_payments;
CREATE POLICY "invoice_payment_org_select" ON public.invoice_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.invoice_id = invoice_payments.invoice_id
        AND i.org_id = public.get_user_org_id()
    )
    OR public.is_platform_super_admin()
  );

-- INSERT: only finance/admin roles can record payments (role check + org check)
DROP POLICY IF EXISTS "invoice_payment_org_insert" ON public.invoice_payments;
CREATE POLICY "invoice_payment_org_insert" ON public.invoice_payments
  FOR INSERT
  WITH CHECK (
    (
      public.has_app_role('finance') OR public.has_app_role('admin')
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.invoice_id = invoice_payments.invoice_id
          AND i.org_id = public.get_user_org_id()
      )
      OR public.is_platform_super_admin()
    )
  );

-- UPDATE: finance/admin + same org
DROP POLICY IF EXISTS "invoice_payment_org_update" ON public.invoice_payments;
CREATE POLICY "invoice_payment_org_update" ON public.invoice_payments
  FOR UPDATE
  USING (
    (
      public.has_app_role('finance') OR public.has_app_role('admin')
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.invoice_id = invoice_payments.invoice_id
          AND i.org_id = public.get_user_org_id()
      )
      OR public.is_platform_super_admin()
    )
  );

-- DELETE: admin only + same org
DROP POLICY IF EXISTS "invoice_payment_org_delete" ON public.invoice_payments;
CREATE POLICY "invoice_payment_org_delete" ON public.invoice_payments
  FOR DELETE
  USING (
    public.has_app_role('admin')
    AND (
      EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.invoice_id = invoice_payments.invoice_id
          AND i.org_id = public.get_user_org_id()
      )
      OR public.is_platform_super_admin()
    )
  );

-- ============================================================================
-- SECTION 4: Verify RLS is now enabled on all tables touched in 0174 + 0175
-- (Idempotent — safe to re-run)
-- ============================================================================

ALTER TABLE public.jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_panels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- END OF MIGRATION 0175
-- ============================================================================
-- Closure criteria:
--   [ ] SELECT on job_panel with a cross-tenant job_id returns 0 rows
--   [ ] INSERT into quotation_line with a cross-tenant quotation_id is rejected
--   [ ] invoice_payment INSERT blocked for viewer-role caller
--   [ ] super_admin can SELECT all rows across all child tables
--   [ ] CI migration tests pass on a fresh database
-- ============================================================================
