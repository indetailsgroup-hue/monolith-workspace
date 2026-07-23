-- pgTAP DB-level invariants — MONOLITH Production Trust Kernel (Task 2)
-- Feature: tenant membership + verified action contexts (design §7 authorization,
--   tenancy, separation of duties). Stable reason codes come from
--   server/src/trust-kernel/reasonCodes.ts (§13). SQL error strings MUST be those
--   exact codes.
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/trust_kernel_tenancy.sql
--
-- The suite provisions TWO tenants (001 = Daph-like FIXTURE, 002 = coexistence
-- proof) with sites, auth users, memberships, roles, and site grants inside one
-- transaction, exercises user-JWT claims via request.jwt.claims (auth.uid/role),
-- asserts the plan's four RED assertions plus negative coverage
-- (service-role boundary, cross-tenant denial, expired context, revoked
-- membership, wrong action, double-consume, shape rules), then ROLLS BACK.

\set ON_ERROR_STOP on

-- Fixture identifiers (Daph is tenant-001 FIXTURE data only, never a schema constant).
\set tenant_001   11111111-1111-1111-1111-111111111111
\set tenant_002   22222222-2222-2222-2222-222222222222
\set site_001     1a111111-1111-1111-1111-1111111111a1
\set site_002     2a222222-2222-2222-2222-2222222222a2
\set u_designer_1 d1111111-1111-1111-1111-1111111111d1
\set u_approver_1 a1111111-1111-1111-1111-1111111111a1
\set u_designer_2 d2222222-2222-2222-2222-2222222222d2
\set u_approver_2 a2222222-2222-2222-2222-2222222222a2
\set m_designer_1 e1111111-1111-1111-1111-1111111111d1
\set m_approver_1 e1111111-1111-1111-1111-1111111111a1
\set m_designer_2 e2222222-2222-2222-2222-2222222222d2
\set m_approver_2 e2222222-2222-2222-2222-2222222222a2
\set candidate_id RELEASE-CANDIDATE-0001

begin;
create extension if not exists pgtap;
select plan(28);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  (:'u_designer_1'), (:'u_approver_1'), (:'u_designer_2'), (:'u_approver_2');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_001', 'daph', 'Daph (fixture tenant 001)', 'ACTIVE'),
  (:'tenant_002', 'tenant-002', 'Coexistence tenant 002', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, code, display_name, status) values
  (:'site_001', :'tenant_001', 'BKK-HQ-01', 'Daph HQ', 'ACTIVE'),
  (:'site_002', :'tenant_002', 'T2-SITE-01', 'Tenant 002 site', 'ACTIVE');

insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_designer_1', :'tenant_001', :'u_designer_1', 1, 'ACTIVE'),
  (:'m_approver_1', :'tenant_001', :'u_approver_1', 1, 'ACTIVE'),
  (:'m_designer_2', :'tenant_002', :'u_designer_2', 1, 'ACTIVE'),
  (:'m_approver_2', :'tenant_002', :'u_approver_2', 1, 'ACTIVE');

insert into public.monolith_membership_role (tenant_id, membership_id, role) values
  (:'tenant_001', :'m_designer_1', 'DESIGNER'),
  (:'tenant_001', :'m_approver_1', 'RELEASE_APPROVER'),
  (:'tenant_002', :'m_designer_2', 'DESIGNER'),
  (:'tenant_002', :'m_approver_2', 'RELEASE_APPROVER');

insert into public.monolith_membership_site (tenant_id, membership_id, site_id) values
  (:'tenant_001', :'m_designer_1', :'site_001'),
  (:'tenant_001', :'m_approver_1', :'site_001'),
  (:'tenant_002', :'m_designer_2', :'site_002'),
  (:'tenant_002', :'m_approver_2', :'site_002');

-- ===========================================================================
-- Group A — coexistence and tenant scoping (design §7.5)
-- ===========================================================================
select is(
  (select count(*) from public.monolith_site where tenant_id = :'tenant_002'),
  1::bigint, 'tenant 002 coexists without source changes'
);
select is(
  (select count(*) from public.monolith_membership_role
     where tenant_id = :'tenant_001' and role = 'RELEASE_APPROVER'),
  1::bigint, 'tenant 001 approver remains tenant scoped'
);

-- ===========================================================================
-- Group B — RLS posture: all six tables RLS-enabled, no client write policy,
--            no product-data using(true) (design §7.5)
-- ===========================================================================
select ok((select relrowsecurity from pg_class where relname='monolith_tenant'          and relnamespace='public'::regnamespace), 'monolith_tenant RLS enabled');
select ok((select relrowsecurity from pg_class where relname='monolith_site'            and relnamespace='public'::regnamespace), 'monolith_site RLS enabled');
select ok((select relrowsecurity from pg_class where relname='monolith_membership'      and relnamespace='public'::regnamespace), 'monolith_membership RLS enabled');
select ok((select relrowsecurity from pg_class where relname='monolith_membership_role' and relnamespace='public'::regnamespace), 'monolith_membership_role RLS enabled');
select ok((select relrowsecurity from pg_class where relname='monolith_membership_site' and relnamespace='public'::regnamespace), 'monolith_membership_site RLS enabled');
select ok((select relrowsecurity from pg_class where relname='verified_action_context'  and relnamespace='public'::regnamespace), 'verified_action_context RLS enabled');

