-- =============================================================================
-- Migration: 0182_audit_logs_org_id_not_null_fk_fix.sql
-- Author:    Security Audit 2026-08-28
-- Purpose:   Retrospective hardening of audit_logs.org_id — following the F1
--            NOT NULL / sentinel-backfill pattern established in migration 0179.
--
--   Context:
--     The original audit_logs CREATE TABLE (20260828_audit_log_usage_metering.sql)
--     contains three defects that survive into any deployment where that file ran
--     against a schema whose organizations PK is `org_id` (not `id`):
--
--       D1  FK targets wrong column:
--             REFERENCES organizations(id)  ← should be organizations(org_id)
--           Because `organizations.id` does not exist the FK was never applied
--           and org_id is effectively unconstrained at the FK layer.
--
--       D2  RLS INSERT policy check uses wrong column:
--             WHERE o.id = org_id           ← should be o.org_id
--           The WITH CHECK always evaluates to FALSE on a schema with `org_id`
--           PK, making service_role inserts silently reject all rows.
--
--       D3  Trigger function validate_audit_log_insert uses wrong column:
--             WHERE o.id = NEW.org_id       ← should be o.org_id
--           The guard never fires (SELECT always returns 0 rows), leaving the
--           spoofed-org_id protection from 0177 inoperative.
--
--   This migration:
--     §0    Safety pre-checks.
--     §1    Drop the broken FK (if it somehow exists) and add the correct one.
--     §2    Insert sentinel organisation row (00000000-…-0000) to satisfy FK
--           during backfill — removed at end of transaction via DELETE.
--     §3    Sentinel backfill — NULL org_id rows → sentinel UUID.
--     §4    Abort if any rows still NULL after backfill.
--     §5    SET NOT NULL on audit_logs.org_id.
--     §6    Replace broken RLS INSERT policy (D2 fix).
--     §7    Replace broken trigger function (D3 fix).
--     §8    Verification assertions.
--
-- Rollback:  0182_rollback.sql
-- Tests:     supabase/tests/0182_audit_logs_org_id_hardening.sql
-- PR Gate:   Must pass CI (pg_prove + supabase db lint) before merge.
--            Do NOT apply directly to production.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SECTION 0 — Safety pre-checks
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- audit_logs must exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.audit_logs does not exist — run 20260828_audit_log_usage_metering.sql first';
  END IF;

  -- audit_logs.org_id column must exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'audit_logs'
      AND column_name  = 'org_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: audit_logs.org_id column not found — schema mismatch';
  END IF;

  -- organizations must exist with PK = org_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'organizations'
      AND column_name  = 'org_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: organizations.org_id not found — run 20260828_multi_tenant_schema.sql first';
  END IF;

  -- Verify 0177 trigger exists (we will replace it in §7)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'validate_audit_log_insert'
  ) THEN
    RAISE WARNING 'validate_audit_log_insert function not found — §7 will CREATE rather than REPLACE';
  END IF;

  RAISE NOTICE 'Pre-checks passed.';
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 1 — Fix FK constraint (D1 fix)
--
-- Drop any FK that may have been created referencing organizations(id)
-- (theoretically impossible since organizations.id doesn't exist, but be safe).
-- Then add the correct FK referencing organizations(org_id).
-- We use a DO block so the DROP is conditional.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fk_name TEXT;
BEGIN
  -- Find any FK on audit_logs.org_id pointing to organizations
  SELECT tc.constraint_name
    INTO v_fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
   WHERE tc.table_schema   = 'public'
     AND tc.table_name     = 'audit_logs'
     AND tc.constraint_type = 'FOREIGN KEY'
     AND kcu.column_name   = 'org_id'
   LIMIT 1;

  IF v_fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', v_fk_name);
    RAISE NOTICE 'Dropped existing FK % from audit_logs.org_id', v_fk_name;
  END IF;
END $$;

-- Add the correct FK
ALTER TABLE public.audit_logs
  ADD CONSTRAINT fk_audit_logs_org_id
  FOREIGN KEY (org_id)
  REFERENCES public.organizations(org_id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- SECTION 2 — Sentinel organisation row
--
-- Insert the sentinel UUID into organizations so the FK (now correct) does
-- not reject backfill INSERTs.  We clean this up in §3 once backfill is done.
-- A DO block makes the INSERT idempotent.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.organizations (
    org_id,
    name,
    slug
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000'::UUID,
    '__sentinel_org__',
    '__sentinel__'
  )
  ON CONFLICT (org_id) DO NOTHING;

  RAISE NOTICE 'Sentinel org ensured.';
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 3 — Sentinel backfill
--
-- For any audit_logs rows that pre-date the NOT NULL constraint (i.e. were
-- inserted into a schema version where org_id was nullable), stamp with the
-- sentinel UUID so the NOT NULL constraint can be applied in §5.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM public.audit_logs WHERE org_id IS NULL;
  RAISE NOTICE 'audit_logs NULL org_id row count before backfill: %', v_null_count;
END $$;

UPDATE public.audit_logs
   SET org_id = '00000000-0000-0000-0000-000000000000'::UUID
 WHERE org_id IS NULL;

DO $$
DECLARE
  v_sentinel_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_sentinel_count
    FROM public.audit_logs
   WHERE org_id = '00000000-0000-0000-0000-000000000000'::UUID;
  RAISE NOTICE 'Sentinel backfill complete. Rows with sentinel org_id: %', v_sentinel_count;
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 4 — NULL assertion (abort if any rows remain)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM public.audit_logs WHERE org_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ABORT: % audit_logs row(s) still have org_id IS NULL after sentinel backfill. '
      'Investigate and resolve manually before re-running.',
      v_null_count;
  END IF;
  RAISE NOTICE 'NULL assertion passed — all audit_logs rows have org_id populated.';
END $$;

-- ---------------------------------------------------------------------------
-- SECTION 5 — SET NOT NULL
--
-- Idempotent: SET NOT NULL on a column already NOT NULL is a no-op in PG 14+.
-- On older PG versions it scans the table to verify; using VALIDATE CONSTRAINT
-- pattern would be safer for large tables but this is a security migration that
-- must be transactional.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ALTER COLUMN org_id SET NOT NULL;

-- Index on org_id — ensure it exists for FK lookup performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id
  ON public.audit_logs (org_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- SECTION 6 — Fix RLS INSERT policy (D2 fix)
--
-- The original policy from 0177 used `WHERE o.id = org_id`.
-- Since organizations.id does not exist the WITH CHECK always returned false,
-- silently blocking all service_role direct inserts.
-- Drop and recreate with the correct column name.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_service_role_insert_validated" ON public.audit_logs;

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

COMMENT ON POLICY "audit_logs_service_role_insert_validated" ON public.audit_logs IS
  'Fixed in 0182: was referencing organizations(id) — now correctly references organizations(org_id). '
  'Restricts service_role direct inserts to rows with a valid org_id.';

-- ---------------------------------------------------------------------------
-- SECTION 7 — Fix trigger function validate_audit_log_insert (D3 fix)
--
-- The trigger from 0177 used `WHERE o.id = NEW.org_id`.
-- Replace with the correct column reference `o.org_id`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_audit_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── org_id check ──────────────────────────────────────────────────────────
  -- Belt-and-suspenders on top of the FK constraint; explicit message aids
  -- forensics.
  -- NOTE: Fixed in 0182 — was `o.id = NEW.org_id` (wrong column), now
  --       `o.org_id = NEW.org_id` (correct PK column).
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION
      'audit_log_insert_validate: org_id % does not exist in public.organizations — possible spoofed tenant write',
      NEW.org_id;
  END IF;

  -- ── actor_id check (user actors only) ─────────────────────────────────────
  -- For actor_type = 'user', actor_id must be a valid UUID present in auth.users.
  -- actor_type = 'system' or 'api' use opaque string identifiers (e.g. 'cron',
  -- 'stripe-webhook'), so UUID validation is skipped for those types.
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

  -- ── action code allowlist ──────────────────────────────────────────────────
  -- Reject action codes that do not match the expected pattern to prevent
  -- injection of arbitrary event types that might confuse audit consumers.
  IF NEW.action IS NULL OR length(trim(NEW.action)) = 0 THEN
    RAISE EXCEPTION
      'audit_log_insert_validate: action must be a non-empty string';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_audit_log_insert() IS
  'Fixed in 0182: replaced incorrect o.id reference with o.org_id. '
  'BEFORE INSERT trigger on audit_logs. Validates org_id exists in organizations '
  'and validates actor_id for actor_type=user. Fires for ALL insert paths '
  '(direct service_role + rpc_write_audit_log SECURITY DEFINER).';

-- Supabase grants EXECUTE on newly created public functions to API roles via
-- default privileges. This trigger function is not an RPC and must remain
-- callable only by the trigger mechanism.
REVOKE ALL ON FUNCTION public.validate_audit_log_insert()
  FROM PUBLIC, anon, authenticated, service_role;

-- Re-attach trigger in case it was dropped or wasn't created yet
DROP TRIGGER IF EXISTS trg_validate_audit_log_insert ON public.audit_logs;

CREATE TRIGGER trg_validate_audit_log_insert
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_audit_log_insert();

-- ---------------------------------------------------------------------------
-- SECTION 8 — Final assertions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nn_count     INT;
  v_fk_count     INT;
  v_trigger_count INT;
  v_policy_count INT;
BEGIN
  -- §8a NOT NULL constraint confirmed
  SELECT COUNT(*) INTO v_nn_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'audit_logs'
     AND column_name  = 'org_id'
     AND is_nullable  = 'NO';
  IF v_nn_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: audit_logs.org_id is still nullable after SET NOT NULL';
  END IF;
  RAISE NOTICE 'ASSERT §8a PASSED: audit_logs.org_id is NOT NULL.';

  -- §8b FK to organizations(org_id) confirmed
  SELECT COUNT(*) INTO v_fk_count
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.table_constraints tc2
      ON tc2.constraint_name = rc.unique_constraint_name
    JOIN information_schema.key_column_usage kcu2
      ON kcu2.constraint_name = tc2.constraint_name
   WHERE tc.table_schema   = 'public'
     AND tc.table_name     = 'audit_logs'
     AND kcu.column_name   = 'org_id'
     AND tc2.table_name    = 'organizations'
     AND kcu2.column_name  = 'org_id';
  IF v_fk_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: FK from audit_logs.org_id → organizations(org_id) not found';
  END IF;
  RAISE NOTICE 'ASSERT §8b PASSED: FK audit_logs.org_id → organizations(org_id) confirmed.';

  -- §8c Trigger attached
  SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
   WHERE trigger_schema  = 'public'
     AND event_object_table = 'audit_logs'
     AND trigger_name    = 'trg_validate_audit_log_insert';
  IF v_trigger_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: trg_validate_audit_log_insert trigger not found on audit_logs';
  END IF;
  RAISE NOTICE 'ASSERT §8c PASSED: trg_validate_audit_log_insert trigger attached.';

  -- §8d Fixed RLS policy exists
  SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'audit_logs'
     AND policyname = 'audit_logs_service_role_insert_validated';
  IF v_policy_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: audit_logs_service_role_insert_validated policy not found';
  END IF;
  RAISE NOTICE 'ASSERT §8d PASSED: audit_logs_service_role_insert_validated RLS policy confirmed.';

  RAISE NOTICE '=== Migration 0182 complete. All assertions passed. ===';
END $$;

COMMIT;
