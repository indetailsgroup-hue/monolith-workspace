-- =============================================================================
-- Migration: 0190_finance_accounting_domain_rls.sql
--
-- Phase 2 RLS — Finance/Accounting domain: org_id tenant isolation
-- Issue: #73 (security: Phase 2 RLS epic — migrations 0188–0194)
--
-- Tables (10):
--   bank_feed_txn, expense_category_map, finance_config, job_cost_config,
--   job_cost_entries, journal_entry, journal_line, payment_installments,
--   receipts, receivable
--
-- Strategy:
--   • journal_entry, bank_feed_txn, receivable
--       — backfill via installation_projects.site_code → org_id
--       — sentinel '00000000-...' for NULL or unmatched site_code
--   • journal_line
--       — backfill via journal_entry.org_id (backfilled above in same tx)
--   • job_cost_entries, payment_installments, receipts
--       — backfill via installation_projects.org_id (project_id NOT NULL FK)
--   • expense_category_map, finance_config, job_cost_config
--       — sentinel '00000000-...' (global config; all reads via SECDEF RPCs)
--
-- Policy changes:
--   DROP  : bank_feed_txn_sel, expense_category_map_sel, finance_config_sel,
--            job_cost_config_sel, job_cost_entries_sel, journal_entry_sel,
--            journal_line_sel, payment_installments_sel, receipts_sel,
--            receivable_sel
--   KEEP  : bank_feed_txn_ins (role-based INSERT gate — not site_code-scoped)
--   CREATE: <table>_tenant_isolation SELECT policy on all 10 tables
--
-- Rollback: 0190_rollback.sql
-- pgTAP  : 0190_finance_accounting_domain_rls.sql (45 tests)
-- =============================================================================

-- ─── 1. ADD org_id COLUMNS ───────────────────────────────────────────────────
ALTER TABLE public.bank_feed_txn         ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.expense_category_map  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.finance_config        ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.job_cost_config       ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.job_cost_entries      ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.journal_entry         ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.journal_line          ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.payment_installments  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.receipts              ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.receivable            ADD COLUMN IF NOT EXISTS org_id uuid;

-- ─── 2. BACKFILL ─────────────────────────────────────────────────────────────

-- 2a. journal_entry — JOIN via installation_projects.site_code;
--     sentinel for NULL or unmatched site_code rows.
--     NOTE: must run before journal_line backfill below.
UPDATE public.journal_entry je
SET org_id = COALESCE(
  (SELECT ip.org_id
     FROM public.installation_projects ip
    WHERE ip.site_code = je.site_code
    LIMIT 1),
  '00000000-0000-0000-0000-000000000000'::uuid
)
WHERE je.org_id IS NULL;

-- 2b. journal_line — JOIN via journal_entry.org_id (backfilled in step 2a).
UPDATE public.journal_line jl
SET org_id = je.org_id
FROM public.journal_entry je
WHERE jl.journal_entry_id = je.id
  AND jl.org_id IS NULL;

-- 2c. bank_feed_txn — JOIN via installation_projects.site_code;
--     sentinel for NULL or unmatched site_code rows.
UPDATE public.bank_feed_txn bft
SET org_id = COALESCE(
  (SELECT ip.org_id
     FROM public.installation_projects ip
    WHERE ip.site_code = bft.site_code
    LIMIT 1),
  '00000000-0000-0000-0000-000000000000'::uuid
)
WHERE bft.org_id IS NULL;

-- 2d. receivable — JOIN via installation_projects.site_code;
--     sentinel for NULL or unmatched site_code rows.
UPDATE public.receivable r
SET org_id = COALESCE(
  (SELECT ip.org_id
     FROM public.installation_projects ip
    WHERE ip.site_code = r.site_code
    LIMIT 1),
  '00000000-0000-0000-0000-000000000000'::uuid
)
WHERE r.org_id IS NULL;

-- 2e. job_cost_entries — JOIN via installation_projects.org_id
--     (project_id is NOT NULL FK — all rows guaranteed a match).
UPDATE public.job_cost_entries jce
SET org_id = ip.org_id
FROM public.installation_projects ip
WHERE jce.project_id = ip.id
  AND jce.org_id IS NULL;

