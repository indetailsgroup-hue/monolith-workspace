-- Migration: staff_bind_login — Wave C prep (ADR-040 มติ 2: LINE Login = session + binding + consent จังหวะเดียว)
-- Depends on: 0088 (identity_binding lifecycle cols), 0102/0104 (field RPCs), 0090 (tasks/rooms)
--
--   staff_bind_tokens          ลิงก์ผูกพนักงาน (office ออกต่อคน — ฝัง employee identity; ใช้ครั้งเดียว/48ชม.)
--   rpc_field_issue_staff_bind office ออกลิงก์ผูก (สร้าง employee uuid ใหม่ถ้ายังไม่มี — dogfood ไม่มีตาราง HR)
--   rpc_line_login_upsert      เรียกโดย edge fn line-login (service role): ผูก/ตรวจ binding + consent + auth map
--   rpc_field_my_lanes         เลนของฉันวันนี้ (ช่าง — auth.uid → binding → employee → tasks)
--   rpc_field_toggle_lane_item ติ๊ก checklist ของเลนตัวเอง
--
-- identity_binding += auth_user_id: สะพาน auth.uid ↔ employee (จำเป็นให้ RLS/RPC ฝั่ง PWA รู้ว่า "ฉัน" คือช่างคนไหน)

alter table public.identity_binding add column if not exists auth_user_id uuid null;
create index if not exists ix_identity_binding_auth on public.identity_binding (auth_user_id) where is_active;

create table if not exists public.staff_bind_tokens (
  token text primary key,
  employee_id uuid not null,
  display_name text not null,
  department text not null,
  app_role text null,               -- approver ref ถ้าคนนี้เป็นผู้อนุมัติ (เช่น installation_team_lead)
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.staff_bind_tokens enable row level security;
create policy staff_bind_tokens_sel on public.staff_bind_tokens
  for select to authenticated using (public.is_governance_role());
-- เขียนผ่าน RPC เท่านั้น

create or replace function public.rpc_field_issue_staff_bind(
  p_display_name text,
  p_department text,
  p_app_role text default null,
  p_employee_id uuid default null   -- null = พนักงานใหม่ (สร้าง uuid ให้)
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_token text;
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_display_name), '') = '' or coalesce(btrim(p_department), '') = '' then
    raise exception 'ต้องมีชื่อและแผนก' using errcode = 'check_violation';
  end if;
  v_emp := coalesce(p_employee_id, gen_random_uuid());
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.staff_bind_tokens (token, employee_id, display_name, department, app_role, expires_at)
  values (v_token, v_emp, btrim(p_display_name), btrim(p_department), p_app_role,
          timezone('utc', now()) + interval '48 hours');
  return jsonb_build_object('token', v_token, 'employee_id', v_emp);
end; $$;

create or replace function public.rpc_line_login_upsert(
  p_line_user_id text,
  p_display_name text,
  p_auth_user_id uuid,
  p_bind_token text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tok record;
  v_b record;
begin
  if coalesce(p_line_user_id, '') = '' or p_auth_user_id is null then
    raise exception 'line_user_id + auth_user_id required' using errcode = 'check_violation';
  end if;

  select * into v_b from public.identity_binding b
  where b.line_user_id = p_line_user_id and b.is_active limit 1;

  if p_bind_token is not null then
    select * into v_tok from public.staff_bind_tokens t
    where t.token = p_bind_token and t.used_at is null and t.expires_at > timezone('utc', now())
    for update;
    if v_tok.token is null then
      raise exception 'ลิงก์ผูกไม่ถูกต้องหรือหมดอายุ — ขอลิงก์ใหม่จากออฟฟิศครับ' using errcode = 'check_violation';
    end if;

    if v_b.id is not null then
      -- เคยผูกแล้ว → อัปเดต map auth + consent ล่าสุด (ไม่สร้างซ้ำ)
      update public.identity_binding
        set auth_user_id = p_auth_user_id, consent_at = coalesce(consent_at, timezone('utc', now()))
      where id = v_b.id;
    else
      insert into public.identity_binding
        (employee_id, line_user_id, department, app_role, is_active, consent_at, bound_at, auth_user_id)
      values (v_tok.employee_id, p_line_user_id, v_tok.department, v_tok.app_role, true,
              timezone('utc', now()), timezone('utc', now()), p_auth_user_id);
    end if;
    update public.staff_bind_tokens set used_at = timezone('utc', now()) where token = p_bind_token;
  else
    if v_b.id is null then
      raise exception 'ยังไม่ได้ผูกตัวตน — ใช้ลิงก์ผูกจากออฟฟิศก่อนครับ' using errcode = 'no_data_found';
    end if;
    update public.identity_binding set auth_user_id = p_auth_user_id where id = v_b.id and (auth_user_id is distinct from p_auth_user_id);
  end if;

  insert into public.installation_audit_log (event_type, performed_by, detail)
  values ('staff_line_login', 'line:' || p_line_user_id,
    jsonb_build_object('bound_via_token', p_bind_token is not null, 'display_name', p_display_name));
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.rpc_field_my_lanes()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', t.id, 'lane', t.lane, 'status', t.status, 'template_ref', t.template_ref,
    'checklist_state', t.checklist_state,
    'room', r.display_name, 'project', p.name, 'project_id', p.id
  ) order by p.created_at desc, r.sort_order, t.lane), '[]'::jsonb)
  from public.installation_tasks t
  join public.installation_rooms r on r.id = t.room_id
  join public.installation_projects p on p.id = r.project_id
  where p.status = 'active'
    and t.assignee_employee_id = (
      select b.employee_id from public.identity_binding b
      where b.auth_user_id = auth.uid() and b.is_active limit 1);
$$;

create or replace function public.rpc_field_toggle_lane_item(p_task_id uuid, p_item text, p_done boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_state jsonb;
begin
  select b.employee_id into v_emp from public.identity_binding b
  where b.auth_user_id = auth.uid() and b.is_active limit 1;

  update public.installation_tasks t
    set checklist_state = coalesce(t.checklist_state, '{}'::jsonb) || jsonb_build_object(p_item, p_done),
        status = case when t.status = 'pending' then 'in_progress' else t.status end,
        updated_at = timezone('utc', now())
  where t.id = p_task_id
    and (t.assignee_employee_id = v_emp or public.is_governance_role()
         or public.has_site_access(t.site_code))
  returning t.checklist_state into v_state;
  if v_state is null then
    raise exception 'เลนนี้ไม่ใช่ของคุณ หรือไม่พบเลน' using errcode = 'insufficient_privilege';
  end if;
  return v_state;
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_issue_staff_bind(text, text, text, uuid)',
    'rpc_field_my_lanes()',
    'rpc_field_toggle_lane_item(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  -- login upsert = service role เท่านั้น (เรียกจาก edge fn)
  execute 'revoke all on function public.rpc_line_login_upsert(text, text, uuid, text) from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_line_login_upsert(text, text, uuid, text) to service_role';
  end if;
end $$;
