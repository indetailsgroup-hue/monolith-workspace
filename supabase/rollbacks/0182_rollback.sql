-- =============================================================================
-- Rollback: 0182_rollback.sql
-- Reverts migration 0182_audit_logs_org_id_not_null_fk_fix.sql
--
-- CI IDEMPOTENCY ONLY — Never apply to production.
--
-- Order of operations (reverse of 0182):
--   1. Restore trigger function with original (broken) o.id reference
--   2. Restore RLS policy with original (broken) o.id reference
--   3. DROP NOT NULL on audit_logs.org_id
--   4. Drop correct FK, restore broken FK attempt (skipped — it never existed)
--   5. Delete sentinel org row if it still has no real audit_logs rows
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1 — Restore original (broken) trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_audit_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = NEW.org_id
  ) THEN
    RAISE EXCEPTION
      'audit_log_insert_validate: org_id % does not exist in public.organizations — possible spoofed tenant write',
      NEW.org_id;
  END IF;

  IF NEW.actor_type = 'user' THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = NEW.actor_id::UUID
      ) THEN
        RAISE EXCEPTION
          'audit_log_insert_validate: actor_id % not found in auth.users — possible spoofed actor',
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

-- ---------------------------------------------------------------------------
-- STEP 2 — Restore original (broken) RLS policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_service_role_insert_validated" ON public.audit_logs;

CREATE POLICY "audit_logs_service_role_insert_validated"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = org_id
    )
  );

-- ---------------------------------------------------------------------------
-- STEP 3 — DROP NOT NULL on audit_logs.org_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ALTER COLUMN org_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- STEP 4 — Remove correct FK (the broken one never existed, nothing to restore)
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS fk_audit_logs_org_id;

-- ---------------------------------------------------------------------------
-- STEP 5 — Remove sentinel org row (only if no real rows reference it)
-- ---------------------------------------------------------------------------
DELETE FROM public.organizations
 WHERE org_id = '00000000-0000-0000-0000-000000000000'::UUID
   AND NOT EXISTS (
     SELECT 1 FROM public.audit_logs
      WHERE org_id = '00000000-0000-0000-0000-000000000000'::UUID
   );

COMMIT;