-- 2f. payment_installments — JOIN via installation_projects.org_id
--     (project_id is NOT NULL FK — all rows guaranteed a match).
UPDATE public.payment_installments pi
SET org_id = ip.org_id
FROM public.installation_projects ip
WHERE pi.project_id = ip.id
  AND pi.org_id IS NULL;

-- 2g. receipts — JOIN via installation_projects.org_id
--     (project_id is NOT NULL FK — all rows guaranteed a match).
UPDATE public.receipts rec
SET org_id = ip.org_id
FROM public.installation_projects ip
WHERE rec.project_id = ip.id
  AND rec.org_id IS NULL;

-- 2h. Config tables — sentinel UUID.
--     All reads go through SECURITY DEFINER RPCs; no per-tenant scoping needed.
UPDATE public.expense_category_map
SET org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE org_id IS NULL;

UPDATE public.finance_config
SET org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE org_id IS NULL;

UPDATE public.job_cost_config
SET org_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE org_id IS NULL;

-- ─── 3. NOT NULL ENFORCEMENT ─────────────────────────────────────────────────
-- All rows guaranteed to have org_id after backfill above.
ALTER TABLE public.bank_feed_txn         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.expense_category_map  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.finance_config        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.job_cost_config       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.job_cost_entries      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.journal_entry         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.journal_line          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.payment_installments  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.receipts              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.receivable            ALTER COLUMN org_id SET NOT NULL;

-- ─── 4. DROP OLD SELECT POLICIES ─────────────────────────────────────────────
-- bank_feed_txn_ins (INSERT write gate) is intentionally preserved.
DROP POLICY IF EXISTS bank_feed_txn_sel        ON public.bank_feed_txn;
DROP POLICY IF EXISTS expense_category_map_sel ON public.expense_category_map;
DROP POLICY IF EXISTS finance_config_sel       ON public.finance_config;
DROP POLICY IF EXISTS job_cost_config_sel      ON public.job_cost_config;
DROP POLICY IF EXISTS job_cost_entries_sel     ON public.job_cost_entries;
DROP POLICY IF EXISTS journal_entry_sel        ON public.journal_entry;
DROP POLICY IF EXISTS journal_line_sel         ON public.journal_line;
DROP POLICY IF EXISTS payment_installments_sel ON public.payment_installments;
DROP POLICY IF EXISTS receipts_sel             ON public.receipts;
DROP POLICY IF EXISTS receivable_sel           ON public.receivable;

-- ─── 5. CREATE TENANT-ISOLATION SELECT POLICIES ──────────────────────────────

-- bank_feed_txn: direct org_id isolation
CREATE POLICY bank_feed_txn_tenant_isolation
  ON public.bank_feed_txn FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- expense_category_map: global config — sentinel rows visible to all tenants
CREATE POLICY expense_category_map_tenant_isolation
  ON public.expense_category_map FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    OR org_id = '00000000-0000-0000-0000-000000000000'::uuid
  );

-- finance_config: global config — sentinel rows visible to all tenants
CREATE POLICY finance_config_tenant_isolation
  ON public.finance_config FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    OR org_id = '00000000-0000-0000-0000-000000000000'::uuid
  );

-- job_cost_config: global config — sentinel rows visible to all tenants
CREATE POLICY job_cost_config_tenant_isolation
  ON public.job_cost_config FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    OR org_id = '00000000-0000-0000-0000-000000000000'::uuid
  );

-- job_cost_entries: direct org_id isolation
CREATE POLICY job_cost_entries_tenant_isolation
  ON public.job_cost_entries FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- journal_entry: direct org_id isolation
CREATE POLICY journal_entry_tenant_isolation
  ON public.journal_entry FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- journal_line: direct org_id isolation (inherits org from parent journal_entry)
CREATE POLICY journal_line_tenant_isolation
  ON public.journal_line FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- payment_installments: direct org_id isolation
CREATE POLICY payment_installments_tenant_isolation
  ON public.payment_installments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- receipts: direct org_id isolation
CREATE POLICY receipts_tenant_isolation
  ON public.receipts FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- receivable: direct org_id isolation
CREATE POLICY receivable_tenant_isolation
  ON public.receivable FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());
