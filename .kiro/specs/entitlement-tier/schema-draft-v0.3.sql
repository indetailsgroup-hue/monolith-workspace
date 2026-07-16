-- =====================================================================
-- MONOLITH — Multi-Tier Entitlement Schema (Supabase / Postgres)
-- Design Proposal v0.3 · 2026-07-05
-- ต่อยอด v0.2 (security fixes S1–S4, L5–L9) — เพิ่มใน v0.3:
--   [F1] features.status ('implemented'|'roadmap') — ธงความพร้อมจริงของ capability
--   [F2] Roadmap hard-block ที่ resolver: plan ปลดของ roadmap ไม่ได้
--        (ปลดได้ทางเดียวคือ entitlement_overrides รายองค์กร = ช่อง beta program)
--   [F3] Seed ขยาย 42 → 53 features (เพิ่ม Trust/ToolWear/CO2/STEP/PDF/dialects/
--        clearance/multi-cabinet/optimizer_pro/engine_packs) = 212 entitlement rows
--   [F4] จัดสถานะซื่อตรงตามหลักฐานในโค้ด MONOLITH ปัจจุบัน:
--        implemented 34 · roadmap 19 (label ทั้งกลุ่ม, cloud storage, nest true-shape,
--        dogbone, kerf bending, six-side, seats, AI, ERP/API/SSO/self-host ฯลฯ)
-- กติกา: ห้ามขายของ roadmap — UI ต้องแสดง "coming soon" จาก features.status
-- v0.3.1 (2026-07-16, Phase-1 landing fix จากการรันจริงครั้งแรกบน CI):
--   [L10] enforce_seat_quota: floor limit ที่ 1 — เดิม platform.seats เป็น roadmap
--         → feature_limit คืน 0 → count>=0 จริงเสมอ = สร้าง membership แรก (owner)
--         ไม่ได้เลยทุกกรณี (org bootstrap ตาย) · org ต้องมี owner เสมอ; seats quota
--         คือเพดานที่นั่ง "เพิ่ม" — ค่า plan (free=1/plus=3/advance=10) ความหมายคงเดิม
--   [L11] explicit grants ต้นหมวด RLS — draft เดิมพึ่ง default privileges ของ
--         Supabase image ซึ่ง role ที่ apply migration ไม่ได้รับ → authenticated/anon
--         โดน permission denied ระดับตาราง · แก้ตาม convention: grant กว้างระดับ
--         ตารางแล้วให้ RLS (fail-closed ทั้ง 11 ตาราง) เป็นตัวคุมแถว
-- NOTE: design proposal — คำถาม C12 (org↔site) ยังเป็น owner decision ก่อน deploy
-- Run order: extensions → tenancy → billing/entitlement → domain →
--            functions → RLS → triggers → seed
-- =====================================================================

-- ---------- 0. extensions ----------
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TENANCY (เหมือน v0.2)
-- =====================================================================
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

