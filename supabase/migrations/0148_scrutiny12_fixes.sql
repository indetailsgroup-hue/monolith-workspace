-- Migration: scrutiny12_fixes — ผล scrutinize รอบ 12 (0147)
--
-- S12-1 (พิสูจน์บน DB): wet-area rule รั่ว 3 การสะกด — 'ปาร์ติเกิลบอร์ด' (ป. — C18 เองก็สะกดแบบนี้),
--   'ชิปบอร์ด', 'เอ็มดีเอฟ' (ไทย) หลุดทั้งหมด → designer พิมพ์ไทยปกติ = rule ไม่ทำงานเลย
-- S12-2 (พิสูจน์บน DB): 'MDF V313 กันชื้น' โดน block ทั้งที่เป็นเกรดทนชื้นที่ C18 ระบุว่าใช้พื้นที่เปียกได้
--   → เพิ่มข้อยกเว้น กันชื้น/ทนชื้น/V313
-- rebase rpc_field_submit_cabinet_wall_list จาก 0147 (แก้เฉพาะ regex วัสดุ)

create or replace function public.rpc_field_submit_cabinet_wall_list(
  p_project_id uuid, p_items jsonb, p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_item jsonb;
  v_missing text[];
  v_i int := 0;
  v_room text;
  v_mat text;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'ต้องมีรายการตู้/ผนังอย่างน้อย 1 ชิ้น' using errcode = 'check_violation';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    select array_agg(f) into v_missing from unnest(array[
      'cabinet_number','wall_size_number','material','functions_detail',
      'drawers_detail','fitting_detail','shelves_detail']) f
    where coalesce(btrim(v_item ->> f), '') = '';
    if v_missing is not null then
      raise exception 'ชิ้นที่ % ขาด: % (7 fields ตาม Master Matrix — ไม่ครบ = ต้นทางสั่งของผิด SEV 10)',
        v_i, array_to_string(v_missing, ', ') using errcode = 'check_violation';
    end if;
    -- ADR-052 Q2 + S12: พื้นที่เปียก + วัสดุไม่ทนชื้น = block
    -- ครอบการสะกด: PB/particle/พาร์ติ/ปาร์ติ/ชิปบอร์ด/chipboard · MDF/เอ็มดีเอฟ (ยกเว้นเกรดทนชื้น HMR/กันชื้น/ทนชื้น/V313)
    v_room := lower(coalesce(v_item ->> 'room', ''));
    v_mat := lower(v_item ->> 'material');
    if v_room ~ 'ครัว|kitchen|ห้องน้ำ|bath|แพนทรี่|pantry' then
      if v_mat ~ '(^|[^a-z])pb([^a-z]|$)|particle|พาร์ติ|ปาร์ติ|ชิปบอร์ด|chipboard'
         or ((v_mat ~ 'mdf|เอ็มดีเอฟ') and v_mat !~ 'hmr|กันชื้น|ทนชื้น|v313') then
        raise exception 'ชิ้นที่ % (%): ห้องเปียกใช้ "%" ไม่ได้ — พังใน 1-3 ปี ต้อง HMR / MDF กันชื้น V313 / ไม้อัด / พลาสวูด (ADR-052)',
          v_i, v_item ->> 'room', v_item ->> 'material' using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  v_artifact := public.rpc_capture_ingest('cabinet_wall_list', 'app',
    'app://field/cwl/' || coalesce(p_client_key, gen_random_uuid()::text),
    'cwl-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'cabinet & wall list (designer)',
      jsonb_build_object('project_id', p_project_id::text, 'items', p_items::text));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('cabinet_wall_list_submitted', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'count', jsonb_array_length(p_items)));
  return jsonb_build_object('artifact_id', v_artifact, 'count', jsonb_array_length(p_items), 'already', false);
end; $$;
