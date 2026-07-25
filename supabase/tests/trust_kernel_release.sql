-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (Task 4)
-- Feature: release / artifact / ledger / outbox authority — the release state
--   machine that closes Phase A (design 2026-07-22 §6 domain model & lifecycle,
--   §7.4 four-eyes invariant, §10 release transaction choreography, §13 error
--   model). Stable reason codes come from server/src/trust-kernel/reasonCodes.ts
--   (§13); SQL error strings MUST be those exact codes.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_release.sql
--
-- The suite provisions TWO tenants (001 = Daph-like FIXTURE, 002 = coexistence
-- proof) with sites, auth users, memberships/roles/site grants, and machine-
-- profile attestations, exercises user-JWT action contexts (0180) through the
-- release RPCs, and asserts:
--   * the plan's three RED assertions
--       - freezer cannot approve own release  -> AUTH_SOD_VIOLATION      (§7.4)
--       - same idempotency request            -> SAME attempt id          (§6.4)
--       - same key, changed request           -> STATE_IDEMPOTENCY_MISMATCH
--   * freeze -> begin -> commit -> mark-available happy path              (§10.2)
--   * a MATERIALIZING artifact is not yet consumable; AVAILABLE is        (§10.2)
--   * VOID is legal only for attempt/artifact, never a release revision   (§6.6)
--   * an internal locator is tenantId/siteId/releaseRevisionId/contentHash
--     and never a URL                                                     (§7.5)
--   * failed commit creates NO release revision                          (§10.3)
--   * one CAS winner per candidate; the loser gets STATE_CONFLICT         (§10.3)
--   * VOID choreography (attempt/artifact) and post-revision void denial  (§10.3)
--   * revoke is append-only ACTIVE->REVOKED; a revoked revision is not
--     consumable; a second revoke loses the CAS                           (§10.4)
--   * commit/mark-available are worker-role only (no authenticated grant) (§7.2)
--   * tenant 002 coexists with zero source changes                        (§7.5)
-- inside one transaction, then ROLLS BACK. No private key material anywhere —
-- certificates/signatures are opaque fixture values; crypto is the TS layer.

\set ON_ERROR_STOP on

-- Fixture identifiers (Daph is tenant-001 FIXTURE data only, never a schema constant).
\set tenant_001   11111111-1111-1111-1111-111111111111
\set tenant_002   22222222-2222-2222-2222-222222222222
\set site_001     1a111111-1111-1111-1111-1111111111a1
\set site_002     2a222222-2222-2222-2222-2222222222a2

-- Organization scope (0189): one 'default' organization per tenant, plus an
-- org-X (and its site) inside tenant 001 that NO membership is granted — the
-- same-tenant cross-organization RLS denial fixture.
\set org_001      0a111111-1111-1111-1111-11111111110a
\set org_002      0b222222-2222-2222-2222-22222222220b
\set org_x        0c111111-1111-1111-1111-11111111110c
\set site_x1      1c111111-1111-1111-1111-1111111111c1

\set u_designer   d1111111-1111-1111-1111-1111111111d1
\set u_dual       da222222-2222-2222-2222-2222222222da
\set u_approver_1 a1111111-1111-1111-1111-1111111111a1
\set u_approver_2 a2222222-2222-2222-2222-2222222222a2
\set u_approver_3 a3333333-3333-3333-3333-3333333333a3
\set u_revoker    b1111111-1111-1111-1111-1111111111b1
\set u_designer_2 d2222222-2222-2222-2222-2222222222d2

\set m_designer   e1111111-1111-1111-1111-1111111111d1
\set m_dual       ea222222-2222-2222-2222-2222222222da
\set m_approver_1 e1111111-1111-1111-1111-1111111111a1
\set m_approver_2 e2222222-2222-2222-2222-2222222222a2
\set m_approver_3 e3333333-3333-3333-3333-3333333333a3
\set m_revoker    eb111111-1111-1111-1111-1111111111b1
\set m_designer_2 e2222222-2222-2222-2222-2222222222d2

\set att_001      c1111111-1111-1111-1111-11111111c001
\set att_002      c2222222-2222-2222-2222-22222222c001

\set wr_sod       f0000000-0000-0000-0000-0000000000a1
\set wr_cas       f0000000-0000-0000-0000-0000000000a2
\set wr_fail      f0000000-0000-0000-0000-0000000000a3
\set wr_void      f0000000-0000-0000-0000-0000000000a4

