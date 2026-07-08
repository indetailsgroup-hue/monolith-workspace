-- Migration: designer_home — BJ-4 หน้าแรก Designer "คิวของฉันวันนี้" (มติ B2-4)
-- Depends on: 0110/0125 (roster design = บ้านของ designer), 0124 (gate SLA config), 0109 (site verification),
--             0121 (issues category design), 0098 (awaiting_approval @3D_Rendering_Final)
--
--   เรียงคิวตาม "ใครกำลังรอคุณกี่คน": ① gate โรงงานค้าง (ไลน์ 27 คนรอ — บนสุดเสมอ + นาทีที่รอ/SLA)
--   ② ตรวจหน้างานร่วมค้าง (งานเดินถึงช่วง G3 แต่ยังไม่มีผลตรวจ — ADR-039 มติ 3) ③ แบบรอลูกค้าเซ็น (+วันรอ)
--   ④ issue "ตามแบบไม่ได้" ที่ยังเปิด; ปุ่ม "เปิดใน MONOLITH" = ฝั่ง UI (config URL)
--   นัดหมายเต็มรูป = follow-up เมื่อมีตารางนัด (ยังไม่มี entity นัดในระบบ — ไม่เดา)

create or replace function public.rpc_field_designer_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
begin
  select b.employee_id into v_emp from public.identity_binding b
  where b.auth_user_id = auth.uid() and b.is_active limit 1;
  if not (v_emp is not null or public.is_governance_role() or exists (
    select 1 from public.get_active_site_codes() s where public.has_site_access(s.site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    -- ① gate โรงงานรอ approve (บนสุดเสมอ — ไลน์ผลิตกำลังรอ)
    'gates', coalesce((select jsonb_agg(row_to_json(g) order by g.waiting_minutes desc) from (
      select m.id as milestone_id, p.id as project_id, p.name, m.station,
        floor(extract(epoch from (timezone('utc', now()) - m.reported_at)) / 60)::int as waiting_minutes,
        c.sla_minutes,
        p.work_item_id
      from public.production_milestones m
      join public.installation_projects p on p.id = m.project_id
      join public.factory_gate_config c on c.station = m.station
      where m.is_gate and m.approved_at is null and m.reported_at is not null
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) g), '[]'::jsonb),

    -- ② ตรวจหน้างานร่วมค้าง (งานรอเซ็น G3 แต่ไม่มีผลตรวจ site_design_verification)
    'verify_pending', coalesce((select jsonb_agg(row_to_json(v)) from (
      select p.id as project_id, p.name, p.work_item_id
      from public.installation_projects p
      join public.work_item w on w.id = p.work_item_id
      where w.current_step = '3D_Rendering_Final'
        and not exists (select 1 from public.capture_artifact a
          where a.capture_type = 'site_design_verification' and a.status = 'emitted'
            and a.linked_entity_id = p.id)
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) v), '[]'::jsonb),

    -- ③ แบบรอลูกค้าเซ็น (G3 ค้าง; work_item ไม่มี updated_at — ใช้อายุงานเป็นตัวเรียง ไม่เดาเวลารอ)
    'awaiting_sign', coalesce((select jsonb_agg(row_to_json(s) order by s.age_days desc) from (
      select p.id as project_id, p.name, p.work_item_id,
        floor(extract(epoch from (timezone('utc', now()) - w.created_at)) / 86400)::int as age_days
      from public.installation_projects p
      join public.work_item w on w.id = p.work_item_id
      where w.status = 'awaiting_approval' and w.current_step = '3D_Rendering_Final'
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) s), '[]'::jsonb),

    -- ④ issue "ตามแบบไม่ได้" ที่ยังเปิด
    'design_issues', coalesce((select jsonb_agg(row_to_json(i) order by i.created_at) from (
      select i.id as issue_id, p.id as project_id, p.name, i.description, i.created_at,
        (i.acked_at is not null) as acked
      from public.installation_issues i
      join public.installation_projects p on p.id = i.project_id
      where i.category = 'design' and i.status <> 'resolved'
        and (v_emp is null or exists (select 1 from public.phase_rosters r
          where r.project_id = p.id and r.phase = 'design' and r.employee_id = v_emp
            and r.status in ('approved', 'active')))
    ) i), '[]'::jsonb));
end; $$;

do $$
begin
  execute 'revoke all on function public.rpc_field_designer_home() from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_designer_home() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_designer_home() to service_role';
  end if;
end $$;
