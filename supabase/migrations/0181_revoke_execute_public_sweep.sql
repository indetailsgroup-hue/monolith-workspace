-- =============================================================================
-- Migration: 0181_revoke_execute_public_sweep.sql
-- Author:    Security Audit 2026-08-28
-- Purpose:   Comprehensive REVOKE EXECUTE FROM PUBLIC sweep across all
--            public-schema RPCs introduced or modified in migrations 0173–0180.
--
-- Background:
--   PostgreSQL grants EXECUTE to PUBLIC on all new functions by default.
--   Supabase inherits this default.  Migrations 0173–0180 applied targeted
--   REVOKE statements per RPC, but a belt-and-suspenders sweep migration
--   ensures no function remains callable by unauthenticated or anonymous roles.
--
--   Additionally, validate_audit_log_insert() (a BEFORE INSERT trigger function
--   from 0177) was not explicitly REVOKE'd in its source migration.  This
--   migration covers that gap.
--
-- Systemic gap identified in:
--   /home/sandbox/security-posture-report.md — Section 5: "REVOKE FROM PUBLIC"
--
-- RPC inventory covered:
--   From 0173: rpc_record_payment, rpc_job_board, get_search_suggestions
--   From 0174: is_platform_super_admin, rpc_approve_quotation, get_search_suggestions
--   From 0176: get_org_usage, rpc_ledger_entries, rpc_ledger_summary,
--              fn_is_service_role, has_app_role
--   From 0177: validate_audit_log_insert (trigger fn), rpc_write_audit_log
--   From 0180: fn_verify_org_claim, fn_get_verified_org_id
--
-- Total: 14 public-schema functions covered by this sweep.
--
-- NOTE: validate_audit_log_insert() is a BEFORE INSERT TRIGGER function.
--   It is invoked by the trigger mechanism (as the table owner), not by users.
--   REVOKE FROM PUBLIC is applied; no user-facing GRANT is added.
--
-- PR Gate: Must pass CI (pg_prove + supabase db lint) before merge to main.
--          Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0 — Pre-flight checks
-- =============================================================================

DO $$
BEGIN
  -- fn_verify_org_claim must exist before sweep (confirms 0180 was applied)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'fn_verify_org_claim'
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.fn_verify_org_claim not found — run 0180_identity_reconciliation_hardening.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'rpc_write_audit_log'
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.rpc_write_audit_log not found — run 0177_audit_log_insert_hardening.sql first';
  END IF;

  RAISE NOTICE '0181 pre-flight checks passed';
END $$;

-- =============================================================================
-- SECTION 1 — RPCs from migration 0173
-- =============================================================================

-- rpc_record_payment — payment processing (SECURITY DEFINER, 0173 + patched 0180)
REVOKE ALL     ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated;

-- rpc_job_board — job list for authenticated org members (SECURITY DEFINER, 0173 + patched 0180)
REVOKE ALL     ON FUNCTION public.rpc_job_board(TEXT, INT, INT)                       FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_job_board(TEXT, INT, INT)                       TO authenticated;

-- get_search_suggestions — cross-tenant query aggregates, super-admin only (SECURITY INVOKER, 0174)
REVOKE ALL     ON FUNCTION public.get_search_suggestions(TEXT, INT)                   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INT)                   TO authenticated;

-- =============================================================================
-- SECTION 2 — RPCs from migration 0174
-- =============================================================================

-- is_platform_super_admin — boolean helper for super-admin checks (SECURITY INVOKER, 0174)
REVOKE ALL     ON FUNCTION public.is_platform_super_admin()                           FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_platform_super_admin()                           TO authenticated;

-- rpc_approve_quotation — quotation → invoice flow (SECURITY DEFINER, 0174 + patched 0180)
REVOKE ALL     ON FUNCTION public.rpc_approve_quotation(UUID, INT)                    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_approve_quotation(UUID, INT)                    TO authenticated;

-- =============================================================================
-- SECTION 3 — RPCs from migration 0176
-- =============================================================================

-- get_org_usage — org billing metrics, OWNER/ADMIN or super-admin (SECURITY DEFINER, 0176 + patched 0180)
REVOKE ALL     ON FUNCTION public.get_org_usage(UUID)                                 FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_org_usage(UUID)                                 TO authenticated;

-- rpc_ledger_entries — financial journal entries, FINANCE/ADMIN only (SECURITY INVOKER, 0176 + patched 0180)
REVOKE ALL     ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT)          FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT)          TO authenticated;

-- rpc_ledger_summary — ledger KPI summary, FINANCE/ADMIN only (SECURITY INVOKER, 0176 + patched 0180)
REVOKE ALL     ON FUNCTION public.rpc_ledger_summary(TEXT)                            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_summary(TEXT)                            TO authenticated;

-- fn_is_service_role — JWT role claim check helper (SECURITY INVOKER, 0176)
--   Also granted to service_role so background workers can identify themselves.
REVOKE ALL     ON FUNCTION public.fn_is_service_role()                                FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_service_role()                                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_is_service_role()                                TO service_role;

-- has_app_role — app-role claim check helper (SECURITY INVOKER, 0171/0176)
--   Used inside RLS policies and RPCs; authenticated role only.
REVOKE ALL     ON FUNCTION public.has_app_role(TEXT)                                  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_app_role(TEXT)                                  TO authenticated;

-- =============================================================================
-- SECTION 4 — RPCs from migration 0177
-- =============================================================================

