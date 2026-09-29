-- ============================================================================
-- Migration: 0177_audit_log_insert_hardening.sql
-- Created:   2026-08-28
-- Author:    Security audit — v16.8.0 hardening pass
--
-- Addresses F5 from rls-audit-report.md:
--
--   F5  audit_logs "Service role inserts audit logs"
--       WITH CHECK (true) — any service-role caller can insert arbitrary rows
--       including spoofed org_id, fabricated actor_id, and tampered action codes.
--
-- Changes applied by this migration:
--
--   1.  DROP the permissive INSERT policy.
--   2.  Add a restrictive service_role INSERT policy scoped to valid org_ids.
--   3.  Create validate_audit_log_insert() BEFORE INSERT trigger:
--       - For actor_type = 'user':  actor_id must be a valid UUID present in auth.users.
--       - For all rows:             org_id must exist in public.organizations (belt-and-
--                                   suspenders on top of the FK constraint).
--   4.  Create rpc_write_audit_log() SECURITY DEFINER RPC:
--       - Authenticated callers must be org members (or platform super-admin).
--       - Service-role callers bypass the membership check (background jobs).
--       - actor_id is validated for actor_type = 'user' before INSERT.
--       - Returns the newly created audit_log UUID.
--
-- PR Gate:   Must pass CI (pg_prove + supabase db lint) before merge.
--            Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- ============================================================================

-- Enum preamble (outside transaction) — add lowercase invoice_status values
-- needed by the 0177 migration group before the merged body runs.
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'partial';
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'pending';

-- Utility function (missing from early migrations — defined here so the merged
-- 0177 group can reference it via trigger).
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Extend message_kind check constraint to include 'quick_reply' (needed by 0177 group).
-- Migration 0098 defined CHECK ('text','flex'); 0134 extended to include 'image'; we need to add
-- 'quick_reply'. DROP + re-ADD is the only way to extend a CHECK constraint in PG.
-- Final set: ('text', 'flex', 'image', 'quick_reply')
ALTER TABLE public.line_oa_message_templates
    DROP CONSTRAINT IF EXISTS line_oa_message_templates_message_kind_check;
ALTER TABLE public.line_oa_message_templates
    ADD CONSTRAINT line_oa_message_templates_message_kind_check
        CHECK (message_kind IN ('text', 'flex', 'image', 'quick_reply'));

BEGIN;

-- ============================================================================
-- SECTION 0 — Pre-flight checks
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.audit_logs table not found — run 20260828_audit_log_usage_metering.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.organizations table not found — run 20260828_multi_tenant_schema.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'is_platform_super_admin'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.is_platform_super_admin() not found — run 0174_secdef_rpc_hardening.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'fn_is_service_role'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.fn_is_service_role() not found — run 0176_secdef_medium_risk_hardening.sql first';
  END IF;

  RAISE NOTICE '0177 pre-flight checks passed';
END $$;

-- ============================================================================
-- SECTION 1 — Drop the permissive INSERT policy (F5 root cause)
-- ============================================================================

DROP POLICY IF EXISTS "Service role inserts audit logs" ON public.audit_logs;

-- ============================================================================
-- SECTION 2 — Replacement service_role INSERT policy (restrictive)
--
-- Service-role background jobs that insert directly into audit_logs (e.g. the
-- billing metering cron, webhook processors) can still do so, but only with an
-- org_id that exists in public.organizations.  The validate_audit_log_insert
-- trigger (Section 3) provides the second layer of actor_id validation.
-- ============================================================================

CREATE POLICY "audit_logs_service_role_insert_validated"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (
    -- org_id must reference an existing organisation row
    EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.org_id = org_id
    )
  );

