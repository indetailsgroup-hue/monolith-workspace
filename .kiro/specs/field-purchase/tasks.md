# Implementation Plan — Field Purchase

> Gate: ตรวจ UX Tenet ทุก task (ช่างเห็น ≤ 2 การกระทำ, 0 ศัพท์ระบบ)

## Phase 0: Decisions (blocking)

- [ ] 0.1 Owner ตั้งเพดาน A/B (วงเงินหัวหน้าทีม / PM / MD) → `field_purchase_thresholds`
- [ ] 0.2 ยืนยัน tolerance การ match ใบเสร็จ↔คำขอ (จำนวน ± เท่าไร, ภายในกี่วัน) + SLA อนุมัติ
- [ ] 0.3 depends: workflow Phase 13 (notification/escalation) — Flex + SLA escalate พึ่งชั้นนี้

## Phase 1: คำขอ + อนุมัติ

- [ ] 1.1 Migration `field_purchase_request` + `field_purchase_thresholds` + RLS (C12) + audit
- [ ] 1.2 capture_type `field_purchase_request` (field_schema 4 ช่อง) + verify rules + cloud_allowed=false
- [ ] 1.3 Bot flow: ช่างส่งรูป → ปุ่ม "แจ้งซื้อของ" → ถามจำนวนด้วยปุ่ม/พิมพ์สั้น → สร้างคำขอ + **infer บ้าน/ห้อง/work_item/ผู้ขอ** (D-3)
- [ ] 1.4 Approval routing (D-4): resolver ตามวงเงิน + Flex การ์ด (reuse approval-postback) + ตรวจอำนาจจริงตอน postback + SLA escalate
- [ ] 1.5 แจ้งช่างผลอนุมัติภาษาคน + audit
- [ ] 1.6* Negative tests: Property 1 (front simplicity), 2 (authority — กันอนุมัติข้ามระดับ)

## Phase 2: ใบเสร็จ + เบิกคืน

- [ ] 2.1 `expense_document` + `field_purchase_request_id` link
- [ ] 2.2 Auto-match ใบเสร็จ↔คำขอ (D-5) + review queue เมื่อไม่ชัด
- [ ] 2.3 ledger double-entry + job cost → บ้าน/work_item (ADR-027) + ตั้งเบิกคืน
- [ ] 2.4 Overspend flag (ใบเสร็จ > อนุมัติ + tolerance)
- [ ] 2.5* Negative tests: Property 3 (linkage), 4 (no silent overspend), 5 (full trace)

## Phase 3: Dashboard + ปิดหลุด

- [ ] 3.1 คำขอค้าง (อนุมัติแล้วไม่มีใบเสร็จเกิน N วัน) → dashboard หัวหน้า/บัญชี
- [ ] 3.2 รายงาน job cost ต่อบ้าน (ต้นทุนติดตั้งจริงรวมของซื้อหน้างาน)

## Deferred

- ซื้อล่วงหน้าแบบมีแผน (PR ปกติ → MD) — คนละ flow กับ urgent field purchase
- บัตรเครดิตบริษัท/วงเงินสำรองต่อทีม (แทน reimburse)
