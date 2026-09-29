-- =============================================================================
-- Migration: 0173_rls_isolation_hardening.sql
-- Author:    Security Audit 2026-08-28
-- Purpose:   Fix ALL RLS isolation gaps identified in the multi-tenant RLS audit.
--            Findings addressed: F1 (CRITICAL), F2 (CRITICAL), F3 (HIGH),
--                                F4 (MEDIUM), F6 (LOW)
--            Finding F5 (audit_logs WITH CHECK true) left for DBA review — see
--            inline comment below.
-- PR Gate:   Must pass CI (pg_prove + supabase db lint) before merge.
--            Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SECTION 0 — Safety pre-checks
-- Abort early if the organisations/org_members core tables are missing,
-- which would make org-scoped policies nonsensical.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.organizations does not exist — run 20260828_multi_tenant_schema.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_members'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.org_members does not exist — run 20260828_multi_tenant_schema.sql first';
  END IF;
END $$;

-- =============================================================================
-- F2 (CRITICAL): org_invitations — no RLS, invitation tokens fully exposed
-- =============================================================================

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Invitees can see their own invitations (matched by email).
CREATE POLICY "invitations_view_by_email" ON public.org_invitations
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Org admins/owners can manage invitations for their org.
CREATE POLICY "invitations_manage_admin" ON public.org_invitations
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  ) WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND role IN ('OWNER', 'ADMIN')
        AND is_active = true
    )
  );

-- Service role (e.g. edge functions sending invite emails) bypasses RLS by
-- default in Supabase. No extra policy needed for the service role.

-- =============================================================================
-- F3 (HIGH): notification_digest_queue — no RLS, any user can read all queues
-- =============================================================================

ALTER TABLE notification_digest_queue ENABLE ROW LEVEL SECURITY;

-- Users may only read their own digest entries.
CREATE POLICY "digest_queue_own_user_select" ON notification_digest_queue
  FOR SELECT USING (user_id = auth.uid());

-- Users may update their own entries (e.g. mark as read / snooze).
CREATE POLICY "digest_queue_own_user_update" ON notification_digest_queue
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts and deletes are restricted to service_role (background workers).
-- Authenticated users must NOT be able to insert arbitrary digest entries.
-- (No INSERT / DELETE policy for 'authenticated' role = implicit DENY.)

-- =============================================================================
-- F4 (MEDIUM): platform_metrics_snapshots — no RLS, operational metrics exposed
-- =============================================================================

ALTER TABLE platform_metrics_snapshots ENABLE ROW LEVEL SECURITY;

-- Full access for super_admins only.
CREATE POLICY "platform_metrics_super_admin_read" ON platform_metrics_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "platform_metrics_super_admin_write" ON platform_metrics_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid())
  );

-- =============================================================================
-- F6 (LOW): Remove unscoped tables from Realtime publication
-- Until F1 adds org_id and org-scoped channel filters are configured,
-- broadcasting job/invoice row-changes to all subscribers is a data leak.
-- Re-add to supabase_realtime ONLY after migration 0174 adds RLS-aware
-- Realtime channel policies (Supabase Realtime RLS, available ≥ v2.28).
-- =============================================================================

DO $pub$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.jobs; EXCEPTION WHEN OTHERS THEN NULL; END $pub$;
DO $pub$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.invoices; EXCEPTION WHEN OTHERS THEN NULL; END $pub$;

-- =============================================================================
-- F1 (CRITICAL): Legacy tables — no org_id, USING (true) SELECT policies
-- Phase 1: Add org_id columns + backfill + replace open policies
-- Phase 2 (migration 0174): ALTER org_id SET NOT NULL once backfill verified
-- =============================================================================

-- ── 1. ADD COLUMNS ───────────────────────────────────────────────────────────

ALTER TABLE public.customers       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
ALTER TABLE public.jobs            ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
ALTER TABLE public.job_panels      ADD COLUMN IF NOT EXISTS org_id UUID;   -- FK added after backfill confirms referential integrity
ALTER TABLE public.quotations      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
ALTER TABLE public.quotation_lines ADD COLUMN IF NOT EXISTS org_id UUID;   -- derived from parent quotation
ALTER TABLE public.invoices        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(org_id);
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS org_id UUID;  -- derived from parent invoice

