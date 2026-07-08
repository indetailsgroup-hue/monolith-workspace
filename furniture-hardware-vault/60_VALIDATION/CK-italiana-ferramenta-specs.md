---
note_type: validation_checklist
target_note:
  - "italiana-ferramenta-moc"
  - "italiana-ferramenta-leveller-integrato"
  - "italiana-ferramenta-connector-cams-dowels"
  - "italiana-ferramenta-connector-cross-dowels"
  - "italiana-ferramenta-connector-insert-nuts"
  - "italiana-ferramenta-shelf-support-entry-level"
review_roles: [hardware_engineer, production]
truth_layer: draft
review_status: unreviewed
tags: [validation, italiana_ferramenta]
---

# Validation: Italiana Ferramenta Specifications

## เกณฑ์รับรองสเปก
- [ ] ขนาดเจาะหลักใต้พื้นตู้สำหรับ Integrato Tech (Ø31 mm) ตรงกับแคตตาล็อก
- [ ] ขนาดเจาะปรับระดับจากด้านในตู้สำหรับ Integrato Tech (Ø6 mm สำหรับ S4 / Ø8 mm สำหรับ S6) ยืนยันพิกัดระยะยึดสกรูร่วมกัน
- [ ] ระยะเจาะบานถ้วยแคมล็อค (Ø15 / Ø25 mm) และระยะลึก (12.4 / 13.4 mm) มีเอกสารอ้างอิงตรงหน้าจริง
- [ ] กระบอกเจาะขวางข้ามแผงข้าง (Ø10 / Ø14 / Ø16 mm) และระยะเจาะเกลียวรับเดือย (M6/M8/M10) ยืนยันพิกัดความคลาดเคลื่อนจริง
- [ ] ขนาดนำรูเจาะสำหรับพุกฝังเกลียว (Ø5 / Ø8 / Ø10 mm) รับกับเกลียวพุกมิลลิเมตร (M4/M6/M8) ถูกต้องตามคู่มือโรงงาน
- [ ] ขนาดพินเสียบของตัวรับชั้นทั่วไป (Ø5 mm) และระบบการยึดจับแบบ Secury Lock บันทึกพิกัดถูกตัวสินค้า
- [ ] มนุษย์ (hardware engineer) ยืนยันครบ → set `truth_layer: verified`, `review_status: verified`

---

## ประเด็นทบทวน CNC & drillMap (Pending Engineering Sign-off)
- **Integrato Tech Leveller:** ระยะห่างการติดตั้งจากขอบหน้าบานตู้ (Setback) และขนาดบ่ารับน้ำหนักจริง (175 kg/pc) ยังไม่มีสูตรวิศวกรรมคุมในโค้ดหลักของ MONOLITH (ทำหน้าที่เป็นสเปกแนะนำสำหรับ CAD เท่านั้น)
- **Insert Nuts:** พุกเกลียว M6 สเกลรูเจาะนำ Ø8 mm มีพารามิเตอร์ขัดแย้งกับเดือย Minifix บางรุ่นหรือไม่ (เนื่องจากเกลียว Minifix ปกติขันลงไม้โดยตรงที่ Ø5 mm หรือผ่านปลอก Ø8 mm)

---

## ⚠️ Data-integrity flags (Kiro review 2026-06-22 — ส่งคืน agent แก้ ก่อนวิศวกรเซ็น)
- [x] **SKU ซ้ำข้ามโน้ต:** `20102010GR`, `20102020GR`, `20506020HL`, `20507061HL`, `20303030AA`, `20304030AA`, `20304040AA` อยู่ใน `sku` ของทั้ง [[italiana-ferramenta-connector-cams-dowels]] และ [[italiana-ferramenta-connector-insert-nuts]] → ตัดสินว่า part แต่ละตัวควรอยู่โน้ตเดียว (อ้างไฟล์/หน้าจริง) แล้วลบออกจากอีกโน้ต
- [x] **SKU เดียวกัน description ขัดกัน:** `20102010GR` = "Brass spreading dowel (ทองเหลือง)" ใน cams-dowels แต่ = "M6 Zinc Alloy insert nut" ใน insert-nuts → เปิด `Cams_and_dowels.pdf` / `Insert_Nuts.pdf` ยืนยันว่ารหัสนี้คือชิ้นใดกันแน่ (วัสดุ/ไฟล์ต้นทาง)
- [x] **`10209020YA` ใช้ซ้ำ 2 สินค้าใน [[italiana-ferramenta-shelf-support-entry-level]]** (Minisecury 11.0 mm และ Secury Paletta 13.0 mm) → แก้ให้รหัสตรงกับสินค้าเดียว
- [x] **`boring_depth_mm` ของ cross-dowels** ใช้ความหมายก้ำกึ่ง (cross dowel ระบุ L/L1 ไม่ใช่ depth เจาะถ้วย) → ทบทวน mapping field ให้ตรงความหมายจริง
