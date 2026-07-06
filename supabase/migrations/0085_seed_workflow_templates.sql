-- Migration: seed_workflow_templates — monolith-workflow-copilot (runbook Wave2 B1, scrutiny F9)
-- Depends on: 0002/0003 (line_oa_message_templates + unique nulls not distinct), 0033–0035 (callers), 0060 (tpl_daily_digest), 0081 (fn_wf_render_notification_text)
--
-- F9 (พบใน grill-with-docs 2026-07-06): template keys ถูกอ้างจาก sla-sweep-scheduler / rpc_complete_work_item /
--   rpc_assemble_daily_digest แต่ไม่เคยมี insert เข้า line_oa_message_templates เลย → deploy แล้วทุก notification
--   จะ fail 'template_unresolvable' (claim v3 ตรวจตอน render — 0084).
--
-- กติกา (Req 6.7, 6.8, 12.2, 12.5):
--   - pre-approved template เท่านั้น (ห้าม free-text) — seed ผ่าน migration = ผ่าน review ใน PR
--   - vertical_context = null → shared ทุก vertical (workflow เป็น internal, fn_wf_render เลือก shared ก่อน)
--   - น้ำเสียงไทยอบอุ่น ไม่ตำหนิ (Req 12.2) และ render แล้ว ≤ 200 ตัวอักษรสำหรับ non-Direct (Req 12.5/12.6
--     — บังคับซ้ำที่ claim v3; ตัวเลขด้านล่างเผื่อ slot uuid 36 ตัวแล้ว)
--   - slots ตรงกับ caller จริง: reminder/timeout → {work_item_id, process_step, approver_kind, escalate_to}
--     (sla-sweep-scheduler buildDispatchParams) · celebrate → {work_item_id, final_step} (0034/0035)
--     · daily_digest → {count, categories} (0060 rpc_assemble_daily_digest)
--
-- หมายเหตุ: runbook B1 ระบุ 4 keys; เพิ่ม tpl_daily_digest เป็นตัวที่ 5 เพราะ 0060 อ้างถึงจริง
--   (สปิริตของ F9 = ทุก key ที่ถูกอ้างต้องมีตัวตน ไม่ใช่แค่ 4 ตัวที่ไล่เจอรอบแรก)

insert into public.line_oa_message_templates (template_key, vertical_context, body, is_active) values
  ('tpl_sla_reminder', null,
   '⏰ เตือนงานรออนุมัติครับ ขั้นตอน {{process_step}} ของงาน {{work_item_id}} รอการอนุมัติจากคุณอยู่ สะดวกเมื่อไรกดอนุมัติได้เลยนะครับ 🙏',
   true),
  ('tpl_sla_timeout', null,
   '⚠️ งาน {{work_item_id}} ขั้นตอน {{process_step}} เกินเวลาที่กำหนดแล้วครับ รบกวนทีมช่วยเข้าไปดูแลต่อด้วยนะครับ',
   true),
  ('tpl_sla_timeout_pm', null,
   '🔔 เรียน PM ครับ งาน {{work_item_id}} ขั้นตอน {{process_step}} เกิน SLA และถูกส่งต่อให้ {{escalate_to}} แล้ว รบกวนช่วยติดตามด้วยครับ 🙏',
   true),
  ('tpl_celebrate', null,
   '🎉 ยินดีด้วยครับ งาน {{work_item_id}} เสร็จสมบูรณ์ครบทุกขั้นตอนแล้ว ({{final_step}}) ขอบคุณทุกคนที่ช่วยกันเต็มที่ครับ 👏',
   true),
  ('tpl_daily_digest', null,
   '☀️ สรุปแจ้งเตือนเช้านี้ครับ ช่วง Quiet Hours ที่ผ่านมามีเรื่องสะสม {{count}} รายการ หมวด: {{categories}} เข้าไปดูรายละเอียดในระบบได้เลยครับ',
   true)
on conflict on constraint line_oa_message_templates_key_vertical_uniq do nothing;