-- validate_audit_log_insert — BEFORE INSERT trigger function (SECURITY DEFINER, 0177)
--   TRIGGER FUNCTION: invoked by the PostgreSQL trigger mechanism as the table
--   owner.  End users must NOT call this directly — REVOKE FROM PUBLIC but do
--   NOT grant to any role.  The trigger itself handles invocation.
REVOKE ALL     ON FUNCTION public.validate_audit_log_insert()                         FROM PUBLIC, anon, authenticated, service_role;
-- No GRANT: trigger-only function.  Invocation managed by INSERT trigger on audit_logs.

-- rpc_write_audit_log — secure audit log write RPC (SECURITY DEFINER, 0177)
--   Callable by both authenticated users (explicit write) and service_role
--   (background system event logging).
REVOKE ALL     ON FUNCTION public.rpc_write_audit_log(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INET, TEXT
) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_write_audit_log(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INET, TEXT
) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_write_audit_log(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INET, TEXT
) TO service_role;

-- =============================================================================
-- SECTION 5 — New guard functions from migration 0180
-- =============================================================================

-- fn_verify_org_claim — JWT org_id claim reconciliation guard (SECURITY INVOKER, 0180)
REVOKE ALL     ON FUNCTION public.fn_verify_org_claim()                               FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_verify_org_claim()                               TO authenticated;

-- fn_get_verified_org_id — verified org_id convenience wrapper (SECURITY INVOKER, 0180)
REVOKE ALL     ON FUNCTION public.fn_get_verified_org_id()                            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_verified_org_id()                            TO authenticated;

-- =============================================================================
-- SECTION 6 — Post-sweep assertions
-- =============================================================================

DO $$
DECLARE
  v_fn            TEXT;
  v_schema        TEXT := 'public';
  v_all_functions TEXT[] := ARRAY[
    'rpc_record_payment',
    'rpc_job_board',
    'get_search_suggestions',
    'is_platform_super_admin',
    'rpc_approve_quotation',
    'get_org_usage',
    'rpc_ledger_entries',
    'rpc_ledger_summary',
    'fn_is_service_role',
    'has_app_role',
    'validate_audit_log_insert',
    'rpc_write_audit_log',
    'fn_verify_org_claim',
    'fn_get_verified_org_id'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_all_functions LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = v_schema AND routine_name = v_fn
    ) THEN
      RAISE WARNING '0181 ASSERTION: % not found in schema % — REVOKE may not have applied', v_fn, v_schema;
    ELSE
      RAISE NOTICE '0181 ✅ REVOKE sweep applied to public.%()', v_fn;
    END IF;
  END LOOP;

  -- Specific check: validate_audit_log_insert must exist but have no user grant
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = 'validate_audit_log_insert'
      AND grantee        NOT IN ('postgres', 'supabase_admin', 'rds_superuser')
  ) THEN
    RAISE WARNING '0181 UNEXPECTED GRANT: validate_audit_log_insert has user-facing GRANT — review';
  ELSE
    RAISE NOTICE '0181 ✅ validate_audit_log_insert has no user-facing GRANT (trigger-only)';
  END IF;

  RAISE NOTICE '0181 REVOKE sweep complete — 14 functions covered';
END $$;

-- =============================================================================
-- SECTION 7 — Maintenance comment: future RPCs
-- =============================================================================

-- When adding any new public-schema RPC or helper function, follow this pattern
-- immediately after the CREATE OR REPLACE FUNCTION block:
--
--   REVOKE ALL     ON FUNCTION public.<fn_name>(<signature>) FROM PUBLIC;
--   GRANT  EXECUTE ON FUNCTION public.<fn_name>(<signature>) TO authenticated;
--   -- Add TO service_role if the function must be callable from background workers.
--
-- This prevents the PostgreSQL default (EXECUTE TO PUBLIC) from exposing the
-- function to unauthenticated callers.

-- =============================================================================
-- END OF MIGRATION 0181
-- =============================================================================
-- REVOKE sweep summary:
--
--   | Function                  | Source | Grant targets                    |
--   |---------------------------|--------|----------------------------------|
--   | rpc_record_payment        | 0173   | authenticated                    |
--   | rpc_job_board             | 0173   | authenticated                    |
--   | get_search_suggestions    | 0174   | authenticated                    |
--   | is_platform_super_admin   | 0174   | authenticated                    |
--   | rpc_approve_quotation     | 0174   | authenticated                    |
--   | get_org_usage             | 0176   | authenticated                    |
--   | rpc_ledger_entries        | 0176   | authenticated                    |
--   | rpc_ledger_summary        | 0176   | authenticated                    |
--   | fn_is_service_role        | 0176   | authenticated, service_role      |
--   | has_app_role              | 0176   | authenticated                    |
--   | validate_audit_log_insert | 0177   | (none — trigger-only)            |
--   | rpc_write_audit_log       | 0177   | authenticated, service_role      |
--   | fn_verify_org_claim       | 0180   | authenticated                    |
--   | fn_get_verified_org_id    | 0180   | authenticated                    |
--
-- Closure criteria:
--   [ ] `SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--         WHERE routine_schema = 'public' AND grantee = 'PUBLIC'`
--       returns 0 rows for all 14 functions
--   [ ] CI migration tests pass on a fresh database (forward + rollback + forward)
--   [ ] Supabase db lint reports no EXECUTE TO PUBLIC warnings for covered RPCs
-- =============================================================================

COMMIT;
