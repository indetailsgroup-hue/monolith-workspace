-- ============================================================================
-- Migration: 0176_secdef_medium_risk_hardening.sql
-- Created:   2026-08-28
-- Author:    Security audit — v16.8.0 hardening pass (cont.)
--
-- Addresses all medium-risk SECURITY DEFINER findings from secdef-audit-report.md §4:
--
--   M1  get_org_usage              — missing auth.uid() + caller membership check
--   M2  rpc_ledger_entries         — SECURITY DEFINER bypasses RLS; convert to SECURITY INVOKER
--       rpc_ledger_summary         — same
--   M3  rpc_line_token_rotation_*  — VERIFIED already mitigated in 0154 (fn_is_service_role guard + REVOKE)
--   M4  rpc_factory_job_*          — VERIFIED already mitigated in 0155–0162 (fn_is_service_role guard + REVOKE)
--
-- Also adds:
--   S1  Systemic REVOKE FROM PUBLIC sweep for all remaining SECURITY DEFINER functions
--       not yet covered by 0173/0174/0175.
--   S2  SECURITY INVOKER conversions for functions that do not require privilege escalation.
--
-- PR Gate:   Must pass CI (pg_prove + supabase db lint) before merge.
--            Repair Operations G-0 = DISABLED. Do NOT apply directly to prod.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 0 — Pre-flight safety checks
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'get_user_org_id'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.get_user_org_id() not found — run 20260828_multi_tenant_schema.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'is_platform_super_admin'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.is_platform_super_admin() not found — run 0174_secdef_rpc_hardening.sql first';
  END IF;

  RAISE NOTICE '0176 pre-flight checks passed';
END $$;

