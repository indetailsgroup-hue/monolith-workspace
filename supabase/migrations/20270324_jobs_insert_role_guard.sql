-- Legacy org-only INSERT / ALL policies combine with job_insert using OR,
-- bypassing its role check. Require the existing 0178 predicate independently
-- of those permissive policies; UPDATE and DELETE are outside this repair.
BEGIN;

CREATE POLICY jobs_insert_role_guard ON public.jobs
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND (public.has_app_role('factory') OR public.has_app_role('admin')
         OR public.has_app_role('designer') OR public.is_governance_role())
  );

COMMIT;
