-- ============================================================================
-- Rollback: 0175_rollback.sql
-- ⚠️  FOR CI IDEMPOTENCY TESTING ONLY — DO NOT RUN ON PRODUCTION ⚠️
-- Purpose : Fully reverse all changes made by 0175_child_table_rls.sql
--           so that 0175 can be cleanly re-applied on the same database.
-- Coverage: Drops all 12 RLS policies across three child tables and
--           disables Row Level Security on each.
-- Tables  : job_panel (4 policies), quotation_line (4 policies),
--           invoice_payment (4 policies)
-- ============================================================================

BEGIN;

-- ── job_panel — drop 4 policies, disable RLS ─────────────────────────────────
DROP POLICY IF EXISTS "job_panel_org_select" ON public.job_panel;
DROP POLICY IF EXISTS "job_panel_org_insert" ON public.job_panel;
DROP POLICY IF EXISTS "job_panel_org_update" ON public.job_panel;
DROP POLICY IF EXISTS "job_panel_org_delete" ON public.job_panel;

ALTER TABLE public.job_panel DISABLE ROW LEVEL SECURITY;

-- ── quotation_line — drop 4 policies, disable RLS ────────────────────────────
DROP POLICY IF EXISTS "quotation_line_org_select" ON public.quotation_line;
DROP POLICY IF EXISTS "quotation_line_org_insert" ON public.quotation_line;
DROP POLICY IF EXISTS "quotation_line_org_update" ON public.quotation_line;
DROP POLICY IF EXISTS "quotation_line_org_delete" ON public.quotation_line;

ALTER TABLE public.quotation_line DISABLE ROW LEVEL SECURITY;

-- ── invoice_payment — drop 4 policies, disable RLS ───────────────────────────
DROP POLICY IF EXISTS "invoice_payment_org_select" ON public.invoice_payment;
DROP POLICY IF EXISTS "invoice_payment_org_insert" ON public.invoice_payment;
DROP POLICY IF EXISTS "invoice_payment_org_update" ON public.invoice_payment;
DROP POLICY IF EXISTS "invoice_payment_org_delete" ON public.invoice_payment;

ALTER TABLE public.invoice_payment DISABLE ROW LEVEL SECURITY;

-- ── Re-confirm parent tables RLS state is unchanged ──────────────────────────
-- 0175 Section 4 re-applies ENABLE ROW LEVEL SECURITY on job/quotation/invoice
-- (idempotent). Those tables are owned by 0174's RLS scope; do NOT disable
-- them here. State is preserved from 0174 after this rollback.

COMMIT;

-- ============================================================================
-- Post-rollback verification (run manually in CI to confirm state):
--
--   SELECT policyname, tablename
--   FROM pg_policies
--   WHERE tablename IN ('job_panel','quotation_line','invoice_payment');
--   -- Expected: 0 rows
--
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename  IN ('job_panel','quotation_line','invoice_payment')
--     AND rowsecurity = true;
--   -- Expected: 0 rows (RLS disabled on all three)
--
--   -- Parent tables must still have RLS enabled (owned by 0174):
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename  IN ('job','quotation','invoice')
--     AND rowsecurity = true;
--   -- Expected: 3 rows returned
-- ============================================================================
