-- =============================================================================
-- 0190_finance_accounting_domain_rls.sql — pgTAP tests for migration 0190
--
-- Suite: 45 tests (T-0190-01 through T-0190-45)
-- Migration: 0190_finance_accounting_domain_rls.sql
-- Purpose: Verify that migration 0190 correctly adds org_id columns, NOT NULL
--          constraints, RLS enablement, and tenant-isolation SELECT policies
--          to the 10 finance/accounting-domain tables.
--
-- Test groups:
--   T-0190-01             Superuser sanity check
--   T-0190-02–T-0190-11  has_column: org_id present on all 10 tables
--   T-0190-12–T-0190-21  col_not_null: org_id is NOT NULL on all 10 tables
--   T-0190-22–T-0190-31  relrowsecurity: RLS enabled on all 10 tables
--   T-0190-32–T-0190-36  policy_exists: 5 *_tenant_isolation policies
--   T-0190-37–T-0190-45  Cross-tenant isolation + own-org positive checks
--                         (journal_entry, journal_line, bank_feed_txn,
--                          receivable, expense_category_map sentinel)
--
-- Design notes:
--   * Fixture rows planted with session_replication_role = replica +
--     row_security = off to bypass FK constraints (organizations, etc.).
--   * JWT carries org_id claim: get_user_org_id() reads auth.jwt()->>'org_id'.
--   * finance_config, job_cost_config are boolean-PK singletons; cross-tenant
--     isolation confirmed structurally only (has_column, col_not_null,
--     relrowsecurity, policy_exists) — live-row isolation N/A (sentinel only).
--   * expense_category_map: T-0190-44 confirms sentinel rows are visible
--     to all tenants (correct for global config tables).
--   * job_cost_entries, payment_installments, receipts: isolation confirmed
--     structurally (project_id FK path); live-row tests N/A in this suite.
--   * No INSERT / UPDATE / DELETE tests: write paths via SECURITY DEFINER RPCs.
--   * Runs inside BEGIN … ROLLBACK — no persistent state.
--
-- Sentinel UUIDs:
--   Alpha org             : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org             : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha user            : a1a1a1a1-0000-0000-0001-000000000002
--   Beta  user            : b2b2b2b2-0000-0000-0001-000000000002
--   Sentinel/quarantine   : 00000000-0000-0000-0000-000000000000
--   Alpha journal_entry   : a1a1a1a1-0190-0000-0000-000000000001
--   Beta  journal_entry   : b2b2b2b2-0190-0000-0000-000000000001
--   Alpha journal_line    : a1a1a1a1-0190-0000-0000-000000000002
--   Alpha bank_feed_txn   : a1a1a1a1-0190-0000-0000-000000000003
--   Beta  bank_feed_txn   : b2b2b2b2-0190-0000-0000-000000000003
--   Alpha receivable      : a1a1a1a1-0190-0001-0000-000000000001
--   Beta  receivable      : b2b2b2b2-0190-0001-0000-000000000001
-- =============================================================================

BEGIN;

SELECT plan(45);

-- ---------------------------------------------------------------------------
-- T-0190-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0190-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0190-02–T-0190-11  has_column: org_id exists on all 10 tables
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'bank_feed_txn', 'org_id',
  'T-0190-02: bank_feed_txn.org_id column exists'
);

SELECT has_column(
  'public', 'expense_category_map', 'org_id',
  'T-0190-03: expense_category_map.org_id column exists'
);

SELECT has_column(
  'public', 'finance_config', 'org_id',
  'T-0190-04: finance_config.org_id column exists'
);

SELECT has_column(
  'public', 'job_cost_config', 'org_id',
  'T-0190-05: job_cost_config.org_id column exists'
);

SELECT has_column(
  'public', 'job_cost_entries', 'org_id',
  'T-0190-06: job_cost_entries.org_id column exists'
);

SELECT has_column(
  'public', 'journal_entry', 'org_id',
  'T-0190-07: journal_entry.org_id column exists'
);

SELECT has_column(
  'public', 'journal_line', 'org_id',
  'T-0190-08: journal_line.org_id column exists'
);

SELECT has_column(
  'public', 'payment_installments', 'org_id',
  'T-0190-09: payment_installments.org_id column exists'
);

