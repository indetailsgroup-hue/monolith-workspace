-- ============================================================================
-- Migration: 0178_notification_platform_metrics_rls.sql
-- Created:   2026-08-28
-- Author:    Security audit — v16.8.0 hardening pass
--
-- Addresses F3 and F4 from rls-audit-report.md:
--
--   F3  notification_digest_queue   — No RLS enabled (HIGH, issue #49)
--       Any authenticated user can read pending digest jobs for all users/orgs.
--
--   F4  platform_metrics_snapshots  — No RLS enabled (MEDIUM, issue #50)
--       Any authenticated user can read platform-wide MRR, churn, and
--       plan distribution data.
--
-- Changes applied by this migration:
--
--   F3:
--     1. ALTER TABLE notification_digest_queue ENABLE ROW LEVEL SECURITY
--     2. SELECT policy: users can only see their own digest queue entries
--        (service_role background workers bypass RLS automatically)
--
--   F4:
--     3. ALTER TABLE platform_metrics_snapshots ENABLE ROW LEVEL SECURITY
--     4. SELECT policy: platform super-admins only (is_platform_super_admin())
--     5. INSERT policy: platform super-admins only
--        (service_role aggregation cron job bypasses RLS automatically)
--
-- PR Gate:   Must pass CI (pg_prove + supabase db lint) before merge.
--            Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 0 — Pre-flight safety checks
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'notification_digest_queue'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.notification_digest_queue not found — run 20260828_notifications_super_admin.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'platform_metrics_snapshots'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.platform_metrics_snapshots not found — run 20260828_notifications_super_admin.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'is_platform_super_admin'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.is_platform_super_admin() not found — run 0174_secdef_rpc_hardening.sql first';
  END IF;

  RAISE NOTICE '0178 pre-flight checks passed';
END $$;

-- ============================================================================
-- SECTION 1 — F3: Enable RLS on notification_digest_queue
--
-- Vulnerability (rls-audit-report.md §F3):
--   Table has user_id and org_id columns but no RLS. Any authenticated user
--   can enumerate pending digest jobs for all users and all orgs.
--
-- Fix:
--   Enable RLS. Add a SELECT policy so users can only see their own entries.
--   Background digest workers execute as service_role which bypasses RLS —
--   no INSERT/UPDATE/DELETE policies are needed for regular authenticated users.
-- ============================================================================

ALTER TABLE public.notification_digest_queue ENABLE ROW LEVEL SECURITY;

-- SELECT: each user sees only their own queued digest entries
-- DROP IF EXISTS: 0173_rls_isolation_hardening.sql also creates this policy
DROP POLICY IF EXISTS "digest_queue_own_user_select" ON public.notification_digest_queue;
CREATE POLICY "digest_queue_own_user_select"
  ON public.notification_digest_queue
  FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON POLICY "digest_queue_own_user_select" ON public.notification_digest_queue IS
  'Users may only SELECT their own digest queue entries. '
  'Background workers run as service_role and bypass RLS. '
  'F3 hardened in 0178_notification_platform_metrics_rls.sql (2026-08-28).';

-- ============================================================================
-- SECTION 2 — F4: Enable RLS on platform_metrics_snapshots
--
-- Vulnerability (rls-audit-report.md §F4):
--   Table holds sensitive business intelligence (MRR, churn, plan distribution)
--   with no RLS. Any authenticated user can SELECT all rows.
--
-- Fix:
--   Enable RLS. Restrict SELECT and INSERT to platform super-admins.
--   The daily aggregation cron executes as service_role and bypasses RLS —
--   it does not need an explicit INSERT policy.
-- ============================================================================

ALTER TABLE public.platform_metrics_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: platform super-admins only
DROP POLICY IF EXISTS "platform_metrics_super_admin_select" ON public.platform_metrics_snapshots;
CREATE POLICY "platform_metrics_super_admin_select"
  ON public.platform_metrics_snapshots
  FOR SELECT
  USING (public.is_platform_super_admin());

-- INSERT: super-admins only (belt-and-suspenders; cron bypasses via service_role)
DROP POLICY IF EXISTS "platform_metrics_super_admin_insert" ON public.platform_metrics_snapshots;
CREATE POLICY "platform_metrics_super_admin_insert"
  ON public.platform_metrics_snapshots
  FOR INSERT
  WITH CHECK (public.is_platform_super_admin());

COMMENT ON POLICY "platform_metrics_super_admin_select" ON public.platform_metrics_snapshots IS
  'Only platform super-admins may SELECT platform metrics (MRR, churn, plan distribution). '
  'F4 hardened in 0178_notification_platform_metrics_rls.sql (2026-08-28).';

COMMENT ON POLICY "platform_metrics_super_admin_insert" ON public.platform_metrics_snapshots IS
  'Only platform super-admins may INSERT via authenticated session. '
  'The daily aggregation cron runs as service_role (bypasses RLS). '
  'F4 hardened in 0178_notification_platform_metrics_rls.sql (2026-08-28).';

-- ============================================================================
-- SECTION 3 — Assertion block
-- ============================================================================

DO $$
DECLARE
  v_digest_rls_on   BOOLEAN;
  v_digest_policy   BOOLEAN;
  v_metrics_rls_on  BOOLEAN;
  v_metrics_select  BOOLEAN;
  v_metrics_insert  BOOLEAN;
BEGIN
  -- F3 assertions
  SELECT relrowsecurity INTO v_digest_rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'notification_digest_queue';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'notification_digest_queue'
       AND policyname = 'digest_queue_own_user_select'
  ) INTO v_digest_policy;

  -- F4 assertions
  SELECT relrowsecurity INTO v_metrics_rls_on
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'platform_metrics_snapshots';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_select'
  ) INTO v_metrics_select;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'platform_metrics_snapshots'
       AND policyname = 'platform_metrics_super_admin_insert'
  ) INTO v_metrics_insert;

  -- Report F3 status
  IF v_digest_rls_on THEN
    RAISE NOTICE 'F3 ✅: RLS enabled on notification_digest_queue';
  ELSE
    RAISE WARNING 'F3 ASSERTION FAILED: RLS not enabled on notification_digest_queue';
  END IF;

  IF v_digest_policy THEN
    RAISE NOTICE 'F3 ✅: digest_queue_own_user_select policy present';
  ELSE
    RAISE WARNING 'F3 ASSERTION FAILED: digest_queue_own_user_select policy not found';
  END IF;

  -- Report F4 status
  IF v_metrics_rls_on THEN
    RAISE NOTICE 'F4 ✅: RLS enabled on platform_metrics_snapshots';
  ELSE
    RAISE WARNING 'F4 ASSERTION FAILED: RLS not enabled on platform_metrics_snapshots';
  END IF;

  IF v_metrics_select THEN
    RAISE NOTICE 'F4 ✅: platform_metrics_super_admin_select policy present';
  ELSE
    RAISE WARNING 'F4 ASSERTION FAILED: platform_metrics_super_admin_select policy not found';
  END IF;

  IF v_metrics_insert THEN
    RAISE NOTICE 'F4 ✅: platform_metrics_super_admin_insert policy present';
  ELSE
    RAISE WARNING 'F4 ASSERTION FAILED: platform_metrics_super_admin_insert policy not found';
  END IF;

  RAISE NOTICE '0178 assertions complete.';
END $$;

-- ============================================================================
-- END OF MIGRATION 0178
-- ============================================================================
-- Remediation status after this migration:
--
-- | Finding | Table                        | Status      | Migration  |
-- |---------|------------------------------|-------------|------------|
-- | F3      | notification_digest_queue    | ✅ Fixed    | 0178 ← this |
-- | F4      | platform_metrics_snapshots   | ✅ Fixed    | 0178 ← this |
--
-- Closure criteria:
--   [ ] RLS enabled on notification_digest_queue
--   [ ] digest_queue_own_user_select policy present
--   [ ] RLS enabled on platform_metrics_snapshots
--   [ ] platform_metrics_super_admin_select policy present
--   [ ] platform_metrics_super_admin_insert policy present
--   [ ] pg_prove green on supabase/tests/0178_notification_platform_metrics_rls.sql
-- ============================================================================

COMMIT;
