-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (plan Task 3)
-- Feature: deny-only content-revocation registry + SAFETY block authority
--   (design 2026-07-22 §10.4 revocation semantics; plan
--   2026-07-24-trust-kernel-safety-content-revocation-registry.en.md Task 3).
--   Stable reason codes come from server/src/trust-kernel/reasonCodes.ts (§13);
--   SQL error strings MUST be those exact codes.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_safety.sql
--
-- The suite provisions TWO tenants (A = fixture, B = coexistence/cross-tenant
-- proof), each with a site, auth users, memberships/roles/site grants, a machine-
-- profile attestation, and directly-inserted SAFETY-revoked release revisions
-- (the provenance the block requires). It exercises the SAFETY_BLOCK action set
-- through create_verified_action_context (0180) and rpc_trust_safety_block_content
-- (0186), and asserts:
--   * the registry table has RLS on, no client write policy, no INSERT to
--     authenticated (writes flow only through the SECURITY DEFINER RPC)   (§7.5)
--   * fn_content_is_blocked is authoritative-but-unprobeable: service_role
--     may execute it, authenticated may NOT (no cross-tenant probing)      (§7.5)
--   * minting a SAFETY_BLOCK context without SAFETY_REVOKER -> AUTH_SCOPE_DENIED
--   * a block SUCCEEDS only when a SAFETY-revoked release_revision with that
--     content_hash exists in the SAME tenant+site; a non-SAFETY-class (or
--     absent) provenance row -> STATE_CONFLICT                             (§10.4)
--   * the BLOCK event row is append-only, carries a monotonic per-tenant
--     sequence, the actor, and the reason detail
--   * fn_content_is_blocked is TRUE after a matching BLOCK, FALSE otherwise
--   * tenant/site scope: a BLOCK in tenant A leaves an identical content_hash
--     UNBLOCKED in tenant B (the prior Gate cross-tenant-leak finding)     (§7.5)
-- inside one transaction, then ROLLS BACK. No private key material anywhere;
-- certificates/signatures are opaque fixture values; crypto is the TS layer.

\set ON_ERROR_STOP on

-- Fixture identifiers.
\set tenant_a   aa000000-0000-0000-0000-0000000000a1
\set tenant_b   bb000000-0000-0000-0000-0000000000b1
\set site_a     a5000000-0000-0000-0000-0000000000a5
\set site_a2    a5000000-0000-0000-0000-0000000000a6
\set site_b     b5000000-0000-0000-0000-0000000000b5

\set u_revoker    a5000000-0000-0000-0000-00000000c001
\set u_designer   a5000000-0000-0000-0000-00000000c002
\set u_revoker_b  b5000000-0000-0000-0000-00000000c003

\set m_revoker    a5000000-0000-0000-0000-00000000d001
\set m_designer   a5000000-0000-0000-0000-00000000d002
\set m_revoker_b  b5000000-0000-0000-0000-00000000d003

\set att_a   a5000000-0000-0000-0000-00000000e001
\set att_b   b5000000-0000-0000-0000-00000000e001

\set wr_a    a5000000-0000-0000-0000-00000000f001
\set wr_b    b5000000-0000-0000-0000-00000000f001

\set cand_a1 a5000000-0000-0000-0000-000000010001
\set cand_a2 a5000000-0000-0000-0000-000000010002
\set cand_ap a5000000-0000-0000-0000-000000010003
\set cand_b1 b5000000-0000-0000-0000-000000010001

\set attm_a1 a5000000-0000-0000-0000-000000020001
\set attm_a2 a5000000-0000-0000-0000-000000020002
\set attm_ap a5000000-0000-0000-0000-000000020003
\set attm_b1 b5000000-0000-0000-0000-000000020001

\set rev_a1  a5000000-0000-0000-0000-000000030001
\set rev_a2  a5000000-0000-0000-0000-000000030002
\set rev_ap  a5000000-0000-0000-0000-000000030003
\set rev_b1  b5000000-0000-0000-0000-000000030001

