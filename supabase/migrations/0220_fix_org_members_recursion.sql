-- =============================================================================
-- Migration: 0220_fix_org_members_recursion.sql
-- Purpose:   Fix infinite recursion in org_members RLS policies.
--
-- Root cause: members_select_same_org and members_manage_admin policies both
--             contain a subquery "SELECT org_id FROM public.org_members WHERE ..."
--             which re-triggers those same policies → infinite recursion whenever
--             any policy chain (e.g. notifications → org_members) runs under
--             the 'authenticated' role.
--
-- Solution:  Two SECURITY DEFINER helper functions bypass org_members RLS
--            and are used in the policies instead of direct subqueries.
-- =============================================================================

-- 1. Helper: return all org_ids the current user belongs to (active memberships)
CREATE OR REPLACE FUNCTION public.fn_get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id
  FROM   public.org_members
  WHERE  user_id   = auth.uid()
    AND  is_active = true;
$$;

-- 2. Helper: check if current user is OWNER/ADMIN in a specific org
CREATE OR REPLACE FUNCTION public.fn_is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.org_members
    WHERE  user_id   = auth.uid()
      AND  org_id    = p_org_id
      AND  role      IN ('OWNER', 'ADMIN')
      AND  is_active = true
  );
$$;

-- 3. Fix members_select_same_org (was self-referencing → recursion)
DROP POLICY IF EXISTS "members_select_same_org" ON public.org_members;
CREATE POLICY "members_select_same_org" ON public.org_members
  FOR SELECT USING (
    org_id IN (SELECT public.fn_get_user_org_ids())
  );

-- 4. Fix members_manage_admin (was self-referencing → recursion)
DROP POLICY IF EXISTS "members_manage_admin" ON public.org_members;
CREATE POLICY "members_manage_admin" ON public.org_members
  FOR ALL USING (
    public.fn_is_org_admin(org_id)
  );

-- Grant execute on helpers to authenticated role
GRANT EXECUTE ON FUNCTION public.fn_get_user_org_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_org_admin(UUID)        TO authenticated;