do $$ begin
  create type public.member_role as enum ('owner','admin','member','viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.member_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);

-- =====================================================================
-- 2. BILLING / ENTITLEMENT CORE
-- =====================================================================
do $$ begin
  create type public.gate_kind as enum ('boolean','stock_quota','metered_quota','limit_param');
exception when duplicate_object then null; end $$;

-- [F1] สถานะความพร้อมของ capability
do $$ begin
  create type public.feature_status as enum ('implemented','roadmap');
exception when duplicate_object then null; end $$;

create table if not exists public.features (
  key         text primary key,
  name        text not null,
  category    text not null,
  kind        public.gate_kind not null,
  unit        text,
  status      public.feature_status not null default 'implemented',   -- [F1]
  created_at  timestamptz not null default now()
);

create table if not exists public.plans (
  code             text primary key,
  name             text not null,
  price_cents      integer not null default 0,
  currency         text not null default 'THB',
  billing_interval text not null default 'month',
  sort_order       integer not null default 0,
  is_public        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.plan_entitlements (
  plan_code    text not null references public.plans(code) on delete cascade,
  feature_key  text not null references public.features(key) on delete cascade,
  bool_value   boolean,
  limit_value  bigint,          -- null = unlimited (∞)
  primary key (plan_code, feature_key)
);

do $$ begin
  create type public.sub_status as enum ('trialing','active','past_due','canceled','paused');
exception when duplicate_object then null; end $$;

create table if not exists public.subscriptions (
  org_id               uuid primary key references public.organizations(id) on delete cascade,
  plan_code            text not null references public.plans(code),
  status               public.sub_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  provider             text,
  provider_customer_id text,
  provider_sub_id      text,
  updated_at           timestamptz not null default now()
);

create table if not exists public.entitlement_overrides (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  feature_key  text not null references public.features(key) on delete cascade,
  bool_value   boolean,
  limit_value  bigint,
  reason       text,            -- ใส่ 'beta' เมื่อใช้ปลดของ roadmap ให้ pilot org
  expires_at   timestamptz,
  primary key (org_id, feature_key)
);

create table if not exists public.usage_counters (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  feature_key  text not null references public.features(key) on delete cascade,
  period       text not null,
  used_value   bigint not null default 0,
  primary key (org_id, feature_key, period)
);

-- =====================================================================
-- 3. DOMAIN (เหมือน v0.2)
-- =====================================================================
create table if not exists public.machine_profiles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  export_family text not null,
  controller    text,
  config        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_machine_org on public.machine_profiles(org_id);

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  data         jsonb not null default '{}',
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_projects_org on public.projects(org_id);

-- =====================================================================
-- 4. RESOLVER FUNCTIONS
-- =====================================================================
create or replace function public.current_org()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'org_id','')::uuid,
    (select org_id from public.memberships
      where user_id = auth.uid()
      order by created_at asc, org_id asc
      limit 1)
  );
$$;

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.assert_org_access(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(),'') = 'service_role' then return; end if;
  if not public.is_member(p_org) then
    raise exception 'org_access_denied' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.effective_plan(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case
        when s.status in ('active','trialing') then s.plan_code
        when s.status = 'past_due'
         and coalesce(s.current_period_end, now()) + interval '7 days' > now()
          then s.plan_code
        else 'free'
      end
     from public.subscriptions s where s.org_id = p_org),
    'free'
  );
$$;

