-- =============================================================================
-- Rollback: 0190_rollback.sql
--
-- Reverses migration 0190_finance_accounting_domain_rls.sql
-- FOR CI IDEMPOTENCY TESTING ONLY — never apply to production.
--
-- Steps:
--   1. Drop all 10 *_tenant_isolation SELECT policies
--   2. Restore all 10 original SELECT policies (exact text from source DDL)
--   3. Drop NOT NULL constraints
--   4. Drop org_id columns
-- =============================================================================

-- ─── 1. DROP TENANT-ISOLATION POLICIES ───────────────────────────────────────
DROP POLICY IF EXISTS bank_feed_txn_tenant_isolation        ON public.bank_feed_txn;
DROP POLICY IF EXISTS expense_category_map_tenant_isolation ON public.expense_category_map;
DROP POLICY IF EXISTS finance_config_tenant_isolation       ON public.finance_config;
DROP POLICY IF EXISTS job_cost_config_tenant_isolation      ON public.job_cost_config;
DROP POLICY IF EXISTS job_cost_entries_tenant_isolation     ON public.job_cost_entries;
DROP POLICY IF EXISTS journal_entry_tenant_isolation        ON public.journal_entry;
DROP POLICY IF EXISTS journal_line_tenant_isolation         ON public.journal_line;
DROP POLICY IF EXISTS payment_installments_tenant_isolation ON public.payment_installments;
DROP POLICY IF EXISTS receipts_tenant_isolation             ON public.receipts;
DROP POLICY IF EXISTS receivable_tenant_isolation           ON public.receivable;

-- ─── 2. RESTORE ORIGINAL SELECT POLICIES ─────────────────────────────────────

-- bank_feed_txn — source: 0171_rpc_ledger_entries_bankfeed_realtime.sql
DROP POLICY IF EXISTS bank_feed_txn_sel ON public.bank_feed_txn;
CREATE POLICY bank_feed_txn_sel ON public.bank_feed_txn FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_app_role('finance')
    OR public.has_site_access(site_code));

-- expense_category_map — source: 0067_expense_category_map.sql
DROP POLICY IF EXISTS expense_category_map_sel ON public.expense_category_map;
CREATE POLICY expense_category_map_sel ON public.expense_category_map
  FOR SELECT TO authenticated USING (true);  -- config catalog; read-only

-- finance_config — source: 0137_finance_f3.sql
DROP POLICY IF EXISTS finance_config_sel ON public.finance_config;
CREATE POLICY finance_config_sel ON public.finance_config
  FOR SELECT TO authenticated USING (true);

-- job_cost_config — source: 0120_team_checkin.sql
DROP POLICY IF EXISTS job_cost_config_sel ON public.job_cost_config;
CREATE POLICY job_cost_config_sel ON public.job_cost_config
  FOR SELECT TO authenticated USING (true);

-- job_cost_entries — source: 0120_team_checkin.sql
DROP POLICY IF EXISTS job_cost_entries_sel ON public.job_cost_entries;
CREATE POLICY job_cost_entries_sel ON public.job_cost_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.installation_projects p WHERE p.id = project_id
      AND (public.is_governance_role() OR public.has_site_access(p.site_code))));

-- journal_entry — source: 0066_ledger_engine.sql
DROP POLICY IF EXISTS journal_entry_sel ON public.journal_entry;
CREATE POLICY journal_entry_sel ON public.journal_entry FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- journal_line — source: 0066_ledger_engine.sql
DROP POLICY IF EXISTS journal_line_sel ON public.journal_line;
CREATE POLICY journal_line_sel ON public.journal_line FOR SELECT TO authenticated
  USING (public.is_governance_role() OR EXISTS (
    SELECT 1 FROM public.journal_entry je WHERE je.id = journal_line.journal_entry_id
      AND public.has_site_access(je.site_code)));

-- payment_installments — source: 0108_payment_plan.sql
DROP POLICY IF EXISTS payment_installments_sel ON public.payment_installments;
CREATE POLICY payment_installments_sel ON public.payment_installments
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- receipts — source: 0137_finance_f3.sql
DROP POLICY IF EXISTS receipts_sel ON public.receipts;
CREATE POLICY receipts_sel ON public.receipts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.installation_projects p WHERE p.id = project_id
      AND (public.is_governance_role() OR public.has_site_access(p.site_code))));

-- receivable — source: 0075_receivables.sql
DROP POLICY IF EXISTS receivable_sel ON public.receivable;
CREATE POLICY receivable_sel ON public.receivable
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- ─── 3. DROP NOT NULL CONSTRAINTS ────────────────────────────────────────────
ALTER TABLE public.bank_feed_txn         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.expense_category_map  ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.finance_config        ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.job_cost_config       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.job_cost_entries      ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.journal_entry         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.journal_line          ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.payment_installments  ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.receipts              ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.receivable            ALTER COLUMN org_id DROP NOT NULL;

-- ─── 4. DROP org_id COLUMNS ──────────────────────────────────────────────────
ALTER TABLE public.bank_feed_txn         DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.expense_category_map  DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.finance_config        DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.job_cost_config       DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.job_cost_entries      DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.journal_entry         DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.journal_line          DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.payment_installments  DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.receipts              DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.receivable            DROP COLUMN IF EXISTS org_id;
