-- =============================================================================
-- Migration 0186 — Critical workflow table org_id hardening (Phase 2 RLS)
-- =============================================================================
--
-- Context
-- -------
-- The v16.8.0 security audit (migration 0185 tracking record) identified four
-- workflow tables as CRITICAL: they had NO org_id column and therefore could
-- not carry tenant-isolation RLS policies.  This migration completes Phase 2
-- remediation for those tables:
--
--   Table              | Parent FK path              | CRITICAL reason
--   -------------------|-----------------------------|--------------------------
--   work_item          | customer (primary_customer_id) | no org_id column
--   approval_request   | work_item                   | no org_id column
--   approval_decision  | approval_request            | no org_id column
--   capture_item       | work_item                   | no org_id column
--
-- All four tables were originally created in 0002_workflow_tables_rls.sql with
-- site_code-based RLS (is_governance_role() OR has_site_access(site_code)).
-- That design predated the org_id multi-tenant model.  This migration:
--
--   1. Adds org_id uuid columns (nullable initially for safe backfill).
--   2. Backfills org_id from parent tables in dependency order:
--        work_item      ← customer.org_id (via primary_customer_id)
--        approval_request ← work_item.org_id (via work_item_id)
--        capture_item   ← work_item.org_id (via work_item_id)
--        approval_decision ← approval_request.org_id (via approval_request_id)
--      Rows without a recoverable parent org_id receive the sentinel UUID
--      (00000000-0000-0000-0000-000000000000) consistent with 0179 backfill
--      conventions.
--   3. Sets NOT NULL on all four org_id columns.
--   4. Adds explicit ALTER TABLE ENABLE ROW LEVEL SECURITY statements.
--      NOTE: RLS was already enabled dynamically in 0002 via a DO block using
--      EXECUTE FORMAT(...).  The static-analysis linter (lint-rls-org-id.py)
--      cannot detect RLS enablement inside EXECUTE FORMAT() calls, so these
--      explicit statements are required to pass the CI gate.  At runtime they
--      are idempotent no-ops.
--   5. Drops the old site_code-based <table>_sel SELECT policies created in
--      0002.  These used permissive OR semantics
--      (is_governance_role() OR has_site_access(site_code)), which would
--      prevent the new org_id policies from achieving true tenant isolation
--      under PostgreSQL's permissive-policy OR evaluation.
--   6. Creates org_id-scoped tenant-isolation SELECT policies on all four
--      tables.  No INSERT / UPDATE / DELETE policies are added — all mutations
--      flow through SECURITY DEFINER RPCs by design (0002 requirement
--      Req 10.3, 10.4).
--
-- Sentinel UUID : 00000000-0000-0000-0000-000000000000
-- Rollback      : 0186_rollback.sql
-- Preceded by   : 0185_open_audit_findings_site_code_tables.sql (tracking)
-- Audit ref     : v16.8.0 — Phase 2 RLS epic, issue #56
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 1 — Add org_id columns (nullable; NOT NULL added after backfill)
-- =============================================================================

ALTER TABLE public.work_item
  ADD COLUMN IF NOT EXISTS org_id uuid;

ALTER TABLE public.approval_request
  ADD COLUMN IF NOT EXISTS org_id uuid;

ALTER TABLE public.approval_decision
  ADD COLUMN IF NOT EXISTS org_id uuid;

ALTER TABLE public.capture_item
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- =============================================================================
-- Step 2 — Backfill org_id in dependency order
--
-- Order is critical: work_item must be backfilled before its children, and
-- approval_request must be backfilled before approval_decision.
-- =============================================================================

-- ── 2a  work_item ← customer.org_id via primary_customer_id ──────────────────
UPDATE public.work_item wi
SET    org_id = c.org_id
FROM   public.customers c
WHERE  wi.primary_customer_id = c.customer_id
  AND  wi.org_id IS NULL;

-- Sentinel for rows where primary_customer_id IS NULL or the customer row has
-- no org_id (pre-backfill gap).
UPDATE public.work_item
SET    org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE  org_id IS NULL;

-- ── 2b  approval_request ← work_item.org_id via work_item_id ─────────────────
UPDATE public.approval_request ar
SET    org_id = wi.org_id
FROM   public.work_item wi
WHERE  ar.work_item_id = wi.id
  AND  ar.org_id IS NULL;

UPDATE public.approval_request
SET    org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE  org_id IS NULL;

-- ── 2c  capture_item ← work_item.org_id via work_item_id ─────────────────────
UPDATE public.capture_item ci
SET    org_id = wi.org_id
FROM   public.work_item wi
WHERE  ci.work_item_id = wi.id
  AND  ci.org_id IS NULL;

UPDATE public.capture_item
SET    org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE  org_id IS NULL;

-- ── 2d  approval_decision ← approval_request.org_id via approval_request_id ──
-- Must run AFTER 2b so approval_request.org_id is already populated.
UPDATE public.approval_decision ad
SET    org_id = ar.org_id
FROM   public.approval_request ar
WHERE  ad.approval_request_id = ar.id
  AND  ad.org_id IS NULL;

UPDATE public.approval_decision
SET    org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE  org_id IS NULL;

-- =============================================================================
-- Step 3 — NOT NULL constraints
-- =============================================================================

ALTER TABLE public.work_item       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.approval_request ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.approval_decision ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.capture_item     ALTER COLUMN org_id SET NOT NULL;

-- =============================================================================
-- Step 4 — Explicit ENABLE ROW LEVEL SECURITY (static, for linter)
-- =============================================================================

ALTER TABLE public.work_item        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_request  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_item      ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Step 5 — Drop old site_code-based SELECT policies (from 0002)
--
-- These used permissive OR semantics so adding org_id policies alongside them
-- would not achieve true tenant isolation (a row passes if EITHER policy's
-- USING clause is true).  Dropping them and replacing with org_id-only policies
-- is the correct remediation.
-- =============================================================================

DROP POLICY IF EXISTS "work_item_sel"         ON public.work_item;
DROP POLICY IF EXISTS "approval_request_sel"  ON public.approval_request;
DROP POLICY IF EXISTS "approval_decision_sel" ON public.approval_decision;
DROP POLICY IF EXISTS "capture_item_sel"      ON public.capture_item;

-- =============================================================================
-- Step 6 — org_id-scoped tenant-isolation SELECT policies
--
-- SELECT only.  No INSERT / UPDATE / DELETE policies — all mutations are
-- routed through SECURITY DEFINER RPCs (0002 design requirement Req 10.3,
-- 10.4).  The RPCs enforce org_id scoping at the application layer.
-- =============================================================================

-- ── work_item ─────────────────────────────────────────────────────────────────
CREATE POLICY "work_item_tenant_isolation"
  ON public.work_item
  FOR SELECT
  USING (org_id = public.get_user_org_id());

-- ── approval_request ─────────────────────────────────────────────────────────
CREATE POLICY "approval_request_tenant_isolation"
  ON public.approval_request
  FOR SELECT
  USING (org_id = public.get_user_org_id());

-- ── approval_decision ────────────────────────────────────────────────────────
CREATE POLICY "approval_decision_tenant_isolation"
  ON public.approval_decision
  FOR SELECT
  USING (org_id = public.get_user_org_id());

-- ── capture_item ──────────────────────────────────────────────────────────────
CREATE POLICY "capture_item_tenant_isolation"
  ON public.capture_item
  FOR SELECT
  USING (org_id = public.get_user_org_id());

COMMIT;

