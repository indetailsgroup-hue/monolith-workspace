-- =============================================================================
-- 0191_package_sales_domain_rls.sql
-- Phase 2 RLS — Package / Sales domain — 7 tables (batch 5)
-- Tables: package_addons, package_estimates, package_materials, package_stages,
--         price_rates, project_turnkey, turnkey_offers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. package_addons  (package_id → work_packages → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists package_addons_sel on public.package_addons;

alter table public.package_addons
  add column if not exists org_id uuid;

update public.package_addons pa
set org_id = (
  select ip.org_id
  from public.work_packages w
  join public.installation_projects ip on ip.id = w.project_id
  where w.id = pa.package_id
);
update public.package_addons
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.package_addons alter column org_id set not null;

create policy package_addons_tenant_isolation on public.package_addons
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 2. package_estimates  (package_id PK → work_packages → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists package_estimates_sel on public.package_estimates;

alter table public.package_estimates
  add column if not exists org_id uuid;

update public.package_estimates pe
set org_id = (
  select ip.org_id
  from public.work_packages w
  join public.installation_projects ip on ip.id = w.project_id
  where w.id = pe.package_id
);
update public.package_estimates
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.package_estimates alter column org_id set not null;

create policy package_estimates_tenant_isolation on public.package_estimates
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 3. package_materials  (package_id → work_packages → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists package_materials_sel on public.package_materials;

alter table public.package_materials
  add column if not exists org_id uuid;

update public.package_materials pm
set org_id = (
  select ip.org_id
  from public.work_packages w
  join public.installation_projects ip on ip.id = w.project_id
  where w.id = pm.package_id
);
update public.package_materials
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.package_materials alter column org_id set not null;

create policy package_materials_tenant_isolation on public.package_materials
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 4. package_stages  (package_id → work_packages → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists package_stages_sel on public.package_stages;

alter table public.package_stages
  add column if not exists org_id uuid;

update public.package_stages ps
set org_id = (
  select ip.org_id
  from public.work_packages w
  join public.installation_projects ip on ip.id = w.project_id
  where w.id = ps.package_id
);
update public.package_stages
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.package_stages alter column org_id set not null;

create policy package_stages_tenant_isolation on public.package_stages
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 5. price_rates  (SENTINEL CONFIG — shared rate table; no org link)
-- ---------------------------------------------------------------------------
drop policy if exists price_rates_sel on public.price_rates;

alter table public.price_rates
  add column if not exists org_id uuid;

update public.price_rates
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.price_rates alter column org_id set not null;

create policy price_rates_tenant_isolation on public.price_rates
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 6. project_turnkey  (project_id PK → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists project_turnkey_sel on public.project_turnkey;

alter table public.project_turnkey
  add column if not exists org_id uuid;

update public.project_turnkey pt
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = pt.project_id
);
update public.project_turnkey
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.project_turnkey alter column org_id set not null;

create policy project_turnkey_tenant_isolation on public.project_turnkey
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 7. turnkey_offers  (SENTINEL CONFIG — shared tier catalog; no org link)
-- ---------------------------------------------------------------------------
drop policy if exists turnkey_offers_sel on public.turnkey_offers;

alter table public.turnkey_offers
  add column if not exists org_id uuid;

update public.turnkey_offers
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.turnkey_offers alter column org_id set not null;

create policy turnkey_offers_tenant_isolation on public.turnkey_offers
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);