-- 64-char lowercase-hex fixtures (valid sha256 hex; pairwise distinct where it matters).
\set h_blk     aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
\set h_blk2    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
\set h_noprov  cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
\set cand_h_a1 dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
\set cand_h_a2 1111111111111111111111111111111111111111111111111111111111111111
\set cand_h_ap 2222222222222222222222222222222222222222222222222222222222222222
\set cand_h_b1 3333333333333333333333333333333333333333333333333333333333333333
\set sub       4444444444444444444444444444444444444444444444444444444444444444
\set req_h     9999999999999999999999999999999999999999999999999999999999999999
\set h_seq     5555555555555555555555555555555555555555555555555555555555555555

begin;
create extension if not exists pgtap;
select plan(36);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  (:'u_revoker'), (:'u_designer'), (:'u_revoker_b');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_a', 'safety-a', 'Safety tenant A (fixture)', 'ACTIVE'),
  (:'tenant_b', 'safety-b', 'Safety tenant B (coexistence)', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, code, display_name, status) values
  (:'site_a',  :'tenant_a', 'A-SITE-01', 'Tenant A site',        'ACTIVE'),
  (:'site_a2', :'tenant_a', 'A-SITE-02', 'Tenant A second site', 'ACTIVE'),
  (:'site_b',  :'tenant_b', 'B-SITE-01', 'Tenant B site',        'ACTIVE');

insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_revoker',   :'tenant_a', :'u_revoker',   1, 'ACTIVE'),
  (:'m_designer',  :'tenant_a', :'u_designer',  1, 'ACTIVE'),
  (:'m_revoker_b', :'tenant_b', :'u_revoker_b', 1, 'ACTIVE');

insert into public.monolith_membership_role (tenant_id, membership_id, role) values
  (:'tenant_a', :'m_revoker',   'SAFETY_REVOKER'),
  (:'tenant_a', :'m_designer',  'DESIGNER'),
  (:'tenant_b', :'m_revoker_b', 'SAFETY_REVOKER');

insert into public.monolith_membership_site (tenant_id, membership_id, site_id) values
  (:'tenant_a', :'m_revoker',   :'site_a'),
  (:'tenant_a', :'m_revoker',   :'site_a2'),
  (:'tenant_a', :'m_designer',  :'site_a'),
  (:'tenant_b', :'m_revoker_b', :'site_b');

insert into public.machine_profile_attestation
  (id, tenant_id, site_id, machine_id, profile_hash, tool_library_hash, postprocessor_id,
   postprocessor_version, postprocessor_binary_hash, approver_user_id, key_id, signature,
   issued_at, valid_from, valid_until, status, attestation_sequence)
values
  (:'att_a', :'tenant_a', :'site_a', 'CNC-A', :'sub', :'sub', 'pp-a', '1.0.0', :'sub',
   :'u_revoker', 'dev-key-a', 'sig-a', clock_timestamp() - interval '1 day',
   clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1),
  (:'att_b', :'tenant_b', :'site_b', 'CNC-B', :'sub', :'sub', 'pp-b', '1.0.0', :'sub',
   :'u_revoker_b', 'dev-key-b', 'sig-b', clock_timestamp() - interval '1 day',
   clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1);

insert into public.release_working_revision
  (id, tenant_id, site_id, parent_revision_id, status, content_refs, creator_user_id, policy_version, profile_version)
values
  (:'wr_a', :'tenant_a', :'site_a', null, 'DRAFT', array['ref-a'], :'u_revoker',   'policy-2026-07', '1.0.0'),
  (:'wr_b', :'tenant_b', :'site_b', null, 'DRAFT', array['ref-b'], :'u_revoker_b', 'policy-2026-07', '1.0.0');

-- Candidates (one per revision; candidate_hash unique per tenant).
insert into public.release_candidate
  (id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
   machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at)
