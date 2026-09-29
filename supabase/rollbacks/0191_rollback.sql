-- =============================================================================
-- 0191_rollback.sql
-- CI idempotency rollback for 0191_package_sales_domain_rls.sql
-- NEVER apply to production — for forward-and-back CI testing only
-- =============================================================================

-- 7. turnkey_offers
drop policy if exists turnkey_offers_tenant_isolation on public.turnkey_offers;
alter table public.turnkey_offers drop column if exists org_id;
create policy turnkey_offers_sel on public.turnkey_offers
  for select to authenticated using (true);

-- 6. project_turnkey
drop policy if exists project_turnkey_tenant_isolation on public.project_turnkey;
alter table public.project_turnkey drop column if exists org_id;
create policy project_turnkey_sel on public.project_turnkey
  for select to authenticated
  using (exists (
    select 1 from public.installation_projects p
    where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- 5. price_rates
drop policy if exists price_rates_tenant_isolation on public.price_rates;
alter table public.price_rates drop column if exists org_id;
create policy price_rates_sel on public.price_rates
  for select to authenticated using (true);

-- 4. package_stages
drop policy if exists package_stages_tenant_isolation on public.package_stages;
alter table public.package_stages drop column if exists org_id;
create policy package_stages_sel on public.package_stages
  for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- 3. package_materials
drop policy if exists package_materials_tenant_isolation on public.package_materials;
alter table public.package_materials drop column if exists org_id;
create policy package_materials_sel on public.package_materials
  for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- 2. package_estimates
drop policy if exists package_estimates_tenant_isolation on public.package_estimates;
alter table public.package_estimates drop column if exists org_id;
create policy package_estimates_sel on public.package_estimates
  for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code))));

-- 1. package_addons
drop policy if exists package_addons_tenant_isolation on public.package_addons;
alter table public.package_addons drop column if exists org_id;
create policy package_addons_sel on public.package_addons
  for select to authenticated
  using (exists (
    select 1 from public.work_packages w join public.installation_projects p on p.id = w.project_id
    where w.id = package_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));
