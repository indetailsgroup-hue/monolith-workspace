-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (Task 9)
-- Feature: trust + release-status bundle issuance — the publication authority
--   that closes Phase B (design 2026-07-22 §11.3 trust & release-status bundles,
--   §7.5 tenant isolation, §13 error model). Stable reason codes come from
--   server/src/trust-kernel/reasonCodes.ts (§13); SQL error strings MUST be those
--   exact codes. Migration: 0183_trust_kernel_bundles_publication.sql.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_bundles.sql
--
-- Builds on 0180 (tenancy), 0181 (profile/exception), 0182 (release authority).
-- Asserts:
--   * RLS enabled and NO client write policy on all five new tables      (§7.5)
--   * TRUST-ROOT PINNING at the DB: trust_authority_key can never hold a
--     TRUST_BUNDLE-purpose key, so a bundle can never authorize its own
--     signing key from the registry it snapshots                         (§11.3)
--   * per-(tenant,bundleType) monotonic sequence; TRUST and RELEASE_STATUS
--     have INDEPENDENT sequences                                          (§11.3)
--   * a unique (tenant,bundleType,sequence) constraint makes two issuers
--     taking the same sequence impossible (monotonic under concurrency)   (§11.3)
--   * commit is idempotent; a different canonical hash at a published
--     sequence is STATE_CONFLICT (sequences are immutable)                (§11.3)
--   * a RELEASE_STATUS snapshot is exactly the REVOKED release-revision ids
--     for the scope — ACTIVE excluded, VOID never present (VOID is not a
--     release-revision status), other tenants excluded                    (§11.3)
--   * the revocation registries store mode/effectiveAt/reason and the TRUST
--     snapshot reflects them                                              (§11.3)
--   * allocate/commit are service-role only (no authenticated write)      (§7.2)
--   * tenant 002 coexists with zero source changes                        (§7.5)
-- inside one transaction, then ROLLS BACK. No private key material anywhere —
-- signatures are opaque fixture values; crypto is the TS layer.

\set ON_ERROR_STOP on

-- Fixture identifiers (Daph is tenant-001 FIXTURE data only, never a constant).
\set tenant_001 11111111-1111-1111-1111-111111111111
\set tenant_002 22222222-2222-2222-2222-222222222222
\set site_001   1a111111-1111-1111-1111-1111111111a1
\set site_002   2a222222-2222-2222-2222-2222222222a2
\set u_app      d1111111-1111-1111-1111-1111111111d1

\set att_001    c1111111-1111-1111-1111-11111111c001
\set att_002    c2222222-2222-2222-2222-22222222c001
\set wr_001     f0000000-0000-0000-0000-0000000000a1
\set wr_002     f0000000-0000-0000-0000-0000000000a2
\set cand_001   c0000000-0000-0000-0000-0000000000a1
\set cand_002   c0000000-0000-0000-0000-0000000000a2
\set att_r1     ab000000-0000-0000-0000-0000000000a1
\set att_r2     ab000000-0000-0000-0000-0000000000a2
\set rev_active 40000000-0000-0000-0000-0000000000a1
\set rev_revok  40000000-0000-0000-0000-0000000000a2
\set rev_t2     40000000-0000-0000-0000-0000000000b1

\set any_sub    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
\set h_c1       cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
\set h_c2       dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
\set h_auth     1111111111111111111111111111111111111111111111111111111111111111
\set h_req      2222222222222222222222222222222222222222222222222222222222222222
\set h_content  9999999999999999999999999999999999999999999999999999999999999999
\set h_packet   0000000000000000000000000000000000000000000000000000000000000000

\set issued  2026-07-24T00:00:00Z
\set expires 2026-08-23T00:00:00Z

