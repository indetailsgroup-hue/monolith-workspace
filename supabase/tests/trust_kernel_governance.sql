-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (Task 3)
-- Feature: machine-profile attestation + warning-exception governance (design
--   §§8-9 component contracts / artifact matrix, §12 capability safety, §13
--   error model). Stable reason codes come from
--   server/src/trust-kernel/reasonCodes.ts (§13); SQL error strings MUST be
--   those exact codes.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_governance.sql
--
-- The suite provisions TWO tenants (001 = Daph-like FIXTURE, 002 = coexistence
-- proof) with sites and auth users, seeds machine-profile attestations and
-- warning-exception grants, and asserts:
--   * cross-tenant profile rejection (plan RED)      -> CAP_PROFILE_ATTESTATION_INVALID
--   * expired / revoked / unknown attestation        -> CAP_PROFILE_ATTESTATION_*
--   * hard-blocker (CAP_*) grant                      -> GATE_HARD_BLOCKER
--   * expired / mismatched / cross-tenant grant       -> GATE_WARNING_EXCEPTION_*
--   * two-distinct-approver + expiry + CAP-never-eligible + wrong-purpose CHECKs
--   * the widened action domain admits GRANT_WARNING_EXCEPTION
--   * RLS posture parity on the new tenant-scoped tables
-- inside one transaction, then ROLLS BACK. No private key material anywhere —
-- signatures are opaque fixture strings; crypto verification is the TS layer.

\set ON_ERROR_STOP on

-- Fixture identifiers (Daph is tenant-001 FIXTURE data only, never a schema constant).
\set tenant_001    11111111-1111-1111-1111-111111111111
\set tenant_002    22222222-2222-2222-2222-222222222222
\set org_001       0a111111-1111-1111-1111-11111111110a
\set org_002       0b222222-2222-2222-2222-22222222220b
\set org_x         0c111111-1111-1111-1111-11111111110c
\set site_001      1a111111-1111-1111-1111-1111111111a1
\set site_002      2a222222-2222-2222-2222-2222222222a2
\set site_x1       3a111111-1111-1111-1111-1111111111a3
\set u_approver_1  a1111111-1111-1111-1111-1111111111a1
\set u_user_a      aaaaaaaa-1111-1111-1111-1111111111aa
\set u_user_b      bbbbbbbb-1111-1111-1111-1111111111bb
\set m_approver_1  e1111111-1111-1111-1111-1111111111a1
\set att_001_curr  c1111111-1111-1111-1111-11111111c001
\set att_001_exp   c1111111-1111-1111-1111-11111111c002
\set att_001_rev   c1111111-1111-1111-1111-11111111c003
\set att_002_curr  c2222222-2222-2222-2222-22222222c001
\set grant_valid   d1111111-1111-1111-1111-11111111d001
\set grant_hard    d1111111-1111-1111-1111-11111111d002
\set grant_exp     d1111111-1111-1111-1111-11111111d003
\set missing_id    f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0

begin;
create extension if not exists pgtap;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  (:'u_approver_1'), (:'u_user_a'), (:'u_user_b');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_001', 'daph', 'Daph (fixture tenant 001)', 'ACTIVE'),
  (:'tenant_002', 'tenant-002', 'Coexistence tenant 002', 'ACTIVE');

-- One 'default' organization per tenant, plus org-x in tenant 001: an extra
-- organization no membership is granted — used to prove same-tenant
-- cross-organization RLS denial.
insert into public.monolith_organization (id, tenant_id, slug, display_name, legal_name, status) values
  (:'org_001', :'tenant_001', 'default', 'Daph default org', 'Daph default org', 'ACTIVE'),
  (:'org_002', :'tenant_002', 'default', 'Tenant 002 default org', 'Tenant 002 default org', 'ACTIVE'),
  (:'org_x',   :'tenant_001', 'org-x',   'Org X (no grants)', 'Org X (no grants)', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, organization_id, code, display_name, status) values
  (:'site_001', :'tenant_001', :'org_001', 'BKK-HQ-01', 'Daph HQ', 'ACTIVE'),
  (:'site_002', :'tenant_002', :'org_002', 'T2-SITE-01', 'Tenant 002 site', 'ACTIVE'),
  (:'site_x1',  :'tenant_001', :'org_x',   'BKK-X-01', 'Daph org-X site (no grants)', 'ACTIVE');

insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_approver_1', :'tenant_001', :'u_approver_1', 1, 'ACTIVE');

insert into public.monolith_membership_site (tenant_id, membership_id, site_id) values
  (:'tenant_001', :'m_approver_1', :'site_001');

