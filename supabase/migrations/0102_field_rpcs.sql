-- Migration: field_rpcs — Wave A (ADR-040; tasks 1.5 Wave A (a))
-- Depends on: 0090 (installation_*), 0091 (form_templates), 0095 (line_bind_codes/groups), C12
--
-- RPC ชุดแรกของ Field PWA (สถาปัตยกรรม RPC-only — API roles ไม่มี table DML):
--   rpc_field_create_project  เปิดบ้าน + preset 5 ห้อง + เลน 3/ห้องจาก form_templates ตาม room_type
--   rpc_field_issue_bind_code รหัส #ผูก (6 ตัวอ่านง่าย, 48 ชม., 2 ครั้ง)
--   rpc_field_assign_lane     มอบช่างเข้าเลน
--   rpc_field_list_projects   รายการบ้าน (scope: governance|site|member)
--   rpc_field_project_detail  รายละเอียดบ้าน (ห้อง/เลน/รหัส/กลุ่ม)
-- Preset (มติ owner): kitchen + living + master_bedroom + bedroom_2 + bedroom_3 (ชื่อภาษาคน — UX tenet)

create or replace function public.rpc_field_create_project(
  p_name text,
  p_site_code text,
  p_foreman_employee_id uuid default null,
  p_customer_work_item_id uuid default null,  -- ผูก work item ของ job (ถ้าเปิดจากใบ requirement)
  p_use_preset boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_room record;
  v_room_id uuid;
  v_lane int;
  v_tpl text;
begin
  if not (public.is_governance_role() or (p_site_code is not null and public.has_site_access(p_site_code))) then
    raise exception 'insufficient permission to create installation project' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'project name required' using errcode = 'check_violation';
  end if;

  insert into public.installation_projects (site_code, name, foreman_employee_id, work_item_id)
  values (p_site_code, btrim(p_name), p_foreman_employee_id, p_customer_work_item_id)
  returning id into v_id;

  if p_use_preset then
    -- preset บ้านมาตรฐาน 5 ห้อง (owner 5 ก.ค.) — เลน 3/ห้อง template ตาม room_type
    for v_room in select * from (values
      ('kitchen', 'ห้องครัว', 1), ('living', 'ห้องนั่งเล่น', 2),
      ('master_bedroom', 'ห้องนอนใหญ่', 3), ('bedroom_2', 'ห้องนอน 2', 4), ('bedroom_3', 'ห้องนอน 3', 5)
    ) as t(room_type, display_name, sort_order) loop
      insert into public.installation_rooms (project_id, site_code, room_type, display_name, sort_order)
      values (v_id, p_site_code, v_room.room_type, v_room.display_name, v_room.sort_order)
      returning id into v_room_id;

      for v_lane in 1..3 loop
        -- template ตามชนิดห้อง: ครัว → inst_kitchen_techN, อื่น → inst_room_techN (seed 0091)
        v_tpl := case when v_room.room_type = 'kitchen' then 'inst_kitchen_tech' else 'inst_room_tech' end || v_lane;
        insert into public.installation_tasks (room_id, site_code, lane, template_ref)
        values (v_room_id, p_site_code, v_lane, v_tpl);
      end loop;
    end loop;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('project_created', v_id, p_site_code,
    jsonb_build_object('name', btrim(p_name), 'preset', p_use_preset, 'foreman', p_foreman_employee_id));
  return v_id;
end; $$;

create or replace function public.rpc_field_issue_bind_code(p_project_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_site text;
  v_code text;
begin
  select site_code into v_site from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_site)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  -- 6 ตัวจากชุดอ่านง่าย (ตัด 0/O/1/I) — ชนกันน้อย + retry จน unique
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random()*31))::int + 1, 1), '')
               from generate_series(1, 6));
    begin
      insert into public.line_bind_codes (code, project_id, expires_at, uses_left)
      values (v_code, p_project_id, timezone('utc', now()) + interval '48 hours', 2);
      exit;
    exception when unique_violation then
      -- ชน → วนสุ่มใหม่
    end;
  end loop;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('bind_code_issued', p_project_id, v_site, jsonb_build_object('expires_hours', 48));
  return v_code;
end; $$;

create or replace function public.rpc_field_assign_lane(p_task_id uuid, p_employee_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_site text;
  v_project uuid;
begin
  select t.site_code, r.project_id into v_site, v_project
  from public.installation_tasks t join public.installation_rooms r on r.id = t.room_id
  where t.id = p_task_id;
  if not found then raise exception 'lane not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_site)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  update public.installation_tasks set assignee_employee_id = p_employee_id, updated_at = timezone('utc', now())
  where id = p_task_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('lane_assigned', v_project, v_site, jsonb_build_object('task_id', p_task_id, 'employee_id', p_employee_id));
end; $$;

create or replace function public.rpc_field_list_projects()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'status', p.status, 'site_code', p.site_code,
    'foreman_employee_id', p.foreman_employee_id,
    'rooms', (select count(*) from public.installation_rooms r where r.project_id = p.id),
    'lanes_assigned', (select count(*) from public.installation_tasks t
                       join public.installation_rooms r on r.id = t.room_id
                       where r.project_id = p.id and t.assignee_employee_id is not null),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('type', g.group_type, 'status', g.status)), '[]'::jsonb)
               from public.line_groups g where g.project_id = p.id)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.installation_projects p
  where public.is_governance_role() or public.has_site_access(p.site_code) or public.fn_installation_is_member(p.id);
$$;

create or replace function public.rpc_field_project_detail(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
begin
  select * into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'id', v_p.id, 'name', v_p.name, 'status', v_p.status, 'site_code', v_p.site_code,
    'foreman_employee_id', v_p.foreman_employee_id, 'work_item_id', v_p.work_item_id,
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'room_type', r.room_type, 'display_name', r.display_name, 'sort_order', r.sort_order,
        'lanes', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id, 'lane', t.lane, 'assignee_employee_id', t.assignee_employee_id,
            'template_ref', t.template_ref, 'status', t.status) order by t.lane), '[]'::jsonb)
          from public.installation_tasks t where t.room_id = r.id)
      ) order by r.sort_order), '[]'::jsonb)
      from public.installation_rooms r where r.project_id = v_p.id),
    'bind_codes', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', c.code, 'expires_at', c.expires_at, 'uses_left', c.uses_left)), '[]'::jsonb)
      from public.line_bind_codes c
      where c.project_id = v_p.id and c.expires_at > timezone('utc', now()) and c.uses_left > 0),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object(
        'type', g.group_type, 'status', g.status, 'bound_at', g.bound_at)), '[]'::jsonb)
      from public.line_groups g where g.project_id = v_p.id)
  );
end; $$;

-- grants (RPC-only architecture — เปิดให้ authenticated + service_role ชัดเจน)
do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_create_project(text, text, uuid, uuid, boolean)',
    'rpc_field_issue_bind_code(uuid)',
    'rpc_field_assign_lane(uuid, uuid)',
    'rpc_field_list_projects()',
    'rpc_field_project_detail(uuid)'
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
