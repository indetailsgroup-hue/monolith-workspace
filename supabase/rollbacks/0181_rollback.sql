-- =============================================================================
-- Rollback: 0181_rollback.sql
-- Author:   Security Audit 2026-08-28
-- Purpose:  Revert 0181_revoke_execute_public_sweep.sql
--           FOR CI IDEMPOTENCY TESTING ONLY.
--           ⚠️  NEVER apply to production.
--
-- Reverts:
--   Re-grants EXECUTE TO PUBLIC on all 14 functions covered by the sweep,
--   restoring PostgreSQL's default behaviour so that 0181 can be re-applied
--   and CI can verify the sweep is idempotent.
--
--   NOTE: validate_audit_log_insert is a trigger-only function.
--   Granting EXECUTE TO PUBLIC here is purely to allow the rollback → re-apply
--   cycle to succeed; in production this function must never have a user grant.
--
-- CI usage:
--   psql $DB_URL -f 0181_revoke_execute_public_sweep.sql
--   psql $DB_URL -f 0181_rollback.sql
--   psql $DB_URL -f 0181_revoke_execute_public_sweep.sql   -- must succeed again
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1 — Re-grant EXECUTE TO PUBLIC (0173 RPCs)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.rpc_record_payment(UUID, NUMERIC, TEXT, TEXT, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_job_board(TEXT, INT, INT)                       TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INT)                   TO PUBLIC;

-- =============================================================================
-- SECTION 2 — Re-grant EXECUTE TO PUBLIC (0174 RPCs)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.is_platform_super_admin()          TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_approve_quotation(UUID, INT)   TO PUBLIC;

-- =============================================================================
-- SECTION 3 — Re-grant EXECUTE TO PUBLIC (0176 RPCs)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_org_usage(UUID)                     TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ledger_summary(TEXT)                TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_service_role()                    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_app_role(TEXT)                      TO PUBLIC;

-- =============================================================================
-- SECTION 4 — Re-grant EXECUTE TO PUBLIC (0177 RPCs)
-- =============================================================================

-- validate_audit_log_insert: CI only — see warning above.
GRANT EXECUTE ON FUNCTION public.validate_audit_log_insert() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_write_audit_log(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INET, TEXT
) TO PUBLIC;

-- =============================================================================
-- SECTION 5 — Re-grant EXECUTE TO PUBLIC (0180 guard functions)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.fn_verify_org_claim()    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_get_verified_org_id() TO PUBLIC;

-- =============================================================================
-- SECTION 6 — Post-rollback assertions
-- =============================================================================

DO $$
DECLARE
  v_fn  TEXT;
  v_fns TEXT[] := ARRAY[
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
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public'
        AND routine_name   = v_fn
        AND grantee        = 'PUBLIC'
    ) THEN
      RAISE NOTICE '0181_rollback ✅ EXECUTE TO PUBLIC restored for public.%()', v_fn;
    ELSE
      RAISE WARNING '0181_rollback ASSERTION: PUBLIC grant not found for public.%() — function may not exist', v_fn;
    END IF;
  END LOOP;

  RAISE NOTICE '0181_rollback complete — 14 functions re-exposed to PUBLIC (CI only)';
END $$;

-- =============================================================================
-- END OF ROLLBACK 0181
-- ⚠️  FOR CI IDEMPOTENCY TESTING ONLY — NEVER APPLY TO PRODUCTION
-- =============================================================================

COMMIT;