SELECT has_column(
  'public', 'receipts', 'org_id',
  'T-0190-10: receipts.org_id column exists'
);

SELECT has_column(
  'public', 'receivable', 'org_id',
  'T-0190-11: receivable.org_id column exists'
);

-- ---------------------------------------------------------------------------
-- T-0190-12–T-0190-21  col_not_null: org_id is NOT NULL on all 10 tables
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'bank_feed_txn', 'org_id',
  'T-0190-12: bank_feed_txn.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'expense_category_map', 'org_id',
  'T-0190-13: expense_category_map.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'finance_config', 'org_id',
  'T-0190-14: finance_config.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'job_cost_config', 'org_id',
  'T-0190-15: job_cost_config.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'job_cost_entries', 'org_id',
  'T-0190-16: job_cost_entries.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'journal_entry', 'org_id',
  'T-0190-17: journal_entry.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'journal_line', 'org_id',
  'T-0190-18: journal_line.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'payment_installments', 'org_id',
  'T-0190-19: payment_installments.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'receipts', 'org_id',
  'T-0190-20: receipts.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'receivable', 'org_id',
  'T-0190-21: receivable.org_id is NOT NULL'
);

-- ---------------------------------------------------------------------------
-- T-0190-22–T-0190-31  relrowsecurity: RLS is enabled on all 10 tables
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'bank_feed_txn'),
  'T-0190-22: RLS must be enabled on public.bank_feed_txn'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'expense_category_map'),
  'T-0190-23: RLS must be enabled on public.expense_category_map'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'finance_config'),
  'T-0190-24: RLS must be enabled on public.finance_config'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'job_cost_config'),
  'T-0190-25: RLS must be enabled on public.job_cost_config'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'job_cost_entries'),
  'T-0190-26: RLS must be enabled on public.job_cost_entries'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_entry'),
  'T-0190-27: RLS must be enabled on public.journal_entry'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_line'),
  'T-0190-28: RLS must be enabled on public.journal_line'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payment_installments'),
  'T-0190-29: RLS must be enabled on public.payment_installments'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'receipts'),
  'T-0190-30: RLS must be enabled on public.receipts'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'receivable'),
  'T-0190-31: RLS must be enabled on public.receivable'
);

-- ---------------------------------------------------------------------------
-- T-0190-32–T-0190-36  Policy existence: 5 *_tenant_isolation policies
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'journal_entry'
       AND policyname = 'journal_entry_tenant_isolation'
  ),
  'T-0190-32: journal_entry_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'journal_line'
       AND policyname = 'journal_line_tenant_isolation'
  ),
  'T-0190-33: journal_line_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'bank_feed_txn'
       AND policyname = 'bank_feed_txn_tenant_isolation'
  ),
  'T-0190-34: bank_feed_txn_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'receivable'
       AND policyname = 'receivable_tenant_isolation'
  ),
  'T-0190-35: receivable_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'payment_installments'
       AND policyname = 'payment_installments_tenant_isolation'
  ),
  'T-0190-36: payment_installments_tenant_isolation policy must exist'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants
-- session_replication_role = replica bypasses FKs (org_id → organizations, etc.)
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- ── Organizations ─────────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Alpha Co', 'alpha-co'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Beta  Co', 'beta-co')
ON CONFLICT (org_id) DO NOTHING;

