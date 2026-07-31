-- pgTAP DB-level invariants — Repair Intelligence Phase 0 (Task 4)
-- Feature: canonical tenant -> organization -> site scope (migration 0189).
--
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA \
--        -v ON_ERROR_STOP=1 -f supabase/tests/repair_phase0_organization.sql
--
-- The suite provisions two tenants, two organizations in tenant 001, one
-- organization in tenant 002, sites and memberships, then proves that the
-- organization is the normalized parent of site, the verified action context
-- pins organization_id, same-tenant cross-organization access is denied, and
-- the service role can never create human authority. Everything ROLLS BACK.

\set ON_ERROR_STOP on

\set tenant_001   11111111-1111-1111-1111-111111111111
\set tenant_002   22222222-2222-2222-2222-222222222222
\set org_a        0a111111-1111-1111-1111-11111111110a
\set org_b        0b111111-1111-1111-1111-11111111110b
\set org_c        0c222222-2222-2222-2222-22222222220c
\set site_a1      1a111111-1111-1111-1111-1111111111a1
\set site_b1      1b111111-1111-1111-1111-1111111111b1
\set site_c1      2a222222-2222-2222-2222-2222222222a2
\set u_member_a   d1111111-1111-1111-1111-1111111111d1
\set u_member_b   a1111111-1111-1111-1111-1111111111a1
\set u_member_c   d2222222-2222-2222-2222-2222222222d2
\set m_member_a   e1111111-1111-1111-1111-1111111111d1
\set m_member_b   e1111111-1111-1111-1111-1111111111a1
\set m_member_c   e2222222-2222-2222-2222-2222222222d2

begin;
create extension if not exists pgtap;
select plan(21);

-- ---------------------------------------------------------------------------
-- 1-5: schema shape — organization table, normalized parent, pinned context
-- ---------------------------------------------------------------------------
select has_table('public', 'monolith_organization', 'organization table exists');
select col_not_null('public', 'monolith_site', 'organization_id', 'every site has an organization');
select col_not_null('public', 'verified_action_context', 'organization_id', 'action context pins organization');
select has_table('public', 'monolith_membership_organization', 'membership organization grants exist');
select ok(
  (select relrowsecurity from pg_class
   where relname = 'monolith_organization' and relnamespace = 'public'::regnamespace),
  'organization RLS enabled'
);

-- ---------------------------------------------------------------------------
-- Fixture (superuser; RLS bypassed for setup only)
-- ---------------------------------------------------------------------------
insert into auth.users (id) values
  (:'u_member_a'), (:'u_member_b'), (:'u_member_c');

insert into public.monolith_tenant (id, slug, display_name, status) values
  (:'tenant_001', 'daph', 'Daph (fixture tenant 001)', 'ACTIVE'),
  (:'tenant_002', 'tenant-002', 'Coexistence tenant 002', 'ACTIVE');

insert into public.monolith_organization (id, tenant_id, slug, display_name, legal_name, status) values
  (:'org_a', :'tenant_001', 'org-a', 'Organization A', 'Organization A Co., Ltd.', 'ACTIVE'),
  (:'org_b', :'tenant_001', 'org-b', 'Organization B', 'Organization B Co., Ltd.', 'ACTIVE'),
  (:'org_c', :'tenant_002', 'org-c', 'Organization C', 'Organization C Co., Ltd.', 'ACTIVE');

insert into public.monolith_site (id, tenant_id, organization_id, code, display_name, status) values
  (:'site_a1', :'tenant_001', :'org_a', 'BKK-HQ-01', 'Org A HQ', 'ACTIVE'),
  (:'site_b1', :'tenant_001', :'org_b', 'BKK-HQ-02', 'Org B HQ', 'ACTIVE'),
  (:'site_c1', :'tenant_002', :'org_c', 'T2-SITE-01', 'Tenant 002 site', 'ACTIVE');

insert into public.monolith_membership (id, tenant_id, user_id, version, status) values
  (:'m_member_a', :'tenant_001', :'u_member_a', 1, 'ACTIVE'),
  (:'m_member_b', :'tenant_001', :'u_member_b', 1, 'ACTIVE'),
  (:'m_member_c', :'tenant_002', :'u_member_c', 1, 'ACTIVE');

insert into public.monolith_membership_role (tenant_id, membership_id, role) values
  (:'tenant_001', :'m_member_a', 'DESIGNER'),
  (:'tenant_001', :'m_member_b', 'DESIGNER'),
  (:'tenant_002', :'m_member_c', 'DESIGNER');

