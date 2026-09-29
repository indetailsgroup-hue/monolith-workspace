-- =============================================================================
-- 0176_notification_preferences_rls.sql — pgTAP tests for migration 0176
--
-- Suite: 16 tests (T-0176-01 through T-0176-16)
-- Migration: 0176_notification_preferences_rls.sql
-- Purpose: Verify that the four tenant-isolation RLS policies added to
--          public.notification_preferences prevent cross-tenant SELECT,
--          INSERT, UPDATE, and DELETE access.
--
-- Test groups:
--   T-0176-01–T-0176-02  Structural: superuser check, RLS enabled
--   T-0176-03–T-0176-06  Structural: four policy names present in pg_policies
--   T-0176-07            SELECT isolation  (Beta sees 0 Alpha rows)
--   T-0176-08            INSERT rejection  (SQLSTATE 42501)
--   T-0176-09            UPDATE isolation  (0 rows affected)
--   T-0176-10            DELETE isolation  (0 rows affected)
--   T-0176-11            Own-org SELECT    (1 row visible)
--   T-0176-12            Own-org INSERT    (lives_ok)
--   T-0176-13            Own-org UPDATE    (1 row updated)
--   T-0176-14–T-0176-16  Alpha data integrity (row exists, org_id unchanged,
--                         no trojan row planted in Alpha org)
--
-- Design notes:
--   * notification_preferences carries a pre-existing policy prefs_own_only
--     (FOR ALL, USING user_id = auth.uid()). Under PostgreSQL permissive-policy
--     OR semantics an INSERT passes if *any* policy's WITH CHECK is true.
--     T-0176-08 therefore uses Alpha's user_id so both prefs_own_only AND
--     notification_preferences_tenant_insert fail, producing SQLSTATE 42501.
--     T-0176-12 uses gen_random_uuid() as user_id (bypasses prefs_own_only);
--     notification_preferences_tenant_insert passes on org_id alone.
--   * JWT must carry an org_id claim because get_user_org_id() reads
--     auth.jwt()->>'org_id'. This differs from cross_tenant_isolation.sql,
--     which omits org_id from the JWT.
--   * Runs inside BEGIN … ROLLBACK — no persistent state is written.
--   * SET LOCAL session_replication_role = replica bypasses FK checks on
--     notification_preferences.org_id → organizations(id) and user_id →
--     auth.users during fixture insertion.
--   * SET LOCAL row_security = off used only for fixture insertion.
--
-- Sentinel UUIDs:
--   Alpha org  : a1a1a1a1-0000-0000-0000-000000000001
--   Beta  org  : b2b2b2b2-0000-0000-0000-000000000001
--   Alpha user : a1a1a1a1-0000-0000-0001-000000000002
--   Beta  user : b2b2b2b2-0000-0000-0001-000000000002
--   Alpha pref : a1a1a1a1-0176-0000-0000-000000000001
--   Beta  pref : b2b2b2b2-0176-0000-0000-000000000001
-- =============================================================================

BEGIN;

SELECT plan(16);

-- ---------------------------------------------------------------------------
-- T-0176-01  Confirm test session is superuser
-- ---------------------------------------------------------------------------
SELECT ok(
  current_setting('is_superuser') = 'on',
  'T-0176-01: test session is superuser'
);

-- ---------------------------------------------------------------------------
-- T-0176-02  RLS is enabled on notification_preferences
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'notification_preferences'
  ),
  'T-0176-02: RLS must be enabled on public.notification_preferences'
);

-- ---------------------------------------------------------------------------
-- T-0176-03  Policy notification_preferences_tenant_isolation exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_preferences'
       AND policyname = 'notification_preferences_tenant_isolation'
  ),
  'T-0176-03: notification_preferences_tenant_isolation policy must exist'
);

-- ---------------------------------------------------------------------------
-- T-0176-04  Policy notification_preferences_tenant_insert exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_preferences'
       AND policyname = 'notification_preferences_tenant_insert'
  ),
  'T-0176-04: notification_preferences_tenant_insert policy must exist'
);

