-- =============================================================================
-- 0193_rollback.sql
-- Rollback: 0193_site_field_ops_domain_rls
-- CI idempotency testing only — never apply to production
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. appointments — drop tenant_isolation, drop org_id, restore original policy
-- ---------------------------------------------------------------------------
drop policy if exists appointments_tenant_isolation on public.appointments;
alter table public.appointments drop column if exists org_id;
drop policy if exists appointments_sel on public.appointments;
create policy appointments_sel on public.appointments
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));

-- ---------------------------------------------------------------------------
-- 2. daily_reports
-- ---------------------------------------------------------------------------
drop policy if exists daily_reports_tenant_isolation on public.daily_reports;
alter table public.daily_reports drop column if exists org_id;
drop policy if exists daily_reports_sel on public.daily_reports;
create policy daily_reports_sel on public.daily_reports
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));

-- ---------------------------------------------------------------------------
-- 3. qc_inspections
-- ---------------------------------------------------------------------------
drop policy if exists qc_inspections_tenant_isolation on public.qc_inspections;
alter table public.qc_inspections drop column if exists org_id;
drop policy if exists qc_inspections_sel on public.qc_inspections;
create policy qc_inspections_sel on public.qc_inspections
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));

-- ---------------------------------------------------------------------------
-- 4. site_checkins
-- ---------------------------------------------------------------------------
drop policy if exists site_checkins_tenant_isolation on public.site_checkins;
alter table public.site_checkins drop column if exists org_id;
drop policy if exists site_checkins_sel on public.site_checkins;
create policy site_checkins_sel on public.site_checkins
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));

-- ---------------------------------------------------------------------------
-- 5. site_survey_zone
-- ---------------------------------------------------------------------------
drop policy if exists site_survey_zone_tenant_isolation on public.site_survey_zone;
alter table public.site_survey_zone drop column if exists org_id;
drop policy if exists site_survey_zone_sel on public.site_survey_zone;
create policy site_survey_zone_sel on public.site_survey_zone
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));

-- ---------------------------------------------------------------------------
-- 6. variation_orders
-- ---------------------------------------------------------------------------
drop policy if exists variation_orders_tenant_isolation on public.variation_orders;
alter table public.variation_orders drop column if exists org_id;
drop policy if exists variation_orders_sel on public.variation_orders;
create policy variation_orders_sel on public.variation_orders
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));

-- ---------------------------------------------------------------------------
-- 7. work_packages
-- ---------------------------------------------------------------------------
drop policy if exists work_packages_tenant_isolation on public.work_packages;
alter table public.work_packages drop column if exists org_id;
drop policy if exists work_packages_sel on public.work_packages;
create policy work_packages_sel on public.work_packages
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))
  ));
