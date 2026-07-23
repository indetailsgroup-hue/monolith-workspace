-- 0181: MONOLITH Production Trust Kernel — machine-profile attestation +
--       warning-exception governance
-- Design 2026-07-22 §§8-9 (component contracts / artifact matrix), §12
-- (capability safety), §13 (error model). Builds on 0180 (tenancy + verified
-- action contexts); numbering follows the lane ledger's 0180-0184 ruling.
--
-- A machine profile acquires authority ONLY through a signed, in-scope, in-window,
-- non-revoked MachineProfileAttestationV1. A catalogue warning may be excepted
-- ONLY through a two-person, expiring, exact-scope WarningExceptionGrantV1 — and
-- ONLY if the catalogue marks that warning exception_eligible. Every CAP_* code
-- (a capability/hard blocker) is FALSE there and can NEVER be excepted (§12).
--
-- The application stores signer KEY IDs only — no private key material lives in
-- any column; `signature` is an opaque managed-signer output. Ed25519 signature
-- verification is performed at the TypeScript boundary through an injected
-- public-key verifier port (server/src/trust-kernel/governance). The DB functions
-- here REPEAT scope/time/status/eligibility checks server-side at release commit,
-- raising the exact stable reason codes from reasonCodes.ts (§13).
--
-- Tenant 001 / Daph is FIXTURE data provisioned by tests and seeds, never a
-- schema constant; tenant 002 coexists with zero source changes.
-- Phase: NOT_FOR_PRODUCTION.

-- ---------------------------------------------------------------------------
-- Widen the 0180 action domain to admit GRANT_WARNING_EXCEPTION
-- ---------------------------------------------------------------------------
-- A warning exception is a two-person authorized action; its issuance rides a
-- VerifiedActionContextV1 like FREEZE/RELEASE/REVOKE. It binds a RELEASE_CANDIDATE
-- with the candidate hash it excepts and carries no release-authorization hash
-- (the grant is an INPUT to a later release authorization, not the authorization).
-- This ALTER touches only 0180's two CHECK constraints; the create RPC's own
-- action allow-list is widened by a later task when grant issuance is wired.
alter table public.verified_action_context
  drop constraint verified_action_context_action_check;
alter table public.verified_action_context
  add constraint verified_action_context_action_check
  check (action in ('FREEZE','RELEASE','REVOKE','GRANT_WARNING_EXCEPTION'));

alter table public.verified_action_context drop constraint vac_action_shape;
alter table public.verified_action_context add constraint vac_action_shape check (
  case action
    when 'FREEZE'  then resource_type = 'WORKING_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'RELEASE' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is not null
    when 'REVOKE'  then resource_type = 'RELEASE_REVISION'  and candidate_hash is null     and release_authorization_hash is null
    when 'GRANT_WARNING_EXCEPTION' then resource_type = 'RELEASE_CANDIDATE' and candidate_hash is not null and release_authorization_hash is null
    else false
  end
);

-- ---------------------------------------------------------------------------
-- Warning catalogue — the single owner of exception_eligible (§12)
-- ---------------------------------------------------------------------------
create table public.warning_catalogue (
  code text primary key,
  description text not null,
  severity text not null default 'WARNING' check (severity in ('WARNING','BLOCKER')),
  exception_eligible boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  -- Hard rule: a capability blocker (CAP_*) can NEVER be exception-eligible.
  -- left(code,4) avoids LIKE wildcard ambiguity and is IMMUTABLE, so it can back a CHECK.
  constraint wc_cap_never_eligible check (not (exception_eligible and left(code,4) = 'CAP_'))
);

insert into public.warning_catalogue (code, description, severity, exception_eligible) values
  ('CAP_UNKNOWN_TOOL',            'Tool id is not bound to the attested machine profile', 'BLOCKER', false),
  ('CAP_UNSUPPORTED_OPERATION',  'Operation type is unsupported by the machine profile', 'BLOCKER', false),
  ('CAP_PROFILE_MISMATCH',       'Postprocessor and profile versions do not match',      'BLOCKER', false),
  ('CAP_PARAMETER_RANGE',        'A parameter is outside its supported range',           'BLOCKER', false),
  ('WARN_DEEP_POCKET_ADVISORY',  'Pocket depth near the advisory envelope; reviewer confirmation required', 'WARNING', true),
  ('WARN_GRAIN_DIRECTION_ADVISORY', 'Grain-direction advisory for visible faces',        'WARNING', true),
  ('WARN_EDGE_BANDING_ADVISORY', 'Edge-banding advisory for thin panels',                'WARNING', true);

