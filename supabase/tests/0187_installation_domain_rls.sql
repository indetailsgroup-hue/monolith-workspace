-- =============================================================================
-- 0187_installation_domain_rls.sql — pgTAP tests for migration 0187
--
-- Suite: 53 tests (T-0187-01 through T-0187-53)
-- Migration: 0187_installation_domain_rls.sql
-- Purpose: Verify that migration 0187 correctly adds org_id columns, NOT NULL
--          constraints, RLS enablement, and tenant-isolation SELECT policies
--          to the 12 installation-domain and production_milestones tables.
--
-- Test groups:
--   T-0187-01           Superuser sanity check
--   T-0187-02–T-0187-13 has_column: org_id present on all 12 tables
--   T-0187-14–T-0187-25 col_not_null: org_id is NOT NULL on all 12 tables
--   T-0187-26–T-0187-37 relrowsecurity: RLS enabled on all 12 tables
--   T-0187-38–T-0187-49 Policy existence: 12 *_tenant_isolation policies
--   T-0187-50–T-0187-52 Cross-tenant SELECT isolation
--                        (installation_projects, installation_rooms,
--                         production_milestones)
--   T-0187-53           Own-org SELECT (installation_projects)
--
-- Design notes:
--   * Fixture rows planted with session_replication_role = replica +
--     row_security = off to bypass FK constraints (organizations, work_item,
--     auth.users, etc.).
--   * JWT carries org_id claim: get_user_org_id() reads auth.jwt()->>'org_id'.
--   * No INSERT / UPDATE / DELETE tests: write path via SECURITY DEFINER RPCs
--     (Req 10.3/10.4); no client write policies exist.
--   * Runs inside BEGIN … ROLLBACK — no persistent state.
--
-- Sentinel UUIDs:
--   Alpha org                  : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org                  : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha installation_project : a1a1a1a1-0187-0000-0000-000000000001
--   Beta  installation_project : b2b2b2b2-0187-0000-0000-000000000001
--   Alpha installation_room    : a1a1a1a1-0187-0001-0000-000000000001
--   Beta  installation_room    : b2b2b2b2-0187-0001-0000-000000000001
--   Alpha production_milestone : a1a1a1a1-0187-0002-0000-000000000001
--   Beta  production_milestone : b2b2b2b2-0187-0002-0000-000000000001
-- =============================================================================

BEGIN;

SELECT plan(53);

-- ---------------------------------------------------------------------------
-- T-0187-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0187-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0187-02–T-0187-13  has_column: org_id exists on all 12 tables
-- ---------------------------------------------------------------------------
SELECT has_column(
  'public', 'installation_projects', 'org_id',
  'T-0187-02: installation_projects.org_id column exists'
);

SELECT has_column(
  'public', 'installation_rooms', 'org_id',
  'T-0187-03: installation_rooms.org_id column exists'
);

SELECT has_column(
  'public', 'installation_tasks', 'org_id',
  'T-0187-04: installation_tasks.org_id column exists'
);

SELECT has_column(
  'public', 'installation_photos', 'org_id',
  'T-0187-05: installation_photos.org_id column exists'
);

SELECT has_column(
  'public', 'installation_photo_annotations', 'org_id',
  'T-0187-06: installation_photo_annotations.org_id column exists'
);

SELECT has_column(
  'public', 'installation_field_reports', 'org_id',
  'T-0187-07: installation_field_reports.org_id column exists'
);

SELECT has_column(
  'public', 'installation_approvals', 'org_id',
  'T-0187-08: installation_approvals.org_id column exists'
);

SELECT has_column(
  'public', 'installation_audit_log', 'org_id',
  'T-0187-09: installation_audit_log.org_id column exists'
);

SELECT has_column(
  'public', 'installation_memberships', 'org_id',
  'T-0187-10: installation_memberships.org_id column exists'
);

SELECT has_column(
  'public', 'installation_issues', 'org_id',
  'T-0187-11: installation_issues.org_id column exists'
);

SELECT has_column(
  'public', 'installation_plans', 'org_id',
  'T-0187-12: installation_plans.org_id column exists'
);

SELECT has_column(
  'public', 'production_milestones', 'org_id',
  'T-0187-13: production_milestones.org_id column exists'
);

-- ---------------------------------------------------------------------------
-- T-0187-14–T-0187-25  col_not_null: org_id is NOT NULL on all 12 tables
-- ---------------------------------------------------------------------------
SELECT col_not_null(
  'public', 'installation_projects', 'org_id',
  'T-0187-14: installation_projects.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_rooms', 'org_id',
  'T-0187-15: installation_rooms.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_tasks', 'org_id',
  'T-0187-16: installation_tasks.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_photos', 'org_id',
  'T-0187-17: installation_photos.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_photo_annotations', 'org_id',
  'T-0187-18: installation_photo_annotations.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_field_reports', 'org_id',
  'T-0187-19: installation_field_reports.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_approvals', 'org_id',
  'T-0187-20: installation_approvals.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_audit_log', 'org_id',
  'T-0187-21: installation_audit_log.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_memberships', 'org_id',
  'T-0187-22: installation_memberships.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_issues', 'org_id',
  'T-0187-23: installation_issues.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'installation_plans', 'org_id',
  'T-0187-24: installation_plans.org_id is NOT NULL'
);

SELECT col_not_null(
  'public', 'production_milestones', 'org_id',
  'T-0187-25: production_milestones.org_id is NOT NULL'
);

