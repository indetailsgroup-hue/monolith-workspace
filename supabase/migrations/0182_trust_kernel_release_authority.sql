-- 0182: MONOLITH Production Trust Kernel — release / artifact / ledger / outbox
--       authority (the release state machine that closes Phase A)
-- Design 2026-07-22 §6 (domain model & lifecycle), §7.4 (four-eyes invariant),
-- §7.5 (tenant isolation), §10 (release transaction choreography), §13 (error
-- model). Builds on 0180 (tenancy + verified action contexts) and 0181
-- (profile attestation + warning-exception governance); numbering follows the
-- lane ledger's 0180-0184 ruling.
--
-- Postgres is the sole release authority (§5.1). A user-scoped action context
-- (0180) authorizes an immutable release record; a service-role worker performs
-- the commit/materialize/void steps AFTER the user authorization — it can never
-- mint human approval, bypass four-eyes, or select an object path from client
-- input (§7.2). Every table carries tenant_id, child tables use composite
-- tenant-bound foreign keys, RLS is enabled everywhere, and there is NO client
-- write policy and NO write grant — every mutation flows through the
-- SECURITY DEFINER RPCs below (§7.5).
--
-- Lifecycle status members are pinned by Task 1's tuples
-- (server/src/trust-kernel/result.ts): attempt PENDING|FAILED|PUBLISHED|VOID,
-- artifact QUARANTINED|MATERIALIZING|AVAILABLE|VOID, revision ACTIVE|REVOKED.
-- VOID is deliberately NOT a release-revision status: the flow ends at
-- attempt/artifact before a revision exists (§6.6).
--
-- The application stores signer KEY IDs only; certificates are opaque managed-
-- signer output. release_artifact stores ONLY an internal object locator shaped
-- tenantId/siteId/releaseRevisionId/contentHash — never a URL or a reusable
-- signed reference (§7.5, §9).
--
-- Stable reason codes (design §13, server/src/trust-kernel/reasonCodes.ts) are
-- the exact error strings raised here. Tenant 001 / Daph is FIXTURE data,
-- never a schema constant; tenant 002 coexists with zero source changes.
-- Phase: NOT_FOR_PRODUCTION.

-- ---------------------------------------------------------------------------
-- begin_release result: attempt id + the id/sequence allocated at begin (§10.2)
-- ---------------------------------------------------------------------------
create type public.release_begin_result as (
  attempt_id uuid,
  release_revision_id uuid,
  release_sequence bigint,
  status text,
  idempotent_replay boolean
);

-- ===========================================================================
-- Tables (tenant-scoped; child tables carry composite tenant-bound FKs)
-- ===========================================================================

-- WorkingRevision (§6.2): DRAFT (editable) or FROZEN (immutable candidate).
create table public.release_working_revision (
  id uuid not null,
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  parent_revision_id uuid,
  status text not null check (status in ('DRAFT','FROZEN')),
  content_refs text[] not null default '{}',
  creator_user_id uuid not null references auth.users(id),
  freezer_user_id uuid references auth.users(id),
  frozen_at timestamptz,
  candidate_hash text,
  policy_version text not null,
  profile_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (tenant_id, id),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, parent_revision_id) references public.release_working_revision(tenant_id, id),
  constraint rwr_candidate_hash_fmt check (candidate_hash is null or public.fn_is_sha256_hex(candidate_hash)),
  -- DRAFT carries no freeze facts; FROZEN carries all three (§6.2).
  constraint rwr_frozen_shape check (
    case status
      when 'DRAFT'  then freezer_user_id is null     and frozen_at is null     and candidate_hash is null
      when 'FROZEN' then freezer_user_id is not null and frozen_at is not null and candidate_hash is not null
      else false
    end
  )
);

-- ReleaseCandidate (§6.3): created at freeze; candidate_hash is unique per tenant.
create table public.release_candidate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  working_revision_id uuid not null,
  candidate_hash text not null,
  release_authorization_hash text,
  snapshot_hash text not null,
  gate_inputs_hash text not null,
  machine_profile_hash text not null,
  attestation_id uuid not null references public.machine_profile_attestation(id),
  attestation_hash text not null,
  policy_version text not null,
  freezer_user_id uuid not null references auth.users(id),
  grant_ids uuid[] not null default '{}',
  sorted_grant_hashes text[] not null default '{}',
  required_artifact_classes text[] not null default array['P2_MANUFACTURING'],
  frozen_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, id),
  unique (tenant_id, candidate_hash),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, working_revision_id) references public.release_working_revision(tenant_id, id),
  constraint rc_candidate_hash_fmt check (public.fn_is_sha256_hex(candidate_hash)),
  constraint rc_release_auth_hash_fmt check (release_authorization_hash is null or public.fn_is_sha256_hex(release_authorization_hash)),
  constraint rc_snapshot_hash_fmt check (public.fn_is_sha256_hex(snapshot_hash)),
  constraint rc_gate_hash_fmt check (public.fn_is_sha256_hex(gate_inputs_hash)),
  constraint rc_profile_hash_fmt check (public.fn_is_sha256_hex(machine_profile_hash))
);