begin;
create extension if not exists pgtap;
select plan(26);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values (:'u_app');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_001', 'daph', 'Daph (fixture tenant 001)', 'ACTIVE'),
  (:'tenant_002', 'tenant-002', 'Coexistence tenant 002', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, code, display_name, status) values
  (:'site_001', :'tenant_001', 'BKK-HQ-01', 'Daph HQ', 'ACTIVE'),
  (:'site_002', :'tenant_002', 'T2-SITE-01', 'Tenant 002 site', 'ACTIVE');

insert into public.machine_profile_attestation
  (id, tenant_id, site_id, machine_id, profile_hash, tool_library_hash, postprocessor_id,
   postprocessor_version, postprocessor_binary_hash, approver_user_id, key_id, signature,
   issued_at, valid_from, valid_until, status, attestation_sequence)
values
  (:'att_001', :'tenant_001', :'site_001', 'CNC-001', :'any_sub', :'any_sub', 'pp-1000',
   '1.2.3', :'any_sub', :'u_app', 'dev-profile-key', 'sig-att-001',
   :'issued'::timestamptz - interval '1 day', :'issued'::timestamptz - interval '1 day', :'issued'::timestamptz + interval '30 days', 'ACTIVE', 1),
  (:'att_002', :'tenant_002', :'site_002', 'CNC-201', :'any_sub', :'any_sub', 'pp-2000',
   '3.0.0', :'any_sub', :'u_app', 'dev-profile-key-002', 'sig-att-002',
   :'issued'::timestamptz - interval '1 day', :'issued'::timestamptz - interval '1 day', :'issued'::timestamptz + interval '30 days', 'ACTIVE', 1);

insert into public.release_working_revision
  (id, tenant_id, site_id, status, content_refs, creator_user_id, freezer_user_id, frozen_at, candidate_hash, policy_version, profile_version)
values
  (:'wr_001', :'tenant_001', :'site_001', 'FROZEN', array['ref-1'], :'u_app', :'u_app', :'issued'::timestamptz, :'h_c1', 'policy-2026.07', '1.2.3'),
  (:'wr_002', :'tenant_002', :'site_002', 'FROZEN', array['ref-2'], :'u_app', :'u_app', :'issued'::timestamptz, :'h_c2', 'policy-2026.07', '3.0.0');

insert into public.release_candidate
  (id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
   machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at)
values
  (:'cand_001', :'tenant_001', :'site_001', :'wr_001', :'h_c1', :'any_sub', :'any_sub', :'any_sub', :'att_001', :'any_sub', 'policy-2026.07', :'u_app', :'issued'::timestamptz),
  (:'cand_002', :'tenant_002', :'site_002', :'wr_002', :'h_c2', :'any_sub', :'any_sub', :'any_sub', :'att_002', :'any_sub', 'policy-2026.07', :'u_app', :'issued'::timestamptz);

insert into public.release_attempt
  (id, tenant_id, site_id, candidate_id, actor_user_id, candidate_hash, release_authorization_hash,
   idempotency_key, request_hash, status, allocated_revision_id, release_sequence, membership_version, aal, action_context_id, authorized_at)
values
  (:'att_r1', :'tenant_001', :'site_001', :'cand_001', :'u_app', :'h_c1', :'h_auth', 'idem-1', :'h_req', 'PUBLISHED', :'rev_active', 1, 1, 'aal1', gen_random_uuid(), :'issued'::timestamptz),
  (:'att_r2', :'tenant_002', :'site_002', :'cand_002', :'u_app', :'h_c2', :'h_auth', 'idem-2', :'h_req', 'PUBLISHED', :'rev_t2', 1, 1, 'aal1', gen_random_uuid(), :'issued'::timestamptz);

-- release_revision fixtures: one ACTIVE + one REVOKED in tenant 001 (share the
-- candidate; the partial unique index only blocks two ACTIVE per candidate), and
-- one REVOKED in tenant 002 to prove tenant isolation of the revoked set.
insert into public.release_revision
  (id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
   content_hash, expected_packet_hash, release_certificate, attestation_id, attestation_hash,
   approver_user_id, approver_membership_version, approver_aal, status, release_sequence, authorized_at, released_at)