-- 64-char lowercase-hex fixtures. Candidate hashes are pairwise distinct
-- (release_candidate is unique on (tenant_id, candidate_hash)); sub-hashes,
-- authorization hashes, and request hashes need only be valid sha256 hex.
\set any_sub      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
\set h_sod        bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
\set h_cas        cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
\set h_fail       dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
\set h_void       eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
\set auth_sod     1111111111111111111111111111111111111111111111111111111111111111
\set auth_cas     3333333333333333333333333333333333333333333333333333333333333333
\set auth_fail    5555555555555555555555555555555555555555555555555555555555555555
\set auth_void    7777777777777777777777777777777777777777777777777777777777777777
\set req_sod      2222222222222222222222222222222222222222222222222222222222222222
\set req_cas      4444444444444444444444444444444444444444444444444444444444444444
\set req_fail     6666666666666666666666666666666666666666666666666666666666666666
\set req_void     8888888888888888888888888888888888888888888888888888888888888888
\set req_mismatch ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
\set content_e    9999999999999999999999999999999999999999999999999999999999999999
\set packet_e     0000000000000000000000000000000000000000000000000000000000000000

-- FIX PGA-1 (site-authority binding) + VOID-window fixtures (Groups K, L below).
-- A SECOND site inside tenant 001 and site-B resources; the crossing actors keep
-- their membership_site grant limited to site A only (they are never granted B).
\set site_001b    1b111111-1111-1111-1111-1111111111b1
\set wr_freeze_b  f0000000-0000-0000-0000-0000000000b1
\set cand_begin_b c0000000-0000-0000-0000-0000000000b2
\set cand_revoke_b c0000000-0000-0000-0000-0000000000b3
\set att_revoke_b ab000000-0000-0000-0000-0000000000b3
\set rev_revoke_b 4b000000-0000-0000-0000-0000000000b3
\set wr_vw        f0000000-0000-0000-0000-0000000000c1
\set h_freeze_b   b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1
\set h_begin_b    b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2
\set h_revoke_b   b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3
\set h_vw         c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1

begin;
create extension if not exists pgtap;
select plan(59);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  (:'u_designer'), (:'u_dual'), (:'u_approver_1'), (:'u_approver_2'),
  (:'u_approver_3'), (:'u_revoker'), (:'u_designer_2');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_001', 'daph', 'Daph (fixture tenant 001)', 'ACTIVE'),
  (:'tenant_002', 'tenant-002', 'Coexistence tenant 002', 'ACTIVE');

insert into public.monolith_organization (id, tenant_id, slug, display_name, legal_name, status) values
  (:'org_001', :'tenant_001', 'default', 'Daph default organization', 'Daph default organization', 'ACTIVE'),
  (:'org_002', :'tenant_002', 'default', 'Tenant 002 default organization', 'Tenant 002 default organization', 'ACTIVE'),
  (:'org_x',   :'tenant_001', 'org-x',   'Daph org X (no grants)', 'Daph org X (no grants)', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, organization_id, code, display_name, status) values
  (:'site_001', :'tenant_001', :'org_001', 'BKK-HQ-01', 'Daph HQ', 'ACTIVE'),
  (:'site_002', :'tenant_002', :'org_002', 'T2-SITE-01', 'Tenant 002 site', 'ACTIVE'),
  (:'site_x1',  :'tenant_001', :'org_x',   'BKK-X-01',  'Daph org-X site (no grants)', 'ACTIVE');

insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_designer',   :'tenant_001', :'u_designer',   1, 'ACTIVE'),
  (:'m_dual',       :'tenant_001', :'u_dual',       1, 'ACTIVE'),
  (:'m_approver_1', :'tenant_001', :'u_approver_1', 1, 'ACTIVE'),
  (:'m_approver_2', :'tenant_001', :'u_approver_2', 1, 'ACTIVE'),
  (:'m_approver_3', :'tenant_001', :'u_approver_3', 1, 'ACTIVE'),
  (:'m_revoker',    :'tenant_001', :'u_revoker',    1, 'ACTIVE'),
  (:'m_designer_2', :'tenant_002', :'u_designer_2', 1, 'ACTIVE');

insert into public.monolith_membership_role (tenant_id, membership_id, role) values
  (:'tenant_001', :'m_designer',   'DESIGNER'),
  (:'tenant_001', :'m_dual',       'DESIGNER'),
  (:'tenant_001', :'m_dual',       'RELEASE_APPROVER'),
  (:'tenant_001', :'m_approver_1', 'RELEASE_APPROVER'),
  (:'tenant_001', :'m_approver_2', 'RELEASE_APPROVER'),
  (:'tenant_001', :'m_approver_3', 'RELEASE_APPROVER'),
  (:'tenant_001', :'m_revoker',    'SAFETY_REVOKER'),
  (:'tenant_002', :'m_designer_2', 'DESIGNER');