values
  (:'cand_a1', :'tenant_a', :'site_a', :'wr_a', :'cand_h_a1', :'sub', :'sub', :'sub', :'att_a', :'sub', 'policy-2026-07', :'u_revoker', clock_timestamp()),
  (:'cand_a2', :'tenant_a', :'site_a', :'wr_a', :'cand_h_a2', :'sub', :'sub', :'sub', :'att_a', :'sub', 'policy-2026-07', :'u_revoker', clock_timestamp()),
  (:'cand_ap', :'tenant_a', :'site_a', :'wr_a', :'cand_h_ap', :'sub', :'sub', :'sub', :'att_a', :'sub', 'policy-2026-07', :'u_revoker', clock_timestamp()),
  (:'cand_b1', :'tenant_b', :'site_b', :'wr_b', :'cand_h_b1', :'sub', :'sub', :'sub', :'att_b', :'sub', 'policy-2026-07', :'u_revoker_b', clock_timestamp());

-- Attempts (each revision's parent attempt; release_sequence unique per tenant).
insert into public.release_attempt
  (id, tenant_id, site_id, candidate_id, actor_user_id, candidate_hash, release_authorization_hash,
   idempotency_key, request_hash, status, allocated_revision_id, release_sequence, membership_version,
   aal, action_context_id, authorized_at)
values
  (:'attm_a1', :'tenant_a', :'site_a', :'cand_a1', :'u_revoker', :'cand_h_a1', :'sub', 'idem-a1', :'sub', 'PUBLISHED', :'rev_a1', 101, 1, 'aal1', gen_random_uuid(), clock_timestamp()),
  (:'attm_a2', :'tenant_a', :'site_a', :'cand_a2', :'u_revoker', :'cand_h_a2', :'sub', 'idem-a2', :'sub', 'PUBLISHED', :'rev_a2', 102, 1, 'aal1', gen_random_uuid(), clock_timestamp()),
  (:'attm_ap', :'tenant_a', :'site_a', :'cand_ap', :'u_revoker', :'cand_h_ap', :'sub', 'idem-ap', :'sub', 'PUBLISHED', :'rev_ap', 103, 1, 'aal1', gen_random_uuid(), clock_timestamp()),
  (:'attm_b1', :'tenant_b', :'site_b', :'cand_b1', :'u_revoker_b', :'cand_h_b1', :'sub', 'idem-b1', :'sub', 'PUBLISHED', :'rev_b1', 201, 1, 'aal1', gen_random_uuid(), clock_timestamp());

-- Revisions. rev_a1/rev_a2 are SAFETY-revoked (valid block provenance); rev_ap is
-- OPERATIONAL-revoked (present but NOT safety -> must fail the provenance rule);
-- rev_b1 is a SAFETY-revoked twin of h_blk in tenant B (cross-tenant scope proof).
insert into public.release_revision
  (id, tenant_id, site_id, release_attempt_id, candidate_id, candidate_hash, release_authorization_hash,
   content_hash, expected_packet_hash, release_certificate, attestation_id, attestation_hash,
   approver_user_id, approver_membership_version, approver_aal, status, release_sequence, authorized_at, released_at,
   revoked_at, revoked_by_user_id, revoke_reason, revoke_sequence, revoke_reason_class)
values
  (:'rev_a1', :'tenant_a', :'site_a', :'attm_a1', :'cand_a1', :'cand_h_a1', :'sub', :'h_blk', :'sub', '{"cert":"a1"}'::jsonb, :'att_a', :'sub',
   :'u_revoker', 1, 'aal1', 'REVOKED', 101, clock_timestamp(), clock_timestamp(),
   clock_timestamp(), :'u_revoker', 'safety recall', 1, 'SAFETY'),
  (:'rev_a2', :'tenant_a', :'site_a', :'attm_a2', :'cand_a2', :'cand_h_a2', :'sub', :'h_blk2', :'sub', '{"cert":"a2"}'::jsonb, :'att_a', :'sub',
   :'u_revoker', 1, 'aal1', 'REVOKED', 102, clock_timestamp(), clock_timestamp(),
   clock_timestamp(), :'u_revoker', 'safety recall 2', 2, 'SAFETY'),
  (:'rev_ap', :'tenant_a', :'site_a', :'attm_ap', :'cand_ap', :'cand_h_ap', :'sub', :'h_noprov', :'sub', '{"cert":"ap"}'::jsonb, :'att_a', :'sub',
   :'u_revoker', 1, 'aal1', 'REVOKED', 103, clock_timestamp(), clock_timestamp(),
   clock_timestamp(), :'u_revoker', 'superseded', 3, 'OPERATIONAL'),
  (:'rev_b1', :'tenant_b', :'site_b', :'attm_b1', :'cand_b1', :'cand_h_b1', :'sub', :'h_blk', :'sub', '{"cert":"b1"}'::jsonb, :'att_b', :'sub',
   :'u_revoker_b', 1, 'aal1', 'REVOKED', 201, clock_timestamp(), clock_timestamp(),
   clock_timestamp(), :'u_revoker_b', 'safety recall b', 1, 'SAFETY');

-- ===========================================================================
-- Group A — registry posture (design §7.5): RLS on, no client write, RPC-only
-- ===========================================================================
select ok(
  (select relrowsecurity from pg_class where relname='release_content_revocation' and relnamespace='public'::regnamespace),
  'release_content_revocation RLS enabled');
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='release_content_revocation' and cmd<>'SELECT'),
  0::bigint, 'release_content_revocation exposes no client write policy');
