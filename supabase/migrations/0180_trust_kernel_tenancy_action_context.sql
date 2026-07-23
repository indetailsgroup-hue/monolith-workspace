-- 0162: MONOLITH Production Trust Kernel — tenant membership + verified action contexts
-- Design 2026-07-22 §7 (authorization, tenancy, separation of duties).
--
-- Postgres is the sole release authority. Human authority is created ONLY under a
-- user bearer token: `create_verified_action_context` requires auth.role()='authenticated',
-- derives auth.uid(), reads current tenant membership + AAL from server-side tables, and
-- NEVER accepts actor/role/name/tenant/site/object-path from the caller as authority.
-- A service role cannot create a human action context (§7.2).
--
-- All six tables enable RLS; there is no client write policy and no write grant — every
-- write flows through the SECURITY DEFINER RPCs below. RLS SELECT policies are membership-
-- scoped (never `using (true)`) per §7.5.
--
-- Daph / tenant 001 is FIXTURE/onboarding data provisioned by tests and seeds, never a
-- schema constant; tenant 002 coexists with zero source changes (see trust_kernel_tenancy.sql).
--
-- Stable reason codes (design §13, server/src/trust-kernel/reasonCodes.ts) are the exact
-- error strings raised here. Phase: NOT_FOR_PRODUCTION.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Null-safe 64-char lowercase-hex (sha256) check. IMMUTABLE so it can back CHECKs.
create or replace function public.fn_is_sha256_hex(p text)
returns boolean
language sql
immutable
as $$
  select p is not null and p ~ '^[0-9a-f]{64}$';
$$;

-- ---------------------------------------------------------------------------
-- Tables (tenant-scoped; role/site join tables carry (tenant_id, membership_id))
-- ---------------------------------------------------------------------------

create table public.monolith_tenant (
  id uuid primary key,
  slug text not null unique,
  display_name text not null,
  status text not null check (status in ('ACTIVE','SUSPENDED')),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.monolith_site (
  id uuid not null,
  tenant_id uuid not null references public.monolith_tenant(id),
  code text not null,
  display_name text not null,
  status text not null check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, id),
  unique (tenant_id, code)
);

create table public.monolith_membership (
  id uuid not null,
  tenant_id uuid not null references public.monolith_tenant(id),
  user_id uuid not null references auth.users(id),
  version bigint not null default 1,
  status text not null check (status in ('ACTIVE','REVOKED')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, id),
  unique (tenant_id, user_id)
);

create table public.monolith_membership_role (
  tenant_id uuid not null,
  membership_id uuid not null,
  role text not null check (role in ('DESIGNER','RELEASE_APPROVER','FACTORY','SAFETY_REVOKER','ADMIN','QA_EVIDENCE')),
  primary key (tenant_id, membership_id, role),
  foreign key (tenant_id, membership_id) references public.monolith_membership(tenant_id, id) on delete cascade
);

create table public.monolith_membership_site (
  tenant_id uuid not null,
  membership_id uuid not null,
  site_id uuid not null,
  primary key (tenant_id, membership_id, site_id),
  foreign key (tenant_id, membership_id) references public.monolith_membership(tenant_id, id) on delete cascade,
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id)
);

-- Immutable, short-lived, one-time authority handoff (design §7.2). id is a global uuid so
-- consume_verified_action_context(context_id, ...) can lock by id alone.
create table public.verified_action_context (
  id uuid primary key,
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  membership_id uuid not null,
  roles text[] not null,
  aal text not null,
  membership_version bigint not null,
  -- Action domain is the subset this task authorizes; Task 3 widens it for warning exceptions.
  action text not null check (action in ('FREEZE','RELEASE','REVOKE')),
  resource_type text not null check (resource_type in ('WORKING_REVISION','RELEASE_CANDIDATE','RELEASE_REVISION')),
  resource_id text not null,
  request_hash text not null,
  candidate_hash text,
  release_authorization_hash text,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  nonce text not null unique,
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, membership_id) references public.monolith_membership(tenant_id, id),
  constraint vac_request_hash_fmt check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint vac_candidate_hash_fmt check (candidate_hash is null or candidate_hash ~ '^[0-9a-f]{64}$'),
  constraint vac_release_auth_hash_fmt check (release_authorization_hash is null or release_authorization_hash ~ '^[0-9a-f]{64}$'),
  -- Declarative shape rules (defense in depth beside the RPC): FREEZE binds a working
  -- revision with null candidate hashes; RELEASE binds a candidate + release-authorization
  -- hash; REVOKE binds a release revision (design §7 / plan Task 2).
  constraint vac_action_shape check (
    case action
      when 'FREEZE'  then resource_type = 'WORKING_REVISION'  and candidate_hash is null     and release_authorization_hash is null
      when 'RELEASE' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is not null
      when 'REVOKE'  then resource_type = 'RELEASE_REVISION'  and candidate_hash is null     and release_authorization_hash is null
      else false
    end
  )
);

