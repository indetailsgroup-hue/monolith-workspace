-- Migration: capture_seed — capture-spine Phase 2 (task 1.3)
-- Depends on: 0049_capture_init.sql
--
-- seed capture_type_config แผนกแรก: expense_document (บัญชี/ROI) + installation_proof (ติดตั้ง/compliance)
-- + fraud_signal_config (VAT mismatch / vendor / total anomaly / duplicate).
-- ทุก verify_rule มี pfmea_ref (trace กลับ PFMEA — Property 11) + priority (computed RPN ก่อน severity_only).
-- idempotent: on conflict do update.

insert into public.capture_type_config (capture_type, field_schema, verify_rules, commit_target, critical_fields)
values
  (
    'expense_document',
    jsonb_build_object(
      'vendor', 'string', 'total', 'number', 'vat', 'number', 'wht', 'number', 'category', 'string'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'VAT คำนวณถูกต้อง (vat = total * 7/107)',
        'guards_against', 'ใบกำกับภาษีปลอม/แต่งยอด VAT',
        'method', 'recompute vat จาก total แล้วเทียบ tolerance',
        'pfmea_ref', jsonb_build_object('source_file', 'Sale_PFMEA', 'source_step', 'Sale'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 9)
      ),
      jsonb_build_object(
        'checkpoint', 'vendor อยู่ใน master',
        'guards_against', 'vendor ปลอม/ไม่มีตัวตน',
        'method', 'lookup vendor master (unverified mark ถ้าไม่พบ)',
        'pfmea_ref', jsonb_build_object('source_file', 'Sale_PFMEA', 'source_step', 'Sale'),
        'priority', jsonb_build_object('kind', 'severity_only', 'sev', 8)
      )
    ),
    'ledger',
    array['total', 'vat', 'wht']
  ),
  (
    'installation_proof',
    jsonb_build_object(
      'checklist', 'object', 'before_after', 'array', 'signature', 'string'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'checkpoint', 'งานติดตั้งครบทุก checklist',
        'guards_against', 'ปิดงานทั้งที่ยังไม่ครบ',
        'method', 'ตรวจ checklist ครบทุกข้อ + รูป before/after',
        'pfmea_ref', jsonb_build_object('source_file', 'Installation_PFMEA', 'source_step', 'Installation'),
        'priority', jsonb_build_object('kind', 'rpn', 'rpn', 168)
      ),
      jsonb_build_object(
        'checkpoint', 'ลูกค้าเซ็นรับงาน',
        'guards_against', 'อ้างส่งมอบโดยไม่มีหลักฐานรับ',
        'method', 'ตรวจลายเซ็น/หลักฐานรับงาน',
        'pfmea_ref', jsonb_build_object('source_file', 'Installation_PFMEA', 'source_step', 'Installation'),
        'priority', jsonb_build_object('kind', 'rpn', 'rpn', 144)
      )
    ),
    'Work_Item complete',
    array['checklist', 'signature']
  )
on conflict (capture_type) do update set
  field_schema = excluded.field_schema,
  verify_rules = excluded.verify_rules,
  commit_target = excluded.commit_target,
  critical_fields = excluded.critical_fields;

insert into public.fraud_signal_config (signal_key, rule)
values
  ('vat_mismatch', jsonb_build_object('type', 'vat_recompute', 'tolerance', 0.02, 'fields', jsonb_build_array('total', 'vat'))),
  ('vendor_not_in_master', jsonb_build_object('type', 'master_lookup', 'master', 'vendor', 'field', 'vendor')),
  ('total_anomaly', jsonb_build_object('type', 'threshold', 'field', 'total', 'max', 1000000)),
  ('duplicate_doc', jsonb_build_object('type', 'duplicate', 'key', 'idempotency_key'))
on conflict (signal_key) do update set rule = excluded.rule;