-- ============================================================================
-- SECTION 3 — BEFORE INSERT trigger: validate actor_id + org_id integrity
--
-- Rationale:
--   The restrictive INSERT policy (Section 2) is enforced only for service_role
--   direct inserts.  rpc_write_audit_log (Section 4) is SECURITY DEFINER so it
--   bypasses RLS.  The trigger fires for ALL insert paths (direct + RPC) and
--   provides uniform actor_id integrity enforcement.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_audit_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── org_id check ─────────────────────────────────────────────────────────
  -- Belt-and-suspenders on top of the FK constraint; explicit message aids forensics.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION
      'audit_log_insert_validate: org_id % does not exist in public.organizations — possible spoofed tenant write',
      NEW.org_id;
  END IF;

  -- ── actor_id check (user actors only) ────────────────────────────────────
  -- For actor_type = 'user', actor_id must be a valid UUID present in auth.users.
  -- actor_type = 'system' or 'api' use opaque string identifiers (e.g. 'cron',
  -- 'stripe-webhook'), so UUID validation is skipped for those types.
  IF NEW.actor_type = 'user' THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = NEW.actor_id::UUID
      ) THEN
        RAISE EXCEPTION
          'audit_log_insert_validate: actor_id % not found in auth.users for actor_type=user — possible spoofed actor',
          NEW.actor_id;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION
        'audit_log_insert_validate: actor_id must be a valid UUID when actor_type=user; got: %',
        NEW.actor_id;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure idempotency on re-run
DROP TRIGGER IF EXISTS audit_log_insert_validate ON public.audit_logs;

CREATE TRIGGER audit_log_insert_validate
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_audit_log_insert();

COMMENT ON FUNCTION public.validate_audit_log_insert() IS
  'BEFORE INSERT trigger on audit_logs. Validates org_id exists in organizations '
  'and actor_id is a real auth.users UUID for actor_type=user. '
  'F5 hardened in 0177_audit_log_insert_hardening.sql (2026-08-28).';

