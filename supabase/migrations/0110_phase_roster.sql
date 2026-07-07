-- Migration: phase_roster — J2.5 (ADR-041 delta 1 + มติ D-2/B2-3)
-- Depends on: 0090 (projects), 0095 (line_groups/members), 0097/0107 (member sync ใน handler), 0084 (rpc_dispatch_notification)
--
-- "ระบบสั่ง-เช็ค-ตาม" (LINE bot ดึงคนเข้ากลุ่มเองไม่ได้ — ADR-041):
--   สั่ง: คำขอ assign ต่อบ้านต่อเฟส → หัวหน้าฝ่าย approve → push แจ้งคนที่ถูกมอบหมาย (ให้คนในกลุ่มกดเชิญ)
--   เช็ค: bot เห็น join (line_group_members INSERT) → match roster → active; คนแปลกหน้าในกลุ่มลูกค้า → แจ้งโฟร์แมน
--   ตาม: rpc_field_roster_status = ใครควรอยู่/เข้าครบยัง/ใครเกิน; จบเฟส → เตือนออกอย่างสุภาพในกลุ่ม
-- + designer matching v1 แบบ manual: B1 เลือกจาก list เรียงตามงานในมือ (Mood&Tone tag รอ BJ-3)

-- ---------------------------------------------------------------------------
-- (1) ตาราง roster ต่อบ้านต่อเฟส
-- ---------------------------------------------------------------------------
create table if not exists public.phase_rosters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  phase text not null check (phase in ('survey', 'design', 'installation')),
  employee_id uuid not null,
  display_name text not null,
  role_ref text not null,                 -- 'C2','B2','D4','D5','E5' ฯลฯ ตาม JD
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'active', 'left_due', 'removed')),
  requested_by text not null default public.resolve_actor(),
  approved_by text,
  approved_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, phase, employee_id)
);
alter table public.phase_rosters enable row level security;
create policy phase_rosters_sel on public.phase_rosters for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));
-- เขียนผ่าน RPC เท่านั้น (default ACL ไม่มี DML)

-- ---------------------------------------------------------------------------
-- (2) สั่ง: ขอ assign → หัวหน้า approve → push แจ้งคนถูกมอบหมาย
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_request_assignment(
  p_project_id uuid, p_phase text, p_employee_id uuid, p_display_name text, p_role_ref text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
  v_status text;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_display_name), '') = '' or coalesce(btrim(p_role_ref), '') = '' then
    raise exception 'ต้องมีชื่อ + role' using errcode = 'check_violation';
  end if;

  select id, status into v_id, v_status from public.phase_rosters
  where project_id = p_project_id and phase = p_phase and employee_id = p_employee_id;
  if v_id is not null then
    return jsonb_build_object('roster_id', v_id, 'status', v_status, 'already', true);
  end if;

  insert into public.phase_rosters (project_id, phase, employee_id, display_name, role_ref)
  values (p_project_id, p_phase, p_employee_id, btrim(p_display_name), btrim(p_role_ref))
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('roster_assignment_requested', p_project_id, v_p.site_code,
    jsonb_build_object('roster_id', v_id, 'phase', p_phase, 'employee_id', p_employee_id, 'role_ref', p_role_ref));
  return jsonb_build_object('roster_id', v_id, 'status', 'requested', 'already', false);
end; $$;

create or replace function public.rpc_field_approve_assignment(
  p_roster_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_p record;
begin
  select r.*, p.site_code as p_site, p.name as p_name into v_r
  from public.phase_rosters r join public.installation_projects p on p.id = r.project_id
  where r.id = p_roster_id;
  if not found then raise exception 'roster not found' using errcode = 'no_data_found'; end if;
  -- approve = หัวหน้าฝ่าย (C1 วัด / B1 ออกแบบ / D3 ติดตั้ง) — v1: site access หรือ governance, บันทึกผู้อนุมัติลง audit
  if not (public.is_governance_role() or public.has_site_access(v_r.p_site)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_r.status <> 'requested' then
    return jsonb_build_object('roster_id', p_roster_id, 'status', v_r.status, 'already', true);
  end if;

  update public.phase_rosters
  set status = case when p_approve then 'approved' else 'rejected' end,
      approved_by = public.resolve_actor(), approved_at = timezone('utc', now())
  where id = p_roster_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('roster_assignment_' || case when p_approve then 'approved' else 'rejected' end,
    v_r.project_id, v_r.p_site,
    jsonb_build_object('roster_id', p_roster_id, 'phase', v_r.phase,
      'employee_id', v_r.employee_id, 'reason', coalesce(p_reason, '')));

  if p_approve then
    -- push ส่วนตัวถึงคนถูกมอบหมาย (fail-soft — binding อาจยังไม่มี)
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_r.employee_id),
        'personal_responsibility', 'roster_assignment', 'tpl_roster_assigned',
        jsonb_build_object('project_name', v_r.p_name, 'phase_label',
          case v_r.phase when 'survey' then 'วัดหน้างาน' when 'design' then 'ออกแบบ' else 'ติดตั้ง' end),
        false, null, true, null, v_r.p_site);
    exception when others then
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('roster_notify_failed', v_r.project_id, v_r.p_site,
        jsonb_build_object('roster_id', p_roster_id, 'error', sqlerrm));
    end;
  end if;
  return jsonb_build_object('roster_id', p_roster_id,
    'status', case when p_approve then 'approved' else 'rejected' end, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) เช็ค: join เข้ากลุ่ม → match roster / คนแปลกหน้าในกลุ่มลูกค้า → แจ้งโฟร์แมน
-- ---------------------------------------------------------------------------
create or replace function public.fn_roster_on_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_g record;
  v_emp uuid;
  v_matched int := 0;