-- Add indexes so org-scoped queries remain fast after the column is populated.
CREATE INDEX IF NOT EXISTS idx_customer_org       ON public.customers(org_id);
CREATE INDEX IF NOT EXISTS idx_job_org            ON public.jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_job_panel_org      ON public.job_panels(org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_org      ON public.quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_line_org ON public.quotation_lines(org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_org        ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payment_org ON public.invoice_payments(org_id);

-- ── 2. BACKFILL ──────────────────────────────────────────────────────────────
-- Strategy: resolve org_id for each row via the row's created_by user →
--           org_members lookup (first active membership).
--
-- Fallback for rows where created_by has no org_members entry (e.g. seeded
-- rows, service-account inserts): use the single active organization if
-- exactly one exists (single-tenant bootstrap scenario), otherwise leave NULL
-- and surface via the post-backfill audit query below.
--
-- Tables without their own created_by inherit org_id from their parent table.

DO $$
DECLARE
  v_fallback_org_id UUID;
  v_org_count       INT;
BEGIN
  -- Determine single-org fallback (safe only in bootstrap / single-tenant env)
  -- NOTE: MIN(uuid) is not universally available; use two separate queries.
  SELECT COUNT(*) INTO v_org_count
    FROM public.organizations
    WHERE status = 'ACTIVE';
  SELECT org_id INTO v_fallback_org_id
    FROM public.organizations
    WHERE status = 'ACTIVE'
    LIMIT 1;

  IF v_org_count > 1 THEN
    -- Multi-org environment — do NOT use a blanket fallback.
    v_fallback_org_id := NULL;
    RAISE NOTICE 'Multi-org environment detected: rows with no org membership will remain NULL after backfill';
  ELSE
    RAISE NOTICE 'Single-org environment: fallback org_id = %', v_fallback_org_id;
  END IF;

  -- ── job (has created_by) ────────────────────────────────────────────────────
  -- NOTE: customers has no created_by; derive from jobs AFTER jobs are backfilled.
  UPDATE public.jobs j
     SET org_id = COALESCE(
           (SELECT om.org_id
              FROM public.org_members om
             WHERE om.user_id = j.created_by
               AND om.is_active = true
             ORDER BY om.org_id
             LIMIT 1),
           v_fallback_org_id
         )
   WHERE j.org_id IS NULL;

  -- ── job_panel (no created_by — inherit from parent job) ────────────────────
  UPDATE public.job_panels jp
     SET org_id = COALESCE(
           (SELECT j.org_id FROM public.jobs j WHERE j.job_id = jp.job_id),
           v_fallback_org_id
         )
   WHERE jp.org_id IS NULL;

  -- ── quotation (has created_by) ──────────────────────────────────────────────
  UPDATE public.quotations q
     SET org_id = COALESCE(
           (SELECT om.org_id
              FROM public.org_members om
             WHERE om.user_id = q.created_by
               AND om.is_active = true
             ORDER BY om.org_id
             LIMIT 1),
           v_fallback_org_id
         )
   WHERE q.org_id IS NULL;

  -- ── customers (no created_by — derive from jobs/invoices once those are backfilled)
  UPDATE public.customers c
     SET org_id = COALESCE(
           (SELECT j.org_id
              FROM public.jobs j
             WHERE j.customer_id = c.customer_id
               AND j.org_id IS NOT NULL
             LIMIT 1),
           (SELECT i.org_id
              FROM public.invoices i
             WHERE i.customer_id = c.customer_id
               AND i.org_id IS NOT NULL
             LIMIT 1),
           v_fallback_org_id
         )
   WHERE c.org_id IS NULL;

  -- ── quotation_line (inherit from parent quotation) ──────────────────────────
  UPDATE public.quotation_lines ql
     SET org_id = COALESCE(
           (SELECT q.org_id FROM public.quotations q WHERE q.quotation_id = ql.quotation_id),
           v_fallback_org_id
         )
   WHERE ql.org_id IS NULL;

  -- ── invoice (has created_by) ────────────────────────────────────────────────
  UPDATE public.invoices i
     SET org_id = COALESCE(
           (SELECT om.org_id
              FROM public.org_members om
             WHERE om.user_id = i.created_by
               AND om.is_active = true
             ORDER BY om.org_id
             LIMIT 1),
           v_fallback_org_id
         )
   WHERE i.org_id IS NULL;

  -- ── invoice_payment (inherit from parent invoice) ───────────────────────────
  UPDATE public.invoice_payments ip
     SET org_id = COALESCE(
           (SELECT i.org_id FROM public.invoices i WHERE i.invoice_id = ip.invoice_id),
           v_fallback_org_id
         )
   WHERE ip.org_id IS NULL;

  RAISE NOTICE 'Backfill complete. Run post-backfill audit query to check for NULLs.';
END $$;

-- ── 3. POST-BACKFILL AUDIT (informational — does NOT abort migration) ─────────
-- After deploying to staging, run this to detect any rows still unresolved:
--
--   SELECT 'customer' AS tbl, COUNT(*) FROM customer WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'job',              COUNT(*) FROM job            WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'job_panel',        COUNT(*) FROM job_panel      WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'quotation',        COUNT(*) FROM quotation       WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'quotation_line',   COUNT(*) FROM quotation_line  WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'invoice',          COUNT(*) FROM invoice         WHERE org_id IS NULL
--   UNION ALL
--   SELECT 'invoice_payment',  COUNT(*) FROM invoice_payment WHERE org_id IS NULL;
--
-- All counts must be 0 before migration 0174 applies SET NOT NULL.

-- ── 4. REPLACE OPEN POLICIES ─────────────────────────────────────────────────

-- Drop the wide-open USING(true) SELECT policies from 0172.
DROP POLICY IF EXISTS "authenticated_read_customer"  ON public.customers;
DROP POLICY IF EXISTS "authenticated_read_job"        ON public.jobs;
DROP POLICY IF EXISTS "authenticated_read_panel"      ON public.job_panels;
DROP POLICY IF EXISTS "authenticated_read_quotation"  ON public.quotations;
DROP POLICY IF EXISTS "authenticated_read_qt_line"    ON public.quotation_lines;
DROP POLICY IF EXISTS "authenticated_read_invoice"    ON public.invoices;
DROP POLICY IF EXISTS "authenticated_read_payment"    ON public.invoice_payments;

-- Note: if the policy names in 0172 differ from above, use the exact names
-- from \dp customer; in psql.  The IF EXISTS guard makes this safe either way.

-- Org-scoped SELECT (reads)
CREATE POLICY "customer_tenant_isolation"       ON public.customers
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "job_tenant_isolation"            ON public.jobs
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "job_panel_tenant_isolation"      ON public.job_panels
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "quotation_tenant_isolation"      ON public.quotations
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "quotation_line_tenant_isolation" ON public.quotation_lines
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "invoice_tenant_isolation"        ON public.invoices
  FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY "invoice_payment_tenant_isolation" ON public.invoice_payments
  FOR SELECT USING (org_id = public.get_user_org_id());

-- Org-scoped INSERT guards (prevent cross-tenant writes)
CREATE POLICY "customer_tenant_insert"          ON public.customers
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "job_tenant_insert"               ON public.jobs
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "job_panel_tenant_insert"         ON public.job_panels
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "quotation_tenant_insert"         ON public.quotations
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "quotation_line_tenant_insert"    ON public.quotation_lines
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "invoice_tenant_insert"           ON public.invoices
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "invoice_payment_tenant_insert"   ON public.invoice_payments
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- Org-scoped UPDATE guards
CREATE POLICY "customer_tenant_update"          ON public.customers
  FOR UPDATE USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "job_tenant_update"               ON public.jobs
  FOR UPDATE USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "quotation_tenant_update"         ON public.quotations
  FOR UPDATE USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "invoice_tenant_update"           ON public.invoices
  FOR UPDATE USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- =============================================================================
-- SECURITY DEFINER RPC HARDENING — companion to secdef-audit-report.md
-- =============================================================================
-- Two RPCs confirmed cross-tenant in the SECURITY DEFINER audit:
--   • rpc_record_payment  — unscoped DML (writes to invoice/job/invoice_payment)
--   • rpc_job_board       — unscoped SELECT (reads job + customer across tenants)
-- Both are replaced here with org-scoped versions.
-- =============================================================================

-- ── rpc_record_payment: add org_id parameter + scope all DML ─────────────────

CREATE OR REPLACE FUNCTION public.rpc_record_payment(
  p_invoice_id   UUID,
  p_amount       NUMERIC,
  p_method       TEXT,
  p_reference    TEXT DEFAULT NULL,
  p_org_id       UUID DEFAULT NULL   -- explicit org scope; falls back to caller's org
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      UUID;
  v_invoice     invoices%ROWTYPE;
  v_new_remaining NUMERIC;
  v_payment_id  UUID := gen_random_uuid();
BEGIN
  -- Resolve org_id: prefer explicit parameter, fall back to caller's membership.
  v_org_id := COALESCE(p_org_id, public.get_user_org_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_record_payment: caller has no active org membership';
  END IF;

  -- Auth guard: caller must be FINANCE or ADMIN in this org.
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id   = v_org_id
      AND role     IN ('FINANCE', 'ADMIN', 'OWNER')
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'rpc_record_payment: insufficient privileges for org %', v_org_id;
  END IF;

  -- Scoped invoice read — will raise NO_DATA_FOUND if wrong org.
  SELECT * INTO STRICT v_invoice
    FROM public.invoices
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  v_new_remaining := v_invoice.remaining_amount - p_amount;

  -- Scoped INSERT into invoice_payment.
  INSERT INTO public.invoice_payments (
    payment_id, invoice_id, org_id, amount, payment_method, reference, paid_at
  ) VALUES (
    v_payment_id, p_invoice_id, v_org_id, p_amount, p_method, p_reference, now()
  );

  -- Scoped UPDATE on invoice.
  UPDATE public.invoices
     SET remaining_amount = v_new_remaining,
         status = CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
   WHERE invoice_id = p_invoice_id
     AND org_id     = v_org_id;

  -- Scoped UPDATE on job.
  UPDATE public.jobs
     SET updated_at = now()
   WHERE job_id = v_invoice.job_id
     AND org_id = v_org_id;

  RETURN jsonb_build_object(
    'payment_id',       v_payment_id,
    'new_remaining',    v_new_remaining,
    'invoice_status',   CASE WHEN v_new_remaining <= 0 THEN 'PAID' ELSE 'PARTIAL' END
  );
END;
$$;

-- ── rpc_job_board: add org_id scope to the SELECT ────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_job_board(
  p_status   TEXT    DEFAULT NULL,
  p_limit    INT     DEFAULT 50,
  p_offset   INT     DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Auth guard: authenticated user only.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'rpc_job_board: unauthenticated';
  END IF;

  -- Role guard: any active member of the org (matches original intent).
  v_org_id := public.get_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'rpc_job_board: caller has no active org membership';
  END IF;

  RETURN (
    SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT j.job_id, j.job_code, j.status, j.due_date,
               c.name AS customer_name,
               j.created_at
          FROM public.jobs j
          JOIN public.customers c ON c.customer_id = j.customer_id
                          AND c.org_id     = v_org_id   -- explicit org scope on join
         WHERE j.org_id = v_org_id                      -- explicit org scope on job
           AND (p_status IS NULL OR j.status = p_status)
         ORDER BY j.created_at DESC
         LIMIT  p_limit
         OFFSET p_offset
      ) t
  );
END;
$$;

-- ── REVOKE EXECUTE FROM PUBLIC on all SECURITY DEFINER functions ──────────────
-- Supabase grants EXECUTE to PUBLIC by default; restrict to authenticated role.

REVOKE EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_job_board(TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_job_board(TEXT, INT, INT) TO authenticated;

-- get_search_suggestions is patched in secdef-audit-report remediation (0174).
-- Platform search functions already have GRANT to authenticated in their
-- originating migration; REVOKE FROM PUBLIC added here as belt-and-suspenders.
REVOKE EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INT) TO authenticated;

-- =============================================================================
-- F5 NOTE: audit_logs WITH CHECK (true)
-- Not patched here. Recommendation: restrict INSERT to service_role only.
-- Tracked separately — requires application-layer refactor to remove direct
-- INSERT from authenticated users. See rls-audit-report.md §F5.
-- =============================================================================

COMMIT;

-- =============================================================================
-- ROLLBACK SCRIPT (save as 0173_rollback.sql — run only in emergency)
-- =============================================================================
-- BEGIN;
--   -- Re-enable Realtime (temporary until 0174)
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
--
--   -- Remove F1 policies (restores USING true state until hotfix)
--   DROP POLICY IF EXISTS "customer_tenant_isolation"       ON public.customers;
--   DROP POLICY IF EXISTS "job_tenant_isolation"            ON public.jobs;
--   DROP POLICY IF EXISTS "job_panel_tenant_isolation"      ON public.job_panels;
--   DROP POLICY IF EXISTS "quotation_tenant_isolation"      ON public.quotations;
--   DROP POLICY IF EXISTS "quotation_line_tenant_isolation" ON public.quotation_lines;
--   DROP POLICY IF EXISTS "invoice_tenant_isolation"        ON public.invoices;
--   DROP POLICY IF EXISTS "invoice_payment_tenant_isolation" ON public.invoice_payments;
--   -- Re-add open policies (only if production cannot tolerate a lockout)
--   -- CREATE POLICY "authenticated_read_customer" ON customer FOR SELECT USING (true);
--   -- ... (repeat for each table)
--
--   -- Disable RLS on F2/F3/F4 tables (revert to unprotected state)
--   ALTER TABLE public.org_invitations       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE notification_digest_queue    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE platform_metrics_snapshots   DISABLE ROW LEVEL SECURITY;
-- COMMIT;
