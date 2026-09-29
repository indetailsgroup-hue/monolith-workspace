-- ============================================================================
-- Rollback: 0178_rollback.sql
-- Created:   2026-08-28
-- Purpose:   Reverts 0178_notification_platform_metrics_rls.sql for CI
--            forward-and-back idempotency testing.
--
-- Reverts:
--   F3  notification_digest_queue   — disable RLS; drop SELECT policy
--   F4  platform_metrics_snapshots  — disable RLS; drop SELECT + INSERT policies
--
-- WARNING:  This file is ONLY for CI idempotency testing in a fresh database
--           context.  Do NOT apply to production.  Applying to production
--           re-opens the F3 and F4 cross-tenant read vulnerabilities.
-- ============================================================================

BEGIN;

-- ============================================================================
-- REVERT F3 — notification_digest_queue
-- ============================================================================

DROP POLICY IF EXISTS "digest_queue_own_user_select" ON public.notification_digest_queue;

ALTER TABLE public.notification_digest_queue DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- REVERT F4 — platform_metrics_snapshots
-- ============================================================================

DROP POLICY IF EXISTS "platform_metrics_super_admin_select" ON public.platform_metrics_snapshots;
DROP POLICY IF EXISTS "platform_metrics_super_admin_insert" ON public.platform_metrics_snapshots;

ALTER TABLE public.platform_metrics_snapshots DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Rollback assertion block
-- ============================================================================

DO $$
DECLARE
  v_digest_rls_off  BOOLEAN;
  v_metrics_rls_off BOOLEAN;
BEGIN
  SELECT NOT relrowsecurity INTO v_digest_rls_off
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'notification_digest_queue';

  SELECT NOT relrowsecurity INTO v_metrics_rls_off
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'platform_metrics_snapshots';

  IF v_digest_rls_off THEN
    RAISE NOTICE '0178_ROLLBACK ✅: RLS disabled on notification_digest_queue';
  ELSE
    RAISE WARNING '0178_ROLLBACK ASSERTION: RLS still enabled on notification_digest_queue';
  END IF;

  IF v_metrics_rls_off THEN
    RAISE NOTICE '0178_ROLLBACK ✅: RLS disabled on platform_metrics_snapshots';
  ELSE
    RAISE WARNING '0178_ROLLBACK ASSERTION: RLS still enabled on platform_metrics_snapshots';
  END IF;

  RAISE NOTICE '0178_ROLLBACK: complete. F3 + F4 hardening reverted to pre-0178 state.';
END $$;

-- ============================================================================
-- END OF 0178_rollback.sql
-- ============================================================================
-- CI idempotency test sequence:
--   [ ] Apply 0178         → RLS on both tables; policies present
--   [ ] Apply 0178_rollback → RLS off; policies absent
--   [ ] Re-apply 0178      → RLS on again; no errors
-- ============================================================================

COMMIT;
