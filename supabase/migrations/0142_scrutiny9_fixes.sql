-- Migration: scrutiny9_fixes — ผล scrutinize รอบ 9 (0139–0141)
--
-- S9-1 (0139): บ้าน completed/cancelled แต่ package ยัง active → หลอนอยู่ในคิวผลิต/วัสดุ/โหลดของโรงงาน
--   → rebase rpc_factory_home (0139→0142): กรอง p.status in (active, customer_review) ทั้ง 3 sections
-- S9-2 (0140): survey_handoff ปิดนัดวัดทุกใบรวมนัดอนาคต (วัดรอบเก็บเพิ่มที่นัดไว้พรุ่งนี้หาย)
--   → rebase เฉพาะจุดปิดนัด: ปิดเฉพาะนัดที่ถึงกำหนดแล้ว (scheduled_at <= now)
-- ตรวจสะอาด: 'cancelled' อยู่ใน CHECK จริง (runbook V10 ถูก) · overhead โรงงานไม่ปน job cost รายบ้าน ·
--   today_reports ใช้วันไทย · shortage อาศัย permission ของ raise_issue (fail-closed)
-- ข้อสังเกตจด: นัดที่สร้างหลัง 07:30 วันเดียวกัน = ไม่ได้ reminder เช้า (การ์ด confirm ออกตอนสร้างแล้ว — รับได้)

create or replace function public.rpc_factory_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    -- ① คิว: override ก่อน → วันติดตั้งใกล้สุด → ไม่มีแผน = ท้ายคิว
    'queue', coalesce((select jsonb_agg(row_to_json(q) order by
        q.queue_override asc nulls last, q.install_date asc nulls last, q.created_at) from (
      select w.id as package_id, w.code, w.name, w.queue_override, w.created_at,
        p.id as project_id, p.name as project_name,
        (select pl.start_date from public.installation_plans pl
          where pl.project_id = p.id and pl.status = 'sent'
          order by pl.version desc limit 1) as install_date,
        (select d.label_th from public.package_stages s
          join public.millwork_stage_defs d on d.stage = s.stage
          where s.package_id = w.id and s.status = 'pending' order by s.seq limit 1) as current_stage,
        not exists (select 1 from public.package_materials m
          where m.package_id = w.id and m.status <> 'received') as materials_ready,
        (select count(*) from public.package_materials m where m.package_id = w.id) as material_count
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      where w.status = 'active'
        and p.status in ('active', 'customer_review')
        and (public.is_governance_role() or public.has_site_access(p.site_code))) q), '[]'::jsonb),
    -- ② วัสดุรอสั่ง/รอรับ
    'materials_pending', coalesce((select jsonb_agg(row_to_json(m) order by m.status desc, m.created_at) from (
      select pm.id as material_id, pm.name, pm.qty, pm.unit, pm.status, pm.created_at,
        w.code as package_code, p.name as project_name
      from public.package_materials pm
      join public.work_packages w on w.id = pm.package_id
      join public.installation_projects p on p.id = w.project_id
      where pm.status <> 'received' and w.status = 'active'
        and p.status in ('active', 'customer_review')
        and (public.is_governance_role() or public.has_site_access(p.site_code))) m), '[]'::jsonb),
    -- ③ โหลดต่อสถานีผลิต (ขั้น 7–10 ที่เป็นขั้นปัจจุบัน — คอขวดเห็นชัด)
    'load', coalesce((select jsonb_object_agg(l.label_th, l.n) from (
      select d.label_th, count(*) as n
      from public.work_packages w
      join public.installation_projects p on p.id = w.project_id
      cross join lateral (
        select s.stage from public.package_stages s
        where s.package_id = w.id and s.status = 'pending' order by s.seq limit 1
      ) cur
      join public.millwork_stage_defs d on d.stage = cur.stage
      where w.status = 'active'
        and p.status in ('active', 'customer_review') and d.seq between 7 and 10
        and (public.is_governance_role() or public.has_site_access(p.site_code))
      group by d.label_th, d.seq order by d.seq) l), '{}'::jsonb));
end; $$;

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
  where project_id = p_project_id and kind = 'survey' and status = 'scheduled'
    and scheduled_at <= timezone('utc', now());  -- S9-2: นัดอนาคต (วัดรอบเก็บเพิ่ม) คงอยู่

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('survey_handed_off', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'summary', left(btrim(p_summary), 120)));
  return jsonb_build_object('artifact_id', v_artifact, 'zones', v_zones, 'already', false);
end; $$;
