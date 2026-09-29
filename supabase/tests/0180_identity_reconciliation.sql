-- =============================================================================
-- pgTAP Test Suite: 0180_identity_reconciliation.sql
-- Author: Security Audit 2026-08-28
-- Purpose: Verify fn_verify_org_claim(), fn_get_verified_org_id(), and all
--          6 patched RPCs reject callers with invalid / crafted JWT org_id claims.
--
-- Covers:
--   T-0180-01  fn_verify_org_claim raises on unauthenticated caller (NULL uid)
--   T-0180-02  fn_verify_org_claim raises when JWT org_id claim is absent
--   T-0180-03  fn_verify_org_claim raises when JWT org_id claim is not a UUID
--   T-0180-04  fn_verify_org_claim raises when JWT org_id does not match org_members
--   T-0180-05  fn_verify_org_claim passes for a valid authenticated member
--   T-0180-06  fn_get_verified_org_id returns verified UUID for valid member
--   T-0180-07  fn_get_verified_org_id raises for a crafted (foreign) org_id JWT
--   T-0180-08  rpc_record_payment raises for caller with mismatched JWT org_id
--   T-0180-09  rpc_job_board raises for caller with mismatched JWT org_id
--   T-0180-10  rpc_approve_quotation raises for caller with mismatched JWT org_id
--   T-0180-11  rpc_ledger_entries raises for caller with mismatched JWT org_id
--   T-0180-12  rpc_ledger_summary raises for caller with mismatched JWT org_id
--   T-0180-13  get_org_usage raises for non-super-admin caller passing foreign p_org_id
--   T-0180-14  get_org_usage passes for super-admin caller passing any org_id
--   T-0180-15  fn_verify_org_claim and fn_get_verified_org_id exist in public schema
--   T-0180-16  EXECUTE on fn_verify_org_claim is not granted to PUBLIC
--   T-0180-17  EXECUTE on fn_get_verified_org_id is not granted to PUBLIC
--
-- Total: 17 tests
-- =============================================================================

BEGIN;

SELECT plan(17);

-- =============================================================================
-- Fixtures
-- =============================================================================

-- org_a: the legitimate org
INSERT INTO public.organizations (org_id, name, slug, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A', 'pgtap-0180-org-a', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Org B', 'pgtap-0180-org-b', now())
ON CONFLICT DO NOTHING;

-- user_member: active member of org_a only
INSERT INTO auth.users (id, email)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'member@org-a.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.org_members (user_id, org_id, email, role, is_active)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'member@org-a.test', 'ADMIN', true)
ON CONFLICT DO NOTHING;

-- user_super: platform super-admin with a valid home-org membership. Identity
-- reconciliation still requires an active JWT-org membership before the
-- platform-super-admin bypass may authorize a different p_org_id.
INSERT INTO auth.users (id, email)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'super@platform.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.org_members (user_id, org_id, email, role, is_active)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'super@platform.test', 'ADMIN', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.super_admins (user_id, email)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'super@platform.test')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Helper: set_jwt(user_id, org_id) — simulates Supabase JWT context
-- Uses supabase_tests.set_authenticated_context() when available, else
-- falls back to setting request.jwt.claims directly.
-- =============================================================================

CREATE OR REPLACE FUNCTION _t0180_set_jwt(p_uid TEXT, p_org_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Supabase test helper (available in pg_prove environment)
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub',    p_uid,
      'role',   'authenticated',
      'org_id', p_org_id
    )::text,
    true  -- local to transaction
  );
  PERFORM set_config('request.jwt.claim.sub', p_uid,    true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION _t0180_clear_jwt()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub',  '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;

-- =============================================================================
-- T-0180-01: fn_verify_org_claim raises for unauthenticated caller
-- =============================================================================

SELECT throws_ok(
  $$ SELECT _t0180_clear_jwt(); SELECT public.fn_verify_org_claim(); $$,
  '42501',
  NULL,
  'T-0180-01: fn_verify_org_claim raises for unauthenticated caller'
);

-- =============================================================================
-- T-0180-02: fn_verify_org_claim raises when JWT org_id claim is absent
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object('sub', 'cccccccc-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
      true);
    SELECT public.fn_verify_org_claim();
  $$,
  '22023',
  NULL,
  'T-0180-02: fn_verify_org_claim raises when JWT org_id claim is absent'
);

-- =============================================================================
-- T-0180-03: fn_verify_org_claim raises when JWT org_id is not a valid UUID
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'not-a-uuid'
      )::text,
      true);
    SELECT public.fn_verify_org_claim();
  $$,
  '22023',
  NULL,
  'T-0180-03: fn_verify_org_claim raises for non-UUID org_id claim'
);

-- =============================================================================
-- T-0180-04: fn_verify_org_claim raises when JWT org_id is a foreign org
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.fn_verify_org_claim();
  $$,
  '42501',
  NULL,
  'T-0180-04: fn_verify_org_claim raises when JWT org_id does not match org_members'
);

-- =============================================================================
-- T-0180-05: fn_verify_org_claim passes for a valid member
-- =============================================================================

SELECT lives_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'aaaaaaaa-0000-0000-0000-000000000001'
      )::text,
      true);
    SELECT public.fn_verify_org_claim();
  $$,
  'T-0180-05: fn_verify_org_claim passes for active org_members record'
);

-- =============================================================================
-- T-0180-06: fn_get_verified_org_id returns verified UUID for valid member
-- =============================================================================

SELECT _t0180_set_jwt(
  'cccccccc-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000001'
);

