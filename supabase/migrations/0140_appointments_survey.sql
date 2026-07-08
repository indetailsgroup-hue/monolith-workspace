-- Migration: appointments_survey — Phase CQ (ADR-048): นัดหมายกลาง · จบวัด=handoff · หน้าคิววัด C1
-- Depends on: 0110 (roster — ทีมตามชนิดนัด), 0107 (fn_prod_curated), 0073/0074 (site_survey_zone — นับโซน),
--             0092 (capture spine), 0130 (fn_business_date)

-- ---------------------------------------------------------------------------
-- (1) นัดหมายกลาง (ใช้ร่วม วัด/ตรวจร่วม/ติดตั้ง — ปลดล็อก "นัดวันนี้" ของทุกหน้า)
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.installation_projects(id),
  site_code text,
  kind text not null check (kind in ('survey', 'site_verification', 'installation')),
  scheduled_at timestamptz not null,
  note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  reminded_at timestamptz,
  done_at timestamptz,
  created_by text not null default public.resolve_actor(),
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.appointments enable row level security;
create policy appointments_sel on public.appointments for select to authenticated
  using (exists (
    select 1 from public.installation_projects p where p.id = project_id
      and (public.is_governance_role() or public.has_site_access(p.site_code)
           or public.fn_installation_is_member(p.id))));

create or replace function public.rpc_field_create_appointment(
  p_project_id uuid, p_kind text, p_scheduled_at timestamptz, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_id uuid;
  v_kind_th text;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  v_kind_th := case p_kind when 'survey' then 'วัดหน้างาน'
    when 'site_verification' then 'ตรวจหน้างานร่วม (ทีมวัด+ดีไซเนอร์)'
    when 'installation' then 'เข้าติดตั้ง' end;
  if v_kind_th is null then
    raise exception 'ชนิดนัดต้องเป็น: survey / site_verification / installation' using errcode = 'check_violation';
  end if;
  if p_scheduled_at is null or p_scheduled_at < timezone('utc', now()) then
    raise exception 'เวลานัดต้องเป็นอนาคต' using errcode = 'check_violation';
  end if;

  insert into public.appointments (project_id, site_code, kind, scheduled_at, note)
  values (p_project_id, v_p.site_code, p_kind, p_scheduled_at, p_note)
  returning id into v_id;

  -- การ์ด confirm เข้ากลุ่มลูกค้า (เวลาแสดงเป็นเวลาไทย)
  perform public.fn_prod_curated(p_project_id, 'tpl_appointment', jsonb_build_object(
    'project_name', v_p.name, 'kind', v_kind_th,
    'when', to_char(p_scheduled_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') || ' น.'));

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('appointment_created', p_project_id, v_p.site_code,
    jsonb_build_object('appointment_id', v_id, 'kind', p_kind, 'scheduled_at', p_scheduled_at));
  return jsonb_build_object('appointment_id', v_id);
end; $$;

create or replace function public.rpc_field_appointment_status(p_appointment_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_a record;
begin
  select a.*, p.site_code as p_site into v_a
  from public.appointments a join public.installation_projects p on p.id = a.project_id
  where a.id = p_appointment_id for update;
  if not found then raise exception 'appointment not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_a.p_site) or public.fn_installation_is_member(v_a.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('done', 'cancelled') then
    raise exception 'สถานะต้องเป็น done หรือ cancelled' using errcode = 'check_violation';
  end if;
  if v_a.status <> 'scheduled' then
    return jsonb_build_object('appointment_id', p_appointment_id, 'already', true);
  end if;
  update public.appointments
  set status = p_status, done_at = case when p_status = 'done' then timezone('utc', now()) end
  where id = p_appointment_id;
  return jsonb_build_object('appointment_id', p_appointment_id, 'already', false);
end; $$;

-- เตือนทีมเช้าวันนัด (dispatch ถึง roster เฟสที่ตรงชนิด — ครั้งเดียวต่อนัด)
create or replace function public.fn_appointment_reminder_sweep()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_a record;
  v_m record;
  v_phase text;
  v_n int := 0;
begin
  for v_a in
    select a.*, p.name as p_name from public.appointments a
    join public.installation_projects p on p.id = a.project_id
    where a.status = 'scheduled' and a.reminded_at is null
      and (a.scheduled_at at time zone 'Asia/Bangkok')::date = public.fn_business_date()
  loop
    v_phase := case v_a.kind when 'survey' then 'survey'
      when 'site_verification' then 'design' else 'installation' end;
    for v_m in
      select r.employee_id from public.phase_rosters r
      where r.project_id = v_a.project_id and r.phase = v_phase
        and r.status in ('approved', 'active')
    loop
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_m.employee_id),
          'personal_responsibility', 'appointment', 'tpl_appointment_today',
          jsonb_build_object('project_name', v_a.p_name,
            'when', to_char(v_a.scheduled_at at time zone 'Asia/Bangkok', 'HH24:MI') || ' น.'),
          false, null, true, null, v_a.site_code);
      exception when others then null;
      end;
    end loop;
    update public.appointments set reminded_at = timezone('utc', now()) where id = v_a.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('reminded', v_n);
end; $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-appointment-reminder';
    perform cron.schedule('wf-appointment-reminder', '30 0 * * *', 'select public.fn_appointment_reminder_sweep()');
  else
    raise notice 'pg_cron unavailable — appointment reminder จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (2) จบวัด–ส่งมอบให้ออกแบบ (capture handoff + แจ้ง designer + ปิดนัดวัด)
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'survey_handoff',
  jsonb_build_object('project_id','string','summary','string','zone_count','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'C1 ยืนยันว่าข้อมูลวัดครบทุกโซน พร้อมส่งมอบให้ฝ่ายออกแบบ',
    'guards_against', 'designer เริ่มออกแบบจากข้อมูลวัดที่ยังไม่ครบ — แบบผิดตั้งแต่ต้นทาง',
    'method', 'จบวัดครบทุกโซน → C1 กดส่งมอบ (นับโซนจาก site_survey_zone อัตโนมัติ)',
    'pfmea_ref', jsonb_build_object('source_file', 'ADR-048', 'source_step', 'Survey'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 7)
  )),
  'evidence_only',
  array['project_id','summary']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create or replace function public.rpc_field_survey_handoff(
  p_project_id uuid, p_summary text, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_zones int;
  v_d record;
begin
  select id, site_code, name, work_item_id into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_summary), '') = '' then
    raise exception 'ต้องมีสรุปผลการวัด' using errcode = 'check_violation';
  end if;

  -- นับโซนจากข้อมูลวัดจริง (best effort — โซนผูกผ่าน capture ต้นทาง)
  select count(*) into v_zones from public.site_survey_zone z
  join public.capture_artifact a on a.id = z.source_capture_id
  where a.linked_entity_id = v_p.work_item_id and z.superseded_by is null;

  v_artifact := public.rpc_capture_ingest('survey_handoff', 'app',
    'app://field/survey-handoff/' || coalesce(p_client_key, gen_random_uuid()::text),
    'svh-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'จบวัด–ส่งมอบ (C1)',
      jsonb_build_object('project_id', p_project_id::text, 'summary', btrim(p_summary),
        'zone_count', v_zones::text));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  -- แจ้ง designer ของบ้าน (roster design) — fail-soft รายคน
  for v_d in
    select r.employee_id from public.phase_rosters r
    where r.project_id = p_project_id and r.phase = 'design' and r.status in ('approved', 'active')
  loop
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_d.employee_id),
        'personal_responsibility', 'survey_handoff', 'tpl_survey_ready',
        jsonb_build_object('project_name', v_p.name, 'zones', v_zones::text),
        false, null, true, null, v_p.site_code);
    exception when others then null;
    end;
  end loop;

  -- ปิดนัดวัดที่ค้างของบ้านนี้
  update public.appointments set status = 'done', done_at = timezone('utc', now())
  where project_id = p_project_id and kind = 'survey' and status = 'scheduled';

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('survey_handed_off', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'summary', left(btrim(p_summary), 120)));
  return jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'already', false);