-- Derive organization grants from the site grants (never grants org_x/site_x1).
insert into public.monolith_membership_organization (tenant_id, membership_id, organization_id)
select distinct ms.tenant_id, ms.membership_id, s.organization_id
from public.monolith_membership_site ms
join public.monolith_site s on s.tenant_id = ms.tenant_id and s.id = ms.site_id
on conflict do nothing;

-- Attestations: a current one, an expired one, and a revoked one for tenant 001;
-- a current one for tenant 002 (coexistence).
insert into public.machine_profile_attestation
  (id, tenant_id, site_id, machine_id, profile_hash, tool_library_hash, postprocessor_id,
   postprocessor_version, postprocessor_binary_hash, approver_user_id, key_id, signature,
   issued_at, valid_from, valid_until, status, attestation_sequence)
values
  (:'att_001_curr', :'tenant_001', :'site_001', 'CNC-001', repeat('a',64), repeat('b',64), 'pp-nc-1000',
   '1.2.3', repeat('c',64), :'u_approver_1', 'dev-profile-key', 'sig-att-001-curr',
   clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1),
  (:'att_001_exp', :'tenant_001', :'site_001', 'CNC-001', repeat('a',64), repeat('b',64), 'pp-nc-1000',
   '1.2.2', repeat('c',64), :'u_approver_1', 'dev-profile-key', 'sig-att-001-exp',
   clock_timestamp() - interval '40 days', clock_timestamp() - interval '40 days', clock_timestamp() - interval '1 day', 'ACTIVE', 2),
  (:'att_001_rev', :'tenant_001', :'site_001', 'CNC-002', repeat('a',64), repeat('b',64), 'pp-nc-1000',
   '1.2.3', repeat('c',64), :'u_approver_1', 'dev-profile-key', 'sig-att-001-rev',
   clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'REVOKED', 1),
  (:'att_002_curr', :'tenant_002', :'site_002', 'CNC-201', repeat('a',64), repeat('b',64), 'pp-nc-2000',
   '3.0.0', repeat('c',64), :'u_approver_1', 'dev-profile-key-002', 'sig-att-002-curr',
   clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day', clock_timestamp() + interval '30 days', 'ACTIVE', 1);

-- Grants: a valid one, a CAP_* hard-blocker one, and an expired one — all bound
-- to the same candidate hash repeat('d',64) in tenant 001.
insert into public.warning_exception_grant
  (id, tenant_id, site_id, candidate_hash, warning_code, entity_ids, reason, policy_version,
   approver_user_ids, key_id, signature, issued_at, expires_at, status)
values
  (:'grant_valid', :'tenant_001', :'site_001', repeat('d',64), 'WARN_DEEP_POCKET_ADVISORY',
   array['op-0001','op-0002'], 'within verified jig envelope', 'policy-2026-07',
   array[:'u_user_a', :'u_user_b']::uuid[], 'dev-grant-key', 'sig-grant-valid',
   clock_timestamp() - interval '1 hour', clock_timestamp() + interval '2 days', 'ACTIVE'),
  (:'grant_hard', :'tenant_001', :'site_001', repeat('d',64), 'CAP_UNKNOWN_TOOL',
   array['op-0003'], 'attempted exception of a hard blocker', 'policy-2026-07',
   array[:'u_user_a', :'u_user_b']::uuid[], 'dev-grant-key', 'sig-grant-hard',
   clock_timestamp() - interval '1 hour', clock_timestamp() + interval '2 days', 'ACTIVE'),
  (:'grant_exp', :'tenant_001', :'site_001', repeat('d',64), 'WARN_GRAIN_DIRECTION_ADVISORY',
   array['op-0004'], 'expired advisory exception', 'policy-2026-07',
   array[:'u_user_a', :'u_user_b']::uuid[], 'dev-grant-key', 'sig-grant-exp',
   clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day', 'ACTIVE');

-- ===========================================================================
-- Group A — schema and RLS posture parity (design §7.5)
-- ===========================================================================
select ok((select relrowsecurity from pg_class where relname='machine_profile_attestation' and relnamespace='public'::regnamespace), 'machine_profile_attestation RLS enabled');
select ok((select relrowsecurity from pg_class where relname='warning_exception_grant'     and relnamespace='public'::regnamespace), 'warning_exception_grant RLS enabled');
select ok((select relrowsecurity from pg_class where relname='warning_catalogue'           and relnamespace='public'::regnamespace), 'warning_catalogue RLS enabled');
select is((select count(*) from pg_policies where schemaname='public' and tablename='machine_profile_attestation' and cmd<>'SELECT'), 0::bigint, 'machine_profile_attestation: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='warning_exception_grant'     and cmd<>'SELECT'), 0::bigint, 'warning_exception_grant: no client write policy');

-- The catalogue OWNS exception_eligible; every CAP_* code is FALSE there.
select is(
  (select count(*) from public.warning_catalogue where left(code,4)='CAP_' and exception_eligible),
  0::bigint, 'every CAP_* catalogue code is exception_eligible=false'
);

-- ===========================================================================
-- Group B — record CHECK constraints (binding: two distinct approvers,
--            expires>issued, CAP-never-eligible, pinned key purpose)
-- ===========================================================================
select throws_ok(
  $$insert into public.warning_exception_grant
     (id, tenant_id, site_id, candidate_hash, warning_code, entity_ids, reason, policy_version, approver_user_ids, key_id, signature, issued_at, expires_at)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, repeat('d',64), 'WARN_DEEP_POCKET_ADVISORY', array['op-x'], 'r', 'p', array['$$||:'u_user_a'||$$','$$||:'u_user_a'||$$']::uuid[], 'k', 's', now(), now()+interval '1 day')$$,
  '23514', null, 'duplicate approver is rejected by CHECK'
);
select throws_ok(
  $$insert into public.warning_exception_grant
     (id, tenant_id, site_id, candidate_hash, warning_code, entity_ids, reason, policy_version, approver_user_ids, key_id, signature, issued_at, expires_at)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, repeat('d',64), 'WARN_DEEP_POCKET_ADVISORY', array['op-x'], 'r', 'p', array['$$||:'u_user_a'||$$','$$||:'u_user_b'||$$']::uuid[], 'k', 's', now(), now())$$,
  '23514', null, 'expires_at <= issued_at is rejected by CHECK'
);
select throws_ok(
  $$update public.warning_catalogue set exception_eligible = true where code = 'CAP_UNKNOWN_TOOL'$$,
  '23514', null, 'a CAP_* code can never be marked exception_eligible'
);
select throws_ok(
  $$insert into public.machine_profile_attestation
     (id, tenant_id, site_id, machine_id, profile_hash, tool_library_hash, postprocessor_id, postprocessor_version, postprocessor_binary_hash, approver_user_id, key_id, signature_purpose, signature, issued_at, valid_from, valid_until, status, attestation_sequence)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, 'CNC-003', repeat('a',64), repeat('b',64), 'pp', '1', repeat('c',64), '$$||:'u_approver_1'||$$'::uuid, 'k', 'WARNING_EXCEPTION', 's', now(), now(), now()+interval '1 day', 'ACTIVE', 9)$$,
  '23514', null, 'attestation signed with a non-PROFILE_ATTESTATION key purpose is rejected'
);
select throws_ok(
  $$insert into public.warning_exception_grant
     (id, tenant_id, site_id, candidate_hash, warning_code, entity_ids, reason, policy_version, approver_user_ids, key_id, signature_purpose, signature, issued_at, expires_at)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, repeat('d',64), 'WARN_DEEP_POCKET_ADVISORY', array['op-x'], 'r', 'p', array['$$||:'u_user_a'||$$','$$||:'u_user_b'||$$']::uuid[], 'k', 'PROFILE_ATTESTATION', 's', now(), now()+interval '1 day')$$,
  '23514', null, 'grant signed with a non-WARNING_EXCEPTION key purpose is rejected'
);

