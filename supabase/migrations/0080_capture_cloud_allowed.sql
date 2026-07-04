-- Migration: capture_cloud_allowed — capture-spine (ADR-033: Claude bridge — ขอบเขตเอกสารที่ขึ้น cloud ได้)
-- Depends on: 0049 (capture_type_config), 0062 (capture types), C12
--
-- ADR-033 (grill Claude vs Typhoon, 3 ก.ค. 2026): ช่วง bridge ใช้ Claude ได้เฉพาะเอกสารธุรกิจ —
--   cloud_allowed=true: expense_document, material_receipt, spec_draft (ข้อมูลนิติบุคคล/เทคนิค)
--   cloud_allowed=false (default): site_survey, installation_proof และประเภทอื่น (อาจติดข้อมูลบุคคลธรรมดา) → manual entry
--   (delivery_pod ตาม ADR ยังไม่มีใน config — ตั้ง true เมื่อ seed ประเภทนั้น)
-- enforcement ที่ DB (rpc_capture_cloud_allowed) — edge function ตรวจก่อนส่งอะไรออกนอก on-prem เสมอ

alter table public.capture_type_config
  add column if not exists cloud_allowed boolean not null default false;

comment on column public.capture_type_config.cloud_allowed is
  'ADR-033: อนุญาตส่งเอกสารประเภทนี้ขึ้น cloud extraction (engine=claude ช่วง bridge) — default false (on-prem only)';

update public.capture_type_config
  set cloud_allowed = true
  where capture_type in ('expense_document', 'material_receipt', 'spec_draft');

-- helper ให้ edge function ตรวจก่อน egress (fail-safe: type ไม่พบ → false)
create or replace function public.rpc_capture_cloud_allowed(p_capture_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cloud_allowed from public.capture_type_config where capture_type = p_capture_type),
    false)
$$;

revoke all on function public.rpc_capture_cloud_allowed(text) from public;
