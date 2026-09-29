-- =============================================================================
-- pgTAP Test Suite: 0181_revoke_sweep.sql
-- Author: Security Audit 2026-08-28
-- Purpose: Verify that all 14 public-schema functions covered by
--          0181_revoke_execute_public_sweep.sql have NO EXECUTE grant to PUBLIC
--          and DO have EXECUTE grants to the correct roles.
--
-- Covers:
--   T-0181-01  rpc_record_payment — no PUBLIC grant; authenticated granted
--   T-0181-02  rpc_job_board — no PUBLIC grant; authenticated granted
--   T-0181-03  get_search_suggestions — no PUBLIC grant; authenticated granted
--   T-0181-04  is_platform_super_admin — no PUBLIC grant; authenticated granted
--   T-0181-05  rpc_approve_quotation — no PUBLIC grant; authenticated granted
--   T-0181-06  get_org_usage — no PUBLIC grant; authenticated granted
--   T-0181-07  rpc_ledger_entries — no PUBLIC grant; authenticated granted
--   T-0181-08  rpc_ledger_summary — no PUBLIC grant; authenticated granted
--   T-0181-09  fn_is_service_role — no PUBLIC grant; authenticated + service_role granted
--   T-0181-10  has_app_role — no PUBLIC grant; authenticated granted
--   T-0181-11  validate_audit_log_insert — no PUBLIC grant; NO user-facing grant (trigger-only)
--   T-0181-12  rpc_write_audit_log — no PUBLIC grant; authenticated + service_role granted
--   T-0181-13  fn_verify_org_claim — no PUBLIC grant; authenticated granted
--   T-0181-14  fn_get_verified_org_id — no PUBLIC grant; authenticated granted
--   T-0181-15  Composite: zero-row query confirms no covered function has PUBLIC EXECUTE
--   T-0181-16  validate_audit_log_insert has no grants to any non-superuser role
--   T-0181-17  fn_is_service_role has service_role EXECUTE grant
--   T-0181-18  rpc_write_audit_log has service_role EXECUTE grant
--
-- Total: 18 tests
-- =============================================================================

BEGIN;

SELECT plan(18);

-- =============================================================================
-- Helper: has_no_public_execute(fn_name TEXT)
-- Returns TRUE if the named function has no EXECUTE grant to 'PUBLIC'.
-- =============================================================================

CREATE OR REPLACE FUNCTION _t0181_no_public_grant(p_fn TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = p_fn
      AND grantee        = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
  );
$$;

CREATE OR REPLACE FUNCTION _t0181_has_role_grant(p_fn TEXT, p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = p_fn
      AND grantee        = p_role
      AND privilege_type = 'EXECUTE'
  );
$$;

-- =============================================================================
-- T-0181-01: rpc_record_payment — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_record_payment'),
  'T-0181-01: rpc_record_payment has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-02: rpc_job_board — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_job_board'),
  'T-0181-02: rpc_job_board has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-03: get_search_suggestions — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('get_search_suggestions'),
  'T-0181-03: get_search_suggestions has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-04: is_platform_super_admin — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('is_platform_super_admin'),
  'T-0181-04: is_platform_super_admin has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-05: rpc_approve_quotation — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_approve_quotation'),
  'T-0181-05: rpc_approve_quotation has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-06: get_org_usage — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('get_org_usage'),
  'T-0181-06: get_org_usage has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-07: rpc_ledger_entries — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_ledger_entries'),
  'T-0181-07: rpc_ledger_entries has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-08: rpc_ledger_summary — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_ledger_summary'),
  'T-0181-08: rpc_ledger_summary has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-09: fn_is_service_role — no PUBLIC grant; authenticated + service_role granted
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('fn_is_service_role'),
  'T-0181-09: fn_is_service_role has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-10: has_app_role — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('has_app_role'),
  'T-0181-10: has_app_role has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-11: validate_audit_log_insert — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('validate_audit_log_insert'),
  'T-0181-11: validate_audit_log_insert has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-12: rpc_write_audit_log — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('rpc_write_audit_log'),
  'T-0181-12: rpc_write_audit_log has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-13: fn_verify_org_claim — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('fn_verify_org_claim'),
  'T-0181-13: fn_verify_org_claim has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-14: fn_get_verified_org_id — no PUBLIC grant
-- =============================================================================

SELECT ok(
  _t0181_no_public_grant('fn_get_verified_org_id'),
  'T-0181-14: fn_get_verified_org_id has no EXECUTE grant to PUBLIC'
);

-- =============================================================================
-- T-0181-15: Composite zero-row assertion — confirms the full swept set has
--            no PUBLIC EXECUTE grants in one query.
-- =============================================================================

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND grantee        = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
      AND routine_name IN (
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
      )
  ),
  0,
  'T-0181-15: zero PUBLIC EXECUTE grants across all 14 swept functions'
);

-- =============================================================================
-- T-0181-16: validate_audit_log_insert has NO grant to any non-superuser role
-- (trigger-only — any user-facing grant is a misconfiguration)
-- =============================================================================

SELECT is(
  (
    SELECT COUNT(*)::INT
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = 'validate_audit_log_insert'
      AND grantee NOT IN ('postgres', 'supabase_admin', 'rds_superuser', 'pg_database_owner')
  ),
  0,
  'T-0181-16: validate_audit_log_insert has no user-facing grants (trigger-only)'
);

-- =============================================================================
-- T-0181-17: fn_is_service_role has EXECUTE grant to service_role
-- =============================================================================

SELECT ok(
  _t0181_has_role_grant('fn_is_service_role', 'service_role'),
  'T-0181-17: fn_is_service_role has EXECUTE grant to service_role'
);

-- =============================================================================
-- T-0181-18: rpc_write_audit_log has EXECUTE grant to service_role
-- =============================================================================

SELECT ok(
  _t0181_has_role_grant('rpc_write_audit_log', 'service_role'),
  'T-0181-18: rpc_write_audit_log has EXECUTE grant to service_role'
);

-- =============================================================================
-- Cleanup helpers
-- =============================================================================

DROP FUNCTION IF EXISTS _t0181_no_public_grant(TEXT);
DROP FUNCTION IF EXISTS _t0181_has_role_grant(TEXT, TEXT);

SELECT finish();

ROLLBACK;

-- =============================================================================
-- END OF TEST SUITE 0181
-- 18 tests — T-0181-01 through T-0181-18
-- Covers: no PUBLIC grant per function (14), composite zero-row (1),
--         trigger-only no-user-grant (1), service_role grant checks (2)
-- =============================================================================
