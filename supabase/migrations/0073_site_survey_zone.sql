-- Migration: site_survey_zone — capture-spine (L3 commit-target #5 target: SiteSurveyZone)
-- Depends on: 0049 (capture_type_config), 0062 (site_survey config), C12
--
-- ปิด seam AreaMeasurement: site_survey (verified) → SiteSurveyZone (ข้อมูลวัดหน้างานจริงต่อ zone).
-- versioning ต่อ (site_code, zone): re-survey → supersede ตัวเก่า (chain) + version+1.
-- invariant: หนึ่ง (site, zone) มี active ได้ตัวเดียว. site-scoped (ข้อมูลกายภาพผูก site จริง — ต่างจาก Spec Bible).

create table if not exists public.site_survey_zone (
  id                uuid primary key default gen_random_uuid(),
  site_code         text not null,
  zone              text not null,
  version           int not null default 1,
  dimension         jsonb not null,                 -- มิติที่วัด
  mep               jsonb not null,                 -- ตำแหน่ง MEP (ไฟ/น้ำ/ท่อ)
  material          text,
  photo             jsonb not null default '[]'::jsonb,  -- อ้างรูปหน้างาน (on-prem)
  status            text not null default 'active',  -- 'active' | 'superseded'
  source_capture_id uuid,                            -- provenance → capture_artifact
  surveyed_by       text not null,                   -- resolve_actor() (text)
  surveyed_at       timestamptz not null default timezone('utc', now()),
  superseded_by     uuid references public.site_survey_zone (id),
  constraint site_survey_zone_status_chk check (status in ('active', 'superseded'))
);
-- หนึ่ง (site, zone) = active ได้ตัวเดียว (fail-safe กัน survey ซ้อน)
create unique index if not exists ux_site_survey_zone_active
  on public.site_survey_zone (site_code, zone) where status = 'active';
create index if not exists ix_site_survey_zone_lookup on public.site_survey_zone (site_code, zone, version);

alter table public.site_survey_zone enable row level security;
drop policy if exists site_survey_zone_sel on public.site_survey_zone;
create policy site_survey_zone_sel on public.site_survey_zone
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code));  -- ข้อมูลวัดผูก site