SELECT is(
  public.fn_get_verified_org_id(),
  'aaaaaaaa-0000-0000-0000-000000000001'::UUID,
  'T-0180-06: fn_get_verified_org_id returns correct verified UUID'
);

-- =============================================================================
-- T-0180-07: fn_get_verified_org_id raises for a crafted (foreign) org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.fn_get_verified_org_id();
  $$,
  '42501',
  NULL,
  'T-0180-07: fn_get_verified_org_id raises for crafted foreign org_id JWT'
);

-- =============================================================================
-- T-0180-08: rpc_record_payment raises for caller with mismatched JWT org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.rpc_record_payment(
      gen_random_uuid(), 100.00, 'CASH', NULL, NULL
    );
  $$,
  '42501',
  NULL,
  'T-0180-08: rpc_record_payment raises for mismatched JWT org_id'
);

-- =============================================================================
-- T-0180-09: rpc_job_board raises for caller with mismatched JWT org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.rpc_job_board(NULL::TEXT, 50, 0);
  $$,
  '42501',
  NULL,
  'T-0180-09: rpc_job_board raises for mismatched JWT org_id'
);

-- =============================================================================
-- T-0180-10: rpc_approve_quotation raises for caller with mismatched JWT org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.rpc_approve_quotation(gen_random_uuid(), 30);
  $$,
  '42501',
  NULL,
  'T-0180-10: rpc_approve_quotation raises for mismatched JWT org_id'
);

-- =============================================================================
-- T-0180-11: rpc_ledger_entries raises for caller with mismatched JWT org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.rpc_ledger_entries();
  $$,
  '42501',
  NULL,
  'T-0180-11: rpc_ledger_entries raises for mismatched JWT org_id'
);

-- =============================================================================
-- T-0180-12: rpc_ledger_summary raises for caller with mismatched JWT org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'bbbbbbbb-0000-0000-0000-000000000002'
      )::text,
      true);
    SELECT public.rpc_ledger_summary();
  $$,
  '42501',
  NULL,
  'T-0180-12: rpc_ledger_summary raises for mismatched JWT org_id'
);

-- =============================================================================
-- T-0180-13: get_org_usage raises for non-super-admin passing foreign p_org_id
-- =============================================================================

SELECT throws_ok(
  $$
    SELECT set_config('request.jwt.claims',
      json_build_object(
        'sub',    'cccccccc-0000-0000-0000-000000000003',
        'role',   'authenticated',
        'org_id', 'aaaaaaaa-0000-0000-0000-000000000001'
      )::text,
      true);
    -- Member of org_a requesting usage for org_b — should be rejected
    SELECT public.get_org_usage('bbbbbbbb-0000-0000-0000-000000000002'::UUID);
  $$,
  '42501',
  NULL,
  'T-0180-13: get_org_usage raises for non-super-admin passing foreign p_org_id'
);

-- =============================================================================
-- T-0180-14: get_org_usage passes for super-admin passing any p_org_id
-- (Super-admin bypasses the JWT claim vs parameter check)
-- =============================================================================

SELECT lives_ok(
  $$
    SELECT _t0180_set_jwt(
      'dddddddd-0000-0000-0000-000000000004',
      'aaaaaaaa-0000-0000-0000-000000000001'
    );
    -- Super-admin requests usage for org_b — should be allowed
    SELECT public.get_org_usage('bbbbbbbb-0000-0000-0000-000000000002'::UUID);
  $$,
  'T-0180-14: get_org_usage allows super-admin to query any org'
);

-- =============================================================================
-- T-0180-15: fn_verify_org_claim and fn_get_verified_org_id exist in public schema
-- =============================================================================

SELECT ok(
  (
    SELECT COUNT(*) = 2
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name IN ('fn_verify_org_claim', 'fn_get_verified_org_id')
  ),
  'T-0180-15: both identity-reconciliation functions exist in public schema'
);

-- =============================================================================
-- T-0180-16: EXECUTE on fn_verify_org_claim is NOT granted to PUBLIC
-- =============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_verify_org_claim'
      AND grantee        = 'PUBLIC'
  ),
  'T-0180-16: fn_verify_org_claim EXECUTE is not granted to PUBLIC'
);

-- =============================================================================
-- T-0180-17: EXECUTE on fn_get_verified_org_id is NOT granted to PUBLIC
-- =============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name   = 'fn_get_verified_org_id'
      AND grantee        = 'PUBLIC'
  ),
  'T-0180-17: fn_get_verified_org_id EXECUTE is not granted to PUBLIC'
);

-- =============================================================================
-- Cleanup fixtures
-- =============================================================================

DELETE FROM public.org_members
  WHERE user_id IN (
    'cccccccc-0000-0000-0000-000000000003',
    'dddddddd-0000-0000-0000-000000000004'
  );

DELETE FROM auth.users
  WHERE id IN (
    'cccccccc-0000-0000-0000-000000000003',
    'dddddddd-0000-0000-0000-000000000004'
  );

DELETE FROM public.organizations
  WHERE org_id IN (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000002'
  );

DROP FUNCTION IF EXISTS _t0180_set_jwt(TEXT, TEXT);
DROP FUNCTION IF EXISTS _t0180_clear_jwt();

SELECT finish();

ROLLBACK;

-- =============================================================================
-- END OF TEST SUITE 0180
-- 17 tests — T-0180-01 through T-0180-17
-- Covers: fn_verify_org_claim (5), fn_get_verified_org_id (2),
--         6 patched RPCs (6), schema existence (2), PUBLIC grant checks (2)
-- =============================================================================
