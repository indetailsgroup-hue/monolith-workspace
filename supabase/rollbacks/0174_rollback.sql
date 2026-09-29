-- ============================================================================
-- Rollback: 0174_rollback.sql
-- ⚠️  FOR CI IDEMPOTENCY TESTING ONLY — DO NOT RUN ON PRODUCTION ⚠️
-- Purpose : Fully reverse all changes made by 0174_secdef_rpc_hardening.sql
--           so that 0174 can be cleanly re-applied on the same database.
-- Pre-req : 0175_rollback must be run first if 0175 was applied.
-- Coverage: Sections 1–8 of 0174 in reverse order.
--   - Drop org-scoped RLS policies on job, quotation, invoice (Section 8)
--   - Disable RLS on job, quotation, invoice (Section 8)
--   - Drop is_platform_super_admin() (Section 5)
--   - Drop org-scoped rpc_approve_quotation (Section 6)
--   - Drop SECURITY INVOKER get_search_suggestions (Section 7)
--   - Drop NOT NULL constraint on job/quotation/invoice org_id (Section 4)
--   - Drop quarantine table (Section 3)
--   - Drop org_id column + index on platform_search_logs (Section 1/4)
--   - NOTE: org_id columns on job/quotation/invoice remain (added by 0173,
--     not 0174). Only the NOT NULL constraint is removed here.
-- ============================================================================

BEGIN;

-- ── Section 8 rollback: Drop org-scoped RLS policies ─────────────────────────

DROP POLICY IF EXISTS "jobs_org_select"       ON public.job;
DROP POLICY IF EXISTS "jobs_org_insert"       ON public.job;
DROP POLICY IF EXISTS "jobs_org_update"       ON public.job;

DROP POLICY IF EXISTS "quotations_org_select" ON public.quotation;
DROP POLICY IF EXISTS "quotations_org_insert" ON public.quotation;
DROP POLICY IF EXISTS "quotations_org_update" ON public.quotation;

DROP POLICY IF EXISTS "invoices_org_select"   ON public.invoice;
DROP POLICY IF EXISTS "invoices_org_insert"   ON public.invoice;
DROP POLICY IF EXISTS "invoices_org_update"   ON public.invoice;

-- Disable RLS on the three tables (0174 Section 8 was the first to ENABLE it
-- on these tables; 0173 added policies but did not explicitly ENABLE RLS).
ALTER TABLE public.job       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice   DISABLE ROW LEVEL SECURITY;

-- ── Section 7 rollback: Drop SECURITY INVOKER get_search_suggestions ─────────
-- 0174 replaced the original LANGUAGE sql / SECURITY DEFINER version with a
-- plpgsql / SECURITY INVOKER version. DROP here allows 0174 to re-apply its
-- CREATE OR REPLACE cleanly. The pre-0174 version will be recreated by its
-- originating migration when CI re-runs the full sequence.
DROP FUNCTION IF EXISTS public.get_search_suggestions(TEXT, INT);

-- ── Section 6 rollback: Drop org-scoped rpc_approve_quotation ────────────────
-- Pre-0174 version was created in an earlier migration; DROP here so 0174
-- can re-apply CREATE OR REPLACE without stale state.
DROP FUNCTION IF EXISTS public.rpc_approve_quotation(UUID, INT);

-- ── Section 5 rollback: Drop is_platform_super_admin() helper ────────────────
-- 0175 depends on this function. Ensure 0175_rollback has run first.
DROP FUNCTION IF EXISTS public.is_platform_super_admin();

-- ── Section 4 rollback: Remove NOT NULL enforcement ──────────────────────────
-- org_id columns on job/quotation/invoice were added (nullable) by 0173;
-- 0174 made them NOT NULL. Restore to nullable so 0174 can re-apply the
-- backfill + NOT NULL cycle cleanly.
ALTER TABLE public.job                  ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.quotation            ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.invoice              ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.platform_search_logs ALTER COLUMN org_id DROP NOT NULL;

-- ── Section 3 rollback: Drop backfill quarantine table ───────────────────────
DROP TABLE IF EXISTS public._org_id_backfill_quarantine;

-- ── Section 1 + 4 rollback: Drop platform_search_logs org_id index + column ──
-- idx_job_org, idx_quotation_org, idx_invoice_org were created by 0173 —
-- do NOT drop them here; they belong to 0173's rollback scope.
-- Only idx_search_logs_org and the platform_search_logs.org_id column are
-- exclusively owned by 0174.
DROP INDEX IF EXISTS idx_search_logs_org;
ALTER TABLE public.platform_search_logs DROP COLUMN IF EXISTS org_id CASCADE;

-- ── Sentinel org cleanup (optional in CI — sentinel is harmless but noisy) ───
-- The sentinel organization row ('00000000-0000-0000-0000-000000000000') was
-- inserted by 0174 as a backfill safety net. Delete it here so re-running
-- 0174 gets a clean state. Use DELETE not TRUNCATE to avoid lock escalation.
DELETE FROM public.organization
WHERE org_id = '00000000-0000-0000-0000-000000000000'
  AND slug   = '__orphaned__';

COMMIT;

-- ============================================================================
-- Post-rollback verification (run manually in CI to confirm state):
--
--   -- org_id on job/quotation/invoice must now be nullable:
--   SELECT table_name, column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND column_name  = 'org_id'
--     AND table_name   IN ('job','quotation','invoice','platform_search_logs');
--   -- Expected: job/quotation/invoice rows returned with is_nullable = YES;
--   --           platform_search_logs NOT returned (column dropped).
--
--   SELECT policyname FROM pg_policies
--   WHERE tablename IN ('job','quotation','invoice')
--     AND policyname LIKE '%org%';
--   -- Expected: 0 rows
--
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('is_platform_super_admin','rpc_approve_quotation',
--                     'get_search_suggestions')
--     AND pronamespace = 'public'::regnamespace;
--   -- Expected: 0 rows (all dropped)
-- ============================================================================
