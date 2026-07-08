-- Migration: qms_factory_design — ADR-050 Q1+Q2+Q3: ความจริงโรงงาน · design integrity · EOT ใน VO
-- Depends on: 0108 (rpc_factory_report_station — rebase ที่นี่), 0139 (material_status — rebase order gate),
--             0127/0133 (shop drawing/VO — rebase), 0104/0130 (t0_snapshot — rebase), 0092 (capture spine)
-- ที่มา: DAPH QMS 2020 จริง (Control Plan + PFMEA P'Mean/Main Process Revise 1) — ไม่ใช่ kit

-- ---------------------------------------------------------------------------
-- Q1a: station checklist จาก Control Plan จริง (soft — ติ๊กมากับรายงาน, ขาด = audit ไม่ block)
-- ---------------------------------------------------------------------------
create table if not exists public.factory_station_checklists (
  station text not null,
  seq int not null,
  item text not null,
  is_sc boolean not null default false,   -- Special Characteristic (Control Plan ระบุ SC)
  primary key (station, seq)
);
insert into public.factory_station_checklists (station, seq, item, is_sc) values
  ('laminate', 1, 'ตรวจเครื่อง/แรงดันลม/ระดับน้ำมันไฮดรอลิกก่อนเริ่ม', false),
  ('laminate', 2, 'Incoming: ไม้ไม่แตก/บิ่น/โก่ง ทุกชิ้น', false),
  ('laminate', 3, 'กดทับครบ 3 ชั่วโมงก่อนนำไปตัด (SC)', true),
  ('laminate', 4, 'ไม่วางไม้ทับกันเกิน 5 แผ่น (SC)', true),
  ('cutting',  1, 'ตรวจอายุใบเลื่อย (เปลี่ยนทุก ~150–200 แผ่น หรือเมื่อขอบเริ่มบิ่น)', false),
  ('cutting',  2, 'ตรวจโปรแกรมตัด + การวางชิ้นงานก่อนตัด', false),
  ('cutting',  3, 'วัดทุกชิ้นหลังตัดด้วยตลับเมตร — ขอบไม่ฉีก/แตก', false),
  ('edging',   1, 'ปิดขอบถูกด้านตามแบบ ไม่บิด แน่น/เรียบ', false),
  ('edging',   2, 'เป่าทำความสะอาดเครื่องทุก 15 นาที', false),
  ('cnc',      1, 'ตรวจ parameter โปรแกรม/แรงดันลม/ดอกกัดก่อนเริ่ม', false),
  ('cnc',      2, 'ตรวจทุกชิ้นหลัง CNC เทียบแบบ', false),
  ('assembly', 1, 'ใส่เกือกม้า + เดือยไม้ + เดือยเหล็กครบตามแบบ', false),
  ('assembly', 2, 'วัดระยะตามแบบ — ไม่มีรอยบุบ/ขีดข่วน', false),
  ('packing',  1, 'แพ็คแยกตามบ้านลูกค้า/กลุ่มแบบ + เช็ดคราบกาวตามขอบ', false),
  ('packing',  2, 'ตรวจครั้งสุดท้ายก่อนพันฟิล์ม/ลูกฟูก', false)
on conflict (station, seq) do update set item = excluded.item, is_sc = excluded.is_sc;
alter table public.factory_station_checklists enable row level security;
create policy factory_station_checklists_sel on public.factory_station_checklists for select to authenticated using (true);

alter table public.production_milestones add column if not exists checklist jsonb;
alter table public.production_milestones add column if not exists sc_values jsonb;

-- rebase rpc_factory_report_station (0108→0143): + checklist/SC — soft: ขาด = audit, SC laminate = บังคับกรอกค่า
create or replace function public.rpc_factory_report_station(
  p_project_id uuid, p_station text, p_note text default null,
  p_override_reason text default null,
  p_checklist jsonb default null,        -- {"1": true, ...} ติ๊กตาม seq
  p_sc_values jsonb default null)        -- laminate: {"press_hours": 3.5, "stack_count": 4}
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_first boolean;
  v_gate boolean;
  v_id uuid;
  v_unpaid record;
  v_unticked int := 0;
  v_press numeric;
  v_stack numeric;
  v_sc_warn text := null;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  v_first := not exists (select 1 from public.production_milestones m where m.project_id = p_project_id);

  if v_first then
    select i.* into v_unpaid from public.payment_installments i
    where i.project_id = p_project_id and i.trigger_event = 'g3_approved' and i.status <> 'paid'
    limit 1;
    if v_unpaid.id is not null then
      if coalesce(btrim(p_override_reason), '') = '' then
        raise exception 'งวดก่อนผลิต (% บาท) ยังไม่บันทึกรับ — ปล่อยผลิตต้องมีเหตุผล override โดย PM/ผู้บริหาร', v_unpaid.amount
          using errcode = 'check_violation';
      end if;
      if not (public.is_governance_role() or public.has_any_app_role(array['project_manager'])) then
        raise exception 'override ปล่อยผลิตก่อนเงินเข้า ทำได้เฉพาะ PM/ผู้บริหาร' using errcode = 'insufficient_privilege';
      end if;
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('production_release_override', p_project_id, v_p.site_code,
        jsonb_build_object('unpaid_seq', v_unpaid.seq, 'amount', v_unpaid.amount, 'reason', btrim(p_override_reason)));
    end if;
  end if;

  -- ADR-050 Q1: SC ของ laminate = บังคับกรอกค่า (Control Plan ระบุ SC — กดทับ ≥3 ชม. / ทับ ≤5 แผ่น)
  if p_station = 'laminate' then
    v_press := nullif(p_sc_values ->> 'press_hours', '')::numeric;
    v_stack := nullif(p_sc_values ->> 'stack_count', '')::numeric;
    if v_press is null or v_stack is null then
      raise exception 'สถานีปิดผิวต้องกรอกค่า SC: press_hours (ชม.กดทับ) + stack_count (จำนวนแผ่นทับ) — Control Plan ระบุเป็น Special Characteristic'
        using errcode = 'check_violation';
    end if;
    if v_press < 3 then v_sc_warn := 'กดทับ ' || v_press || ' ชม. (< 3 ชม.)'; end if;
    if v_stack > 5 then v_sc_warn := coalesce(v_sc_warn || ' · ', '') || 'ทับ ' || v_stack || ' แผ่น (> 5)'; end if;
    if v_sc_warn is not null then
      insert into public.installation_audit_log (event_type, project_id, site_code, detail)
      values ('sc_out_of_spec', p_project_id, v_p.site_code,
        jsonb_build_object('station', p_station, 'detail', v_sc_warn, 'sc_values', p_sc_values,
          'by', public.resolve_actor()));
    end if;
  end if;

  -- checklist ขาด = audit (soft — ไลน์ไม่หยุด แต่มีร่องรอย)
  select count(*) into v_unticked from public.factory_station_checklists c
  where c.station = p_station
    and coalesce((p_checklist ->> c.seq::text)::boolean, false) = false;
  if v_unticked > 0 then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('station_checklist_incomplete', p_project_id, v_p.site_code,
      jsonb_build_object('station', p_station, 'unticked', v_unticked));
  end if;

  v_gate := p_station in ('assembly', 'packing');
  insert into public.production_milestones (project_id, site_code, station, note, is_gate, checklist, sc_values)
  values (p_project_id, v_p.site_code, p_station, p_note, v_gate, p_checklist, p_sc_values)
  on conflict (project_id, station) do update
    set note = coalesce(excluded.note, production_milestones.note),
        checklist = coalesce(excluded.checklist, production_milestones.checklist),
        sc_values = coalesce(excluded.sc_values, production_milestones.sc_values)
  returning id into v_id;

  if v_first then
    perform public.fn_prod_curated(p_project_id, 'tpl_prod_started', jsonb_build_object('project_name', v_p.name));
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('production_station', p_project_id, v_p.site_code,
    jsonb_build_object('station', p_station, 'gate', v_gate, 'first', v_first));
  return jsonb_build_object('milestone_id', v_id, 'gate', v_gate,
    'checklist_warning', case when v_unticked > 0 then 'checklist ค้าง ' || v_unticked || ' ข้อ (บันทึกใน audit)' end,
    'sc_warning', v_sc_warn);
end; $$;
drop function if exists public.rpc_factory_report_station(uuid, text, text, text);

-- Q1b: gate ยืนยันก่อนสั่งวัสดุ (SEV 10 สูงสุดทั้งระบบ) — rebase rpc_factory_material_status (0139→0143)
create or replace function public.rpc_factory_material_status(
  p_material_id uuid, p_status text, p_cost numeric default null,
  p_order_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_m record;
begin
  select m.*, w.project_id, w.code as pkg_code, p.site_code as p_site into v_m
  from public.package_materials m
  join public.work_packages w on w.id = m.package_id
  join public.installation_projects p on p.id = w.project_id
  where m.id = p_material_id for update;
  if not found then raise exception 'material not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_m.p_site) or public.fn_installation_is_member(v_m.project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('ordered', 'received') then
    raise exception 'สถานะต้องเป็น ordered หรือ received' using errcode = 'check_violation';
  end if;
  if v_m.status = 'received' then
    return jsonb_build_object('material_id', p_material_id, 'already', true);
  end if;

  -- ADR-050 Q1: สั่งวัสดุ = SEV 10 — ต้องยืนยันว่าเช็ค สเปก/จำนวน/ขนาดไม้ตรง material list แล้ว
  if p_status = 'ordered' then
    if not p_order_confirmed then
      raise exception 'สั่งวัสดุต้องยืนยันก่อน (p_order_confirmed): เช็คสเปก+จำนวน+ขนาดตรง material list แล้ว — จุดนี้ SEV 10 พลาด = scrap 100%%'
        using errcode = 'check_violation';
    end if;
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('material_order_confirmed', v_m.project_id, v_m.p_site,
      jsonb_build_object('material_id', p_material_id, 'name', v_m.name, 'qty', v_m.qty,
        'by', public.resolve_actor()));
  end if;

  update public.package_materials
  set status = p_status,
      cost = coalesce(p_cost, cost),
      ordered_at = case when p_status = 'ordered' then timezone('utc', now()) else ordered_at end,
      received_at = case when p_status = 'received' then timezone('utc', now()) else received_at end
  where id = p_material_id;

  if p_status = 'received' and coalesce(p_cost, 0) > 0 then
    insert into public.job_cost_entries (project_id, site_code, entry_type, work_date, qty, rate, amount, source, ref_id, note)
    values (v_m.project_id, v_m.p_site, 'material', public.fn_business_date(), v_m.qty, null, p_cost,
      'bom_received', v_m.package_id, v_m.pkg_code || ': ' || v_m.name);
  end if;
  return jsonb_build_object('material_id', p_material_id, 'status', p_status, 'already', false);
end; $$;
drop function if exists public.rpc_factory_material_status(uuid, text, numeric);

-- ---------------------------------------------------------------------------
-- Q2a: design handoff — "Final ถึง Production = 3D เท่านั้น" + drawing/3D sync (PFMEA Revise 1)
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values (
  'design_handoff',
  jsonb_build_object('project_id','string','summary','string','is_3d_final','string','drawing_3d_synced','string'),
  jsonb_build_array(jsonb_build_object(
    'checkpoint', 'ส่งมอบให้วางแผนผลิตด้วยไฟล์ 3D final เท่านั้น + drawing กับ 3D ตรงกัน',
    'guards_against', 'แก้ drawing แต่ลืมแก้ 3D → ผลิตผิดทั้งชุด (failure จริงใน PFMEA Revise 1)',
    'method', 'designer ยืนยัน 2 ข้อก่อนส่งมอบ: final เป็น 3D + sync ครบเมื่อลูกค้าแก้',
    'pfmea_ref', jsonb_build_object('source_file', 'DAPH PFMEA Main Process Revise 1', 'source_step', 'Designer_Handoff'),
    'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
  )),
  'evidence_only',
  array['project_id','summary']
)
on conflict (capture_type) do update set
  field_schema = excluded.field_schema, verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target, critical_fields = excluded.critical_fields;

create or replace function public.rpc_field_design_handoff(
  p_project_id uuid, p_summary text, p_is_3d_final boolean, p_drawing_3d_synced boolean,
  p_client_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_artifact uuid;
  v_status text;
  v_b4 uuid;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if not p_is_3d_final then
    raise exception 'Final ถึงวางแผนผลิตต้องเป็นไฟล์ 3D เท่านั้น (กติกา PFMEA Revise 1) — แปลงเป็น 3D ก่อนส่งมอบ'
      using errcode = 'check_violation';
  end if;
  if not p_drawing_3d_synced then
    raise exception 'drawing กับ 3D ยังไม่ sync — ลูกค้าแก้แล้วต้องแก้ทั้งคู่ก่อนส่งมอบ (failure จริงที่เคยเกิด)'
      using errcode = 'check_violation';
  end if;

  v_artifact := public.rpc_capture_ingest('design_handoff', 'app',
    'app://field/design-handoff/' || coalesce(p_client_key, gen_random_uuid()::text),
    'dh-' || coalesce(p_client_key, p_project_id::text),
    v_p.site_code);
  select status::text into v_status from public.capture_artifact where id = v_artifact;
  if v_status = 'emitted' then
    return jsonb_build_object('artifact_id', v_artifact, 'already', true);
  end if;
  if v_status <> 'approved' then
    perform public.rpc_capture_verify(v_artifact, 'approved', true, 0, 'design handoff (3D-only + synced)',
      jsonb_build_object('project_id', p_project_id::text, 'summary', btrim(p_summary),
        'is_3d_final', 'true', 'drawing_3d_synced', 'true'));
  end if;
  perform public.rpc_capture_promote(v_artifact, 'installation_project', p_project_id);

  select employee_id into v_b4 from public.ops_contacts where role = 'B4';
  if v_b4 is not null then
    begin
      perform public.rpc_dispatch_notification(
        jsonb_build_object('employee_id', v_b4),
        'personal_responsibility', 'design_handoff', 'tpl_design_handoff',
        jsonb_build_object('project_name', v_p.name),
        false, null, true, null, v_p.site_code);
    exception when others then null;
    end;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('design_handed_off', p_project_id, v_p.site_code,
    jsonb_build_object('artifact_id', v_artifact, 'summary', left(btrim(p_summary), 120)));
  return jsonb_build_object('artifact_id', v_artifact, 'already', false);
end; $$;

-- Q2b: shop drawing revision บังคับยืนยันแก้คู่ — rebase rpc_field_shop_drawing_revision (0127→0143)
create or replace function public.rpc_field_shop_drawing_revision(
  p_project_id uuid, p_bible_code text, p_change_summary text, p_matches_signed_spec boolean,
  p_updated_both boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_next_rev int;
  v_factory text;
  v_pm uuid;
begin
  select p.id, p.site_code, p.name, p.work_item_id into v_p
  from public.installation_projects p where p.id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_bible_code), '') = '' or coalesce(btrim(p_change_summary), '') = '' then
    raise exception 'ต้องมี bible code + สรุปสิ่งที่แก้' using errcode = 'check_violation';
  end if;
  if v_p.work_item_id is null then
    raise exception 'บ้านนี้ยังไม่ผูก work item — เปิดจากใบ requirement ก่อน' using errcode = 'no_data_found';
  end if;
  -- ADR-050 Q2: แก้แบบ = ต้องยืนยันว่าแก้ทั้ง drawing และ 3D แล้ว (failure จริง PFMEA Revise 1)
  if not p_updated_both then
    raise exception 'ยืนยันก่อนว่าแก้ทั้ง drawing และไฟล์ 3D แล้ว (p_updated_both) — แก้ฝั่งเดียว = ผลิตผิดทั้งชุด'
      using errcode = 'check_violation';
  end if;

  perform public.rpc_classify_revision(
    v_p.work_item_id, 'G4',
    jsonb_build_array('shop_drawing:' || btrim(p_bible_code)),
    p_matches_signed_spec, true, null);

  select coalesce(max(version), 0) + 1 into v_next_rev
  from public.released_spec where bible_code = btrim(p_bible_code);

  select g.line_group_id into v_factory from public.line_groups g
  where g.group_type = 'factory' and g.status = 'active';
  if v_factory is not null then
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_shop_rev',
      jsonb_build_object('project_name', v_p.name, 'bible_code', btrim(p_bible_code),
        'next_rev', v_next_rev::text, 'summary', left(btrim(p_change_summary), 100)),
      'group', v_factory);
  end if;

  if not p_matches_signed_spec then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('scope_change_flagged', p_project_id, v_p.site_code,
      jsonb_build_object('bible_code', btrim(p_bible_code), 'summary', left(btrim(p_change_summary), 200),
        'note', 'shop drawing กระทบของที่ลูกค้าเซ็น — เข้าเส้น requote ADR-037 ห้ามแก้เงียบ'));
    select employee_id into v_pm from public.ops_contacts where role = 'D1';
    if v_pm is not null then
      begin
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_pm),
          'personal_responsibility', 'shop_drawing', 'tpl_shop_rev_requote',
          jsonb_build_object('project_name', v_p.name, 'bible_code', btrim(p_bible_code)),
          false, null, true, null, v_p.site_code);
      exception when others then null;
      end;
    end if;
  end if;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('shop_drawing_revision', p_project_id, v_p.site_code,
    jsonb_build_object('bible_code', btrim(p_bible_code), 'next_rev', v_next_rev,
      'matches_signed_spec', p_matches_signed_spec, 'updated_both', true,
      'summary', left(btrim(p_change_summary), 200)));

  return jsonb_build_object('next_rev', v_next_rev,
    'requote_required', not p_matches_signed_spec,
    'factory_notified', v_factory is not null);
