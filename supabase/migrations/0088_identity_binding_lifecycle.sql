-- Migration: identity_binding_lifecycle — monolith-workflow-copilot / installation-pm (runbook Wave2 B5, ADR-038)
-- Depends on: 0002 (identity_binding), 0084 (identity_binding.app_role)
--
-- ADR-038 (grill-with-docs 2026-07-06, ปิด F11): ยุบ line_staff_identity (installation-pm spec) เข้า
--   identity_binding ตารางเดียว — staff ผูก LINE ครั้งเดียวใช้ทุกระบบ. คอลัมน์ lifecycle ที่ spec ต้องการ:
--   consent_at (PDPA consent ตอน bind-link/LINE Login), bound_at (เวลาผูกสำเร็จ), revoked_at (เวลาถอน).
--   Flow bind-link/LINE Login จริงมาใน installation-pm Phase 1.8 — นี่คือโครงรองรับ (additive ทั้งหมด).

alter table public.identity_binding
  add column if not exists consent_at timestamptz null,
  add column if not exists bound_at   timestamptz null,
  add column if not exists revoked_at timestamptz null;

-- แถวเดิม (ผูกผ่าน rpc ยุค 0011): เวลาผูก = created_at (ค่าที่ดีที่สุดที่มี); consent_at คง null
-- จนกว่าจะเก็บ consent จริงตาม PDPA flow (Phase 1.8) — ห้าม backfill ค่า consent ที่ไม่เคยเกิด
update public.identity_binding set bound_at = created_at where bound_at is null;

comment on column public.identity_binding.consent_at is
  'PDPA consent timestamp ตอน bind-link/LINE Login (ADR-038; flow ใน installation-pm Phase 1.8) — null = ยังไม่เคยบันทึก consent อย่างเป็นทางการ';
comment on column public.identity_binding.bound_at is
  'เวลาผูก LINE สำเร็จ (ADR-038); แถวก่อน migration นี้ backfill จาก created_at';
comment on column public.identity_binding.revoked_at is
  'เวลาถอนการผูก (ADR-038) — SSOT ของสถานะ active ยังเป็น is_active (partial unique ux_identity_binding_active_line_user); revoke flow ต้อง set ทั้งคู่';