-- ============================================================================
-- M1 — get_org_usage: Add caller authentication + org membership check
--
-- Vulnerability (secdef-audit-report §4 M1):
--   Takes p_org_id UUID as a plain parameter. No auth.uid() check. No membership
--   verification. Any authenticated user can enumerate usage metrics for any org
--   by iterating UUIDs.
--
-- Fix:
--   a. Check auth.uid() IS NOT NULL (authentication).
--   b. Verify caller is OWNER or ADMIN in p_org_id (authorization).
--   c. Super-admin bypass via is_platform_super_admin().
--   d. Keep SECURITY DEFINER to retain access to storage.objects (cross-schema query).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_usage(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_count    INTEGER;
  v_member_count INTEGER;
  v_storage_bytes BIGINT;
  v_period_start TIMESTAMPTZ;
BEGIN
  -- ── Authentication guard ──────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_org_usage: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Authorization guard ───────────────────────────────────────────────────
  -- Caller must be OWNER or ADMIN in the requested org, OR be a super-admin.
  -- Prevents authenticated users from enumerating other organisations' metrics.
  IF NOT (
    public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.org_members om
       WHERE om.user_id = auth.uid()
         AND om.org_id  = p_org_id
         AND om.role    IN ('OWNER', 'ADMIN')
         AND om.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'get_org_usage: caller is not an OWNER or ADMIN of org %', p_org_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Compute usage metrics ─────────────────────────────────────────────────
  v_period_start := date_trunc('month', NOW());

  -- Job count for the current billing period.
  -- Note: references "jobs" table (legacy alias from audit_log_usage_metering migration).
  SELECT COUNT(*) INTO v_job_count
    FROM public.jobs
   WHERE org_id = p_org_id
     AND created_at >= v_period_start;

  -- Active member count.
  SELECT COUNT(*) INTO v_member_count
    FROM public.org_members
   WHERE org_id = p_org_id
     AND status = 'active';

  -- Storage consumed by org files.
  SELECT COALESCE(SUM((metadata->>'size')::BIGINT), 0) INTO v_storage_bytes
    FROM storage.objects
   WHERE bucket_id = 'org-files'
     AND (storage.foldername(name))[1] = p_org_id::TEXT;

  RETURN json_build_object(
    'jobs_created',    v_job_count,
    'members_count',   v_member_count,
    'storage_used_mb', ROUND(v_storage_bytes / 1048576.0, 2),
    'period',          to_char(v_period_start, 'YYYY-MM')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_usage(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_org_usage(UUID) IS
  'Returns job count, member count, and storage usage for p_org_id. '
  'Caller must be OWNER or ADMIN of that org, or a platform super-admin. '
  'M1 hardened in 0176_secdef_medium_risk_hardening.sql (2026-08-28).';

-- ============================================================================
-- M2 — rpc_ledger_entries: Convert from SECURITY DEFINER to SECURITY INVOKER
--
-- Vulnerability (secdef-audit-report §4 M2):
--   SECURITY DEFINER bypasses RLS on journal_entry and journal_line. In the
--   multi-tenant schema, tenant isolation on journal_entry is provided by the
--   has_site_access(site_code) RLS policy. A SECURITY DEFINER function silently
--   ignores this, making the role check the only guard.
--
-- Fix:
--   Convert to SECURITY INVOKER. The existing RLS policies on journal_entry
--   (journal_entry_sel: is_governance_role OR has_site_access(site_code)) and
--   journal_line (journal_line_sel: row joins back to journal_entry subject to
--   same RLS) will enforce tenant isolation at the row level automatically.
--   The explicit role check and auth guard are retained.
--
-- Note: SECURITY INVOKER on a plpgsql function is equivalent to the function
--   body executing with the caller's grants and RLS context. This is the correct
--   and minimal privilege approach when the underlying tables already have RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_ledger_entries(
  p_book_id   TEXT    DEFAULT NULL,
  p_from_date DATE    DEFAULT NULL,
  p_to_date   DATE    DEFAULT NULL,
  p_status    TEXT    DEFAULT 'posted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER                          -- ← was SECURITY DEFINER; RLS now enforces
SET search_path = public
AS $$
DECLARE
  v_actor  TEXT;
  v_result JSONB;
BEGIN
  -- Auth check (unchanged from original)
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rpc_ledger_entries: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Role check (unchanged from original)
  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_ledger_entries: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Build result: RLS on journal_entry (via has_site_access) now applies
  -- automatically because this function executes as the caller (SECURITY INVOKER).
  SELECT COALESCE(
    jsonb_agg(entry_row ORDER BY entry_row->>'book_id', entry_row->>'entry_date'),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'entry_id',    je.id::text,
      'book_id',     je.book_id,
      'entry_date',  je.entry_date::text,
      'description', je.description,
      'lines', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'account_code', jl.account_code,
            'debit',        jl.base_debit,
            'credit',       jl.base_credit
          )
        ), '[]'::jsonb)
          FROM public.journal_line jl
         WHERE jl.journal_entry_id = je.id
      )
    ) AS entry_row
      FROM public.journal_entry je
     WHERE je.status::text = COALESCE(p_status, 'posted')
       AND (p_book_id   IS NULL OR je.book_id    = p_book_id)
       AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
       AND (p_to_date   IS NULL OR je.entry_date <= p_to_date)
       -- RLS on journal_entry enforces has_site_access(site_code) per row
  ) sub;

  RETURN v_result;
END;
$$;

-- Re-apply grants (SECURITY INVOKER still needs explicit grants for anon safety)
REVOKE ALL ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.rpc_ledger_entries(TEXT, DATE, DATE, TEXT) IS
  'Returns posted journal entries for the Finance Dashboard. '
  'Requires FINANCE or ADMIN role. '
  'M2 hardened in 0176: converted from SECURITY DEFINER to SECURITY INVOKER — '
  'RLS on journal_entry (has_site_access) now enforces tenant isolation.';