end; $$;
drop function if exists public.rpc_field_shop_drawing_revision(uuid, text, text, boolean);

-- Q2c: T0 เตือนถ้ายังไม่มีรูปบ้านเดิม (PFMEA: photo+video ทุกครั้ง = หลักฐาน liability) — rebase 0104
-- ของเดิม return void → เปลี่ยนเป็น jsonb ต้อง drop ก่อน (UI เดิมไม่อ่านผลลัพธ์ — ไม่พัง)
drop function if exists public.rpc_field_t0_snapshot(uuid, jsonb);
create function public.rpc_field_t0_snapshot(p_project_id uuid, p_checklist jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_complete boolean;
  v_photos int;
begin
  select id, site_code into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code) or public.fn_installation_is_member(p_project_id)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(bool_and((v.value)::boolean), false) into v_complete
  from jsonb_each(coalesce(p_checklist, '{}'::jsonb)) v;

  select count(*) into v_photos from public.installation_photos ph where ph.project_id = p_project_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('t0_snapshot', p_project_id, v_p.site_code,
    jsonb_build_object('checklist', coalesce(p_checklist, '{}'::jsonb), 'complete', v_complete,
      'photos_at_t0', v_photos));

  if v_photos = 0 then
    insert into public.installation_audit_log (event_type, project_id, site_code, detail)
    values ('t0_without_photos', p_project_id, v_p.site_code,
      jsonb_build_object('note', 'PFMEA: ตรวจบ้านเดิมต้องถ่ายรูป/วิดีโอทุกครั้ง — หลักฐาน liability'));
  end if;

  return jsonb_build_object('complete', v_complete, 'photos', v_photos,
    'photo_warning', case when v_photos = 0 then 'ยังไม่มีรูปสภาพบ้านเดิม — ถ่ายก่อนเริ่มงาน (หลักฐานความเสียหายเดิม)' end);