create index monolith_membership_user_idx on public.monolith_membership (user_id);
create index verified_action_context_tenant_idx on public.verified_action_context (tenant_id);

-- Tenants where the current JWT subject holds an ACTIVE membership. SECURITY DEFINER so
-- RLS policies can call it without recursing into monolith_membership's own RLS. Defined
-- after the table it reads (SQL-language bodies are validated at creation time).
create or replace function public.fn_monolith_member_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.monolith_membership m
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE';
$$;

-- ---------------------------------------------------------------------------
-- RLS: enabled on all six; membership-scoped SELECT only; no client write policy
-- ---------------------------------------------------------------------------

alter table public.monolith_tenant          enable row level security;
alter table public.monolith_site            enable row level security;
alter table public.monolith_membership      enable row level security;
alter table public.monolith_membership_role enable row level security;
alter table public.monolith_membership_site enable row level security;
alter table public.verified_action_context  enable row level security;

create policy monolith_tenant_sel on public.monolith_tenant
  for select to authenticated
  using (id in (select public.fn_monolith_member_tenant_ids()));

create policy monolith_site_sel on public.monolith_site
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

create policy monolith_membership_sel on public.monolith_membership
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

create policy monolith_membership_role_sel on public.monolith_membership_role
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

create policy monolith_membership_site_sel on public.monolith_membership_site
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

create policy verified_action_context_sel on public.verified_action_context
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids())
         and actor_user_id = auth.uid());

-- Reads for authenticated (RLS still filters rows); no anon; no write grants at all.
grant select on
  public.monolith_tenant,
  public.monolith_site,
  public.monolith_membership,
  public.monolith_membership_role,
  public.monolith_membership_site,
  public.verified_action_context
  to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create_verified_action_context — user-token only, no client authority fields
-- ---------------------------------------------------------------------------

