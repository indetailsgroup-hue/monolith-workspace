---
note_type: validation_checklist
target_note: ["salice-concealed-hinge", "salice-folding-invisible-hinge", "salice-mounting-plate-smove", "hafele-push-latch", "hafele-free-flap", "hafele-metalla-510-standard", "hafele-metalla-510-blind-corner", "hafele-metalla-510-zero-protrusion", "hafele-minifix-fasteners", "hafele-rafix-system", "hafele-confirmat-screws", "hafele-wood-dowels", "hafele-shelf-supports", "hafele-loox5-drivers", "hafele-loox5-distributors", "hafele-loox5-leads", "hafele-loox-switches", "hafele-loox-led-lights", "hafele-slido-f-line21-20a", "hafele-slido-f-line31-40a", "hafele-slido-f-line11-12a", "hafele-sliding-door-moc", "hafele-kesseboehmer-lemans-ii", "hafele-kesseboehmer-dispensa-larder", "hafele-kesseboehmer-dispensa-junior", "hafele-kesseboehmer-pullout-150", "hafele-wardrobe-dresscode", "hafele-wardrobe-lifts", "hafele-wardrobe-rails", "hafele-locks-moc", "hafele-lock-symo-cases", "hafele-lock-symo-cores", "hafele-lock-fixed-cylinder", "hafele-metalla-510-thin-door", "hafele-metalla-510-wide-angle", "hafele-metalla-510-profile", "hafele-metalla-510-rebated", "hafele-metalla-510-bifold", "hafele-metalla-510-angled"]
review_roles: [hardware_engineer, production]
truth_layer: draft
review_status: unreviewed
tags: [validation, salice, hafele]
---

# Validation: Salice / Häfele Specs

## เกณฑ์รับรอง
- [ ] cup depth Salice 11mm (folding 9mm) ตรงกับแคตตาล็อก + ระบุหน้า/แหล่ง
- [ ] Häfele part no. + Salice model ตรงกันทุกแถว
- [ ] Tab range (110° 3–6 / 155° 3–9) ยืนยัน
- [ ] Free Flap: แปลง lbs→kg ถูกต้อง + ระบุ Model B/C/D
- [ ] **เลือก cup depth ตามแบรนด์ในงาน** (Salice 11 vs Blum 13.5) — กันสับสน in drillMap
- [ ] Minifix cam housing drilling depth (12.5mm for 16mm panels, 13.5mm for 18mm panels) vs database 12.7mm (inconsistency registered)
- [ ] Minifix S200 bolt part numbers (Bright/Galvanized) and sleeves mapped and cross-checked with MONOLITH
- [ ] Rafix 20/30 cams drilling depth and Dim A verified (Rafix 20: 12.7mm depth for 16mm wood, 14.2mm depth for 19mm wood, Dim A = 8.0/9.5mm)
- [ ] Confirmat screw pilot hole sizes (Stepped drill bit sizes 4.0/5.0mm for 1st step, 5.0/7.0mm for 2nd step) verified
- [ ] Fluted dowels beech catalog series (267.82) vs database (267.83) conflict documented
- [ ] Shelf supports twin grooves (9.4 kg and 15.6 kg with securing lug) and 5mm pins mapped
- [ ] ขนาดรูเจาะสำคัญฝั่งตู้ (Ø8/Ø9/Ø12/Ø13/Ø26/Ø35/Ø58 mm) สำหรับสวิตช์ เซ็นเซอร์ โคมไฟ และสายไฟ ตรงกับแคตตาล็อกเล่ม Design 2021
- [ ] ความปลอดภัยและข้อจำกัดการจ่ายกระแสไฟสูงสุด (5A สำหรับสายไฟ 2-pin / 3.5A สำหรับสายไฟ RGB) บันทึกไว้พร้อมระบบป้องกันไฟฟ้าล้น (Overload protection)
- [ ] บันทึกสถานะโน้ตเป็น baseline coverage สำหรับเตรียมทำโมเดล CAD และ drillMap ในอนาคต
- [ ] ขนาดร่องรางวิ่งและรางประคองสำคัญฝั่งตู้ (16mm บน / 6mm และ 14mm ล่าง) ของระบบราง Slido ตรงกับที่ระบุในแคตตาล็อกปี 2021
- [ ] สเปกรูเจาะประคองล่าง Ø35x11 mm และระยะเยื้องศูนย์ 39 mm ของระบบ Slido F-Line11 12A ได้บันทึกไว้อย่างชัดเจนพร้อมหมายเหตุการใช้เครื่องมือเจาะร่วมกับบานพับตู้มาตรฐาน (Ø35 Forstner bit)
- [ ] ข้อจำกัดด้านสัดส่วนบานประตู (H <= 3xW) และสูตรคำนวณน้ำหนักบาน ได้ถูกระบุว่าเป็นเพียงคู่มือแนะนำจากผู้ผลิต (Manufacturer Guidelines) ที่ยังไม่มีผลบังคับใช้ในซอร์สโค้ดของ MONOLITH
- [ ] ระยะเจาะยึดแกนหมุนแนวตั้ง (Spindle height options) และมุมเปิดประตูต่ำสุด 85° สำหรับ LeMans II ตรงตามข้อมูลแผนงาน
- [ ] แนวกึ่งกลางและการเจาะระยะห่าง Dim X = Cabinet Width - 75 mm สำหรับรางยึดบน-ล่างของตู้ดึงสูง Dispensa ตรงตามสเปกผู้ผลิต
- [ ] ระยะเจาะรูหน้าสุดเยื้องขอบข้าง Dim A = 38 mm สำหรับชุดตะแกรงข้าง No. 15 (Kesseböhmer) ถูกบันทึกและแยกความต่างจากโมเดล Häfele (13 mm)
- [ ] ตรวจสอบว่าไม่มีการเชื่อมโยงระบบรางเลื่อนของ Kesseböhmer กับ Blum Tandem โดยพลการ เว้นแต่ระบุชัดเจนในแคตตาล็อกว่าเป็นสิทธิ์การผลิตร่วม
- [ ] ความกว้างของเฟรม Dresscode และการหลบบานพับ/บานเลื่อน (ใช้ Spacer Bar 21/42 mm) บันทึกไว้พร้อมหมายเหตุว่าเป็นสูตรแนะนำจากผู้ผลิต (Manufacturer Guidelines)
- [ ] ขนาดเจาะปลั๊กเสียบยึดแผงเฟรม/สวิตช์ Dresscode ขนาด Ø5 mm ระยะรูเจาะ System 32 บันทึกถูกต้อง
- [ ] ระยะเจาะยึดแผงข้างของลิฟต์ยกราวแขวนเสื้อผ้า (Horizontal Spacing = 450 mm หรือ 480 mm) ระบุไว้พร้อมแท็ก drillmap และต้องการการตรวจสอบ (needs_verify)
- [ ] ค่าจำกัดพิกัดรับน้ำหนักสูงสุดของระบบลิฟต์แต่ละซีรีส์ (10 kg - 18 kg) บันทึกครบถ้วนตามคู่มือแนะนำจากผู้ผลิต (Manufacturer Guidelines)
- [ ] จุดยึดแป้นรับราวแขวนแบบตรงขอบเหลี่ยม (OVA) ด้วยพิกัด System 32 และคุณสมบัติรูเจาะร้อยสายไฟ Loox บันทึกเรียบร้อย
- [ ] ขนาดรูเจาะเสื้อกุญแจสำหรับซีรีส์ Symo 3000 ทั้งหมด (Ø18 mm) บันทึกถูกต้องตามหน้าแคตตาล็อกและแบบแปลนจริง
- [ ] ระยะเจาะเยื้องจากขอบ (Backset D = 25 mm สำหรับตลับ Rim, 24.5 mm สำหรับตู้บานสไลด์ Roller shutter, 22 mm สำหรับ Mortice, 20 mm สำหรับฝังขอบ Inlaid) บันทึกตามเกณฑ์ทวนสอบ
- [ ] สเปกรุ่นและรหัสสั่งซื้อเฉพาะแบบแยกชิ้น (ตลับตู้ซ้าย/ขวา/ลิ้นชัก และไส้กุญแจ) ของระบบ Symo 3000 ได้ถูกตรวจสอบและอ้างอิงตรงหน้าแคตตาล็อกจริง
- [ ] ขนาดรูเจาะแกนสำหรับกุญแจเสื้อฟิกซ์ทั่วไป (Ø18 mm หรือ Ø22 mm) บันทึกตรงกับประเภทและยี่ห้อสินค้า
- [ ] มนุษย์ (hardware engineer) ยืนยัน → set verified


