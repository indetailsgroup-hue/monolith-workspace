-- Migration: installation_pm_core — installation-pm Phase 1 task 1.1 (D-1, D-2, D-11; ADR-035)
-- Depends on: C12 foundation (has_site_access/is_governance_role/resolve_actor), 0002 (work_item)
--
-- Data model ตาม design D-2 (approved grill 5 ก.ค. 2026):
--   บ้าน (installation_projects + foreman 1 คน/บ้าน) → ห้อง (installation_rooms, room_type)
--   → เลนช่าง (installation_tasks — lane 1/2/3 = "ช่างคนที่ 1/2/3" ตาม owner correction: เลนขนาน ไม่ใช่เฟส)
--   + photos/annotations, field_reports, approvals, audit_log, memberships
--
-- หลักที่ยึด:
--   - D-1: ห้ามคำ `site` ในชื่อตารางใหม่ (ชน C12 tenant scope) → prefix installation_* ทั้งชุด
--   - ADR-035: v1 dogfood อยู่ DB เดิม — ไม่มี org/tenant col; scope ด้วย site_code + RLS convention C12
--   - D-11: lifecycle จริงอยู่ที่ workflow (work_item) — ตารางชุดนี้เป็นมุมมอง/รายละเอียดหน้างาน
--     **subtask ครบทุกเลน ≠ auto-complete work item** (ห้ามมี trigger ปิดงาน — ปิดผ่าน capture proof 0063 เท่านั้น)
--   - D-6a (spike 0.3 ✅): photos/field_reports มี client_submission_id UNIQUE — offline queue retry ไม่เกิดซ้ำ
--   - D-2: report ที่เซ็นแล้ว + approval ที่ตัดสินแล้ว + audit log = immutable (trigger pattern 0003)
--   - RLS fail-closed ทุกตาราง: governance | site access | membership (external member เข้าได้เฉพาะผ่าน
--     installation_memberships — D-2)

-- ---------------------------------------------------------------------------
-- (1) installation_projects — บ้าน 1 หลัง / job ลูกค้า 1 งานติดตั้ง
-- ---------------------------------------------------------------------------
create table if not exists public.installation_projects (
  id uuid primary key default gen_random_uuid(),
  site_code text null,
  -- link เข้า spine: work item ขั้น Installation ของ job นี้ (ADR-035 amendment — ห้ามสร้างระบบขนาน)
  work_item_id uuid null references public.work_item(id),
  -- ชื่อภาษาคนที่ช่างเห็น (UX tenet D-12: ห้ามโชว์ id/key) เช่น "บ้านคุณสมชาย รามอินทรา"
  name text not null,
  -- หัวหน้างาน 1 คน/บ้าน (staffing model) — approver start/finish; uuid space เดียวกับ identity_binding.employee_id
  foreman_employee_id uuid null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists ux_installation_projects_work_item
  on public.installation_projects (work_item_id) where work_item_id is not null;

-- ---------------------------------------------------------------------------
-- (2) installation_rooms — ชั้น "ห้อง" ตาม staffing model (บ้าน 5 ห้อง = 5 แถว)
-- ---------------------------------------------------------------------------
create table if not exists public.installation_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  site_code text null,
  -- ประเภทห้องตาม checklist Installation.xlsx (kitchen/bedroom/living/bathroom/...) — ใช้เลือก template เลน
  room_type text not null check (length(room_type) > 0),
  -- ชื่อที่ช่างเห็น เช่น "ห้องนอนใหญ่ ชั้น 2" (UX tenet — ห้อง = ชื่อภาษาคน)
  display_name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_installation_rooms_project on public.installation_rooms (project_id);

-- ---------------------------------------------------------------------------
-- (3) installation_tasks — เลนช่างใต้ห้อง: lane N = "ช่างคนที่ N" (เลนขนาน — owner 5 ก.ค.)
--     ประปา = conditional item ภายใน checklist ของเลน (ไม่แตก variant — ช่างทุกคนทำไฟฟ้า/ประปาได้)
-- ---------------------------------------------------------------------------
create table if not exists public.installation_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.installation_rooms(id) on delete cascade,
  site_code text null,
  lane int not null check (lane between 1 and 3),
  -- ช่างจริงที่ถูก assign เข้าเลน (uuid space = identity_binding.employee_id) — หลังบ้านใช้ infer
  -- "งานของฉันวันนี้" (D-12 ข้อ 5) และ infer ห้อง/เลนจากคนส่งรูป (D-12 ข้อ 3)
  assignee_employee_id uuid null,
  -- อ้าง item set ของ template เลน (จาก form_templates — สร้างตอน 1.5c; text ref ไม่ผูก FK เพื่อลำดับ migration)
  template_ref text null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  -- D-11: สถานะเลนเป็นรายละเอียดหน้างานเท่านั้น — ห้ามมี trigger เอาสถานะนี้ไปปิด work_item
  checklist_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, lane)
);
create index if not exists ix_installation_tasks_assignee
  on public.installation_tasks (assignee_employee_id) where assignee_employee_id is not null;

