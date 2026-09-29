-- =============================================================================
-- Migration 0186 Rollback — Reverse critical workflow table org_id hardening
-- =============================================================================
--
-- This file is for CI idempotency testing only.  Never apply to production.
--
-- Reversal order (opposite of 0186):
--   1. Drop new org_id-scoped SELECT policies.
--   2. Re-create original site_code-based SELECT policies (from 0002).
--   3. Drop NOT NULL constraints on org_id columns.
--   4. Drop org_id columns — data is discarded (CI only, never production).
--
-- Note: The explicit ENABLE ROW LEVEL SECURITY statements in 0186 are
-- idempotent; their reversal (DISABLE ROW LEVEL SECURITY) would also disable
-- RLS from 0002, which is incorrect.  Those statements are therefore NOT
-- reversed here.  The rollback restores functional equivalence to the 0002
-- state (site_code policies, no org_id column).
-- =============================================================================

BEGIN;

-- ── 1. Drop org_id-scoped SELECT policies ─────────────────────────────────────
DROP POLICY IF EXISTS "work_item_tenant_isolation"         ON public.work_item;
DROP POLICY IF EXISTS "approval_request_tenant_isolation"  ON public.approval_request;
DROP POLICY IF EXISTS "approval_decision_tenant_isolation" ON public.approval_decision;
DROP POLICY IF EXISTS "capture_item_tenant_isolation"      ON public.capture_item;

-- ── 2. Re-create original site_code-based SELECT policies (0002 baseline) ─────
CREATE POLICY "work_item_sel"
  ON public.work_item
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY "approval_request_sel"
  ON public.approval_request
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY "approval_decision_sel"
  ON public.approval_decision
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY "capture_item_sel"
  ON public.capture_item
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- ── 3. Drop NOT NULL constraints ──────────────────────────────────────────────
ALTER TABLE public.work_item       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.approval_request ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.approval_decision ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.capture_item     ALTER COLUMN org_id DROP NOT NULL;

-- ── 4. Drop org_id columns (DATA LOSS — CI only) ──────────────────────────────
ALTER TABLE public.work_item       DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.approval_request DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.approval_decision DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.capture_item     DROP COLUMN IF EXISTS org_id;

COMMIT;
