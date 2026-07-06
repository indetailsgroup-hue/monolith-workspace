-- Migration: customer_link_and_bind_ack — G3 + bind ack มีชื่อบ้าน (คำถาม owner 7 ก.ค. 2026: ลูกค้าคนที่ 1/คนที่ 2)
-- Depends on: 0094 (rpc_capture_promote ล่าสุด), 0098 (fn_line_handle_group_event ล่าสุด), 0023 (primary_customer_id)
--
-- G3 (พบจากไล่ไทม์ไลน์ลูกค้าคนที่ 1): work_item_open ไม่เคยผูก primary_customer_id
--   → customer approval ที่ Designer/3D degrade เป็น internal เงียบ ๆ — การ์ดขออนุมัติแบบไม่ถึงลูกค้า
--   แก้: ฟอร์ม requirement ส่ง customer_id (identity เกิดตั้งแต่ add OA) → adapter ผูกตอนเปิดงาน;
--   ไม่มี/เพี้ยน = degrade ตามดีไซน์ 0023 (ลูกค้า walk-in) + audit 'customer_link' ให้เห็นชัดทุกใบ
--
-- Bind ack (พบจากคำถามลูกค้าคนที่ 2): รหัสผูกคือเส้นแบ่งความปลอดภัยระหว่างลูกค้า — human error
--   ผูกผิดบ้านทำให้ลูกค้าเห็นบ้านคนอื่น; mitigation ราคาถูก: bot ตอบ**ชื่อบ้าน**ตอนผูกสำเร็จ/ผูกแล้ว
--   → ทั้งกลุ่มเห็นทันทีว่าผูกถูกหลังหรือไม่ ก่อนข้อมูลใดไหล

-- (1) template bind_ok มีชื่อบ้าน (sender เข้มเรื่อง slot — ทุก call site ส่ง project_name แล้ว)
update public.line_oa_message_templates
  set body = 'เชื่อมกลุ่มนี้กับ {{project_name}} เรียบร้อยแล้วครับ ✅ ถ้าชื่อบ้านไม่ถูกต้อง แจ้งหัวหน้างานหรือออฟฟิศได้ทันทีครับ'
  where template_key = 'tpl_inst_bind_ok' and vertical_context is null;

-- (2) field_schema ของ customer_requirement += customer_id (optional — ไม่อยู่ใน critical_fields)
update public.capture_type_config
  set field_schema = field_schema || jsonb_build_object('customer_id', 'string')
  where capture_type = 'customer_requirement';