-- ---------------------------------------------------------------------------
-- MachineProfileAttestationV1 (§12) — signed boundary; key IDs only
-- ---------------------------------------------------------------------------
create table public.machine_profile_attestation (
  id uuid primary key,
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  machine_id text not null,
  profile_hash text not null,
  tool_library_hash text not null,
  postprocessor_id text not null,
  postprocessor_version text not null,
  postprocessor_binary_hash text not null,
  approver_user_id uuid not null references auth.users(id),
  key_id text not null,
  -- Pinned managed-signer purpose. The authoritative purpose source is the trusted
  -- key registry (trust bundle, later task); this column is a defense-in-depth pin
  -- so a record can never claim to have been signed by a non-attestation key.
  signature_purpose text not null default 'PROFILE_ATTESTATION'
    check (signature_purpose = 'PROFILE_ATTESTATION'),
  signature_alg text not null default 'ed25519' check (signature_alg = 'ed25519'),
  signature text not null,
  issued_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status text not null check (status in ('ACTIVE','REVOKED','SUPERSEDED')),
  attestation_sequence bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  constraint mpa_profile_hash_fmt      check (public.fn_is_sha256_hex(profile_hash)),
  constraint mpa_tool_library_hash_fmt check (public.fn_is_sha256_hex(tool_library_hash)),
  constraint mpa_pp_binary_hash_fmt    check (public.fn_is_sha256_hex(postprocessor_binary_hash)),
  constraint mpa_valid_window          check (valid_until > valid_from),
  constraint mpa_sequence_nonneg       check (attestation_sequence >= 0),
  -- Monotonic attestation sequence per machine within a tenant.
  unique (tenant_id, machine_id, attestation_sequence)
);

create index machine_profile_attestation_tenant_idx on public.machine_profile_attestation (tenant_id);
create index machine_profile_attestation_scope_idx  on public.machine_profile_attestation (tenant_id, site_id, machine_id, status);

-- ---------------------------------------------------------------------------
-- WarningExceptionGrantV1 (§12) — signed boundary; two distinct approvers
-- ---------------------------------------------------------------------------
create table public.warning_exception_grant (
  id uuid primary key,
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  candidate_hash text not null,
  warning_code text not null references public.warning_catalogue(code),
  entity_ids text[] not null,
  reason text not null,
  policy_version text not null,
  approver_user_ids uuid[] not null,
  key_id text not null,
  signature_purpose text not null default 'WARNING_EXCEPTION'
    check (signature_purpose = 'WARNING_EXCEPTION'),
  signature_alg text not null default 'ed25519' check (signature_alg = 'ed25519'),
  signature text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  constraint weg_candidate_hash_fmt check (public.fn_is_sha256_hex(candidate_hash)),
  -- Exactly TWO DISTINCT approver user ids (four-eyes on the exception, §12).
  constraint weg_two_distinct_approvers check (
    array_length(approver_user_ids, 1) = 2
    and approver_user_ids[1] <> approver_user_ids[2]
  ),
  constraint weg_expiry_after_issue check (expires_at > issued_at),
  constraint weg_entity_ids_nonempty check (array_length(entity_ids, 1) >= 1)
);

create index warning_exception_grant_tenant_idx    on public.warning_exception_grant (tenant_id);
create index warning_exception_grant_candidate_idx on public.warning_exception_grant (tenant_id, candidate_hash, status);

-- ---------------------------------------------------------------------------
-- RLS: tenant-scoped SELECT only; catalogue is a global reference table
-- ---------------------------------------------------------------------------
alter table public.machine_profile_attestation enable row level security;
alter table public.warning_exception_grant     enable row level security;
alter table public.warning_catalogue           enable row level security;

create policy machine_profile_attestation_sel on public.machine_profile_attestation
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

create policy warning_exception_grant_sel on public.warning_exception_grant
  for select to authenticated
  using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

-- The catalogue carries no tenant scoping (identical reference data for all
-- tenants), so its SELECT policy is deliberately global rather than membership
-- scoped; it holds no product data.
create policy warning_catalogue_sel on public.warning_catalogue
  for select to authenticated
  using (true);

grant select on
  public.machine_profile_attestation,
  public.warning_exception_grant,
  public.warning_catalogue
  to authenticated;

