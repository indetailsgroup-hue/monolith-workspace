-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- RLS enable + policies (11 tables) — depends on is_member() from 0002, hence functions-before-RLS
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3.1 = SSOT; security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4,
--    landing fix v0.3.1 [L10]) — DO NOT edit here; edit the spec SSOT then re-split.
-- Ordering note: RLS policies call is_member(), so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft's own run order).
-- =====================================================================

-- =====================================================================
-- 5. RLS (เหมือน v0.2 — 11 ตาราง รวม profiles)
-- =====================================================================
-- [L11 v0.3.1] explicit grants — อย่าพึ่ง default privileges ของ image
-- (migration-runner role อาจไม่ใช่เจ้าของ default acl): สิทธิ์กว้างระดับตาราง
-- แล้วให้ RLS fail-closed ด้านล่างเป็นตัวคุมแถวจริง (convention Supabase)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter table public.organizations         enable row level security;
alter table public.profiles              enable row level security;
alter table public.memberships           enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.entitlement_overrides enable row level security;
alter table public.usage_counters        enable row level security;
alter table public.machine_profiles      enable row level security;
alter table public.projects              enable row level security;
alter table public.features              enable row level security;
alter table public.plans                 enable row level security;
alter table public.plan_entitlements     enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_orgmates_read on public.profiles;
create policy profiles_orgmates_read on public.profiles
  for select using (
    exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select using (public.is_member(id));
drop policy if exists mem_read on public.memberships;
create policy mem_read on public.memberships for select using (public.is_member(org_id));
drop policy if exists sub_read on public.subscriptions;
create policy sub_read on public.subscriptions for select using (public.is_member(org_id));
drop policy if exists ovr_read on public.entitlement_overrides;
create policy ovr_read on public.entitlement_overrides for select using (public.is_member(org_id));
drop policy if exists usage_read on public.usage_counters;
create policy usage_read on public.usage_counters for select using (public.is_member(org_id));

drop policy if exists feat_read on public.features;
create policy feat_read on public.features for select to authenticated using (true);
drop policy if exists feat_read_anon on public.features;
create policy feat_read_anon on public.features for select to anon using (true);
drop policy if exists plan_read on public.plans;
create policy plan_read on public.plans for select to authenticated using (true);
drop policy if exists plan_read_anon on public.plans;
create policy plan_read_anon on public.plans for select to anon using (is_public);
drop policy if exists ple_read on public.plan_entitlements;
create policy ple_read on public.plan_entitlements for select to authenticated using (true);
drop policy if exists ple_read_anon on public.plan_entitlements;
create policy ple_read_anon on public.plan_entitlements
  for select to anon using (
    exists (select 1 from public.plans p where p.code = plan_code and p.is_public)
  );

drop policy if exists proj_all on public.projects;
create policy proj_all on public.projects
  for all using (public.is_member(org_id)) with check (public.is_member(org_id));
drop policy if exists machine_all on public.machine_profiles;
create policy machine_all on public.machine_profiles
  for all using (public.is_member(org_id)) with check (public.is_member(org_id));
