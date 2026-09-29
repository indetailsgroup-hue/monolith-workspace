-- ============================================================================
-- Migration: 0174_secdef_rpc_hardening.sql
-- Created: 2026-08-28
-- Author: Security audit — v16.8.0 hardening pass
--
-- Patches two SECURITY DEFINER RPC findings from the SD-R audit:
--   SD-R3  rpc_approve_quotation   — cross-tenant quotation/invoice access
--   SD-R4  get_search_suggestions  — unauthenticated access to all search logs
--
-- Changes in this migration:
--   1. ADD COLUMN org_id to job, quotation, invoice, platform_search_logs
--   2. Backfill org_id on existing rows via org_members lookup
--   3. Make org_id NOT NULL (after backfill)
--   4. CREATE helper: is_platform_super_admin()
--   5. REPLACE rpc_approve_quotation — add org_id scoping (SD-R3)
--   6. REPLACE get_search_suggestions — SECURITY INVOKER + super_admin guard (SD-R4)
--   7. REVOKE / GRANT hygiene
-- ============================================================================

-- ============================================================================
-- SECTION 1: Add org_id to tables that were missing it
-- ============================================================================

-- job
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

-- quotation
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

-- invoice
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

-- platform_search_logs (super-admin log aggregation; stores the org context of the searcher)
ALTER TABLE public.platform_search_logs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);

-- ============================================================================
-- SECTION 2: Backfill org_id from org_members(user_id = created_by)
-- Rows where created_by has multiple memberships (rare): take the first active one.
-- Rows with no org_members match are left NULL and quarantined below.
-- ============================================================================

UPDATE public.jobs j
SET org_id = (
  SELECT m.org_id
  FROM public.org_members m
  WHERE m.user_id = j.created_by
    AND m.is_active = true
  ORDER BY m.org_id
  LIMIT 1
)
WHERE j.org_id IS NULL;

UPDATE public.quotations q
SET org_id = (
  SELECT m.org_id
  FROM public.org_members m
  WHERE m.user_id = q.created_by
    AND m.is_active = true
  ORDER BY m.org_id
  LIMIT 1
)
WHERE q.org_id IS NULL;

-- invoice.created_by → backfill from the linked quotation's org_id first, then fall back to member lookup
UPDATE public.invoices i
SET org_id = COALESCE(
  (SELECT q.org_id FROM public.quotations q WHERE q.quotation_id = i.quotation_id),
  (SELECT m.org_id FROM public.org_members m WHERE m.user_id = i.created_by AND m.is_active = true ORDER BY m.org_id LIMIT 1)
)
WHERE i.org_id IS NULL;

-- platform_search_logs: backfill from org_filter column (already present) or org_members
UPDATE public.platform_search_logs l
SET org_id = COALESCE(
  l.org_filter,
  (SELECT m.org_id FROM public.org_members m WHERE m.user_id = l.user_id AND m.is_active = true ORDER BY m.org_id LIMIT 1)
)
WHERE l.org_id IS NULL;

-- ============================================================================
-- SECTION 3: Quarantine rows that could not be backfilled
-- Log them to a dedicated table for manual remediation instead of deleting.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._org_id_backfill_quarantine (
  table_name TEXT NOT NULL,
  record_id  UUID NOT NULL,
  created_by UUID,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, record_id)
);

INSERT INTO public._org_id_backfill_quarantine (table_name, record_id, created_by)
  SELECT 'job', job_id, created_by FROM public.jobs WHERE org_id IS NULL
  ON CONFLICT DO NOTHING;

INSERT INTO public._org_id_backfill_quarantine (table_name, record_id, created_by)
  SELECT 'quotation', quotation_id, created_by FROM public.quotations WHERE org_id IS NULL
  ON CONFLICT DO NOTHING;

INSERT INTO public._org_id_backfill_quarantine (table_name, record_id, created_by)
  SELECT 'invoice', invoice_id, created_by FROM public.invoices WHERE org_id IS NULL
  ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 4: Enforce NOT NULL after backfill
-- Any row still NULL at this point is orphaned — set a sentinel org_id (nil UUID)
-- so the NOT NULL constraint can be applied. Quarantine captured them above.
-- ============================================================================

-- Sentinel UUID for orphaned rows (no org membership found)
DO $$
BEGIN
  -- Ensure the sentinel org exists (idempotent)
  INSERT INTO public.organizations (org_id, name, slug, status)
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    '__orphaned_backfill_sentinel__',
    '__orphaned__',
    'ACTIVE'
  )
  ON CONFLICT (org_id) DO NOTHING;
END;
$$;

UPDATE public.jobs        SET org_id = '00000000-0000-0000-0000-000000000000' WHERE org_id IS NULL;
UPDATE public.quotations  SET org_id = '00000000-0000-0000-0000-000000000000' WHERE org_id IS NULL;
UPDATE public.invoices    SET org_id = '00000000-0000-0000-0000-000000000000' WHERE org_id IS NULL;
UPDATE public.platform_search_logs SET org_id = '00000000-0000-0000-0000-000000000000' WHERE org_id IS NULL;