-- ---------------------------------------------------------------------------
-- assert_profile_attestation_current — server-side scope/time/status recheck (§12)
-- ---------------------------------------------------------------------------
create or replace function public.assert_profile_attestation_current(
  p_tenant_id uuid,
  p_attestation_id uuid,
  p_now timestamptz
) returns public.machine_profile_attestation
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.machine_profile_attestation%rowtype;
begin
  select * into v from public.machine_profile_attestation where id = p_attestation_id;
  if not found then
    raise exception 'CAP_PROFILE_ATTESTATION_INVALID' using detail = 'unknown attestation';
  end if;
  -- Tenant scope: an attestation from another tenant is never valid here (§7.5).
  if v.tenant_id is distinct from p_tenant_id then
    raise exception 'CAP_PROFILE_ATTESTATION_INVALID' using detail = 'attestation is not in the requested tenant scope';
  end if;
  if v.status <> 'ACTIVE' then
    raise exception 'CAP_PROFILE_ATTESTATION_INVALID' using detail = 'attestation is not ACTIVE (status ' || v.status || ')';
  end if;
  if p_now < v.valid_from or p_now >= v.valid_until then
    raise exception 'CAP_PROFILE_ATTESTATION_EXPIRED' using detail = 'attestation is outside its validity window';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- assert_warning_grants_current — server-side scope/time/eligibility recheck (§12)
-- ---------------------------------------------------------------------------
-- Returns the count of grants validated for (tenant, candidate) at p_now, raising
-- the exact stable reason code on the first violation. A CAP_* / non-eligible
-- warning ALWAYS raises GATE_HARD_BLOCKER: hard blockers can never be excepted.
create or replace function public.assert_warning_grants_current(
  p_tenant_id uuid,
  p_candidate_hash text,
  p_grant_ids uuid[],
  p_now timestamptz
) returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.warning_exception_grant%rowtype;
  v_eligible boolean;
  v_id uuid;
  v_count bigint := 0;
begin
  if p_grant_ids is null then
    return 0;
  end if;
  foreach v_id in array p_grant_ids loop
    select * into v from public.warning_exception_grant where id = v_id;
    if not found then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'unknown warning-exception grant';
    end if;
    if v.tenant_id is distinct from p_tenant_id then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'grant is not in the requested tenant scope';
    end if;
    if v.candidate_hash is distinct from p_candidate_hash then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'grant candidate hash does not match';
    end if;
    -- The catalogue owns exception_eligible; a CAP_* / non-eligible code is a hard blocker.
    select exception_eligible into v_eligible from public.warning_catalogue where code = v.warning_code;
    if v_eligible is distinct from true then
      raise exception 'GATE_HARD_BLOCKER' using detail = 'warning ' || v.warning_code || ' is not exception-eligible';
    end if;
    if array_length(v.approver_user_ids, 1) <> 2 or v.approver_user_ids[1] = v.approver_user_ids[2] then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'grant does not carry two distinct approvers';
    end if;
    if v.status <> 'ACTIVE' then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'grant is not ACTIVE (status ' || v.status || ')';
    end if;
    if p_now >= v.expires_at then
      raise exception 'GATE_WARNING_EXCEPTION_EXPIRED' using detail = 'grant has expired';
    end if;
    if p_now < v.issued_at then
      raise exception 'GATE_WARNING_EXCEPTION_MISMATCH' using detail = 'grant is not yet valid';
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execution grants (least privilege)
-- ---------------------------------------------------------------------------
revoke all on function public.assert_profile_attestation_current(uuid, uuid, timestamptz) from public;
grant execute on function public.assert_profile_attestation_current(uuid, uuid, timestamptz) to authenticated, service_role;

revoke all on function public.assert_warning_grants_current(uuid, text, uuid[], timestamptz) from public;
grant execute on function public.assert_warning_grants_current(uuid, text, uuid[], timestamptz) to authenticated, service_role;

comment on function public.assert_profile_attestation_current(uuid, uuid, timestamptz)
  is 'Trust Kernel §12: rechecks a machine-profile attestation''s tenant scope, ACTIVE status, and validity window at release commit. Raises CAP_PROFILE_ATTESTATION_INVALID / CAP_PROFILE_ATTESTATION_EXPIRED.';
comment on function public.assert_warning_grants_current(uuid, text, uuid[], timestamptz)
  is 'Trust Kernel §12: rechecks warning-exception grants for a (tenant, candidate) set at release commit — scope, catalogue eligibility (CAP_* never eligible), two distinct approvers, status, and expiry. Raises GATE_HARD_BLOCKER / GATE_WARNING_EXCEPTION_EXPIRED / GATE_WARNING_EXCEPTION_MISMATCH.';
