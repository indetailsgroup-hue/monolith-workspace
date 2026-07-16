-- =====================================================================
-- MONOLITH Entitlement DB (separate Supabase project — ADR-034)
-- extensions + tenancy + billing/entitlement core + domain tables
-- SPLIT VERBATIM from .kiro/specs/entitlement-tier/schema-draft-v0.3.sql
--   (v0.3.1 = SSOT; security reviews v0.1->v0.2 S1-S4/L5-L9, v0.2->v0.3 F1-F4,
--    landing fix v0.3.1 [L10]) — DO NOT edit here; edit the spec SSOT then re-split.
-- Ordering note: RLS policies call is_member(), so the dependency-correct chain is
--   init -> functions -> RLS -> triggers -> seed (matches the draft's own run order).
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
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  -- [F5 v0.3.2] org ปัจจุบันที่ผู้ใช้เลือก (ผู้ใช้หลาย org) — เขียนผ่าน set_active_org() เท่านั้น
  active_org_id uuid references public.organizations(id) on delete set null,
  created_at    timestamptz not null default now()
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