-- ---------------------------------------------------------------------------
-- (3) rpc_capture_promote — G3 (body เดิมจาก 0094 ทุกบรรทัด + block ผูกลูกค้าใน work_item_open)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_capture_promote(
  p_id uuid,
  p_linked_entity_type text default null,
  p_linked_entity_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_principal text;
  v_status public.capture_status;
  v_type text;
  v_site text;
  v_payload jsonb;
  v_corrected jsonb;
  v_commit_target text;
  v_wi_version int;
  v_complete_result text;
  -- ledger adapter locals
  v_total numeric;
  v_vat numeric;
  v_wht numeric;
  v_category text;
  v_payment_method text;
  v_expense_account text;
  v_credit_account text;
  v_entry_date date;
  v_vat_amount numeric;
  v_wht_amount numeric;
  v_expense_amount numeric;
  v_credit_amount numeric;
  v_lines jsonb;
  v_journal_id uuid;
  -- costing adapter locals
  v_material text;
  v_material_norm text;
  v_qty numeric;
  v_price numeric;
  v_po_ref text;
  v_spec_match boolean;
  v_material_code text;
  v_price_id uuid;
  v_now timestamptz := timezone('utc', now());
  -- spec adapter locals
  v_bible_code text;
  v_function text;
  v_dimension jsonb;
  v_gate_confirmed boolean;
  v_accountable jsonb;
  v_prev_spec_id uuid;
  v_prev_version int;
  v_spec_id uuid;
  -- survey adapter locals
  v_zone text;
  v_mep jsonb;
  v_photo jsonb;
  v_survey_material text;
  v_prev_zone_id uuid;
  v_prev_zone_ver int;
  v_zone_id uuid;
  -- work_item_open adapter locals (0092)
  v_new_work_item uuid;
  v_link_customer uuid;
  -- installation finish gate locals (0094 — ADR-039 ข้อ 2)
  v_wi_step text;
  v_knowledge jsonb;
  v_inst_refs text[];
begin
  v_principal := public.resolve_actor();
  if v_principal is null then
    raise exception 'capture: unauthenticated principal' using errcode = 'insufficient_privilege';
  end if;

  select status, capture_type, site_code, ai_payload, corrected_fields
    into v_status, v_type, v_site, v_payload, v_corrected
  from public.capture_artifact where id = p_id for update;
  if not found then
    raise exception 'capture: artifact % not found', p_id using errcode = 'no_data_found';
  end if;

  if v_status = 'emitted' then
    return 'emitted';  -- idempotent: ไม่ commit ซ้ำ
  end if;
  if v_status <> 'approved' then
    raise exception 'capture: cannot promote status % (approve-before-promote)', v_status using errcode = 'check_violation';
  end if;
  if not (public.is_governance_role() or (v_site is not null and public.has_site_access(v_site))) then
    raise exception 'capture: insufficient permission to promote' using errcode = 'insufficient_privilege';
  end if;

  -- ADR-033: effective payload — ค่าที่มนุษย์แก้ (ground truth) ทับค่า AI; ai_payload คงเดิมเพื่อวัด accuracy
  v_payload := coalesce(v_payload, '{}'::jsonb) || coalesce(v_corrected, '{}'::jsonb);

  select commit_target into v_commit_target from public.capture_type_config where capture_type = v_type;

  -- mark emitted + link (no-commit-until-emitted: business-layer เปลี่ยนหลังจุดนี้)
  update public.capture_artifact
    set status = 'emitted', linked_entity_type = p_linked_entity_type, linked_entity_id = p_linked_entity_id
    where id = p_id;

  insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
  values (p_id, v_type, 'emit', v_principal, 'approved', 'emitted',
    jsonb_build_object('commit_target', v_commit_target, 'linked_entity_type', p_linked_entity_type, 'linked_entity_id', p_linked_entity_id));

  -- L3 commit-target adapter #1: 'Work_Item complete' → เรียก rpc_complete_work_item จริง (atomic ใน tx เดียว)
  if v_commit_target = 'Work_Item complete' then
    if p_linked_entity_type is distinct from 'work_item' or p_linked_entity_id is null then
      raise exception 'capture: Work_Item complete requires linked_entity_type=work_item + linked_entity_id'
        using errcode = 'check_violation';
    end if;
    select version, current_step into v_wi_version, v_wi_step
      from public.work_item where id = p_linked_entity_id for update;
    if not found then
      raise exception 'capture: linked work_item % not found', p_linked_entity_id using errcode = 'no_data_found';
    end if;

    -- ADR-039 ข้อ 2 (Req 8.6): ปิดงานติดตั้ง (ใบปิดบ้าน) = อำนาจหัวหน้าทีม Installation ตาม RACI เท่านั้น
    -- แหล่งอำนาจเดียวกับ start (resolver): approver refs ของขั้น Installation จาก knowledge_import current
    if v_wi_step = 'Installation' and not public.is_governance_role() then
      select ki.payload into v_knowledge from public.knowledge_import ki where ki.is_current limit 1;
      select array_agg(r) into v_inst_refs
        from jsonb_array_elements_text(
          coalesce(public.wf_approvers_for_step(v_knowledge, 'Installation', 'unanimous'), '[]'::jsonb)) r;
      if v_inst_refs is null then
        raise exception 'work_item complete adapter: ไม่พบ RACI approver ของขั้น Installation (knowledge_import) — fail-safe block (ADR-039)'
          using errcode = 'insufficient_privilege';
      end if;
      if not public.has_any_app_role(v_inst_refs) then
        raise exception 'work_item complete adapter: ปิดงานติดตั้งต้องเป็นหัวหน้าทีม Installation ตาม RACI (Req 8.6, ADR-039)'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    v_complete_result := public.rpc_complete_work_item(p_linked_entity_id, v_wi_version);
    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'work_item_id', p_linked_entity_id, 'complete_result', v_complete_result));

  -- L3 commit-target adapter #2: 'ledger' → post journal จริง (expense→double-entry)
  elsif v_commit_target = 'ledger' then
    v_total := coalesce((v_payload->>'total')::numeric, 0);
    v_vat := coalesce((v_payload->>'vat')::numeric, 0);
    v_wht := coalesce((v_payload->>'wht')::numeric, 0);
    v_category := v_payload->>'category';
    v_payment_method := v_payload->>'payment_method';

    if v_total <= 0 then
      raise exception 'ledger adapter: total ต้อง > 0 (ได้ %) — fail-safe no-guess', v_total using errcode = 'check_violation';
    end if;
    if v_vat < 0 or v_wht < 0 then
      raise exception 'ledger adapter: vat/wht ต้อง >= 0' using errcode = 'check_violation';
    end if;
    if v_category is null or v_category = '' then
      raise exception 'ledger adapter: category ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;

    select account_code into v_expense_account
      from public.expense_category_map where category = v_category and active;
    if v_expense_account is null then
      raise exception 'ledger adapter: category % ไม่พบใน expense_category_map (fail-safe no-guess)', v_category
        using errcode = 'no_data_found';
    end if;

    v_credit_account := case when v_payment_method = 'cash' then '1010' else '2010' end;

    if v_payload ? 'doc_date' and coalesce(v_payload->>'doc_date', '') <> '' then
      v_entry_date := (v_payload->>'doc_date')::date;
    else
      v_entry_date := (timezone('utc', now()))::date;
    end if;

    v_vat_amount := round(v_vat, 2);
    v_wht_amount := round(v_wht, 2);
    v_expense_amount := round(v_total, 2) - v_vat_amount;
    v_credit_amount := v_expense_amount + v_vat_amount - v_wht_amount;
    if v_expense_amount < 0 then
      raise exception 'ledger adapter: vat (%) มากกว่า total (%) — ข้อมูลผิด', v_vat, v_total using errcode = 'check_violation';
    end if;
    if v_credit_amount <= 0 then
      raise exception 'ledger adapter: wht (%) >= ยอดสุทธิ — ข้อมูลผิด', v_wht using errcode = 'check_violation';
    end if;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_expense_account, 'debit', v_expense_amount, 'credit', 0)
    );
    if v_vat_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code', '1040', 'debit', v_vat_amount, 'credit', 0));
    end if;
    if v_wht_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2030', 'debit', 0, 'credit', v_wht_amount));
    end if;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_credit_account, 'debit', 0, 'credit', v_credit_amount));

    v_journal_id := public.rpc_post_journal_entry(
      'internal',
      v_entry_date,
      format('expense capture %s — %s', p_id, v_category),
      v_lines,
      'THB',
      'posted'::public.ledger_entry_status,
      v_site,
      jsonb_build_object('capture_artifact_id', p_id, 'capture_type', v_type)
    );

    update public.capture_artifact
      set linked_entity_type = 'journal_entry', linked_entity_id = v_journal_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'journal_entry_id', v_journal_id,
        'total', v_total, 'vat', v_vat, 'wht', v_wht, 'category', v_category,
        'expense_account', v_expense_account, 'credit_account', v_credit_account));

  -- L3 commit-target adapter #3: 'actual_purchase_price' → ราคาซื้อจริง + MAC (ADR-029: normalized identity)
  elsif v_commit_target = 'actual_purchase_price' then
    v_material := v_payload->>'material';
    v_qty := coalesce((v_payload->>'qty')::numeric, 0);
    v_price := coalesce((v_payload->>'price')::numeric, -1);
    v_po_ref := v_payload->>'po_ref';
    v_spec_match := (v_payload->>'spec_match')::boolean;

    if v_material is null or v_material = '' then
      raise exception 'costing adapter: material ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_price < 0 then
      raise exception 'costing adapter: price ไม่ถูกต้อง/ไม่ได้ส่งมา — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_qty <= 0 then
      raise exception 'costing adapter: qty ต้อง > 0 (ได้ %) — fail-safe no-guess', v_qty using errcode = 'check_violation';
    end if;

    -- ADR-029: จับคู่ผ่าน name_normalized; แถวใหม่ derive code จากชื่อ normalized + needs_review=true;
    --          แถวเดิม (conflict) คง material_code/ชื่อ/needs_review เดิม — อัปเดตเฉพาะ costing
    v_material_norm := public.normalize_name(v_material);

    insert into public.material_master
      (material_code, name, name_normalized, unit, last_purchase_price, moving_avg_price, total_received_qty, last_purchased_at, needs_review)
    values
      ('MAT-' || substr(md5(v_material_norm), 1, 8), v_material, v_material_norm, 'unit', v_price, v_price, v_qty, v_now, true)
    on conflict (name_normalized) do update set
      last_purchase_price = v_price,
      moving_avg_price = round(
        (public.material_master.total_received_qty * public.material_master.moving_avg_price + v_qty * v_price)
        / nullif(public.material_master.total_received_qty + v_qty, 0), 4),
      total_received_qty = public.material_master.total_received_qty + v_qty,
      last_purchased_at = v_now
    returning material_code into v_material_code;

    insert into public.material_purchase_price
      (material_code, unit_price, qty, total, po_ref, spec_match, source_capture_id, site_code, received_by)
    values
      (v_material_code, v_price, v_qty, round(v_price * v_qty, 2), v_po_ref, v_spec_match, p_id, v_site, v_principal)
    returning id into v_price_id;

    update public.capture_artifact
      set linked_entity_type = 'material_purchase_price', linked_entity_id = v_price_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'material_code', v_material_code, 'price_id', v_price_id,
        'unit_price', v_price, 'qty', v_qty, 'po_ref', v_po_ref, 'spec_match', v_spec_match));

  -- L3 commit-target adapter #4: 'Released_Spec' → release spec (ADR-031: RACI Designer gate + versioning)
  elsif v_commit_target = 'Released_Spec' then
    v_bible_code := v_payload->>'bible_code';
    v_function := v_payload->>'function';
    v_dimension := v_payload->'dimension';
    v_gate_confirmed := (v_payload->>'gate_confirmed')::boolean;

    if v_bible_code is null or v_bible_code = '' then
      raise exception 'spec adapter: bible_code ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_dimension is null or jsonb_typeof(v_dimension) <> 'object' or v_dimension = '{}'::jsonb then
      raise exception 'spec adapter: dimension ว่าง/ไม่ครบ — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_gate_confirmed is distinct from true then
      raise exception 'spec adapter: gate_confirmed ต้อง = true ก่อน release (แบบยังไม่ผ่าน gate)'
        using errcode = 'check_violation';
    end if;

    -- ADR-031: ผู้ปล่อยแบบ = RACI Designer accountable (แหล่งเดียวกับ approver-resolver 0014) หรือ governance
    --   accountable ว่าง/ไม่มี knowledge_import → fail-safe block (ไม่ปล่อยแบบโดยไม่มีผู้มีอำนาจ — Req 3.4 pattern)
    if not public.is_governance_role() then
      select payload #> array['raciMap', 'Designer', 'accountable'] into v_accountable
      from public.knowledge_import where is_current limit 1;

      if v_accountable is null or jsonb_typeof(v_accountable) <> 'array' or jsonb_array_length(v_accountable) = 0 then
        raise exception 'spec adapter: ไม่พบ RACI Designer accountable (knowledge_import) — fail-safe block'
          using errcode = 'insufficient_privilege';
      end if;
      if not exists (
        select 1 from jsonb_array_elements_text(v_accountable) a where a = v_principal
      ) then
        raise exception 'spec adapter: % ไม่ใช่ Designer lead ตาม RACI — release ต้องเป็นผู้มีอำนาจ (ADR-031)', v_principal
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    select id, version into v_prev_spec_id, v_prev_version
      from public.released_spec where bible_code = v_bible_code and status = 'released' for update;

    if v_prev_spec_id is not null then
      update public.released_spec set status = 'superseded' where id = v_prev_spec_id;
    end if;

    insert into public.released_spec
      (bible_code, version, function, dimension, status, source_capture_id, site_code, released_by)
    values
      (v_bible_code, coalesce(v_prev_version, 0) + 1, v_function, v_dimension, 'released', p_id, v_site, v_principal)
    returning id into v_spec_id;

    if v_prev_spec_id is not null then
      update public.released_spec set superseded_by = v_spec_id where id = v_prev_spec_id;
    end if;

    update public.capture_artifact
      set linked_entity_type = 'released_spec', linked_entity_id = v_spec_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'released_spec_id', v_spec_id, 'bible_code', v_bible_code,
        'version', coalesce(v_prev_version, 0) + 1, 'superseded', v_prev_spec_id, 'raci_gate', 'Designer'));

  -- L3 commit-target adapter #5: 'SiteSurveyZone' → บันทึกข้อมูลวัดหน้างานต่อ zone (versioning)
  elsif v_commit_target = 'SiteSurveyZone' then
    v_zone := v_payload->>'zone';
    v_dimension := v_payload->'dimension';
    v_mep := v_payload->'mep';
    v_photo := coalesce(v_payload->'photo', '[]'::jsonb);
    v_survey_material := v_payload->>'material';

    -- fail-safe no-guess: site/zone/dimension/mep ต้องครบ (survey ต้องผูก site จริง)
    if v_site is null or v_site = '' then
      raise exception 'survey adapter: site_code ว่าง — survey ต้องผูก site' using errcode = 'check_violation';
    end if;
    if v_zone is null or v_zone = '' then
      raise exception 'survey adapter: zone ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_dimension is null or jsonb_typeof(v_dimension) <> 'object' or v_dimension = '{}'::jsonb then
      raise exception 'survey adapter: dimension ว่าง/ไม่ครบ — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if v_mep is null or jsonb_typeof(v_mep) <> 'object' then
      raise exception 'survey adapter: mep ว่าง/ไม่ครบ — fail-safe no-guess' using errcode = 'check_violation';
    end if;

    -- versioning ต่อ (site, zone): มี active เดิม → supersede ก่อน (เคลียร์ partial unique) + version+1
    select id, version into v_prev_zone_id, v_prev_zone_ver
      from public.site_survey_zone where site_code = v_site and zone = v_zone and status = 'active' for update;

    if v_prev_zone_id is not null then
      update public.site_survey_zone set status = 'superseded' where id = v_prev_zone_id;
    end if;

    insert into public.site_survey_zone
      (site_code, zone, version, dimension, mep, material, photo, status, source_capture_id, surveyed_by)
    values
      (v_site, v_zone, coalesce(v_prev_zone_ver, 0) + 1, v_dimension, v_mep, v_survey_material, v_photo, 'active', p_id, v_principal)
    returning id into v_zone_id;

    if v_prev_zone_id is not null then
      update public.site_survey_zone set superseded_by = v_zone_id where id = v_prev_zone_id;
    end if;

    update public.capture_artifact
      set linked_entity_type = 'site_survey_zone', linked_entity_id = v_zone_id
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'site_survey_zone_id', v_zone_id, 'site_code', v_site,
        'zone', v_zone, 'version', coalesce(v_prev_zone_ver, 0) + 1, 'superseded', v_prev_zone_id));

  -- L3 commit-target adapter #6 (0092): 'work_item_open' → เปิดโปรเจกต์ลูกค้าเป็น work_item ใบแรก
  elsif v_commit_target = 'work_item_open' then
    -- fail-safe no-guess ซ้ำที่จุด commit (verify บังคับแล้ว แต่ critical ต้องไม่หลุดถึง business layer)
    if coalesce(v_payload->>'customer_name', '') = '' then
      raise exception 'work_item_open adapter: customer_name ว่าง — fail-safe no-guess' using errcode = 'check_violation';
    end if;
    if coalesce(v_payload->>'phone', '') = '' and coalesce(v_payload->>'line_id', '') = '' then
      raise exception 'work_item_open adapter: ต้องมีช่องทางติดต่อ (phone หรือ line_id) — PFMEA Sale: เก็บไม่ครบ = Scrap 100%%'
        using errcode = 'check_violation';
    end if;
    if v_site is null or v_site = '' then
      raise exception 'work_item_open adapter: site_code ว่าง — work item ต้องผูก site' using errcode = 'check_violation';
    end if;

    -- reuse rpc_create_work_item: step แรก + requires_approval gate ตาม process_model (0033)
    -- data เก็บแค่ ref + ชื่อโปรเจกต์ (ไม่ใช่ข้อมูลบุคคล — PDPA อยู่ที่ artifact)
    v_new_work_item := public.rpc_create_work_item(v_site, jsonb_build_object(
      'source', 'customer_requirement',
      'capture_artifact_id', p_id,
      'project_name', coalesce(v_payload->>'project_name', '')));

    -- G3 (0100): ผูกตัวตนลูกค้าเข้า work item — ไม่ผูก = customer approval ที่ design gates
    -- degrade เป็น internal เดี่ยวเงียบ ๆ (0023) การ์ดขออนุมัติแบบไม่มีวันถึงลูกค้า
    -- ฟอร์ม (Wave A) ส่ง customer_id (uuid จาก line_oa_customer_identity — เกิดตั้งแต่ลูกค้า add OA);
    -- ไม่มี = ลูกค้า walk-in ไม่มี LINE → degrade ตามดีไซน์เดิม + audit ให้เห็นชัด
    v_link_customer := null;
    begin
      if coalesce(v_payload->>'customer_id', '') <> '' then
        select ci.customer_id into v_link_customer
        from public.line_oa_customer_identity ci
        where ci.customer_id = (v_payload->>'customer_id')::uuid
        limit 1;
      end if;
    exception when others then
      v_link_customer := null;  -- uuid เพี้ยน = ไม่ผูก (ไม่ block การเปิดงาน)
    end;
    if v_link_customer is not null then
      update public.work_item set primary_customer_id = v_link_customer where id = v_new_work_item;
    end if;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('op', 'customer_link', 'work_item_id', v_new_work_item,
        'primary_customer_id', v_link_customer, 'linked', v_link_customer is not null));

    update public.capture_artifact
      set linked_entity_type = 'work_item', linked_entity_id = v_new_work_item
      where id = p_id;

    insert into public.capture_audit_log (capture_artifact_id, capture_type, event_type, actor, prev_status, next_status, detail)
    values (p_id, v_type, 'commit', v_principal, 'emitted', 'emitted',
      jsonb_build_object('commit_target', v_commit_target, 'work_item_id', v_new_work_item));
  end if;

  return 'emitted';
