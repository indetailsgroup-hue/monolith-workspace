-- ===========================================================================
-- 0186_trust_kernel_content_revocation_registry.sql
-- MONOLITH Production Trust Kernel — deny-only content-revocation registry +
--   SAFETY block RPC + SAFETY_BLOCK action (plan Task 3)
--
-- Design 2026-07-22 §10.4 (revocation semantics) + plan
-- 2026-07-24-trust-kernel-safety-content-revocation-registry.en.md Task 3.
--
-- WHAT THIS DOES (deny-only; NEVER grants):
--   (a) Widens the 0180/0181 action domain to admit SAFETY_BLOCK, extends
--       vac_action_shape (SAFETY_BLOCK binds a RELEASE_REVISION with null
--       candidate/authorization hashes — the same hash-field shape as REVOKE),
--       and CREATE OR REPLACEs create_verified_action_context so a SAFETY_BLOCK
--       context can be minted ONLY by a SAFETY_REVOKER. (SAFETY_UNBLOCK is NOT
--       added here — un-block is Task 5 and uses a different, harder mechanism.)
--   (b) release_content_revocation — an APPEND-ONLY event log of BLOCK/UNBLOCK
--       events, tenant+site scoped, with a monotonic per-tenant sequence. Task 3
--       only ever writes BLOCK; Task 5 will append UNBLOCK events.
--   (c) fn_content_is_blocked(tenant, site, content_hash) — the single deny
--       predicate Tasks 4 and 6 will call: TRUE iff the latest event (max
--       sequence) for that (tenant, site, content_hash) is a BLOCK.
--   (d) rpc_trust_safety_block_content(context, content_hash, reason_detail) —
--       consumes a SAFETY_BLOCK context, requires SAFETY-class revocation
--       provenance in the SAME tenant+site (else STATE_CONFLICT), and appends a
--       BLOCK event. It writes NO release_revision and no positive-authority row.
--
-- DENY-ONLY / NO DUAL-WRITE: release_revision stays the sole positive authority.
-- This migration only ever causes a raise or records a BLOCK event. TENANT+SITE
-- SCOPE is carried on every row and enforced on every check (a prior Gate
-- finding was a cross-tenant leak from an unscoped revocation row).
--
-- Additive over the committed 0180-0185 chain (does not edit them).
-- Phase: NOT_FOR_PRODUCTION (shadow-e0). No production markers/claims.
-- Apply: psql -1 -f supabase/migrations/0186_trust_kernel_content_revocation_registry.sql
-- ===========================================================================

-- Re-runnable during iteration: drop the new objects first, then rebuild.
drop function if exists public.rpc_trust_safety_block_content(uuid, text, text);
drop function if exists public.fn_content_is_blocked(uuid, uuid, text);
drop table if exists public.release_content_revocation cascade;