-- ---------------------------------------------------------------------------
-- T-0187-26–T-0187-37  relrowsecurity: RLS is enabled on all 12 tables
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_projects'),
  'T-0187-26: RLS must be enabled on public.installation_projects'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_rooms'),
  'T-0187-27: RLS must be enabled on public.installation_rooms'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_tasks'),
  'T-0187-28: RLS must be enabled on public.installation_tasks'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_photos'),
  'T-0187-29: RLS must be enabled on public.installation_photos'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_photo_annotations'),
  'T-0187-30: RLS must be enabled on public.installation_photo_annotations'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_field_reports'),
  'T-0187-31: RLS must be enabled on public.installation_field_reports'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_approvals'),
  'T-0187-32: RLS must be enabled on public.installation_approvals'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_audit_log'),
  'T-0187-33: RLS must be enabled on public.installation_audit_log'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_memberships'),
  'T-0187-34: RLS must be enabled on public.installation_memberships'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_issues'),
  'T-0187-35: RLS must be enabled on public.installation_issues'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installation_plans'),
  'T-0187-36: RLS must be enabled on public.installation_plans'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'production_milestones'),
  'T-0187-37: RLS must be enabled on public.production_milestones'
);

-- ---------------------------------------------------------------------------
-- T-0187-38–T-0187-49  Policy existence: 12 *_tenant_isolation policies
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_projects'
       AND policyname = 'installation_projects_tenant_isolation'
  ),
  'T-0187-38: installation_projects_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_rooms'
       AND policyname = 'installation_rooms_tenant_isolation'
  ),
  'T-0187-39: installation_rooms_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_tasks'
       AND policyname = 'installation_tasks_tenant_isolation'
  ),
  'T-0187-40: installation_tasks_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_photos'
       AND policyname = 'installation_photos_tenant_isolation'
  ),
  'T-0187-41: installation_photos_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_photo_annotations'
       AND policyname = 'installation_photo_annotations_tenant_isolation'
  ),
  'T-0187-42: installation_photo_annotations_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_field_reports'
       AND policyname = 'installation_field_reports_tenant_isolation'
  ),
  'T-0187-43: installation_field_reports_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_approvals'
       AND policyname = 'installation_approvals_tenant_isolation'
  ),
  'T-0187-44: installation_approvals_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_audit_log'
       AND policyname = 'installation_audit_log_tenant_isolation'
  ),
  'T-0187-45: installation_audit_log_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_memberships'
       AND policyname = 'installation_memberships_tenant_isolation'
  ),
  'T-0187-46: installation_memberships_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_issues'
       AND policyname = 'installation_issues_tenant_isolation'
  ),
  'T-0187-47: installation_issues_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'installation_plans'
       AND policyname = 'installation_plans_tenant_isolation'
  ),
  'T-0187-48: installation_plans_tenant_isolation policy must exist'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'production_milestones'
       AND policyname = 'production_milestones_tenant_isolation'
  ),
  'T-0187-49: production_milestones_tenant_isolation policy must exist'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants
-- session_replication_role = replica bypasses FKs (org_id → organizations,
-- project_id → installation_projects, work_item_id → work_item, etc.)
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
  ('a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0187@example.test'),
  ('b2b2b2b2-0000-0000-0001-000000000002', 'beta-0187@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, email, role, is_active) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0187@example.test', 'VIEWER', true),
  ('b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta-0187@example.test', 'VIEWER', true)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── installation_projects (root of the hierarchy) ─────────────────────────────
INSERT INTO public.installation_projects (id, name, status, created_by, org_id)
VALUES
  ('a1a1a1a1-0187-0000-0000-000000000001',
   'Alpha Project', 'active', 'system',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0187-0000-0000-000000000001',
   'Beta  Project', 'active', 'system',
   'b2b2b2b2-0000-0000-0000-000000000001');

-- ── installation_rooms (Level 2 child — used for T-0187-51) ───────────────────
INSERT INTO public.installation_rooms
  (id, project_id, room_type, display_name, org_id)
VALUES
  ('a1a1a1a1-0187-0001-0000-000000000001',
   'a1a1a1a1-0187-0000-0000-000000000001',
   'bedroom', 'Master Bedroom',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0187-0001-0000-000000000001',
   'b2b2b2b2-0187-0000-0000-000000000001',
   'bedroom', 'Master Bedroom',
   'b2b2b2b2-0000-0000-0000-000000000001');

-- ── production_milestones (used for T-0187-52) ────────────────────────────────
INSERT INTO public.production_milestones
  (id, project_id, station, reported_by, org_id)
VALUES
  ('a1a1a1a1-0187-0002-0000-000000000001',
   'a1a1a1a1-0187-0000-0000-000000000001',
   'laminate', 'system',
   'a1a1a1a1-0000-0000-0000-000000000001'),
  ('b2b2b2b2-0187-0002-0000-000000000001',
   'b2b2b2b2-0187-0000-0000-000000000001',
   'laminate', 'system',
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
-- T-0187-50  Cross-tenant SELECT — Beta sees 0 Alpha installation_projects rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.installation_projects
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0187-50: Beta sees 0 Alpha rows in installation_projects'
);

-- ===========================================================================
-- T-0187-51  Cross-tenant SELECT — Beta sees 0 Alpha installation_rooms rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.installation_rooms
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0187-51: Beta sees 0 Alpha rows in installation_rooms'
);

-- ===========================================================================
-- T-0187-52  Cross-tenant SELECT — Beta sees 0 Alpha production_milestones rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.production_milestones
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0187-52: Beta sees 0 Alpha rows in production_milestones'
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
-- T-0187-53  Own-org SELECT — Alpha sees its own installation_projects row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.installation_projects
    WHERE id = 'a1a1a1a1-0187-0000-0000-000000000001'),
  1::bigint,
  'T-0187-53: Alpha can SELECT its own installation_projects row'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;
