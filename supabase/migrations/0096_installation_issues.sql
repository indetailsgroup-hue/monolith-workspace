-- Migration: installation_issues — installation-pm prep ของ task 1.8b (#ปัญหา → issue ผูกบ้าน/ห้อง)
-- Depends on: 0090 (installation_projects/rooms, fn_installation_is_member), 0095 (line_groups — source จากกลุ่ม)
--
-- จาก line-architecture §4: "ช่างพิมพ์ #ปัญหา + ข้อความ/รูป → สร้าง issue ผูกบ้าน/ห้อง + แจ้งหัวหน้างาน
-- (เก็บเป็นหลักฐาน ไม่หายในแชท)" — ตารางนี้คือปลายทาง; ตัว flow (#ปัญหา parser ใน ingest RPC +
-- แจ้งหัวหน้า) ลงกับ 1.8b — สร้างตารางก่อนเพื่อให้ 1.8b เป็นงาน wiring ล้วน
-- PWA ก็สร้าง issue ได้ทางตรง (source='pwa') — ช่องทางไหนก็ปลายทางเดียว ไม่มีระบบขนาน

create table if not exists public.installation_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  room_id uuid null references public.installation_rooms(id),
  site_code text null,
  source text not null default 'pwa' check (source in ('pwa', 'line_group')),
  -- คนแจ้ง: actor ปกติ (PWA) หรือ line_user_id จากกลุ่ม (1.8b map ผ่าน identity_binding แล้วเก็บทั้งคู่)
  reported_by text not null default public.resolve_actor(),
  line_user_id text null,
  description text not null check (length(description) > 0),
  -- รูปประกอบ (ถ้ามี) — อ้าง capture artifact (รูปจากกลุ่ม/PWA เข้าคลังเดียวกัน)
  photo_capture_id uuid null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  resolved_by text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_installation_issues_project on public.installation_issues (project_id, status);

alter table public.installation_issues enable row level security;

create policy installation_issues_sel on public.installation_issues
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_issues_ins on public.installation_issues
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_issues_upd on public.installation_issues
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id))
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));

comment on table public.installation_issues is
  'installation-pm: ปัญหาหน้างาน (#ปัญหา จากกลุ่ม LINE ผ่าน 1.8b หรือ PWA ตรง) — หลักฐานไม่หายในแชท; แจ้งหัวหน้างานตอนสร้าง (flow 1.8b)';