select ok(
  not has_table_privilege('authenticated', 'public.release_content_revocation', 'INSERT'),
  'authenticated cannot INSERT into release_content_revocation (writes go through the RPC only)');
select ok(
  has_table_privilege('authenticated', 'public.release_content_revocation', 'SELECT'),
  'authenticated may SELECT release_content_revocation (RLS still filters rows)');

-- FIX-A: the deny log must be tamper-resistant. Supabase default privileges hand
-- `authenticated` TRUNCATE/REFERENCES/TRIGGER on every new table; 0186 strips them
-- so only SELECT survives — no client may erase or rewrite the append-only log.
select ok(
  not has_table_privilege('authenticated', 'public.release_content_revocation', 'TRUNCATE'),
  'authenticated cannot TRUNCATE the deny log (inherited default privilege stripped)');
select ok(
  not has_table_privilege('authenticated', 'public.release_content_revocation', 'UPDATE'),
  'authenticated cannot UPDATE the deny log');
select ok(
  not has_table_privilege('authenticated', 'public.release_content_revocation', 'DELETE'),
  'authenticated cannot DELETE the deny log');

-- fn_content_is_blocked is the authoritative deny predicate: the worker/RPCs
-- reach it, but authenticated may NOT probe it directly (no cross-tenant probe).
select ok(
  has_function_privilege('service_role', 'public.fn_content_is_blocked(uuid,uuid,text)', 'EXECUTE'),
  'service_role can execute fn_content_is_blocked');
select ok(
  not has_function_privilege('authenticated', 'public.fn_content_is_blocked(uuid,uuid,text)', 'EXECUTE'),
  'authenticated cannot execute fn_content_is_blocked directly');

-- The block RPC is user-authorized (mirror rpc_trust_revoke grants).
select ok(
  has_function_privilege('authenticated', 'public.rpc_trust_safety_block_content(uuid,text,text)', 'EXECUTE'),
  'authenticated can execute rpc_trust_safety_block_content');
select ok(
  not has_function_privilege('anon', 'public.rpc_trust_safety_block_content(uuid,text,text)', 'EXECUTE'),
  'anon cannot execute rpc_trust_safety_block_content');

-- ===========================================================================
-- Group B — mint authority: SAFETY_BLOCK requires SAFETY_REVOKER (design §7.3)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer','role','authenticated','aal','aal1')::text, true) as _c \gset
select throws_ok(
  $$select public.create_verified_action_context('SAFETY_BLOCK', '$$||:'tenant_a'||$$'::uuid, '$$||:'site_a'||$$'::uuid, 'RELEASE_REVISION', '$$||:'rev_a1'||$$', '$$||:'req_h'||$$')$$,
  'P0001', 'AUTH_SCOPE_DENIED', 'minting a SAFETY_BLOCK context without SAFETY_REVOKER is denied at mint time');

-- ===========================================================================
-- Group C — baseline: nothing is blocked before any BLOCK event
-- ===========================================================================
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a'::uuid, :'h_blk'), false,
  'fn_content_is_blocked is FALSE before any block');