-- ---------------------------------------------------------------------------
-- (a) Widen the action domain to admit SAFETY_BLOCK (mirror 0181's ALTER style).
--     SAFETY_BLOCK binds a RELEASE_REVISION with null candidate/authorization
--     hashes — identical hash-field shape to REVOKE (it binds no candidate).
-- ---------------------------------------------------------------------------
alter table public.verified_action_context
  drop constraint if exists verified_action_context_action_check;
alter table public.verified_action_context
  add constraint verified_action_context_action_check
  check (action in ('FREEZE','RELEASE','REVOKE','GRANT_WARNING_EXCEPTION','SAFETY_BLOCK'));

alter table public.verified_action_context drop constraint if exists vac_action_shape;
alter table public.verified_action_context add constraint vac_action_shape check (
  case action
    when 'FREEZE'  then resource_type = 'WORKING_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'RELEASE' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is not null
    when 'REVOKE'  then resource_type = 'RELEASE_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'GRANT_WARNING_EXCEPTION' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is null
    when 'SAFETY_BLOCK' then resource_type = 'RELEASE_REVISION' and candidate_hash is null and release_authorization_hash is null
    else false
  end
);

-- ---------------------------------------------------------------------------
-- (a cont.) create_verified_action_context — CREATE OR REPLACE with SAFETY_BLOCK
--   added to the allow-list, the required-role case map (SAFETY_BLOCK ->
--   SAFETY_REVOKER), the expected-resource-type map, and the shape rules. All
--   existing FREEZE/RELEASE/REVOKE mappings are preserved verbatim (0180).
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
  --     SAFETY_BLOCK joins the allow-list here (plan Task 3); SAFETY_UNBLOCK is
  --     intentionally NOT admitted (Task 5).
  if p_action not in ('FREEZE','RELEASE','REVOKE','SAFETY_BLOCK') then
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

  -- (5) Role must permit the action (§7.1 #5, §7.3). SAFETY_BLOCK, like REVOKE,
  --     requires SAFETY_REVOKER — content-blocking is a safety authority.
  v_required_role := case p_action
    when 'FREEZE'       then 'DESIGNER'
    when 'RELEASE'      then 'RELEASE_APPROVER'
    when 'REVOKE'       then 'SAFETY_REVOKER'
    when 'SAFETY_BLOCK' then 'SAFETY_REVOKER'
  end;
  select array_agg(role) into v_roles
  from public.monolith_membership_role
  where tenant_id = p_tenant_id and membership_id = v_membership.id;
  if v_roles is null or not (v_required_role = any (v_roles)) then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'membership lacks role ' || v_required_role || ' required for ' || p_action;
  end if;

  -- (6) Action shape rules (§7 / plan Task 2/3). Resource type + hash presence
  --     must match. SAFETY_BLOCK mirrors REVOKE: RELEASE_REVISION, no hashes.
  v_expected_resource_type := case p_action
    when 'FREEZE'       then 'WORKING_REVISION'
    when 'RELEASE'      then 'RELEASE_CANDIDATE'
    when 'REVOKE'       then 'RELEASE_REVISION'
    when 'SAFETY_BLOCK' then 'RELEASE_REVISION'
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
  elsif p_action = 'SAFETY_BLOCK' then
    if p_candidate_hash is not null or p_release_authorization_hash is not null then
      raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'SAFETY_BLOCK requires a release-revision resource with null candidate/authorization hashes';
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

-- Grants preserved by CREATE OR REPLACE; re-assert defensively (mirror 0180).
revoke all on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (b) release_content_revocation — append-only BLOCK/UNBLOCK event log.
--     Deny-only: rows only ever DENY (BLOCK) or LATER reverse a deny (UNBLOCK,
--     Task 5). Never a positive authority. Tenant+site scoped on EVERY row.
--     Monotonic per-tenant `sequence` (allocated exactly like revoke_sequence
--     at 0182/0185). Rows are immutable by design: there is no write grant and
--     no RPC path that UPDATEs or DELETEs them — it is an event log.
-- ---------------------------------------------------------------------------
create table public.release_content_revocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  content_hash text not null,
  -- The specific SAFETY-revoked release_revision this event was bound to. BLOCK
  -- events (Task 3) always carry it — it is v_ctx.resource_id, the exact revision
  -- the SAFETY_REVOKER authorized; Task-5 UNBLOCK events do NOT (they reverse by
  -- content_hash under a harder gate), hence nullable. The composite FK ties it to
  -- a revision IN THE SAME TENANT (MATCH SIMPLE: skipped when the column is null).
  release_revision_id uuid,
  action text not null check (action in ('BLOCK','UNBLOCK')),
  sequence bigint not null,
  actor_user_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default now(),
  detail text,
  unique (tenant_id, sequence),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id),
  constraint rcr_content_hash_fmt check (public.fn_is_sha256_hex(content_hash)),
  constraint rcr_sequence_pos check (sequence > 0)
);

-- Supports the latest-event lookup in fn_content_is_blocked (max sequence for a
-- given tenant+site+content_hash) and the per-tenant sequence allocation.
create index release_content_revocation_lookup_idx
  on public.release_content_revocation (tenant_id, site_id, content_hash, sequence desc);
create index release_content_revocation_tenant_idx
  on public.release_content_revocation (tenant_id);

-- RLS + grants mirror the sibling event tables (0182 release_event): RLS on,
-- membership-scoped SELECT only, SELECT to authenticated, NO write grant/policy.
alter table public.release_content_revocation enable row level security;

create policy release_content_revocation_sel on public.release_content_revocation
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