-- ---------------------------------------------------------------------------
-- T-0176-05  Policy notification_preferences_tenant_update exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_preferences'
       AND policyname = 'notification_preferences_tenant_update'
  ),
  'T-0176-05: notification_preferences_tenant_update policy must exist'
);

-- ---------------------------------------------------------------------------
-- T-0176-06  Policy notification_preferences_tenant_delete exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_preferences'
       AND policyname = 'notification_preferences_tenant_delete'
  ),
  'T-0176-06: notification_preferences_tenant_delete policy must exist'
);

-- ---------------------------------------------------------------------------
-- Fixture setup — plant rows for both tenants with row_security OFF
-- ---------------------------------------------------------------------------
SET LOCAL session_replication_role = replica;   -- bypass FK to auth.users / organizations
SET LOCAL row_security = off;

-- ── Organizations ─────────────────────────────────────────────────────────
INSERT INTO public.organizations (org_id, name, slug) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'Alpha Co', 'alpha-co'),
  ('b2b2b2b2-0000-0000-0000-000000000001', 'Beta  Co', 'beta-co')
ON CONFLICT (org_id) DO NOTHING;

-- ── Auth users + active tenant memberships used by get_user_org_id() ─────────
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0176@example.test'),
  ('b2b2b2b2-0000-0000-0001-000000000002', 'beta-0176@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, email, role, is_active) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002', 'alpha-0176@example.test', 'VIEWER', true),
  ('b2b2b2b2-0000-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002', 'beta-0176@example.test', 'VIEWER', true)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── Alpha notification_preferences ────────────────────────────────────────
INSERT INTO public.notification_preferences (id, user_id, org_id)
VALUES
  ('a1a1a1a1-0176-0000-0000-000000000001',
   'a1a1a1a1-0000-0000-0001-000000000002',   -- Alpha user_id
   'a1a1a1a1-0000-0000-0000-000000000001');  -- Alpha org_id

-- ── Beta notification_preferences ─────────────────────────────────────────
INSERT INTO public.notification_preferences (id, user_id, org_id)
VALUES
  ('b2b2b2b2-0176-0000-0000-000000000001',
   'b2b2b2b2-0000-0000-0001-000000000002',   -- Beta user_id
   'b2b2b2b2-0000-0000-0000-000000000001');  -- Beta org_id

-- ---------------------------------------------------------------------------
-- Switch to Beta user context
-- get_user_org_id() resolves auth.uid() through the active Beta membership.
-- ---------------------------------------------------------------------------
SET LOCAL row_security = on;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2b2b2b2-0000-0000-0001-000000000002","org_id":"b2b2b2b2-0000-0000-0000-000000000001","role":"authenticated"}',
  true   -- local to transaction
);

-- ===========================================================================
-- T-0176-07  SELECT isolation — Beta sees 0 Alpha rows
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.notification_preferences
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0::bigint,
  'T-0176-07: Beta sees 0 Alpha rows in notification_preferences'
);