-- ReleaseAttempt (§6.4): idempotency scope (tenant, actor, candidate, key) with
-- a stored request hash. Statuses are Task 1's exact tuple.
create table public.release_attempt (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  candidate_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  candidate_hash text not null,
  release_authorization_hash text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'PENDING' check (status in ('PENDING','FAILED','PUBLISHED','VOID')),
  allocated_revision_id uuid not null,
  release_revision_id uuid,
  release_sequence bigint not null,
  membership_version bigint not null,
  aal text not null,
  action_context_id uuid not null,
  authorized_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, id),
  unique (tenant_id, actor_user_id, candidate_hash, idempotency_key),
  unique (tenant_id, release_sequence),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.release_candidate(tenant_id, id),
  constraint ra_candidate_hash_fmt check (public.fn_is_sha256_hex(candidate_hash)),
  constraint ra_release_auth_hash_fmt check (public.fn_is_sha256_hex(release_authorization_hash)),
  constraint ra_request_hash_fmt check (public.fn_is_sha256_hex(request_hash)),
  constraint ra_sequence_pos check (release_sequence > 0)
);

-- ReleaseRevision (§6.6): immutable ACTIVE or REVOKED release. NO VOID here.
create table public.release_revision (
  id uuid primary key,
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  release_attempt_id uuid not null,
  candidate_id uuid not null,
  candidate_hash text not null,
  release_authorization_hash text not null,
  sorted_grant_hashes text[] not null default '{}',
  content_hash text not null,
  expected_packet_hash text not null,
  release_certificate jsonb not null,
  attestation_id uuid not null,
  attestation_hash text not null,
  approver_user_id uuid not null references auth.users(id),
  approver_membership_version bigint not null,
  approver_aal text not null,
  parent_release_revision_id uuid,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  release_sequence bigint not null,
  authorized_at timestamptz not null,
  released_at timestamptz not null,
  committed_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id),
  revoke_reason text,
  revoke_sequence bigint,
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, id),
  unique (tenant_id, release_sequence),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, release_attempt_id) references public.release_attempt(tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.release_candidate(tenant_id, id),
  foreign key (tenant_id, parent_release_revision_id) references public.release_revision(tenant_id, id),
  constraint rr_content_hash_fmt check (public.fn_is_sha256_hex(content_hash)),
  constraint rr_packet_hash_fmt check (public.fn_is_sha256_hex(expected_packet_hash)),
  constraint rr_candidate_hash_fmt check (public.fn_is_sha256_hex(candidate_hash)),
  constraint rr_revoke_shape check (
    case status
      when 'ACTIVE'  then revoked_at is null     and revoked_by_user_id is null     and revoke_sequence is null
      when 'REVOKED' then revoked_at is not null and revoked_by_user_id is not null and revoke_sequence is not null
      else false
    end
  )
);

-- The release CAS: at most one ACTIVE release per candidate (§10.3).
create unique index release_revision_active_candidate_uq
  on public.release_revision (tenant_id, candidate_hash) where status = 'ACTIVE';

-- Now that release_revision exists, close the attempt -> revision back-reference.
alter table public.release_attempt
  add constraint ra_release_revision_fk
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id);

