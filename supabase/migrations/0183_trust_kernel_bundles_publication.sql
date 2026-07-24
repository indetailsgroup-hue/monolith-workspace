-- 0183: MONOLITH Production Trust Kernel — trust + release-status bundle
--       publication authority (the issuance layer that closes Phase B)
-- Design 2026-07-22 §11.3 (trust & release-status bundles, revocation modes),
-- §7.5 (tenant isolation), §10.4 (revocation), §13 (error model). Builds on 0180
-- (tenancy + verified action contexts), 0181 (profile attestation + warning-
-- exception governance), 0182 (release authority); numbering follows the lane
-- ledger's 0180-0184 ruling (this is 0183, NOT the plan's 0165).
--
-- A signed TrustBundleV1 / ReleaseStatusBundleV1 is a point-in-time snapshot with
-- an INDEPENDENT (bundleType, trustScope) monotonic sequence (§11.3). Postgres
-- allocates the sequence and snapshots all effective entries in one transaction;
-- the Node trust-authority worker (server/src/trust-kernel/trust) canonicalizes
-- the unsigned snapshot, hashes it, signs the DIGEST through the managed signer
-- port, and commits the exact bytes + signature. Sequences are IMMUTABLE: a
-- commit retry with the same canonical hash is idempotent; a different hash at a
-- published sequence is STATE_CONFLICT.
--
-- TRUST-ROOT PINNING (critical soundness property, §11.3): the public key that
-- AUTHENTICATES a TrustBundleV1 is pinned in the verifier POLICY, OUTSIDE the
-- bundle, and can NEVER be introduced or authorized by the bundle it signs.
-- trust_authority_key holds only DOWNSTREAM purposes (RELEASE / PROFILE_ATTESTATION
-- / WARNING_EXCEPTION); a TRUST_BUNDLE key can never be represented in the registry
-- a bundle snapshots, so a bundle can never self-authorize its own trust root.
--
-- The RELEASE_STATUS bundle draws its revoked set from the EXISTING release_revision
-- authority (0182), status='REVOKED' — a read-only projection, never a second
-- source of truth (global "no dual write" constraint). VOID is not a release-
-- revision status (§6.6), so it can never appear in the bundle.
--
-- Every table carries tenant_id, RLS is enabled, SELECT is membership-scoped, and
-- there is NO client write policy and NO write grant — issuance flows through the
-- SECURITY DEFINER RPCs, executable by the service-role trust-authority worker
-- only. The application stores signer KEY IDs only; signatures are opaque managed-
-- signer output. Tenant 001 / Daph is FIXTURE data, never a schema constant;
-- tenant 002 coexists with zero source changes. Phase: NOT_FOR_PRODUCTION.

-- ===========================================================================
-- Tables (tenant-scoped)
-- ===========================================================================

-- Trusted DOWNSTREAM public keys with purpose + validity (§11.3). The CHECK
-- deliberately EXCLUDES 'TRUST_BUNDLE': the trust-bundle signing key is pinned in
-- verifier policy OUTSIDE the bundle and can never be a trusted key here — this is
-- the DB-level statement of the trust-root pinning property.
create table public.trust_authority_key (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  key_id text not null,
  purpose text not null check (purpose in ('RELEASE','PROFILE_ATTESTATION','WARNING_EXCEPTION')),
  algorithm text not null default 'ed25519' check (algorithm = 'ed25519'),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, key_id),
  constraint tak_valid_window check (valid_until > valid_from)
);

-- Key revocations: the explicit mode is the sole source of semantics (§11.3).
create table public.trust_key_revocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  key_id text not null,
  revocation_mode text not null check (revocation_mode in ('ALL_SIGNATURES','SIGNED_AT_OR_AFTER','ISSUANCE_DISABLED')),
  effective_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Profile-attestation revocations: each entry binds id/hash + effectiveAt + reason.
create table public.trust_profile_attestation_revocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  attestation_id text not null,
  attestation_hash text not null,
  effective_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tpar_hash_fmt check (public.fn_is_sha256_hex(attestation_hash))
);