revoke all on public.release_content_revocation from public, anon;
-- A deny log must be tamper-resistant: Supabase's default privileges grant
-- `authenticated` TRUNCATE/REFERENCES/TRIGGER on every new table, so a plain
-- `revoke ... from public, anon` leaves those inherited on authenticated. Strip
-- them explicitly, then re-grant only SELECT (RLS still filters rows). Writes flow
-- solely through the SECURITY DEFINER RPC; no client may TRUNCATE/INSERT/UPDATE/DELETE.
revoke all on public.release_content_revocation from authenticated;
grant select on public.release_content_revocation to authenticated;

comment on table public.release_content_revocation is
  'Trust Kernel §10.4 (plan Task 3): APPEND-ONLY, tenant+site-scoped, deny-only event log of content BLOCK/UNBLOCK events with a monotonic per-tenant sequence. Never a positive authority; release_revision remains the sole positive authority. Task 3 writes only BLOCK; Task 5 appends UNBLOCK. Phase NOT_FOR_PRODUCTION.';

-- ---------------------------------------------------------------------------
-- (c) fn_content_is_blocked — the single deny predicate (Tasks 4 & 6 call it).
--     TRUE iff the LATEST event (max sequence — the per-tenant sequence is
--     monotonic, so the max among matching rows is the newest event) for the
--     (tenant, site, content_hash) is a BLOCK. No event / latest UNBLOCK => FALSE.
--
--     SECURITY DEFINER so it authoritatively sees ALL block rows regardless of
--     the caller's RLS view — a deny predicate must NEVER return a false-negative
--     because a row was RLS-filtered. To avoid that authority doubling as a
--     cross-tenant probe, EXECUTE is granted to service_role only (the Task 4/6
--     RPCs reach it inside their own SECURITY DEFINER/owner context); it is NOT
--     exposed to authenticated. STABLE (read-only).
-- ---------------------------------------------------------------------------
create function public.fn_content_is_blocked(
  p_tenant_id uuid,
  p_site_id uuid,
  p_content_hash text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Fail-closed: a deny predicate must NEVER silently allow on a null key. A null
  -- tenant/site/content_hash is a malformed request, not "nothing is blocked".
  if p_tenant_id is null or p_site_id is null or p_content_hash is null then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID'
      using detail = 'fn_content_is_blocked requires non-null tenant/site/content_hash';
  end if;
  return coalesce(
    (select r.action = 'BLOCK'
       from public.release_content_revocation r
      where r.tenant_id = p_tenant_id
        and r.site_id = p_site_id
        and r.content_hash = p_content_hash
      order by r.sequence desc
      limit 1),
    false);
end;
$$;

revoke all on function public.fn_content_is_blocked(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_content_is_blocked(uuid, uuid, text) to service_role;

comment on function public.fn_content_is_blocked(uuid, uuid, text) is
  'Trust Kernel §10.4 (plan Task 3): deny predicate — TRUE iff the latest content-revocation event for (tenant, site, content_hash) is a BLOCK. Single source of truth for the Task 4 commit-time and Task 6 begin-time denials. SECURITY DEFINER + service_role-only so it is authoritative but not a cross-tenant probe.';

-- ---------------------------------------------------------------------------
-- (d) rpc_trust_safety_block_content — consume SAFETY_BLOCK context, require
--     SAFETY-revocation provenance in the SAME tenant+site, append a BLOCK event.
--     Deny-only: writes NO release_revision and no positive-authority row.
-- ---------------------------------------------------------------------------
create function public.rpc_trust_safety_block_content(
  p_context_id uuid,
  p_content_hash text,
  p_reason_detail text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx public.verified_action_context%rowtype;
  v_authorized_hash text;
  v_seq bigint;
  v_new_id uuid;
begin
  -- (1) Consume a FRESH SAFETY_BLOCK context. Role SAFETY_REVOKER is enforced at
  --     mint time by create_verified_action_context; consume re-checks
  --     action/expiry/membership-version and one-time use.
  v_ctx := public.consume_verified_action_context(p_context_id, 'SAFETY_BLOCK');

  -- (2) Site-authority: the block is scoped to the context's tenant+site. Beyond
  --     that, step (4) binds the block to v_ctx.resource_id — the specific
  --     release_revision the SAFETY_BLOCK context was authorized for (like REVOKE).

  -- (3) Content-hash format. A malformed hash is a malformed request (same stable
  --     code the sibling RPCs use for a malformed request parameter, e.g. 0185's
  --     reason-class validation).
  if not public.fn_is_sha256_hex(p_content_hash) then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'content_hash must be sha256 hex';
  end if;

  -- (4) PROVENANCE + BINDING (design §10.4): you may only content-block the
  --     specific release_revision the SAFETY_REVOKER authorized. v_ctx.resource_id
  --     names that revision; load IT (bound to this tenant+site) and require it to
  --     be SAFETY-revoked. Any other state (unknown id, ACTIVE, REVOKED for a
  --     non-SAFETY class, or a different tenant/site) is a STATE_CONFLICT — the
  --     registry never manufactures a deny for content the safety process never
  --     condemned. Then bind the free p_content_hash parameter to that revision's
  --     content_hash, mirroring rpc_trust_revoke's `v_ctx.resource_id is distinct
  --     from <target>` check (0182/0185): the caller cannot block an arbitrary
  --     in-scope SAFETY hash, only the one the context was authorized for.
  select rr.content_hash into v_authorized_hash
    from public.release_revision rr
    where rr.tenant_id = v_ctx.tenant_id
      and rr.site_id   = v_ctx.site_id
      and rr.id        = v_ctx.resource_id::uuid
      and rr.status    = 'REVOKED'
      and rr.revoke_reason_class = 'SAFETY';
  if not found then
    raise exception 'STATE_CONFLICT'
      using detail = 'content block requires the context-authorized release revision to be SAFETY-revoked in this tenant/site';
  end if;
  if p_content_hash is distinct from v_authorized_hash then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID'
      using detail = 'p_content_hash does not match the content_hash of the context-authorized release revision';
  end if;

  -- (5) Advisory-lock + monotonic per-tenant sequence (same discipline as
  --     revoke_sequence at 0182/0185), then append a BLOCK event.
  perform pg_advisory_xact_lock(hashtext('monolith_content_revocation_sequence:' || v_ctx.tenant_id::text));
  select coalesce(max(sequence), 0) + 1 into v_seq
    from public.release_content_revocation where tenant_id = v_ctx.tenant_id;

  v_new_id := gen_random_uuid();
  -- Record content_hash = v_authorized_hash (the revision's own hash, identical to
  -- the now-validated p_content_hash) and release_revision_id = the authorized
  -- revision, so every BLOCK row is traceable to the exact revision it condemned.
  insert into public.release_content_revocation
    (id, tenant_id, site_id, content_hash, release_revision_id, action, sequence, actor_user_id, detail)
  values
    (v_new_id, v_ctx.tenant_id, v_ctx.site_id, v_authorized_hash, v_ctx.resource_id::uuid, 'BLOCK', v_seq, v_ctx.actor_user_id, p_reason_detail);

  -- (6) Deny-only: NO write to release_revision or any positive-authority row.
  return v_new_id;
end;
$$;

-- User-authorized RPC (mirror rpc_trust_revoke grants): the human SAFETY_BLOCK
-- action context is the authority; service_role is allowed for tests/orchestration
-- but cannot mint the underlying human action context (0180).
revoke all on function public.rpc_trust_safety_block_content(uuid, text, text) from public, anon;
grant execute on function public.rpc_trust_safety_block_content(uuid, text, text) to authenticated, service_role;

comment on function public.rpc_trust_safety_block_content(uuid, text, text) is
  'Trust Kernel §10.4 (plan Task 3): consumes a SAFETY_BLOCK action context (role SAFETY_REVOKER), loads the context-authorized release revision (v_ctx.resource_id) and requires it to be SAFETY-revoked in the same tenant+site (else STATE_CONFLICT), binds p_content_hash to that revision''s content_hash (else AUTH_ACTION_CONTEXT_INVALID), then appends a monotonic BLOCK event (content_hash + release_revision_id) to release_content_revocation. Deny-only: writes no release_revision. Stable errors AUTH_ACTION_CONTEXT_INVALID / AUTH_MEMBERSHIP_REVOKED / STATE_CONFLICT.';