-- ArtifactRecordV1 (§6.5): stores ONLY an internal locator; never a URL.
create table public.release_artifact (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  release_attempt_id uuid not null,
  release_revision_id uuid,
  artifact_class text not null check (artifact_class in ('P0_PREVIEW','P1_REVIEW','P2_MANUFACTURING','P3_DISTRIBUTION')),
  status text not null default 'QUARANTINED' check (status in ('QUARANTINED','MATERIALIZING','AVAILABLE','VOID')),
  content_hash text,
  expected_packet_hash text,
  object_locator text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, id),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  foreign key (tenant_id, release_attempt_id) references public.release_attempt(tenant_id, id),
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id),
  constraint rart_content_hash_fmt check (content_hash is null or public.fn_is_sha256_hex(content_hash)),
  constraint rart_packet_hash_fmt check (expected_packet_hash is null or public.fn_is_sha256_hex(expected_packet_hash)),
  -- A QUARANTINED artifact has no final bytes; MATERIALIZING/AVAILABLE bind a
  -- revision, content hash, expected packet hash, and locator (§6.5, §10.2).
  constraint rart_status_shape check (
    case status
      when 'QUARANTINED'   then release_revision_id is null and content_hash is null and expected_packet_hash is null and object_locator is null
      when 'MATERIALIZING' then release_revision_id is not null and content_hash is not null and expected_packet_hash is not null and object_locator is not null
      when 'AVAILABLE'     then release_revision_id is not null and content_hash is not null and expected_packet_hash is not null and object_locator is not null
      when 'VOID'          then true
      else false
    end
  ),
  -- The internal locator is EXACTLY tenantId/siteId/releaseRevisionId/contentHash;
  -- this makes a URL (or any other shape, including a reusable signed reference)
  -- representationally impossible (§7.5, §9).
  constraint rart_locator_shape check (
    object_locator is null
    or (release_revision_id is not null and content_hash is not null
        and object_locator = tenant_id::text || '/' || site_id::text || '/' || release_revision_id::text || '/' || content_hash)
  )
);

-- Approval (§7.4): the four-eyes record. The freezer can NEVER be the approver.
create table public.release_approval (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  release_attempt_id uuid not null,
  release_revision_id uuid,
  candidate_hash text not null,
  release_authorization_hash text not null,
  approver_user_id uuid not null references auth.users(id),
  freezer_user_id uuid not null references auth.users(id),
  membership_version bigint not null,
  aal text not null,
  decision_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (tenant_id, release_attempt_id) references public.release_attempt(tenant_id, id),
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id),
  -- Four-eyes at the DB: freezer-approves-own-release is impossible (§7.4).
  constraint rap_four_eyes check (approver_user_id <> freezer_user_id)
);

-- Ledger (append-only) and outbox (post-commit worker queue).
create table public.release_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  release_revision_id uuid not null,
  event_type text not null check (event_type in ('RELEASE_COMMITTED','ARTIFACT_AVAILABLE','RELEASE_REVOKED')),
  sequence bigint not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id)
);

create table public.release_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  release_revision_id uuid not null,
  kind text not null check (kind in ('MATERIALIZE_ARTIFACT','EMIT_STATUS_BUNDLE')),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSED','FAILED')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  foreign key (tenant_id, release_revision_id) references public.release_revision(tenant_id, id)
);

create index release_candidate_tenant_idx on public.release_candidate (tenant_id);
create index release_candidate_hash_idx   on public.release_candidate (tenant_id, candidate_hash);
create index release_attempt_tenant_idx   on public.release_attempt (tenant_id);
create index release_attempt_candidate_idx on public.release_attempt (tenant_id, candidate_hash);
create index release_revision_tenant_idx  on public.release_revision (tenant_id);
create index release_revision_candidate_idx on public.release_revision (tenant_id, candidate_hash, status);
create index release_artifact_attempt_idx on public.release_artifact (tenant_id, release_attempt_id);
create index release_artifact_revision_idx on public.release_artifact (tenant_id, release_revision_id);
create index release_event_revision_idx   on public.release_event (tenant_id, release_revision_id);
create index release_outbox_status_idx    on public.release_outbox (tenant_id, status);

-- ===========================================================================
-- RLS: enabled on all eight; membership-scoped SELECT only; no client write
-- ===========================================================================
alter table public.release_working_revision enable row level security;
alter table public.release_candidate        enable row level security;
alter table public.release_attempt          enable row level security;
alter table public.release_approval         enable row level security;
alter table public.release_revision         enable row level security;
alter table public.release_artifact         enable row level security;
alter table public.release_event            enable row level security;
alter table public.release_outbox           enable row level security;

create policy release_working_revision_sel on public.release_working_revision
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_candidate_sel on public.release_candidate
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_attempt_sel on public.release_attempt
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_approval_sel on public.release_approval
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_revision_sel on public.release_revision
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_artifact_sel on public.release_artifact
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_event_sel on public.release_event
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy release_outbox_sel on public.release_outbox
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

grant select on
  public.release_working_revision,
  public.release_candidate,
  public.release_attempt,
  public.release_approval,
  public.release_revision,
  public.release_artifact,
  public.release_event,
  public.release_outbox
  to authenticated;

