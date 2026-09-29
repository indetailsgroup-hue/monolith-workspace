-- =============================================================================
-- 0188_factory_domain_rls.sql — pgTAP tests for migration 0188
--
-- Suite: 25 tests (T-0188-01 through T-0188-25)
-- Migration: 0188_factory_domain_rls.sql
-- Purpose: Verify that migration 0188 correctly adds org_id columns, NOT NULL
--          constraints, RLS enablement, and tenant-isolation SELECT policies
--          to the 5 factory-domain tables.
--
-- Test groups:
--   T-0188-01           Superuser sanity check
--   T-0188-02–T-0188-06 has_column: org_id present on all 5 tables
--   T-0188-07–T-0188-11 col_not_null: org_id is NOT NULL on all 5 tables
--   T-0188-12–T-0188-16 relrowsecurity: RLS enabled on all 5 tables
--   T-0188-17–T-0188-21 policy_exists: 5 *_tenant_isolation policies
--   T-0188-22–T-0188-24 Cross-tenant SELECT isolation
--                        (factory_jobs, factory_checkins, factory_job_events)
--   T-0188-25           Own-org SELECT (factory_jobs)
--
-- Design notes:
--   * Fixture rows planted with session_replication_role = replica +
--     row_security = off to bypass FK constraints (organizations, etc.).
--   * JWT carries org_id claim: get_user_org_id() reads auth.jwt()->>'org_id'.
--   * factory_gate_config and factory_station_checklists are shared config tables;
--     cross-tenant isolation is confirmed structurally (has_column, col_not_null,
--     relrowsecurity, policy_exists) — live row isolation is N/A because all reads
--     go through SECURITY DEFINER RPCs.
--   * No INSERT / UPDATE / DELETE tests: write path via SECURITY DEFINER RPCs
--     (Req 10.3/10.4); no client write policies exist.
--   * Runs inside BEGIN … ROLLBACK — no persistent state.
--
-- Sentinel UUIDs:
--   Alpha org                : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org                : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha factory_job        : 'JOB-ALPHA-0188' (text PK)
--   Beta  factory_job        : 'JOB-BETA-0188'  (text PK)
--   Alpha factory_job_event  : a1a1a1a1-0188-0001-0000-000000000001
--   Beta  factory_job_event  : b2b2b2b2-0188-0001-0000-000000000001
--   Alpha factory_checkin    : a1a1a1a1-0188-0002-0000-000000000001
--   Beta  factory_checkin    : b2b2b2b2-0188-0002-0000-000000000001
-- =============================================================================

BEGIN;

SELECT plan(25);

-- ---------------------------------------------------------------------------
-- T-0188-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0188-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0188-02–T-0188-06  has_column: org_id exists on all 5 tables
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'factory_checkins', 'org_id',
  'T-0188-02: factory_checkins.org_id column exists'
);

SELECT has_column(
  'public', 'factory_gate_config', 'org_id',
  'T-0188-03: factory_gate_config.org_id column exists'
);

SELECT has_column(
  'public', 'factory_job_events', 'org_id',
  'T-0188-04: factory_job_events.org_id column exists'
);

SELECT has_column(
  'public', 'factory_jobs', 'org_id',
  'T-0188-05: factory_jobs.org_id column exists'
);

SELECT has_column(
  'public', 'factory_station_checklists', 'org_id',
  'T-0188-06: factory_station_checklists.org_id column exists'
);

-- ---------------------------------------------------------------------------
-- T-0188-07–T-0188-11  col_not_null: org_id is NOT NULL on all 5 tables
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'factory_checkins', 'org_id',
  'T-0188-07: factory_checkins.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'factory_gate_config', 'org_id',
  'T-0188-08: factory_gate_config.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'factory_job_events', 'org_id',
  'T-0188-09: factory_job_events.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'factory_jobs', 'org_id',
  'T-0188-10: factory_jobs.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'factory_station_checklists', 'org_id',
  'T-0188-11: factory_station_checklists.org_id is NOT NULL'
);

-- ---------------------------------------------------------------------------
-- T-0188-12–T-0188-16  relrowsecurity: RLS is enabled on all 5 tables
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'factory_checkins'),
  'T-0188-12: RLS must be enabled on public.factory_checkins'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'factory_gate_config'),
  'T-0188-13: RLS must be enabled on public.factory_gate_config'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'factory_job_events'),
  'T-0188-14: RLS must be enabled on public.factory_job_events'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'factory_jobs'),
  'T-0188-15: RLS must be enabled on public.factory_jobs'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'factory_station_checklists'),
  'T-0188-16: RLS must be enabled on public.factory_station_checklists'
);