end; $$;

-- ---------------------------------------------------------------------------
-- (3) หน้าแรก C1 "คิววัดวันนี้"
-- ---------------------------------------------------------------------------
create or replace function public.rpc_survey_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'appointments', coalesce((select jsonb_agg(row_to_json(a) order by a.scheduled_at) from (
      select ap.id as appointment_id, p.id as project_id, p.name, ap.kind, ap.scheduled_at, ap.note,
        (select count(*) from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'survey' and r.status in ('approved', 'active')) as team_count
      from public.appointments ap
      join public.installation_projects p on p.id = ap.project_id
      where ap.status = 'scheduled' and ap.kind in ('survey', 'site_verification')
        and (ap.scheduled_at at time zone 'Asia/Bangkok')::date <= public.fn_business_date() + 1
        and (public.is_governance_role() or public.has_site_access(p.site_code))) a), '[]'::jsonb),
    'pending_assign', coalesce((select jsonb_agg(row_to_json(r2) order by r2.created_at) from (
      select r.id as roster_id, p.id as project_id, p.name, r.display_name, r.role_ref, r.created_at
      from public.phase_rosters r
      join public.installation_projects p on p.id = r.project_id
      where r.phase = 'survey' and r.status = 'requested'
        and (public.is_governance_role() or public.has_site_access(p.site_code))) r2), '[]'::jsonb),
    'awaiting_handoff', coalesce((select jsonb_agg(row_to_json(h)) from (
      select p.id as project_id, p.name
      from public.installation_projects p
      where p.status = 'active'
        and exists (select 1 from public.appointments ap
          where ap.project_id = p.id and ap.kind = 'survey' and ap.status = 'done')
        and not exists (select 1 from public.capture_artifact a
          where a.capture_type = 'survey_handoff' and a.status = 'emitted' and a.linked_entity_id = p.id)
        and (public.is_governance_role() or public.has_site_access(p.site_code))) h), '[]'::jsonb));
end; $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_appointment', null, '📅 นัดหมาย{{kind}} — บ้าน {{project_name}}' || chr(10) || 'วันเวลา: {{when}}' || chr(10) || 'ทีมงานจะเข้าตามนัดครับ หากต้องการเลื่อนแจ้งในกลุ่มนี้ได้เลย', true, 'customer', 'text'),
  ('tpl_appointment_today', null, '📅 วันนี้มีนัดบ้าน {{project_name}} เวลา {{when}} — เตรียมทีม/อุปกรณ์ให้พร้อมครับ', true, 'internal', 'text'),
  ('tpl_survey_ready', null, '📐 บ้าน {{project_name}} วัดเสร็จส่งมอบแล้ว ({{zones}} โซน) — เริ่มออกแบบได้เลยครับ', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_create_appointment(uuid, text, timestamptz, text)',
    'rpc_field_appointment_status(uuid, text)',
    'rpc_field_survey_handoff(uuid, text, text)',
    'rpc_survey_home()'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  execute 'revoke all on function public.fn_appointment_reminder_sweep() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_appointment_reminder_sweep() to service_role';
  end if;
end $$;
