# Requirements — Field Purchase (ซื้อของหน้างาน: ขออนุมัติ → ซื้อ → เบิกคืน)

## Introduction

โมดูล **Field Purchase** ปิด loop "ช่างหน้างานเจออุปกรณ์เสีย/ขาด ต้องซื้อด่วน" ให้ครบและ audit ได้ — ตั้งแต่ขออนุมัติก่อนซื้อ จนถึงส่งใบเสร็จเบิกคืน — โดย**ออกแบบจากไม้บรรทัด UX Tenet เป็นตัวตั้ง** (PRD §1): ช่างเห็นแค่ 2 การกระทำ ความยากทั้งหมดอยู่หลังบ้าน

**สถานะ:** design proposal — reuse ของที่มี (capture `expense_document` ✅, approval-postback ✅, authority ใน JD) + net-new เฉพาะ capture type `field_purchase_request` + approval routing
**ปิดช่องว่างที่พบใน:** LINE-Architecture-System-Complete §4.3 (ขั้น "ขออนุมัติก่อนซื้อ" ยังไม่มีสเปค)

## หลักการออกแบบ (front-first)

> **สิ่งที่ช่างเห็น/ทำ — ทั้งหมด:**
> 1. ของหัก → ในกลุ่ม LINE ของบ้าน **ถ่ายรูป + พิมพ์บรรทัดเดียว** เช่น "ดอกสว่านหัก 350" (หรือส่งรูปเฉย ๆ → bot ถามจำนวนด้วยปุ่ม)
> 2. เด้งกลับ **"อนุมัติแล้ว ✅ ซื้อได้เลย"** (หรือ "ยังไม่อนุมัติ: เหตุผล")
> 3. ซื้อเสร็จ → **ถ่ายใบเสร็จส่งเข้า LINE** → จบ
> 4. เงินคืนเข้าช่างอัตโนมัติ
>
> ช่าง**ไม่เห็น**: capture type, work item, vendor master, RACI, double-entry, job cost, ใครอนุมัติ — และ**ไม่กรอกฟอร์ม ไม่เลือกโปรเจกต์**

## Requirements

### Requirement 1: ขอซื้อจากหน้างาน (front = 1 การกระทำ)

1. THE ช่าง SHALL เปิดคำขอด้วย **รูป + จำนวนเงิน + เหตุผลสั้น** ผ่าน LINE กลุ่ม internal ของบ้าน — ส่งรูปแล้ว bot เสนอปุ่ม "แจ้งซื้อของ" หรือพิมพ์สั้น (ไม่มีฟอร์ม, ไม่มี command บังคับ)
2. THE ระบบ SHALL **infer อัตโนมัติ**: บ้าน/ห้อง/work_item (จาก group binding + assignment), ผู้ขอ (จาก staff identity), เวลา/พิกัด — ช่างไม่ต้องเลือก
3. THE คำขอ SHALL สร้างเป็น capture `field_purchase_request` (net-new) — cloud_allowed=false (มีบริบทงานลูกค้า/ตำแหน่ง)

### Requirement 2: อนุมัติตามวงเงิน (routing = หลังบ้าน, ผู้อนุมัติ = 1 tap)

1. THE ระบบ SHALL route คำขอไปผู้อนุมัติ**ตามวงเงินอัตโนมัติ** ตามตารางอำนาจใน JD (ไม่ให้ช่างเลือกว่าใครอนุมัติ):
   - ของใช้สิ้นเปลืองเล็ก (≤ เพดาน A) → **หัวหน้าทีมติดตั้ง** (JD: จัดซื้อของใช้สิ้นเปลืองติดตั้ง)
   - วัสดุ/เครื่องมือ (≤ เพดาน B) → **ผู้จัดการโครงการ** (JD: จัดซื้อวัสดุ/เครื่องมือติดตั้ง)
   - เกินเพดาน B → **กรรมการผู้จัดการ (MD)** (JD จัดซื้อ: PO ต้อง MD อนุมัติ)
