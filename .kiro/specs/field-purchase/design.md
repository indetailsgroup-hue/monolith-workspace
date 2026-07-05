# Design — Field Purchase

> อ่านคู่กับ `requirements.md` · ออกแบบจาก UX Tenet เป็นตัวตั้ง (front-first): เริ่มจาก "ช่างเห็นแค่ 2 การกระทำ" แล้วดันความยากลงหลังบ้าน

## D-1: Flow เต็ม (front ↔ back)

```
ช่าง (LINE กลุ่ม internal)              หลังบ้าน (ซ่อนจากช่าง)
─────────────────────────              ──────────────────────────────────
1. ถ่ายรูปของหัก + "350"    ──────→    capture field_purchase_request
   (หรือรูป → ปุ่ม "แจ้งซื้อของ"        · infer บ้าน/ห้อง/work_item จาก group binding + assignment
    → bot ถามจำนวนด้วยปุ่ม)             · infer ผู้ขอ จาก staff identity
                                        · route ตามวงเงิน → เลือกผู้อนุมัติ (เพดาน A/B config)
                                              │
2.                          ←──────    Flex การ์ดไปผู้อนุมัติ (รูป+จำนวน+เหตุผล+ผู้ขอ+บ้าน)
   "อนุมัติแล้ว ✅ ซื้อได้เลย" ←──────   ผู้อนุมัติกดปุ่มเดียว → postback → resolver ตรวจอำนาจจริง
                                        · audit + แจ้งช่างภาษาคน
                                              │
3. ซื้อ + ถ่ายใบเสร็จส่ง LINE ─────→    capture expense_document (มีอยู่แล้ว)
                                        · OCR + fraud (VAT/vendor/ซ้ำ)
                                        · MATCH ใบเสร็จ ↔ field_purchase_request อัตโนมัติ
                                        · vendor ไม่อยู่ master → manual_review (ถูกต้อง)
                                              │
4. (ไม่ต้องทำอะไร)          ←──────    บัญชียืนยัน → ledger (double-entry, VAT/WHT)
   เงินคืนเข้าช่าง                       · job cost → บ้าน/work_item (ADR-027)
                                        · ตั้งเบิกคืนช่าง + audit ครบ loop
```

## D-2: capture_type `field_purchase_request` (net-new)

field_schema: `amount` (number), `reason` (string), `photo` (array), `item_hint` (string, optional) — **แค่นี้** (ช่างกรอกแค่ amount+reason; ที่เหลือ infer)
commit_target: `purchase_approval` (L3 adapter ใหม่ — สร้าง approval routing) · cloud_allowed=false · critical_fields: `amount`
verify_rules (pfmea-style):
- checkpoint "จำนวนเงินสมเหตุผล + มีรูป" → กันคำขอมั่ว
- checkpoint "ผู้ขอมี staff identity + เป็นสมาชิกโปรเจกต์" → กันคนนอก

## D-3: Inference หลังบ้าน (นี่คือส่วนที่ต้องคิดรอบคอบสุด)

| ต้อง infer | จากอะไร | ถ้ากำกวม |
|-----------|---------|----------|
| บ้าน (project) | group binding (`line_groups.project_id` ของกลุ่มที่ส่งมา) | กลุ่ม 1 = บ้าน 1 → ไม่กำกวม |
| work_item/ห้อง | subtask assignment ของช่างคนนี้วันนี้ | ถ้าหลายห้อง → ปุ่มเลือก (ชื่อภาษาคน) |
| ผู้ขอ | `line_staff_identity` (LINE user_id → พนักงาน) | ไม่มี identity → bot ชวนผูกก่อน (ครั้งเดียว) |
| ผู้อนุมัติ | เพดาน A/B (config) → RACI/role จาก JD authority | — |

**หลักการ:** infer ให้ได้มากที่สุดก่อนถาม; ถามเฉพาะที่ระบบไม่มั่นใจ และถามด้วย**ปุ่มภาษาคน** ไม่ใช่ text input

## D-4: Approval routing (reuse ADR-031 pattern)

- เพดาน A/B ใน config table `field_purchase_thresholds` (owner ตั้ง)
- resolver: amount → level → ผู้อนุมัติ = ผู้ถือ role/RACI นั้นของบ้านนี้ (หัวหน้าทีม/PM/MD)
- **ตรวจอำนาจจริงตอน postback** (เหมือน gate confirmer ADR-031): ผู้กดต้องเป็นผู้มีอำนาจตามวงเงินจริง ไม่ใช่แค่เห็นการ์ด → กันอนุมัติข้ามระดับ
- SLA + escalate ขึ้นระดับถัดไปถ้าไม่ตอบ (reuse workflow escalation — **พึ่ง Phase 13**)

## D-5: Receipt ↔ Request matching (auto)

match `expense_document` กับ `field_purchase_request` ที่ approved & open ด้วย: ผู้ขอเดียวกัน + บ้านเดียวกัน + ช่วงเวลา (หลังอนุมัติ ≤ N วัน) + จำนวนใกล้เคียง (± tolerance)
- match ชัด 1 คู่ → ผูกอัตโนมัติ
- หลายคู่/ไม่ชัด → บัญชีเลือกใน review queue (ไม่รบกวนช่าง)
- ใบเสร็จเกินวงเงินอนุมัติ + tolerance → flag ผู้อนุมัติ/บัญชี (Req 3.5)

## D-6: Data model (net-new + reuse)

```sql
-- net-new
field_purchase_request (id, project_id, work_item_id, requester (staff), amount, reason,
                        photo_refs, status: pending|approved|rejected|purchased|closed,
                        approver, approved_at, approval_level, created_at)  -- RLS C12
field_purchase_thresholds (level, max_amount, role_key)  -- config เพดาน A/B
-- reuse
capture_type_config += 'field_purchase_request'
expense_document + field_purchase_request_id (link)  -- ผูกใบเสร็จ↔คำขอ
approval-postback function  -- reuse Flex + HMAC + idempotent
ledger + job_cost link (ADR-027)
```
ทั้งหมด append-only audit + RLS fail-closed

## D-7: Dependencies

1. **workflow Phase 13** (notification/escalation) — การส่ง Flex + SLA escalate พึ่งชั้นนี้ (ยังไม่ปิด ⏸)
2. `line_staff_identity` + group binding (installation-pm net-new) — infer ผู้ขอ/บ้านพึ่งอันนี้
3. capture spine + expense_document (✅ มีแล้ว) + job cost/ledger (accounting)

## D-8: ทำไมไม่ทำเป็นฟอร์มในแอป

ฟอร์มในแอป = ผลักภาระให้ช่าง (เปิดแอป, กรอก, เลือกโปรเจกต์/หมวด) — ขัด UX Tenet ตรง ๆ · LINE + รูป + จำนวน = การกระทำที่ช่างทำอยู่แล้วทุกวัน → adoption สูงสุด ความยากไปอยู่หลังบ้าน (inference/routing/matching) ตามที่ owner ต้องการ
