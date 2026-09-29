-- ============================================================================
-- pgTAP test suite: 0177_audit_log_insert_hardening.sql
-- Created:   2026-08-28
-- Covers:    F5 — audit_logs INSERT policy hardening
--
-- Tests (11):
--   T-F5-01  Old permissive policy "Service role inserts audit logs" is gone
--   T-F5-02  audit_log_insert_validate trigger exists on public.audit_logs
--   T-F5-03  validate_audit_log_insert() is SECURITY DEFINER
--   T-F5-04  rpc_write_audit_log() function exists in public schema
--   T-F5-05  rpc_write_audit_log() is SECURITY DEFINER
--   T-F5-06  rpc_write_audit_log body contains unauthenticated guard
--   T-F5-07  rpc_write_audit_log body contains org membership check
--   T-F5-08  rpc_write_audit_log body validates actor_id against auth.users
--   T-F5-09  rpc_write_audit_log is NOT executable by PUBLIC (REVOKE applied)
--   T-F5-10  validate_audit_log_insert body queries auth.users
--   T-F5-11  validate_audit_log_insert body queries public.organizations
--
-- Run with:  pg_prove -d "$DATABASE_URL" supabase/tests/0177_audit_log_insert_hardening.sql
-- ============================================================================

BEGIN;

SELECT plan(11);

-- ---------------------------------------------------------------------------
-- T-F5-01 — Permissive INSERT policy "Service role inserts audit logs" is gone
--
-- 0177 Section 1 drops this policy.  If it still appears in pg_policies the
-- F5 root-cause remains open.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'audit_logs'
       AND policyname = 'Service role inserts audit logs'
  ),
  'T-F5-01: "Service role inserts audit logs" policy must not exist on public.audit_logs'
);

-- ---------------------------------------------------------------------------
-- T-F5-02 — audit_log_insert_validate BEFORE INSERT trigger exists
--
-- 0177 Section 3 creates the trigger with exactly this name.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger  t
      JOIN pg_class    c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'audit_logs'
       AND t.tgname  = 'audit_log_insert_validate'
       AND t.tgtype & 2 > 0   -- BEFORE trigger bit
       AND t.tgtype & 4 > 0   -- FOR EACH ROW bit
  ),
  'T-F5-02: BEFORE INSERT trigger audit_log_insert_validate must exist on public.audit_logs'
);

-- ---------------------------------------------------------------------------
-- T-F5-03 — validate_audit_log_insert() is SECURITY DEFINER
--
-- Required so the trigger can access auth.users even from restricted roles.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname   = 'public'
       AND p.proname   = 'validate_audit_log_insert'
       AND p.prosecdef = TRUE    -- SECURITY DEFINER flag
  ),
  'T-F5-03: validate_audit_log_insert() must be SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- T-F5-04 — rpc_write_audit_log() function exists in public schema
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM information_schema.routines
     WHERE routine_schema = 'public'
       AND routine_name   = 'rpc_write_audit_log'
  ),
  'T-F5-04: public.rpc_write_audit_log() must exist'
);

-- ---------------------------------------------------------------------------
-- T-F5-05 — rpc_write_audit_log() is SECURITY DEFINER
--
-- Must execute with definer privileges so it can INSERT bypassing the
-- service_role-only INSERT policy when called by authenticated users.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname   = 'public'
       AND p.proname   = 'rpc_write_audit_log'
       AND p.prosecdef = TRUE
  ),
  'T-F5-05: rpc_write_audit_log() must be SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- T-F5-06 — rpc_write_audit_log body contains unauthenticated guard
--
-- The function body must contain the text `auth.uid() IS NULL` so that any
-- future edit cannot accidentally remove the unauthenticated-caller check.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'rpc_write_audit_log'
       AND pg_get_functiondef(p.oid) ILIKE '%auth.uid() IS NULL%'
  ),
  'T-F5-06: rpc_write_audit_log body must contain auth.uid() IS NULL unauthenticated guard'
);

-- ---------------------------------------------------------------------------
-- T-F5-07 — rpc_write_audit_log body contains org membership check
--
-- The error message "is not a member of org" is the sentinel string for the
-- membership guard.  Verifying it is present ensures the authorisation block
-- was not inadvertently removed.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'rpc_write_audit_log'
       AND pg_get_functiondef(p.oid) ILIKE '%is not a member of org%'
  ),
  'T-F5-07: rpc_write_audit_log body must contain org membership check sentinel text'
);

-- ---------------------------------------------------------------------------
-- T-F5-08 — rpc_write_audit_log body validates actor_id against auth.users
--
-- For actor_type = 'user' the function must look up auth.users to prevent
-- spoofed actor_ids being persisted in audit_logs.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'rpc_write_audit_log'
       AND pg_get_functiondef(p.oid) ILIKE '%auth.users%'
  ),
  'T-F5-08: rpc_write_audit_log body must validate actor_id via auth.users lookup'
);

-- ---------------------------------------------------------------------------
-- T-F5-09 — rpc_write_audit_log is NOT executable by PUBLIC
--
-- 0177 Section 4 runs REVOKE ALL ... FROM PUBLIC.  pg_has_function_privilege
-- returns FALSE when PUBLIC (= "public" pseudo-role) has no execute grant.
-- We test against the anon role which inherits PUBLIC grants; if PUBLIC was
-- properly revoked, anon cannot execute.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege(
    'anon',
    (
      SELECT p.oid::regprocedure::text
        FROM pg_proc     p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'rpc_write_audit_log'
       LIMIT 1
    ),
    'EXECUTE'
  ),
  'T-F5-09: rpc_write_audit_log must NOT be executable by anon (PUBLIC REVOKE applied)'
);

-- ---------------------------------------------------------------------------
-- T-F5-10 — validate_audit_log_insert body queries auth.users
--
-- The trigger function must contain an `auth.users` lookup so spoofed
-- actor_ids are rejected at the database level for all INSERT paths.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'validate_audit_log_insert'
       AND pg_get_functiondef(p.oid) ILIKE '%auth.users%'
  ),
  'T-F5-10: validate_audit_log_insert body must contain auth.users lookup'
);

-- ---------------------------------------------------------------------------
-- T-F5-11 — validate_audit_log_insert body queries public.organizations
--
-- Belt-and-suspenders org_id check: trigger must verify org_id existence in
-- public.organizations independently of the FK constraint.
-- ---------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_proc     p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname  = 'public'
       AND p.proname  = 'validate_audit_log_insert'
       AND pg_get_functiondef(p.oid) ILIKE '%public.organizations%'
  ),
  'T-F5-11: validate_audit_log_insert body must contain public.organizations existence check'
);

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;

-- ============================================================================
-- End of 0177_audit_log_insert_hardening.sql pgTAP suite
-- ============================================================================
