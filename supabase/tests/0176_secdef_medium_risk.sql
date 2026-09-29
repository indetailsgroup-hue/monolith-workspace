-- =============================================================================
-- pgTAP test suite: 0176_secdef_medium_risk_hardening
-- Covers: M1 (get_org_usage caller auth), M2 (rpc_ledger_entries/summary INVOKER),
--         M3 (LINE token RPC grants), M4 (factory RPC grants)
-- Total: 13 tests
-- =============================================================================

BEGIN;

SELECT plan(13);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Sentinel org used for quarantine rows
\set SENTINEL_ORG '00000000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------
-- T-M1-01  get_org_usage is still SECURITY DEFINER (needs storage.objects access)
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE proname = 'get_org_usage'
      AND pronamespace = 'public'::regnamespace
  ),
  TRUE,
  'T-M1-01: get_org_usage must remain SECURITY DEFINER for cross-schema storage.objects access'
);

-- ---------------------------------------------------------------------------
-- T-M1-02  get_org_usage body contains auth.uid() IS NULL unauthenticated guard
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'get_org_usage'
      AND pronamespace = 'public'::regnamespace
  ) LIKE '%auth.uid() IS NULL%',
  'T-M1-02: get_org_usage body must contain auth.uid() IS NULL unauthenticated guard'
);

-- ---------------------------------------------------------------------------
-- T-M1-03  get_org_usage body contains org_members membership check
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'get_org_usage'
      AND pronamespace = 'public'::regnamespace
  ) LIKE '%org_members%',
  'T-M1-03: get_org_usage body must contain org_members membership check'
);

-- ---------------------------------------------------------------------------
-- T-M1-04  get_org_usage rejects sentinel org UUID
--          The sentinel org has no members → has_org_access returns false → RAISE
-- ---------------------------------------------------------------------------
SELECT throws_like(
  $$SELECT get_org_usage('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '%',
  'T-M1-04: get_org_usage must raise for sentinel org UUID (no membership)'
);

-- ---------------------------------------------------------------------------
-- T-M1-05  get_org_usage function signature accepts p_org_id UUID
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM pg_proc
    WHERE proname = 'get_org_usage'
      AND pronamespace = 'public'::regnamespace
      AND pg_get_function_arguments(oid) LIKE '%p_org_id uuid%'
  ),
  1,
  'T-M1-05: get_org_usage must accept p_org_id UUID parameter'
);

-- ---------------------------------------------------------------------------
-- T-M2-01  rpc_ledger_entries is SECURITY INVOKER (prosecdef = false)
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE proname = 'rpc_ledger_entries'
      AND pronamespace = 'public'::regnamespace
  ),
  FALSE,
  'T-M2-01: rpc_ledger_entries must be SECURITY INVOKER (prosecdef = false)'
);

-- ---------------------------------------------------------------------------
-- T-M2-02  rpc_ledger_summary is SECURITY INVOKER (prosecdef = false)
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE proname = 'rpc_ledger_summary'
      AND pronamespace = 'public'::regnamespace
  ),
  FALSE,
  'T-M2-02: rpc_ledger_summary must be SECURITY INVOKER (prosecdef = false)'
);

-- ---------------------------------------------------------------------------
-- T-M2-03  rpc_ledger_entries body contains resolve_actor() caller auth check
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'rpc_ledger_entries'
      AND pronamespace = 'public'::regnamespace
  ) LIKE '%resolve_actor%',
  'T-M2-03: rpc_ledger_entries body must contain resolve_actor() caller auth check'
);

-- ---------------------------------------------------------------------------
-- T-M2-04  rpc_ledger_summary body contains resolve_actor() caller auth check
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT prosrc
    FROM pg_proc
    WHERE proname = 'rpc_ledger_summary'
      AND pronamespace = 'public'::regnamespace
  ) LIKE '%resolve_actor%',
  'T-M2-04: rpc_ledger_summary body must contain resolve_actor() caller auth check'
);

-- ---------------------------------------------------------------------------
-- T-M2-05  journal_entry table uses org_id-based RLS (get_user_org_id)
--          Confirms INVOKER strategy is correct — tenant-isolation RLS is present
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT COUNT(*) > 0
    FROM pg_policies
    WHERE tablename = 'journal_entry'
      AND schemaname = 'public'
      AND qual LIKE '%get_user_org_id%'
  ),
  'T-M2-05: journal_entry must have at least one RLS policy using get_user_org_id()'
);

-- ---------------------------------------------------------------------------
-- T-M3-01  rpc_rotate_line_token EXECUTE not granted to authenticated role
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'rpc_rotate_line_token'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ),
  'T-M3-01: authenticated role must NOT have EXECUTE on rpc_rotate_line_token (M3 mitigation from 0154)'
);

-- ---------------------------------------------------------------------------
-- T-M3-02  rpc_revoke_line_token EXECUTE not granted to authenticated role
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'rpc_revoke_line_token'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ),
  'T-M3-02: authenticated role must NOT have EXECUTE on rpc_revoke_line_token (M3 mitigation from 0154)'
);

-- ---------------------------------------------------------------------------
-- T-M4-01  No factory state RPC has broad EXECUTE grant to authenticated
--          Confirms 0162 REVOKE/re-GRANT hardening still in place
-- ---------------------------------------------------------------------------
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM information_schema.routine_privileges rp
    JOIN pg_proc p ON p.proname = rp.routine_name
      AND p.pronamespace = 'public'::regnamespace
    WHERE rp.grantee = 'authenticated'
      AND rp.privilege_type = 'EXECUTE'
      AND rp.routine_name IN (
        'rpc_set_factory_state',
        'rpc_advance_factory_stage',
        'rpc_reset_factory_state'
      )
  ),
  0,
  'T-M4-01: authenticated role must NOT have EXECUTE on factory state RPCs (M4 mitigation from 0162)'
);

SELECT * FROM finish();

ROLLBACK;