insert into public.monolith_membership_site (tenant_id, membership_id, site_id) values
  (:'tenant_001', :'m_designer',   :'site_001'),
  (:'tenant_001', :'m_dual',       :'site_001'),
  (:'tenant_001', :'m_approver_1', :'site_001'),
  (:'tenant_001', :'m_approver_2', :'site_001'),
  (:'tenant_001', :'m_approver_3', :'site_001'),
  (:'tenant_001', :'m_revoker',    :'site_001'),
  (:'tenant_002', :'m_designer_2', :'site_002');

-- Organization grants (0189): every site grant carries the matching grant for
-- the site's organization. NOTHING is granted for org_x / site_x1.
insert into public.monolith_membership_organization (tenant_id, membership_id, organization_id)
select distinct ms.tenant_id, ms.membership_id, s.organization_id
from public.monolith_membership_site ms
join public.monolith_site s on s.tenant_id = ms.tenant_id and s.id = ms.site_id
on conflict do nothing;

-- Attested machine profiles: a current one for each tenant.
insert into public.machine_profile_attestation
  (id, tenant_id, site_id, machine_id, profile_hash, tool_library_hash, postprocessor_id,
   postprocessor_version, postprocessor_binary_hash, approver_user_id, key_id, signature,
   issued_at, valid_from, valid_until, status, attestation_sequence)
values
  (:'att_001', :'tenant_001', :'site_001', 'CNC-001', :'any_sub', :'any_sub', 'pp-nc-1000',
   '1.2.3', :'any_sub', :'u_designer', 'dev-profile-key', 'sig-att-001',
   clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1),
  (:'att_002', :'tenant_002', :'site_002', 'CNC-201', :'any_sub', :'any_sub', 'pp-nc-2000',
   '3.0.0', :'any_sub', :'u_designer_2', 'dev-profile-key-002', 'sig-att-002',
   clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1);

-- DRAFT working revisions to be frozen through the RPC.
insert into public.release_working_revision
  (id, tenant_id, site_id, parent_revision_id, status, content_refs, creator_user_id, policy_version, profile_version)
values
  (:'wr_sod',  :'tenant_001', :'site_001', null, 'DRAFT', array['ref-1'], :'u_dual',     'policy-2026-07', '1.2.3'),
  (:'wr_cas',  :'tenant_001', :'site_001', null, 'DRAFT', array['ref-2'], :'u_designer', 'policy-2026-07', '1.2.3'),
  (:'wr_fail', :'tenant_001', :'site_001', null, 'DRAFT', array['ref-3'], :'u_designer', 'policy-2026-07', '1.2.3'),
  (:'wr_void', :'tenant_001', :'site_001', null, 'DRAFT', array['ref-4'], :'u_designer', 'policy-2026-07', '1.2.3');

-- ===========================================================================
-- Group A — RLS posture parity on the eight new tables (design §7.5)
-- ===========================================================================
select ok((select relrowsecurity from pg_class where relname='release_working_revision' and relnamespace='public'::regnamespace), 'release_working_revision RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_candidate'        and relnamespace='public'::regnamespace), 'release_candidate RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_attempt'          and relnamespace='public'::regnamespace), 'release_attempt RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_approval'         and relnamespace='public'::regnamespace), 'release_approval RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_revision'         and relnamespace='public'::regnamespace), 'release_revision RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_artifact'         and relnamespace='public'::regnamespace), 'release_artifact RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_event'            and relnamespace='public'::regnamespace), 'release_event RLS enabled');
select ok((select relrowsecurity from pg_class where relname='release_outbox'           and relnamespace='public'::regnamespace), 'release_outbox RLS enabled');
select is(
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('release_working_revision','release_candidate','release_attempt','release_approval',
                       'release_revision','release_artifact','release_event','release_outbox')
     and cmd<>'SELECT'),
  0::bigint, 'no release table exposes a client write policy');
select is(
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('release_working_revision','release_candidate','release_attempt','release_approval',
                       'release_revision','release_artifact','release_event','release_outbox')
     and coalesce(qual,'') = 'true'),
  0::bigint, 'no release table uses a using(true) product-data policy');

-- ===========================================================================
-- Group C — freeze: DRAFT -> FROZEN + candidate creation (design §10.1)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_dual','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_sod', :'req_sod') as freeze_ctx_sod \gset
select public.rpc_trust_freeze(:'freeze_ctx_sod'::uuid, :'wr_sod'::uuid, :'h_sod', :'any_sub', :'any_sub', :'any_sub', :'att_001'::uuid, :'any_sub', 'policy-2026-07') as cand_sod \gset

select is((select status from public.release_working_revision where id=:'wr_sod'::uuid), 'FROZEN', 'freeze flips DRAFT -> FROZEN');
select is((select freezer_user_id from public.release_working_revision where id=:'wr_sod'::uuid), :'u_dual'::uuid, 'freeze records the freezer identity');
select is((select count(*) from public.release_candidate where tenant_id=:'tenant_001'::uuid and candidate_hash=:'h_sod'), 1::bigint, 'freeze creates exactly one release candidate');

