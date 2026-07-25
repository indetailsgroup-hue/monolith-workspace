-- 0189_repair_phase0_organization_scope.sql
-- Repair Intelligence Phase 0 (Task 4): canonical tenant -> organization -> site.
--
-- Organization becomes the normalized parent of site. The verified action
-- context pins organization_id through a transaction-time scope check; the
-- caller never supplies authoritative organization identity. Site-visible
-- trust surfaces move from tenant-only SELECT policies to site-grant policies
-- that also require the membership's organization grant, so same-tenant
-- cross-organization reads are denied — not only cross-tenant writes.
--
-- Additive and reversible: no table is dropped; the backfill creates one
-- 'default' organization per existing tenant and binds existing sites,
-- memberships, and unconsumed action contexts to it.

-- ---------------------------------------------------------------------------
-- 1) Organization: normalized parent of site
-- ---------------------------------------------------------------------------
create table public.monolith_organization (
  id uuid not null,
  tenant_id uuid not null references public.monolith_tenant(id),
  slug text not null,
  display_name text not null,
  legal_name text,
  status text not null check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, id),
  unique (tenant_id, slug)
);

alter table public.monolith_site add column organization_id uuid;

insert into public.monolith_organization
  (id, tenant_id, slug, display_name, legal_name, status)
select gen_random_uuid(), t.id, 'default', t.display_name, t.display_name, 'ACTIVE'
from public.monolith_tenant t
where not exists (
  select 1 from public.monolith_organization o where o.tenant_id = t.id
);

update public.monolith_site s
set organization_id = o.id
from public.monolith_organization o
where o.tenant_id = s.tenant_id
  and o.slug = 'default'
  and s.organization_id is null;

alter table public.monolith_site alter column organization_id set not null;
alter table public.monolith_site
  add constraint monolith_site_organization_fk
  foreign key (tenant_id, organization_id)
  references public.monolith_organization(tenant_id, id);
alter table public.monolith_site
  add constraint monolith_site_org_identity_uq
  unique (tenant_id, organization_id, id);

-- ---------------------------------------------------------------------------
-- 2) Membership organization grants
-- ---------------------------------------------------------------------------
create table public.monolith_membership_organization (
  tenant_id uuid not null,
  membership_id uuid not null,
  organization_id uuid not null,
  primary key (tenant_id, membership_id, organization_id),
  foreign key (tenant_id, membership_id)
    references public.monolith_membership(tenant_id, id) on delete cascade,
  foreign key (tenant_id, organization_id)
    references public.monolith_organization(tenant_id, id)
);

insert into public.monolith_membership_organization
  (tenant_id, membership_id, organization_id)
select distinct ms.tenant_id, ms.membership_id, s.organization_id
from public.monolith_membership_site ms
join public.monolith_site s
  on s.tenant_id = ms.tenant_id and s.id = ms.site_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3) Verified action context pins the organization
-- ---------------------------------------------------------------------------
alter table public.verified_action_context add column organization_id uuid;
update public.verified_action_context c
set organization_id = s.organization_id
from public.monolith_site s
where s.tenant_id = c.tenant_id and s.id = c.site_id;
alter table public.verified_action_context alter column organization_id set not null;
alter table public.verified_action_context
  add constraint verified_action_context_org_site_fk
  foreign key (tenant_id, organization_id, site_id)
  references public.monolith_site(tenant_id, organization_id, id);

-- The trigger derives organization_id from the tenant-bound active site and
-- requires the SAME membership to hold both the site grant and the
-- organization grant. The caller never supplies authoritative organization
-- identity; a mismatch fails closed with AUTH_SCOPE_DENIED.
create or replace function public.fn_bind_verified_action_context_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  select s.organization_id into v_organization_id
  from public.monolith_site s
  where s.tenant_id = new.tenant_id
    and s.id = new.site_id
    and s.status = 'ACTIVE';
  if not found then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'site is not active in the tenant scope';
  end if;
  if not exists (
    select 1 from public.monolith_membership_site ms
    where ms.tenant_id = new.tenant_id
      and ms.membership_id = new.membership_id
      and ms.site_id = new.site_id
  ) or not exists (
    select 1 from public.monolith_membership_organization mo
    where mo.tenant_id = new.tenant_id
      and mo.membership_id = new.membership_id
      and mo.organization_id = v_organization_id
  ) then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'membership lacks organization/site scope';
  end if;
  new.organization_id := v_organization_id;
  return new;
end;
$$;

create trigger verified_action_context_bind_organization
before insert or update of tenant_id, site_id, membership_id
on public.verified_action_context
for each row execute function public.fn_bind_verified_action_context_organization();