-- ===========================================================================
-- Group D — provenance rule: block requires a SAFETY-revoked twin (design §10.4)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_revoker','role','authenticated','aal','aal1')::text, true) as _c \gset
select public.create_verified_action_context('SAFETY_BLOCK', :'tenant_a', :'site_a', 'RELEASE_REVISION', :'rev_ap', :'req_h') as ctx_noprov \gset
select throws_ok(
  $$select public.rpc_trust_safety_block_content('$$||:'ctx_noprov'||$$'::uuid, '$$||:'h_noprov'||$$', 'no safety provenance')$$,
  'P0001', 'STATE_CONFLICT', 'blocking content that was only OPERATIONAL-revoked (never SAFETY) is rejected');

-- ===========================================================================
-- Group E — a SAFETY-revoked content blocks; the BLOCK event is well-formed
-- ===========================================================================
-- FIX-D3 (deny-only): capture positive-authority state BEFORE the successful block
-- so we can prove the block writes no release_revision and mutates no revision.
select (select count(*) from public.release_revision)                       as rr_count_before,
       (select status from public.release_revision where id=:'rev_a1'::uuid) as rev_a1_status_before \gset

select public.create_verified_action_context('SAFETY_BLOCK', :'tenant_a', :'site_a', 'RELEASE_REVISION', :'rev_a1', :'req_h') as ctx_blk \gset
select public.rpc_trust_safety_block_content(:'ctx_blk'::uuid, :'h_blk', 'safety recall XYZ') as blk_id \gset

-- FIX-D3 (deny-only): release_revision is the sole positive authority — the block
-- must add no row and must not touch the target revision's status.
select is((select count(*) from public.release_revision), :rr_count_before::bigint,
  'deny-only: a successful block adds NO release_revision row (positive-authority count unchanged)');
select is((select status from public.release_revision where id=:'rev_a1'::uuid), :'rev_a1_status_before',
  'deny-only: a successful block does NOT mutate the target release_revision status');

select is((select action from public.release_content_revocation where id=:'blk_id'::uuid), 'BLOCK',
  'the appended event is a BLOCK');
select is((select sequence from public.release_content_revocation where id=:'blk_id'::uuid), 1::bigint,
  'the first block in the tenant carries sequence 1');
select is((select actor_user_id from public.release_content_revocation where id=:'blk_id'::uuid), :'u_revoker'::uuid,
  'the block records the acting SAFETY_REVOKER as actor');
select is((select detail from public.release_content_revocation where id=:'blk_id'::uuid), 'safety recall XYZ',
  'the block records the reason detail');

-- ===========================================================================
-- Group F — the deny predicate after a block
-- ===========================================================================
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a'::uuid, :'h_blk'), true,
  'fn_content_is_blocked is TRUE for the blocked (tenant, site, content_hash)');
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a'::uuid, :'h_blk2'), false,
  'fn_content_is_blocked stays FALSE for a different, unblocked content_hash');

-- ===========================================================================
-- Group G — tenant/site scope: an identical content_hash in tenant B is NOT
--   blocked by tenant A's block (prior Gate cross-tenant-leak finding, §7.5)
-- ===========================================================================
select is(public.fn_content_is_blocked(:'tenant_b'::uuid, :'site_b'::uuid, :'h_blk'), false,
  'a BLOCK in tenant A leaves the identical content_hash UNBLOCKED in tenant B');

-- ===========================================================================
-- Group G2 (FIX-D1) — the SAME-tenant SITE predicate is load-bearing, not just
--   the tenant predicate. site_a2 is a second ACTIVE site of tenant_a.
-- ===========================================================================
-- fn_content_is_blocked site predicate: a BLOCK in (tenant_a, site_a) must NOT
-- leak to a different site of the SAME tenant.
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a2'::uuid, :'h_blk'), false,
  'a BLOCK in (tenant_a, site_a) leaves the identical content_hash UNBLOCKED in the same tenant''s site_a2');