-- Now enforce NOT NULL
ALTER TABLE public.jobs               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.quotations         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoices           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.platform_search_logs ALTER COLUMN org_id SET NOT NULL;

-- Indexes for new org_id columns
CREATE INDEX IF NOT EXISTS idx_job_org         ON public.jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_org   ON public.quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_org     ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_org ON public.platform_search_logs(org_id);

-- ============================================================================
-- SECTION 5: Helper — is_platform_super_admin()
-- Canonical, inlineable check used by RPCs and policies.
-- SECURITY INVOKER: executes with caller privileges; super_admins table is
-- accessible by all authenticated users via its RLS SELECT policy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated;

COMMENT ON FUNCTION public.is_platform_super_admin() IS
  'Returns TRUE if auth.uid() has a row in public.super_admins. '
  'Use inside RLS policies and RPCs. SECURITY INVOKER — does not escalate.';

-- ============================================================================
-- SECTION 6: SD-R3 — Patch rpc_approve_quotation
--
-- Vulnerability: SELECT on quotation had no org_id predicate → cross-tenant
-- quotation approval was possible for any user with FINANCE/ADMIN role.
--
-- Fix:
--   a. Add AND org_id = public.get_user_org_id() to the quotation SELECT.
--   b. Propagate org_id to UPDATE quotation, INSERT invoice, UPDATE job.
--   c. Declare v_org_id in DECLARE block and resolve it once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_approve_quotation(
  p_quotation_id UUID,
  p_due_days     INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qt     quotations%ROWTYPE;
  v_inv_id UUID;
  v_inv_code TEXT;
  v_due    DATE;
  v_org_id UUID;
BEGIN
  -- ── Authorization check ───────────────────────────────────────────────────
  IF NOT (
    public.has_app_role('finance')
    OR public.has_app_role('admin')
    OR public.is_governance_role()
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires FINANCE or ADMIN role';
  END IF;

  -- ── Resolve caller org (once) ─────────────────────────────────────────────
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: caller is not a member of any organisation';
  END IF;

  -- ── Fetch quotation scoped to caller org (SD-R3 fix) ─────────────────────
  SELECT * INTO v_qt
  FROM public.quotations
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;          -- ← prevents cross-tenant access

  IF NOT FOUND THEN
    -- Deliberately ambiguous: do not reveal existence of records in other orgs
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_qt.status NOT IN ('DRAFT', 'SENT') THEN
    RAISE EXCEPTION 'Cannot approve quotation in % status', v_qt.status;
  END IF;

  -- ── Derive invoice code ───────────────────────────────────────────────────
  v_due := CURRENT_DATE + p_due_days;
  v_inv_id := gen_random_uuid();
  v_inv_code := 'INV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((
    SELECT COALESCE(MAX(SUBSTRING(invoice_code FROM '[0-9]+$')::INT), 0) + 1
    FROM public.invoices
    WHERE org_id = v_org_id          -- ← scoped sequence per-org
  )::TEXT, 4, '0');

  -- ── Update quotation status ───────────────────────────────────────────────
  UPDATE public.quotations
  SET
    status      = 'APPROVED',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at  = now()
  WHERE quotation_id = p_quotation_id
    AND org_id = v_org_id;           -- ← belt-and-suspenders

  -- ── Create invoice (carry org_id from quotation) ──────────────────────────
  INSERT INTO public.invoices (
    invoice_id, invoice_code, quotation_id, job_id,
    customer_id, org_id,               -- ← org_id now populated (SD-R3 fix)
    subtotal, vat_rate, vat_amount, discount,
    total, remaining_amount, due_date, created_by
  )
  SELECT
    v_inv_id, v_inv_code, p_quotation_id, v_qt.job_id,
    v_qt.customer_id, v_org_id,        -- ← same org as the quotation
    v_qt.subtotal, v_qt.vat_rate, v_qt.vat_amount, v_qt.discount,
    v_qt.total, v_qt.total, v_due, auth.uid();

  -- ── Update job status if linked ───────────────────────────────────────────
  IF v_qt.job_id IS NOT NULL THEN
    UPDATE public.jobs
    SET
      status       = 'QUOTED',
      quotation_id = p_quotation_id,
      invoice_id   = v_inv_id,
      updated_at   = now()
    WHERE job_id = v_qt.job_id
      AND org_id  = v_org_id           -- ← org_id scope guard (SD-R3 fix)
      AND status  = 'DRAFT';
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',   v_inv_id,
    'invoice_code', v_inv_code,
    'due_date',     v_due,
    'total',        v_qt.total
  );
END;
$$;

