-- Migration: qualify_group — J2.8 กลุ่มลูกค้าเกิดตั้งแต่ Qualify (ADR-041 journey v2 เฟส 1)
-- Depends on: 0103 (rpc_field_submit_requirement — **ตรวจแล้วเป็น version ล่าสุด**), 0102 (create_project + issue_bind_code)
--
-- เดิม: Sale กรอกใบ requirement → work_item เปิด แต่ "บ้าน" กับรหัสผูกกลุ่มเป็นก้าว manual แยกทีหลัง
-- J2.8: กรอกจบ = งานเปิด + บ้านเปิด + รหัสผูกออกทันที (reuse rpc_field_create_project/issue_bind_code — ไม่ fork)
--        → Sale ตั้งกลุ่ม LINE กับลูกค้าได้ในนาทีแรกของ qualify ตาม journey v2

create or replace function public.rpc_field_submit_requirement(
  p_fields jsonb,          -- ฟิลด์ตาม capture_type_config.customer_requirement (+customer_id optional)
  p_site_code text,
  p_client_key text        -- idempotency key จากฝั่ง client (uuid ต่อการกดส่งหนึ่งครั้ง)
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_artifact uuid;
  v_status text;
  v_wi uuid;
  v_project uuid;
  v_code text;
begin
  if not (public.is_governance_role() or (p_site_code is not null and public.has_site_access(p_site_code))) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_client_key, '') = '' then
    raise exception 'client key required (idempotency)' using errcode = 'check_violation';
  end if;

  -- fail-safe critical fields ที่ปากทาง (PFMEA Sale: เก็บไม่ครบ = Scrap 100%) — adapter เช็คซ้ำชั้นในอีกที
  if coalesce(btrim(p_fields ->> 'customer_name'), '') = '' then
    raise exception 'ต้องมีชื่อลูกค้า' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_fields ->> 'phone'), '') = '' and coalesce(btrim(p_fields ->> 'line_id'), '') = '' then
    raise exception 'ต้องมีช่องทางติดต่อ (เบอร์โทร หรือ LINE ID)' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_fields ->> 'project_name'), '') = '' then
    raise exception 'ต้องมีชื่อโครงการ/บ้าน' using errcode = 'check_violation';
  end if;

  -- ingest (idempotent ตาม key — เรียกซ้ำได้ใบเดิม)
  v_artifact := public.rpc_capture_ingest(
    'customer_requirement', 'app',
    'app://field/requirement/' || p_client_key,
    'field-req-' || p_client_key,
    p_site_code);

  select status::text into v_status from public.capture_artifact where id = v_artifact;

  -- retry หลังสำเร็จแล้ว → คืนผลเดิมครบชุด (offline queue กดซ้ำ = no-op)
  if v_status = 'emitted' then
    select linked_entity_id into v_wi from public.capture_artifact where id = v_artifact;
    select id into v_project from public.installation_projects where work_item_id = v_wi;
    if v_project is not null then
      select c.code into v_code from public.line_bind_codes c
      where c.project_id = v_project and c.uses_left > 0 and c.expires_at > timezone('utc', now())
      order by c.created_at desc limit 1;
    end if;
    return jsonb_build_object('artifact_id', v_artifact, 'work_item_id', v_wi,
      'project_id', v_project, 'bind_code', v_code, 'already', true);
  end if;

  -- verify: มนุษย์ (Sale) ยืนยันเอง — ฟอร์มบังคับ critical แล้ว; ค่าเข้า corrected_fields (ADR-033)
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'field form (manual entry)', p_fields);
  end if;

  -- promote → เปิด work_item + ผูก primary_customer_id (0100)
  perform public.rpc_capture_promote(v_artifact);
  select linked_entity_id into v_wi from public.capture_artifact where id = v_artifact;

  -- J2.8: เปิดบ้าน + ออกรหัสผูกกลุ่มทันที — กลุ่มลูกค้าเกิดตั้งแต่ qualify
  select id into v_project from public.installation_projects where work_item_id = v_wi;
  if v_project is null then
    v_project := public.rpc_field_create_project(
      btrim(p_fields ->> 'project_name'), p_site_code, null, v_wi, true);
  end if;
  v_code := public.rpc_field_issue_bind_code(v_project);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('qualify_group_ready', v_project, p_site_code,
    jsonb_build_object('work_item_id', v_wi, 'artifact_id', v_artifact));

  return jsonb_build_object('artifact_id', v_artifact, 'work_item_id', v_wi,
    'project_id', v_project, 'bind_code', v_code, 'already', false);
end; $$;

-- signature เดิมไม่เปลี่ยน — grant ยกจาก 0103 มาย้ำเพื่อความชัด (idempotent)
do $$
begin
  execute 'revoke all on function public.rpc_field_submit_requirement(jsonb, text, text) from public';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rpc_field_submit_requirement(jsonb, text, text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.rpc_field_submit_requirement(jsonb, text, text) to service_role';
  end if;
end $$;
