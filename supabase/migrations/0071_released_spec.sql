-- Migration: released_spec — monolith-accounting/design (L3 commit-target #4 target: Released_Spec)
-- Depends on: 0049 (capture_type_config), 0062 (spec_draft config), C12
--
-- Spec Bible: spec_draft (verified + gate_confirmed) → Released_Spec (DRAFT→Gate→FROZEN→RELEASED).
-- versioning ต่อ bible_code: release ใหม่ของ code เดิม → supersede ตัวเก่า (chain) + version+1.
-- invariant: หนึ่ง bible_code มี released ที่ active ได้ตัวเดียว (partial unique).

create table if not exists public.released_spec (
  id                uuid primary key default gen_random_uuid(),
  bible_code        text not null,
  version           int not null default 1,
  function          text,
  dimension         jsonb not null,                 -- สเปคมิติ (source of truth การผลิต)
  status            text not null default 'released',  -- 'released' | 'superseded'
  source_capture_id uuid,                            -- provenance → capture_artifact
  site_code         text,
  released_by       text not null,                   -- resolve_actor() (text)
  released_at       timestamptz not null default timezone('utc', now()),
  superseded_by     uuid references public.released_spec (id),
  constraint released_spec_status_chk check (status in ('released', 'superseded'))
);
-- หนึ่ง bible_code = released active ได้ตัวเดียว (fail-safe กัน release ซ้อน)
create unique index if not exists ux_released_spec_active
  on public.released_spec (bible_code) where status = 'released';
create index if not exists ix_released_spec_code on public.released_spec (bible_code, version);

alter table public.released_spec enable row level security;
drop policy if exists released_spec_sel on public.released_spec;
create policy released_spec_sel on public.released_spec
  for select to authenticated using (true);  -- Spec Bible = design reference ใช้ร่วมข้าม site (write ผ่าน adapter/gate เท่านั้น)