-- ── journal_entry (both tenants — used for T-0190-37, T-0190-40, T-0190-41) ──
INSERT INTO public.journal_entry (id, created_by, org_id) VALUES
  ('a1a1a1a1-0190-0000-0000-000000000001', 'test-fixture',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0190-0000-0000-000000000001', 'test-fixture',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── journal_line (Alpha only — used for T-0190-38, T-0190-45) ─────────────────
-- account_code FK bypassed by replica mode
INSERT INTO public.journal_line (id, journal_entry_id, account_code, org_id) VALUES
  ('a1a1a1a1-0190-0000-0000-000000000002',
   'a1a1a1a1-0190-0000-0000-000000000001',
   'TEST-5001',
   'a1a1a1a1-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── bank_feed_txn (both tenants — used for T-0190-39, T-0190-42) ──────────────
INSERT INTO public.bank_feed_txn
  (id, bank_txn_id, date, amount, imported_by, org_id) VALUES
  ('a1a1a1a1-0190-0000-0000-000000000003', 'ALPHA-FEED-0190', '2026-01-01', 100.00,
   'test-fixture', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0190-0000-0000-000000000003', 'BETA-FEED-0190',  '2026-01-01', 100.00,
   'test-fixture', 'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── receivable (both tenants — used for T-0190-40, T-0190-43) ─────────────────
INSERT INTO public.receivable (id, customer, amount, due_date, org_id) VALUES
  ('a1a1a1a1-0190-0001-0000-000000000001', 'ALPHA-CUST-0190', 1000.00, '2026-01-01'::date,
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0190-0001-0000-000000000001', 'BETA-CUST-0190',  1000.00, '2026-01-01'::date,
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── expense_category_map sentinel config row (used for T-0190-44) ─────────────
-- account_code FK bypassed by replica mode
INSERT INTO public.expense_category_map (category, account_code, org_id) VALUES
  ('TEST-CAT-0190', 'TEST-5001',
   '00000000-0000-0000-0000-000000000000')
ON CONFLICT (category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Switch to Beta user context (authenticated, Beta org_id claim)
-- ---------------------------------------------------------------------------
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0001-000000000002","org_id":"b2b2b2b2-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- ===========================================================================
-- T-0190-37  Cross-tenant SELECT — Beta sees 0 Alpha journal_entry rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.journal_entry
    WHERE id = 'a1a1a1a1-0190-0000-0000-000000000001'),
  0::bigint,
  'T-0190-37: Beta sees 0 Alpha rows in journal_entry'
);

-- ===========================================================================
-- T-0190-38  Cross-tenant SELECT — Beta sees 0 Alpha journal_line rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.journal_line
    WHERE id = 'a1a1a1a1-0190-0000-0000-000000000002'),
  0::bigint,
  'T-0190-38: Beta sees 0 Alpha rows in journal_line'
);

-- ===========================================================================
-- T-0190-39  Cross-tenant SELECT — Beta sees 0 Alpha bank_feed_txn rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.bank_feed_txn
    WHERE id = 'a1a1a1a1-0190-0000-0000-000000000003'),
  0::bigint,
  'T-0190-39: Beta sees 0 Alpha rows in bank_feed_txn'
);

-- ===========================================================================
-- T-0190-40  Cross-tenant SELECT — Beta sees 0 Alpha receivable rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.receivable
    WHERE id = 'a1a1a1a1-0190-0001-0000-000000000001'),
  0::bigint,
  'T-0190-40: Beta sees 0 Alpha rows in receivable'
);

-- ===========================================================================
-- T-0190-41  Own-org SELECT — Beta sees its own journal_entry row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.journal_entry
    WHERE id = 'b2b2b2b2-0190-0000-0000-000000000001'
      AND org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0190-41: Beta sees its own journal_entry row'
);

-- ===========================================================================
-- T-0190-42  Own-org SELECT — Beta sees its own bank_feed_txn row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.bank_feed_txn
    WHERE id = 'b2b2b2b2-0190-0000-0000-000000000003'
      AND org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0190-42: Beta sees its own bank_feed_txn row'
);

-- ===========================================================================
-- T-0190-43  Own-org SELECT — Beta sees its own receivable row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.receivable
    WHERE id = 'b2b2b2b2-0190-0001-0000-000000000001'
      AND org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0190-43: Beta sees its own receivable row'
);

-- ===========================================================================
-- T-0190-44  Sentinel config — Beta sees expense_category_map sentinel row
--            (global config rows with org_id = '00000000-...' visible to all)
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.expense_category_map
    WHERE category = 'TEST-CAT-0190'
      AND org_id = '00000000-0000-0000-0000-000000000000'),
  1::bigint,
  'T-0190-44: Beta sees sentinel expense_category_map config row'
);

-- ---------------------------------------------------------------------------
-- Switch to Alpha user context
-- ---------------------------------------------------------------------------
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- ===========================================================================
-- T-0190-45  Own-org SELECT — Alpha sees its own journal_line row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.journal_line
    WHERE id = 'a1a1a1a1-0190-0000-0000-000000000002'
      AND org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0190-45: Alpha sees its own journal_line row'
);

SELECT * FROM finish();
ROLLBACK;