-- Provenance site predicate: a SAFETY_BLOCK context authorized for site_a2, aimed
-- at rev_a1 (SAFETY-revoked only in site_a), must fail — the RPC loads the revision
-- bound to the context's site, and rev_a1 is not in site_a2 -> STATE_CONFLICT.
select public.create_verified_action_context('SAFETY_BLOCK', :'tenant_a', :'site_a2', 'RELEASE_REVISION', :'rev_a1', :'req_h') as ctx_wrongsite \gset
select throws_ok(
  $$select public.rpc_trust_safety_block_content('$$||:'ctx_wrongsite'||$$'::uuid, '$$||:'h_blk'||$$', 'authorized site does not own the revision')$$,
  'P0001', 'STATE_CONFLICT', 'a SAFETY_BLOCK authorized for site_a2 cannot block a revision SAFETY-revoked only in site_a (provenance site predicate is load-bearing)');

-- ===========================================================================
-- Group H — the per-tenant sequence is monotonic across appends
-- ===========================================================================
select public.create_verified_action_context('SAFETY_BLOCK', :'tenant_a', :'site_a', 'RELEASE_REVISION', :'rev_a2', :'req_h') as ctx_blk2 \gset
select public.rpc_trust_safety_block_content(:'ctx_blk2'::uuid, :'h_blk2', 'safety recall 2') as blk2_id \gset
select is((select sequence from public.release_content_revocation where id=:'blk2_id'::uuid), 2::bigint,
  'the second block in the tenant carries the next monotonic sequence (2)');

-- ===========================================================================
-- Group I (FIX-D5) — the block is BOUND to the context-authorized revision
-- ===========================================================================
-- Mint a SAFETY_BLOCK context for rev_a1 (whose content_hash is h_blk) but call the
-- RPC with h_blk2 — the content_hash of a DIFFERENT revision (rev_a2). The free
-- p_content_hash parameter must match the context-authorized revision's hash, so a
-- mismatch is rejected AUTH_ACTION_CONTEXT_INVALID (mirrors rpc_trust_revoke's
-- resource_id binding). Without FIX-B this call would have silently succeeded.
select public.create_verified_action_context('SAFETY_BLOCK', :'tenant_a', :'site_a', 'RELEASE_REVISION', :'rev_a1', :'req_h') as ctx_bind \gset
select throws_ok(
  $$select public.rpc_trust_safety_block_content('$$||:'ctx_bind'||$$'::uuid, '$$||:'h_blk2'||$$', 'hash of a different revision')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'a content_hash that does not match the context-authorized revision is rejected (resource_id binding)');

-- ===========================================================================
-- Group J (FIX-D2) — latest-event-wins: a higher-sequence UNBLOCK reverses a BLOCK
-- ===========================================================================
-- As the superuser test session, directly append a BLOCK then a higher-sequence
-- UNBLOCK for a fresh content_hash (Task 5's UNBLOCK path does not exist yet). The
-- deny predicate must read the MAX-sequence event, not merely "exists a BLOCK".
-- Sequences 900/901 sit above the RPC-allocated 1/2 and keep (tenant_id, sequence)
-- unique; release_revision_id stays null (Task-5 UNBLOCK shape; FK is MATCH SIMPLE).
insert into public.release_content_revocation (tenant_id, site_id, content_hash, action, sequence, actor_user_id) values
  (:'tenant_a', :'site_a', :'h_seq', 'BLOCK',   900, :'u_revoker'),
  (:'tenant_a', :'site_a', :'h_seq', 'UNBLOCK', 901, :'u_revoker');
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a'::uuid, :'h_seq'), false,
  'latest-event-wins: a higher-sequence UNBLOCK after a BLOCK leaves the content NOT blocked (not naive exists-BLOCK)');

