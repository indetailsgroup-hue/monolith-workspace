-- ============================================================================
-- Rollback: 0173_rollback.sql
-- ⚠️  FOR CI IDEMPOTENCY TESTING ONLY — DO NOT RUN ON PRODUCTION ⚠️
-- Purpose : Fully reverse all changes made by 0173_rls_isolation_hardening.sql
--           so that 0173 can be cleanly re-applied on the same database.
-- Coverage: F1 org_id columns + indexes, org-scoped RLS policies,
--           SECURITY DEFINER RPC function drops,
--           F2/F3/F4 RLS disables, F6 Realtime restore.
-- Order   : Run AFTER 0173 is applied and BEFORE 0174.
--           If 0174/0175 are already applied, run their rollbacks first.
-- ============================================================================

BEGIN;

-- ── F6: Restore Realtime publication (removed by 0173 pending 0174 channel
--   policies — re-add here so CI state is deterministic between runs) ──────────
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;

-- ── F2: Drop org_invitations policies, disable RLS ───────────────────────────
DROP POLICY IF EXISTS "invitations_view_by_email" ON public.org_invitations;
DROP POLICY IF EXISTS "invitations_manage_admin"  ON public.org_invitations;
ALTER TABLE public.org_invitations DISABLE ROW LEVEL SECURITY;

-- ── F3: Drop notification_digest_queue policies, disable RLS ─────────────────
DROP POLICY IF EXISTS "digest_queue_own_user_select" ON notification_digest_queue;
DROP POLICY IF EXISTS "digest_queue_own_user_update" ON notification_digest_queue;
ALTER TABLE notification_digest_queue DISABLE ROW LEVEL SECURITY;

-- ── F4: Drop platform_metrics_snapshots policies, disable RLS ────────────────
DROP POLICY IF EXISTS "platform_metrics_super_admin_read"  ON platform_metrics_snapshots;
DROP POLICY IF EXISTS "platform_metrics_super_admin_write" ON platform_metrics_snapshots;
ALTER TABLE platform_metrics_snapshots DISABLE ROW LEVEL SECURITY;

-- ── F1: Drop org-scoped SECURITY DEFINER RPC functions added by 0173 ─────────
-- These functions were REPLACED (not created) by 0173. In CI the originals
-- were created by 0172; dropping here allows 0173 to re-apply its CREATE OR
-- REPLACE cleanly. In production, 0172's versions must be manually restored.
DROP FUNCTION IF EXISTS public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_job_board(TEXT, INT, INT);

-- ── F1: Drop org-scoped RLS policies on all seven tables ─────────────────────

-- UPDATE policies
DROP POLICY IF EXISTS "customer_tenant_update"           ON customers;
DROP POLICY IF EXISTS "job_tenant_update"                ON jobs;
DROP POLICY IF EXISTS "quotation_tenant_update"          ON quotations;
DROP POLICY IF EXISTS "invoice_tenant_update"            ON invoices;

-- INSERT policies
DROP POLICY IF EXISTS "customer_tenant_insert"           ON customers;
DROP POLICY IF EXISTS "job_tenant_insert"                ON jobs;
DROP POLICY IF EXISTS "job_panel_tenant_insert"          ON job_panels;
DROP POLICY IF EXISTS "quotation_tenant_insert"          ON quotations;
DROP POLICY IF EXISTS "quotation_line_tenant_insert"     ON quotation_lines;
DROP POLICY IF EXISTS "invoice_tenant_insert"            ON invoices;
DROP POLICY IF EXISTS "invoice_payment_tenant_insert"    ON invoice_payments;

-- SELECT (tenant isolation) policies
DROP POLICY IF EXISTS "customer_tenant_isolation"        ON customers;
DROP POLICY IF EXISTS "job_tenant_isolation"             ON jobs;
DROP POLICY IF EXISTS "job_panel_tenant_isolation"       ON job_panels;
DROP POLICY IF EXISTS "quotation_tenant_isolation"       ON quotations;
DROP POLICY IF EXISTS "quotation_line_tenant_isolation"  ON quotation_lines;
DROP POLICY IF EXISTS "invoice_tenant_isolation"         ON invoices;
DROP POLICY IF EXISTS "invoice_payment_tenant_isolation" ON invoice_payments;

-- ── F1: Drop org_id indexes ───────────────────────────────────────────────────
-- CONCURRENTLY cannot run inside a transaction block; use plain DROP here
-- since CI runs in a controlled single-connection context.
DROP INDEX IF EXISTS idx_customer_org;
DROP INDEX IF EXISTS idx_job_org;
DROP INDEX IF EXISTS idx_job_panel_org;
DROP INDEX IF EXISTS idx_quotation_org;
DROP INDEX IF EXISTS idx_quotation_line_org;
DROP INDEX IF EXISTS idx_invoice_org;
DROP INDEX IF EXISTS idx_invoice_payment_org;

-- ── F1: Drop org_id columns (safe: CI fresh-database context) ─────────────────
-- CASCADE is required for columns that have dependent FK constraints created
-- by 0173 (the ADD COLUMN ... REFERENCES organizations(org_id) form).
ALTER TABLE customers        DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE jobs             DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE job_panels       DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE quotations       DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE quotation_lines  DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE invoices         DROP COLUMN IF EXISTS org_id CASCADE;
ALTER TABLE invoice_payments DROP COLUMN IF EXISTS org_id CASCADE;

COMMIT;

-- ============================================================================
-- Post-rollback verification (run manually in CI to confirm state):
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name   IN ('customer','job','job_panel','quotation',
--                          'quotation_line','invoice','invoice_payment')
--     AND column_name  = 'org_id';
--   -- Expected: 0 rows
--
--   SELECT policyname, tablename FROM pg_policies
--   WHERE policyname LIKE '%tenant%';
--   -- Expected: 0 rows
--
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('org_invitations','notification_digest_queue',
--                       'platform_metrics_snapshots')
--     AND rowsecurity = true;
--   -- Expected: 0 rows
-- ============================================================================