-- ============================================================================
-- M2 — rpc_ledger_summary: Same SECURITY INVOKER conversion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_ledger_summary(
  p_book_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER                          -- ← was SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  TEXT;
  v_result JSONB;
BEGIN
  v_actor := public.resolve_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rpc_ledger_summary: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (public.is_governance_role() OR public.has_app_role('finance')) THEN
    RAISE EXCEPTION 'rpc_ledger_summary: requires FINANCE or ADMIN role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(sub)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      je.book_id,
      COUNT(DISTINCT je.id)::INT           AS entry_count,
      COALESCE(SUM(jl.base_debit),  0)::NUMERIC(15,2) AS total_debit,
      COALESCE(SUM(jl.base_credit), 0)::NUMERIC(15,2) AS total_credit
      FROM public.journal_entry je
      JOIN public.journal_line  jl ON jl.journal_entry_id = je.id
     WHERE je.status = 'posted'
       AND (p_book_id IS NULL OR je.book_id = p_book_id)
     GROUP BY je.book_id
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ledger_summary(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_ledger_summary(TEXT) TO authenticated;

COMMENT ON FUNCTION public.rpc_ledger_summary(TEXT) IS
  'Returns ledger KPI summary (entry count, debit/credit totals) for the Finance Dashboard. '
  'Requires FINANCE or ADMIN role. '
  'M2 hardened in 0176: converted from SECURITY DEFINER to SECURITY INVOKER.';

-- ============================================================================
-- M3 VERIFICATION — rpc_line_token_rotation_creds / rpc_rotate_line_token
--
-- Per deep-research of 0154_line_token_rotation.sql (lines 13–53):
--   ✅ Both functions have: IF NOT public.fn_is_service_role() THEN RAISE EXCEPTION
--   ✅ 0154 DO block explicitly: REVOKE ALL FROM public; REVOKE ALL FROM authenticated;
--                                 GRANT EXECUTE TO service_role;
--
-- Finding: M3 is ALREADY FULLY MITIGATED by migration 0154.
-- Action:  Add an assertion to confirm the REVOKE/GRANT state matches expectation.
--          No function body changes required.
-- ============================================================================

DO $$
DECLARE
  v_has_public_grant BOOLEAN;
  v_has_auth_grant   BOOLEAN;
  v_has_service_grant BOOLEAN;
BEGIN
  -- Check that authenticated role does NOT have execute on rpc_line_token_rotation_creds
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema = 'public'
       AND routine_name   = 'rpc_line_token_rotation_creds'
       AND grantee        IN ('PUBLIC', 'authenticated')
       AND privilege_type = 'EXECUTE'
  ) INTO v_has_public_grant;

  IF v_has_public_grant THEN
    RAISE WARNING 'M3 ASSERTION FAILED: rpc_line_token_rotation_creds has EXECUTE grant to PUBLIC or authenticated — check 0154 migration ran correctly';
  ELSE
    RAISE NOTICE 'M3 VERIFIED: rpc_line_token_rotation_creds correctly restricted to service_role';
  END IF;

  -- Same check for rpc_rotate_line_token
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema = 'public'
       AND routine_name   = 'rpc_rotate_line_token'
       AND grantee        IN ('PUBLIC', 'authenticated')
       AND privilege_type = 'EXECUTE'
  ) INTO v_has_auth_grant;

  IF v_has_auth_grant THEN
    RAISE WARNING 'M3 ASSERTION FAILED: rpc_rotate_line_token has EXECUTE grant to PUBLIC or authenticated';
  ELSE
    RAISE NOTICE 'M3 VERIFIED: rpc_rotate_line_token correctly restricted to service_role';
  END IF;
END $$;

-- ============================================================================
-- M4 VERIFICATION — rpc_factory_job_transition / rpc_factory_job_state
--
-- Per deep-research of 0155_factory_state_server.sql and
-- 0162_factory_server_identity_released_only.sql:
--   ✅ All factory RPCs have: IF NOT public.fn_is_service_role() THEN RAISE EXCEPTION
--   ✅ 0162 does: REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
--               GRANT EXECUTE ON FUNCTION ... TO service_role;
--
-- Finding: M4 is ALREADY FULLY MITIGATED by migration 0162.
-- Action:  Assertion only — no function changes required.
-- ============================================================================

DO $$
DECLARE
  v_unsafe_factories INT;
BEGIN
  SELECT COUNT(*) INTO v_unsafe_factories
    FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name   LIKE 'rpc_factory_job_%'
     AND grantee        IN ('PUBLIC', 'authenticated')
     AND privilege_type = 'EXECUTE';

  IF v_unsafe_factories > 0 THEN
    RAISE WARNING 'M4 ASSERTION FAILED: % rpc_factory_job_* function(s) have EXECUTE grant to PUBLIC or authenticated', v_unsafe_factories;
  ELSE
    RAISE NOTICE 'M4 VERIFIED: all rpc_factory_job_* functions correctly restricted to service_role';
  END IF;
END $$;

-- ============================================================================
-- S1 — Systemic REVOKE FROM PUBLIC sweep
--
-- Covers all remaining SECURITY DEFINER functions not yet hardened by 0173/0174.
-- The functions below were confirmed SECURITY DEFINER in the full 184-migration scan
-- and have not yet received explicit REVOKE FROM PUBLIC statements.
-- ============================================================================