-- ===========================================================================
-- Group C — assert_profile_attestation_current (design §12; plan RED)
-- ===========================================================================
select throws_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_002'||$$'::uuid, '$$||:'att_001_curr'||$$'::uuid, clock_timestamp())$$,
  'P0001', 'CAP_PROFILE_ATTESTATION_INVALID', 'cross-tenant profile rejected'
);
select lives_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_001'||$$'::uuid, '$$||:'att_001_curr'||$$'::uuid, clock_timestamp())$$,
  'current in-scope attestation is accepted'
);
select throws_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_001'||$$'::uuid, '$$||:'att_001_exp'||$$'::uuid, clock_timestamp())$$,
  'P0001', 'CAP_PROFILE_ATTESTATION_EXPIRED', 'expired attestation rejected'
);
select throws_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_001'||$$'::uuid, '$$||:'att_001_rev'||$$'::uuid, clock_timestamp())$$,
  'P0001', 'CAP_PROFILE_ATTESTATION_INVALID', 'revoked attestation rejected'
);
select throws_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_001'||$$'::uuid, '$$||:'missing_id'||$$'::uuid, clock_timestamp())$$,
  'P0001', 'CAP_PROFILE_ATTESTATION_INVALID', 'unknown attestation rejected'
);
select lives_ok(
  $$select public.assert_profile_attestation_current('$$||:'tenant_002'||$$'::uuid, '$$||:'att_002_curr'||$$'::uuid, clock_timestamp())$$,
  'tenant 002 attestation coexists and is accepted'
);