-- ---------------------------------------------------------------------------
-- T-0188-17–T-0188-21  Policy existence: 5 *_tenant_isolation policies
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'factory_checkins'
       AND policyname = 'factory_checkins_tenant_isolation'
  ),
  'T-0188-17: factory_checkins_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'factory_gate_config'
       AND policyname = 'factory_gate_config_tenant_isolation'
  ),
  'T-0188-18: factory_gate_config_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'factory_job_events'
       AND policyname = 'factory_job_events_tenant_isolation'
  ),
  'T-0188-19: factory_job_events_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'factory_jobs'
       AND policyname = 'factory_jobs_tenant_isolation'
  ),
  'T-0188-20: factory_jobs_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'factory_station_checklists'
       AND policyname = 'factory_station_checklists_tenant_isolation'
  ),
  'T-0188-21: factory_station_checklists_tenant_isolation policy must exist'
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

-- ── factory_jobs (text PK — used for T-0188-22, T-0188-24, T-0188-25) ─────────
INSERT INTO public.factory_jobs (job_id, spec_state, org_id) VALUES
  ('JOB-ALPHA-0188', 'DRAFT', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('JOB-BETA-0188',  'DRAFT', 'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (job_id) DO NOTHING;

-- ── factory_job_events (used for T-0188-24) ────────────────────────────────────
INSERT INTO public.factory_job_events (id, job_id, event, org_id) VALUES
  ('a1a1a1a1-0188-0001-0000-000000000001', 'JOB-ALPHA-0188', 'created',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0188-0001-0000-000000000001', 'JOB-BETA-0188',  'created',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── factory_checkins (used for T-0188-23) ─────────────────────────────────────
-- unique (site_code, work_date) — use distinct sites per tenant
INSERT INTO public.factory_checkins (id, site_code, work_date, org_id) VALUES
  ('a1a1a1a1-0188-0002-0000-000000000001', 'ALPHA-0188', '2026-01-01',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0188-0002-0000-000000000001', 'BETA-0188',  '2026-01-01',
   'b2b2b2b2-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ── org_members (Beta user) ───────────────────────────────────────────────
-- get_user_org_id() runs: SELECT org_id FROM public.org_members
--   WHERE user_id = auth.uid() AND is_active = true LIMIT 1
-- Without this row, get_user_org_id() returns NULL for the Beta JWT and
-- the tenant_isolation policy (org_id = get_user_org_id()) filters out
-- ALL rows including Beta's own — causing T-0188-25 to fail.
INSERT INTO public.org_members (member_id, org_id, user_id, email, role, is_active) VALUES
  ('b2b2b2b2-0000-0000-0188-000000000001'::uuid,
   'b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta-0188@example.test',
   'VIEWER', true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Switch to Beta user context (authenticated, Beta org_id claim)
-- ---------------------------------------------------------------------------
SET LOCAL row_security = on;

-- Grant SELECT to the authenticated role so T-0188-22–25 can query the tables.
-- Migration 0155 creates factory_jobs with a SELECT policy TO authenticated but
-- no GRANT; migration 0188 also adds no GRANTs.  Without a GRANT the role
-- receives "permission denied for table" before RLS is even evaluated.
-- These GRANTs are inside BEGIN … ROLLBACK and are rolled back at the end,
-- so they do not persist to the production schema.
GRANT SELECT ON public.factory_jobs        TO authenticated;
GRANT SELECT ON public.factory_checkins    TO authenticated;
GRANT SELECT ON public.factory_job_events  TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0001-000000000002","org_id":"b2b2b2b2-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- ===========================================================================
-- T-0188-22  Cross-tenant SELECT — Beta sees 0 Alpha factory_jobs rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.factory_jobs
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0188-22: Beta sees 0 Alpha rows in factory_jobs'
);

-- ===========================================================================
-- T-0188-23  Cross-tenant SELECT — Beta sees 0 Alpha factory_checkins rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.factory_checkins
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0188-23: Beta sees 0 Alpha rows in factory_checkins'
);

-- ===========================================================================
-- T-0188-24  Cross-tenant SELECT — Beta sees 0 Alpha factory_job_events rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.factory_job_events
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0188-24: Beta sees 0 Alpha rows in factory_job_events'
);

-- ===========================================================================
-- T-0188-25  Own-org SELECT — Beta sees its own factory_jobs row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.factory_jobs
    WHERE job_id = 'JOB-BETA-0188'
      AND org_id = 'b2b2b2b2-0000-0000-0000-000000000001'),
  1::bigint,
  'T-0188-25: Beta sees its own factory_jobs row'
);

SELECT * FROM finish();
ROLLBACK;