end;
$$;

revoke all on function public.rpc_capture_promote(uuid, text, uuid) from public;

-- ---------------------------------------------------------------------------
-- (4) fn_line_handle_group_event — bind ack มีชื่อบ้าน (body เดิมจาก 0098 + slots สองจุด)
-- ---------------------------------------------------------------------------
create or replace function public.fn_line_handle_group_event(
  p_event jsonb,
  p_vertical text,
  p_actor text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_group_line_id text;
  v_user text;
  v_g record;
  v_msg_type text;
  v_text text;
  v_parts text[];
  v_code record;
  v_group_type text;
  v_kind text;
  v_member jsonb;
  v_desc text;
  v_project record;
  v_capture_id uuid;
  -- 1.8c postback branch (0098)
  v_pb jsonb;
  v_appr record;
  v_decision text;
  v_internal_group text;
begin
  v_type := p_event ->> 'type';
  v_group_line_id := p_event #>> '{source,groupId}';
  v_user := p_event #>> '{source,userId}';

  select g.id, g.project_id, g.group_type, g.status, g.site_code
    into v_g
  from public.line_groups g where g.line_group_id = v_group_line_id;

  -- ---- bot เข้ากลุ่ม ----
  if v_type = 'join' then
    if v_g.id is not null then
      return 'join_already_bound';
    end if;
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_bind_prompt', '{}'::jsonb, 'group', v_group_line_id);
    return 'join_prompted';
  end if;

  -- ---- bot ออก/โดนเอาออก → archive (ประวัติคงอยู่; ผูกใหม่ได้เพราะ unique เฉพาะ active) ----
  if v_type = 'leave' then
    if v_g.id is not null then
      update public.line_groups set status = 'archived' where id = v_g.id;
      return 'bot_left_archived';
    end if;
    return 'bot_left_unbound';
  end if;

  -- ---- member sync ----
  if v_type = 'memberJoined' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    for v_member in select jsonb_array_elements(coalesce(p_event #> '{joined,members}', '[]'::jsonb)) loop
      v_kind := case
        when exists (select 1 from public.identity_binding b
                     where b.line_user_id = v_member ->> 'userId' and b.is_active) then 'staff'
        when exists (select 1 from public.line_oa_customer_identity ci
                     where ci.line_user_id = v_member ->> 'userId') then 'customer'
        else 'guest'
      end;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      values (v_g.id, v_member ->> 'userId', v_kind)
      on conflict (group_id, line_user_id) where left_at is null do nothing;
    end loop;
    return 'members_joined';
  end if;

  if v_type = 'memberLeft' then
    if v_g.id is null then return 'members_ignored_unbound'; end if;
    update public.line_group_members m
       set left_at = timezone('utc', now())
     where m.group_id = v_g.id and m.left_at is null
       and m.line_user_id in (
         select x ->> 'userId' from jsonb_array_elements(coalesce(p_event #> '{left,members}', '[]'::jsonb)) x);
    return 'members_left';
  end if;

  -- ---- ข้อความในกลุ่ม ----
  if v_type = 'message' then
    v_msg_type := p_event #>> '{message,type}';

    -- (ก) '#ผูก <code> <ทีม|ลูกค้า>' — ทำงานเฉพาะกลุ่มที่ยังไม่ผูก
    if v_msg_type = 'text' and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ผูก%' then
      if v_g.id is not null then
        select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_ok',
          jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
        return 'bind_already_bound';
      end if;

      v_parts := regexp_split_to_array(btrim(p_event #>> '{message,text}'), '\s+');
      v_group_type := case v_parts[3] when 'ทีม' then 'internal' when 'ลูกค้า' then 'customer' end;

      -- validate: ผู้พิมพ์ต้องมี staff identity (รหัส = capability token ที่ออฟฟิศแจก — ดู comment ตาราง)
      if v_user is null
         or not exists (select 1 from public.identity_binding b where b.line_user_id = v_user and b.is_active)
         or array_length(v_parts, 1) < 3 or v_group_type is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_identity_or_format';
      end if;

      select c.code, c.project_id into v_code
      from public.line_bind_codes c
      where c.code = v_parts[2] and c.expires_at > timezone('utc', now()) and c.uses_left > 0
      for update;

      if v_code.code is null then
        insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
        values ('push', 'pending', 'tpl_inst_bind_fail', '{}'::jsonb, 'group', v_group_line_id);
        return 'bind_failed_code';
      end if;

      select p.id, p.site_code, p.name into v_project
      from public.installation_projects p where p.id = v_code.project_id;

      insert into public.line_groups (line_group_id, project_id, site_code, group_type, vertical_context, bound_by)
      values (v_group_line_id, v_project.id, v_project.site_code, v_group_type, p_vertical, 'line:' || v_user);
      update public.line_bind_codes set uses_left = uses_left - 1 where code = v_code.code;
      insert into public.line_group_members (group_id, line_user_id, member_kind)
      select g.id, v_user, 'staff' from public.line_groups g where g.line_group_id = v_group_line_id
      on conflict (group_id, line_user_id) where left_at is null do nothing;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_bind_ok',
        jsonb_build_object('project_name', coalesce(v_project.name, '-')), 'group', v_group_line_id);
      return 'bound_' || v_group_type;
    end if;

    -- ต่อจากนี้ทำงานเฉพาะกลุ่มที่ผูกแล้ว + ยัง active
    if v_g.id is null then return 'plain_unbound_ignored'; end if;
    if v_g.status <> 'active' then return 'plain_archived_ignored'; end if;

    -- (ข) '#ปัญหา <ข้อความ>' — เฉพาะกลุ่ม internal (Req: เก็บเป็นหลักฐาน + แจ้งหัวหน้างาน)
    if v_msg_type = 'text' and v_g.group_type = 'internal'
       and btrim(coalesce(p_event #>> '{message,text}', '')) like '#ปัญหา%' then
      v_desc := btrim(substr(btrim(p_event #>> '{message,text}'), length('#ปัญหา') + 1));
      if v_desc = '' then return 'issue_empty_ignored'; end if;

      insert into public.installation_issues (project_id, site_code, source, reported_by, line_user_id, description)
      values (v_g.project_id, v_g.site_code, 'line_group', 'line:' || coalesce(v_user, 'unknown'), v_user, v_desc);

      select p.name, p.foreman_employee_id into v_project
      from public.installation_projects p where p.id = v_g.project_id;
      if v_project.foreman_employee_id is not null then
        -- direct push ถึงหัวหน้างาน — resolution ผ่าน identity_binding (0084: target employee_id)
        perform public.rpc_dispatch_notification(
          jsonb_build_object('employee_id', v_project.foreman_employee_id),
          'personal_responsibility', 'field_issue', 'tpl_inst_issue_alert',
          jsonb_build_object('project_name', v_project.name, 'detail', left(v_desc, 80)),
          false, null, true, null, v_g.site_code);
      end if;

      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_issue_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'issue_created';
    end if;

    -- (ค) รูปในกลุ่ม internal → capture รูปจบเลน (ADR-039 ข้อ 3); เลือกห้อง/เลนใน UI ภายหลัง (1.6b)
    if v_msg_type = 'image' and v_g.group_type = 'internal' then
      v_capture_id := public.rpc_capture_ingest(
        'installation_room_proof', 'line',
        'line-message://' || coalesce(p_event #>> '{message,id}', 'unknown'),
        p_event ->> 'webhookEventId',
        v_g.site_code);
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_photo_ack', '{}'::jsonb, 'group', v_group_line_id);
      return 'photo_captured';
    end if;

    -- (ง) แชทธรรมดา/สื่ออื่น → ไม่เก็บ (PDPA v1 — §8)
    return 'plain_ignored';
  end if;

  -- ---- postback จากการ์ดตรวจรับ (0098 — D-5) ----
  if v_type = 'postback' then
    if v_g.id is null then return 'postback_unbound_ignored'; end if;
    begin
      v_pb := (p_event #>> '{postback,data}')::jsonb;
      if coalesce(v_pb ->> 't', '') <> 'inst_approval' then
        return 'postback_unknown_ignored';
      end if;
      v_decision := case v_pb ->> 'd' when 'approve' then 'approved' when 'reject' then 'rejected' end;
      if v_decision is null then return 'postback_malformed_ignored'; end if;

      select a.id, a.project_id, a.approve_token, a.result into v_appr
      from public.installation_approvals a
      where a.id = (v_pb ->> 'id')::uuid
      for update;
    exception when others then
      return 'postback_malformed_ignored';
    end;

    if v_appr.id is null then return 'postback_stale_ignored'; end if;
    if v_appr.project_id <> v_g.project_id then return 'postback_wrong_group_ignored'; end if;
    if v_appr.approve_token::text <> coalesce(v_pb ->> 'k', '') then return 'postback_token_mismatch'; end if;
    if v_appr.result is not null then return 'postback_already_decided'; end if;

    update public.installation_approvals
       set result = v_decision,
           decided_by = 'line:' || coalesce(v_user, 'unknown'),
           decided_at = timezone('utc', now()),
           postback_id = p_event ->> 'webhookEventId'
     where id = v_appr.id;

    select p.name into v_project from public.installation_projects p where p.id = v_g.project_id;

    if v_decision = 'approved' then
      -- ADR-039 มติ 5: ตรวจรับผ่าน = ปิดโปรเจกต์ (work item ปิดไปแล้วตอนใบปิดบ้าน)
      update public.installation_projects
         set status = 'completed'
       where id = v_g.project_id and status = 'customer_review';
    end if;
    -- reject: คง customer_review — ทีมคุย punch list แล้วส่งตรวจรับใหม่ (ไม่ reopen work item)

    -- ack ลูกค้าในกลุ่มเดิม + แจ้งผลเข้ากลุ่ม internal ของบ้านเดียวกัน (ถ้าผูกไว้)
    insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
    values ('push', 'pending', 'tpl_inst_acceptance_ack', '{}'::jsonb, 'group', v_group_line_id);

    select g2.line_group_id into v_internal_group
    from public.line_groups g2
    where g2.project_id = v_g.project_id and g2.group_type = 'internal' and g2.status = 'active';
    if v_internal_group is not null then
      insert into public.line_oa_outbound_messages (send_type, status, template_key, slot_values, target_type, target_id)
      values ('push', 'pending', 'tpl_inst_acceptance_result',
        jsonb_build_object('project_name', coalesce(v_project.name, '-'),
          'result_text', case v_decision when 'approved' then 'รับงานเรียบร้อย ✅' else 'ขอแก้ไขงานก่อนรับ 🙏' end),
        'group', v_internal_group);
    end if;

    insert into public.installation_audit_log (event_type, project_id, site_code, performed_by, detail)
    values ('customer_acceptance_decided', v_g.project_id, v_g.site_code, 'line:' || coalesce(v_user, 'unknown'),
      jsonb_build_object('approval_id', v_appr.id, 'result', v_decision));

    return 'inst_approval_' || v_decision;
  end if;

  return 'ignored_event_type';
exception
  when others then
    -- ห้ามล้มทั้ง webhook batch เพราะ event เดียว — บันทึกแล้วไปต่อ (inbound row + audit จะเก็บหลักฐาน)
    return 'handler_error:' || sqlerrm;
end;
$$;
