-- =============================================================================
-- 0194_operational_misc_domain_rls.sql
-- Phase 2 RLS — Operational / Misc domain — 11 tables (batch 8, final)
-- Tables: design_lock_field_config, issue_routing, lead_followup_config,
--         material_master, material_purchase_price, ops_contacts,
--         phase_rosters, released_spec, revision_event,
--         staff_bind_tokens, workflow_audit_log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. design_lock_field_config  (gate config — sentinel shared data)
-- ---------------------------------------------------------------------------
drop policy if exists design_lock_field_config_sel on public.design_lock_field_config;

alter table public.design_lock_field_config
  add column if not exists org_id uuid;

update public.design_lock_field_config
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.design_lock_field_config alter column org_id set not null;

create policy design_lock_field_config_tenant_isolation on public.design_lock_field_config
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 2. issue_routing  (routing config — sentinel shared data)
-- ---------------------------------------------------------------------------
drop policy if exists issue_routing_sel on public.issue_routing;

alter table public.issue_routing
  add column if not exists org_id uuid;

update public.issue_routing
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.issue_routing alter column org_id set not null;

create policy issue_routing_tenant_isolation on public.issue_routing
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 3. lead_followup_config  (single-row global config — sentinel)
-- ---------------------------------------------------------------------------
drop policy if exists lead_followup_config_sel on public.lead_followup_config;

alter table public.lead_followup_config
  add column if not exists org_id uuid;

update public.lead_followup_config
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.lead_followup_config alter column org_id set not null;

create policy lead_followup_config_tenant_isolation on public.lead_followup_config
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 4. material_master  (reference catalog — sentinel shared data)
-- ---------------------------------------------------------------------------
drop policy if exists material_master_sel on public.material_master;

alter table public.material_master
  add column if not exists org_id uuid;

update public.material_master
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.material_master alter column org_id set not null;

create policy material_master_tenant_isolation on public.material_master
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 5. material_purchase_price  (site_code → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists material_purchase_price_sel on public.material_purchase_price;

alter table public.material_purchase_price
  add column if not exists org_id uuid;

update public.material_purchase_price mpp
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.site_code = mpp.site_code
  limit 1
)
where site_code is not null;
update public.material_purchase_price
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.material_purchase_price alter column org_id set not null;

create policy material_purchase_price_tenant_isolation on public.material_purchase_price
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 6. ops_contacts  (role → employee_id config — sentinel shared data)
-- ---------------------------------------------------------------------------
drop policy if exists ops_contacts_sel on public.ops_contacts;

alter table public.ops_contacts
  add column if not exists org_id uuid;

update public.ops_contacts
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.ops_contacts alter column org_id set not null;

create policy ops_contacts_tenant_isolation on public.ops_contacts
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 7. phase_rosters  (project_id → installation_projects.org_id)
-- ---------------------------------------------------------------------------
drop policy if exists phase_rosters_sel on public.phase_rosters;

alter table public.phase_rosters
  add column if not exists org_id uuid;

update public.phase_rosters pr
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.id = pr.project_id
);
update public.phase_rosters
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.phase_rosters alter column org_id set not null;

create policy phase_rosters_tenant_isolation on public.phase_rosters
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- ---------------------------------------------------------------------------
-- 8. released_spec  (shared design reference catalog — sentinel)
-- ---------------------------------------------------------------------------
drop policy if exists released_spec_sel on public.released_spec;

alter table public.released_spec
  add column if not exists org_id uuid;

update public.released_spec
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.released_spec alter column org_id set not null;

create policy released_spec_tenant_isolation on public.released_spec
  for select to authenticated
  using (org_id = public.get_user_org_id()
      or org_id = '00000000-0000-0000-0000-000000000000'::uuid);

-- ---------------------------------------------------------------------------
-- 9. revision_event  (site_code nullable — audit log; governance cross-site)
-- ---------------------------------------------------------------------------
drop policy if exists revision_event_sel on public.revision_event;

alter table public.revision_event
  add column if not exists org_id uuid;

update public.revision_event re
set org_id = (
  select ip.org_id
  from public.installation_projects ip
  where ip.site_code = re.site_code
  limit 1
)
where site_code is not null;
update public.revision_event
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.revision_event alter column org_id set not null;

create policy revision_event_tenant_isolation on public.revision_event
  for select to authenticated
  using (org_id = public.get_user_org_id() or public.is_governance_role());

-- ---------------------------------------------------------------------------
-- 10. staff_bind_tokens  (governance-managed bind tokens — governance-only read)
-- ---------------------------------------------------------------------------
drop policy if exists staff_bind_tokens_sel on public.staff_bind_tokens;

alter table public.staff_bind_tokens
  add column if not exists org_id uuid;

update public.staff_bind_tokens
  set org_id = '00000000-0000-0000-0000-000000000000'::uuid
  where org_id is null;
alter table public.staff_bind_tokens alter column org_id set not null;

create policy staff_bind_tokens_tenant_isolation on public.staff_bind_tokens
  for select to authenticated
  using (public.is_governance_role());

-- ---------------------------------------------------------------------------
-- 11. workflow_audit_log  (site_code nullable — audit log; governance cross-site)
-- ---------------------------------------------------------------------------
drop policy if exists workflow_audit_log_sel on public.workflow_audit_log;

alter table public.workflow_audit_log
  add column if not exists org_id uuid;

-- Temporarily suspend only the append-only trigger for this one-time schema
-- backfill. Do not disable foreign-key or unrelated business triggers. The
-- table lock prevents concurrent writes, and the exception path restores
-- immutability before propagating any failure.
do $workflow_audit_org_backfill$
begin
  execute 'alter table public.workflow_audit_log '
       || 'disable trigger trg_workflow_audit_log_immutable';

  update public.workflow_audit_log wal
  set org_id = (
    select ip.org_id
    from public.installation_projects ip
    where ip.site_code = wal.site_code
    limit 1
  )
  where site_code is not null;

  update public.workflow_audit_log
    set org_id = '00000000-0000-0000-0000-000000000000'::uuid
    where org_id is null;

  execute 'alter table public.workflow_audit_log '
       || 'enable trigger trg_workflow_audit_log_immutable';
exception
  when others then
    execute 'alter table public.workflow_audit_log '
         || 'enable trigger trg_workflow_audit_log_immutable';
    raise;
end
$workflow_audit_org_backfill$;
alter table public.workflow_audit_log alter column org_id set not null;

create policy workflow_audit_log_tenant_isolation on public.workflow_audit_log
  for select to authenticated
  using (org_id = public.get_user_org_id() or public.is_governance_role());
