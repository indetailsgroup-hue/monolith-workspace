-- ===========================================================================
-- 0188_trust_kernel_content_unblock.sql
-- MONOLITH Production Trust Kernel — two-person, two-role content UN-BLOCK
--   (plan Task 5). Reverses a SAFETY content block under a gate DELIBERATELY
--   HARDER than the single-SAFETY_REVOKER block: two DISTINCT people holding
--   two DISTINCT non-SAFETY governance roles, plus a recorded justification.
--
-- Design 2026-07-22 §10.4 (revocation semantics) + plan
--   2026-07-24-trust-kernel-safety-content-revocation-registry.en.md Task 5.
--
-- WHAT THIS DOES (deny-only; NEVER grants; NEVER writes release_revision):
--   (a) Adds SAFETY_UNBLOCK to the verified_action_context action domain and to
--       vac_action_shape (same shape as SAFETY_BLOCK/REVOKE: RELEASE_REVISION,
--       null candidate/authorization hashes, resource_id = the SAFETY-revoked
--       release_revision). CREATE OR REPLACEs create_verified_action_context so a
--       SAFETY_UNBLOCK context is minted ONLY by a caller whose roles INTERSECT
--       {RELEASE_APPROVER, QA_EVIDENCE, ADMIN} — a dedicated eligible-set branch,
--       NOT a single required role. SAFETY_REVOKER alone is NOT eligible (the
--       blocker's safety role can never itself un-block). Every pre-existing
--       single-role mapping (FREEZE/RELEASE/REVOKE/SAFETY_BLOCK) is preserved.
--   (b) content_unblock_grant — a tenant+site-scoped audit row capturing the TWO
--       distinct (user, role) approver pairs, the justification, the content_hash
--       and release_revision it un-blocked, and the UNBLOCK event's sequence.
--       CHECKs enforce distinct users, distinct roles, both roles non-SAFETY, and
--       a non-empty justification. SELECT-only to authenticated (RLS tenant
--       scoped); writes flow solely through the RPC.
--   (c) rpc_trust_safety_unblock_content(ctx_a, ctx_b, content_hash, justification)
--       — consumes BOTH SAFETY_UNBLOCK contexts, requires they co-sign the SAME
--       tenant/site/revision, requires two DISTINCT actors, a non-empty
--       justification, a SAFETY-revoked authorized revision whose content_hash the
--       param binds, a DISTINCT-role assignment across the two actors' eligible
--       sets, and that the content is CURRENTLY blocked. It then appends an
--       UNBLOCK event to release_content_revocation (monotonic per-tenant
--       sequence) and writes the content_unblock_grant audit row. Returns the
--       grant id.
--
-- DENY-ONLY / NO DUAL-WRITE: release_revision stays the sole positive authority.
-- This migration only ever causes a raise, appends an UNBLOCK event, or records a
-- grant row. TENANT+SITE SCOPE is carried on every row and enforced on every
-- check. Reuses stable reason codes only (AUTH_SOD_VIOLATION, AUTH_SCOPE_DENIED,
-- STATE_CONFLICT, AUTH_ACTION_CONTEXT_INVALID) — no new codes.
--
-- Additive over the committed 0180-0187 chain (does not edit them). CREATE OR
-- REPLACE of create_verified_action_context preserves owner + ACL.
-- Phase: NOT_FOR_PRODUCTION (shadow-e0). No production markers/claims.
-- Apply: psql -1 -f supabase/migrations/0188_trust_kernel_content_unblock.sql
-- ===========================================================================

-- Re-runnable during iteration: drop the new objects first, then rebuild.
drop function if exists public.rpc_trust_safety_unblock_content(uuid, uuid, text, text);
drop table if exists public.content_unblock_grant cascade;

-- ---------------------------------------------------------------------------
-- (a) Widen the action domain to admit SAFETY_UNBLOCK (mirror 0181/0186 ALTER
--     style). SAFETY_UNBLOCK binds a RELEASE_REVISION with null candidate/
--     authorization hashes — identical hash-field shape to REVOKE/SAFETY_BLOCK.
-- ---------------------------------------------------------------------------
alter table public.verified_action_context
  drop constraint if exists verified_action_context_action_check;
alter table public.verified_action_context
  add constraint verified_action_context_action_check
  check (action in ('FREEZE','RELEASE','REVOKE','GRANT_WARNING_EXCEPTION','SAFETY_BLOCK','SAFETY_UNBLOCK'));

alter table public.verified_action_context drop constraint if exists vac_action_shape;
alter table public.verified_action_context add constraint vac_action_shape check (
  case action
    when 'FREEZE'  then resource_type = 'WORKING_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'RELEASE' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is not null
    when 'REVOKE'  then resource_type = 'RELEASE_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'GRANT_WARNING_EXCEPTION' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is null
    when 'SAFETY_BLOCK'   then resource_type = 'RELEASE_REVISION' and candidate_hash is null and release_authorization_hash is null
    when 'SAFETY_UNBLOCK' then resource_type = 'RELEASE_REVISION' and candidate_hash is null and release_authorization_hash is null
    else false
  end
);

-- ---------------------------------------------------------------------------
-- (a cont.) create_verified_action_context — CREATE OR REPLACE adding
--   SAFETY_UNBLOCK. Unlike every other action, SAFETY_UNBLOCK does NOT map to a
--   single required role; a dedicated branch requires the caller's roles to
--   INTERSECT the eligible set {RELEASE_APPROVER, QA_EVIDENCE, ADMIN}. All prior
--   FREEZE/RELEASE/REVOKE/SAFETY_BLOCK mappings are preserved verbatim (0186).
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
  --     SAFETY_UNBLOCK joins the allow-list here (plan Task 5), alongside
  --     SAFETY_BLOCK (Task 3).
  if p_action not in ('FREEZE','RELEASE','REVOKE','SAFETY_BLOCK','SAFETY_UNBLOCK') then
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

  -- (5) Role must permit the action (§7.1 #5, §7.3). Fetch the caller's roles once.
  select array_agg(role) into v_roles
  from public.monolith_membership_role
  where tenant_id = p_tenant_id and membership_id = v_membership.id;

  if p_action = 'SAFETY_UNBLOCK' then
    -- SAFETY_UNBLOCK has NO single required role (plan Task 5). The un-block is a
    -- two-person, two-role action; each co-signer's context is minted only if the
    -- caller holds AT LEAST ONE eligible non-SAFETY governance role. SAFETY_REVOKER
    -- alone is NOT eligible — the blocker's role can never itself un-block. The
    -- second co-signer and the DISTINCT-role requirement are enforced in the RPC.
    if v_roles is null or not (v_roles && array['RELEASE_APPROVER','QA_EVIDENCE','ADMIN']) then
      raise exception 'AUTH_SCOPE_DENIED'
        using detail = 'SAFETY_UNBLOCK requires one of RELEASE_APPROVER/QA_EVIDENCE/ADMIN (SAFETY_REVOKER alone is not eligible)';
    end if;
  else
    v_required_role := case p_action
      when 'FREEZE'       then 'DESIGNER'
      when 'RELEASE'      then 'RELEASE_APPROVER'
      when 'REVOKE'       then 'SAFETY_REVOKER'
      when 'SAFETY_BLOCK' then 'SAFETY_REVOKER'
    end;
    if v_roles is null or not (v_required_role = any (v_roles)) then
      raise exception 'AUTH_SCOPE_DENIED'
        using detail = 'membership lacks role ' || v_required_role || ' required for ' || p_action;
    end if;
  end if;

  -- (6) Action shape rules (§7 / plan Task 2/3/5). SAFETY_UNBLOCK mirrors REVOKE /
  --     SAFETY_BLOCK: RELEASE_REVISION, no candidate/authorization hashes.
  v_expected_resource_type := case p_action
    when 'FREEZE'         then 'WORKING_REVISION'
    when 'RELEASE'        then 'RELEASE_CANDIDATE'
    when 'REVOKE'         then 'RELEASE_REVISION'
    when 'SAFETY_BLOCK'   then 'RELEASE_REVISION'
    when 'SAFETY_UNBLOCK' then 'RELEASE_REVISION'
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
  elsif p_action = 'SAFETY_UNBLOCK' then
    if p_candidate_hash is not null or p_release_authorization_hash is not null then
      raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'SAFETY_UNBLOCK requires a release-revision resource with null candidate/authorization hashes';
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

-- Grants preserved by CREATE OR REPLACE; re-assert defensively (mirror 0180/0186).
revoke all on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_verified_action_context(text, uuid, uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (b) content_unblock_grant — tenant+site-scoped audit of a two-person, two-role
--     un-block. It is NOT a positive authority; it records WHO reversed a deny
--     and WHY. The two (user, role) pairs are DISTINCT on both axes and both
--     roles are non-SAFETY governance roles (never SAFETY_REVOKER). Immutable by
--     posture: SELECT-only to authenticated; writes flow solely through the RPC.
-- ---------------------------------------------------------------------------
create table public.content_unblock_grant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  content_hash text not null,
  release_revision_id uuid not null,
  approver_a_user_id uuid not null references auth.users(id),
  approver_a_role text not null,
  approver_b_user_id uuid not null references auth.users(id),
  approver_b_role text not null,
  justification text not null,
  unblock_sequence bigint not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id),
  constraint cug_content_hash_fmt check (public.fn_is_sha256_hex(content_hash)),
  -- Two DISTINCT people (four-eyes on the un-block, stronger than the block).
  constraint cug_distinct_users check (approver_a_user_id <> approver_b_user_id),
  -- Two DISTINCT roles — RBAC separation of duties the user_id-only check cannot express.
  constraint cug_distinct_roles check (approver_a_role <> approver_b_role),
  -- Both roles are eligible non-SAFETY governance roles; SAFETY_REVOKER can never un-block.
  constraint cug_role_a_eligible check (approver_a_role in ('RELEASE_APPROVER','QA_EVIDENCE','ADMIN')),
  constraint cug_role_b_eligible check (approver_b_role in ('RELEASE_APPROVER','QA_EVIDENCE','ADMIN')),
  constraint cug_justification_nonempty check (length(btrim(justification)) > 0),
  constraint cug_unblock_sequence_pos check (unblock_sequence > 0)
);

create index content_unblock_grant_tenant_idx
  on public.content_unblock_grant (tenant_id);
create index content_unblock_grant_lookup_idx
  on public.content_unblock_grant (tenant_id, site_id, content_hash);

-- RLS + grants mirror release_content_revocation (0186): RLS on, membership-scoped
-- SELECT only, SELECT to authenticated, NO write grant/policy. Strip the inherited
-- Supabase default privileges (TRUNCATE/REFERENCES/TRIGGER) so the audit row is
-- tamper-resistant, then re-grant only SELECT.
alter table public.content_unblock_grant enable row level security;

create policy content_unblock_grant_sel on public.content_unblock_grant
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

revoke all on public.content_unblock_grant from public, anon;
revoke all on public.content_unblock_grant from authenticated;
grant select on public.content_unblock_grant to authenticated;

comment on table public.content_unblock_grant is
  'Trust Kernel §10.4 (plan Task 5): tenant+site-scoped audit of a two-person, two-role content un-block. Captures two DISTINCT (user, role) approver pairs (both roles non-SAFETY: RELEASE_APPROVER/QA_EVIDENCE/ADMIN), the justification, the un-blocked content_hash + release_revision, and the UNBLOCK event sequence it produced. Not a positive authority; release_revision remains the sole positive authority. SELECT-only to authenticated; writes flow solely through rpc_trust_safety_unblock_content. Phase NOT_FOR_PRODUCTION.';

-- ---------------------------------------------------------------------------
-- (c) rpc_trust_safety_unblock_content — two-person, two-role reversal of a
--     SAFETY content block. Deny-only: appends an UNBLOCK event + a grant row;
--     writes NO release_revision.
-- ---------------------------------------------------------------------------
create function public.rpc_trust_safety_unblock_content(
  p_context_id_a uuid,
  p_context_id_b uuid,
  p_content_hash text,
  p_justification text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx_a public.verified_action_context%rowtype;
  v_ctx_b public.verified_action_context%rowtype;
  v_authorized_hash text;
  v_revision_id uuid;
  v_ea text[];              -- actor A's eligible roles (sorted, non-SAFETY set)
  v_eb text[];              -- actor B's eligible roles (sorted)
  v_role_a text;
  v_role_b text;
  v_seq bigint;
  v_grant_id uuid;
begin
  -- (1) Consume BOTH FRESH SAFETY_UNBLOCK contexts. Eligible-role membership is
  --     enforced at mint time (create_verified_action_context); consume re-checks
  --     action/expiry/membership-version and one-time use. Passing the SAME context
  --     for both (a one-approver attempt) fails here: the second consume sees the
  --     first's consumed_at and raises AUTH_ACTION_CONTEXT_INVALID.
  v_ctx_a := public.consume_verified_action_context(p_context_id_a, 'SAFETY_UNBLOCK');
  v_ctx_b := public.consume_verified_action_context(p_context_id_b, 'SAFETY_UNBLOCK');

  -- (2) Both approvers must co-sign the SAME revision in the SAME tenant+site.
  if v_ctx_a.tenant_id is distinct from v_ctx_b.tenant_id
     or v_ctx_a.site_id is distinct from v_ctx_b.site_id
     or v_ctx_a.resource_id is distinct from v_ctx_b.resource_id then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID'
      using detail = 'both un-block contexts must co-sign the same tenant/site/revision';
  end if;

  -- (3) Two DISTINCT people (separation of duties on the initiating axis).
  if v_ctx_a.actor_user_id = v_ctx_b.actor_user_id then
    raise exception 'AUTH_SOD_VIOLATION'
      using detail = 'un-block requires two distinct approvers (same user supplied both contexts)';
  end if;

  -- (4) A recorded justification is mandatory (audit obligation).
  if p_justification is null or length(btrim(p_justification)) = 0 then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'un-block justification is required';
  end if;

  -- (5) PROVENANCE + BINDING (design §10.4): load the co-signed revision bound to
  --     the shared tenant+site and require it to be SAFETY-revoked; derive its
  --     content_hash and bind the free p_content_hash parameter to it (mirrors the
  --     block's resource_id binding). Any other state (unknown id, ACTIVE, a
  --     non-SAFETY REVOKED class, or a different tenant/site) is STATE_CONFLICT.
  v_revision_id := v_ctx_a.resource_id::uuid;
  select rr.content_hash into v_authorized_hash
    from public.release_revision rr
    where rr.tenant_id = v_ctx_a.tenant_id
      and rr.site_id   = v_ctx_a.site_id
      and rr.id        = v_revision_id
      and rr.status    = 'REVOKED'
      and rr.revoke_reason_class = 'SAFETY';
  if not found then
    raise exception 'STATE_CONFLICT'
      using detail = 'un-block requires the co-signed release revision to be SAFETY-revoked in this tenant/site';
  end if;
  if p_content_hash is distinct from v_authorized_hash then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID'
      using detail = 'p_content_hash does not match the content_hash of the co-signed release revision';
  end if;

  -- (6) DISTINCT-ROLE assignment. Compute each actor's eligible roles = their
  --     current monolith_membership_role rows INTERSECT the eligible non-SAFETY
  --     set {RELEASE_APPROVER, QA_EVIDENCE, ADMIN}, sorted for determinism. Both
  --     must be non-empty (defense in depth beside the mint-time check), and a pair
  --     (role_a in eligible(a), role_b in eligible(b), role_a <> role_b) must exist.
  --     A distinct pair exists iff both sets are non-empty and their union has >= 2
  --     members. Deterministic pick: take role_a = eligible(a)[1]; role_b = the
  --     first eligible(b) member <> role_a. If none (eligible(b) = {role_a}), keep
  --     that shared role for B and reassign A to the first eligible(a) member that
  --     differs. If still none, both actors share one single eligible role -> no
  --     distinct pair -> AUTH_SOD_VIOLATION.
  select array_agg(role order by role) into v_ea
    from public.monolith_membership_role
    where tenant_id = v_ctx_a.tenant_id and membership_id = v_ctx_a.membership_id
      and role in ('RELEASE_APPROVER','QA_EVIDENCE','ADMIN');
  select array_agg(role order by role) into v_eb
    from public.monolith_membership_role
    where tenant_id = v_ctx_b.tenant_id and membership_id = v_ctx_b.membership_id
      and role in ('RELEASE_APPROVER','QA_EVIDENCE','ADMIN');

  if v_ea is null or array_length(v_ea, 1) = 0 or v_eb is null or array_length(v_eb, 1) = 0 then
    raise exception 'AUTH_SCOPE_DENIED'
      using detail = 'each un-block approver must hold at least one of RELEASE_APPROVER/QA_EVIDENCE/ADMIN';
  end if;

  v_role_a := v_ea[1];
  select r into v_role_b from unnest(v_eb) as r where r <> v_role_a order by r limit 1;
  if v_role_b is null then
    -- eligible(b) = {v_role_a}: keep that shared role for B, reassign A to a differing role.
    v_role_b := v_eb[1];
    select r into v_role_a from unnest(v_ea) as r where r <> v_role_b order by r limit 1;
    if v_role_a is null then
      raise exception 'AUTH_SOD_VIOLATION'
        using detail = 'un-block requires two distinct non-SAFETY governance roles';
    end if;
  end if;

  -- (7) The content must be CURRENTLY blocked — you cannot un-block what is not
  --     blocked (latest-event-wins predicate; the RPC runs SECURITY DEFINER so the
  --     service_role-only fn_content_is_blocked is reachable in the definer context).
  if not public.fn_content_is_blocked(v_ctx_a.tenant_id, v_ctx_a.site_id, v_authorized_hash) then
    raise exception 'STATE_CONFLICT' using detail = 'content is not currently blocked';
  end if;

  -- (8) Advisory-lock + monotonic per-tenant sequence (same discipline and lock key
  --     as the BLOCK at 0186), then append an UNBLOCK event and the grant row.
  perform pg_advisory_xact_lock(hashtext('monolith_content_revocation_sequence:' || v_ctx_a.tenant_id::text));
  select coalesce(max(sequence), 0) + 1 into v_seq
    from public.release_content_revocation where tenant_id = v_ctx_a.tenant_id;

  -- actor_user_id = the initiating approver (actor A). Both approvers are captured
  -- in full on the content_unblock_grant row below.
  insert into public.release_content_revocation
    (tenant_id, site_id, content_hash, release_revision_id, action, sequence, actor_user_id, detail)
  values
    (v_ctx_a.tenant_id, v_ctx_a.site_id, v_authorized_hash, v_revision_id, 'UNBLOCK', v_seq, v_ctx_a.actor_user_id, p_justification);

  v_grant_id := gen_random_uuid();
  insert into public.content_unblock_grant
    (id, tenant_id, site_id, content_hash, release_revision_id,
     approver_a_user_id, approver_a_role, approver_b_user_id, approver_b_role,
     justification, unblock_sequence)
  values
    (v_grant_id, v_ctx_a.tenant_id, v_ctx_a.site_id, v_authorized_hash, v_revision_id,
     v_ctx_a.actor_user_id, v_role_a, v_ctx_b.actor_user_id, v_role_b,
     p_justification, v_seq);

  -- (9) Deny-only: NO write to release_revision or any positive-authority row.
  return v_grant_id;
end;
$$;

-- User-authorized RPC (mirror rpc_trust_safety_block_content grants): the two human
-- SAFETY_UNBLOCK action contexts are the authority; service_role is allowed for
-- tests/orchestration but cannot mint the underlying human action contexts (0180).
revoke all on function public.rpc_trust_safety_unblock_content(uuid, uuid, text, text) from public, anon;
grant execute on function public.rpc_trust_safety_unblock_content(uuid, uuid, text, text) to authenticated, service_role;

comment on function public.rpc_trust_safety_unblock_content(uuid, uuid, text, text) is
  'Trust Kernel §10.4 (plan Task 5): two-person, two-role content UN-BLOCK. Consumes TWO SAFETY_UNBLOCK contexts co-signing the same tenant/site/SAFETY-revoked revision, requires two distinct actors (AUTH_SOD_VIOLATION), a non-empty justification, a p_content_hash bound to the revision, a DISTINCT-role assignment across the actors'' eligible {RELEASE_APPROVER,QA_EVIDENCE,ADMIN} sets (AUTH_SOD_VIOLATION if none), and that the content is CURRENTLY blocked (else STATE_CONFLICT). Appends a monotonic UNBLOCK event to release_content_revocation and writes a content_unblock_grant audit row; returns the grant id. Deny-only: writes no release_revision. Stable errors AUTH_ACTION_CONTEXT_INVALID / AUTH_SOD_VIOLATION / AUTH_SCOPE_DENIED / STATE_CONFLICT.';