-- ---------------------------------------------------------------------------
-- (4) installation_memberships — ประตูเดียวของ external member (D-2)
--     กลุ่ม LINE ≠ authorization (line-architecture v0.1 หลักเหล็ก) — สิทธิ์มาจากตารางนี้ + RLS เท่านั้น
-- ---------------------------------------------------------------------------
create table if not exists public.installation_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  user_id uuid not null,  -- auth.uid() ของสมาชิก
  member_type text not null check (member_type in ('internal', 'external')),
  role text not null check (role in ('foreman', 'technician', 'office', 'observer')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, user_id)
);

-- membership predicate — security definer กัน RLS recursion (ใช้ในทุก policy ข้างล่าง)
create or replace function public.fn_installation_is_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.installation_memberships m
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.is_active
  );
$$;
revoke all on function public.fn_installation_is_member(uuid) from public;
-- policy ทุกตัวข้างล่างเรียก fn นี้ด้วยสิทธิ์ผู้เรียก → ต้อง grant execute (pattern 0083)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_installation_is_member(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_installation_is_member(uuid) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (5) installation_photos + annotations — media หน้างาน (ไฟล์จริงอยู่ Storage; นี่คือ metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.installation_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  room_id uuid null references public.installation_rooms(id),
  site_code text null,
  storage_path text not null,
  thumb_path text null,
  meta jsonb not null default '{}'::jsonb,
  -- อ้างชิ้นงาน/แผง (packet registry D-3 มาทีหลัง — text ref ก่อน)
  panel_ref text null,
  -- เชื่อม capture pipeline (task 1.3: PWA → rpc_capture_ingest 'installation_proof') — loose ref
  capture_artifact_id uuid null,
  -- D-6a: idempotency key จาก offline queue (spike 0.3) — retry กี่รอบก็แถวเดียว
  client_submission_id text null,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists ux_installation_photos_submission
  on public.installation_photos (client_submission_id) where client_submission_id is not null;
create index if not exists ix_installation_photos_project on public.installation_photos (project_id);

create table if not exists public.installation_photo_annotations (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.installation_photos(id) on delete cascade,
  site_code text null,
  -- annotation layer แยกจากไฟล์ต้นฉบับ (D-2 — ไม่แตะรูปจริง)
  layer jsonb not null,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- (6) installation_field_reports — รายงานหน้างาน (template คงที่จาก 1.5c)
--     เซ็นแล้ว = immutable (trigger ข้างล่าง)
-- ---------------------------------------------------------------------------
create table if not exists public.installation_field_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  room_id uuid null references public.installation_rooms(id),
  site_code text null,
  template_ref text null,
  -- ค่าที่กรอกตาม template (D-2 เรียก values — เปลี่ยนชื่อเพราะ VALUES เป็น reserved keyword)
  report_values jsonb not null default '{}'::jsonb,
  signature jsonb null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'signed')),
  -- D-6a idempotency (spike 0.3)
  client_submission_id text null,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz null
);
create unique index if not exists ux_installation_field_reports_submission
  on public.installation_field_reports (client_submission_id) where client_submission_id is not null;