values
  (:'rev_active', :'tenant_001', :'site_001', :'att_r1', :'cand_001', :'h_c1', :'h_auth',
   :'h_content', :'h_packet', '{"cert":"active"}'::jsonb, :'att_001', :'any_sub', :'u_app', 1, 'aal1', 'ACTIVE', 1, :'issued'::timestamptz, :'issued'::timestamptz);

insert into public.release_revision
  (id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
   content_hash, expected_packet_hash, release_certificate, attestation_id, attestation_hash,
   approver_user_id, approver_membership_version, approver_aal, status, release_sequence, authorized_at, released_at,
   revoked_at, revoked_by_user_id, revoke_reason, revoke_reason_class, revoke_sequence)
values
  (:'rev_revok', :'tenant_001', :'site_001', :'att_r1', :'cand_001', :'h_c1', :'h_auth',
   :'h_content', :'h_packet', '{"cert":"revoked"}'::jsonb, :'att_001', :'any_sub', :'u_app', 1, 'aal1', 'REVOKED', 2, :'issued'::timestamptz, :'issued'::timestamptz,
   :'issued'::timestamptz, :'u_app', 'safety recall', 'SAFETY', 1),
  (:'rev_t2', :'tenant_002', :'site_002', :'att_r2', :'cand_002', :'h_c2', :'h_auth',
   :'h_content', :'h_packet', '{"cert":"t2"}'::jsonb, :'att_002', :'any_sub', :'u_app', 1, 'aal1', 'REVOKED', 1, :'issued'::timestamptz, :'issued'::timestamptz,
   :'issued'::timestamptz, :'u_app', 'safety recall', 'SAFETY', 1);

-- Trusted downstream keys + revocation registries for the TRUST snapshot.
insert into public.trust_authority_key (id, tenant_id, key_id, purpose, algorithm, valid_from, valid_until, status) values
  (gen_random_uuid(), :'tenant_001', 'monolith-release-ed25519-0001', 'RELEASE', 'ed25519', :'issued'::timestamptz - interval '30 days', :'issued'::timestamptz + interval '300 days', 'ACTIVE');

insert into public.trust_key_revocation (id, tenant_id, key_id, revocation_mode, effective_at, reason) values
  (gen_random_uuid(), :'tenant_001', 'monolith-release-ed25519-0000', 'SIGNED_AT_OR_AFTER', :'issued'::timestamptz - interval '10 days', 'COMPROMISE');

insert into public.trust_profile_attestation_revocation (id, tenant_id, attestation_id, attestation_hash, effective_at, reason) values
  (gen_random_uuid(), :'tenant_001', 'att-9000', :'any_sub', :'issued'::timestamptz - interval '5 days', 'PROFILE_SUPERSEDED');

insert into public.trust_warning_grant_revocation (id, tenant_id, grant_id, grant_hash, effective_at, reason) values
  (gen_random_uuid(), :'tenant_001', 'grant-9000', :'any_sub', :'issued'::timestamptz - interval '3 days', 'GRANT_WITHDRAWN');

-- ===========================================================================
-- Group A — RLS posture parity on the five new tables (design §7.5)
-- ===========================================================================
select ok((select relrowsecurity from pg_class where relname='trust_authority_key' and relnamespace='public'::regnamespace), 'trust_authority_key RLS enabled');
select ok((select relrowsecurity from pg_class where relname='trust_key_revocation' and relnamespace='public'::regnamespace), 'trust_key_revocation RLS enabled');
select ok((select relrowsecurity from pg_class where relname='trust_profile_attestation_revocation' and relnamespace='public'::regnamespace), 'trust_profile_attestation_revocation RLS enabled');
select ok((select relrowsecurity from pg_class where relname='trust_warning_grant_revocation' and relnamespace='public'::regnamespace), 'trust_warning_grant_revocation RLS enabled');
select ok((select relrowsecurity from pg_class where relname='trust_bundle_publication' and relnamespace='public'::regnamespace), 'trust_bundle_publication RLS enabled');
select is(
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('trust_authority_key','trust_key_revocation','trust_profile_attestation_revocation','trust_warning_grant_revocation','trust_bundle_publication')
     and cmd<>'SELECT'),
  0::bigint, 'no bundle table exposes a client write policy');
