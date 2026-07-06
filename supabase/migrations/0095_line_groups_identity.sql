-- Migration: line_groups_identity — installation-pm task 1.8 (line-architecture-v0.1 §7, ADR-038/039)
-- Depends on: 0002-line_oa (templates/outbound/inbound), 0088 (identity_binding lifecycle cols), 0090 (installation_projects)
--
-- Net-new ตามสเปค line-architecture-v0.1.md:
--   (1) line_groups — บ้านละ 2 กลุ่ม (internal|customer) ผูกผ่านรหัส #ผูก; archived ตอนปิดงาน
--   (2) line_group_members — sync จาก webhook member events; ตอบ "ใครอยู่กลุ่มไหน" + ย้อนประวัติได้
--   (3) line_bind_codes — รหัสผูกบ้าน (หมดอายุ 48 ชม., ใช้ได้ 2 ครั้ง)
--   (4) Guardrail G1 (มติ owner — บังคับที่ DB ไม่ใช่วินัยคน): templates += audience;
--       outbound เข้ากลุ่ม customer ได้เฉพาะ template audience ∈ (customer, both) — trigger raise
--   (5) outbound/inbound รองรับกลุ่ม: target_type/target_id + source_type/line_group_id
--       (conversation_id เดิม NOT NULL เป็น 1:1-centric → ปลดเป็น nullable + CHECK exactly-one-target
--        แถวเดิม/โค้ดเดิม (user-type) invariant คงเดิมทุกประการผ่าน CHECK)
--
-- หลักเหล็ก (ย้ำจากสเปค): กลุ่ม LINE ≠ authorization — สิทธิ์ DB มาจาก installation_memberships + C12 เท่านั้น
-- v1 เก็บจากกลุ่มเฉพาะ รูป + #ปัญหา + member events (PDPA — ไม่ดักฟังแชท)

-- ---------------------------------------------------------------------------
-- (1) line_groups
-- ---------------------------------------------------------------------------
create table if not exists public.line_groups (
  id uuid primary key default gen_random_uuid(),
  line_group_id text not null unique,
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  site_code text null,
  group_type text not null check (group_type in ('internal', 'customer')),
  status text not null default 'active' check (status in ('active', 'archived')),
  bound_by text not null default public.resolve_actor(),
  bound_at timestamptz not null default timezone('utc', now())
);
-- บ้านหนึ่งมีได้กลุ่มละหนึ่งชนิดที่ active (1:2 ตามสเปค) — archive แล้วผูกใหม่ได้
create unique index if not exists ux_line_groups_project_type_active
  on public.line_groups (project_id, group_type) where status = 'active';

-- ---------------------------------------------------------------------------
-- (2) line_group_members — ประวัติเข้า/ออก (join/leave/memberJoined/memberLeft)
-- ---------------------------------------------------------------------------
create table if not exists public.line_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.line_groups(id) on delete cascade,
  line_user_id text not null,
  -- snapshot ชื่อที่เห็นตอน join (display name เปลี่ยนได้ — เก็บไว้เพื่ออ่านประวัติ)
  display_name text null,
  -- match แล้วเป็นใคร: staff (identity_binding) | customer (line_oa_customer_identity) | guest (ยังไม่ผูก)
  member_kind text not null default 'guest' check (member_kind in ('staff', 'customer', 'guest')),
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz null
);
-- สมาชิก active ซ้ำไม่ได้ (ออกแล้วกลับเข้า = แถวใหม่ — ประวัติครบ)
create unique index if not exists ux_line_group_members_active
  on public.line_group_members (group_id, line_user_id) where left_at is null;
create index if not exists ix_line_group_members_user on public.line_group_members (line_user_id);

