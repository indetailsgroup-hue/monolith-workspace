-- =============================================================================
-- Migration 0223 — Fix get_org_usage() member-count query
--
-- 0180 correctly hardened identity reconciliation, but its usage aggregation
-- still referenced the obsolete org_members.status column. The canonical
-- schema uses org_members.is_active, so an authorized request reached the
-- aggregation and failed with SQLSTATE 42703.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_usage(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_count     INTEGER;
  v_member_count  INTEGER;
  v_storage_bytes BIGINT;
  v_period_start  TIMESTAMPTZ;
  v_jwt_org_id    UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_org_usage: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reconcile the JWT org claim with an active home-org membership first.
  PERFORM public.fn_verify_org_claim();

  -- Platform super-admins may request another organization. All other callers
  -- are restricted to the organization carried by their verified JWT.
  IF NOT public.is_platform_super_admin() THEN
    BEGIN
      v_jwt_org_id := (auth.jwt() ->> 'org_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_jwt_org_id := NULL;
    END;

    IF v_jwt_org_id IS DISTINCT FROM p_org_id THEN
      RAISE EXCEPTION 'get_org_usage: p_org_id (%) does not match JWT org_id claim (%)',
                      p_org_id, v_jwt_org_id
        USING ERRCODE = 'insufficient_privilege',
              HINT    = 'Non-super-admin callers may only query their own org';
    END IF;
  END IF;

  IF NOT (
    public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.org_members om
       WHERE om.user_id   = auth.uid()
         AND om.org_id    = p_org_id
         AND om.role      IN ('OWNER', 'ADMIN')
         AND om.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'get_org_usage: caller is not an OWNER or ADMIN of org %', p_org_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_period_start := date_trunc('month', NOW());

  SELECT COUNT(*) INTO v_job_count
    FROM public.jobs
   WHERE org_id     = p_org_id
     AND created_at >= v_period_start;

  SELECT COUNT(*) INTO v_member_count
    FROM public.org_members
   WHERE org_id    = p_org_id
     AND is_active = true;

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
  'Returns monthly job, active member, and storage usage for an authorized organization. '
  'Identity reconciliation hardened in 0180; active-member aggregation corrected in 0223.';