-- freezing an already-FROZEN revision loses the CAS.
select set_config('request.jwt.claims', json_build_object('sub', :'u_dual','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_sod', :'req_sod') as refreeze_ctx \gset
select throws_ok(
  $$select public.rpc_trust_freeze('$$||:'refreeze_ctx'||$$'::uuid, '$$||:'wr_sod'||$$'::uuid, '$$||:'h_sod'||$$', '$$||:'any_sub'||$$', '$$||:'any_sub'||$$', '$$||:'any_sub'||$$', '$$||:'att_001'||$$'::uuid, '$$||:'any_sub'||$$', 'policy-2026-07')$$,
  'P0001', 'STATE_CONFLICT', 're-freezing a FROZEN revision loses the CAS');

-- ===========================================================================
-- Group D — the plan's three RED assertions (design §7.4, §6.4)
-- ===========================================================================
-- SoD: u_dual froze wr_sod; a RELEASE context minted by u_dual cannot approve it.
select set_config('request.jwt.claims', json_build_object('sub', :'u_dual','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-SOD', :'req_sod', :'h_sod', :'auth_sod') as sod_freezer_ctx \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-SOD', :'req_sod', :'h_sod', :'auth_sod') as approver_ctx1 \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-SOD', :'req_sod', :'h_sod', :'auth_sod') as approver_ctx2 \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-SOD', :'req_mismatch', :'h_sod', :'auth_sod') as approver_ctx3 \gset

select throws_ok(
  $$select public.rpc_trust_begin_release('$$||:'sod_freezer_ctx'||$$'::uuid, '$$||:'h_sod'||$$', '$$||:'auth_sod'||$$', 'idem-1', '$$||:'req_sod'||$$')$$,
  'P0001', 'AUTH_SOD_VIOLATION', 'freezer cannot approve own release');

-- First begin creates attempt A.
select attempt_id as attempt_a, release_revision_id as rev_a
  from public.rpc_trust_begin_release(:'approver_ctx1'::uuid, :'h_sod', :'auth_sod', 'idem-1', :'req_sod') \gset

-- Same key + same request (fresh context) returns the SAME attempt.
select is(
  (select attempt_id from public.rpc_trust_begin_release(:'approver_ctx2'::uuid, :'h_sod', :'auth_sod', 'idem-1', :'req_sod')),
  :'attempt_a'::uuid, 'same idempotency request returns same attempt');

-- Same key + changed request rejects.
select throws_ok(
  $$select public.rpc_trust_begin_release('$$||:'approver_ctx3'||$$'::uuid, '$$||:'h_sod'||$$', '$$||:'auth_sod'||$$', 'idem-1', '$$||:'req_mismatch'||$$')$$,
  'P0001', 'STATE_IDEMPOTENCY_MISMATCH', 'same key with changed request rejects');

-- ===========================================================================
-- Group E — happy path commit / availability / consumability (design §10.2)
-- ===========================================================================
select id as artifact_a from public.release_artifact where release_attempt_id=:'attempt_a'::uuid \gset
select is((select status from public.release_artifact where id=:'artifact_a'::uuid), 'QUARANTINED', 'begin_release quarantines the artifact');

-- Worker commits (service-role RPC). pgTAP runs as owner, so grants do not block.
select public.rpc_trust_commit_release(:'attempt_a'::uuid, :'content_e', :'packet_e', '{"cert":"sod"}'::jsonb, 'dev-release-key') as rev_committed \gset
select is(:'rev_committed'::uuid, :'rev_a'::uuid, 'commit uses the revision id allocated at begin');
select is((select status from public.release_revision where id=:'rev_a'::uuid), 'ACTIVE', 'commit records an ACTIVE release revision');
select is((select status from public.release_artifact where id=:'artifact_a'::uuid), 'MATERIALIZING', 'commit moves the artifact to MATERIALIZING');
select is((select count(*) from public.release_event where release_revision_id=:'rev_a'::uuid and event_type='RELEASE_COMMITTED'), 1::bigint, 'commit appends a ledger event');
select is((select count(*) from public.release_outbox where release_revision_id=:'rev_a'::uuid), 1::bigint, 'commit appends an outbox row');

-- An ACTIVE revision is not consumable while its artifact is only MATERIALIZING.
select throws_ok(
  $$select public.assert_release_consumable('$$||:'tenant_001'||$$'::uuid, '$$||:'rev_a'||$$'::uuid)$$,
  'P0001', 'STORE_ARTIFACT_UNAVAILABLE', 'a committed ACTIVE revision needs an AVAILABLE artifact to be consumable');

-- VOID is not a legal release-revision status (design §6.6).
select throws_ok(
  $$update public.release_revision set status='VOID' where id='$$||:'rev_a'||$$'::uuid$$,
  '23514', null, 'VOID is rejected for a release revision');

-- The internal locator is tenantId/siteId/releaseRevisionId/contentHash — never a URL.
select ok(
  (select position('://' in object_locator) = 0
     and object_locator = :'tenant_001'||'/'||:'site_001'||'/'||:'rev_a'||'/'||:'content_e'
     from public.release_artifact where id=:'artifact_a'::uuid),
  'artifact locator is the internal tenant/site/revision/content path');
select throws_ok(
  $$update public.release_artifact set object_locator='https://cdn.example/'||'$$||:'content_e'||$$' where id='$$||:'artifact_a'||$$'::uuid$$,
  '23514', null, 'a URL-shaped object locator is rejected');

-- Materialize the exact bytes -> AVAILABLE, attempt -> PUBLISHED.
select public.rpc_trust_mark_artifact_available(:'artifact_a'::uuid, :'content_e') as _ma \gset
select is((select status from public.release_artifact where id=:'artifact_a'::uuid), 'AVAILABLE', 'mark_artifact_available reaches AVAILABLE');
select is((select status from public.release_attempt where id=:'attempt_a'::uuid), 'PUBLISHED', 'availability publishes the attempt');
select lives_ok(
  $$select public.assert_release_consumable('$$||:'tenant_001'||$$'::uuid, '$$||:'rev_a'||$$'::uuid)$$,
  'an ACTIVE revision with an AVAILABLE artifact is consumable');
-- Availability is an append-only CAS: the second caller loses.
select throws_ok(
  $$select public.rpc_trust_mark_artifact_available('$$||:'artifact_a'||$$'::uuid, '$$||:'content_e'||$$')$$,
  'P0001', 'STATE_CONFLICT', 'availability is append-only; the second transition loses the CAS');

-- ===========================================================================
-- Group F — failed commit creates NO release revision (design §10.3)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_fail', :'req_fail') as freeze_ctx_fail \gset
select public.rpc_trust_freeze(:'freeze_ctx_fail'::uuid, :'wr_fail'::uuid, :'h_fail', :'any_sub', :'any_sub', :'any_sub', :'att_001'::uuid, :'any_sub', 'policy-2026-07') as cand_fail \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_3','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-FAIL', :'req_fail', :'h_fail', :'auth_fail') as approver_ctx_fail \gset
select attempt_id as attempt_f from public.rpc_trust_begin_release(:'approver_ctx_fail'::uuid, :'h_fail', :'auth_fail', 'idem-fail', :'req_fail') \gset

-- Membership changes after begin invalidate the approval at commit.
update public.monolith_membership set status='REVOKED', version=version+1 where tenant_id=:'tenant_001'::uuid and id=:'m_approver_3'::uuid;
select throws_ok(
  $$select public.rpc_trust_commit_release('$$||:'attempt_f'||$$'::uuid, '$$||:'content_e'||$$', '$$||:'packet_e'||$$', '{}'::jsonb, 'dev-release-key')$$,
  'P0001', 'AUTH_MEMBERSHIP_REVOKED', 'a revoked membership blocks commit');
select is((select count(*) from public.release_revision where release_attempt_id=:'attempt_f'::uuid), 0::bigint, 'a failed commit creates no release revision');

-- ===========================================================================
-- Group G — one CAS winner per candidate; the loser gets STATE_CONFLICT (§10.3)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_cas', :'req_cas') as freeze_ctx_cas \gset
select public.rpc_trust_freeze(:'freeze_ctx_cas'::uuid, :'wr_cas'::uuid, :'h_cas', :'any_sub', :'any_sub', :'any_sub', :'att_001'::uuid, :'any_sub', 'policy-2026-07') as cand_cas \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-CAS', :'req_cas', :'h_cas', :'auth_cas') as cas_ctx_1 \gset
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_2','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-CAS', :'req_cas', :'h_cas', :'auth_cas') as cas_ctx_2 \gset

select attempt_id as attempt_x from public.rpc_trust_begin_release(:'cas_ctx_1'::uuid, :'h_cas', :'auth_cas', 'idem-x', :'req_cas') \gset
select attempt_id as attempt_y from public.rpc_trust_begin_release(:'cas_ctx_2'::uuid, :'h_cas', :'auth_cas', 'idem-y', :'req_cas') \gset

select lives_ok(
  $$select public.rpc_trust_commit_release('$$||:'attempt_x'||$$'::uuid, '$$||:'content_e'||$$', '$$||:'packet_e'||$$', '{}'::jsonb, 'dev-release-key')$$,
  'the first commit for a candidate wins the CAS');
select throws_ok(
  $$select public.rpc_trust_commit_release('$$||:'attempt_y'||$$'::uuid, '$$||:'content_e'||$$', '$$||:'packet_e'||$$', '{}'::jsonb, 'dev-release-key')$$,
  'P0001', 'STATE_CONFLICT', 'the second commit for the same candidate loses the CAS');
select is(
  (select count(*) from public.release_revision where tenant_id=:'tenant_001'::uuid and candidate_hash=:'h_cas' and status='ACTIVE'),
  1::bigint, 'exactly one ACTIVE revision exists for the contended candidate');

-- ===========================================================================
-- Group I — VOID choreography for attempt/artifact (design §10.3, §6.4/§6.5)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_void', :'req_void') as freeze_ctx_void \gset
select public.rpc_trust_freeze(:'freeze_ctx_void'::uuid, :'wr_void'::uuid, :'h_void', :'any_sub', :'any_sub', :'any_sub', :'att_001'::uuid, :'any_sub', 'policy-2026-07') as cand_void \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-VOID', :'req_void', :'h_void', :'auth_void') as void_ctx \gset
select attempt_id as attempt_v from public.rpc_trust_begin_release(:'void_ctx'::uuid, :'h_void', :'auth_void', 'idem-v', :'req_void') \gset
select id as artifact_v from public.release_artifact where release_attempt_id=:'attempt_v'::uuid \gset

select lives_ok(
  $$select public.rpc_trust_void_artifact('$$||:'attempt_v'||$$'::uuid, 'cancelled before release')$$,
  'void_artifact cancels an attempt that never committed');
select is((select status from public.release_attempt where id=:'attempt_v'::uuid), 'VOID', 'the cancelled attempt is VOID');
select is((select status from public.release_artifact where id=:'artifact_v'::uuid), 'VOID', 'the quarantined artifact is VOID');
select is((select count(*) from public.release_revision where release_attempt_id=:'attempt_v'::uuid), 0::bigint, 'a voided attempt has no release revision');
-- A committed attempt (with an ACTIVE revision) can never be voided.
select throws_ok(
  $$select public.rpc_trust_void_artifact('$$||:'attempt_a'||$$'::uuid, 'too late')$$,
  'P0001', 'STATE_CONFLICT', 'an attempt with a release revision cannot be voided');

-- ===========================================================================
-- Group J — revoke is append-only ACTIVE -> REVOKED (design §10.4)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_revoker','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('REVOKE', :'tenant_001', :'site_001', 'RELEASE_REVISION', :'rev_a', :'req_sod') as revoke_ctx \gset
select public.create_verified_action_context('REVOKE', :'tenant_001', :'site_001', 'RELEASE_REVISION', :'rev_a', :'req_sod') as revoke_ctx_2 \gset
select public.create_verified_action_context('REVOKE', :'tenant_001', :'site_001', 'RELEASE_REVISION', :'rev_a', :'req_sod') as revoke_ctx_bogus \gset

-- Task 2: the reason class is a REQUIRED classification of the revocation
-- (design 2026-07-22 §10.4; plan 2026-07-24). An unrecognized class is a
-- malformed revoke request and is rejected before rev_a leaves ACTIVE.
select throws_ok(
  $$select public.rpc_trust_revoke('$$||:'revoke_ctx_bogus'||$$'::uuid, '$$||:'rev_a'||$$'::uuid, 'bad class', 'BOGUS')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'revoke rejects an unknown reason class');

select lives_ok(
  $$select public.rpc_trust_revoke('$$||:'revoke_ctx'||$$'::uuid, '$$||:'rev_a'||$$'::uuid, 'safety recall', 'SAFETY')$$,
  'a safety revoker revokes an ACTIVE release with a valid reason class');
select is((select status from public.release_revision where id=:'rev_a'::uuid), 'REVOKED', 'the release revision is REVOKED');
select is((select revoke_reason_class from public.release_revision where id=:'rev_a'::uuid), 'SAFETY', 'revoke stores the reason class on the REVOKED row');
select is(
  (select payload->>'reasonClass' from public.release_event
     where release_revision_id=:'rev_a'::uuid and event_type='RELEASE_REVOKED'),
  'SAFETY', 'the RELEASE_REVOKED event payload carries the reason class');
select throws_ok(
  $$select public.assert_release_consumable('$$||:'tenant_001'||$$'::uuid, '$$||:'rev_a'||$$'::uuid)$$,
  'P0001', 'STATE_RELEASE_REVOKED', 'a revoked release revision is not consumable');
select throws_ok(
  $$select public.rpc_trust_revoke('$$||:'revoke_ctx_2'||$$'::uuid, '$$||:'rev_a'||$$'::uuid, 'again', 'OPERATIONAL')$$,
  'P0001', 'STATE_CONFLICT', 'revocation is append-only; a second revoke loses the CAS');

-- ===========================================================================
-- Group W — commit / mark-available are worker-role only (design §7.2)
-- ===========================================================================
select ok(
  not has_function_privilege('authenticated', 'public.rpc_trust_commit_release(uuid,text,text,jsonb,text)', 'EXECUTE'),
  'authenticated cannot execute rpc_trust_commit_release');
select ok(
  has_function_privilege('service_role', 'public.rpc_trust_commit_release(uuid,text,text,jsonb,text)', 'EXECUTE'),
  'the worker (service_role) can execute rpc_trust_commit_release');

-- ===========================================================================
-- Group H — coexistence (design §7.5)
-- ===========================================================================
select is(
  (select count(*) from public.machine_profile_attestation where tenant_id=:'tenant_002'::uuid),
  1::bigint, 'tenant 002 attestation coexists without source changes');
select is(
  (select count(*) from public.release_revision where tenant_id=:'tenant_002'::uuid),
  0::bigint, 'tenant 002 holds no tenant-001 release rows');

-- ===========================================================================
-- Group K — FIX: void is denied the INSTANT a release revision exists, even
--   while the attempt is still PENDING (the commit -> mark-available window).
--   This pins 0182 void's revision-exists guard INDEPENDENTLY of the later
--   status<>'PENDING' check: here the attempt IS still PENDING, so ONLY the
--   revision-exists guard can raise STATE_CONFLICT (design §10.3, §6.6). The
--   existing PUBLISHED-attempt void test (Group I) cannot distinguish the two
--   guards; this one survives a mutation that deletes the revision-exists check.
-- ===========================================================================
insert into public.release_working_revision
  (id, tenant_id, site_id, parent_revision_id, status, content_refs, creator_user_id, policy_version, profile_version)
values
  (:'wr_vw', :'tenant_001', :'site_001', null, 'DRAFT', array['ref-vw'], :'u_designer', 'policy-2026-07', '1.2.3');

select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_vw', :'req_void') as freeze_ctx_vw \gset
select public.rpc_trust_freeze(:'freeze_ctx_vw'::uuid, :'wr_vw'::uuid, :'h_vw', :'any_sub', :'any_sub', :'any_sub', :'att_001'::uuid, :'any_sub', 'policy-2026-07') as cand_vw \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_2','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-VW', :'req_void', :'h_vw', :'auth_void') as release_ctx_vw \gset
select attempt_id as attempt_vw from public.rpc_trust_begin_release(:'release_ctx_vw'::uuid, :'h_vw', :'auth_void', 'idem-vw', :'req_void') \gset
select id as artifact_vw from public.release_artifact where release_attempt_id=:'attempt_vw'::uuid \gset

-- Commit (pgTAP runs as owner, standing in for the worker) but DO NOT mark the
-- artifact available: this is the window where a revision exists yet the attempt
-- has not been published.
select public.rpc_trust_commit_release(:'attempt_vw'::uuid, :'content_e', :'packet_e', '{"cert":"vw"}'::jsonb, 'dev-release-key') as rev_vw \gset

select is((select status from public.release_attempt where id=:'attempt_vw'::uuid), 'PENDING', 'commit leaves the attempt PENDING until the artifact is marked available');
select is((select status from public.release_artifact where id=:'artifact_vw'::uuid), 'MATERIALIZING', 'commit leaves the artifact MATERIALIZING before mark-available');
select throws_ok(
  $$select public.rpc_trust_void_artifact('$$||:'attempt_vw'||$$'::uuid, 'too late: a release revision already exists')$$,
  'P0001', 'STATE_CONFLICT', 'voiding an attempt whose release revision already exists is denied even while the attempt is still PENDING');

-- ===========================================================================
-- Group L — FIX PGA-1: site-authority binding. An action context authorized for
--   site A must NOT drive freeze/begin/revoke against a resource that belongs to
--   a DIFFERENT site (B) of the SAME tenant (design §7.5). create_verified_action_context
--   (0180) happily mints a site-A context here because it never learns the
--   resource's true site; the release RPCs are the binding guard. The actors keep
--   a membership_site grant limited to site A only, so this proves the RPC-level
--   site binding, not the context-creation site grant.
-- ===========================================================================
insert into public.monolith_site (id, tenant_id, organization_id, code, display_name, status) values
  (:'site_001b', :'tenant_001', :'org_001', 'BKK-HQ-02', 'Daph second site (B)', 'ACTIVE');

-- site-B DRAFT working revision (freeze crossing) + FK anchor for the site-B rows.
insert into public.release_working_revision
  (id, tenant_id, site_id, parent_revision_id, status, content_refs, creator_user_id, policy_version, profile_version)
values
  (:'wr_freeze_b', :'tenant_001', :'site_001b', null, 'DRAFT', array['ref-b1'], :'u_designer', 'policy-2026-07', '1.2.3');

-- site-B candidate for the begin crossing (no ACTIVE revision references its hash).
insert into public.release_candidate
  (id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
   machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at)
values
  (:'cand_begin_b', :'tenant_001', :'site_001b', :'wr_freeze_b', :'h_begin_b', :'any_sub', :'any_sub',
   :'any_sub', :'att_001', :'any_sub', 'policy-2026-07', :'u_designer', clock_timestamp());

-- site-B candidate + attempt + ACTIVE revision for the revoke crossing.
insert into public.release_candidate
  (id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
   machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at)
values
  (:'cand_revoke_b', :'tenant_001', :'site_001b', :'wr_freeze_b', :'h_revoke_b', :'any_sub', :'any_sub',
   :'any_sub', :'att_001', :'any_sub', 'policy-2026-07', :'u_designer', clock_timestamp());

insert into public.release_attempt
  (id, tenant_id, site_id, candidate_id, actor_user_id, candidate_hash, release_authorization_hash,
   idempotency_key, request_hash, status, allocated_revision_id, release_sequence, membership_version,
   aal, action_context_id, authorized_at)
values
  (:'att_revoke_b', :'tenant_001', :'site_001b', :'cand_revoke_b', :'u_approver_1', :'h_revoke_b', :'auth_void',
   'seed-revoke-b', :'req_void', 'PUBLISHED', :'rev_revoke_b', 9001, 1,
   'aal1', gen_random_uuid(), clock_timestamp());

insert into public.release_revision
  (id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
   content_hash, expected_packet_hash, release_certificate, attestation_id, attestation_hash,
   approver_user_id, approver_membership_version, approver_aal, status, release_sequence, authorized_at, released_at)
values
  (:'rev_revoke_b', :'tenant_001', :'site_001b', :'att_revoke_b', :'cand_revoke_b', :'h_revoke_b', :'auth_void',
   :'content_e', :'packet_e', '{"cert":"site-b"}'::jsonb, :'att_001', :'any_sub',
   :'u_approver_1', 1, 'aal1', 'ACTIVE', 9001, clock_timestamp(), clock_timestamp());

-- Freeze crossing: a FREEZE context minted for site A cannot freeze a working
-- revision that belongs to site B.
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', :'wr_freeze_b', :'req_void') as freeze_cross_ctx \gset
select throws_ok(
  $$select public.rpc_trust_freeze('$$||:'freeze_cross_ctx'||$$'::uuid, '$$||:'wr_freeze_b'||$$'::uuid, '$$||:'h_freeze_b'||$$', '$$||:'any_sub'||$$', '$$||:'any_sub'||$$', '$$||:'any_sub'||$$', '$$||:'att_001'||$$'::uuid, '$$||:'any_sub'||$$', 'policy-2026-07')$$,
  'P0001', 'AUTH_SCOPE_DENIED', 'freeze: a site-A context cannot freeze a working revision that belongs to site B');

-- Begin crossing: a RELEASE context for site A cannot begin a release for a
-- candidate that belongs to site B.
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', 'RC-CROSS-B', :'req_void', :'h_begin_b', :'auth_void') as begin_cross_ctx \gset
select throws_ok(
  $$select public.rpc_trust_begin_release('$$||:'begin_cross_ctx'||$$'::uuid, '$$||:'h_begin_b'||$$', '$$||:'auth_void'||$$', 'idem-cross-b', '$$||:'req_void'||$$')$$,
  'P0001', 'AUTH_SCOPE_DENIED', 'begin: a site-A context cannot begin a release for a candidate that belongs to site B');

-- Revoke crossing: a REVOKE context for site A cannot revoke a release revision
-- that belongs to site B.
select set_config('request.jwt.claims', json_build_object('sub', :'u_revoker','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('REVOKE', :'tenant_001', :'site_001', 'RELEASE_REVISION', :'rev_revoke_b', :'req_void') as revoke_cross_ctx \gset
select throws_ok(
  $$select public.rpc_trust_revoke('$$||:'revoke_cross_ctx'||$$'::uuid, '$$||:'rev_revoke_b'||$$'::uuid, 'cross-site revoke attempt', 'SAFETY')$$,
  'P0001', 'AUTH_SCOPE_DENIED', 'revoke: a site-A context cannot revoke a release revision that belongs to site B');

-- ===========================================================================
-- Group M — organization scope (0189): the organization boundary is load-
--   bearing INSIDE a tenant. u_designer holds site/org grants for org_001 only;
--   site_x1 belongs to org_x, for which no membership holds any grant.
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
set local role authenticated;
select count(*)::int as x_site_orgx from public.monolith_site where id = :'site_x1' \gset
reset role;
select is(:x_site_orgx::bigint, 0::bigint, 'RLS: same-tenant membership without the organization grant cannot read an org-X site');

select * from finish();
rollback;