-- Warning-exception-grant revocations: each entry binds id/hash + effectiveAt + reason.
create table public.trust_warning_grant_revocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  grant_id text not null,
  grant_hash text not null,
  effective_at timestamptz not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint twgr_hash_fmt check (public.fn_is_sha256_hex(grant_hash))
);

-- The per-scope bundle sequence + publication record. The UNIQUE
-- (tenant_id, bundle_type, sequence) makes two issuers taking the same sequence
-- impossible (monotonic under concurrency); TRUST and RELEASE_STATUS share the
-- table but have independent sequences because bundle_type is in the key.
create table public.trust_bundle_publication (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.monolith_tenant(id),
  site_id uuid not null,
  bundle_type text not null check (bundle_type in ('TRUST','RELEASE_STATUS')),
  sequence bigint not null,
  policy_version text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  snapshot jsonb not null,
  canonical_hash text,
  signer_key_id text,
  signature_alg text not null default 'ed25519' check (signature_alg = 'ed25519'),
  signature text,
  status text not null default 'PENDING' check (status in ('PENDING','PUBLISHED')),
  created_at timestamptz not null default timezone('utc', now()),
  committed_at timestamptz,
  foreign key (tenant_id, site_id) references public.monolith_site(tenant_id, id),
  unique (tenant_id, bundle_type, sequence),
  constraint tbp_seq_pos check (sequence > 0),
  constraint tbp_expiry_after_issue check (expires_at > issued_at),
  constraint tbp_canonical_hash_fmt check (canonical_hash is null or public.fn_is_sha256_hex(canonical_hash)),
  -- A PENDING publication carries the snapshot but no signature; PUBLISHED binds
  -- the canonical hash, signer key id, opaque signature, and commit time. This
  -- makes an unsigned "published" bundle representationally impossible.
  constraint tbp_published_shape check (
    case status
      when 'PENDING'   then canonical_hash is null     and signature is null     and signer_key_id is null     and committed_at is null
      when 'PUBLISHED' then canonical_hash is not null and signature is not null and signer_key_id is not null and committed_at is not null
      else false
    end
  )
);

create index trust_authority_key_tenant_idx on public.trust_authority_key (tenant_id, status);
create index trust_key_revocation_tenant_idx on public.trust_key_revocation (tenant_id, key_id);
create index trust_profile_attestation_revocation_tenant_idx on public.trust_profile_attestation_revocation (tenant_id, attestation_id);
create index trust_warning_grant_revocation_tenant_idx on public.trust_warning_grant_revocation (tenant_id, grant_id);
create index trust_bundle_publication_scope_idx on public.trust_bundle_publication (tenant_id, bundle_type, status);

-- ===========================================================================
-- RLS: enabled on all five; membership-scoped SELECT only; no client write
-- ===========================================================================
alter table public.trust_authority_key                    enable row level security;
alter table public.trust_key_revocation                   enable row level security;
alter table public.trust_profile_attestation_revocation   enable row level security;
alter table public.trust_warning_grant_revocation         enable row level security;
alter table public.trust_bundle_publication               enable row level security;

create policy trust_authority_key_sel on public.trust_authority_key
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy trust_key_revocation_sel on public.trust_key_revocation
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy trust_profile_attestation_revocation_sel on public.trust_profile_attestation_revocation
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy trust_warning_grant_revocation_sel on public.trust_warning_grant_revocation
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));
create policy trust_bundle_publication_sel on public.trust_bundle_publication
  for select to authenticated using (tenant_id in (select public.fn_monolith_member_tenant_ids()));

grant select on
  public.trust_authority_key,
  public.trust_key_revocation,
  public.trust_profile_attestation_revocation,
  public.trust_warning_grant_revocation,
  public.trust_bundle_publication
  to authenticated;

