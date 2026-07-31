# MONOLITH Repair Intelligence — ความเสี่ยงที่ยอมรับของ Phase 0 (TH)

Status: PENDING_OWNER_REVIEW · Phase 1A–3 capabilities: DISABLED

เอกสารนี้บันทึกผลตรวจระดับ LOW จากการรีวิว phase-gate สองเวนเดอร์ ที่ปิดด้วย
**การตัดสินใจอย่างจงใจและผ่านการทบทวน** แทนการแก้โค้ด แต่ละข้อเป็นความเสี่ยงที่
ยอมรับอย่างมีเหตุผล ไม่ใช่การมองข้าม ผลตรวจระดับ HIGH และ MEDIUM แก้ด้วยโค้ด
แล้ว ส่วนผลตรวจ LOW อีกสองข้อมีสถานะแยกกัน: **LOW-1 fix implemented in 0192, pending cross-vendor re-review**;
ส่วน LOW-4 แก้การแสดง hash ของรายงานใน exit
review ให้ครบและผ่านการทบทวนแล้ว ทั้งสองข้อไม่ใช่รายการ accepted risk ในเอกสารนี้

## 1. ตาราง trust-root registry คงขอบเขตระดับ tenant

**ผลตรวจ** migration 0189 ย้ายตารางที่เป็น site-scoped ไปใช้ RLS แบบ
organization/site-grant แต่ตาราง trust-root registry จาก migration 0183 —
`trust_authority_key`, `trust_key_revocation`,
`trust_profile_attestation_revocation`, `trust_warning_grant_revocation` —
ยังเป็น tenant-scoped สมาชิกใดในเทแนนต์จึงอ่านได้

**การตัดสินใจ: ยอมรับ — ขอบเขตระดับ tenant ถูกต้องแล้ว**

- คีย์ลงนามและการเพิกถอนคีย์เป็น **trust root ระดับ tenant** สองในสี่ตาราง
  (`trust_authority_key`, `trust_key_revocation`) **ผูกขอบเขตที่ระดับ tenant
  เท่านั้น** (คอลัมน์ที่ใช้ scope คือ `tenant_id`) ดังนั้น tenant จึงเป็นขอบเขต
  ที่ละเอียดที่สุดที่มีให้ scope อยู่แล้ว
- การเพิกถอนคีย์ / attestation / warning-grant เป็น **สัญญาณความปลอดภัยที่ต้อง
  กระจายให้ทุก site** ในเทแนนต์รับรู้ การจำกัดการเพิกถอนไว้แค่องค์กรเดียวจะซ่อน
  สัญญาณความปลอดภัยจาก site ที่ต้องการ ซึ่งแย่กว่าการเปิดเผย metadata ตามที่ผลตรวจ
  ระบุ
- id และเวลาที่มีผลเป็น metadata ของการเพิกถอนภายในเทแนนต์เดียว ไม่ใช่ locator
  หรือข้อมูลข้ามเทแนนต์ อย่างไรก็ตาม `reason` เป็น free text ที่ไม่มี constraint
  และถูกคัดลอกลง trust bundle ของทุก site จึงรับรองไม่ได้ว่าไม่มี P2; การเปิดเผย
  P2 ขึ้นกับวินัยของ operator ข้อนี้ยังเป็น **ความเสี่ยงเปิด**

**เงื่อนไขทบทวนใหม่** หากเฟสถัดไปมีคีย์ลงนามระดับองค์กร (เพิ่ม
`site_id`/`organization_id` บนตารางคีย์) ให้ re-scope ตารางการเพิกถอนให้ตรงกัน
ตอนนั้น และให้ทบทวนอีกครั้งเมื่อสามารถแทนหรือจำกัด free-text `reason` ด้วยเหตุผล
แบบรหัส การตรวจสอบ และการ redact

## 2. หมายเลข migration 0189–0191 อาจชนกับสาย Trust Kernel donor

**ผลตรวจ** branch นี้กำหนด `0189`–`0191` ให้ migration ของ Repair Phase 0 ส่วน
branch donor ของ Trust Kernel (`trust-kernel/shadow-e0`) อาจมีเนื้อหาต่างกันที่
หมายเลขใกล้เคียง การ reconcile ในอนาคตจึงอาจชนกัน

**การตัดสินใจ: ยอมรับ — การ reconcile เป็นขั้นตอน manual อย่างจงใจ**

- Phase 0 **transplant เฉพาะ Trust Kernel series 24 commit** (`43301f96`..
  `8dfe0cc0`) อย่างจงใจ ไม่ auto-merge สาย donor จึงไม่มีการชนแบบเงียบภายในแผนนี้
- การ reconcile กับสาย donor ในอนาคต **ต้อง renumber ไม่ใช่ merge เงียบ ๆ**
  หมายเลขที่ชนกัน กฎนี้ระบุไว้ในหัวไฟล์
  `0191_repair_phase0_revoke_legacy_mutation_authority.sql` และในเอกสารนี้
- migration เป็นแบบเพิ่มและเดินหน้าอย่างเดียว การ renumber ตอน reconcile เป็นการ
  เปลี่ยนชื่อ ไม่ใช่การเปลี่ยนข้อมูล

**เงื่อนไขทบทวนใหม่** ก่อน transplant ครั้งถัดไปจากสาย donor ให้ diff ช่วง
`018x`/`019x` ของทั้งสอง branch แล้ว renumber migration ของ Repair หากชนกัน

---

การดำเนินการของเจ้าของ: รับทราบความเสี่ยงที่ยอมรับสองข้อนี้เป็นส่วนหนึ่งของ
exit review ของ Phase 0 หรือสั่งให้เปลี่ยนข้อใดข้อหนึ่งเป็นการแก้โค้ดก่อนอนุมัติ