-- member_a: site grant on A1 AND B1, but organization grant on A only —
-- proves the organization grant is load-bearing, not derivable from site.
insert into public.monolith_membership_site (tenant_id, membership_id, site_id) values
  (:'tenant_001', :'m_member_a', :'site_a1'),
  (:'tenant_001', :'m_member_a', :'site_b1'),
  (:'tenant_001', :'m_member_b', :'site_b1'),
  (:'tenant_002', :'m_member_c', :'site_c1');

insert into public.monolith_membership_organization (tenant_id, membership_id, organization_id) values
  (:'tenant_001', :'m_member_a', :'org_a'),
  (:'tenant_001', :'m_member_b', :'org_b'),
  (:'tenant_002', :'m_member_c', :'org_c');

-- ---------------------------------------------------------------------------
-- 6-7: client policy posture on the two new tables
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename in ('monolith_organization', 'monolith_membership_organization')
     and cmd <> 'SELECT'),
  0::bigint, 'no non-SELECT client policy on organization tables'
);
select is(
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename in ('monolith_organization', 'monolith_membership_organization')
     and coalesce(qual, '') = 'true'),
  0::bigint, 'no organization table uses a using(true) policy'
);

-- ---------------------------------------------------------------------------
-- 8: tenant-001 member cannot read tenant-002 organizations
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_a', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_orgs_002 from public.monolith_organization where tenant_id = :'tenant_002' \gset
reset role;
select is(:x_orgs_002::bigint, 0::bigint, 'RLS: a tenant-001 member cannot read tenant-002 organizations');

-- ---------------------------------------------------------------------------
-- 9: organization-A membership cannot read organization-B sites (same tenant)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_a', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_sites_b from public.monolith_site where id = :'site_b1' \gset
reset role;
select is(:x_sites_b::bigint, 0::bigint, 'RLS: organization-A membership cannot read organization-B sites in the same tenant');

-- ---------------------------------------------------------------------------
-- 10: organization-A membership cannot create an action context for an
--     organization-B site, even with a site grant (org grant is load-bearing)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_a', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('FREEZE', '11111111-1111-1111-1111-111111111111', '1b111111-1111-1111-1111-1111111111b1', 'WORKING_REVISION', 'WR-ORG-B-0001', repeat('c', 64))$$,
  'P0001', 'AUTH_SCOPE_DENIED',
  'organization-A membership cannot create an action context for an organization-B site'
);

-- ---------------------------------------------------------------------------
-- 11: service role cannot create human authority
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('FREEZE', '11111111-1111-1111-1111-111111111111', '1a111111-1111-1111-1111-1111111111a1', 'WORKING_REVISION', 'WR-ORG-A-0001', repeat('c', 64))$$,
  '42501', null, 'service role cannot create human authority'
);

-- ---------------------------------------------------------------------------
-- 12: a valid tenant/organization/site/member grant creates an action context
--     whose organization_id equals the site organization
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_b', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_b1', 'WORKING_REVISION', 'WR-ORG-B-0002', repeat('c', 64)) as ctx_b_id \gset
select is(
  (select organization_id from public.verified_action_context where id = :'ctx_b_id'),
  :'org_b'::uuid,
  'valid grant creates an action context pinned to the site organization'
);

-- ---------------------------------------------------------------------------
-- 13: changing membership version invalidates an unconsumed context
-- ---------------------------------------------------------------------------
update public.monolith_membership
  set version = version + 1
  where tenant_id = :'tenant_001' and id = :'m_member_b';
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'ctx_b_id' || $$'::uuid, 'FREEZE')$$,
  'P0001', 'AUTH_ACTION_CONTEXT_INVALID',
  'changing membership version invalidates an unconsumed context'
);

-- ---------------------------------------------------------------------------
-- 14: an ACTIVE organization/site context still consumes successfully
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_b', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_b1', 'WORKING_REVISION', 'WR-ORG-B-ACTIVE-CONSUME', repeat('c', 64)) as ctx_active_consume_id \gset
select lives_ok(
  $$select public.consume_verified_action_context('$$ || :'ctx_active_consume_id' || $$'::uuid, 'FREEZE')$$,
  'an action context still consumes while its organization and site remain ACTIVE'
);

-- ---------------------------------------------------------------------------
-- 15: site deactivation revokes an already-minted context at consume time
-- ---------------------------------------------------------------------------
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_b1', 'WORKING_REVISION', 'WR-ORG-B-SITE-RECHECK', repeat('c', 64)) as ctx_site_recheck_id \gset
update public.monolith_site set status = 'INACTIVE'
  where tenant_id = :'tenant_001' and id = :'site_b1';
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'ctx_site_recheck_id' || $$'::uuid, 'FREEZE')$$,
  'P0001', 'AUTH_SCOPE_DENIED',
  'site deactivation revokes an already-minted action context at consume time'
);
update public.monolith_site set status = 'ACTIVE'
  where tenant_id = :'tenant_001' and id = :'site_b1';