## ✅ CONFLICT — Häfele Metalla 510 cup depth (RESOLVED 2026-06)
> ยืนยันด้วย PDF text layer + แก้โค้ดให้ตรงแล้ว
- [x] **Blind Corner Standard (329.11.705):** catalog=13.5mm — แก้ `h_blind` 11.5→13.5 + citation p.191 แล้ว
- [x] **Zero Protrusion 155° (329.29.217):** catalog=13.5mm — แก้ `h155_full` 11.5→13.5 + citation p.190 แล้ว
- [x] อัปเดต `conflicts.status: resolved` + ล้าง `needs_verify` ในโน้ตทั้งสองแล้ว
- [ ] (ค้าง — แยกเคส) ทบทวน inconsistency cup depth ในซอร์สโค้ด runtime: `HingeCatalog.ts`=11.5 / `hardware.schema.ts`=12 / `hardwareTypes.ts`+`HardwareLibrary.tsx`=12.5

## ผลตรวจ
- 2026-06: ยืนยันฝั่งแคตตาล็อกด้วย Python text-layer extraction จาก `blaetterkatalog (1).pdf`:
  - p.191 `329.11.705`: "Drilling depth: Hinge cup **13.5 mm**"
  - p.190 `329.29.217`: "Drilling depth: Hinge cup **13.5 mm**"
  → ฝั่ง catalog = 13.5mm **ยืนยันแล้ว**
- ผลสืบโค้ด MONOLITH:
  - ค่า 11.5 ใน `hardware-drilling-specifications.md` (`h_blind`, `h155_full`) **ไม่มี source/คอมเมนต์กำกับ** — เป็นค่ากรอกลอยๆ
  - เอกสารสเปกนี้ **ไม่ได้ wired เข้า runtime** — โค้ดจริงใน `src/core/catalog/HingeCatalog.ts` ใช้แคตตาล็อกคนละชุด (article code 71T3550 ฯลฯ = Blum/generic) → แก้เอกสารไม่กระทบ golden test
  - พบ inconsistency เดิมในโค้ด: cupDepth 11.5 (HingeCatalog) / 12 (schema default) / 12.5 (hardwareTypes, HardwareLibrary) — แยกเคสจาก Häfele นี้
- **ค้างตัดสินใจ (วิศวกร):** จะแก้ค่าในเอกสาร `hardware-drilling-specifications.md` ให้เป็น 13.5 + ใส่ citation `blaetterkatalog (1).pdf:p.190/p.191` หรือไม่