-- [F2] boolean: roadmap → plan ไม่มีผล ปลดได้เฉพาะ override (beta)
create or replace function public.has_feature(p_org uuid, p_feature text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_status public.feature_status; v_override boolean; v_found boolean;
begin
  perform public.assert_org_access(p_org);

  select status into v_status from public.features where key = p_feature;
  if v_status is null then return false; end if;                 -- unknown feature = deny

  select o.bool_value, true into v_override, v_found
    from public.entitlement_overrides o
   where o.org_id = p_org and o.feature_key = p_feature
     and (o.expires_at is null or o.expires_at > now());
  if coalesce(v_found,false) then
    return coalesce(v_override,false);                           -- override ชนะเสมอ (รวม beta)
  end if;

  if v_status = 'roadmap' then return false; end if;             -- [F2] plan ปลด roadmap ไม่ได้

  return coalesce(
    (select pe.bool_value
       from public.plan_entitlements pe
      where pe.plan_code = public.effective_plan(p_org)
        and pe.feature_key = p_feature),
    false
  );
end;
$$;

-- [F2] limit: roadmap → 0 เว้นแต่มี override (beta)
create or replace function public.feature_limit(p_org uuid, p_feature text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v_status public.feature_status; v_override record; v_plan_limit bigint; v_found boolean;
begin
  perform public.assert_org_access(p_org);

  select status into v_status from public.features where key = p_feature;
  if v_status is null then return 0; end if;

  select * into v_override from public.entitlement_overrides o
    where o.org_id = p_org and o.feature_key = p_feature
      and (o.expires_at is null or o.expires_at > now());
  if found then
    return coalesce(v_override.limit_value, -1);
  end if;

  if v_status = 'roadmap' then return 0; end if;                 -- [F2]

  select pe.limit_value, true into v_plan_limit, v_found
    from public.plan_entitlements pe
   where pe.plan_code = public.effective_plan(p_org)
     and pe.feature_key = p_feature;
  if not coalesce(v_found,false) then return 0; end if;
  return coalesce(v_plan_limit, -1);
end;
$$;

create or replace function public.can_consume(p_org uuid, p_feature text, p_amount bigint default 1)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_limit bigint; v_used bigint; v_period text := to_char(now(),'YYYY-MM');
begin
  perform public.assert_org_access(p_org);
  v_limit := public.feature_limit(p_org, p_feature);
  if v_limit = -1 then return true; end if;
  if v_limit = 0  then return false; end if;
  select coalesce(used_value,0) into v_used from public.usage_counters
    where org_id = p_org and feature_key = p_feature and period = v_period;
  return coalesce(v_used,0) + p_amount <= v_limit;
end;
$$;

create or replace function public.consume(p_org uuid, p_feature text, p_amount bigint default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_period text := to_char(now(),'YYYY-MM');
begin
  perform public.assert_org_access(p_org);
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || '|' || p_feature, 0));
  if not public.can_consume(p_org, p_feature, p_amount) then
    raise exception 'quota_exceeded: % on %', p_feature, p_org using errcode = 'check_violation';
  end if;
  insert into public.usage_counters(org_id, feature_key, period, used_value)
  values (p_org, p_feature, v_period, p_amount)
  on conflict (org_id, feature_key, period)
  do update set used_value = public.usage_counters.used_value + excluded.used_value;
end;
$$;

create or replace function public.assert_feature(p_org uuid, p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_kind public.gate_kind; v_status public.feature_status;
begin
  select kind, status into v_kind, v_status from public.features where key = p_feature;
  if v_kind is null then
    raise exception 'unknown_feature: %', p_feature using errcode = 'undefined_object';
  end if;
  if v_kind <> 'boolean' then
    raise exception 'wrong_gate_kind: % is %, use feature_limit()/consume()', p_feature, v_kind
      using errcode = 'feature_not_supported';
  end if;
  if not public.has_feature(p_org, p_feature) then
    if v_status = 'roadmap' then
      raise exception 'feature_roadmap: % (coming soon)', p_feature
        using errcode = 'feature_not_supported';                 -- [F2] error แยก ให้ UI ขึ้น "coming soon"
    end if;
    raise exception 'not_entitled: %', p_feature using errcode = 'insufficient_privilege';
  end if;
end;
$$;

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

-- =====================================================================
-- 6. STOCK-QUOTA TRIGGERS (เหมือน v0.2 — atomic)
-- =====================================================================
create or replace function public.enforce_project_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|platform.projects', 0));
  v_limit := public.feature_limit(new.org_id, 'platform.projects');
  if v_limit = -1 then return new; end if;
  select count(*) into v_count from public.projects where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: platform.projects (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_project_quota on public.projects;
create trigger trg_project_quota before insert on public.projects
  for each row execute function public.enforce_project_quota();

create or replace function public.enforce_machine_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|machine.profiles', 0));
  v_limit := public.feature_limit(new.org_id, 'machine.profiles');
  if v_limit = -1 then return new; end if;
  select count(*) into v_count from public.machine_profiles where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: machine.profiles (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_machine_quota on public.machine_profiles;
create trigger trg_machine_quota before insert on public.machine_profiles
  for each row execute function public.enforce_machine_quota();

create or replace function public.enforce_seat_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text || '|platform.seats', 0));
  v_limit := public.feature_limit(new.org_id, 'platform.seats');
  if v_limit = -1 then return new; end if;
  -- [L10 v0.3.1] org ต้องมี owner เสมอ: roadmap/zero-limit ห้าม block membership แรก
  -- (ไม่งั้น org bootstrap ไม่ได้เลย) — floor ที่ 1; ค่า plan 1/3/10 ความหมายคงเดิม
  v_limit := greatest(v_limit, 1);
  select count(*) into v_count from public.memberships where org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'quota_exceeded: platform.seats (limit %)', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_seat_quota on public.memberships;
create trigger trg_seat_quota before insert on public.memberships
  for each row execute function public.enforce_seat_quota();

-- =====================================================================
-- 7. SEED — 4 plans · 53 features (status ตามหลักฐานโค้ดจริง) · 212 rows [F3][F4]
-- =====================================================================
insert into public.plans(code,name,price_cents,billing_interval,sort_order,is_public) values
  ('free','Free',0,'month',0,true),
  ('plus','Plus',59000,'month',1,true),
  ('advance','Advance',290000,'month',2,true),
  ('enterprise','Enterprise',0,'custom',3,false)
on conflict (code) do nothing;

insert into public.features(key,name,category,kind,unit,status) values
  -- Design (implemented — มีจริงใน MONOLITH: generator/compartment/clearance/snap)
  ('design.create_component','Create new component','design','boolean',null,'implemented'),
  ('design.cabinet_generator','Parametric Cabinet Generator','design','boolean',null,'implemented'),
  ('design.divide_cell','Divide frame/cell','design','boolean',null,'implemented'),
  ('design.door_drawer_builder','Door/drawer auto-builder','design','boolean',null,'implemented'),
  ('design.clearance_check','Collision & clearance check','design','boolean',null,'implemented'),
  ('design.multi_cabinet','Multi-cabinet snap layout','design','boolean',null,'implemented'),
  ('design.custom_hardware_lib','Custom hardware library (org)','design','boolean',null,'roadmap'),
  -- Fitting
  ('fitting.manual','Manual Fitting','fitting','boolean',null,'implemented'),
  ('fitting.auto','Auto Fitting','fitting','boolean',null,'implemented'),
  ('fitting.drawer_slide','Drawer slide','fitting','boolean',null,'implemented'),
  ('hardware.engine_packs','Hardware engine packs (AVENTOS/Box/Lamello/Ixconnect)','fitting','boolean',null,'roadmap'),
  -- Detailing
  ('edge.manual','Edge Banding Manual','detailing','boolean',null,'implemented'),
  ('edge.auto','Edge Banding Auto','detailing','boolean',null,'implemented'),
  -- BOM
  ('bom.basic','Basic BOM','bom','boolean',null,'implemented'),
  ('bom.advance','Advance BOM','bom','boolean',null,'implemented'),
  ('bom.export_xlsx','Export XLSX','bom','boolean',null,'implemented'),
  -- Label (ยังไม่พบระบบ label ในโค้ด → roadmap ทั้งกลุ่ม)
  ('label.basic','Label Basic','label','boolean',null,'roadmap'),
  ('label.advance','Label Advance (barcode/QR)','label','boolean',null,'roadmap'),
  ('label.no_watermark','No watermark','label','boolean',null,'roadmap'),
  -- Nesting (โค้ดมี FFDH rectangular; true-shape/offcut/SA-GA = design)
  ('nest.basic','Nesting Basic (rectangular FFDH)','nest','boolean',null,'implemented'),
  ('nest.advance','Nesting Advance (true-shape/NFP)','nest','boolean',null,'roadmap'),
  ('nest.max_sheets','Max nest sheets/job','nest','limit_param','sheets/job','implemented'),
  ('nest.offcut_inventory','Offcut inventory','nest','boolean',null,'roadmap'),
  ('nest.optimizer_pro','Nesting Optimizer Pro (SA/GA + cut sequence)','nest','boolean',null,'roadmap'),
  -- CAM / Export
  ('cam.dogbone','Dog Bone','cam','boolean',null,'roadmap'),
  ('cam.machine_origin','Machine Origin Setting','cam','boolean',null,'implemented'),
  ('cam.advance_machine','Advance Machine (tool table/feeds)','cam','boolean',null,'implemented'),
  ('cam.kerf_bending','Kerf bending / curved panels','cam','boolean',null,'roadmap'),
  ('cam.tool_wear','Tool Wear Intelligence','cam','boolean',null,'implemented'),
  ('export.gcode','G-code export','cam','boolean',null,'implemented'),
  ('export.dxf','DXF export','cam','boolean',null,'implemented'),
  ('export.p2p_native','P2P native export (Biesse CIX/Homag MPR/XXL)','cam','boolean',null,'implemented'),
  ('export.panel_saw','Panel saw cutting-list','cam','boolean',null,'implemented'),
  ('export.six_side_drill','Six-side drilling data','cam','boolean',null,'roadmap'),
  ('export.step','STEP 3D export','cam','boolean',null,'implemented'),
  ('export.pdf_report','PDF report export','cam','boolean',null,'implemented'),
  ('export.cutlist_dialects','Cut-list CSV dialects (HOMAG/BIESSE/SCM)','cam','boolean',null,'implemented'),
  ('machine.profiles','Machine profiles','cam','stock_quota','count','implemented'),
  -- Platform (cloud sync ยังไม่มีจริง — โค้ดเป็น localStorage/local-first)
  ('storage.cloud_enabled','Cloud storage enabled','platform','boolean',null,'roadmap'),
  ('storage.cloud_mb','Cloud storage','platform','stock_quota','MB','roadmap'),
  ('platform.projects','Projects','platform','stock_quota','count','implemented'),
  ('platform.cabinets_per_project','Cabinets per project','platform','limit_param','count','implemented'),
  ('platform.seats','Seats (multi-user org)','platform','stock_quota','count','roadmap'),
  ('platform.local_first','Offline / local-first','platform','boolean',null,'implemented'),
  ('report.co2','CO2 / sustainability report','platform','boolean',null,'implemented'),
  -- Trust (มีจริง: Ed25519 receipt + offline verify + manifest/merkle)
  ('trust.signed_export','Signed export + offline verify (Ed25519)','trust','boolean',null,'implemented'),
  ('trust.audit_chain','Audit manifest chain + Merkle proof','trust','boolean',null,'implemented'),
  -- Advanced / Integration (ยังไม่มีจริงทั้งกลุ่ม)
  ('ai.design_assist','AI design assist','advanced','metered_quota','runs/month','roadmap'),
  ('integration.erp','ERP integration','advanced','boolean',null,'roadmap'),
  ('integration.api','Public API','advanced','boolean',null,'roadmap'),
  ('platform.sso','SSO / SAML','advanced','boolean',null,'roadmap'),
  ('platform.self_host','Self-host / on-prem','advanced','boolean',null,'roadmap'),
  ('support.priority','Priority support / SLA','advanced','boolean',null,'implemented')
on conflict (key) do nothing;

-- tier matrix 53 × 4 = 212 แถว (ค่า tier คงเดิม + แถวใหม่ 11 ตัว)
-- ⚠️ roadmap features ยังใส่ mapping ตาม tier ที่ตั้งใจขายในอนาคต —
--    resolver [F2] จะบล็อกให้เองจนกว่า status จะพลิกเป็น implemented
insert into public.plan_entitlements(plan_code,feature_key,bool_value,limit_value) values
  -- ✓ ทุก tier
  ('free','design.create_component',true,null),('plus','design.create_component',true,null),('advance','design.create_component',true,null),('enterprise','design.create_component',true,null),
  ('free','design.cabinet_generator',true,null),('plus','design.cabinet_generator',true,null),('advance','design.cabinet_generator',true,null),('enterprise','design.cabinet_generator',true,null),
  ('free','fitting.manual',true,null),('plus','fitting.manual',true,null),('advance','fitting.manual',true,null),('enterprise','fitting.manual',true,null),
  ('free','fitting.drawer_slide',true,null),('plus','fitting.drawer_slide',true,null),('advance','fitting.drawer_slide',true,null),('enterprise','fitting.drawer_slide',true,null),
  ('free','edge.manual',true,null),('plus','edge.manual',true,null),('advance','edge.manual',true,null),('enterprise','edge.manual',true,null),
  ('free','bom.basic',true,null),('plus','bom.basic',true,null),('advance','bom.basic',true,null),('enterprise','bom.basic',true,null),
  ('free','label.basic',true,null),('plus','label.basic',true,null),('advance','label.basic',true,null),('enterprise','label.basic',true,null),
  ('free','nest.basic',true,null),('plus','nest.basic',true,null),('advance','nest.basic',true,null),('enterprise','nest.basic',true,null),
  ('free','export.gcode',true,null),('plus','export.gcode',true,null),('advance','export.gcode',true,null),('enterprise','export.gcode',true,null),
  ('free','export.dxf',true,null),('plus','export.dxf',true,null),('advance','export.dxf',true,null),('enterprise','export.dxf',true,null),
  ('free','storage.cloud_enabled',true,null),('plus','storage.cloud_enabled',true,null),('advance','storage.cloud_enabled',true,null),('enterprise','storage.cloud_enabled',true,null),
  ('free','platform.local_first',true,null),('plus','platform.local_first',true,null),('advance','platform.local_first',true,null),('enterprise','platform.local_first',true,null),
  -- ✓ Plus ขึ้นไป
  ('free','design.divide_cell',false,null),('plus','design.divide_cell',true,null),('advance','design.divide_cell',true,null),('enterprise','design.divide_cell',true,null),
  ('free','design.door_drawer_builder',false,null),('plus','design.door_drawer_builder',true,null),('advance','design.door_drawer_builder',true,null),('enterprise','design.door_drawer_builder',true,null),
  ('free','design.clearance_check',false,null),('plus','design.clearance_check',true,null),('advance','design.clearance_check',true,null),('enterprise','design.clearance_check',true,null),
  ('free','design.multi_cabinet',false,null),('plus','design.multi_cabinet',true,null),('advance','design.multi_cabinet',true,null),('enterprise','design.multi_cabinet',true,null),
  ('free','fitting.auto',false,null),('plus','fitting.auto',true,null),('advance','fitting.auto',true,null),('enterprise','fitting.auto',true,null),
  ('free','edge.auto',false,null),('plus','edge.auto',true,null),('advance','edge.auto',true,null),('enterprise','edge.auto',true,null),
  ('free','bom.advance',false,null),('plus','bom.advance',true,null),('advance','bom.advance',true,null),('enterprise','bom.advance',true,null),
  ('free','bom.export_xlsx',false,null),('plus','bom.export_xlsx',true,null),('advance','bom.export_xlsx',true,null),('enterprise','bom.export_xlsx',true,null),
  ('free','label.advance',false,null),('plus','label.advance',true,null),('advance','label.advance',true,null),('enterprise','label.advance',true,null),
  ('free','label.no_watermark',false,null),('plus','label.no_watermark',true,null),('advance','label.no_watermark',true,null),('enterprise','label.no_watermark',true,null),
  ('free','nest.advance',false,null),('plus','nest.advance',true,null),('advance','nest.advance',true,null),('enterprise','nest.advance',true,null),
  ('free','cam.dogbone',false,null),('plus','cam.dogbone',true,null),('advance','cam.dogbone',true,null),('enterprise','cam.dogbone',true,null),
  ('free','cam.machine_origin',false,null),('plus','cam.machine_origin',true,null),('advance','cam.machine_origin',true,null),('enterprise','cam.machine_origin',true,null),
  ('free','export.pdf_report',false,null),('plus','export.pdf_report',true,null),('advance','export.pdf_report',true,null),('enterprise','export.pdf_report',true,null),
  ('free','report.co2',false,null),('plus','report.co2',true,null),('advance','report.co2',true,null),('enterprise','report.co2',true,null),
  -- ✓ Advance ขึ้นไป
  ('free','nest.offcut_inventory',false,null),('plus','nest.offcut_inventory',false,null),('advance','nest.offcut_inventory',true,null),('enterprise','nest.offcut_inventory',true,null),
  ('free','nest.optimizer_pro',false,null),('plus','nest.optimizer_pro',false,null),('advance','nest.optimizer_pro',true,null),('enterprise','nest.optimizer_pro',true,null),
  ('free','hardware.engine_packs',false,null),('plus','hardware.engine_packs',false,null),('advance','hardware.engine_packs',true,null),('enterprise','hardware.engine_packs',true,null),
  ('free','cam.advance_machine',false,null),('plus','cam.advance_machine',false,null),('advance','cam.advance_machine',true,null),('enterprise','cam.advance_machine',true,null),
  ('free','cam.kerf_bending',false,null),('plus','cam.kerf_bending',false,null),('advance','cam.kerf_bending',true,null),('enterprise','cam.kerf_bending',true,null),
  ('free','cam.tool_wear',false,null),('plus','cam.tool_wear',false,null),('advance','cam.tool_wear',true,null),('enterprise','cam.tool_wear',true,null),
  ('free','export.p2p_native',false,null),('plus','export.p2p_native',false,null),('advance','export.p2p_native',true,null),('enterprise','export.p2p_native',true,null),
  ('free','export.panel_saw',false,null),('plus','export.panel_saw',false,null),('advance','export.panel_saw',true,null),('enterprise','export.panel_saw',true,null),
  ('free','export.six_side_drill',false,null),('plus','export.six_side_drill',false,null),('advance','export.six_side_drill',true,null),('enterprise','export.six_side_drill',true,null),
  ('free','export.step',false,null),('plus','export.step',false,null),('advance','export.step',true,null),('enterprise','export.step',true,null),
  ('free','export.cutlist_dialects',false,null),('plus','export.cutlist_dialects',false,null),('advance','export.cutlist_dialects',true,null),('enterprise','export.cutlist_dialects',true,null),
  ('free','trust.signed_export',false,null),('plus','trust.signed_export',false,null),('advance','trust.signed_export',true,null),('enterprise','trust.signed_export',true,null),
  ('free','integration.erp',false,null),('plus','integration.erp',false,null),('advance','integration.erp',true,null),('enterprise','integration.erp',true,null),
  ('free','support.priority',false,null),('plus','support.priority',false,null),('advance','support.priority',true,null),('enterprise','support.priority',true,null),
  -- ✓ Enterprise เท่านั้น
  ('free','design.custom_hardware_lib',false,null),('plus','design.custom_hardware_lib',false,null),('advance','design.custom_hardware_lib',false,null),('enterprise','design.custom_hardware_lib',true,null),
  ('free','trust.audit_chain',false,null),('plus','trust.audit_chain',false,null),('advance','trust.audit_chain',false,null),('enterprise','trust.audit_chain',true,null),
  ('free','integration.api',false,null),('plus','integration.api',false,null),('advance','integration.api',false,null),('enterprise','integration.api',true,null),
  ('free','platform.sso',false,null),('plus','platform.sso',false,null),('advance','platform.sso',false,null),('enterprise','platform.sso',true,null),
  ('free','platform.self_host',false,null),('plus','platform.self_host',false,null),('advance','platform.self_host',false,null),('enterprise','platform.self_host',true,null),
  -- quotas / params (null = ∞)
  ('free','nest.max_sheets',null,5),('plus','nest.max_sheets',null,50),('advance','nest.max_sheets',null,null),('enterprise','nest.max_sheets',null,null),
  ('free','machine.profiles',null,1),('plus','machine.profiles',null,3),('advance','machine.profiles',null,null),('enterprise','machine.profiles',null,null),
  ('free','storage.cloud_mb',null,500),('plus','storage.cloud_mb',null,20000),('advance','storage.cloud_mb',null,200000),('enterprise','storage.cloud_mb',null,null),
  ('free','platform.projects',null,3),('plus','platform.projects',null,null),('advance','platform.projects',null,null),('enterprise','platform.projects',null,null),
  ('free','platform.cabinets_per_project',null,20),('plus','platform.cabinets_per_project',null,null),('advance','platform.cabinets_per_project',null,null),('enterprise','platform.cabinets_per_project',null,null),
  ('free','platform.seats',null,1),('plus','platform.seats',null,3),('advance','platform.seats',null,10),('enterprise','platform.seats',null,null),
  -- metered
  ('free','ai.design_assist',null,5),('plus','ai.design_assist',null,100),('advance','ai.design_assist',null,1000),('enterprise','ai.design_assist',null,null)
on conflict (plan_code,feature_key) do nothing;

-- =====================================================================
-- 8. KNOWN GAPS (คงจาก v0.2 + เพิ่ม)
-- =====================================================================
-- 8.1 storage.cloud_mb ยังไม่มี byte-tracking (และตัว cloud sync เป็น roadmap)
-- 8.2 platform.cabinets_per_project enforce ที่ app layer
-- 8.3 Owner decision — C12: SaaS แยก DB หรือรวม DB (map org↔site)
-- 8.4 Stripe sync + reset usage_counters ต้นรอบ (Edge Function service role)
-- 8.5 RLS negative tests — ดู tests-negative.sql ในชุดเดียวกัน
-- 8.6 การพลิก status roadmap→implemented ต้องผูกกับ release process
--     (feature ship แล้ว → update features.status → plan ปลดเองอัตโนมัติ)
-- =====================================================================
-- END v0.3
-- =====================================================================
