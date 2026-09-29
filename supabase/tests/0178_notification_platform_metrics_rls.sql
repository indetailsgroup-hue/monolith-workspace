-- ============================================================================
-- pgTAP test suite: 0178_notification_platform_metrics_rls.sql
-- Created:   2026-08-28
-- Covers:    F3 — notification_digest_queue RLS
--            F4 — platform_metrics_snapshots RLS
--
-- Tests (10):
--   T-F3-01  RLS is enabled on notification_digest_queue
--   T-F3-02  digest_queue_own_user_select policy exists
--   T-F3-03  digest_queue_own_user_select is a FOR SELECT policy
--   T-F3-04  digest_queue_own_user_select USING clause references auth.uid()
--   T-F3-05  No permissive cross-tenant SELECT policy on notification_digest_queue
--   T-F4-01  RLS is enabled on platform_metrics_snapshots
--   T-F4-02  platform_metrics_super_admin_select policy exists
--   T-F4-03  platform_metrics_super_admin_select is a FOR SELECT policy
--   T-F4-04  platform_metrics_super_admin_insert policy exists
--   T-F4-05  platform_metrics_super_admin_insert is a FOR INSERT policy
--
-- Run with:  pg_prove -d "$DATABASE_URL" supabase/tests/0178_notification_platform_metrics_rls.sql
-- ============================================================================

BEGIN;

SELECT plan(10);

-- ===========================================================================
-- F3 — notification_digest_queue
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- T-F3-01 — RLS is enabled on notification_digest_queue
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'notification_digest_queue'
  ),
  'T-F3-01: RLS must be enabled on public.notification_digest_queue'
);

-- ---------------------------------------------------------------------------
-- T-F3-02 — digest_queue_own_user_select policy exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_digest_queue'
       AND policyname = 'digest_queue_own_user_select'
  ),
  'T-F3-02: digest_queue_own_user_select policy must exist on notification_digest_queue'
);

-- ---------------------------------------------------------------------------
-- T-F3-03 — digest_queue_own_user_select is a FOR SELECT policy
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_digest_queue'
       AND policyname = 'digest_queue_own_user_select'
       AND cmd        = 'SELECT'
  ),
  'T-F3-03: digest_queue_own_user_select must be a FOR SELECT policy'
);

-- ---------------------------------------------------------------------------
-- T-F3-04 — digest_queue_own_user_select USING clause references auth.uid()
--
-- Verify the policy body was not accidentally replaced with a permissive
-- USING (true) or USING (1=1) clause.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_digest_queue'
       AND policyname = 'digest_queue_own_user_select'
       AND qual       ILIKE '%user_id%'
       AND qual       ILIKE '%uid()%'
  ),
  'T-F3-04: digest_queue_own_user_select USING clause must reference auth.uid()'
);

-- ---------------------------------------------------------------------------
-- T-F3-05 — No permissive cross-tenant SELECT policy on notification_digest_queue
--
-- Ensures no policy with USING (true) / USING (1=1) exists that would bypass
-- the per-user scoping.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_digest_queue'
       AND cmd        = 'SELECT'
       AND permissive = 'PERMISSIVE'
       AND (qual = 'true' OR qual = '(1 = 1)')
  ),
  'T-F3-05: No USING (true) permissive SELECT policy must exist on notification_digest_queue'
);

-- ===========================================================================
-- F4 — platform_metrics_snapshots
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- T-F4-01 — RLS is enabled on platform_metrics_snapshots
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'platform_metrics_snapshots'
  ),
  'T-F4-01: RLS must be enabled on public.platform_metrics_snapshots'
);

-- ---------------------------------------------------------------------------
-- T-F4-02 — platform_metrics_super_admin_select policy exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_select'
  ),
  'T-F4-02: platform_metrics_super_admin_select policy must exist on platform_metrics_snapshots'
);

-- ---------------------------------------------------------------------------
-- T-F4-03 — platform_metrics_super_admin_select is a FOR SELECT policy
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_select'
       AND cmd        = 'SELECT'
  ),
  'T-F4-03: platform_metrics_super_admin_select must be a FOR SELECT policy'
);

-- ---------------------------------------------------------------------------
-- T-F4-04 — platform_metrics_super_admin_insert policy exists
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_insert'
  ),
  'T-F4-04: platform_metrics_super_admin_insert policy must exist on platform_metrics_snapshots'
);

-- ---------------------------------------------------------------------------
-- T-F4-05 — platform_metrics_super_admin_insert is a FOR INSERT policy
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_insert'
       AND cmd        = 'INSERT'
  ),
  'T-F4-05: platform_metrics_super_admin_insert must be a FOR INSERT policy'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;

-- ============================================================================
-- End of 0178_notification_platform_metrics_rls.sql pgTAP suite
-- ============================================================================