-- ===========================================================================
-- rpc_trust_bundle_allocate — increment the (tenant,bundleType) sequence and
--   snapshot all effective entries into a PENDING publication (§11.3)
-- ===========================================================================
create or replace function public.rpc_trust_bundle_allocate(
  p_bundle_type text,
  p_tenant_id uuid,
  p_site_id uuid,
  p_policy_version text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
) returns public.trust_bundle_publication
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_snapshot jsonb;
  v_row public.trust_bundle_publication%rowtype;
  v_fmt constant text := 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
begin
  if p_bundle_type not in ('TRUST','RELEASE_STATUS') then
    raise exception 'TRUST_SCOPE_MISMATCH' using detail = 'unsupported bundle type ' || coalesce(p_bundle_type,'<null>');
  end if;
  if p_expires_at <= p_issued_at then
    raise exception 'TRUST_BUNDLE_EXPIRED' using detail = 'expires_at must be after issued_at';
  end if;
  -- The site must belong to the tenant: a bundle scope is tenant + site (§7.5).
  if not exists (select 1 from public.monolith_site where tenant_id = p_tenant_id and id = p_site_id) then
    raise exception 'TRUST_SCOPE_MISMATCH' using detail = 'site is not in the tenant scope';
  end if;

  -- Serialize sequence allocation per (tenant, bundleType). The UNIQUE index is
  -- the true race guard; the advisory lock avoids a lost-update retry storm so two
  -- concurrent issuers can never both take the same sequence.
  perform pg_advisory_xact_lock(hashtext('monolith_bundle_sequence:' || p_tenant_id::text || ':' || p_bundle_type));
  select coalesce(max(sequence), 0) + 1 into v_seq
    from public.trust_bundle_publication
    where tenant_id = p_tenant_id and bundle_type = p_bundle_type;

  if p_bundle_type = 'RELEASE_STATUS' then
    -- Projection of the EXISTING release_revision authority (0182): the revoked
    -- set is exactly the REVOKED revisions for this (tenant, site). ACTIVE is
    -- excluded; VOID is not a release-revision status, so it can never appear.
    v_snapshot := jsonb_build_object(
      'revokedReleaseRevisionIds',
      coalesce((
        select jsonb_agg(id::text order by id::text)
        from public.release_revision
        where tenant_id = p_tenant_id and site_id = p_site_id and status = 'REVOKED'
      ), '[]'::jsonb)
    );
  else
    v_snapshot := jsonb_build_object(
      'trustedKeys', coalesce((
        select jsonb_agg(jsonb_build_object(
          'keyId', key_id, 'purpose', purpose, 'algorithm', algorithm,
          'validFrom', to_char(valid_from at time zone 'UTC', v_fmt),
          'validUntil', to_char(valid_until at time zone 'UTC', v_fmt)
        ) order by key_id)
        from public.trust_authority_key
        where tenant_id = p_tenant_id and status = 'ACTIVE'), '[]'::jsonb),
      'keyRevocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'keyId', key_id, 'revocationMode', revocation_mode,
          'effectiveAt', to_char(effective_at at time zone 'UTC', v_fmt), 'reason', reason
        ) order by key_id, effective_at)
        from public.trust_key_revocation
        where tenant_id = p_tenant_id and effective_at <= p_issued_at), '[]'::jsonb),
      'profileAttestationRevocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', attestation_id, 'hash', attestation_hash,
          'effectiveAt', to_char(effective_at at time zone 'UTC', v_fmt), 'reason', reason
        ) order by attestation_id)
        from public.trust_profile_attestation_revocation
        where tenant_id = p_tenant_id and effective_at <= p_issued_at), '[]'::jsonb),
      'warningExceptionGrantRevocations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', grant_id, 'hash', grant_hash,
          'effectiveAt', to_char(effective_at at time zone 'UTC', v_fmt), 'reason', reason
        ) order by grant_id)
        from public.trust_warning_grant_revocation
        where tenant_id = p_tenant_id and effective_at <= p_issued_at), '[]'::jsonb)
    );
  end if;

  insert into public.trust_bundle_publication (
    id, tenant_id, site_id, bundle_type, sequence, policy_version, issued_at, expires_at, snapshot, status
  ) values (
    gen_random_uuid(), p_tenant_id, p_site_id, p_bundle_type, v_seq, p_policy_version, p_issued_at, p_expires_at, v_snapshot, 'PENDING'
  ) returning * into v_row;
  return v_row;
