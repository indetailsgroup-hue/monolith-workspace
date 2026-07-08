-- Migration: issue_routing — DJ-3 escalation ประตูเดียว + ประเภท 4 ปุ่ม → ระบบ route เอง (มติ D4-4)
-- Depends on: 0096 (installation_issues — ประตูเดียวเดิม), 0084 (dispatch), 0089 (pg_cron)
--
--   หลัก D-12: หัวหน้าไม่ต้องจำว่าเรื่องไหนโทรหาใคร — ระบบจำแทน
--   ของขาด/ผิด → E6+E2+E7 · ติดตั้งตามแบบไม่ได้ → B2+B4 · ลูกค้าขอเพิ่ม → Sale+PM + flag requote (ADR-037
--   — ห้ามตกลงปากเปล่า: ปิดรูรั่ว "งานเพิ่มที่ไม่เคยถูกคิดเงิน") · ความปลอดภัย → D3+HSE ทันที ข้าม quiet hours
--   ทุกประเภท: เกิน SLA ไม่มีคน ack → ไต่ D1 PM อัตโนมัติ; ไม่มีคนตรง role เลย → ไต่ D1 ทันที (fail-safe)

-- ---------------------------------------------------------------------------
-- (1) คอลัมน์ category/ack/escalate + routing map + ผู้รับตามบทบาท
-- ---------------------------------------------------------------------------
alter table public.installation_issues add column if not exists category text
  check (category is null or category in ('material', 'design', 'scope', 'safety'));
alter table public.installation_issues add column if not exists acked_at timestamptz;
alter table public.installation_issues add column if not exists acked_by text;
alter table public.installation_issues add column if not exists escalated_to_pm_at timestamptz;

create table if not exists public.issue_routing (
  category text primary key check (category in ('material', 'design', 'scope', 'safety')),
  target_roles text[] not null,        -- match กับ identity_binding.app_role (case-insensitive)
  bypass_quiet boolean not null default false,
  sla_minutes int not null check (sla_minutes > 0),
  label_th text not null
);
insert into public.issue_routing (category, target_roles, bypass_quiet, sla_minutes, label_th) values
  ('material', array['E6','E2','E7'], false, 120, 'ของขาด/ของผิด'),
  ('design',   array['B2','B4'],      false, 120, 'ติดตั้งตามแบบไม่ได้'),
  ('scope',    array['Sale','D1'],    false, 240, 'ลูกค้าขอเพิ่ม/แก้หน้างาน'),
  ('safety',   array['D3','HSE'],     true,   30, 'ความปลอดภัย')
on conflict (category) do update set
  target_roles = excluded.target_roles, bypass_quiet = excluded.bypass_quiet,
  sla_minutes = excluded.sla_minutes, label_th = excluded.label_th;
alter table public.issue_routing enable row level security;
create policy issue_routing_sel on public.issue_routing for select to authenticated using (true);

-- ผู้รับตามบทบาทกลาง (D1 PM สำหรับ SLA — ตั้งโดย governance; ขยาย role อื่นได้)
create table if not exists public.ops_contacts (
  role text primary key,
  employee_id uuid not null,
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);
alter table public.ops_contacts enable row level security;
create policy ops_contacts_sel on public.ops_contacts for select to authenticated using (true);

create or replace function public.rpc_field_set_ops_contact(p_role text, p_employee_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_governance_role() then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  insert into public.ops_contacts (role, employee_id, updated_by)
  values (p_role, p_employee_id, public.resolve_actor())
  on conflict (role) do update set employee_id = excluded.employee_id,
    updated_by = excluded.updated_by, updated_at = timezone('utc', now());
end; $$;

-- ---------------------------------------------------------------------------
-- (2) แจ้งปัญหาแบบเลือกประเภท → route อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_raise_issue(
  p_project_id uuid, p_category text, p_description text, p_room_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_r record;
  v_id uuid;
  v_target record;
  v_notified int := 0;
  v_pm uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  select * into v_r from public.issue_routing where category = p_category;
  if not found then
    raise exception 'ประเภทต้องเป็น: material / design / scope / safety' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'ต้องมีรายละเอียดปัญหา' using errcode = 'check_violation';
  end if;

  insert into public.installation_issues (project_id, room_id, site_code, source, reported_by, description, category)
  values (p_project_id, p_room_id, v_p.site_code, 'pwa', public.resolve_actor(),
    '[' || v_r.label_th || '] ' || btrim(p_description), p_category)
  returning id into v_id;

  -- route ถึงทุกคนที่ app_role ตรง (safety: bypass quiet hours = ส่งเดี๋ยวนี้)
  for v_target in
    select distinct b.employee_id from public.identity_binding b
    where b.is_active and lower(coalesce(b.app_role, '')) = any (select lower(r) from unnest(v_r.target_roles) r)
  loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_target.employee_id),
        'personal_responsibility', 'issue_routing', 'tpl_issue_routed',
        jsonb_build_object('project_name', v_p.name, 'category', v_r.label_th,
          'detail', left(btrim(p_description), 80)),
        false, case when v_r.bypass_quiet then false else null end, true, null, v_p.site_code);
      v_notified := v_notified + 1;
    exception when others then null;
    end;
  end loop;

  -- มติ ADR-037: ลูกค้าขอเพิ่ม = flag เส้น requote — ห้ามตกลงปากเปล่า
  if p_category = 'scope' then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('scope_change_flagged', p_project_id, v_p.site_code,
      jsonb_build_object('issue_id', v_id, 'detail', left(btrim(p_description), 200),
        'note', 'เข้าเส้น requote ADR-037 — ห้ามตกลงปากเปล่า'));
  end if;

  -- fail-safe: ไม่มีคนตรง role เลย → ไต่ D1 ทันที
  if v_notified = 0 then
    select employee_id into v_pm from public.ops_contacts where role = 'D1';
    if v_pm is not null then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_pm),
          'personal_responsibility', 'issue_routing', 'tpl_issue_escalated',
          jsonb_build_object('project_name', v_p.name, 'category', v_r.label_th,
            'detail', left(btrim(p_description), 80)),
          false, case when v_r.bypass_quiet then false else null end, true, null, v_p.site_code);
      exception when others then null;
      end;
    end if;
    update public.installation_issues set escalated_to_pm_at = timezone('utc', now()) where id = v_id;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('issue_raised', p_project_id, v_p.site_code,
    jsonb_build_object('issue_id', v_id, 'category', p_category, 'notified', v_notified));
  return jsonb_build_object('issue_id', v_id, 'category', p_category, 'notified', v_notified);