begin
  select g.id, g.project_id, g.site_code, g.group_type into v_g
  from public.line_groups g where g.id = new.group_id;
  if v_g.project_id is null then return new; end if;  -- กลุ่ม factory/ยังไม่ผูกบ้าน — ไม่มี roster ต่อบ้าน

  select b.employee_id into v_emp from public.identity_binding b
  where b.line_user_id = new.line_user_id and b.is_active limit 1;

  if v_emp is not null then
    update public.phase_rosters
    set status = 'active', joined_at = timezone('utc', now())
    where project_id = v_g.project_id and employee_id = v_emp and status = 'approved';
    get diagnostics v_matched = row_count;
    if v_matched > 0 then
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('roster_member_joined', v_g.project_id, v_g.site_code,
        jsonb_build_object('employee_id', v_emp, 'line_user_id', new.line_user_id));
      return new;
    end if;
  end if;

  -- ไม่ match roster: ลูกค้าในกลุ่มลูกค้า = ปกติ; guest แปลกหน้า → audit + แจ้งโฟร์แมน (fail-soft)
  if v_g.group_type = 'customer' and new.member_kind = 'guest' then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('unexpected_member_joined', v_g.project_id, v_g.site_code,
      jsonb_build_object('line_user_id', new.line_user_id, 'display_name', coalesce(new.display_name, '')));
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', p.foreman_employee_id),
        'personal_responsibility', 'roster_alert', 'tpl_roster_stranger',
        jsonb_build_object('project_name', p.name),
        false, null, true, null, v_g.site_code)
      from public.installation_projects p
      where p.id = v_g.project_id and p.foreman_employee_id is not null;
    exception when others then null;
    end;
  end if;
  return new;
end; $$;
drop trigger if exists trg_roster_member_join on public.line_group_members;
create trigger trg_roster_member_join after insert on public.line_group_members
  for each row execute function public.fn_roster_on_member_join();

-- ---------------------------------------------------------------------------
-- (4) ตาม: สถานะ roster ต่อบ้าน + จบเฟส → เตือนออกสุภาพ
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_roster_status(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'roster', coalesce((select jsonb_agg(jsonb_build_object(
        'roster_id', r.id, 'phase', r.phase, 'employee_id', r.employee_id,
        'display_name', r.display_name, 'role_ref', r.role_ref, 'status', r.status)
        order by r.phase, r.created_at)
      from public.phase_rosters r where r.project_id = p_project_id), '[]'::jsonb),
    'missing', coalesce((select count(*) from public.phase_rosters r
      where r.project_id = p_project_id and r.status = 'approved'), 0),  -- approve แล้วยังไม่เข้ากลุ่ม
    'unexpected_guests', coalesce((select count(*)
      from public.line_group_members m
      join public.line_groups g on g.id = m.group_id
      where g.project_id = p_project_id and g.group_type = 'customer'
        and m.left_at is null and m.member_kind = 'guest'), 0));
end; $$;

create or replace function public.rpc_field_close_phase(p_project_id uuid, p_phase text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_n int;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  update public.phase_rosters set status = 'left_due'
  where project_id = p_project_id and phase = p_phase and status in ('approved', 'active');
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform public.fn_prod_curated(p_project_id, 'tpl_phase_closed',
      jsonb_build_object('project_name', v_p.name, 'phase_label',
        case p_phase when 'survey' then 'วัดหน้างาน' when 'design' then 'ออกแบบ' else 'ติดตั้ง' end));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('roster_phase_closed', p_project_id, v_p.site_code,
    jsonb_build_object('phase', p_phase, 'members_due', v_n));
  return jsonb_build_object('phase', p_phase, 'members_due', v_n);
end; $$;

-- ---------------------------------------------------------------------------
-- (5) designer matching v1 — manual: list เรียงตามงานในมือ (Mood&Tone tag รอ BJ-3)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_designer_candidates()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(row_to_json(c)) from (
    select b.employee_id,
      coalesce((select t.display_name from public.staff_bind_tokens t
        where t.employee_id = b.employee_id order by t.created_at desc limit 1), 'Designer') as display_name,
      (select count(*) from public.phase_rosters r
        where r.employee_id = b.employee_id and r.phase = 'design'
          and r.status in ('approved', 'active')) as active_houses
    from public.identity_binding b
    where b.is_active and (b.department ilike 'design%' or lower(coalesce(b.app_role, '')) = 'designer')
    order by 3 asc, 2 asc
  ) c), '[]'::jsonb);
end; $$;

-- ---------------------------------------------------------------------------
-- (6) templates
-- ---------------------------------------------------------------------------
insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_roster_assigned', null, '📋 คุณถูกมอบหมายเข้าบ้าน {{project_name}} (ช่วง{{phase_label}}) — รอคนในกลุ่มเชิญเข้ากลุ่ม LINE ของบ้านนี้ได้เลยครับ', true, 'internal', 'text'),
  ('tpl_roster_stranger', null, '⚠️ มีคนที่ไม่อยู่ในทีมเข้ากลุ่มบ้าน {{project_name}} — ช่วยตรวจสอบด้วยครับ', true, 'internal', 'text'),
  ('tpl_phase_closed', null, '🙏 ช่วง{{phase_label}}ของบ้าน {{project_name}} เสร็จเรียบร้อยแล้วครับ ทีมช่วงนี้จะทยอยออกจากกลุ่มนะครับ ขอบคุณครับ', true, 'customer', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

-- ---------------------------------------------------------------------------
-- (7) grants
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_request_assignment(uuid, text, uuid, text, text)',
    'rpc_field_approve_assignment(uuid, boolean, text)',
    'rpc_field_roster_status(uuid)',
    'rpc_field_close_phase(uuid, text)',
    'rpc_field_designer_candidates()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;