create or replace function public.create_verified_action_context(
  p_action text,
  p_tenant_id uuid,
  p_site_id uuid,
  p_resource_type text,
  p_resource_id text,
  p_request_hash text,
  p_candidate_hash text default null,
  p_release_authorization_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_membership public.monolith_membership%rowtype;
  v_roles text[];
  v_required_role text;
  v_expected_resource_type text;
  v_aal text;
  v_new_id uuid;
begin
  -- (1) Human authority only. Reject anonymous/service identities (§7.1 #2, §7.2).
  if auth.role() is distinct from 'authenticated' then
    raise exception 'AUTH_ANON_NOT_ALLOWED'
      using errcode = 'insufficient_privilege',
            detail = 'create_verified_action_context requires an authenticated user bearer token';
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'AUTH_REQUIRED'
      using errcode = 'insufficient_privilege',
            detail = 'no authenticated subject in JWT';
  end if;

  -- (2) Action + request-hash validity (never trust client authority fields).
  if p_action not in ('FREEZE','RELEASE','REVOKE') then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'unsupported action ' || coalesce(p_action,'<null>');
  end if;
  if not public.fn_is_sha256_hex(p_request_hash) then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'request_hash must be sha256 hex';
  end if;

  -- (3) Current membership from server-side source (§7.1 #3-#4).
  select * into v_membership
  from public.monolith_membership
  where tenant_id = p_tenant_id and user_id = v_uid;
  if not found then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'no membership in tenant';
  end if;
  if v_membership.status <> 'ACTIVE' then
    raise exception 'AUTH_MEMBERSHIP_REVOKED' using detail = 'membership is not active';
  end if;

  -- (4) Site must belong to the tenant AND be granted to this membership (§7.5).
  if not exists (
    select 1 from public.monolith_site s
    where s.tenant_id = p_tenant_id and s.id = p_site_id and s.status = 'ACTIVE'
  ) then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'site is not an active site of the tenant';
  end if;
  if not exists (
    select 1 from public.monolith_membership_site ms
    where ms.tenant_id = p_tenant_id and ms.membership_id = v_membership.id and ms.site_id = p_site_id
  ) then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'membership has no access to site';
  end if;

  -- (5) Role must permit the action (§7.1 #5, §7.3).
  v_required_role := case p_action
    when 'FREEZE'  then 'DESIGNER'
    when 'RELEASE' then 'RELEASE_APPROVER'
    when 'REVOKE'  then 'SAFETY_REVOKER'
  end;
  select array_agg(role) into v_roles
  from public.monolith_membership_role
  where tenant_id = p_tenant_id and membership_id = v_membership.id;
  if v_roles is null or not (v_required_role = any (v_roles)) then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'membership lacks role ' || v_required_role || ' required for ' || p_action;
  end if;

  -- (6) Action shape rules (§7 / plan Task 2). Resource type + hash presence must match.
  v_expected_resource_type := case p_action
    when 'FREEZE'  then 'WORKING_REVISION'
    when 'RELEASE' then 'RELEASE_CANDIDATE'
    when 'REVOKE'  then 'RELEASE_REVISION'
  end;
  if p_resource_type is distinct from v_expected_resource_type then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID'
      using detail = p_action || ' requires resource_type ' || v_expected_resource_type;
  end if;
  if p_resource_id is null or length(btrim(p_resource_id)) = 0 then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'resource_id is required';
  end if;
  if p_action = 'FREEZE' then
    if p_candidate_hash is not null or p_release_authorization_hash is not null then
      raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'FREEZE requires null candidate/authorization hashes';
    end if;
  elsif p_action = 'RELEASE' then
    if not public.fn_is_sha256_hex(p_candidate_hash) or not public.fn_is_sha256_hex(p_release_authorization_hash) then
      raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'RELEASE requires candidate + release-authorization sha256 hashes';
    end if;
  elsif p_action = 'REVOKE' then
    if p_candidate_hash is not null or p_release_authorization_hash is not null then
      raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'REVOKE requires a release-revision resource with null candidate/authorization hashes';
    end if;
  end if;

  -- (7) AAL derived from the verified JWT, never from the request body.
  v_aal := coalesce(auth.jwt() ->> 'aal', 'aal1');

  -- (8) Immutable short-lived context; 5-minute expiry from clock_timestamp(); one-time nonce.
  v_new_id := gen_random_uuid();
  insert into public.verified_action_context (
    id, tenant_id, site_id, actor_user_id, membership_id, roles, aal, membership_version,
    action, resource_type, resource_id, request_hash, candidate_hash, release_authorization_hash,
    issued_at, expires_at, nonce
  ) values (
    v_new_id, p_tenant_id, p_site_id, v_uid, v_membership.id, v_roles, v_aal, v_membership.version,
    p_action, p_resource_type, p_resource_id, p_request_hash, p_candidate_hash, p_release_authorization_hash,
    clock_timestamp(), clock_timestamp() + interval '5 minutes', gen_random_uuid()::text
  );
  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC (internal): consume_verified_action_context — lock, one-time, recheck
-- ---------------------------------------------------------------------------

create or replace function public.consume_verified_action_context(
  p_context_id uuid,
  p_expected_action text
) returns public.verified_action_context
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.verified_action_context%rowtype;
  v_membership public.monolith_membership%rowtype;
begin
  -- Lock the row for one-time-nonce semantics.
  select * into v from public.verified_action_context where id = p_context_id for update;
  if not found then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'unknown action context';
  end if;
  if v.consumed_at is not null then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'action context already consumed';
  end if;
  if clock_timestamp() > v.expires_at then
    raise exception 'AUTH_ACTION_CONTEXT_EXPIRED' using detail = 'action context expired';
  end if;
  if v.action is distinct from p_expected_action then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'action does not match the context';
  end if;

  -- Membership must still be ACTIVE at the version pinned when the context was issued.
  select * into v_membership
  from public.monolith_membership
  where tenant_id = v.tenant_id and id = v.membership_id;
  if not found or v_membership.status <> 'ACTIVE' then
    raise exception 'AUTH_MEMBERSHIP_REVOKED' using detail = 'membership is no longer active';
  end if;
  if v_membership.version <> v.membership_version then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'membership version changed since issuance';
  end if;

  update public.verified_action_context
    set consumed_at = clock_timestamp()
    where id = v.id
    returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution grants (least privilege)
-- ---------------------------------------------------------------------------

revoke all on function public.fn_is_sha256_hex(text) from public;
grant execute on function public.fn_is_sha256_hex(text) to authenticated, service_role;

revoke all on function public.fn_monolith_member_tenant_ids() from public;
grant execute on function public.fn_monolith_member_tenant_ids() to authenticated, service_role;

-- create: only an authenticated user token may call it (service role denied at the grant
-- layer AND by the auth.role() guard inside).
revoke all on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) to authenticated;

-- consume: internal only. Reached through the user-authorized mutation RPC (Task 4) or the
-- post-commit service worker; never callable directly by a client.
revoke all on function public.consume_verified_action_context(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_verified_action_context(uuid, text) to service_role;

comment on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text)
  is 'Trust Kernel §7.2: creates an immutable 5-minute VerifiedActionContextV1 from the caller''s user JWT (auth.uid/role/aal + current membership). Rejects service role and every client-supplied authority field.';
comment on function public.consume_verified_action_context(uuid, text)
  is 'Trust Kernel §7.2: locks and one-time-consumes an action context, rechecking action/expiry/membership version. Stable errors AUTH_ACTION_CONTEXT_INVALID / AUTH_ACTION_CONTEXT_EXPIRED / AUTH_MEMBERSHIP_REVOKED.';
