-- =============================================================================
-- Rollback: 0179_rollback.sql
-- Reverts: 0179_f1_full_fix_org_id_not_null.sql
--
-- FOR CI IDEMPOTENCY TESTING ONLY — never apply to production.
-- This rollback is designed for a fresh database context where 0179 was just
-- applied and the database has no live tenant data in legacy tables.
--
-- Reverts in reverse order:
--   §6  DROP delete policies added by 0179
--   §5  DROP update policies for child tables added by 0179
--   §4  Re-create unscoped write_* FOR ALL policies from 0172
--   §3  DROP FK constraints on job_panel, quotation_line, invoice_payment
--   §2  DROP NOT NULL constraints on org_id (all 7 legacy tables)
--
-- §0.5 (recovery backfill) and §1 (assertion) are not reversible —
-- they affect row data not schema, so they are left as-is. A fresh CI
-- database has no rows and these are effectively no-ops.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- REVERT §6 — Drop org-scoped DELETE policies added by 0179
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "customer_tenant_delete"        ON customers;
DROP POLICY IF EXISTS "job_tenant_delete"             ON jobs;
DROP POLICY IF EXISTS "job_panel_tenant_delete"       ON job_panels;
DROP POLICY IF EXISTS "quotation_tenant_delete"       ON quotations;
DROP POLICY IF EXISTS "quotation_line_tenant_delete"  ON quotation_lines;
DROP POLICY IF EXISTS "invoice_tenant_delete"         ON invoices;
DROP POLICY IF EXISTS "invoice_payment_tenant_delete" ON invoice_payments;

-- ---------------------------------------------------------------------------
-- REVERT §5 — Drop child-table UPDATE policies added by 0179
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "job_panel_tenant_update"       ON job_panels;
DROP POLICY IF EXISTS "quotation_line_tenant_update"  ON quotation_lines;
DROP POLICY IF EXISTS "invoice_payment_tenant_update" ON invoice_payments;

-- ---------------------------------------------------------------------------
-- REVERT §4 — Re-create unscoped write_* FOR ALL policies from 0172
-- (CI forward-back test only — restores the intentionally-removed policies)
-- ---------------------------------------------------------------------------

-- customer
CREATE POLICY "write_customer" ON customers
  FOR ALL USING (
    has_app_role('sales') OR has_app_role('admin') OR is_governance_role()
  );

-- job
CREATE POLICY "write_job" ON jobs
  FOR ALL USING (
    has_app_role('production') OR has_app_role('admin') OR is_governance_role()
  );

-- job_panel
CREATE POLICY "write_panel" ON job_panels
  FOR ALL USING (
    has_app_role('production') OR has_app_role('admin') OR is_governance_role()
  );

-- quotation
CREATE POLICY "write_quotation" ON quotations
  FOR ALL USING (
    has_app_role('sales') OR has_app_role('admin') OR is_governance_role()
  );

-- quotation_line
CREATE POLICY "write_qt_line" ON quotation_lines
  FOR ALL USING (
    has_app_role('sales') OR has_app_role('admin') OR is_governance_role()
  );

-- invoice
CREATE POLICY "write_invoice" ON invoices
  FOR ALL USING (
    has_app_role('finance') OR has_app_role('admin') OR is_governance_role()
  );

-- invoice_payment
CREATE POLICY "write_payment" ON invoice_payments
  FOR ALL USING (
    has_app_role('finance') OR has_app_role('admin') OR is_governance_role()
  );

-- ---------------------------------------------------------------------------
-- REVERT §3 — Drop FK constraints on child tables
-- ---------------------------------------------------------------------------
ALTER TABLE job_panels       DROP CONSTRAINT IF EXISTS fk_job_panel_org;
ALTER TABLE quotation_lines  DROP CONSTRAINT IF EXISTS fk_quotation_line_org;
ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS fk_invoice_payment_org;

-- ---------------------------------------------------------------------------
-- REVERT §2 — Drop NOT NULL constraints on org_id (all 7 legacy tables)
-- ---------------------------------------------------------------------------
ALTER TABLE customers        ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE jobs             ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE job_panels       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE quotations       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE quotation_lines  ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE invoices         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE invoice_payments ALTER COLUMN org_id DROP NOT NULL;

RAISE NOTICE '0179 rollback complete — NOT NULL + FK constraints removed, write_* policies restored.';

COMMIT;