-- ===========================================================================
-- Group D — assert_warning_grants_current (design §12)
-- ===========================================================================
select is(
  public.assert_warning_grants_current(:'tenant_001', repeat('d',64), array[:'grant_valid']::uuid[], clock_timestamp()),
  1::bigint, 'valid, eligible, in-window grant is accepted'
);
select throws_ok(
  $$select public.assert_warning_grants_current('$$||:'tenant_001'||$$'::uuid, repeat('d',64), array['$$||:'grant_hard'||$$']::uuid[], clock_timestamp())$$,
  'P0001', 'GATE_HARD_BLOCKER', 'a CAP_* grant can never except a hard blocker'
);
select throws_ok(
  $$select public.assert_warning_grants_current('$$||:'tenant_001'||$$'::uuid, repeat('d',64), array['$$||:'grant_exp'||$$']::uuid[], clock_timestamp())$$,
  'P0001', 'GATE_WARNING_EXCEPTION_EXPIRED', 'an expired grant is rejected'
);
select throws_ok(
  $$select public.assert_warning_grants_current('$$||:'tenant_001'||$$'::uuid, repeat('e',64), array['$$||:'grant_valid'||$$']::uuid[], clock_timestamp())$$,
  'P0001', 'GATE_WARNING_EXCEPTION_MISMATCH', 'a candidate-hash mismatch is rejected'
);
select throws_ok(
  $$select public.assert_warning_grants_current('$$||:'tenant_002'||$$'::uuid, repeat('d',64), array['$$||:'grant_valid'||$$']::uuid[], clock_timestamp())$$,
  'P0001', 'GATE_WARNING_EXCEPTION_MISMATCH', 'a cross-tenant grant is rejected'
);
select throws_ok(
  $$select public.assert_warning_grants_current('$$||:'tenant_001'||$$'::uuid, repeat('d',64), array['$$||:'missing_id'||$$']::uuid[], clock_timestamp())$$,
  'P0001', 'GATE_WARNING_EXCEPTION_MISMATCH', 'an unknown grant is rejected'
);

-- ===========================================================================
-- Group E — the widened action domain admits GRANT_WARNING_EXCEPTION (the ALTER)
-- ===========================================================================
select lives_ok(
  $$insert into public.verified_action_context
     (id, tenant_id, site_id, actor_user_id, membership_id, roles, aal, membership_version, action, resource_type, resource_id, request_hash, candidate_hash, release_authorization_hash, issued_at, expires_at, nonce)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, '$$||:'u_approver_1'||$$'::uuid, '$$||:'m_approver_1'||$$'::uuid, array['RELEASE_APPROVER'], 'aal1', 1, 'GRANT_WARNING_EXCEPTION', 'RELEASE_CANDIDATE', 'RELEASE-CANDIDATE-0001', repeat('c',64), repeat('d',64), null, clock_timestamp(), clock_timestamp()+interval '5 minutes', gen_random_uuid()::text)$$,
  'GRANT_WARNING_EXCEPTION action context is admitted by the widened CHECK'
);
select throws_ok(
  $$insert into public.verified_action_context
     (id, tenant_id, site_id, actor_user_id, membership_id, roles, aal, membership_version, action, resource_type, resource_id, request_hash, candidate_hash, release_authorization_hash, issued_at, expires_at, nonce)
     values (gen_random_uuid(), '$$||:'tenant_001'||$$'::uuid, '$$||:'site_001'||$$'::uuid, '$$||:'u_approver_1'||$$'::uuid, '$$||:'m_approver_1'||$$'::uuid, array['RELEASE_APPROVER'], 'aal1', 1, 'GRANT_WARNING_EXCEPTION', 'RELEASE_CANDIDATE', 'RELEASE-CANDIDATE-0002', repeat('c',64), null, null, clock_timestamp(), clock_timestamp()+interval '5 minutes', gen_random_uuid()::text)$$,
  '23514', null, 'GRANT_WARNING_EXCEPTION with a null candidate hash is rejected by the shape CHECK'
);

-- ===========================================================================
-- Group F — coexistence
-- ===========================================================================
select is(
  (select count(*) from public.machine_profile_attestation where tenant_id = :'tenant_002'),
  1::bigint, 'tenant 002 attestation coexists without source changes'
);

-- ===========================================================================
-- Group G — same-tenant, cross-organization RLS denial: approver_1 is a
--            tenant-001 member but holds no grant for org_x/site_x1.
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_site_orgx from public.monolith_site where id = :'site_x1' \gset
reset role;
select is(:x_site_orgx::bigint, 0::bigint, 'RLS: same-tenant membership without the organization grant cannot read an org-X site');

select * from finish();
rollback;
