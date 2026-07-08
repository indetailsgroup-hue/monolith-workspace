-- Migration: daily_report — DJ-2 รายงานประจำวันประกอบอัตโนมัติ (มติ D4-3, รวม task 1.6)
-- Depends on: 0090 (tasks/photos), 0096 (issues), 0120 (checkin man-hours), 0121 (ops_contacts)
--
--   "การติ๊ก checklist + ส่งรูปของช่าง = คือรายงานของช่างในตัว" — เย็นระบบประกอบเอง:
--   ความคืบหน้าต่อเลน + รูปวันนี้ + ปัญหา + ชั่วโมงทีม (DJ-1) → หัวหน้าเติม 1–2 บรรทัด → ส่ง D3/D2/D1
--   หมายเหตุภายใน**ไม่ไปลูกค้า** (curated แยกเส้น — ส่งผ่าน dispatch ภายในเท่านั้น); PDF = follow-up (sender รองรับไฟล์)

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  report_date date not null default (timezone('utc', now()))::date,
  draft jsonb not null,
  remark text,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now()),
  unique (project_id, report_date)
);
alter table public.daily_reports enable row level security;
create policy daily_reports_sel on public.daily_reports for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

-- ---------------------------------------------------------------------------
-- ประกอบร่างจากข้อมูลที่มีอยู่แล้ว (regenerate ทับ draft เดิมของวันได้จนกว่าจะส่ง)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_draft_daily_report(p_project_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_today date := (timezone('utc', now()))::date;
  v_draft jsonb;
  v_existing record;
  v_id uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select id, status into v_existing from public.daily_reports
  where project_id = p_project_id and report_date = v_today;
  if v_existing.status = 'sent' then
    raise exception 'รายงานวันนี้ส่งแล้ว — แก้ไม่ได้ (ฉบับที่ส่ง = snapshot)' using errcode = 'check_violation';
  end if;

  v_draft := jsonb_build_object(
    'project_name', v_p.name,
    'date', v_today,
    'lanes', (select jsonb_build_object(
        'total', count(*),
        'done', count(*) filter (where t.status = 'done'),
        'in_progress', count(*) filter (where t.status = 'in_progress'))
      from public.installation_tasks t
      join public.installation_rooms r on r.id = t.room_id
      where r.project_id = p_project_id),
    'checklist', (select jsonb_build_object(
        'ticked', coalesce(sum((select count(*) from jsonb_each(coalesce(t.checklist_state, '{}'::jsonb)) e
                                where e.value = 'true'::jsonb)), 0))
      from public.installation_tasks t
      join public.installation_rooms r on r.id = t.room_id
      where r.project_id = p_project_id),
    'photos_today', (select count(*) from public.installation_photos ph
      where ph.project_id = p_project_id and ph.created_at >= v_today),
    'issues_today', (select count(*) from public.installation_issues i
      where i.project_id = p_project_id and i.created_at >= v_today),
    'issues_open', (select count(*) from public.installation_issues i
      where i.project_id = p_project_id and i.status <> 'resolved'),
    'man_hours', (select c.man_hours from public.site_checkins c
      where c.project_id = p_project_id and c.work_date = v_today),
    'member_count', (select c.member_count from public.site_checkins c
      where c.project_id = p_project_id and c.work_date = v_today));

  if v_existing.id is not null then
    update public.daily_reports set draft = v_draft where id = v_existing.id returning id into v_id;
  else
    insert into public.daily_reports (project_id, site_code, draft)
    values (p_project_id, v_p.site_code, v_draft) returning id into v_id;
  end if;
  return jsonb_build_object('report_id', v_id, 'draft', v_draft);
end; $$;

-- ---------------------------------------------------------------------------
-- หัวหน้าเติมหมายเหตุ + กดส่ง → D3/D2/D1 (จาก ops_contacts) — snapshot แก้ไม่ได้
-- ---------------------------------------------------------------------------
create or replace function public.rpc_field_send_daily_report(p_report_id uuid, p_remark text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_c record;
  v_sent int := 0;
  v_summary text;
begin
  select d.*, p.name as p_name into v_r
  from public.daily_reports d join public.installation_projects p on p.id = d.project_id
  where d.id = p_report_id for update;
  if not found then raise exception 'report not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_r.site_code) or public.fn_installation_is_member(v_r.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if v_r.status = 'sent' then
    return jsonb_build_object('report_id', p_report_id, 'already', true);
  end if;

  update public.daily_reports
  set status = 'sent', remark = p_remark, sent_at = timezone('utc', now())
  where id = p_report_id;

  v_summary := 'เลนเสร็จ ' || coalesce(v_r.draft #>> '{lanes,done}', '0') || '/' || coalesce(v_r.draft #>> '{lanes,total}', '0')
    || ' · รูปวันนี้ ' || coalesce(v_r.draft ->> 'photos_today', '0')
    || ' · ปัญหาค้าง ' || coalesce(v_r.draft ->> 'issues_open', '0')
    || ' · ' || coalesce(v_r.draft ->> 'man_hours', '-') || ' man-hrs';

  for v_c in select role, employee_id from public.ops_contacts where role in ('D1', 'D2', 'D3') loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_c.employee_id),
        'fyi', 'daily_report', 'tpl_daily_report',
        jsonb_build_object('project_name', v_r.p_name, 'summary', v_summary,
          'remark', left(coalesce(p_remark, '-'), 120)),
        false, null, true, null, v_r.site_code);
      v_sent := v_sent + 1;
    exception when others then null;
    end;
  end loop;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('daily_report_sent', v_r.project_id, v_r.site_code,
    jsonb_build_object('report_id', p_report_id, 'summary', v_summary,
      'remark', left(coalesce(p_remark, ''), 200), 'sent_to', v_sent));
  return jsonb_build_object('report_id', p_report_id, 'sent_to', v_sent, 'already', false);
end; $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_daily_report', null, '📋 รายงานประจำวัน บ้าน {{project_name}}\n{{summary}}\nหมายเหตุหัวหน้า: {{remark}}', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_draft_daily_report(uuid)',
    'rpc_field_send_daily_report(uuid, text)'
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