-- Mint while both scopes are active; assertion 21 consumes only after the
-- organization is deactivated by assertion 20's setup.
select public.create_verified_action_context('FREEZE', :'tenant_001', :'site_b1', 'WORKING_REVISION', 'WR-ORG-B-ORG-RECHECK', repeat('c', 64)) as ctx_org_recheck_id \gset

-- ---------------------------------------------------------------------------
-- 16: a site row with a tenant-mismatched organization foreign key is rejected
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.monolith_site (id, tenant_id, organization_id, code, display_name, status)
    values ('3c333333-3333-3333-3333-3333333333c3', '11111111-1111-1111-1111-111111111111', '0c222222-2222-2222-2222-22222222220c', 'X-BAD-01', 'Cross-tenant org site', 'ACTIVE')$$,
  '23503', null,
  'a site row with a tenant-mismatched organization foreign key is rejected'
);

-- ---------------------------------------------------------------------------
-- 17-18: site-scoped SAFETY table (release_content_revocation, migration 0186)
--        obeys organization scope after 0189 — cross-org read denied, own-org
--        read allowed (a deny-all helper would fail assertion 18).
-- ---------------------------------------------------------------------------
-- A BLOCK deny-log row bound to site_b1 (organization B). release_revision_id is
-- nullable, so no full release chain is needed.
insert into public.release_content_revocation
  (id, tenant_id, site_id, content_hash, release_revision_id, action, sequence, actor_user_id, occurred_at)
values
  ('c0000000-0000-0000-0000-0000000000c1', :'tenant_001', :'site_b1',
   repeat('a', 64), null, 'BLOCK', 1, :'u_member_b', timezone('utc', now()));

-- member_a holds a site grant to site_b1 but NO organization-B grant, so the
-- organization boundary must hide organization-B's safety row.
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_a', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_rcr_a from public.release_content_revocation where site_id = :'site_b1' \gset
reset role;
select is(:x_rcr_a::bigint, 0::bigint,
  'RLS: organization-A membership cannot read an organization-B content-revocation row');

-- member_b holds the organization-B grant and must still see its own row —
-- proves the policy is genuinely site-scoped, not a deny-all.
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_b', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
set local role authenticated;
select count(*)::int as x_rcr_b from public.release_content_revocation where site_id = :'site_b1' \gset
reset role;
select is(:x_rcr_b::bigint, 1::bigint,
  'RLS: organization-B membership still reads its own content-revocation row (not deny-all)');

-- ---------------------------------------------------------------------------
-- 19: content_unblock_grant (migration 0188) SELECT policy is site-scoped via
--     the same organization/site helper, not tenant-only.
-- ---------------------------------------------------------------------------
select ok(
  (select position('fn_monolith_member_scope_sites' in coalesce(qual, '')) > 0
   from pg_policies
   where schemaname = 'public' and tablename = 'content_unblock_grant' and policyname = 'content_unblock_grant_sel'),
  'content_unblock_grant SELECT policy is scoped by the organization/site helper'
);

-- ---------------------------------------------------------------------------
-- 20: organization status is load-bearing — an INACTIVE organization
--     authorizes no new action context, even for a fully-granted member.
-- ---------------------------------------------------------------------------
update public.monolith_organization set status = 'INACTIVE'
  where tenant_id = :'tenant_001' and id = :'org_b';
select set_config('request.jwt.claims', json_build_object('sub', :'u_member_b', 'role', 'authenticated', 'aal', 'aal1')::text, true) as _claims \gset
select throws_ok(
  $$select public.create_verified_action_context('FREEZE', '11111111-1111-1111-1111-111111111111', '1b111111-1111-1111-1111-1111111111b1', 'WORKING_REVISION', 'WR-ORG-B-INACTIVE', repeat('c', 64))$$,
  'P0001', 'AUTH_SCOPE_DENIED',
  'an INACTIVE organization authorizes no new action context'
);

-- ---------------------------------------------------------------------------
-- 21: organization deactivation revokes an already-minted context at consume
--     time; creation-time enforcement alone is insufficient.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.consume_verified_action_context('$$ || :'ctx_org_recheck_id' || $$'::uuid, 'FREEZE')$$,
  'P0001', 'AUTH_SCOPE_DENIED',
  'organization deactivation revokes an already-minted action context at consume time'
);

select * from finish();
rollback;
