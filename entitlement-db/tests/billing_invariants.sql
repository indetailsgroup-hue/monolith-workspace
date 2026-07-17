-- pgTAP billing invariants — MONOLITH Entitlement DB (Phase 2, SSOT v0.3.2)
-- Covers: 2.1 billing_apply_subscription (service-only, idempotent upsert, unknown plan)
--         2.2 billing_reset_usage + grace 7 วัน / fallback free (effective_plan)
--         2.3 set_active_org + custom_access_token_hook (org_id claim)
-- Run: psql -tA -v ON_ERROR_STOP=1 -f entitlement-db/tests/billing_invariants.sql
-- ทุก assertion รันใน transaction เดียว แล้ว rollback

begin;
create extension if not exists pgtap;
select plan(18);

-- ---------- fixtures (service context; rolled back) ----------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'u1@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'u2@test.local', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'u3@test.local', now(), now())
on conflict (id) do nothing;

insert into public.profiles(id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'User A'),
  ('00000000-0000-0000-0000-0000000000a2', 'User B'),
  ('00000000-0000-0000-0000-0000000000a3', 'User C (no org)')
on conflict do nothing;

insert into public.organizations(id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A', 'org-a'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B', 'org-b')
on conflict do nothing;

insert into public.memberships(org_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a2', 'owner')
on conflict do nothing;

-- =====================================================================
-- 2.1 billing_apply_subscription
-- =====================================================================

-- 1: service-only guard — authenticated caller is refused
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','plus','active', now(), now() + interval '30 days')$$,
  '42501', null, '2.1: billing_apply_subscription is service_role-only');

-- back to service context
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 2: apply creates the subscription
select lives_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','plus','active', now(), now() + interval '30 days',
      'stripe','cus_1','sub_1')$$,
  '2.1: apply creates a subscription');

-- 3: row landed with the right plan/status
select is(
  (select plan_code || '/' || status from public.subscriptions
    where org_id = '00000000-0000-0000-0000-00000000000a'),
  'plus/active', '2.1: subscription row = plus/active');

-- 4: effective_plan resolves the applied plan
select is(public.effective_plan('00000000-0000-0000-0000-00000000000a'),
  'plus', '2.1: effective_plan = plus');

-- 5: idempotent upsert — re-apply (provider retry) keeps a single row, updates in place
select lives_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','advance','active', now(), now() + interval '30 days')$$,
  '2.1: re-apply (retry/upgrade) upserts in place');
-- 6:
select is(
  (select count(*) from public.subscriptions where org_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint, '2.1: still exactly one subscription row per org');

-- 7: unknown plan → foreign_key_violation (23503)
select throws_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','platinum','active', now(), now())$$,
  '23503', null, '2.1: unknown plan_code is rejected');

-- =====================================================================
-- 2.2 grace 7 วัน / fallback free + billing_reset_usage
-- =====================================================================

-- 8: past_due INSIDE the 7-day grace keeps the plan
select lives_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','advance','past_due',
      now() - interval '33 days', now() - interval '3 days')$$,
  '2.2: apply past_due within grace');
-- 9:
select is(public.effective_plan('00000000-0000-0000-0000-00000000000a'),
  'advance', '2.2: past_due within 7-day grace keeps the plan');

-- 10: past_due BEYOND grace falls back to free
select lives_ok(
  $$select public.billing_apply_subscription(
      '00000000-0000-0000-0000-00000000000a','advance','past_due',
      now() - interval '38 days', now() - interval '8 days')$$,
  '2.2: apply past_due beyond grace');
-- 11:
select is(public.effective_plan('00000000-0000-0000-0000-00000000000a'),
  'free', '2.2: past_due beyond grace falls back to free');

-- 12: canceled falls back to free immediately
select public.billing_apply_subscription(
  '00000000-0000-0000-0000-00000000000a','advance','canceled', now(), now());
select is(public.effective_plan('00000000-0000-0000-0000-00000000000a'),
  'free', '2.2: canceled falls back to free');

-- 13: reset guard — authenticated caller is refused
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.billing_reset_usage('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, '2.2: billing_reset_usage is service_role-only');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 14: reset clears exactly the current-period counters
insert into public.usage_counters(org_id, feature_key, period, used_value) values
  ('00000000-0000-0000-0000-00000000000a', 'ai.design_assist', to_char(now(),'YYYY-MM'), 4),
  ('00000000-0000-0000-0000-00000000000a', 'ai.design_assist', '2020-01', 9);
select is(public.billing_reset_usage('00000000-0000-0000-0000-00000000000a'),
  1, '2.2: reset deletes only the current-period counter row');
-- 15: historical periods are retained (audit/backfill)
select is(
  (select count(*) from public.usage_counters
    where org_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint, '2.2: historical period rows retained after reset');

-- =====================================================================
-- 2.3 set_active_org + custom_access_token_hook
-- =====================================================================

-- 16: set_active_org rejects a non-member (u1 → Org B)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.set_active_org('00000000-0000-0000-0000-00000000000b')$$,
  '42501', null, '2.3: set_active_org rejects non-member');
-- member path: u1 selects Org A
select public.set_active_org('00000000-0000-0000-0000-00000000000a');
reset role;

-- 17: hook injects org_id — active_org wins for u1
select is(
  (public.custom_access_token_hook(
     jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a1', 'claims', '{}'::jsonb)
   )->'claims'->>'org_id'),
  '00000000-0000-0000-0000-00000000000a', '2.3: hook injects active_org_id claim');

-- 18: hook falls back to first membership (u2 never selected) and stays silent for org-less users (u3)
select ok(
  (public.custom_access_token_hook(
     jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a2', 'claims', '{}'::jsonb)
   )->'claims'->>'org_id') = '00000000-0000-0000-0000-00000000000b'
  and
  (public.custom_access_token_hook(
     jsonb_build_object('user_id', '00000000-0000-0000-0000-0000000000a3', 'claims', '{}'::jsonb)
   )->'claims'->>'org_id') is null,
  '2.3: hook falls back to first membership; no claim for org-less users');

reset role;
select * from finish();
rollback;