-- ---------------------------------------------------------------------------
-- (7) installation_approvals — start/finish (หัวหน้างาน) + ลูกค้า (D-5) ผ่าน LINE|link
--     ตัดสินแล้ว = immutable; postback_id UNIQUE = idempotent ต่อ LINE redelivery
-- ---------------------------------------------------------------------------
create table if not exists public.installation_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  room_id uuid null references public.installation_rooms(id),
  site_code text null,
  subject text not null check (subject in ('start', 'finish', 'customer_acceptance')),
  channel text not null check (channel in ('line', 'link')),
  result text null check (result in ('approved', 'rejected')),
  reason text null,
  postback_id text null,
  requested_by text not null default public.resolve_actor(),
  decided_by text null,
  decided_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists ux_installation_approvals_postback
  on public.installation_approvals (postback_id) where postback_id is not null;

-- ---------------------------------------------------------------------------
-- (8) installation_audit_log — append-only (pattern 0003)
-- ---------------------------------------------------------------------------
create table if not exists public.installation_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  project_id uuid null,
  room_id uuid null,
  site_code text null,
  performed_by text not null default public.resolve_actor(),
  detail jsonb null,
  at timestamptz not null default timezone('utc', now())
);
create index if not exists ix_installation_audit_project on public.installation_audit_log (project_id);

-- ---------------------------------------------------------------------------
-- Immutability triggers (D-2): audit append-only · report เซ็นแล้วห้ามแก้/ลบ · approval ตัดสินแล้วห้ามแก้/ลบ
-- ---------------------------------------------------------------------------
create or replace function public.installation_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'installation_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end; $$;
drop trigger if exists trg_installation_audit_immutable on public.installation_audit_log;
create trigger trg_installation_audit_immutable
  before update or delete on public.installation_audit_log
  for each row execute function public.installation_audit_log_immutable();
revoke update, delete on public.installation_audit_log from public;

create or replace function public.installation_signed_report_immutable()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then
    raise exception 'signed field report is immutable: % is not permitted', tg_op
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists trg_installation_report_immutable on public.installation_field_reports;
create trigger trg_installation_report_immutable
  before update or delete on public.installation_field_reports
  for each row execute function public.installation_signed_report_immutable();

create or replace function public.installation_decided_approval_immutable()
returns trigger language plpgsql as $$
begin
  if old.result is not null then
    raise exception 'decided approval is immutable: % is not permitted', tg_op
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
drop trigger if exists trg_installation_approval_immutable on public.installation_approvals;
create trigger trg_installation_approval_immutable
  before update or delete on public.installation_approvals
  for each row execute function public.installation_decided_approval_immutable();

-- ---------------------------------------------------------------------------
-- RLS — fail-closed ทุกตาราง (enable โดยไม่มี policy = ปิดสนิท แล้วเปิดเป็นราย operation)
--   อ่าน: governance | site access | project member
--   เขียนโครงงาน (projects/rooms/tasks): governance | site access (office จัดงาน)
--     + member update สถานะเลนตัวเอง (tasks)
--   เขียนของหน้างาน (photos/annotations/reports): เพิ่ม member (ช่างส่งของจากหน้างาน)
--   approvals: เขียนฝั่ง internal เท่านั้น (postback ลูกค้าเข้าทาง Edge Function service role — bypass RLS)
-- ---------------------------------------------------------------------------
alter table public.installation_projects enable row level security;
alter table public.installation_rooms enable row level security;
alter table public.installation_tasks enable row level security;
alter table public.installation_memberships enable row level security;
alter table public.installation_photos enable row level security;
alter table public.installation_photo_annotations enable row level security;
alter table public.installation_field_reports enable row level security;
alter table public.installation_approvals enable row level security;
alter table public.installation_audit_log enable row level security;

