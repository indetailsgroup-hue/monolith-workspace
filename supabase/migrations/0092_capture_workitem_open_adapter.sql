-- Migration: capture_workitem_open_adapter — installation-pm task 1.5b (L3 adapter #6 + seed customer_requirement)
-- Depends on: 0079 (rpc_capture_promote ล่าสุด — 5 adapters; **ตรวจแล้วไม่มี version ใหม่กว่า**), 0033 (rpc_create_work_item), 0080 (cloud_allowed)
--
-- เพิ่มจาก 0079 สองอย่าง (ที่เหลือคงเดิมทุกบรรทัด — reuse-not-fork):
--   (1) L3 adapter #6: commit_target 'work_item_open' — customer_requirement (verified+approved) → เปิด work_item
--       ที่ step แรกของ canonical process ผ่าน rpc_create_work_item (reuse — ไม่เขียน work_item เอง)
--       + แนบ capture_artifact_id เข้า work_item.data ให้ Area Measurement ตรวจใบจริง (JES-002 step 1)
--       PDPA: ข้อมูลบุคคล (ชื่อ/เบอร์/ที่อยู่) คงอยู่ที่ capture artifact (RLS แน่น) — ไม่ copy ลง work_item.data
--   (2) seed capture_type_config 'customer_requirement' จาก draft ที่ผ่าน owner review
--       (.kiro/specs/installation-pm/capture-type-customer-requirement-draft.sql — PFMEA refs ครบ)

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
    select version into v_wi_version from public.work_item where id = p_linked_entity_id for update;
    if not found then
      raise exception 'capture: linked work_item % not found', p_linked_entity_id using errcode = 'no_data_found';
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
-- Seed capture_type 'customer_requirement' — verbatim จาก draft ที่ผ่าน owner review
-- (สำหรับคุณชุ.xlsx 9 field + PFMEA Sale contact/Mood&Tone + Control Plan ใบบันทึกความต้องการ)
-- cloud_allowed คง default false (0080/ADR-033) — มีข้อมูลบุคคลธรรมดา ห้าม flip
-- ---------------------------------------------------------------------------
insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values
  (
    'customer_requirement',
    jsonb_build_object(
      -- contact block — PFMEA [2]: เก็บไม่ครบ/ผิด = Scrap 100% ทั้ง downstream
      'customer_name',      'string',
      'phone',              'string',
      'email',              'string',
      'line_id',            'string',
      'address',            'string',
      -- 9 field จาก Qualify ลูกค้า [1]
      'project_name',       'string',   -- ชื่อโครงการ/สถานที่ตั้ง
      'unit_type',          'string',   -- แบบ Type บ้าน/ห้อง
      'design_scope_sqm',   'number',   -- ส่วนที่ต้องการออกแบบ/ตรม.
      'design_scope_areas', 'string',   -- ห้อง/ส่วนที่ทำ (ครัว, ห้องนอน, ...)
      'design_style',       'string',   -- Style การออกแบบที่ต้องการ
      'structure_material', 'string',   -- วัสดุโครงสร้าง (เช่น ผนังอลูมิเนียม)
      'carcass_material',   'string',   -- วัสดุโครงตู้
      'surface_material',   'string',   -- วัสดุปิดผิว
      'fitting_brand',      'string',
      -- PFMEA [2] ขั้นเก็บข้อมูล: Mood & Tone / Function
      'mood_tone',          'string',
      'function_notes',     'string'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'ข้อมูลติดต่อครบ (ชื่อ + อย่างน้อย เบอร์ หรือ LINE ID)',
        'guards_against', 'เก็บข้อมูลลูกค้าไม่ครบ/บันทึกผิด → Scrap 100% ทั้ง DAPH และลูกค้า (PFMEA Sale step 1)',
        'method', 'ตรวจ field ว่าง: customer_name, phone|line_id — ว่าง = ไม่ผ่าน verify',
        'pfmea_ref', jsonb_build_object('source_file', 'Sale_PFMEA', 'source_step', 'Sale'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 9)
      ),
      jsonb_build_object(
        'checkpoint', 'Mood & Tone / Function ถูกบันทึก (ไม่ใช่ค่าว่าง)',
        'guards_against', 'พนักงานขายลืมจดรายละเอียดขณะคุย → ดีไซน์เนอร์ได้ข้อมูลไม่ครบ เริ่มงานผิดทาง',
        'method', 'ตรวจ mood_tone + function_notes ไม่ว่าง; ใช้แบบสอบถามมาตรฐานที่ทำร่วมกับฝ่ายดีไซน์',
        'pfmea_ref', jsonb_build_object('source_file', 'Sale_PFMEA', 'source_step', 'Sale'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
      ),
      jsonb_build_object(
        'checkpoint', 'ขอบเขต + วัสดุครบ 4: scope ตรม./ห้อง, โครงสร้าง, โครงตู้, ปิดผิว, fitting brand',
        'guards_against', 'เสนอราคาเบื้องต้นผิดพลาดจากวัสดุ/เรทราคา (PFMEA Sale step 2) — quote ต่ำ/สูงเกินจริง',
        'method', 'ตรวจ design_scope_sqm > 0 และ material fields ไม่ว่าง; ค่าที่ลูกค้ายังไม่ตัดสิน ให้กรอก "TBD" ชัดเจน (ห้ามปล่อยว่าง)',
        'pfmea_ref', jsonb_build_object('source_file', 'Sale_PFMEA', 'source_step', 'Sale'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
      )
    ),
    'work_item_open',   -- [หมายเหตุ L3] ดูท้ายไฟล์
    array['customer_name', 'phone', 'line_id', 'project_name', 'design_scope_sqm']
  )
on conflict (capture_type) do update set
  field_schema    = excluded.field_schema,
  verify_rules    = excluded.verify_rules,
  commit_target   = excluded.commit_target,
  critical_fields = excluded.critical_fields;
