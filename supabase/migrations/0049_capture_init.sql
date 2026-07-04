-- Migration: capture_init — capture-spine Phase 2 (task 1.1)
-- Depends on: C12 (resolve_actor/has_site_access/is_governance_role)
--
-- Data layer: enums + capture_type_config + fraud_signal_config + capture_artifact + RLS SELECT TO authenticated.
-- lifecycle ลอก TCCK agent_artifact (proposed→approved/rejected→emitted→superseded).
-- naming: ต่อ global sequence (workflow 0001–0035, mcp 0036–0048) — แผน tasks.md 0001/0002 map → 0049/0050/0051.
-- ⚠️ principal/actor/reviewed_by = text (resolve_actor() คืน text, email-based) — reuse-not-fork (เหมือน mcp-layer fix).

-- ---------------------------------------------------------------------------
-- enums (idempotent guard)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'capture_status') then
    create type public.capture_status as enum ('proposed', 'approved', 'rejected', 'emitted', 'superseded');
  end if;
  if not exists (select 1 from pg_type where typname = 'capture_source') then
    create type public.capture_source as enum ('line', 'email', 'app');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- capture_type_config — config-driven per-department (R-SPINE-11)
-- ---------------------------------------------------------------------------
create table if not exists public.capture_type_config (
  capture_type    text primary key,
  field_schema    jsonb not null,                 -- typed fields ต่อชนิด
  verify_rules    jsonb not null default '[]'::jsonb,  -- array verify_rule (seed PFMEA; ทุก rule มี pfmea_ref)
  commit_target   text not null,                  -- ledger / Work_Item complete / SiteSurveyZone / ...
  critical_fields text[] not null default '{}',   -- field สำคัญ → บังคับ human confirm (R-SPINE-5)
  active          boolean not null default true
);

-- ---------------------------------------------------------------------------
-- fraud_signal_config — config (R-FRAUD)
-- ---------------------------------------------------------------------------
create table if not exists public.fraud_signal_config (
  signal_key text primary key,
  rule       jsonb not null,
  active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- capture_artifact — pipeline record (lifecycle TCCK agent_artifact)
-- ---------------------------------------------------------------------------
create table if not exists public.capture_artifact (
  id                 uuid primary key default gen_random_uuid(),
  capture_type       text not null references public.capture_type_config (capture_type),
  status             public.capture_status not null default 'proposed',
  source             public.capture_source not null,
  principal          text not null,               -- resolve_actor() (text)
  site_code          text,
  raw_uri            text not null,               -- on-prem storage
  ocr_text           text,
  ai_payload         jsonb not null default '{}'::jsonb,
  confidence         jsonb not null default '{}'::jsonb,
  ai_provider        text,                         -- provenance (Property 5)
  model_version      text,
  fraud_signals      jsonb not null default '[]'::jsonb,
  is_suspicious      boolean not null default false,
  linked_entity_type text,
  linked_entity_id   uuid,
  reviewed_by        text,                         -- resolve_actor() (text)
  reviewed_at        timestamptz,
  review_notes       text,
  idempotency_key    text not null unique,         -- hash เนื้อหา (R-SPINE-12)
  created_at         timestamptz not null default timezone('utc', now()),
  -- verify ครบคู่ (reviewed_at ↔ reviewed_by)
  constraint capture_artifact_reviewed_pair check ((reviewed_at is null) = (reviewed_by is null))
);
create index if not exists ix_capture_artifact_status on public.capture_artifact (status);
create index if not exists ix_capture_artifact_type on public.capture_artifact (capture_type);
create index if not exists ix_capture_artifact_principal on public.capture_artifact (principal);

-- ---------------------------------------------------------------------------
-- RLS: SELECT TO authenticated (reuse C12); ไม่มี client write policy
-- ---------------------------------------------------------------------------
alter table public.capture_type_config enable row level security;
alter table public.fraud_signal_config enable row level security;
alter table public.capture_artifact    enable row level security;

-- config catalogs: อ่านได้ทุก authenticated (ไม่มี site_code)
drop policy if exists capture_type_config_sel on public.capture_type_config;
create policy capture_type_config_sel on public.capture_type_config
  for select to authenticated using (true);

drop policy if exists fraud_signal_config_sel on public.fraud_signal_config;
create policy fraud_signal_config_sel on public.fraud_signal_config
  for select to authenticated using (true);

-- artifact: site-scoped (governance ข้ามได้)
drop policy if exists capture_artifact_sel on public.capture_artifact;
create policy capture_artifact_sel on public.capture_artifact
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));