end; $$;

create or replace function public.rpc_field_ack_issue(p_issue_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_i record;
begin
  select i.*, p.site_code as p_site into v_i
  from public.installation_issues i join public.installation_projects p on p.id = i.project_id
  where i.id = p_issue_id for update;
  if not found then raise exception 'issue not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_i.p_site) or public.fn_installation_is_member(v_i.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_i.acked_at is not null then
    return jsonb_build_object('issue_id', p_issue_id, 'already', true);
  end if;
  update public.installation_issues
  set status = case when status = 'open' then 'acknowledged' else status end,
      acked_at = timezone('utc', now()), acked_by = public.resolve_actor()
  where id = p_issue_id;
  return jsonb_build_object('issue_id', p_issue_id, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) SLA sweep: เกินเวลาไม่มีใคร ack → ไต่ D1 PM (ครั้งเดียวต่อ issue)
-- ---------------------------------------------------------------------------
create or replace function public.fn_issue_sla_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_i record;
  v_pm uuid;
  v_n int := 0;
begin
  select employee_id into v_pm from public.ops_contacts where role = 'D1';
  if v_pm is null then return jsonb_build_object('escalated', 0, 'note', 'ops_contacts D1 ยังไม่ตั้ง'); end if;

  for v_i in
    select i.id, i.project_id, i.site_code, i.category, i.description, p.name as p_name, r.bypass_quiet
    from public.installation_issues i
    join public.installation_projects p on p.id = i.project_id
    join public.issue_routing r on r.category = i.category
    where i.status = 'open' and i.acked_at is null and i.escalated_to_pm_at is null
      and i.created_at < timezone('utc', now()) - make_interval(mins => r.sla_minutes)
  loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_pm),
        'personal_responsibility', 'issue_routing', 'tpl_issue_escalated',
        jsonb_build_object('project_name', v_i.p_name,
          'category', (select label_th from public.issue_routing where category = v_i.category),
          'detail', left(v_i.description, 80)),
        false, case when v_i.bypass_quiet then false else null end, true, null, v_i.site_code);
      update public.installation_issues set escalated_to_pm_at = timezone('utc', now()) where id = v_i.id;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('issue_sla_escalated', v_i.project_id, v_i.site_code,
        jsonb_build_object('issue_id', v_i.id, 'category', v_i.category));
      v_n := v_n + 1;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('escalated', v_n);
end; $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-issue-sla-sweep';
    perform cron.schedule('wf-issue-sla-sweep', '*/15 * * * *', 'select public.fn_issue_sla_sweep()');
  else
    raise notice 'pg_cron unavailable — issue SLA sweep จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_issue_routed', null, '🔧 [{{category}}] บ้าน {{project_name}}: {{detail}} — เรื่องนี้ route ถึงคุณตามบทบาท ช่วยรับเรื่อง (ack) ในระบบด้วยครับ', true, 'internal', 'text'),
  ('tpl_issue_escalated', null, '⚠️ [{{category}}] บ้าน {{project_name}} ไม่มีคนรับเรื่องภายใน SLA: {{detail}} — ไต่ถึง PM ตามระบบครับ', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_set_ops_contact(text, uuid)',
    'rpc_field_raise_issue(uuid, text, text, uuid)',
    'rpc_field_ack_issue(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  execute 'revoke all on function public.fn_issue_sla_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_issue_sla_sweep() to service_role';
  end if;
end $$;
