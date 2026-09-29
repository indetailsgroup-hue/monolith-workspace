-- =============================================================================
-- pgTAP Test Suite: 0179_f1_full_fix.sql
-- Tests: T-F1-01 → T-F1-14 (14 tests)
-- Covers:
--   T-F1-01..07  col_not_null — org_id is NOT NULL on all 7 legacy tables
--   T-F1-08      policy absent — write_customers (unscoped) is gone
--   T-F1-09      policy absent — write_jobs (unscoped) is gone
--   T-F1-10      policy exists — customers_tenant_delete exists
--   T-F1-11      policy exists — job_panels_tenant_update exists
--   T-F1-12      fk_ok        — fk_job_panel_org FK constraint exists
--   T-F1-13      fk_ok        — fk_quotation_line_org FK constraint exists
--   T-F1-14      fk_ok        — fk_invoice_payment_org FK constraint exists
--
-- Note: hasnt_policy/has_policy not available in bundled pgTAP — using
--       ok(NOT EXISTS / EXISTS (SELECT 1 FROM pg_policies ...)) instead.
-- =============================================================================

BEGIN;

SELECT plan(14);

-- ---------------------------------------------------------------------------
-- T-F1-01..07: org_id NOT NULL on all 7 legacy tables
-- col_not_null(schema, table, column, description)
-- ---------------------------------------------------------------------------

SELECT col_not_null(
  'public', 'customers', 'org_id',
  'T-F1-01: customers.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'jobs', 'org_id',
  'T-F1-02: jobs.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'job_panels', 'org_id',
  'T-F1-03: job_panels.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'quotations', 'org_id',
  'T-F1-04: quotations.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'quotation_lines', 'org_id',
  'T-F1-05: quotation_lines.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'invoices', 'org_id',
  'T-F1-06: invoices.org_id must be NOT NULL after 0179'
);

SELECT col_not_null(
  'public', 'invoice_payments', 'org_id',
  'T-F1-07: invoice_payments.org_id must be NOT NULL after 0179'
);

-- ---------------------------------------------------------------------------
-- T-F1-08..09: Unscoped write_* policies from 0172 must be gone
-- Replacement for hasnt_policy() (not in bundled pgTAP)
-- ---------------------------------------------------------------------------

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customers'
      AND policyname = 'write_customer'
  ),
  'T-F1-08: write_customer unscoped FOR ALL policy must be dropped by 0179'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'jobs'
      AND policyname = 'write_job'
  ),
  'T-F1-09: write_job unscoped FOR ALL policy must be dropped by 0179'
);

-- ---------------------------------------------------------------------------
-- T-F1-10..11: Org-scoped policies added by 0179 must exist
-- Replacement for has_policy() (not in bundled pgTAP)
-- ---------------------------------------------------------------------------

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'customers'
      AND policyname = 'customer_tenant_delete'
  ),
  'T-F1-10: customer_tenant_delete org-scoped DELETE policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'job_panels'
      AND policyname = 'job_panel_tenant_update'
  ),
  'T-F1-11: job_panel_tenant_update org-scoped UPDATE policy must exist (missed by 0173)'
);

-- ---------------------------------------------------------------------------
-- T-F1-12..14: FK constraints to organizations(org_id) on child tables
-- ---------------------------------------------------------------------------

SELECT ok(
  EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    WHERE  tc.table_schema    = 'public'
      AND  tc.table_name      = 'job_panels'
      AND  tc.constraint_name = 'fk_job_panel_org'
      AND  tc.constraint_type = 'FOREIGN KEY'
  ),
  'T-F1-12: fk_job_panel_org FK constraint must exist on job_panels'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    WHERE  tc.table_schema    = 'public'
      AND  tc.table_name      = 'quotation_lines'
      AND  tc.constraint_name = 'fk_quotation_line_org'
      AND  tc.constraint_type = 'FOREIGN KEY'
  ),
  'T-F1-13: fk_quotation_line_org FK constraint must exist on quotation_lines'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    WHERE  tc.table_schema    = 'public'
      AND  tc.table_name      = 'invoice_payments'
      AND  tc.constraint_name = 'fk_invoice_payment_org'
      AND  tc.constraint_type = 'FOREIGN KEY'
  ),
  'T-F1-14: fk_invoice_payment_org FK constraint must exist on invoice_payments'
);

SELECT * FROM finish();

ROLLBACK;