select is(
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('trust_authority_key','trust_key_revocation','trust_profile_attestation_revocation','trust_warning_grant_revocation','trust_bundle_publication')
     and coalesce(qual,'') = 'true'),
  0::bigint, 'no bundle table uses a using(true) product-data policy');

-- ===========================================================================
-- Group B — TRUST-ROOT PINNING at the DB: no TRUST_BUNDLE key in the registry
-- ===========================================================================
select throws_ok(
  $$insert into public.trust_authority_key (id, tenant_id, key_id, purpose, algorithm, valid_from, valid_until, status)
    values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, 'monolith-trust-bundle-ed25519-0001', 'TRUST_BUNDLE', 'ed25519', now(), now()+interval '1 day', 'ACTIVE')$$,
  '23514', null, 'the trust-bundle signing key can never be stored as a trusted (downstream) key');
select lives_ok(
  $$insert into public.trust_authority_key (id, tenant_id, key_id, purpose, algorithm, valid_from, valid_until, status)
    values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, 'monolith-profile-ed25519-0001', 'PROFILE_ATTESTATION', 'ed25519', now(), now()+interval '1 day', 'ACTIVE')$$,
  'a downstream-purpose trusted key is accepted');

-- ===========================================================================
-- Group C — per-(tenant,bundleType) monotonic + independent sequences (§11.3)
-- ===========================================================================
select id as t_pub_id, sequence as t_seq1, snapshot as t_snap
  from public.rpc_trust_bundle_allocate('TRUST', :'tenant_001', :'site_001', 'policy-2026.07', :'issued'::timestamptz, :'expires'::timestamptz) \gset
select is(:'t_seq1'::bigint, 1::bigint, 'first TRUST bundle for the scope takes sequence 1');

select sequence as t_seq2
  from public.rpc_trust_bundle_allocate('TRUST', :'tenant_001', :'site_001', 'policy-2026.07', :'issued'::timestamptz, :'expires'::timestamptz) \gset
select is(:'t_seq2'::bigint, 2::bigint, 'the next TRUST bundle takes sequence 2 (monotonic)');

select sequence as rs_seq1, snapshot as rs_snap
  from public.rpc_trust_bundle_allocate('RELEASE_STATUS', :'tenant_001', :'site_001', 'policy-2026.07', :'issued'::timestamptz, :'expires'::timestamptz) \gset
select is(:'rs_seq1'::bigint, 1::bigint, 'RELEASE_STATUS has an INDEPENDENT sequence starting at 1');

-- ===========================================================================
-- Group D — a unique (tenant,bundleType,sequence) blocks a duplicate sequence
--   (two concurrent issuers can never both take the same sequence)     (§11.3)
-- ===========================================================================
select throws_ok(
  $$insert into public.trust_bundle_publication (id, tenant_id, site_id, bundle_type, sequence, policy_version, issued_at, expires_at, snapshot, status)
    values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, 'TRUST', 1, 'policy-2026.07', now(), now()+interval '1 day', '{}'::jsonb, 'PENDING')$$,
  '23505', null, 'a duplicate (tenant,bundleType,sequence) is rejected by the unique index');

