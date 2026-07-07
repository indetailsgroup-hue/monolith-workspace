-- Migration: field_lead_rpcs — Wave B มุมหัวหน้าทีม (ADR-039/040; tasks 1.5 Wave B, DJ)
-- Depends on: 0094/0100 (promote + RACI Installation gate), 0098 (request_customer_acceptance),
--             0096 (issues), 0091 (inst_site_readiness), 0103 (pattern ห่อ capture)
--
--   rpc_field_t0_snapshot   บันทึก T0 ก่อน approve เริ่มงาน (ADR-039 มติ 4 — soft + audit; ไม่ block)
--   rpc_field_close_house   "ใบปิดบ้าน" (ADR-039 มติ 2/3): ห่อ ingest→verify→promote ('installation_proof')
--                           → RACI gate ใน promote ตัดสินว่าเป็นหัวหน้าทีมจริง; soft warn ห้องไม่มีรูป
--   rpc_field_list_issues   รายการ #ปัญหา/punch ของบ้าน (มุมหัวหน้า + DJ-3/AS-1 ใช้ต่อ)

create or replace function public.rpc_field_t0_snapshot(p_project_id uuid, p_checklist jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_site text;
begin
  select site_code into v_site from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_site) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  -- soft + audit (ADR-039 มติ 4): snapshot สถานะ ณ วินาทีตัดสินใจ — ไม่ block แม้ไม่ครบ
  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('t0_snapshot', p_project_id, v_site,
    jsonb_build_object('checklist', coalesce(p_checklist, '{}'::jsonb),
      'complete', (select bool_and(coalesce(v.value::text = 'true', false))
                   from jsonb_each(coalesce(p_checklist, '{}'::jsonb)) v)));
end; $$;

create or replace function public.rpc_field_close_house(p_project_id uuid, p_client_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_rooms_no_proof int;
begin
  select p.id, p.site_code, p.work_item_id, p.name into v_p
  from public.installation_projects p where p.id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if v_p.work_item_id is null then
    raise exception 'บ้านนี้ยังไม่ผูกงานในระบบ (work item)' using errcode = 'check_violation';
  end if;
  if coalesce(p_client_key, '') = '' then
    raise exception 'client key required' using errcode = 'check_violation';
  end if;
  -- สิทธิ์เบื้องต้น (RACI gate ตัวจริงอยู่ใน promote — ADR-039 มติ 2)
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  -- soft warning (ADR-039 มติ 3): ห้องที่ยังไม่มีรูปหลักฐาน — เตือน ไม่ block (อำนาจอยู่ที่หัวหน้า)
  select count(*) into v_rooms_no_proof
  from public.installation_rooms r
  where r.project_id = p_project_id
    and not exists (select 1 from public.installation_photos ph where ph.room_id = r.id);

  v_artifact := public.rpc_capture_ingest(
    'installation_proof', 'app',
    'app://field/close-house/' || p_client_key,
    'field-close-' || p_client_key,
    v_p.site_code);

  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('already', true, 'rooms_without_proof', v_rooms_no_proof);
  end if;

  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0,
      'ใบปิดบ้าน (field app) — rooms_without_proof=' || v_rooms_no_proof,
      jsonb_build_object('project_id', p_project_id, 'project_name', v_p.name));
  end if;

  -- promote → adapter ตรวจ RACI หัวหน้าทีม Installation + complete work item (0094)
  perform public.rpc_capture_promote(v_artifact, 'work_item', v_p.work_item_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('house_closed', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'rooms_without_proof', v_rooms_no_proof));

  return jsonb_build_object('already', false, 'rooms_without_proof', v_rooms_no_proof);
end; $$;

create or replace function public.rpc_field_list_issues(p_project_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'description', i.description, 'status', i.status, 'source', i.source,
    'created_at', i.created_at, 'resolved_at', i.resolved_at) order by i.created_at desc), '[]'::jsonb)
  from public.installation_issues i
  where i.project_id = p_project_id
    and (public.is_governance_role() or public.has_site_access(i.site_code) or public.fn_installation_is_member(i.project_id));
$$;

create or replace function public.rpc_field_resolve_issue(p_issue_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_site text; v_project uuid;
begin
  select site_code, project_id into v_site, v_project from public.installation_issues where id = p_issue_id;
  if not found then raise exception 'issue not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_site) or public.fn_installation_is_member(v_project)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  update public.installation_issues
    set status = 'resolved', resolved_by = public.resolve_actor(), resolved_at = timezone('utc', now())
  where id = p_issue_id and status <> 'resolved';
end; $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_t0_snapshot(uuid, jsonb)',
    'rpc_field_close_house(uuid, text)',
    'rpc_field_list_issues(uuid)',
    'rpc_field_resolve_issue(uuid)'
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
