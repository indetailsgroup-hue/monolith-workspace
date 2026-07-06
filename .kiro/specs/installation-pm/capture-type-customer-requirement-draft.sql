-- =====================================================================
-- DRAFT — capture_type 'customer_requirement' (ใบบันทึกความต้องการลูกค้า)
-- สถานะ: ✅ landed แล้วเป็น migration 0092_capture_workitem_open_adapter.sql (2026-07-06 — seed verbatim + adapter #6)
--        (ไฟล์นี้คงไว้เป็นที่มา/เหตุผลของแต่ละ field — แก้ seed = แก้ที่ migration ใหม่ ไม่แก้ 0092 ย้อนหลัง)
-- เดิม: ร่างใน spec folder (แปลงเป็น supabase/migrations/
--        ตอน installation-pm tasks Phase 1.1 พร้อม L3 commit adapter — ดูหมายเหตุท้ายไฟล์)
-- ที่มา (ของจริงทั้งหมด):
--   [1] "สำหรับคุณชุ.xlsx" (2025-07-03) — on Line sales → Qualify ลูกค้า: 9 field
--   [2] "DAPH PFMEA, Sale.xlsx" (2020-11) — step 1 เก็บข้อมูลลูกค้า: field contact
--       (ชื่อ ที่อยู่ เบอร์ อีเมล LINE ID) + Mood&Tone/Function; failure = "Scrap 100%"
--   [3] "DAPH Process control plan,Sale.xls" — control: "ใบบันทึกความต้องการ" + ตรวจใบงานข้อมูล
-- pattern ตาม seed เดิม: 0051_capture_seed.sql (ทุก verify_rule มี pfmea_ref + priority)
-- PDPA: มีข้อมูลบุคคลธรรมดา (ชื่อ/เบอร์/LINE ID/ที่อยู่) → cloud_allowed = false
--       (default ของ 0080 — ADR-033: manual entry จนกว่า on-prem extraction พร้อม)
-- =====================================================================

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

-- cloud_allowed คง default false (0080) — ห้าม flip เป็น true: มีข้อมูลบุคคลธรรมดา (ADR-033)

-- =====================================================================
-- [หมายเหตุ L3 — งาน Phase 1.1 ก่อน landing]
-- commit_target 'work_item_open' ยังไม่มี adapter — ต้องเขียนแบบ 0063 (installation_proof
-- → Work_Item complete): customer_requirement (verified) → เปิด work_item ที่ step แรกของ
-- canonical process ผ่าน rpc_create_work_item + แนบ artifact ref เข้า work item
-- เพื่อให้ Area Measurement "ตรวจสอบข้อมูลจากฝ่ายขาย" (JES-002 step 1) จากใบจริงในระบบ
-- Flow เต็ม: Sale กรอก (PWA/LINE) → capture ingest → verify (มนุษย์ยืนยัน critical_fields)
--           → promote → commit = เปิดโปรเจกต์ลูกค้าในระบบ
-- =====================================================================