-- ===========================================================================
-- Group E — commit is idempotent; a different hash at a sequence is immutable
-- ===========================================================================
select public.rpc_trust_bundle_commit(:'t_pub_id'::uuid, :'h_content', 'monolith-trust-bundle-ed25519-0001', 'opaque-sig-1') as _c1 \gset
select is((select status from public.trust_bundle_publication where id=:'t_pub_id'::uuid), 'PUBLISHED', 'commit publishes the allocated bundle');
select is(
  (select canonical_hash from public.rpc_trust_bundle_commit(:'t_pub_id'::uuid, :'h_content', 'monolith-trust-bundle-ed25519-0001', 'opaque-sig-1')),
  :'h_content', 're-committing the same canonical hash is idempotent');
select throws_ok(
  $$select public.rpc_trust_bundle_commit('$$||:'t_pub_id'||$$'::uuid, '$$||:'h_packet'||$$', 'monolith-trust-bundle-ed25519-0001', 'opaque-sig-2')$$,
  'P0001', 'STATE_CONFLICT', 'a published sequence is immutable: a different canonical hash conflicts');

-- ===========================================================================
-- Group F — RELEASE_STATUS snapshot = REVOKED revisions only (§11.3)
-- ===========================================================================
select ok((:'rs_snap'::jsonb -> 'revokedReleaseRevisionIds') ? :'rev_revok', 'the status snapshot contains the REVOKED revision id');
select ok(not ((:'rs_snap'::jsonb -> 'revokedReleaseRevisionIds') ? :'rev_active'), 'the status snapshot excludes the ACTIVE revision');
select is(jsonb_typeof(:'rs_snap'::jsonb -> 'revokedReleaseRevisionIds'), 'array', 'revokedReleaseRevisionIds is a JSON array');

-- ===========================================================================
-- Group G — tenant isolation of the revoked set (§7.5)
-- ===========================================================================
select ok(not ((:'rs_snap'::jsonb -> 'revokedReleaseRevisionIds') ? :'rev_t2'), 'tenant 001 status snapshot excludes tenant 002 revoked revisions');

-- ===========================================================================
-- Group H — the revocation registries store mode/effectiveAt/reason and the
--   TRUST snapshot reflects them (§11.3)
-- ===========================================================================
select ok(
  exists (select 1 from jsonb_array_elements(:'t_snap'::jsonb -> 'keyRevocations') e
            where e ->> 'revocationMode' = 'SIGNED_AT_OR_AFTER' and e ->> 'reason' = 'COMPROMISE'),
  'the TRUST snapshot carries the key revocation with its explicit mode');
select is(
  (select reason from public.trust_profile_attestation_revocation where tenant_id=:'tenant_001'::uuid and attestation_id='att-9000'),
  'PROFILE_SUPERSEDED', 'a profile-attestation revocation stores id + effectiveAt + reason');
select is(
  (select reason from public.trust_warning_grant_revocation where tenant_id=:'tenant_001'::uuid and grant_id='grant-9000'),
  'GRANT_WITHDRAWN', 'a warning-grant revocation stores id + effectiveAt + reason');

-- ===========================================================================
-- Group I — allocate/commit are service-role only (no authenticated write) (§7.2)
-- ===========================================================================
select ok(
  not has_function_privilege('authenticated', 'public.rpc_trust_bundle_allocate(text,uuid,uuid,text,timestamptz,timestamptz)', 'EXECUTE'),
  'an authenticated user cannot allocate a bundle sequence');
select ok(
  not has_function_privilege('authenticated', 'public.rpc_trust_bundle_commit(uuid,text,text,text)', 'EXECUTE'),
  'an authenticated user cannot commit a bundle publication');

-- ===========================================================================
-- Group J — tenant 002 coexists with an independent sequence (§7.5)
-- ===========================================================================
select sequence as t2_seq
  from public.rpc_trust_bundle_allocate('RELEASE_STATUS', :'tenant_002', :'site_002', 'policy-2026.07', :'issued'::timestamptz, :'expires'::timestamptz) \gset
select is(:'t2_seq'::bigint, 1::bigint, 'tenant 002 RELEASE_STATUS sequence is independent and starts at 1');

select * from finish();
rollback;
