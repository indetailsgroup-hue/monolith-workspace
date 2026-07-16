-- pgTAP DB-level invariants — MONOLITH Entitlement DB (separate project, ADR-034)
-- Phase 1.3: pgTAP conversion of tests-negative.sql (Correctness Properties 1–5, Req 9)
--   + structural invariants (RLS coverage, resolver functions, quota triggers, seed completeness)
-- Run: psql -tA -v ON_ERROR_STOP=1 -f entitlement-db/tests/entitlement_invariants.sql
-- ทุก assertion รันใน transaction เดียว แล้ว rollback (ไม่ทิ้ง state) — pattern เดียวกับ
-- supabase/tests/workflow_db_invariants.sql ของ DB หลัก
--
-- NOTE (P2 atomicity): concurrency variant of Property 2 (two sessions racing consume/insert)
-- needs two connections and cannot run inside one pgTAP transaction — tracked as a follow-up
-- harness, per the note at the tail of tests-negative.sql.

begin;
create extension if not exists pgtap;
select plan(36);

-- ---------- fixtures (as postgres; rolled back) ----------
-- [v0.3.1] membership bootstrap runs as service role in the real flow (org-creation
-- RPC/Edge Function): a bare insert trips trg_seat_quota -> feature_limit ->
-- assert_org_access, which is fail-closed for non-members.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'u1@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'u2@test.local', now(), now())
on conflict (id) do nothing;

insert into public.profiles(id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'User A'),
  ('00000000-0000-0000-0000-0000000000a2', 'User B')
on conflict do nothing;

insert into public.organizations(id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B', 'org-b')
on conflict do nothing;

insert into public.memberships(org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2', 'owner')
on conflict do nothing;

-- Org A = free (no subscription -> fallback), Org B = advance (active)
insert into public.subscriptions(org_id, plan_code, status) values
  ('00000000-0000-0000-0000-00000000000b', 'advance', 'active')
on conflict do nothing;

-- =====================================================================
-- Structural invariants (Req 1 RLS fail-closed / D-2 seed completeness)
-- =====================================================================

-- 1–11: RLS enabled on all 11 tables (Req 1.1)
select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),         'RLS enabled: organizations');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),              'RLS enabled: profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass),           'RLS enabled: memberships');
select ok((select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass),         'RLS enabled: subscriptions');
select ok((select relrowsecurity from pg_class where oid = 'public.entitlement_overrides'::regclass), 'RLS enabled: entitlement_overrides');
select ok((select relrowsecurity from pg_class where oid = 'public.usage_counters'::regclass),        'RLS enabled: usage_counters');
select ok((select relrowsecurity from pg_class where oid = 'public.machine_profiles'::regclass),      'RLS enabled: machine_profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.projects'::regclass),              'RLS enabled: projects');
select ok((select relrowsecurity from pg_class where oid = 'public.features'::regclass),              'RLS enabled: features');
select ok((select relrowsecurity from pg_class where oid = 'public.plans'::regclass),                 'RLS enabled: plans');
select ok((select relrowsecurity from pg_class where oid = 'public.plan_entitlements'::regclass),     'RLS enabled: plan_entitlements');

-- 12: all 9 resolver/guard functions present
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('current_org','is_member','assert_org_access','effective_plan','has_feature',
       'feature_limit','can_consume','consume','assert_feature')),
  9::bigint, 'all 9 resolver functions exist');

-- 13: all 3 stock-quota triggers present (Req 3.3)
select is(
  (select count(*) from pg_trigger
    where tgname in ('trg_project_quota','trg_machine_quota','trg_seat_quota') and not tgisinternal),
  3::bigint, 'all 3 stock-quota triggers exist');

-- 14–16: seed counts — 4 plans · 53 features · 212 mapping rows [F3]
select is((select count(*) from public.plans),             4::bigint,   'seed: 4 plans');
select is((select count(*) from public.features),          53::bigint,  'seed: 53 features');
select is((select count(*) from public.plan_entitlements), 212::bigint, 'seed: 212 plan_entitlement rows (53x4)');

-- 17: P5 seed completeness — no (plan x feature) hole (D-2 default-deny protection)
select is(
  (select count(*) from public.plans p cross join public.features f
    left join public.plan_entitlements pe on pe.plan_code = p.code and pe.feature_key = f.key
    where pe.plan_code is null),
  0::bigint, 'P5: matrix complete — every (plan x feature) cell seeded');

-- 18–19: honest status split [F4] — implemented 34 · roadmap 19
select is((select count(*) from public.features where status = 'implemented'), 34::bigint, 'status: implemented = 34');
select is((select count(*) from public.features where status = 'roadmap'),     19::bigint, 'status: roadmap = 19');

