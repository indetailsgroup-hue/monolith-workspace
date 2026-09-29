-- Rollback: 0187_installation_domain_rls
-- CI idempotency testing ONLY. DATA LOSS: drops org_id columns.
-- NEVER apply to production.
--
-- Reverses 0187 in six steps:
--   (1) DROP *_tenant_isolation SELECT policies (the 12 policies added by 0187)
--   (2) RE-CREATE *_sel site_code-based SELECT policies (restored from 0090/0096/0107/0112)
--   (3) DROP NOT NULL constraints on org_id columns
--   (4) DROP org_id columns — DATA LOSS, CI only
-- Note: does NOT reverse ALTER TABLE ENABLE ROW LEVEL SECURITY;
--       RLS was already enabled on these tables before 0187 (from earlier migrations).
--       Disabling it here would remove pre-existing protection — incorrect.

-- =============================================================================
-- (1) DROP *_tenant_isolation SELECT policies
-- =============================================================================
DROP POLICY IF EXISTS installation_projects_tenant_isolation          ON public.installation_projects;
DROP POLICY IF EXISTS installation_rooms_tenant_isolation             ON public.installation_rooms;
DROP POLICY IF EXISTS installation_tasks_tenant_isolation             ON public.installation_tasks;
DROP POLICY IF EXISTS installation_photos_tenant_isolation            ON public.installation_photos;
DROP POLICY IF EXISTS installation_photo_annotations_tenant_isolation ON public.installation_photo_annotations;
DROP POLICY IF EXISTS installation_field_reports_tenant_isolation     ON public.installation_field_reports;
DROP POLICY IF EXISTS installation_approvals_tenant_isolation         ON public.installation_approvals;
DROP POLICY IF EXISTS installation_audit_log_tenant_isolation         ON public.installation_audit_log;
DROP POLICY IF EXISTS installation_memberships_tenant_isolation       ON public.installation_memberships;
DROP POLICY IF EXISTS installation_issues_tenant_isolation            ON public.installation_issues;
DROP POLICY IF EXISTS installation_plans_tenant_isolation             ON public.installation_plans;
DROP POLICY IF EXISTS production_milestones_tenant_isolation          ON public.production_milestones;

-- =============================================================================
-- (2) RESTORE old site_code-based SELECT policies
--     Mirrors original policies from 0090_installation_pm_core.sql,
--     0096_installation_issues.sql, 0107_factory_group_milestones.sql,
--     0112_install_plan.sql
-- =============================================================================
CREATE POLICY installation_projects_sel ON public.installation_projects
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_rooms_sel ON public.installation_rooms
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_tasks_sel ON public.installation_tasks
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_photos_sel ON public.installation_photos
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_photo_annotations_sel ON public.installation_photo_annotations
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_field_reports_sel ON public.installation_field_reports
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_approvals_sel ON public.installation_approvals
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_audit_sel ON public.installation_audit_log
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_memberships_sel ON public.installation_memberships
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(
    (SELECT ip.site_code FROM public.installation_projects ip WHERE ip.id = project_id)
  ));

CREATE POLICY installation_issues_sel ON public.installation_issues
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

CREATE POLICY installation_plans_sel ON public.installation_plans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.installation_projects p
    WHERE p.id = project_id
      AND (public.is_governance_role() OR public.has_site_access(p.site_code))
  ));

CREATE POLICY production_milestones_sel ON public.production_milestones
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code)
         OR public.fn_installation_is_member(project_id));

-- =============================================================================
-- (3) DROP NOT NULL constraints on org_id
-- =============================================================================
ALTER TABLE public.installation_projects          ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_rooms             ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_tasks             ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_photos            ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_photo_annotations ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_field_reports     ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_approvals         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_audit_log         ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_memberships       ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_issues            ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.installation_plans             ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE public.production_milestones          ALTER COLUMN org_id DROP NOT NULL;

-- =============================================================================
-- (4) DROP org_id columns — DATA LOSS; CI idempotency only
-- =============================================================================
ALTER TABLE public.installation_projects          DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_rooms             DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_tasks             DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_photos            DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_photo_annotations DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_field_reports     DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_approvals         DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_audit_log         DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_memberships       DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_issues            DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.installation_plans             DROP COLUMN IF EXISTS org_id;
ALTER TABLE public.production_milestones          DROP COLUMN IF EXISTS org_id;
