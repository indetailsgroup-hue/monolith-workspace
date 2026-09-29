-- =============================================================================
-- 0194_rollback.sql
-- Rollback for migration 0194: Operational / Misc domain RLS
-- Restores original SELECT policies; drops org_id columns from all 11 tables.
-- FOR CI IDEMPOTENCY TESTING ONLY — never apply to production.
-- =============================================================================

BEGIN;

-- ── design_lock_field_config ──────────────────────────────────────────────────
DROP POLICY IF EXISTS design_lock_field_config_tenant_isolation
  ON public.design_lock_field_config;
ALTER TABLE public.design_lock_field_config DROP COLUMN IF EXISTS org_id;
CREATE POLICY design_lock_field_config_sel
  ON public.design_lock_field_config
  FOR SELECT TO authenticated
  USING (true);

-- ── issue_routing ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS issue_routing_tenant_isolation ON public.issue_routing;
ALTER TABLE public.issue_routing DROP COLUMN IF EXISTS org_id;
CREATE POLICY issue_routing_sel
  ON public.issue_routing
  FOR SELECT TO authenticated
  USING (true);

-- ── lead_followup_config ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS lead_followup_config_tenant_isolation
  ON public.lead_followup_config;
ALTER TABLE public.lead_followup_config DROP COLUMN IF EXISTS org_id;
CREATE POLICY lead_followup_config_sel
  ON public.lead_followup_config
  FOR SELECT TO authenticated
  USING (true);

-- ── material_master ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS material_master_tenant_isolation ON public.material_master;
ALTER TABLE public.material_master DROP COLUMN IF EXISTS org_id;
CREATE POLICY material_master_sel
  ON public.material_master
  FOR SELECT TO authenticated
  USING (true);

-- ── material_purchase_price ───────────────────────────────────────────────────
DROP POLICY IF EXISTS material_purchase_price_tenant_isolation
  ON public.material_purchase_price;
ALTER TABLE public.material_purchase_price DROP COLUMN IF EXISTS org_id;
CREATE POLICY material_purchase_price_sel
  ON public.material_purchase_price
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- ── ops_contacts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ops_contacts_tenant_isolation ON public.ops_contacts;
ALTER TABLE public.ops_contacts DROP COLUMN IF EXISTS org_id;
CREATE POLICY ops_contacts_sel
  ON public.ops_contacts
  FOR SELECT TO authenticated
  USING (true);

-- ── phase_rosters ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS phase_rosters_tenant_isolation ON public.phase_rosters;
ALTER TABLE public.phase_rosters DROP COLUMN IF EXISTS org_id;
CREATE POLICY phase_rosters_sel
  ON public.phase_rosters
  FOR SELECT TO authenticated
  USING (
    exists (
      select 1
      from public.installation_projects p
      where p.id = project_id
        and (
          public.is_governance_role()
          or public.has_site_access(p.site_code)
          or public.fn_installation_is_member(p.id)
        )
    )
  );

-- ── released_spec ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS released_spec_tenant_isolation ON public.released_spec;
ALTER TABLE public.released_spec DROP COLUMN IF EXISTS org_id;
CREATE POLICY released_spec_sel
  ON public.released_spec
  FOR SELECT TO authenticated
  USING (true);

-- ── revision_event ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS revision_event_tenant_isolation ON public.revision_event;
ALTER TABLE public.revision_event DROP COLUMN IF EXISTS org_id;
CREATE POLICY revision_event_sel
  ON public.revision_event
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

-- ── staff_bind_tokens ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS staff_bind_tokens_tenant_isolation ON public.staff_bind_tokens;
ALTER TABLE public.staff_bind_tokens DROP COLUMN IF EXISTS org_id;
CREATE POLICY staff_bind_tokens_sel
  ON public.staff_bind_tokens
  FOR SELECT TO authenticated
  USING (public.is_governance_role());

-- ── workflow_audit_log ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS workflow_audit_log_tenant_isolation ON public.workflow_audit_log;
ALTER TABLE public.workflow_audit_log DROP COLUMN IF EXISTS org_id;
CREATE POLICY workflow_audit_log_sel
  ON public.workflow_audit_log
  FOR SELECT TO authenticated
  USING (public.is_governance_role() OR public.has_site_access(site_code));

COMMIT;
