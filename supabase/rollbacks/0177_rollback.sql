-- ============================================================================
-- Rollback: 0177_rollback.sql
-- Created:   2026-08-28
-- Purpose:   Reverts 0177_audit_log_insert_hardening.sql for CI
--            forward-and-back idempotency testing.
--
-- Reverts the following changes made by 0177:
--
--   F5-1  DROP the restrictive INSERT policy "audit_logs_service_role_insert_validated"
--         and restore the original permissive "Service role inserts audit logs" WITH CHECK (true)
--   F5-2  DROP TRIGGER audit_log_insert_validate ON public.audit_logs
--   F5-3  DROP FUNCTION public.validate_audit_log_insert()
--   F5-4  DROP FUNCTION public.rpc_write_audit_log(...) and its grants
--
-- WARNING:  This file is ONLY for CI idempotency testing in a fresh database
--           context.  Do NOT apply to production.  Applying this rollback to
--           production re-opens the F5 spoofed actor_id / org_id vulnerability.
-- ============================================================================

BEGIN;

-- ============================================================================
-- REVERT F5-1 — Restore permissive INSERT policy on audit_logs
--
-- Drop the restrictive policy added by 0177 and recreate the original
-- "Service role inserts audit logs" WITH CHECK (true) from
-- 20260828_audit_log_usage_metering.sql.
-- ============================================================================

DROP POLICY IF EXISTS "audit_logs_service_role_insert_validated" ON public.audit_logs;

CREATE POLICY "Service role inserts audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- REVERT F5-2 — Drop the BEFORE INSERT trigger
-- ============================================================================

DROP TRIGGER IF EXISTS audit_log_insert_validate ON public.audit_logs;

-- ============================================================================
-- REVERT F5-3 — Drop the trigger function
-- ============================================================================

DROP FUNCTION IF EXISTS public.validate_audit_log_insert();

-- ============================================================================
-- REVERT F5-4 — Drop rpc_write_audit_log and its grants
--
-- Full parameter signature required to disambiguate the overload.
-- Grants are implicitly removed with the function.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_write_audit_log(
  UUID,   -- p_org_id
  TEXT,   -- p_actor_type
  TEXT,   -- p_actor_id
  TEXT,   -- p_action
  TEXT,   -- p_actor_name
  TEXT,   -- p_actor_email
  TEXT,   -- p_target_type
  TEXT,   -- p_target_id
  TEXT,   -- p_target_name
  JSONB,  -- p_metadata
  INET,   -- p_ip_address
  TEXT    -- p_user_agent
);

-- ============================================================================
-- Rollback assertion block
-- ============================================================================

DO $$
DECLARE
  v_old_policy_back   BOOLEAN;
  v_new_policy_gone   BOOLEAN;
  v_trigger_gone      BOOLEAN;
  v_fn_validate_gone  BOOLEAN;
  v_fn_rpc_gone       BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'audit_logs'
       AND policyname = 'Service role inserts audit logs'
  ) INTO v_old_policy_back;

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'audit_logs'
       AND policyname = 'audit_logs_service_role_insert_validated'
  ) INTO v_new_policy_gone;

  SELECT NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class   c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'audit_logs'
       AND t.tgname  = 'audit_log_insert_validate'
  ) INTO v_trigger_gone;

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'validate_audit_log_insert'
  ) INTO v_fn_validate_gone;

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_write_audit_log'
  ) INTO v_fn_rpc_gone;

  IF v_old_policy_back THEN
    RAISE NOTICE '0177_ROLLBACK ✅: "Service role inserts audit logs" policy restored';
  ELSE
    RAISE WARNING '0177_ROLLBACK ASSERTION: original INSERT policy not found after rollback';
  END IF;

  IF v_new_policy_gone THEN
    RAISE NOTICE '0177_ROLLBACK ✅: "audit_logs_service_role_insert_validated" policy removed';
  ELSE
    RAISE WARNING '0177_ROLLBACK ASSERTION: restrictive INSERT policy still present';
  END IF;

  IF v_trigger_gone THEN
    RAISE NOTICE '0177_ROLLBACK ✅: audit_log_insert_validate trigger removed';
  ELSE
    RAISE WARNING '0177_ROLLBACK ASSERTION: trigger still present on audit_logs';
  END IF;

  IF v_fn_validate_gone THEN
    RAISE NOTICE '0177_ROLLBACK ✅: validate_audit_log_insert() function removed';
  ELSE
    RAISE WARNING '0177_ROLLBACK ASSERTION: validate_audit_log_insert() still exists';
  END IF;

  IF v_fn_rpc_gone THEN
    RAISE NOTICE '0177_ROLLBACK ✅: rpc_write_audit_log() function removed';
  ELSE
    RAISE WARNING '0177_ROLLBACK ASSERTION: rpc_write_audit_log() still exists';
  END IF;

  RAISE NOTICE '0177_ROLLBACK: complete. F5 hardening reverted to pre-0177 state.';
END $$;

-- ============================================================================
-- END OF 0177_rollback.sql
-- ============================================================================
-- CI idempotency test sequence:
--   [ ] Apply 0177                → validate_audit_log_insert trigger present
--   [ ] Apply 0177_rollback       → trigger absent; old policy restored
--   [ ] Re-apply 0177             → trigger present again; no errors
-- ============================================================================

COMMIT;
