-- =============================================================================
-- 0193_site_field_ops_domain_rls.sql
-- Phase 2 RLS — Site / Field Ops domain — 7 tables (batch 7)
-- Tables: appointments, daily_reports, qc_inspections, site_checkins,
--         site_survey_zone, variation_orders, work_packages
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. appointments  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists appointments_sel on public.appointments;

alter table public.appointments
  add column if not exists org_id uuid;

update public.appointments a
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = a.project_id
);
update public.appointments
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.appointments alter column org_id set not null;

create policy appointments_tenant_isolation on public.appointments
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 2. daily_reports  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists daily_reports_sel on public.daily_reports;

alter table public.daily_reports
  add column if not exists org_id uuid;

update public.daily_reports dr
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = dr.project_id
);
update public.daily_reports
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.daily_reports alter column org_id set not null;

create policy daily_reports_tenant_isolation on public.daily_reports
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 3. qc_inspections  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists qc_inspections_sel on public.qc_inspections;

alter table public.qc_inspections
  add column if not exists org_id uuid;

update public.qc_inspections qi
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = qi.project_id
);
update public.qc_inspections
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.qc_inspections alter column org_id set not null;

create policy qc_inspections_tenant_isolation on public.qc_inspections
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 4. site_checkins  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists site_checkins_sel on public.site_checkins;

alter table public.site_checkins
  add column if not exists org_id uuid;

update public.site_checkins sc
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = sc.project_id
);
update public.site_checkins
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.site_checkins alter column org_id set not null;

create policy site_checkins_tenant_isolation on public.site_checkins
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 5. site_survey_zone  (site_code → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists site_survey_zone_sel on public.site_survey_zone;

alter table public.site_survey_zone
  add column if not exists org_id uuid;

update public.site_survey_zone ssz
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.site_code = ssz.site_code
  limit 1
)
where site_code is not null;
update public.site_survey_zone
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.site_survey_zone alter column org_id set not null;

create policy site_survey_zone_tenant_isolation on public.site_survey_zone
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 6. variation_orders  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists variation_orders_sel on public.variation_orders;

alter table public.variation_orders
  add column if not exists org_id uuid;

update public.variation_orders vo
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = vo.project_id
);
update public.variation_orders
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.variation_orders alter column org_id set not null;

create policy variation_orders_tenant_isolation on public.variation_orders
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 7. work_packages  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists work_packages_sel on public.work_packages;

alter table public.work_packages
  add column if not exists org_id uuid;

update public.work_packages wp
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = wp.project_id
);
update public.work_packages
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.work_packages alter column org_id set not null;

create policy work_packages_tenant_isolation on public.work_packages
  for select to authenticated
  using (org_id = public.get_user_org_id());