2. THE ผู้อนุมัติ SHALL เห็น **Flex การ์ดเดียวในกลุ่ม/แชท** (รูปของหัก + จำนวน + เหตุผล + ใครขอ + บ้านไหน) → **กดปุ่มเดียว** อนุมัติ/ปฏิเสธ (reuse approval-postback, HMAC, idempotent)
3. THE เพดาน A/B SHALL เป็น config (ไม่ hardcode) — owner ตั้งได้ · resolver ผูก RACI/role จริง (pattern เดียวกับ gate confirmer ADR-031: ตรวจว่าผู้กดเป็นผู้มีอำนาจจริง ไม่ใช่แค่ flag)
4. WHEN ผู้อนุมัติไม่ตอบใน SLA THE ระบบ SHALL escalate ขึ้นระดับถัดไป (ไม่ให้ช่างค้างรอเงียบ ๆ)
5. THE ผลอนุมัติ SHALL แจ้งช่างเป็นภาษาคน ("ซื้อได้เลย"/"ยังไม่อนุมัติ: เหตุผล") + บันทึก audit

### Requirement 3: ส่งใบเสร็จ + เบิกคืน (reuse expense_document ✅)

1. THE ช่าง SHALL ถ่ายใบเสร็จส่งเข้า LINE → capture `expense_document` (มีอยู่แล้ว: OCR + fraud flags + รอบัญชียืนยัน)
2. THE ใบเสร็จ SHALL **ผูกกับ `field_purchase_request` ที่อนุมัติแล้วอัตโนมัติ** (match ด้วย ผู้ขอ+บ้าน+ช่วงเวลา+จำนวนใกล้เคียง) — ช่างไม่ต้องอ้างเลขคำขอ
3. WHEN ร้านไม่อยู่ใน vendor master (ร้านฮาร์ดแวร์ข้างไซต์) THE ระบบ SHALL mark `manual_review_required` ให้บัญชีตรวจ (พฤติกรรมถูกต้องอยู่แล้ว — ไม่ auto-ลง)
4. WHEN บัญชียืนยัน THE ระบบ SHALL ลง ledger (double-entry, VAT/WHT) + **ผูก job cost เข้าบ้าน/work_item** (ADR-027: บัญชีเป็นเจ้าของอัตราต้นทุน) + ตั้งเบิกคืนช่าง
5. THE ยอดใบเสร็จที่ต่างจากที่อนุมัติเกิน tolerance SHALL flag ให้ผู้อนุมัติ/บัญชีทราบ (กันซื้อเกินวงเงิน)

### Requirement 4: Traceability + Audit (หลังบ้าน)

1. THE ทุกคำขอ SHALL traceable ครบ loop: ขอ (ใคร/บ้าน/work_item) → อนุมัติ (ใคร/เมื่อ/วงเงิน) → ใบเสร็จ (vendor/VAT) → ledger → เบิกคืน — append-only audit
2. THE คำขอที่ยังไม่ปิด (อนุมัติแล้วแต่ไม่มีใบเสร็จเกิน N วัน) SHALL ขึ้น dashboard หัวหน้า/บัญชี (กันเงินสำรองจ่ายค้าง)

### Requirement 5: บังคับ UX Tenet (ทวนก่อน implement)

1. ช่าง: ทำคำขอจบใน ≤ 2 การกระทำ (รูป + จำนวน), ส่งใบเสร็จ 1 การกระทำ — เห็นศัพท์ระบบ 0 คำ
2. ผู้อนุมัติ: 1 tap ในที่ที่อยู่แล้ว (LINE) — ไม่เปิด console
3. บัญชี: fraud/mismatch ที่ flag ช่วยงาน ไม่ใช่ภาระช่าง

## Correctness Properties

1. **Front simplicity**: ช่างเปิดคำขอ + ส่งใบเสร็จ โดยไม่เลือก project/vendor/approver และไม่เห็น id/key ใด ๆ
2. **Authority correctness**: คำขอเกินเพดานของผู้กด → ปฏิเสธที่หลังบ้าน (ผู้กดต้องเป็นผู้มีอำนาจจริงตามวงเงิน ไม่ใช่แค่กดได้)
3. **Receipt-request linkage**: ใบเสร็จ match กับคำขอที่อนุมัติแล้วเสมอ (ไม่มีใบเสร็จลอย, ไม่มีคำขอปิดโดยไม่มีใบเสร็จ)
4. **No silent overspend**: ใบเสร็จเกินวงเงินอนุมัติ + tolerance → flag ไม่ auto-ลง
5. **Full trace**: ทุกรายการ trace ครบ ขอ→อนุมัติ→ซื้อ→ลง→เบิกคืน + audit