end; $$;

-- ---------------------------------------------------------------------------
-- Q3: EOT ใน VO เดิม — delay_category 6 ค่า + notice_date (rebase create_variation 0132→0143)
-- ---------------------------------------------------------------------------
alter table public.variation_orders add column if not exists delay_category text
  check (delay_category is null or delay_category in
    ('weather', 'client_decision', 'lead_time', 'hidden_condition', 'subcontractor', 'permit'));
alter table public.variation_orders add column if not exists notice_date date;

create or replace function public.rpc_field_create_variation(
  p_project_id uuid, p_reason text, p_description text,
  p_price_impact numeric default 0, p_time_impact_days int default 0,
  p_delay_category text default null, p_notice_date date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_no int;
  v_id uuid;
  v_body text;
  v_line text := chr(10);
  v_reason_th text;
  v_delay_th text;
begin
  select id, site_code, name into v_p from public.installation_projects where id = p_project_id;
  if not found then raise exception 'project not found' using errcode = 'no_data_found'; end if;
  if not (public.is_governance_role() or public.has_site_access(v_p.site_code)) then
    raise exception 'insufficient permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'ต้องมีรายละเอียดสิ่งที่เปลี่ยนจาก scope ที่อนุมัติ' using errcode = 'check_violation';
  end if;
  v_reason_th := case p_reason
    when 'client_request' then 'ลูกค้าขอเปลี่ยน/เพิ่ม'
    when 'hidden_condition' then 'สภาพหน้างานที่ซ่อนอยู่'
    when 'design_change' then 'ปรับแบบ'
    when 'substitution' then 'เปลี่ยนวัสดุ/สินค้าทดแทน'
    when 'schedule' then 'เร่ง/เลื่อนกำหนดการ'
    when 'other' then 'อื่นๆ' end;
  if v_reason_th is null then
    raise exception 'เหตุผลต้องเป็น: client_request / hidden_condition / design_change / substitution / schedule / other'
      using errcode = 'check_violation';
  end if;
  -- ADR-050 Q3: กระทบเวลา = ระบุหมวดดีเลย์ (EOT ในตัว — ไม่มีฟอร์มแยก)
  if p_time_impact_days > 0 and p_delay_category is null then
    raise exception 'VO ที่กระทบเวลา ต้องระบุหมวดดีเลย์ (weather/client_decision/lead_time/hidden_condition/subcontractor/permit)'
      using errcode = 'check_violation';
  end if;
  v_delay_th := case p_delay_category
    when 'weather' then 'สภาพอากาศ/เหตุสุดวิสัย' when 'client_decision' then 'ลูกค้าตัดสินใจล่าช้า'
    when 'lead_time' then 'ของ/วัสดุรอนาน' when 'hidden_condition' then 'สภาพหน้างานซ่อน'
    when 'subcontractor' then 'ช่วงรับเหมา/ซัพพลายเออร์' when 'permit' then 'ใบอนุญาต/หน่วยงาน' end;

  update public.variation_orders set status = 'superseded'
  where project_id = p_project_id and status = 'draft';
  select coalesce(max(vo_number), 0) + 1 into v_no
  from public.variation_orders where project_id = p_project_id;

  v_body :=
    'ใบสั่งเปลี่ยนแปลงงาน (Variation Order) — VO-' || lpad(v_no::text, 3, '0') || v_line ||
    'บ้าน: ' || v_p.name || ' · วันที่ออก: ' || to_char(public.fn_business_date(), 'DD/MM/YYYY') || v_line || v_line ||
    'เหตุผล: ' || v_reason_th || v_line ||
    'รายละเอียดที่เปลี่ยนจาก scope ที่อนุมัติ:' || v_line || '  ' || btrim(p_description) || v_line || v_line ||
    'ผลกระทบราคา: ' || case when p_price_impact > 0 then '+' else '' end ||
      to_char(p_price_impact, 'FM999,999,999') || ' บาท' ||
      case when p_price_impact <> 0 then ' (การปรับงวดชำระจะแจ้งเป็นลายลักษณ์อักษรโดยฝ่ายการเงิน)' else '' end || v_line ||
    'ผลกระทบเวลา: ' || case when p_time_impact_days > 0 then '+' || p_time_impact_days || ' วัน'
      when p_time_impact_days < 0 then p_time_impact_days || ' วัน' else 'ไม่กระทบ' end ||
    case when v_delay_th is not null then ' · สาเหตุ: ' || v_delay_th else '' end ||
    case when p_notice_date is not null then ' · แจ้งลูกค้าเมื่อ: ' || to_char(p_notice_date, 'DD/MM/YYYY') else '' end || v_line || v_line ||
    '⚠️ เงื่อนไขสำคัญ: งานส่วนที่เปลี่ยนแปลงจะเริ่มดำเนินการหลังจากลูกค้าลงนามอนุมัติใบนี้เท่านั้น' || v_line ||
    'เอกสารนี้ generate จากระบบ IIMOS — เชื่อมกับบันทึกโครงการและแผนงวดชุดเดียวกัน';

  insert into public.variation_orders (project_id, site_code, vo_number, reason, description,
    price_impact, time_impact_days, body, delay_category, notice_date)
  values (p_project_id, v_p.site_code, v_no, p_reason, btrim(p_description),
    coalesce(p_price_impact, 0), coalesce(p_time_impact_days, 0), v_body, p_delay_category, p_notice_date)
  returning id into v_id;

  insert into public.installation_audit_log (event_type, project_id, site_code, detail)
  values ('variation_order_created', p_project_id, v_p.site_code,
    jsonb_build_object('vo_id', v_id, 'vo_number', v_no, 'reason', p_reason,
      'price_impact', p_price_impact, 'time_impact_days', p_time_impact_days,
      'delay_category', p_delay_category));
  return jsonb_build_object('vo_id', v_id, 'vo_number', v_no, 'body', v_body);
end; $$;
drop function if exists public.rpc_field_create_variation(uuid, text, text, numeric, int);

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active, audience, message_kind) values
  ('tpl_design_handoff', null, '📐 บ้าน {{project_name}} — designer ส่งมอบ 3D final แล้ว (ยืนยัน 3D-only + drawing sync) เริ่มวางแผนผลิตได้ครับ', true, 'internal', 'text')
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;

do $$
declare fn text;
begin
  foreach fn in array array[
    'rpc_factory_report_station(uuid, text, text, text, jsonb, jsonb)',
    'rpc_factory_material_status(uuid, text, numeric, boolean)',
    'rpc_field_design_handoff(uuid, text, boolean, boolean, text)',
    'rpc_field_shop_drawing_revision(uuid, text, text, boolean, boolean)',
    'rpc_field_t0_snapshot(uuid, jsonb)',
    'rpc_field_create_variation(uuid, text, text, numeric, int, text, date)'
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
