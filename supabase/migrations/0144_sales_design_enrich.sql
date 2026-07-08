-- Migration: sales_design_enrich — ADR-050 Q4: Cabinet&wall list · script bank · quote 6 หมวด · อบรม Sale 3 เดือน
-- Depends on: 0092 (capture spine), 0136 (customer_docs), 0116 (lead_followup_config.h1), 0089 (cron pattern)
-- ที่มา: Master Matrix (สำหรับคุณชุ) + PFMEA Revise 1 + kit C12 script families

-- ---------------------------------------------------------------------------
-- (1) capture cabinet_wall_list — 7 fields ตาม Master Matrix (deliverable ของ designer)
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'cabinet_wall_list',
  jsonb_build_object('project_id','string','items','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'รายการตู้+ผนังครบ 7 มิติต่อชิ้น: เลขตู้/เลขขนาดผนัง/วัสดุ/ฟังก์ชัน/ลิ้นชัก/ฟิตติ้ง/ชั้นวาง',
    'guards_against', 'วางแผนผลิตจาก list ไม่ครบ → สั่งของผิด/ขาด (ต้นทางของ SEV 10 สั่งซื้อวัสดุ)',
    'method', 'designer กรอกครบทุกตู้ตาม Master Matrix ก่อน design handoff',
    'pfmea_ref', jsonb_build_object('source_file', 'Master Matrix (สำหรับคุณชุ)', 'source_step', 'Designer_Deliverable'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
  )),
  'evidence_only',
  array['project_id','items']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

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
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'ต้องมีรายการตู้/ผนังอย่างน้อย 1 ชิ้น' using errcode = 'check_violation';
  end if;
  -- ตรวจ 7 fields ต่อชิ้น (Master Matrix)
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

-- ---------------------------------------------------------------------------
-- (2) script bank ทีมขาย (kit C12 families ปรับ LINE-first) + อธิบายค่าใช้จ่าย 6 หมวดใน investment doc
-- ---------------------------------------------------------------------------
insert into public.customer_docs (slug, title, body) values
  ('sale_scripts', 'คลังสคริปต์ทีมขาย (ภายใน — copy ไปปรับใช้)',
   '【ตอบ enquiry แรก】' || chr(10) ||
   'สวัสดีครับคุณ[ชื่อ] ขอบคุณที่สนใจ DAPH ครับ 🏠 รบกวนเล่าคร่าวๆ: บ้าน/คอนโด กี่ห้อง อยากทำส่วนไหน และช่วงงบที่ตั้งใจไว้ครับ — เดี๋ยวผมประเมินช่วงราคาเบื้องต้นให้เลย' || chr(10) || chr(10) ||
   '【ปฏิเสธ lead อย่างสุภาพ (red flag / ไม่ fit)】' || chr(10) ||
   'ขอบคุณที่ให้โอกาสครับคุณ[ชื่อ] จากขอบเขตงานที่คุยกัน ผมเกรงว่าทีมเราจะยังไม่ใช่ตัวเลือกที่คุ้มที่สุดสำหรับงานนี้ครับ ไม่อยากให้เสียเวลาและงบของคุณ — หากมีงานบิวท์อินเต็มรูปแบบในอนาคต ยินดีดูแลเสมอครับ 🙏' || chr(10) || chr(10) ||
   '【เตรียมก่อนนัด consult】' || chr(10) ||
   'พรุ่งนี้เจอกัน [เวลา] นะครับ สิ่งที่อยากให้เตรียม: รูป/แปลนห้องถ้ามี · ตัวอย่างสไตล์ที่ชอบ 2-3 รูป · ผู้ตัดสินใจมาครบ จะได้จบในรอบเดียวครับ' || chr(10) || chr(10) ||
   '【ตามใบเสนอราคา (3 วัน)】' || chr(10) ||
   'สวัสดีครับคุณ[ชื่อ] ใบเสนอราคาที่ส่งไป มีจุดไหนอยากให้อธิบายเพิ่มมั๊ยครับ ปรับ scope/งวดได้ตามสะดวกเลยครับ' || chr(10) || chr(10) ||
   '【หลังเซ็นสัญญา】' || chr(10) ||
   'ยินดีต้อนรับสู่ครอบครัว DAPH ครับ 🎉 จากนี้ทุกความคืบหน้าจะเข้ากลุ่มนี้อัตโนมัติ มีอะไรทักได้ตลอดครับ' || chr(10) || chr(10) ||
   '⚠️ กติกา: สคริปต์เรื่องเงิน/ข้อพิพาท ให้หัวหน้า review ก่อนส่งเสมอ — ห้ามส่งข้อความเชิงขู่/กฎหมายเองเด็ดขาด')
on conflict (slug) do nothing;

update public.customer_docs set body = body || chr(10) || chr(10) ||
  'ค่าใช้จ่ายแบ่งเป็น 6 หมวดหลัก (แจกแจงในใบเสนอราคา):' || chr(10) ||
  '1. ค่าออกแบบ (interior professional fee) — ชำระเต็มก่อนเริ่มออกแบบ' || chr(10) ||
  '2. ค่าวางแผนการผลิต (production planning)' || chr(10) ||
  '3. ค่าผลิตในโรงงาน' || chr(10) ||
  '4. ค่าขนส่ง' || chr(10) ||
  '5. ค่าติดตั้ง' || chr(10) ||
  '6. ค่าดำเนินการหน้างาน (ตามประเภท บ้าน/คอนโด/สำนักงาน)'
where slug = 'investment' and body not like '%6 หมวดหลัก%';

-- ---------------------------------------------------------------------------
-- (3) อบรม Sale ทุก 3 เดือน (PFMEA Revise 1) — cron quarterly เตือน H1
-- ---------------------------------------------------------------------------
create or replace function public.fn_sales_training_reminder()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_h1 uuid;
begin
  select h1_employee_id into v_h1 from public.lead_followup_config where id = true;
  if v_h1 is null then
    return jsonb_build_object('sent', 0, 'note', 'h1 ยังไม่ตั้งใน lead_followup_config');
  end if;
  begin
    perform public.rpc_dispatch_notification(
      jsonb_build_object('employee_id', v_h1),
      'personal_responsibility', 'training', 'tpl_sales_training',
      '{}'::jsonb, false, null, true, null, null);
  exception when others then
    return jsonb_build_object('sent', 0, 'note', 'dispatch failed');
  end;
  insert into public.installation_audit_log (event_type, detail)
  values ('sales_training_reminded', jsonb_build_object('quarter', to_char(public.fn_business_date(), 'YYYY-Q')));
  return jsonb_build_object('sent', 1);
end; $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'wf-sales-training-reminder';
    perform cron.schedule('wf-sales-training-reminder', '0 2 1 1,4,7,10 *', 'select public.fn_sales_training_reminder()');
  else
    raise notice 'pg_cron unavailable — training reminder จะถูก schedule ตอน db push บน hosted';
  end if;
end $$;

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_sales_training', null, '📚 ถึงรอบอบรมทีมขายประจำไตรมาสแล้วครับ (กติกา QMS: ทุก 3 เดือน) — ทบทวน: คู่มือวัสดุ+ราคา · การเก็บข้อมูลลูกค้าให้ครบ · การแจ้งงวดชำระ · lost-reason ไตรมาสที่ผ่านมา (ดูจากสรุปทีมขาย)', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_field_submit_cabinet_wall_list(uuid, jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
  execute 'revoke all on function public.fn_sales_training_reminder() from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fn_sales_training_reminder() to service_role';
  end if;
end $$;