end;
$$;

-- ===========================================================================
-- rpc_trust_bundle_commit — bind the canonical hash + opaque signature and
--   PUBLISH. Sequences are immutable: same hash is idempotent, different is a
--   conflict (§11.3, §11.2 "an existing release cannot be re-signed").
-- ===========================================================================
create or replace function public.rpc_trust_bundle_commit(
  p_publication_id uuid,
  p_canonical_hash text,
  p_signer_key_id text,
  p_signature text
) returns public.trust_bundle_publication
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trust_bundle_publication%rowtype;
begin
  if not public.fn_is_sha256_hex(p_canonical_hash) then
    raise exception 'PACKET_HASH_MISMATCH' using detail = 'canonical hash must be sha256 hex';
  end if;
  if p_signer_key_id is null or length(btrim(p_signer_key_id)) = 0 then
    raise exception 'CRYPTO_SIGNATURE_INVALID' using detail = 'signer key id is required';
  end if;
  if p_signature is null or length(btrim(p_signature)) = 0 then
    raise exception 'CRYPTO_SIGNATURE_INVALID' using detail = 'signature is required';
  end if;

  select * into v_row from public.trust_bundle_publication where id = p_publication_id for update;
  if not found then
    raise exception 'STATE_CONFLICT' using detail = 'unknown bundle publication';
  end if;

  if v_row.status = 'PUBLISHED' then
    -- Idempotent retry iff the canonical hash matches the persisted one.
    if v_row.canonical_hash is distinct from p_canonical_hash then
      raise exception 'STATE_CONFLICT' using detail = 'a published bundle sequence is immutable';
    end if;
    return v_row;
  end if;

  update public.trust_bundle_publication
     set canonical_hash = p_canonical_hash, signer_key_id = p_signer_key_id, signature = p_signature,
         status = 'PUBLISHED', committed_at = clock_timestamp()
   where id = p_publication_id
   returning * into v_row;
  return v_row;
end;
$$;

-- ===========================================================================
-- Execution grants (least privilege) — issuance is the service-role trust-
-- authority worker's job; an authenticated client can NEVER write a bundle (§7.2).
-- ===========================================================================
revoke all on function public.rpc_trust_bundle_allocate(text, uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_trust_bundle_allocate(text, uuid, uuid, text, timestamptz, timestamptz) to service_role;

revoke all on function public.rpc_trust_bundle_commit(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.rpc_trust_bundle_commit(uuid, text, text, text) to service_role;

comment on table public.trust_authority_key
  is 'Trust Kernel §11.3: trusted DOWNSTREAM public keys (RELEASE / PROFILE_ATTESTATION / WARNING_EXCEPTION) snapshotted into a TrustBundleV1. Deliberately cannot hold a TRUST_BUNDLE key: the trust-bundle signing key is pinned in verifier policy OUTSIDE the bundle (trust-root pinning).';
comment on function public.rpc_trust_bundle_allocate(text, uuid, uuid, text, timestamptz, timestamptz)
  is 'Trust Kernel §11.3: allocates the next per-(tenant,bundleType) monotonic sequence under an advisory lock and snapshots all effective entries (TRUST: trusted keys + key/profile/grant revocations; RELEASE_STATUS: the REVOKED release_revision ids projected from 0182) into a PENDING publication. Stable errors TRUST_SCOPE_MISMATCH / TRUST_BUNDLE_EXPIRED.';
comment on function public.rpc_trust_bundle_commit(uuid, text, text, text)
  is 'Trust Kernel §11.3/§11.2: binds the canonical hash + opaque managed-signer signature and PUBLISHES. Sequences are immutable: an identical canonical hash is an idempotent retry; a different one raises STATE_CONFLICT. Stable errors STATE_CONFLICT / PACKET_HASH_MISMATCH / CRYPTO_SIGNATURE_INVALID.';