-- ===========================================================================
-- T-0176-08  INSERT rejection — SQLSTATE 42501 (insufficient_privilege)
--
-- Uses Alpha user_id so that prefs_own_only (user_id = auth.uid()) fails AND
-- notification_preferences_tenant_insert (org_id = get_user_org_id()) fails.
-- Both permissive policies reject → 42501.
-- ===========================================================================
SELECT throws_ok(
  $$ INSERT INTO public.notification_preferences (id, user_id, org_id)
     VALUES (gen_random_uuid(),
             'a1a1a1a1-0000-0000-0001-000000000002',
             'a1a1a1a1-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  'T-0176-08: INSERT into notification_preferences with Alpha user_id + org_id is rejected (42501)'
);

-- ===========================================================================
-- T-0176-09  UPDATE isolation — Beta UPDATE on Alpha pref affects 0 rows
-- ===========================================================================
SELECT is_empty(
  $$ UPDATE public.notification_preferences
        SET global_mute = true
      WHERE id = 'a1a1a1a1-0176-0000-0000-000000000001'
      RETURNING 1 $$,
  'T-0176-09: Beta UPDATE on Alpha notification_preferences row affects 0 rows'
);

-- ===========================================================================
-- T-0176-10  DELETE isolation — Beta DELETE on Alpha pref affects 0 rows
--
-- DELETE uses a USING clause (silent filter) — no 42501 raised.
-- ===========================================================================
SELECT is_empty(
  $$ DELETE FROM public.notification_preferences
      WHERE id = 'a1a1a1a1-0176-0000-0000-000000000001'
      RETURNING 1 $$,
  'T-0176-10: Beta DELETE on Alpha notification_preferences row affects 0 rows'
);

-- ===========================================================================
-- T-0176-11  Own-org SELECT — Beta can see its own notification_preferences row
-- ===========================================================================
SELECT is(
  (SELECT COUNT(*) FROM public.notification_preferences
    WHERE id = 'b2b2b2b2-0176-0000-0000-000000000001'),
  1::bigint,
  'T-0176-11: Beta can SELECT its own notification_preferences row'
);

-- ===========================================================================
-- T-0176-12  Own-org INSERT — Beta can INSERT a pref into its own org
--
-- Uses gen_random_uuid() as user_id to avoid UNIQUE(user_id, org_id) conflict
-- with the Beta fixture row. prefs_own_only fails (random uid ≠ auth.uid())
-- but notification_preferences_tenant_insert passes (beta org_id =
-- get_user_org_id()); OR semantics allow the INSERT.
-- ===========================================================================
SELECT lives_ok(
  $$ INSERT INTO public.notification_preferences (id, user_id, org_id)
     VALUES (gen_random_uuid(), gen_random_uuid(),
             'b2b2b2b2-0000-0000-0000-000000000001') $$,
  'T-0176-12: Beta can INSERT notification_preferences row into its own org'
);

-- ===========================================================================
-- T-0176-13  Own-org UPDATE — Beta can UPDATE its own pref (1 row affected)
-- ===========================================================================
SELECT results_eq(
  $$ UPDATE public.notification_preferences
        SET global_mute = true
      WHERE id = 'b2b2b2b2-0176-0000-0000-000000000001'
      RETURNING 1 $$,
  $$ VALUES (1) $$,
  'T-0176-13: Beta UPDATE on its own notification_preferences row affects 1 row'
);

-- ===========================================================================
-- T-0176-14–T-0176-16  Alpha data integrity (superuser, row_security OFF)
-- ===========================================================================

RESET ROLE;
SET LOCAL row_security = off;

-- T-0176-14  Alpha pref row still exists after Beta DELETE attempt
SELECT is(
  (SELECT COUNT(*) FROM public.notification_preferences
    WHERE id = 'a1a1a1a1-0176-0000-0000-000000000001'),
  1::bigint,
  'T-0176-14: Alpha notification_preferences row still exists (not deleted by Beta)'
);

-- T-0176-15  Alpha pref org_id is unchanged after Beta UPDATE attempt
SELECT is(
  (SELECT org_id::text FROM public.notification_preferences
    WHERE id = 'a1a1a1a1-0176-0000-0000-000000000001'),
  'a1a1a1a1-0000-0000-0000-000000000001',
  'T-0176-15: Alpha notification_preferences org_id is unchanged after Beta UPDATE attempt'
);

-- T-0176-16  No trojan pref planted in Alpha org from Beta INSERT attempt
SELECT is(
  (SELECT COUNT(*) FROM public.notification_preferences
    WHERE org_id = 'a1a1a1a1-0000-0000-0000-000000000001'
      AND id     != 'a1a1a1a1-0176-0000-0000-000000000001'),
  0::bigint,
  'T-0176-16: No trojan notification_preferences row landed in Alpha org'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;