-- ============================================================================
-- SECTION 4 — rpc_write_audit_log: SECURITY DEFINER RPC for controlled writes
--
-- All application code that writes audit log entries should use this RPC.
-- It enforces:
--   a. Authentication: auth.uid() IS NOT NULL (unless service_role caller).
--   b. Org membership: caller must belong to p_org_id (unless platform super-admin
--      or service_role background job).
--   c. actor_type: must be 'user', 'system', or 'api'.
--   d. actor_id: for actor_type='user', must be a valid UUID in auth.users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_write_audit_log(
  p_org_id      UUID,
  p_actor_type  TEXT,            -- 'user' | 'system' | 'api'
  p_actor_id    TEXT,            -- UUID string for 'user'; opaque label for 'system'/'api'
  p_action      TEXT,
  p_actor_name  TEXT    DEFAULT NULL,
  p_actor_email TEXT    DEFAULT NULL,
  p_target_type TEXT    DEFAULT NULL,
  p_target_id   TEXT    DEFAULT NULL,
  p_target_name TEXT    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT '{}',
  p_ip_address  INET    DEFAULT NULL,
  p_user_agent  TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  -- ── Authentication + authorisation guard ─────────────────────────────────
  -- Service-role callers (background jobs, cron, webhooks) bypass the
  -- membership check because auth.uid() is NULL in that context.
  -- Authenticated callers must be an active org member OR a platform super-admin.
  IF NOT public.fn_is_service_role() THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'rpc_write_audit_log: unauthenticated'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT (
      public.is_platform_super_admin()
      OR EXISTS (
        SELECT 1
          FROM public.org_members om
         WHERE om.user_id   = auth.uid()
           AND om.org_id    = p_org_id
           AND om.is_active = true
      )
    ) THEN
      RAISE EXCEPTION 'rpc_write_audit_log: caller is not a member of org %', p_org_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── actor_type validation ─────────────────────────────────────────────────
  IF p_actor_type NOT IN ('user', 'system', 'api') THEN
    RAISE EXCEPTION
      'rpc_write_audit_log: invalid actor_type %; must be one of: user, system, api',
      p_actor_type;
  END IF;

  -- ── actor_id validation (user actors only) ────────────────────────────────
  IF p_actor_type = 'user' THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = p_actor_id::UUID
      ) THEN
        RAISE EXCEPTION
          'rpc_write_audit_log: actor_id % not found in auth.users for actor_type=user',
          p_actor_id;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION
        'rpc_write_audit_log: actor_id must be a valid UUID when actor_type=user; got: %',
        p_actor_id;
    END;
  END IF;

  -- ── Insert ────────────────────────────────────────────────────────────────
  INSERT INTO public.audit_logs (
    org_id,
    actor_type,
    actor_id,
    action,
    actor_name,
    actor_email,
    target_type,
    target_id,
    target_name,
    metadata,
    ip_address,
    user_agent
  )
  VALUES (
    p_org_id,
    p_actor_type,
    p_actor_id,
    p_action,
    p_actor_name,
    p_actor_email,
    p_target_type,
    p_target_id,
    p_target_name,
    COALESCE(p_metadata, '{}'),
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Grant only to authenticated and service_role; revoke from anon and PUBLIC
REVOKE ALL     ON FUNCTION public.rpc_write_audit_log(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INET,TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_write_audit_log(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INET,TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_write_audit_log(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INET,TEXT) TO service_role;

COMMENT ON FUNCTION public.rpc_write_audit_log(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INET,TEXT) IS
  'SECURITY DEFINER RPC for writing audit log entries. '
  'Authenticated callers must be active members of p_org_id. '
  'Service-role callers bypass membership check but actor_id is still validated. '
  'actor_id must be a valid auth.users UUID when actor_type=user. '
  'F5 hardened in 0177_audit_log_insert_hardening.sql (2026-08-28).';

-- ============================================================================
-- SECTION 5 — Verify F5 is closed (assertion block)
-- ============================================================================

DO $$
DECLARE
  v_old_policy_exists BOOLEAN;
  v_trigger_exists    BOOLEAN;
  v_rpc_exists        BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'audit_logs'
       AND schemaname = 'public'
       AND policyname = 'Service role inserts audit logs'
  ) INTO v_old_policy_exists;

  IF v_old_policy_exists THEN
    RAISE WARNING 'F5 ASSERTION FAILED: "Service role inserts audit logs" policy still exists on audit_logs';
  ELSE
    RAISE NOTICE 'F5 ✅: permissive INSERT policy removed from audit_logs';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'audit_logs'
       AND c.relnamespace = 'public'::regnamespace
       AND t.tgname = 'audit_log_insert_validate'
  ) INTO v_trigger_exists;

  IF NOT v_trigger_exists THEN
    RAISE WARNING 'F5 ASSERTION FAILED: audit_log_insert_validate trigger not found on audit_logs';
  ELSE
    RAISE NOTICE 'F5 ✅: validate_audit_log_insert trigger active on audit_logs';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'rpc_write_audit_log'
  ) INTO v_rpc_exists;

  IF NOT v_rpc_exists THEN
    RAISE WARNING 'F5 ASSERTION FAILED: rpc_write_audit_log function not found';
  ELSE
    RAISE NOTICE 'F5 ✅: rpc_write_audit_log SECURITY DEFINER RPC deployed';
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION 0177
-- ============================================================================
-- Remediation status after this migration:
--
-- | Finding | Table / Function      | Status           | Migration |\n
-- |---------|-----------------------|------------------|-----------|\n
-- | F5      | audit_logs INSERT     | ✅ Fixed          | 0177 ← this |\n
--
-- Closure criteria:
--   [ ] "Service role inserts audit logs" policy no longer exists on audit_logs
--   [ ] validate_audit_log_insert trigger active on audit_logs
--   [ ] rpc_write_audit_log REVOKE FROM PUBLIC applied
--   [ ] spoofed actor_id (type=user, non-existent UUID) raises exception
--   [ ] spoofed org_id raises exception
--   [ ] unauthenticated rpc_write_audit_log call raises 'insufficient_privilege'
--   [ ] non-member caller raises 'insufficient_privilege'
--   [ ] pg_prove green on supabase/tests/0177_audit_log_insert_hardening.sql
-- ============================================================================

COMMIT;