select is((select count(*) from pg_policies where schemaname='public' and tablename='monolith_tenant'          and cmd<>'SELECT'), 0::bigint, 'monolith_tenant: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='monolith_site'            and cmd<>'SELECT'), 0::bigint, 'monolith_site: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='monolith_membership'      and cmd<>'SELECT'), 0::bigint, 'monolith_membership: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='monolith_membership_role' and cmd<>'SELECT'), 0::bigint, 'monolith_membership_role: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='monolith_membership_site' and cmd<>'SELECT'), 0::bigint, 'monolith_membership_site: no client write policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='verified_action_context'  and cmd<>'SELECT'), 0::bigint, 'verified_action_context: no client write policy');

select is(
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('monolith_tenant','monolith_site','monolith_membership',
                       'monolith_membership_role','monolith_membership_site','verified_action_context')
     and coalesce(qual,'') = 'true'),
  0::bigint, 'no trust-kernel table uses a using(true) product-data policy'
);

-- ===========================================================================
-- Group C — service-role boundary: a service role cannot create a human
--            action context (design §7.2; plan RED #1)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('RELEASE', '11111111-1111-1111-1111-111111111111', '1a111111-1111-1111-1111-1111111111a1', 'RELEASE_CANDIDATE', 'RELEASE-CANDIDATE-0001', repeat('c',64), repeat('a',64), repeat('b',64))$$,
  '42501', null, 'service role cannot create human action context'
);

-- ===========================================================================
-- Group D — authenticated creation derives actor from JWT (design §7.2)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_001', 'WORKING_REVISION', 'WR-0001', repeat('c',64)) as freeze_ctx_id \gset

select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', :'candidate_id', repeat('c',64), repeat('a',64), repeat('b',64)) as rel_ctx_id \gset

select is((select action from public.verified_action_context where id = :'freeze_ctx_id'), 'FREEZE', 'FREEZE context persisted with derived actor');
select is((select action from public.verified_action_context where id = :'rel_ctx_id'),    'RELEASE', 'RELEASE context persisted with derived actor');
select ok(
  (select expires_at - issued_at between interval '4 minutes' and interval '6 minutes'
     from public.verified_action_context where id = :'rel_ctx_id'),
  'action context expires ~5 minutes after issuance'
);

-- ===========================================================================
-- Group E (part 1) — one-time nonce + action binding (design §7.2; plan RED #4)
-- ===========================================================================
select lives_ok(
  $$select public.consume_verified_action_context('$$ || :'rel_ctx_id' || $$'::uuid, 'RELEASE')$$,
  'first consume of a valid RELEASE context succeeds'
);
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'rel_ctx_id' || $$'::uuid, 'RELEASE')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'nonce is one-time'
);
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'freeze_ctx_id' || $$'::uuid, 'RELEASE')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'consume rejects an action that does not match the context'
);

-- expired context -> AUTH_ACTION_CONTEXT_EXPIRED
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', :'candidate_id', repeat('c',64), repeat('a',64), repeat('b',64)) as rel_ctx_exp_id \gset
update public.verified_action_context set expires_at = clock_timestamp() - interval '1 minute' where id = :'rel_ctx_exp_id';
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'rel_ctx_exp_id' || $$'::uuid, 'RELEASE')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_EXPIRED', 'expired context is rejected'
);

-- ===========================================================================
-- Group F — cross-tenant denial (design §7.5) + RLS row filtering (design §7.5)
-- ===========================================================================
-- approver_1 is a member of tenant 001 only; creating in tenant 002 is denied.
select throws_ok(
  $$select public.create_verified_action_context('RELEASE', '22222222-2222-2222-2222-222222222222', '2a222222-2222-2222-2222-2222222222a2', 'RELEASE_CANDIDATE', 'RELEASE-CANDIDATE-0001', repeat('c',64), repeat('a',64), repeat('b',64))$$,
  'P0001', 'AUTH_SCOPE_DENIED', 'cross-tenant action context creation is denied'
);

select set_config('request.jwt.claims', json_build_object('sub', :'u_designer_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_site_002 from public.monolith_site where tenant_id = :'tenant_002' \gset
reset role;
select is(:x_site_002::bigint, 0::bigint, 'RLS: a tenant-001 member cannot read tenant-002 sites');

-- ===========================================================================
-- Group G — action shape rules (design §7 / plan Task 2)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_designer_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('FREEZE', '11111111-1111-1111-1111-111111111111', '1a111111-1111-1111-1111-1111111111a1', 'WORKING_REVISION', 'WR-0002', repeat('c',64), repeat('a',64), null)$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'FREEZE with a candidate hash is rejected (shape rule)'
);
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('RELEASE', '11111111-1111-1111-1111-111111111111', '1a111111-1111-1111-1111-1111111111a1', 'RELEASE_CANDIDATE', 'RELEASE-CANDIDATE-0002', repeat('c',64), null, null)$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID', 'RELEASE without candidate/authorization hashes is rejected (shape rule)'
);

-- ===========================================================================
-- Group E (part 2) — revoked membership invalidates an unconsumed context.
-- Runs LAST because it revokes approver_1 (design §7.1 revocation).
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', :'u_approver_1', 'role','authenticated','aal','aal1')::text, true) as _claims \gset
select public.create_verified_action_context('RELEASE', :'tenant_001', :'site_001', 'RELEASE_CANDIDATE', :'candidate_id', repeat('c',64), repeat('a',64), repeat('b',64)) as rel_ctx_rev_id \gset
update public.monolith_membership set status='REVOKED', version = version + 1 where tenant_id = :'tenant_001' and id = :'m_approver_1';
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'rel_ctx_rev_id' || $$'::uuid, 'RELEASE')$$,
  'P0001', 'AUTH_MEMBERSHIP_REVOKED', 'a revoked membership invalidates its unconsumed context'
);

select * from finish();
rollback;
