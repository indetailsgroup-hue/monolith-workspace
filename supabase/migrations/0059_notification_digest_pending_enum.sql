-- Migration: notification_digest_pending_enum — monolith-workflow-copilot (D1 fix, step 1/2)
-- Depends on: 0001 (wf_notification_status enum)
--
-- D1: เพิ่มสถานะ 'digest_pending' ให้ notification — non-Direct ที่โดน suppress ช่วง quiet hours
--   จะถูก "persist" ด้วยสถานะนี้ (แทนการ drop) เพื่อให้ Daily_Digest ดึงไปรวมส่งได้ (Req 6.4/6.6).
-- หมายเหตุ: ALTER TYPE ADD VALUE ต้องแยก migration จากการ "ใช้งาน" ค่าใหม่ (ใช้ใน 0060) — กัน "unsafe use of new value".

alter type public.wf_notification_status add value if not exists 'digest_pending';