-- ===========================================================================
-- rpc_trust_freeze — DRAFT -> FROZEN + candidate creation (§10.1)
-- ===========================================================================
create or replace function public.rpc_trust_freeze(
  p_context_id uuid,
  p_working_revision_id uuid,
  p_candidate_hash text,
  p_snapshot_hash text,
  p_gate_inputs_hash text,
  p_machine_profile_hash text,
  p_attestation_id uuid,
  p_attestation_hash text,
  p_policy_version text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx public.verified_action_context%rowtype;
  v_wr public.release_working_revision%rowtype;
  v_candidate_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  -- Consume a FRESH FREEZE action context (rechecks membership version, one-time).
  v_ctx := public.consume_verified_action_context(p_context_id, 'FREEZE');
  if v_ctx.resource_id is distinct from p_working_revision_id::text then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'context resource does not match the working revision';
  end if;
  if not public.fn_is_sha256_hex(p_candidate_hash) then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'candidate hash must be sha256 hex';
  end if;

  -- CAS DRAFT -> FROZEN under a row lock.
  select * into v_wr from public.release_working_revision
    where tenant_id = v_ctx.tenant_id and id = p_working_revision_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown working revision';
  end if;
  -- Site-authority binding (§7.5, PGA-1): a context authorized for one site can
  -- never act on a resource that belongs to a different site of the same tenant.
  if v_wr.site_id is distinct from v_ctx.site_id then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'working revision belongs to a different site than the authorized context';
  end if;
  if v_wr.status <> 'DRAFT' then
    raise exception 'STATE_CONFLICT' using detail = 'working revision is not DRAFT';
  end if;

  -- The candidate binds an ATTESTED profile; recheck scope/time/status (§12).
  perform public.assert_profile_attestation_current(v_ctx.tenant_id, p_attestation_id, v_now);

  update public.release_working_revision
     set status = 'FROZEN', freezer_user_id = v_ctx.actor_user_id, frozen_at = v_now, candidate_hash = p_candidate_hash
   where tenant_id = v_ctx.tenant_id and id = p_working_revision_id;

  v_candidate_id := gen_random_uuid();
  insert into public.release_candidate (
    id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
    machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at
  ) values (
    v_candidate_id, v_ctx.tenant_id, v_wr.site_id, p_working_revision_id, p_candidate_hash, p_snapshot_hash,
    p_gate_inputs_hash, p_machine_profile_hash, p_attestation_id, p_attestation_hash, p_policy_version,
    v_ctx.actor_user_id, v_now
  );
  return v_candidate_id;
end;
$$;

-- ===========================================================================
-- rpc_trust_begin_release — consume context, SoD, profile/grants, allocate (§10.2)
-- ===========================================================================
create or replace function public.rpc_trust_begin_release(
  p_context_id uuid,
  p_candidate_hash text,
  p_release_authorization_hash text,
  p_idempotency_key text,
  p_request_hash text
) returns public.release_begin_result
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx public.verified_action_context%rowtype;
  v_cand public.release_candidate%rowtype;
  v_existing public.release_attempt%rowtype;
  v_now timestamptz := clock_timestamp();
  v_attempt_id uuid;
  v_revision_id uuid;
  v_sequence bigint;
begin
  -- Consume a FRESH RELEASE action context (rechecks membership version, one-time).
  v_ctx := public.consume_verified_action_context(p_context_id, 'RELEASE');

  -- Bind the request to the authorized context (§7.2 recheck).
  if v_ctx.candidate_hash is distinct from p_candidate_hash
     or v_ctx.release_authorization_hash is distinct from p_release_authorization_hash
     or v_ctx.request_hash is distinct from p_request_hash then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'request does not match the authorized context';
  end if;

  -- Lock the candidate; serializes concurrent begins on the same candidate.
  select * into v_cand from public.release_candidate
    where tenant_id = v_ctx.tenant_id and candidate_hash = p_candidate_hash for update;
  if not found then
    raise exception 'STATE_CANDIDATE_STALE' using detail = 'unknown release candidate';
  end if;

  -- Site-authority binding (§7.5, PGA-1): the candidate must belong to the site
  -- the action context was authorized for.
  if v_cand.site_id is distinct from v_ctx.site_id then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'candidate belongs to a different site than the authorized context';
  end if;

  -- Four-eyes: the freeze actor can NEVER approve their own release (§7.4).
  if v_cand.freezer_user_id = v_ctx.actor_user_id then
    raise exception 'AUTH_SOD_VIOLATION' using detail = 'freeze actor cannot be the release approver';
  end if;

  -- Profile attestation + warning-exception grants must be current (§12).
  perform public.assert_profile_attestation_current(v_ctx.tenant_id, v_cand.attestation_id, v_now);
  perform public.assert_warning_grants_current(v_ctx.tenant_id, p_candidate_hash, v_cand.grant_ids, v_now);

  -- Candidate CAS pre-check: a candidate with an ACTIVE release is settled (§10.3).
  if exists (select 1 from public.release_revision
               where tenant_id = v_ctx.tenant_id and candidate_hash = p_candidate_hash and status = 'ACTIVE') then
    raise exception 'STATE_CONFLICT' using detail = 'candidate already has an ACTIVE release';
  end if;

  -- Idempotency: (tenant, actor, candidate, key) with a stored request hash (§6.4).
  select * into v_existing from public.release_attempt
    where tenant_id = v_ctx.tenant_id and actor_user_id = v_ctx.actor_user_id
      and candidate_hash = p_candidate_hash and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash is distinct from p_request_hash then
      raise exception 'STATE_IDEMPOTENCY_MISMATCH' using detail = 'idempotency key reused with a different request';
    end if;
    return row(v_existing.id, v_existing.allocated_revision_id, v_existing.release_sequence, v_existing.status, true)::public.release_begin_result;
  end if;

  -- Fresh attempt: allocate attempt id, revision id, monotonic sequence, authority time.
  perform pg_advisory_xact_lock(hashtext('monolith_release_sequence:' || v_ctx.tenant_id::text));
  select coalesce(max(release_sequence), 0) + 1 into v_sequence
    from public.release_attempt where tenant_id = v_ctx.tenant_id;
  v_attempt_id := gen_random_uuid();
  v_revision_id := gen_random_uuid();

  insert into public.release_attempt (
    id, tenant_id, site_id, candidate_id, actor_user_id, candidate_hash, release_authorization_hash,
    idempotency_key, request_hash, status, allocated_revision_id, release_sequence, membership_version,
    aal, action_context_id, authorized_at
  ) values (
    v_attempt_id, v_ctx.tenant_id, v_cand.site_id, v_cand.id, v_ctx.actor_user_id, p_candidate_hash,
    p_release_authorization_hash, p_idempotency_key, p_request_hash, 'PENDING', v_revision_id, v_sequence,
    v_ctx.membership_version, v_ctx.aal, v_ctx.id, v_now
  );

  -- Quarantine the artifact record (unsigned payload; no final bytes yet, §6.5).
  insert into public.release_artifact (
    id, tenant_id, site_id, release_attempt_id, artifact_class, status
  ) values (
    gen_random_uuid(), v_ctx.tenant_id, v_cand.site_id, v_attempt_id, 'P2_MANUFACTURING', 'QUARANTINED'
  );

  return row(v_attempt_id, v_revision_id, v_sequence, 'PENDING'::text, false)::public.release_begin_result;
end;
$$;

-- ===========================================================================
-- rpc_trust_commit_release — worker-role only; ACTIVE revision + MATERIALIZING
--   artifact + approval + event + outbox, atomically (§10.2). Failed commit
--   creates NO revision.
-- ===========================================================================
create or replace function public.rpc_trust_commit_release(
  p_attempt_id uuid,
  p_content_hash text,
  p_expected_packet_hash text,
  p_certificate jsonb,
  p_signer_key_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.release_attempt%rowtype;
  v_cand public.release_candidate%rowtype;
  v_membership public.monolith_membership%rowtype;
  v_now timestamptz := clock_timestamp();
  v_locator text;
begin
  if not public.fn_is_sha256_hex(p_content_hash) or not public.fn_is_sha256_hex(p_expected_packet_hash) then
    raise exception 'PACKET_HASH_MISMATCH' using detail = 'content and packet hashes must be sha256 hex';
  end if;

  -- Lock the attempt.
  select * into v_att from public.release_attempt where id = p_attempt_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release attempt';
  end if;
  if v_att.status <> 'PENDING' then
    raise exception 'STATE_CONFLICT' using detail = 'attempt is not PENDING';
  end if;
  if exists (select 1 from public.release_revision where id = v_att.allocated_revision_id) then
    raise exception 'STATE_CONFLICT' using detail = 'attempt already has a release revision';
  end if;

  -- Membership must still be ACTIVE at the version pinned at begin (§10.3).
  select * into v_membership from public.monolith_membership
    where tenant_id = v_att.tenant_id and user_id = v_att.actor_user_id;
  if not found or v_membership.status <> 'ACTIVE' then
    raise exception 'AUTH_MEMBERSHIP_REVOKED' using detail = 'approver membership is no longer active';
  end if;
  if v_membership.version <> v_att.membership_version then
    raise exception 'STATE_CONFLICT' using detail = 'approver membership version changed since begin';
  end if;

  select * into v_cand from public.release_candidate
    where tenant_id = v_att.tenant_id and id = v_att.candidate_id for update;

  -- Candidate CAS: at most one ACTIVE release per candidate (belt; the partial
  -- unique index below is the true race guard).
  if exists (select 1 from public.release_revision
               where tenant_id = v_att.tenant_id and candidate_hash = v_att.candidate_hash and status = 'ACTIVE') then
    raise exception 'STATE_CONFLICT' using detail = 'candidate already has an ACTIVE release';
  end if;

  v_locator := v_att.tenant_id::text || '/' || v_att.site_id::text || '/' || v_att.allocated_revision_id::text || '/' || p_content_hash;

  begin
    insert into public.release_revision (
      id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
      sorted_grant_hashes, content_hash, expected_packet_hash, release_certificate, attestation_id,
      attestation_hash, approver_user_id, approver_membership_version, approver_aal, status,
      release_sequence, authorized_at, released_at, committed_at
    ) values (
      v_att.allocated_revision_id, v_att.tenant_id, v_att.site_id, v_att.id, v_att.candidate_id, v_att.candidate_hash,
      v_att.release_authorization_hash, v_cand.sorted_grant_hashes, p_content_hash, p_expected_packet_hash, p_certificate,
      v_cand.attestation_id, v_cand.attestation_hash, v_att.actor_user_id, v_att.membership_version, v_att.aal, 'ACTIVE',
      v_att.release_sequence, v_att.authorized_at, v_att.authorized_at, v_now
    );
  exception when unique_violation then
    -- Lost the release CAS for this candidate (concurrent winner committed first).
    raise exception 'STATE_CONFLICT' using detail = 'lost the release CAS for this candidate';
  end;

  update public.release_artifact
     set status = 'MATERIALIZING', release_revision_id = v_att.allocated_revision_id, content_hash = p_content_hash,
         expected_packet_hash = p_expected_packet_hash, object_locator = v_locator, updated_at = v_now
   where tenant_id = v_att.tenant_id and release_attempt_id = v_att.id and status = 'QUARANTINED';

  -- Four-eyes approval record (§7.4). The CHECK forbids freezer == approver.
  insert into public.release_approval (
    tenant_id, release_attempt_id, release_revision_id, candidate_hash, release_authorization_hash,
    approver_user_id, freezer_user_id, membership_version, aal, decision_at, reason
  ) values (
    v_att.tenant_id, v_att.id, v_att.allocated_revision_id, v_att.candidate_hash, v_att.release_authorization_hash,
    v_att.actor_user_id, v_cand.freezer_user_id, v_att.membership_version, v_att.aal, v_now, 'approved'
  );

  insert into public.release_event (tenant_id, release_revision_id, event_type, sequence, payload)
    values (v_att.tenant_id, v_att.allocated_revision_id, 'RELEASE_COMMITTED', v_att.release_sequence,
            jsonb_build_object('signerKeyId', p_signer_key_id, 'contentHash', p_content_hash));

  insert into public.release_outbox (tenant_id, release_revision_id, kind, payload)
    values (v_att.tenant_id, v_att.allocated_revision_id, 'MATERIALIZE_ARTIFACT',
            jsonb_build_object('expectedPacketHash', p_expected_packet_hash));

  update public.release_attempt set release_revision_id = v_att.allocated_revision_id, updated_at = v_now where id = v_att.id;

  return v_att.allocated_revision_id;
end;
$$;

-- ===========================================================================
-- rpc_trust_mark_artifact_available — append-only MATERIALIZING -> AVAILABLE
--   with hash verification; publishes the attempt (§10.2 step 9)
-- ===========================================================================
create or replace function public.rpc_trust_mark_artifact_available(
  p_artifact_id uuid,
  p_content_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_art public.release_artifact%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_art from public.release_artifact where id = p_artifact_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown artifact';
  end if;
  if v_art.status = 'VOID' then
    raise exception 'STATE_CONFLICT' using detail = 'artifact is VOID';
  end if;
  -- Verify the exact materialized bytes before publishing (§10.2, §11.1).
  if v_art.content_hash is distinct from p_content_hash then
    raise exception 'STORE_HASH_MISMATCH' using detail = 'materialized content hash does not match the expected hash';
  end if;
  -- Append-only CAS MATERIALIZING -> AVAILABLE; the second caller loses (§10.3).
  update public.release_artifact set status = 'AVAILABLE', updated_at = v_now
    where id = p_artifact_id and status = 'MATERIALIZING';
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'artifact is not MATERIALIZING (availability is append-only)';
  end if;
  update public.release_attempt set status = 'PUBLISHED', updated_at = v_now
    where id = v_art.release_attempt_id and status = 'PENDING';
  insert into public.release_event (tenant_id, release_revision_id, event_type, sequence, payload)
    values (v_art.tenant_id, v_art.release_revision_id, 'ARTIFACT_AVAILABLE',
            (select release_sequence from public.release_revision where id = v_art.release_revision_id),
            jsonb_build_object('artifactId', p_artifact_id::text));
  return p_artifact_id;
end;
$$;

-- ===========================================================================
-- rpc_trust_void_artifact — cancel an attempt (and its artifact) before a
--   release revision exists (§10.3). VOID is legal only for attempt/artifact.
-- ===========================================================================
create or replace function public.rpc_trust_void_artifact(
  p_attempt_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.release_attempt%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_att from public.release_attempt where id = p_attempt_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release attempt';
  end if;
  -- A committed attempt (a release revision exists) can never be voided (§10.3).
  if exists (select 1 from public.release_revision where id = v_att.allocated_revision_id) then
    raise exception 'STATE_CONFLICT' using detail = 'an attempt with a release revision cannot be voided';
  end if;
  if v_att.status <> 'PENDING' then
    raise exception 'STATE_CONFLICT' using detail = 'attempt is not PENDING';
  end if;
  update public.release_artifact set status = 'VOID', updated_at = v_now
    where tenant_id = v_att.tenant_id and release_attempt_id = v_att.id and status <> 'VOID';
  update public.release_attempt set status = 'VOID', updated_at = v_now where id = v_att.id;
  return v_att.id;
end;
$$;

-- ===========================================================================
-- rpc_trust_revoke — append-only ACTIVE -> REVOKED; emits a status bundle (§10.4)
-- ===========================================================================
create or replace function public.rpc_trust_revoke(
  p_context_id uuid,
  p_release_revision_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx public.verified_action_context%rowtype;
  v_now timestamptz := clock_timestamp();
  v_seq bigint;
  v_rev_site uuid;
begin
  -- Consume a FRESH REVOKE action context (role SAFETY_REVOKER, §7.3).
  v_ctx := public.consume_verified_action_context(p_context_id, 'REVOKE');
  if v_ctx.resource_id is distinct from p_release_revision_id::text then
    raise exception 'AUTH_ACTION_CONTEXT_INVALID' using detail = 'context resource does not match the release revision';
  end if;

  select site_id into v_rev_site from public.release_revision
    where tenant_id = v_ctx.tenant_id and id = p_release_revision_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release revision';
  end if;
  -- Site-authority binding (§7.5, PGA-1): the revision must belong to the site
  -- the REVOKE context was authorized for.
  if v_rev_site is distinct from v_ctx.site_id then
    raise exception 'AUTH_SCOPE_DENIED' using detail = 'release revision belongs to a different site than the authorized context';
  end if;

  perform pg_advisory_xact_lock(hashtext('monolith_release_sequence:' || v_ctx.tenant_id::text));
  select coalesce(max(revoke_sequence), 0) + 1 into v_seq from public.release_revision where tenant_id = v_ctx.tenant_id;

  -- Append-only CAS ACTIVE -> REVOKED; a second revoke loses (§10.4).
  update public.release_revision
     set status = 'REVOKED', revoked_at = v_now, revoked_by_user_id = v_ctx.actor_user_id,
         revoke_reason = p_reason, revoke_sequence = v_seq
   where tenant_id = v_ctx.tenant_id and id = p_release_revision_id and status = 'ACTIVE';
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'release revision is not ACTIVE (revocation is append-only)';
  end if;

  insert into public.release_event (tenant_id, release_revision_id, event_type, sequence, payload)
    values (v_ctx.tenant_id, p_release_revision_id, 'RELEASE_REVOKED', v_seq, jsonb_build_object('reason', p_reason));
  insert into public.release_outbox (tenant_id, release_revision_id, kind, payload)
    values (v_ctx.tenant_id, p_release_revision_id, 'EMIT_STATUS_BUNDLE', jsonb_build_object('revokeSequence', v_seq));
  return p_release_revision_id;
end;
$$;

-- ===========================================================================
-- assert_release_consumable — an ACTIVE revision is consumable only with an
--   AVAILABLE artifact; a REVOKED revision is never consumable (§10.2, §10.4)
-- ===========================================================================
create or replace function public.assert_release_consumable(
  p_tenant_id uuid,
  p_release_revision_id uuid
) returns public.release_revision
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rev public.release_revision%rowtype;
  v_art_status text;
begin
  select * into v_rev from public.release_revision where tenant_id = p_tenant_id and id = p_release_revision_id;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown release revision';
  end if;
  if v_rev.status = 'REVOKED' then
    raise exception 'STATE_RELEASE_REVOKED' using detail = 'release revision is revoked';
  end if;
  select status into v_art_status from public.release_artifact
    where tenant_id = p_tenant_id and release_revision_id = p_release_revision_id
    order by (status = 'AVAILABLE') desc
    limit 1;
  if v_art_status is distinct from 'AVAILABLE' then
    raise exception 'STORE_ARTIFACT_UNAVAILABLE' using detail = 'release artifact is not AVAILABLE';
  end if;
  return v_rev;
end;
$$;

-- ===========================================================================
-- Execution grants (least privilege)
-- ===========================================================================
-- User-authorized RPCs: an authenticated user token drives freeze/begin/revoke
-- (their action context is the authority). service_role is allowed for tests
-- and orchestration but cannot mint the underlying human action context (0180).
revoke all on function public.rpc_trust_freeze(uuid, uuid, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.rpc_trust_freeze(uuid, uuid, text, text, text, text, uuid, text, text) to authenticated, service_role;

revoke all on function public.rpc_trust_begin_release(uuid, text, text, text, text) from public, anon;
grant execute on function public.rpc_trust_begin_release(uuid, text, text, text, text) to authenticated, service_role;

revoke all on function public.rpc_trust_revoke(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_trust_revoke(uuid, uuid, text) to authenticated, service_role;

-- Worker-only RPCs: the post-commit worker (service_role) performs commit,
-- availability, and void. An authenticated user can NEVER execute these (§7.2).
revoke all on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text) to service_role;

revoke all on function public.rpc_trust_mark_artifact_available(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_trust_mark_artifact_available(uuid, text) to service_role;

revoke all on function public.rpc_trust_void_artifact(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_trust_void_artifact(uuid, text) to service_role;

revoke all on function public.assert_release_consumable(uuid, uuid) from public;
grant execute on function public.assert_release_consumable(uuid, uuid) to authenticated, service_role;

comment on function public.rpc_trust_freeze(uuid, uuid, text, text, text, text, uuid, text, text)
  is 'Trust Kernel §10.1: consumes a FREEZE action context and CAS-flips a DRAFT working revision to FROZEN, recording the freezer and creating the immutable release candidate. Stable errors STATE_CONFLICT / AUTH_ACTION_CONTEXT_INVALID / CAP_PROFILE_ATTESTATION_*.';
comment on function public.rpc_trust_begin_release(uuid, text, text, text, text)
  is 'Trust Kernel §10.2: consumes a fresh RELEASE action context, rechecks four-eyes (AUTH_SOD_VIOLATION), membership, profile attestation and warning grants, locks the candidate, and idempotently allocates a PENDING attempt with its release id/sequence/authority time. Stable errors AUTH_SOD_VIOLATION / STATE_IDEMPOTENCY_MISMATCH / STATE_CONFLICT / STATE_CANDIDATE_STALE.';
comment on function public.rpc_trust_commit_release(uuid, text, text, jsonb, text)
  is 'Trust Kernel §10.2: worker-role only. Locks the attempt, rechecks membership version and the candidate CAS, and records the release certificate, an ACTIVE release revision, a MATERIALIZING artifact, the four-eyes approval, and the ledger event + outbox atomically. A failed commit creates no release revision. Stable errors STATE_CONFLICT / AUTH_MEMBERSHIP_REVOKED.';
comment on function public.rpc_trust_mark_artifact_available(uuid, text)
  is 'Trust Kernel §10.2: worker-role only. Append-only MATERIALIZING -> AVAILABLE after verifying the exact materialized bytes; publishes the attempt. Stable errors STATE_CONFLICT / STORE_HASH_MISMATCH.';
comment on function public.rpc_trust_void_artifact(uuid, text)
  is 'Trust Kernel §10.3: worker-role only. Voids a PENDING attempt and its quarantined artifact before any release revision exists. An attempt with a release revision can never be voided. Stable error STATE_CONFLICT.';
comment on function public.rpc_trust_revoke(uuid, uuid, text)
  is 'Trust Kernel §10.4: consumes a REVOKE action context and append-only CAS-flips an ACTIVE release revision to REVOKED, emitting a status-bundle outbox row. Stable errors STATE_CONFLICT / AUTH_ACTION_CONTEXT_INVALID.';
comment on function public.assert_release_consumable(uuid, uuid)
  is 'Trust Kernel §10.2/§10.4: a committed ACTIVE release revision is consumable only when its artifact is AVAILABLE; a REVOKED revision is never consumable. Stable errors STATE_RELEASE_REVOKED / STORE_ARTIFACT_UNAVAILABLE / STATE_CONFLICT.';