-- ---------------------------------------------------------------------------
-- (3) line_bind_codes — รหัสผูกบ้าน (สั้น หมดอายุ 48 ชม. ใช้ได้ 2 ครั้ง: internal+customer)
-- ---------------------------------------------------------------------------
create table if not exists public.line_bind_codes (
  code text primary key,
  project_id uuid not null references public.installation_projects(id) on delete cascade,
  expires_at timestamptz not null,
  uses_left int not null default 2 check (uses_left >= 0),
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- (4) Guardrail G1: templates += audience (default 'internal' = fail-closed —
--     ไม่มี template ไหนหลุดเข้ากลุ่มลูกค้าโดยไม่ประกาศตัว)
-- ---------------------------------------------------------------------------
alter table public.line_oa_message_templates
  add column if not exists audience text not null default 'internal'
  check (audience in ('internal', 'customer', 'both'));

comment on column public.line_oa_message_templates.audience is
  'Guardrail G1 (line-architecture §6): outbound เข้ากลุ่ม customer ได้เฉพาะ audience ∈ (customer, both) — enforce ที่ trigger fn_line_guard_customer_group; default internal = fail-closed';

-- ---------------------------------------------------------------------------
-- (5) outbound/inbound รองรับกลุ่ม
-- ---------------------------------------------------------------------------
alter table public.line_oa_outbound_messages
  add column if not exists target_type text not null default 'user' check (target_type in ('user', 'group')),
  add column if not exists target_id text null;  -- line_group_id เมื่อ target_type='group'
alter table public.line_oa_outbound_messages alter column conversation_id drop not null;
-- invariant เดิมของ user-type คงเดิม (conversation ต้องมี); group-type ต้องมี target_id
alter table public.line_oa_outbound_messages
  add constraint line_oa_outbound_target_shape check (
    (target_type = 'user' and conversation_id is not null)
    or (target_type = 'group' and target_id is not null)
  );

alter table public.line_oa_inbound_messages
  add column if not exists source_type text not null default 'user' check (source_type in ('user', 'group')),
  add column if not exists line_group_id text null;
alter table public.line_oa_inbound_messages alter column conversation_id drop not null;
alter table public.line_oa_inbound_messages
  add constraint line_oa_inbound_source_shape check (
    (source_type = 'user' and conversation_id is not null)
    or (source_type = 'group' and line_group_id is not null)
  );

-- Guardrail G1 trigger: ส่งเข้ากลุ่ม customer → template ต้องประกาศ audience customer/both
-- (template selection ทิศเดียวกับ fn_wf_render_notification_text: shared (vertical null) ก่อน)
create or replace function public.fn_line_guard_customer_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_type text;
  v_audience text;
begin
  if new.target_type <> 'group' then
    return new;  -- 1:1 เดิมไม่เกี่ยว guardrail นี้
  end if;

  select g.group_type into v_group_type
  from public.line_groups g where g.line_group_id = new.target_id;

  if v_group_type is null then
    raise exception 'line guardrail: กลุ่ม % ยังไม่ถูกผูกกับบ้าน (line_groups) — ส่งไม่ได้', new.target_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_group_type = 'customer' then
    select t.audience into v_audience
    from public.line_oa_message_templates t
    where t.template_key = new.template_key and t.is_active
    order by (t.vertical_context is null) desc
    limit 1;

    if v_audience is null or v_audience not in ('customer', 'both') then
      raise exception 'line guardrail G1: template % (audience=%) ห้ามส่งเข้ากลุ่มลูกค้า — เฉพาะ customer/both',
        new.template_key, coalesce(v_audience, 'ไม่พบ template')
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_line_guard_customer_group on public.line_oa_outbound_messages;
create trigger trg_line_guard_customer_group
  before insert or update on public.line_oa_outbound_messages
  for each row execute function public.fn_line_guard_customer_group();

-- ---------------------------------------------------------------------------
-- RLS — fail-closed (webhook/bot เดินผ่าน Edge Function service role; ฝั่งคนใช้ scope ตาม C12+membership)
-- ---------------------------------------------------------------------------
alter table public.line_groups enable row level security;
alter table public.line_group_members enable row level security;
alter table public.line_bind_codes enable row level security;

create policy line_groups_sel on public.line_groups
  for select to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code) or public.fn_installation_is_member(project_id));
create policy line_groups_ins on public.line_groups
  for insert to authenticated
  with check (public.is_governance_role() or public.has_site_access(site_code));
create policy line_groups_upd on public.line_groups
  for update to authenticated
  using (public.is_governance_role() or public.has_site_access(site_code))
  with check (public.is_governance_role() or public.has_site_access(site_code));

create policy line_group_members_sel on public.line_group_members
  for select to authenticated
  using (public.is_governance_role()
         or exists (select 1 from public.line_groups g
                    where g.id = group_id
                      and (public.has_site_access(g.site_code) or public.fn_installation_is_member(g.project_id))));
-- insert/update ของ member events มาจาก webhook (service role) เท่านั้น — ไม่เปิด policy ฝั่งคน

-- รหัสผูกบ้าน: เห็น/ออกได้เฉพาะ office (site) + governance — ช่าง/ลูกค้าไม่มีสิทธิ์อ่าน code คนอื่น
create policy line_bind_codes_sel on public.line_bind_codes
  for select to authenticated
  using (public.is_governance_role()
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)));
create policy line_bind_codes_ins on public.line_bind_codes
  for insert to authenticated
  with check (public.is_governance_role()
         or public.has_site_access((select p.site_code from public.installation_projects p where p.id = project_id)));

comment on table public.line_groups is
  'installation-pm 1.8 (line-architecture §2-3): บ้านละ 2 กลุ่ม (internal/customer) — กลุ่ม ≠ authorization; สิทธิ์ DB มาจาก installation_memberships+C12 เท่านั้น';
comment on table public.line_group_members is
  'sync จาก webhook member events (idempotent ตาม webhook_event_id ที่ชั้น Edge) — v1 เก็บ รูป/#ปัญหา/member events เท่านั้น (PDPA)';
comment on table public.line_bind_codes is
  'รหัสผูกบ้าน #ผูก — หมดอายุ 48 ชม. ใช้ได้ 2 ครั้ง (internal+customer); ผูกได้เฉพาะผู้มี staff identity + membership (enforce ที่ bot flow 1.8b)';
