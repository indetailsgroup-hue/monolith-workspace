-- =============================================================================
-- pgTAP test suite: migration 0182
-- File: supabase/tests/0182_audit_logs_org_id_hardening.sql
--
-- Coverage:
--   Structural: NOT NULL on audit_logs.org_id; FK to organizations(org_id) (D1 fix)
--   Data:       no NULL org_id rows; sentinel org row; no orphaned FK references
--   D3 fix:     validate_audit_log_insert trigger uses o.org_id (not o.id)
--   D2 fix:     audit_logs INSERT RLS WITH CHECK uses o.org_id (not o.id)
--   Behavioral: spoofed org_id → trigger raises; service_role valid insert → OK;
--               anon insert → RLS rejects
--
-- Tests: T-0182-01 → T-0182-13 (13 tests)
-- =============================================================================

BEGIN;

SELECT plan(13);

-- ---------------------------------------------------------------------------
-- STRUCTURAL ASSERTIONS
-- ---------------------------------------------------------------------------

-- T-0182-01: org_id column exists on audit_logs
SELECT has_column(
  'public',
  'audit_logs',
  'org_id',
  'T-0182-01: audit_logs.org_id column exists'
);

-- T-0182-02: org_id is NOT NULL
SELECT col_not_null(
  'public',
  'audit_logs',
  'org_id',
  'T-0182-02: audit_logs.org_id carries NOT NULL constraint (0182 SET NOT NULL applied)'
);

-- T-0182-03: FK to organizations(org_id) exists — D1 fix verified
-- Uses information_schema to confirm the FK target column is org_id (not id).
SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name   = rc.constraint_name
     AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name   = rc.unique_constraint_name
     AND ccu.constraint_schema = rc.unique_constraint_schema
    WHERE rc.constraint_schema  = 'public'
      AND kcu.table_name        = 'audit_logs'
      AND kcu.column_name       = 'org_id'
      AND ccu.table_name        = 'organizations'
      AND ccu.column_name       = 'org_id'
  ),
  'T-0182-03: audit_logs.org_id FK references organizations(org_id) — D1 fix verified'
);

-- ---------------------------------------------------------------------------
-- DATA INTEGRITY ASSERTIONS
-- ---------------------------------------------------------------------------

-- T-0182-04: No NULL org_id rows remain after sentinel backfill
SELECT is(
  (SELECT COUNT(*) FROM public.audit_logs WHERE org_id IS NULL)::bigint,
  0::bigint,
  'T-0182-04: No NULL org_id rows remain in audit_logs after sentinel backfill'
);

-- T-0182-05: Sentinel org row exists in organizations
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.organizations
    WHERE org_id = '00000000-0000-0000-0000-000000000000'::uuid
  ),
  'T-0182-05: Sentinel org UUID 00000000-... exists in organizations table'
);

-- T-0182-06: Every audit_logs.org_id matches an organizations row (no orphaned references)
SELECT is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs al
    LEFT JOIN public.organizations o ON o.org_id = al.org_id
    WHERE o.org_id IS NULL
  )::bigint,
  0::bigint,
  'T-0182-06: All audit_logs.org_id values join to an organizations row — no orphans'
);

-- ---------------------------------------------------------------------------
-- D3 FIX: validate_audit_log_insert trigger function
-- ---------------------------------------------------------------------------

-- T-0182-07: Trigger function body contains o.org_id reference (D3 fix present)
SELECT ok(
  (
    SELECT pg_get_functiondef(oid)
    FROM pg_proc
    WHERE proname        = 'validate_audit_log_insert'
      AND pronamespace   = 'public'::regnamespace
  ) LIKE '%o.org_id%',
  'T-0182-07: validate_audit_log_insert references o.org_id — D3 fix present'
);

-- T-0182-08: Trigger function body does NOT contain old "o.id" WHERE pattern (D3 defect removed)
SELECT ok(
  (
    SELECT pg_get_functiondef(oid)
    FROM pg_proc
    WHERE proname        = 'validate_audit_log_insert'
      AND pronamespace   = 'public'::regnamespace
  ) NOT LIKE '%WHERE o.id =%',
  'T-0182-08: validate_audit_log_insert no longer uses WHERE o.id — D3 old defect removed'
);

-- ---------------------------------------------------------------------------
-- D2 FIX: audit_logs INSERT RLS WITH CHECK policy
-- ---------------------------------------------------------------------------

-- T-0182-09: INSERT RLS WITH CHECK expression contains org_id (D2 fix present)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'audit_logs'
      AND cmd        = 'INSERT'
      AND (with_check LIKE '%org_id%' OR qual LIKE '%org_id%')
  ),
  'T-0182-09: audit_logs INSERT RLS WITH CHECK references org_id — D2 fix present'
);

-- T-0182-10: INSERT RLS WITH CHECK expression does NOT contain old "o.id =" pattern (D2 defect removed)
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'audit_logs'
      AND cmd        = 'INSERT'
      AND (with_check LIKE '%o.id =%' OR qual LIKE '%o.id =%')
  ),
  'T-0182-10: audit_logs INSERT RLS WITH CHECK no longer uses o.id — D2 old defect removed'
);

-- ---------------------------------------------------------------------------
-- BEHAVIORAL ASSERTIONS
-- ---------------------------------------------------------------------------

-- T-0182-11: Authenticated insert with a non-existent org_id → trigger raises exception
-- The trigger performs: SELECT 1 FROM organizations WHERE org_id = NEW.org_id
-- When the org_id does not exist in organizations the trigger raises an exception.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","org_id":"ffffffff-ffff-ffff-ffff-ffffffffffff","role":"authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.audit_logs(org_id, actor_type, actor_id, action, target_type)
      VALUES (
        'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
        'system',
        'pgtap-spoof-actor',
        'pgtap_0182_spoof_test',
        'test'
      )$$,
  NULL,   -- SQLSTATE not checked (trigger RAISE code may vary)
  NULL,   -- message not checked
  'T-0182-11: Insert with non-existent org_id → validate_audit_log_insert raises an exception'
);

RESET ROLE;

-- T-0182-12: service_role insert with valid sentinel org_id → succeeds
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$INSERT INTO public.audit_logs(org_id, actor_type, actor_id, action, target_type)
      VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'system',
        'pgtap-service-actor-0182',
        'pgtap_0182_ok_test',
        'test'
      )$$,
  'T-0182-12: service_role insert with valid sentinel org_id → succeeds (no trigger raise, RLS passes)'
);

-- Clean up test row so it does not pollute other test suites
DELETE FROM public.audit_logs
WHERE actor_id = 'pgtap-service-actor-0182'
  AND action   = 'pgtap_0182_ok_test';

RESET ROLE;

-- T-0182-13: anon role insert → RLS rejects with insufficient_privilege (42501)
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$INSERT INTO public.audit_logs(org_id, actor_type, actor_id, action, target_type)
      VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'system',
        'anon-intruder',
        'pgtap_0182_anon_test',
        'test'
      )$$,
  '42501',
  NULL,
  'T-0182-13: anon role insert → RLS rejects with insufficient_privilege (42501)'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;