-- Re-apply permissions (SECURITY DEFINER functions must have explicit grants)
REVOKE ALL ON FUNCTION public.rpc_approve_quotation(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_approve_quotation(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.rpc_approve_quotation(UUID, INT) IS
  'Approve a quotation and create the corresponding invoice. '
  'Requires FINANCE or ADMIN app-role. '
  'All table access is scoped to the caller org via get_user_org_id(). '
  'SD-R3 hardened in 0174_secdef_rpc_hardening.sql (2026-08-28).';

-- ============================================================================
-- SECTION 7: SD-R4 — Patch get_search_suggestions
--
-- Vulnerability: LANGUAGE sql STABLE SECURITY DEFINER with no auth check →
-- any anonymous or tenant user could retrieve aggregated query patterns from
-- ALL organisations' search logs.
--
-- Fix:
--   a. Convert to LANGUAGE plpgsql to support conditional logic.
--   b. Add explicit super_admin guard; raise EXCEPTION for non-super-admins.
--   c. Switch to SECURITY INVOKER — RLS on platform_search_logs
--      (search_logs_super_admin policy) provides a second enforcement layer.
--   d. Add org_id column to platform_search_logs result set (optional filter).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_search_suggestions(
  query_prefix  TEXT,
  result_limit  INT DEFAULT 8
)
RETURNS TABLE(query_text TEXT, frequency BIGINT, last_used TIMESTAMPTZ)
LANGUAGE plpgsql STABLE
SECURITY INVOKER                  -- ← was SECURITY DEFINER; RLS now enforces
AS $$
BEGIN
  -- ── Super-admin guard (SD-R4 fix) ─────────────────────────────────────────
  -- This function exposes cross-tenant query aggregates; restrict to super-admins.
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION
      'Forbidden: get_search_suggestions is restricted to platform super-administrators'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Return aggregated suggestions (super-admin sees all orgs) ─────────────
  RETURN QUERY
  SELECT
    l.query        AS query_text,
    COUNT(*)       AS frequency,
    MAX(l.created_at) AS last_used
  FROM public.platform_search_logs l
  WHERE l.query ILIKE (query_prefix || '%')
  GROUP BY l.query
  ORDER BY frequency DESC, last_used DESC
  LIMIT result_limit;
END;
$$;

-- 0173 already revoked PUBLIC; re-confirm grant to authenticated only
REVOKE ALL ON FUNCTION public.get_search_suggestions(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.get_search_suggestions(TEXT, INT) IS
  'Returns cross-tenant search query suggestions from platform_search_logs. '
  'Restricted to platform super-admins only. '
  'SD-R4 hardened in 0174_secdef_rpc_hardening.sql (2026-08-28): '
  'converted to SECURITY INVOKER plpgsql with explicit super_admin guard.';

-- ============================================================================
-- SECTION 8: RLS policies for new org_id columns
-- Add or refresh org-scoped policies on job, quotation, invoice.
-- These complement (do not replace) existing policies from 0173.
-- ============================================================================

-- job — add org_id predicate to existing policies (idempotent re-create)
DROP POLICY IF EXISTS "jobs_org_select" ON public.jobs;
CREATE POLICY "jobs_org_select" ON public.jobs
  FOR SELECT
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "jobs_org_insert" ON public.jobs;
CREATE POLICY "jobs_org_insert" ON public.jobs
  FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "jobs_org_update" ON public.jobs;
CREATE POLICY "jobs_org_update" ON public.jobs
  FOR UPDATE
  USING (org_id = public.get_user_org_id());

-- quotation — org-scoped policies
DROP POLICY IF EXISTS "quotations_org_select" ON public.quotations;
CREATE POLICY "quotations_org_select" ON public.quotations
  FOR SELECT
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "quotations_org_insert" ON public.quotations;
CREATE POLICY "quotations_org_insert" ON public.quotations
  FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "quotations_org_update" ON public.quotations;
CREATE POLICY "quotations_org_update" ON public.quotations
  FOR UPDATE
  USING (org_id = public.get_user_org_id());

-- invoice — org-scoped policies
DROP POLICY IF EXISTS "invoices_org_select" ON public.invoices;
CREATE POLICY "invoices_org_select" ON public.invoices
  FOR SELECT
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "invoices_org_insert" ON public.invoices;
CREATE POLICY "invoices_org_insert" ON public.invoices
  FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS "invoices_org_update" ON public.invoices;
CREATE POLICY "invoices_org_update" ON public.invoices
  FOR UPDATE
  USING (org_id = public.get_user_org_id());

-- Ensure RLS is enabled on all three tables
ALTER TABLE public.jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices    ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- END OF MIGRATION 0174
-- ============================================================================
-- Closure criteria:
--   [ ] rpc_approve_quotation returns 'Quotation not found' for cross-tenant IDs
--   [ ] get_search_suggestions raises 'insufficient_privilege' for non-super-admins
--   [ ] job, quotation, invoice, platform_search_logs all have non-null org_id
--   [ ] _org_id_backfill_quarantine is empty (or reviewed + remediated)
--   [ ] CI migration tests pass on a fresh database
-- ============================================================================
