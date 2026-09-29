-- =============================================================================
-- 0186_critical_tables_rls.sql — pgTAP tests for migration 0186
--
-- Suite: 20 tests (T-0186-01 through T-0186-20)
-- Migration: 0186_critical_tables_rls.sql
-- Purpose: Verify that migration 0186 correctly adds org_id columns, NOT NULL
--          constraints, RLS enablement, and tenant-isolation SELECT policies
--          to the four CRITICAL workflow tables that had no org_id column.
--
-- Test groups:
--   T-0186-01          Superuser sanity check
--   T-0186-02–T-0186-05  has_column: org_id present on all four tables
--   T-0186-06–T-0186-09  col_not_null: org_id is NOT NULL on all four tables
--   T-0186-10–T-0186-13  relrowsecurity: RLS enabled on all four tables
--   T-0186-14–T-0186-17  Policy existence: four tenant_isolation policies
--   T-0186-18–T-0186-19  Cross-tenant SELECT isolation (Beta ✗ Alpha rows)
--   T-0186-20            Own-org SELECT (Alpha ✓ own work_item row)
--
-- Design notes:
--   * work_item and approval_request fixture rows are planted with
--     row_security = off + session_replication_role = replica (bypass FKs to
--     organizations, customer, and auth.users).
--   * get_user_org_id() resolves auth.uid() through active org_members rows.
--   * No INSERT / UPDATE / DELETE tests: all mutations on these tables go
--     through SECURITY DEFINER RPCs by design (0002 Req 10.3, 10.4); no
--     client write policies exist.
--   * Runs inside BEGIN … ROLLBACK — no persistent state.
--
-- Sentinel UUIDs:
--   Alpha org            : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org            : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha work_item      : a1a1a1a1-0186-0000-0000-000000000001
--   Beta  work_item      : b2b2b2b2-0186-0000-0000-000000000001
--   Alpha approval_req   : a1a1a1a1-0186-0001-0000-000000000001
--   Beta  approval_req   : b2b2b2b2-0186-0001-0000-000000000001
-- =============================================================================

BEGIN;

SELECT plan(20);

-- ---------------------------------------------------------------------------
-- T-0186-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0186-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0186-02–T-0186-05  has_column: org_id exists on all four tables
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'work_item', 'org_id',
  'T-0186-02: work_item.org_id column exists'
);

SELECT has_column(
  'public', 'approval_request', 'org_id',
  'T-0186-03: approval_request.org_id column exists'
);

SELECT has_column(
  'public', 'approval_decision', 'org_id',
  'T-0186-04: approval_decision.org_id column exists'
);

SELECT has_column(
  'public', 'capture_item', 'org_id',
  'T-0186-05: capture_item.org_id column exists'
);

-- ---------------------------------------------------------------------------
-- T-0186-06–T-0186-09  col_not_null: org_id is NOT NULL on all four tables
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'work_item', 'org_id',
  'T-0186-06: work_item.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'approval_request', 'org_id',
  'T-0186-07: approval_request.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'approval_decision', 'org_id',
  'T-0186-08: approval_decision.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'capture_item', 'org_id',
  'T-0186-09: capture_item.org_id is NOT NULL'
);

-- ---------------------------------------------------------------------------
-- T-0186-10–T-0186-13  relrowsecurity: RLS is enabled on all four tables
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'work_item'),
  'T-0186-10: RLS must be enabled on public.work_item'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'approval_request'),
  'T-0186-11: RLS must be enabled on public.approval_request'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'approval_decision'),
  'T-0186-12: RLS must be enabled on public.approval_decision'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'capture_item'),
  'T-0186-13: RLS must be enabled on public.capture_item'
);

-- ---------------------------------------------------------------------------
-- T-0186-14–T-0186-17  Policy existence: four tenant_isolation policies
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'work_item'
       AND policyname = 'work_item_tenant_isolation'
  ),
  'T-0186-14: work_item_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'approval_request'
       AND policyname = 'approval_request_tenant_isolation'
  ),
  'T-0186-15: approval_request_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'approval_decision'
       AND policyname = 'approval_decision_tenant_isolation'
  ),
  'T-0186-16: approval_decision_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'capture_item'
       AND policyname = 'capture_item_tenant_isolation'
  ),
  'T-0186-17: capture_item_tenant_isolation policy must exist'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants with row_security OFF
-- Bypasses FKs: org_id → organizations, work_item_id → work_item,
--               primary_customer_id → customer, auth.users, etc.
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL row_security = off;

-- ── Organizations ─────────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Alpha Co', 'alpha-co'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Beta  Co', 'beta-co')
ON CONFLICT (org_id) DO NOTHING;

-- ── Auth users + active tenant memberships used by get_user_org_id() ─────────
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0186@example.test'),
  ('b2b2b2b2-0000-0000-0001-000000000002', 'beta-0186@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, email, role, is_active) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0186@example.test', 'VIEWER', true),
  ('b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta-0186@example.test', 'VIEWER', true)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── work_item rows (all other columns have defaults) ─────────────────────────
INSERT INTO public.work_item (id, current_step, org_id) VALUES
  ('a1a1a1a1-0186-0000-0000-000000000001', 'design_review',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0186-0000-0000-000000000001', 'design_review',
   'b2b2b2b2-0000-0000-0000-000000000001');

-- ── approval_request rows ─────────────────────────────────────────────────────
INSERT INTO public.approval_request
  (id, work_item_id, process_step, resolved_approver, quorum,
   sla_deadline, timeout_at, org_id)
VALUES
  ('a1a1a1a1-0186-0001-0000-000000000001',
   'a1a1a1a1-0186-0000-0000-000000000001',
   'design_review', 'approver@alpha.co', 'unanimous',
   now() + interval '7 days', now() + interval '7 days',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0186-0001-0000-000000000001',
   'b2b2b2b2-0186-0000-0000-000000000001',
   'design_review', 'approver@beta.co',  'unanimous',
   now() + interval '7 days', now() + interval '7 days',
   'b2b2b2b2-0000-0000-0000-000000000001');

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
-- T-0186-18  Cross-tenant SELECT — Beta sees 0 Alpha work_item rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.work_item
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0186-18: Beta sees 0 Alpha rows in work_item'
);

-- ===========================================================================
-- T-0186-19  Cross-tenant SELECT — Beta sees 0 Alpha approval_request rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.approval_request
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0186-19: Beta sees 0 Alpha rows in approval_request'
);

-- ---------------------------------------------------------------------------
-- Switch to Alpha user context for own-org access test
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1a1a1a1-0000-0000-0001-000000000002","org_id":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- ===========================================================================
-- T-0186-20  Own-org SELECT — Alpha sees its own work_item row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.work_item
    WHERE id = 'a1a1a1a1-0186-0000-0000-000000000001'),
  1::bigint,
  'T-0186-20: Alpha can SELECT its own work_item row'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;