-- projects
create policy installation_projects_sel on public.installation_projects
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(id));
create policy installation_projects_ins on public.installation_projects
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code));
create policy installation_projects_upd on public.installation_projects
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code))
  with check (public.is_governance_role() or public.has_site_access(site_code));

-- rooms
create policy installation_rooms_sel on public.installation_rooms
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_rooms_ins on public.installation_rooms
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code));
create policy installation_rooms_upd on public.installation_rooms
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code))
  with check (public.is_governance_role() or public.has_site_access(site_code));

-- tasks — member update ได้ (ช่างอัปเดตเลนตัวเอง; จำกัดเป็น assignee-only เมื่อมี employee↔auth map ใน 1.8)
create policy installation_tasks_sel on public.installation_tasks
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code)
         or public.fn_installation_is_member((select r.project_id from public.installation_rooms r where r.id = room_id)));
create policy installation_tasks_ins on public.installation_tasks
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code));
create policy installation_tasks_upd on public.installation_tasks
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code)
         or public.fn_installation_is_member((select r.project_id from public.installation_rooms r where r.id = room_id)))
  with check (public.is_governance_role() or public.has_site_access(site_code)
         or public.fn_installation_is_member((select r.project_id from public.installation_rooms r where r.id = room_id)));

-- memberships — เห็นของตัวเอง + ฝ่ายจัดการเห็นทั้งโปรเจกต์; เขียนเฉพาะฝ่ายจัดการ
create policy installation_memberships_sel on public.installation_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_governance_role()
         or public.fn_installation_is_member(project_id));
create policy installation_memberships_ins on public.installation_memberships
  for insert to authenticated
  with check (public.is_governance_role()
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)));
create policy installation_memberships_upd on public.installation_memberships
  for update to authenticated
  using (public.is_governance_role()
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)))
  with check (public.is_governance_role()
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)));

-- photos / annotations / field_reports — member เขียนได้ (ของจากหน้างาน)
create policy installation_photos_sel on public.installation_photos
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_photos_ins on public.installation_photos
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));

create policy installation_photo_annotations_sel on public.installation_photo_annotations
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code)
         or public.fn_installation_is_member((select ph.project_id from public.installation_photos ph where ph.id = photo_id)));
create policy installation_photo_annotations_ins on public.installation_photo_annotations
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code)
         or public.fn_installation_is_member((select ph.project_id from public.installation_photos ph where ph.id = photo_id)));

create policy installation_field_reports_sel on public.installation_field_reports
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_field_reports_ins on public.installation_field_reports
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_field_reports_upd on public.installation_field_reports
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id))
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
-- (draft→submitted→signed แก้ได้จนกว่าจะ signed — trigger บล็อกหลังเซ็น; DELETE ไม่มี policy = ปิด)

-- approvals — internal เท่านั้น (ลูกค้าเข้าทาง Edge Function)
create policy installation_approvals_sel on public.installation_approvals
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_approvals_ins on public.installation_approvals
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code));
create policy installation_approvals_upd on public.installation_approvals
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code))
  with check (public.is_governance_role() or public.has_site_access(site_code));

-- audit — อ่านตาม scope, เขียน append โดยทุกคนใน scope (update/delete ถูก trigger+revoke ปิดตาย)
create policy installation_audit_sel on public.installation_audit_log
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy installation_audit_ins on public.installation_audit_log
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));

comment on table public.installation_projects is
  'installation-pm D-2: บ้าน/job — link work_item ขั้น Installation (ADR-035: เกาะ workflow spine); lifecycle จริงอยู่ workflow';
comment on table public.installation_tasks is
  'เลนช่างใต้ห้อง: lane N = ช่างคนที่ N (เลนขนาน — owner 2026-07-05); สถานะเลนห้ามใช้ปิด work_item (D-11)';
comment on column public.installation_photos.client_submission_id is
  'D-6a idempotency key จาก offline queue (spike 0.3) — partial UNIQUE กัน retry ซ้ำ';
