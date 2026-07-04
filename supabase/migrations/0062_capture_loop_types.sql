-- Migration: capture_loop_types — capture-spine Phase 2 (capture-loop tools — AI_CAPTURE_LOOP_TEMPLATE §3)
-- Depends on: 0049 (capture_type_config)
--
-- เพิ่ม capture_type ตาม template promotion targets (config-driven, ไม่แตะ core — Property 9 พิสูจน์แล้ว):
--   site_survey      → SiteSurveyZone (BUILTIN_SITE_SURVEY_FORM)
--   material_receipt → actual_purchase_price (ปิด seam COSTING/PROCUREMENT)
--   spec_draft       → Released_Spec (DRAFT → Gate → FROZEN → RELEASED)
-- ทุก verify_rule มี pfmea_ref (Property 11) + priority (computed RPN ก่อน severity_only). idempotent on conflict.

insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values
  (
    'site_survey',
    jsonb_build_object('dimension', 'object', 'mep', 'object', 'material', 'string', 'photo', 'array', 'zone', 'string'),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'ขนาดพื้นที่ครบทุกด้าน + ตรงกับแบบ',
        'guards_against', 'วัดผิด/ขาดมิติ → ผลิตไม่พอดีหน้างาน',
        'method', 'ตรวจ dimension ครบทุกแกน + เทียบ tolerance',
        'pfmea_ref', jsonb_build_object('source_file', 'AreaMeasurement_PFMEA', 'source_step', 'Area Measurement'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
      ),
      jsonb_build_object(
        'checkpoint', 'ตำแหน่ง MEP (ไฟ/น้ำ/ท่อ) ครบ',
        'guards_against', 'ชนงานระบบตอนติดตั้ง',
        'method', 'ตรวจ mep object ครบรายการ + รูปยืนยัน',
        'pfmea_ref', jsonb_build_object('source_file', 'AreaMeasurement_PFMEA', 'source_step', 'Area Measurement'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 7)
      )
    ),
    'SiteSurveyZone',
    array['dimension', 'mep', 'photo']
  ),
  (
    'material_receipt',
    jsonb_build_object('material', 'string', 'qty', 'number', 'price', 'number', 'po_ref', 'string', 'spec_match', 'boolean'),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'ราคารับเข้า ตรงกับ PO',
        'guards_against', 'ราคาเกิน PO / จ่ายเกินจริง',
        'method', 'เทียบ price กับ po_ref (unverified ถ้าไม่พบ PO)',
        'pfmea_ref', jsonb_build_object('source_file', 'ProductionPlanning_PFMEA', 'source_step', 'Production Planning'),
        'priority', jsonb_build_object('kind', 'rpn', 'rpn', 144)
      ),
      jsonb_build_object(
        'checkpoint', 'วัสดุตรงสเปคที่สั่ง',
        'guards_against', 'รับของผิดสเปค → งานเสีย',
        'method', 'เทียบ material กับ master + spec_match flag',
        'pfmea_ref', jsonb_build_object('source_file', 'ProductionPlanning_PFMEA', 'source_step', 'Production Planning'),
        'priority', jsonb_build_object('kind', 'rpn', 'rpn', 112)
      )
    ),
    'actual_purchase_price',
    array['price', 'material']
  ),
  (
    'spec_draft',
    jsonb_build_object('function', 'string', 'bible_code', 'string', 'dimension', 'object', 'gate_confirmed', 'boolean'),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'แบบผ่าน Gate ยืนยัน (DRAFT→FROZEN)',
        'guards_against', 'ปล่อยแบบที่ยังไม่ยืนยันเข้า Released_Spec',
        'method', 'ตรวจ gate_confirmed = true ก่อน promote',
        'pfmea_ref', jsonb_build_object('source_file', 'Designer_PFMEA', 'source_step', 'Designer'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 9)
      ),
      jsonb_build_object(
        'checkpoint', 'Bible code + มิติครบ',
        'guards_against', 'สเปคขาดข้อมูลผลิต',
        'method', 'ตรวจ bible_code + dimension ครบ',
        'pfmea_ref', jsonb_build_object('source_file', 'Designer_PFMEA', 'source_step', 'Designer'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 7)
      )
    ),
    'Released_Spec',
    array['bible_code', 'dimension', 'gate_confirmed']
  )
on conflict (capture_type) do update set
  field_schema = excluded.field_schema,
  verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target,
  critical_fields = excluded.critical_fields;