-- ---------------------------------------------------------------------------
-- 4) Scope helpers (security definer; return only the CURRENT user's active
--    grants — never another member's)
-- ---------------------------------------------------------------------------
create or replace function public.fn_monolith_member_org_grants()
returns table (tenant_id uuid, organization_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select mo.tenant_id, mo.organization_id
  from public.monolith_membership m
  join public.monolith_membership_organization mo
    on mo.tenant_id = m.tenant_id and mo.membership_id = m.id
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE';
$$;

-- Site scope requires BOTH the site grant and the organization grant of the
-- site's organization (same membership) — the organization boundary is
-- load-bearing inside a tenant.
create or replace function public.fn_monolith_member_scope_sites()
returns table (tenant_id uuid, site_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ms.tenant_id, ms.site_id
  from public.monolith_membership m
  join public.monolith_membership_site ms
    on ms.tenant_id = m.tenant_id and ms.membership_id = m.id
  join public.monolith_site s
    on s.tenant_id = ms.tenant_id and s.id = ms.site_id
  join public.monolith_membership_organization mo
    on mo.tenant_id = m.tenant_id
   and mo.membership_id = m.id
   and mo.organization_id = s.organization_id
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE';
$$;

revoke all on function public.fn_monolith_member_org_grants() from public, anon;
revoke all on function public.fn_monolith_member_scope_sites() from public, anon;
grant execute on function public.fn_monolith_member_org_grants() to authenticated;
grant execute on function public.fn_monolith_member_scope_sites() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS on the new tables: SELECT-only, membership-scoped; no client writes
-- ---------------------------------------------------------------------------
alter table public.monolith_organization enable row level security;
alter table public.monolith_membership_organization enable row level security;

create policy monolith_organization_sel on public.monolith_organization
  for select to authenticated
  using ((tenant_id, id) in (select g.tenant_id, g.organization_id from public.fn_monolith_member_org_grants() g));

create policy monolith_membership_organization_sel on public.monolith_membership_organization
  for select to authenticated
  using (exists (
    select 1 from public.monolith_membership m
    where m.tenant_id = monolith_membership_organization.tenant_id
      and m.id = monolith_membership_organization.membership_id
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  ));

revoke all on public.monolith_organization from public, anon;
revoke all on public.monolith_membership_organization from public, anon;
grant select on public.monolith_organization, public.monolith_membership_organization to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Replace tenant-only SELECT policies with organization/site-grant policies
-- ---------------------------------------------------------------------------
drop policy if exists monolith_site_sel on public.monolith_site;
create policy monolith_site_sel on public.monolith_site
  for select to authenticated
  using ((tenant_id, id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists machine_profile_attestation_sel on public.machine_profile_attestation;
create policy machine_profile_attestation_sel on public.machine_profile_attestation
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists warning_exception_grant_sel on public.warning_exception_grant;
create policy warning_exception_grant_sel on public.warning_exception_grant
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists release_working_revision_sel on public.release_working_revision;
create policy release_working_revision_sel on public.release_working_revision
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists release_candidate_sel on public.release_candidate;
create policy release_candidate_sel on public.release_candidate
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists release_attempt_sel on public.release_attempt;
create policy release_attempt_sel on public.release_attempt
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists release_revision_sel on public.release_revision;
create policy release_revision_sel on public.release_revision
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists release_artifact_sel on public.release_artifact;
create policy release_artifact_sel on public.release_artifact
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

drop policy if exists trust_bundle_publication_sel on public.trust_bundle_publication;
create policy trust_bundle_publication_sel on public.trust_bundle_publication
  for select to authenticated
  using ((tenant_id, site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g));

-- Approval/event/outbox rows carry no site_id; authorize through a join to the
-- site-bound release revision (still via the security-definer scope helper).
drop policy if exists release_approval_sel on public.release_approval;
create policy release_approval_sel on public.release_approval
  for select to authenticated
  using (exists (
    select 1 from public.release_revision rr
    where rr.tenant_id = release_approval.tenant_id
      and rr.id = release_approval.release_revision_id
      and (rr.tenant_id, rr.site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g)
  ));

drop policy if exists release_event_sel on public.release_event;
create policy release_event_sel on public.release_event
  for select to authenticated
  using (exists (
    select 1 from public.release_revision rr
    where rr.tenant_id = release_event.tenant_id
      and rr.id = release_event.release_revision_id
      and (rr.tenant_id, rr.site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g)
  ));

drop policy if exists release_outbox_sel on public.release_outbox;
create policy release_outbox_sel on public.release_outbox
  for select to authenticated
  using (exists (
    select 1 from public.release_revision rr
    where rr.tenant_id = release_outbox.tenant_id
      and rr.id = release_outbox.release_revision_id
      and (rr.tenant_id, rr.site_id) in (select g.tenant_id, g.site_id from public.fn_monolith_member_scope_sites() g)
  ));