-- has_app_role (0171) — used inside RLS policies; should be callable by authenticated only
REVOKE ALL    ON FUNCTION public.has_app_role(TEXT)                FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_app_role(TEXT)               TO authenticated;

-- check_job_limit / check_member_limit (audit_log_usage_metering) — trigger helpers
-- These are called via trigger mechanism, not directly by users.
-- Revoke direct user access; triggers execute via the table's owner, not caller's role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'check_job_limit'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_job_limit() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_job_limit() FROM authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'check_member_limit'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_member_limit() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_member_limit() FROM authenticated';
  END IF;
END $$;

-- fn_is_service_role (0154) — internal helper; no need for users to call directly
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
     WHERE routine_schema = 'public' AND routine_name = 'fn_is_service_role'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_is_service_role() FROM PUBLIC';
    -- Keep grant to authenticated (it's used inside other functions that authenticated users call)
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_is_service_role() TO authenticated';
  END IF;
END $$;

-- ============================================================================
-- S2 — SECURITY INVOKER conversion for safe helper functions
--
-- Functions confirmed safe for SECURITY INVOKER (they only read JWT claims or
-- session settings — no privilege elevation occurs):
--   fn_is_service_role    — reads JWT claim, no data access
--   has_app_role          — reads JWT claim, no data access
--   is_platform_super_admin — reads super_admins table with caller privileges (already SI in 0174)
--   get_user_org_id       — reads org_members with caller privileges (already SI in original)
-- ============================================================================

-- fn_is_service_role: convert to SECURITY INVOKER (reads JWT only)
CREATE OR REPLACE FUNCTION public.fn_is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER                          -- ← was implicit SECURITY INVOKER; confirm explicitly
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) = 'service_role'
  OR current_user = 'postgres';
$$;

REVOKE ALL    ON FUNCTION public.fn_is_service_role() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_service_role() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_is_service_role() TO service_role;

COMMENT ON FUNCTION public.fn_is_service_role() IS
  'Returns TRUE if the current JWT role claim is ''service_role'' or the DB user is postgres. '
  'Used internally by LINE token rotation and factory RPCs to gate service-identity-only operations. '
  'S2 confirmed SECURITY INVOKER in 0176 (reads JWT claim only; no privilege escalation).';

-- ============================================================================
-- END OF MIGRATION 0176
-- ============================================================================
-- Remediation status after this migration:
--
-- | Finding | Function                       | Status         | Migration |
-- |---------|--------------------------------|----------------|-----------|
-- | R1      | rpc_record_payment             | ✅ Fixed        | 0173      |
-- | R2      | rpc_job_board                  | ✅ Fixed        | 0173      |
-- | R3      | rpc_approve_quotation          | ✅ Fixed        | 0174      |
-- | R4      | get_search_suggestions         | ✅ Fixed        | 0174      |
-- | M1      | get_org_usage                  | ✅ Fixed        | 0176 ← this |
-- | M2      | rpc_ledger_entries             | ✅ Fixed (SI)   | 0176 ← this |
-- | M2      | rpc_ledger_summary             | ✅ Fixed (SI)   | 0176 ← this |
-- | M3      | rpc_line_token_rotation_*      | ✅ Verified OK  | 0154      |
-- | M4      | rpc_factory_job_*              | ✅ Verified OK  | 0162      |
-- | S1      | Systemic REVOKE sweep          | ✅ Applied      | 0176 ← this |
-- | S2      | SECURITY INVOKER conversions   | ✅ Applied      | 0176 ← this |
--
-- All confirmed SECURITY DEFINER risks are now remediated.
-- Remaining work: F5 audit_logs WITH CHECK (true) — tracked in rls-audit-report.md.
--
-- Closure criteria:
--   [ ] get_org_usage raises 'insufficient_privilege' for non-member callers
--   [ ] rpc_ledger_entries returns only rows matching caller's site_code (via RLS)
--   [ ] rpc_ledger_summary returns only rows matching caller's site_code (via RLS)
--   [ ] M3 / M4 assertion DO blocks log no WARNINGs
--   [ ] CI migration tests pass on a fresh database (forward + rollback + forward)
-- ============================================================================

COMMIT;