-- =====================================================================
-- Behavior properties (converted from tests-negative.sql)
-- =====================================================================

-- ---- as u1 (Org A member, authenticated) ----
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);

-- 20: P1.1 cross-org SELECT isolation
select is((select count(*) from public.organizations where slug = 'org-b'),
  0::bigint, 'P1.1: user A cannot see org B through RLS');

-- 21: P1.2 cross-org consume -> org_access_denied (insufficient_privilege 42501)
select throws_ok(
  $$select public.consume('00000000-0000-0000-0000-00000000000b','ai.design_assist',1)$$,
  '42501', null, 'P1.2: cross-org consume raises org_access_denied');

-- 22: P1.3 cross-org has_feature -> org_access_denied
select throws_ok(
  $$select public.has_feature('00000000-0000-0000-0000-00000000000b','export.p2p_native')$$,
  '42501', null, 'P1.3: cross-org has_feature raises org_access_denied');

-- 23: P4.1 fallback free — org without subscription gets free-tier boolean
select ok(public.has_feature('00000000-0000-0000-0000-00000000000a','export.gcode'),
  'P4.1: no-subscription org resolves free-tier feature = true');

-- 24: P4.2 free must NOT unlock advance-only feature
select ok(not public.has_feature('00000000-0000-0000-0000-00000000000a','export.p2p_native'),
  'P4.2: free does not unlock advance-only feature');

-- 25: P4.3 free projects limit = 3
select is(public.feature_limit('00000000-0000-0000-0000-00000000000a','platform.projects'),
  3::bigint, 'P4.3: free platform.projects limit = 3');

-- 26–28: P2 stock quota — first 3 inserts pass...
select lives_ok(
  $$insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p1')$$,
  'P2: insert project 1/3 within quota');
select lives_ok(
  $$insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p2')$$,
  'P2: insert project 2/3 within quota');
select lives_ok(
  $$insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p3')$$,
  'P2: insert project 3/3 within quota');

-- 29: ...4th insert blocked by trigger (check_violation 23514)
select throws_ok(
  $$insert into public.projects(org_id, name) values ('00000000-0000-0000-0000-00000000000a','p4')$$,
  '23514', null, 'P2.1: 4th project blocked by stock-quota trigger');

-- ---- as u2 (Org B member = advance) ----
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

-- 30: P3.1 roadmap hard-block — advance maps cam.kerf_bending=true but status=roadmap
select ok(not public.has_feature('00000000-0000-0000-0000-00000000000b','cam.kerf_bending'),
  'P3.1: roadmap feature cannot be unlocked by plan [F2]');

-- 31: P3.2 roadmap metered -> limit 0
select is(public.feature_limit('00000000-0000-0000-0000-00000000000b','ai.design_assist'),
  0::bigint, 'P3.2: roadmap metered feature limit = 0');

-- beta override written as service context (postgres bypasses RLS; rolled back)
reset role;
insert into public.entitlement_overrides(org_id, feature_key, bool_value, reason)
values ('00000000-0000-0000-0000-00000000000b','cam.kerf_bending', true, 'beta')
on conflict (org_id, feature_key) do update set bool_value = true;
select set_config('role', 'authenticated', true);

-- 32: P3.3 beta override is the one door that unlocks roadmap (Req 6.3)
select ok(public.has_feature('00000000-0000-0000-0000-00000000000b','cam.kerf_bending'),
  'P3.3: beta override unlocks roadmap feature');

-- ---- as anon (pricing page scope, Req 8) ----
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('role', 'anon', true);

-- 33: P1b enterprise (is_public=false) invisible to anon
select is((select count(*) from public.plans where code = 'enterprise'),
  0::bigint, 'P1b: anon cannot see non-public enterprise plan');

-- 34: anon sees exactly the 3 public plans
select is((select count(*) from public.plans),
  3::bigint, 'P1b: anon sees exactly 3 public plans');

-- 35: anon sees no plan_entitlements rows for non-public plans
select is(
  (select count(*) from public.plan_entitlements pe
    where pe.plan_code not in (select code from public.plans)),
  0::bigint, 'P1b: anon entitlement rows only for public plans');

-- ---- seat quota with the [L10 v0.3.1] floor (as service role) ----
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 36: Org A (free: seats=1, floored bootstrap already used by owner) — a second
--     membership must be blocked by trg_seat_quota (proves the floor did not
--     disable enforcement, it only allowed the owner seat)
select throws_ok(
  $$insert into public.memberships(org_id, user_id, role)
    values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','member')$$,
  '23514', null, 'L10: second seat on free (limit 1) blocked by seat-quota trigger');

reset role;
select * from finish();
rollback;