-- ===========================================================================
-- Group K (Task 4) — enforcement at commit_release: a BLOCKED content_hash can
--   never become an ACTIVE release (design §10.4; plan 2026-07-24 Task 4).
--
-- The commit RPC is worker-only and consumes no action context: it derives
-- tenant/site from the release_attempt row. We build committable PENDING attempts
-- by DIRECT INSERT (mirroring this suite's fixture style), matching every
-- precondition rpc_trust_commit_release checks (0182:525-560): a PENDING attempt
-- whose allocated_revision_id does not yet exist, an ACTIVE membership at the
-- pinned version, a release_candidate the commit reads (sorted_grant_hashes /
-- attestation / freezer), a QUARANTINED artifact, no prior ACTIVE revision for the
-- candidate_hash, and a freezer distinct from the actor (four-eyes). We then call
-- rpc_trust_commit_release directly (pgTAP runs as owner, standing in for the
-- worker; grants do not block — as trust_kernel_release.sql Group E does).
--
-- Three attempts:
--   * attm_cblk (tenant_a/site_a): commit its content as h_blk — which Group E
--     BLOCKED — must raise SAFETY_CONTENT_REVOKED and create NO revision.
--   * attm_cok  (tenant_a/site_a): commit a clean, never-blocked hash h_ok —
--     the SAME flow SUCCEEDS to ACTIVE (proves the guard does not over-block).
--   * attm_cxb  (tenant_b/site_b): commit h_blk — the SAME content_hash blocked
--     in tenant_a — must SUCCEED, proving the block is tenant/site-scoped and
--     does not leak across tenants at the commit gate (prior Gate finding).
-- ===========================================================================

-- Task-4 fixture identifiers.
\set u_worker_b   b5000000-0000-0000-0000-00000000c004
\set m_worker_b   b5000000-0000-0000-0000-00000000d004

\set cand_cblk    a5000000-0000-0000-0000-000000010004
\set cand_cok     a5000000-0000-0000-0000-000000010005
\set cand_cxb     b5000000-0000-0000-0000-000000010002

\set attm_cblk    a5000000-0000-0000-0000-000000020004
\set attm_cok     a5000000-0000-0000-0000-000000020005
\set attm_cxb     b5000000-0000-0000-0000-000000020002

-- allocated_revision_id values — MUST NOT pre-exist in release_revision.
\set rev_cblk     a5000000-0000-0000-0000-000000030004
\set rev_cok      a5000000-0000-0000-0000-000000030005
\set rev_cxb      b5000000-0000-0000-0000-000000030002

-- Fresh candidate hashes (unique per tenant) + a clean, never-blocked content hash.
\set cand_h_cblk  6666666666666666666666666666666666666666666666666666666666666666
\set cand_h_cok   7777777777777777777777777777777777777777777777777777777777777777
\set cand_h_cxb   8888888888888888888888888888888888888888888888888888888888888888
\set h_ok         abababababababababababababababababababababababababababababababab

-- A second tenant_b user so the tenant_b attempt satisfies four-eyes (actor !=
-- freezer). Commit checks membership ACTIVE + version only; no role/site grant.
insert into auth.users (id) values (:'u_worker_b');
insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_worker_b', :'tenant_b', :'u_worker_b', 1, 'ACTIVE');

-- Candidates the commit RPC reads (freezer distinct from each attempt's actor).
insert into public.release_candidate
  (id, tenant_id, site_id, working_revision_id, candidate_hash, snapshot_hash, gate_inputs_hash,
   machine_profile_hash, attestation_id, attestation_hash, policy_version, freezer_user_id, frozen_at)
values
  (:'cand_cblk', :'tenant_a', :'site_a', :'wr_a', :'cand_h_cblk', :'sub', :'sub', :'sub', :'att_a', :'sub', 'policy-2026-07', :'u_designer',  clock_timestamp()),
  (:'cand_cok',  :'tenant_a', :'site_a', :'wr_a', :'cand_h_cok',  :'sub', :'sub', :'sub', :'att_a', :'sub', 'policy-2026-07', :'u_designer',  clock_timestamp()),
  (:'cand_cxb',  :'tenant_b', :'site_b', :'wr_b', :'cand_h_cxb',  :'sub', :'sub', :'sub', :'att_b', :'sub', 'policy-2026-07', :'u_revoker_b', clock_timestamp());

-- Committable PENDING attempts (actor has an ACTIVE membership at version 1;
-- allocated_revision_id is fresh; release_sequence unique per tenant).
insert into public.release_attempt
  (id, tenant_id, site_id, candidate_id, actor_user_id, candidate_hash, release_authorization_hash,
   idempotency_key, request_hash, status, allocated_revision_id, release_sequence, membership_version,
   aal, action_context_id, authorized_at)
values
  (:'attm_cblk', :'tenant_a', :'site_a', :'cand_cblk', :'u_revoker',  :'cand_h_cblk', :'sub', 'idem-cblk', :'sub', 'PENDING', :'rev_cblk', 301, 1, 'aal1', gen_random_uuid(), clock_timestamp()),
  (:'attm_cok',  :'tenant_a', :'site_a', :'cand_cok',  :'u_revoker',  :'cand_h_cok',  :'sub', 'idem-cok',  :'sub', 'PENDING', :'rev_cok',  302, 1, 'aal1', gen_random_uuid(), clock_timestamp()),
  (:'attm_cxb',  :'tenant_b', :'site_b', :'cand_cxb',  :'u_worker_b', :'cand_h_cxb',  :'sub', 'idem-cxb',  :'sub', 'PENDING', :'rev_cxb',  202, 1, 'aal1', gen_random_uuid(), clock_timestamp());

-- QUARANTINED artifacts (the shape begin_release leaves; commit flips them).
insert into public.release_artifact
  (id, tenant_id, site_id, release_attempt_id, artifact_class, status)
values
  (gen_random_uuid(), :'tenant_a', :'site_a', :'attm_cblk', 'P2_MANUFACTURING', 'QUARANTINED'),
  (gen_random_uuid(), :'tenant_a', :'site_a', :'attm_cok',  'P2_MANUFACTURING', 'QUARANTINED'),
  (gen_random_uuid(), :'tenant_b', :'site_b', :'attm_cxb',  'P2_MANUFACTURING', 'QUARANTINED');

-- Precondition: h_blk is BLOCKED in (tenant_a, site_a) from Group E's real block.
select is(public.fn_content_is_blocked(:'tenant_a'::uuid, :'site_a'::uuid, :'h_blk'), true,
  'precondition: h_blk is BLOCKED in (tenant_a, site_a) before the commit-gate tests');

-- The core enforcement: committing the BLOCKED content_hash is rejected...
select throws_ok(
  $$select public.rpc_trust_commit_release('$$||:'attm_cblk'||$$'::uuid, '$$||:'h_blk'||$$', '$$||:'sub'||$$', '{"cert":"cblk"}'::jsonb, 'dev-release-key')$$,
  'P0001', 'SAFETY_CONTENT_REVOKED',
  'commit_release raises SAFETY_CONTENT_REVOKED for a BLOCKED content_hash');
-- ...and creates NO release_revision (the deny fires before any INSERT/side effect).
select is((select count(*) from public.release_revision where release_attempt_id=:'attm_cblk'::uuid), 0::bigint,
  'a denied commit creates NO release_revision for the attempt (no ACTIVE release)');
select is((select count(*) from public.release_revision where id=:'rev_cblk'::uuid), 0::bigint,
  'a denied commit does not materialize the allocated revision id');

-- Positive control: the SAME flow with a clean, never-blocked content_hash SUCCEEDS.
select public.rpc_trust_commit_release(:'attm_cok'::uuid, :'h_ok', :'sub', '{"cert":"cok"}'::jsonb, 'dev-release-key') as rev_cok_committed \gset
select is(:'rev_cok_committed'::uuid, :'rev_cok'::uuid,
  'a clean (never-blocked) content_hash commits and returns the allocated revision id');
select is((select status from public.release_revision where id=:'rev_cok'::uuid), 'ACTIVE',
  'the clean commit records an ACTIVE release_revision (guard does not over-block)');

-- Tenant/site scope: h_blk is blocked in tenant_a only — a tenant_b commit of the
-- identical content_hash must SUCCEED (no cross-tenant leak at the commit gate).
select public.rpc_trust_commit_release(:'attm_cxb'::uuid, :'h_blk', :'sub', '{"cert":"cxb"}'::jsonb, 'dev-release-key') as rev_cxb_committed \gset
select is(:'rev_cxb_committed'::uuid, :'rev_cxb'::uuid,
  'cross-tenant: a BLOCK in (tenant_a, site_a) does NOT reject a commit of the same content_hash in tenant_b');
select is((select status from public.release_revision where id=:'rev_cxb'::uuid), 'ACTIVE',
  'cross-tenant: the tenant_b commit of h_blk records an ACTIVE release_revision (block is tenant/site-scoped)');

select * from finish();
rollback;
