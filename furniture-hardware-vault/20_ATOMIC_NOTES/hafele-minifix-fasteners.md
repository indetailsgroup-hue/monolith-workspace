---
note_type: product
vendor: hafele
system: connector
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.22-31 (MB 4.8-4.17)"]
sku: ["262.26.033", "262.26.533", "262.26.034", "262.26.534", "262.17.020", "262.17.620", "262.27.949", "262.27.047", "262.28.946", "262.28.044", "262.27.921", "262.28.928", "262.09.202", "262.09.302", "039.00.267", "039.33.462", "051.45.004", "039.33.042"]
# หมายเหตุ: label→SKU แบบละเอียดอยู่ในตาราง body
specs:
  cam_diameters: [12, 15]
  tightening_distance_mm: 5
  boring_depths:
    Minifix_15_16mm_wood: 12.5  # +0.5 mm tolerance
    Minifix_15_18mm_wood: 13.5  # +0.5 mm tolerance
  drilling_dimensions_B: [24, 34]
conflicts:
  - field: boring_depth_mm
    note_value: "12.5 (ไม้ 16mm) / 13.5 (ไม้ 18mm)"
    note_value_evidence: "blaetterkatalog (1).pdf:p.24 (MB 4.10)"
    monolith_value: "12.7 (master DB ค่าเดียว) / 12.5,13.5 (specs config แยกตามไม้)"
    monolith_ref: "master-hardware-database.md:L257 · hardware-drilling-specifications.md (mf15_16/mf15_18)"
    status: unresolved   # master DB ขัดกับ specs config เอง; specs config ตรง catalog แล้ว
  - field: sku_s200_bolt
    note_value: "B24 262.27.949/.047 · B34 262.28.946/.044"
    note_value_evidence: "blaetterkatalog (1).pdf:p.27 (MB 4.13)"
    monolith_value: "B24 262.27.670 · B34 262.28.670"
    monolith_ref: "master-hardware-database.md:L269"
    status: unresolved   # รหัส MONOLITH ไม่พบใน catalog 2021 — อาจเก่า/variant/อ่านพลาด ยืนยันก่อนสรุป
  - field: sku_sleeve
    note_value: "039.33.462 (glue-in) / 039.00.267 (spreading)"
    note_value_evidence: "blaetterkatalog (1).pdf:p.27 (MB 4.13)"
    monolith_value: "262.29.014 / 262.29.024"
    monolith_ref: "master-hardware-database.md:L291"
    status: unresolved   # ซีรีส์ 262.29 ไม่พบใน catalog 2021 — ยืนยันก่อนสรุป
needs_verify: [boring_depth_mm, sku_s200_bolt, sku_sleeve]
related_monolith:
  - "specs/reference/master-hardware-database.md"
  - "specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, minifix, connector, sleeve, fasteners, cabinet-connector]
last_verified_at: null
is_stale: false
---

# Häfele — Minifix Connectors & Fasteners

## 1. Minifix Cams (ตัวเรือนพลาสติกหรือ Zinc alloy)
ระบบตัวเรือนประกอบตู้หลัก (Minifix 15) เจาะหน้าบอร์ดระยะกึ่งกลางห่างจากขอบ (Dim. B) เท่ากับ 24 mm หรือ 34 mm ขึ้นกับแกน Bolt ที่เลือกใช้

### 1.1 Minifix 15 (Ø15mm)
- **Minifix 15 without rim (ไม่มีปีก)**
  - ไม้หนา **16 mm**: ความลึกเจาะรูถ้วย D = **12.5 +0.5 mm**, ระยะ Dim. A = **8.0 mm** (พาร์ต: Bright `262.26.033` / Nickel `262.26.533`)
  - ไม้หนา **18 mm**: ความลึกเจาะรูถ้วย D = **13.5 +0.5 mm**, ระยะ Dim. A = **9.0 mm** (พาร์ต: Bright `262.26.034` / Nickel `262.26.534`)
  - ไม้หนา **19 mm**: ความลึกเจาะรูถ้วย D = **14.0 +0.5 mm**, ระยะ Dim. A = **9.5 mm** (พาร์ต: Bright `262.26.035` / Nickel `262.26.535`)
- **Minifix 15 with rim (มีปีก)**
  - ไม้หนา **16 mm**: ความลึกเจาะรูถ้วย D = **12.5 +0.5 mm**, ระยะ Dim. A = **8.0 mm** (พาร์ต: Bright `262.25.033` / Nickel `262.25.533`)
  - ไม้หนา **19 mm**: ความลึกเจาะรูถ้วย D = **14.5 +0.5 mm**, ระยะ Dim. A = **9.5 mm** (พาร์ต: Bright `262.25.035` / Nickel `262.25.535`)

### 1.2 Minifix 12 (Ø12mm)
- สำหรับไม้หนาตั้งแต่ **12 mm** ขึ้นไป: ความลึกเจาะรูถ้วย D = **9.5 +0.2 mm**, ระยะ Dim. A = **6.0 mm** (พาร์ต: Bright `262.17.020` / Nickel `262.17.620`)

---

## 2. Connecting Bolts (แกนยึด Minifix)

### 2.1 S200 Connecting Bolts (แกนเกลียวมิล M6)
*ต้องใช้คู่กับปลอกฝังเกลียวใน (Sleeve)*
- **B24 (Shaft Length 24 mm)**: ความยาวเกลียว 7.5 mm (พาร์ต: Bright `262.27.047` / Galvanized `262.27.949`)
- **B34 (Shaft Length 34 mm)**: ความยาวเกลียว 7.5 mm (พาร์ต: Bright `262.28.044` / Galvanized `262.28.946`)

### 2.2 S100 Connecting Bolts (แกนยึดไม้โดยตรง - Special Thread)
*เกลียวหยาบยึดไม้โดยตรง ขนาดรูเจาะนำ Ø5 mm*
- **B24 (Shaft 24 mm)**:
  - เกลียวยาว 8 mm (พาร์ต: Bright `262.27.020` / Galvanized `262.27.920`)
  - เกลียวยาว 11 mm (พาร์ต: Bright `262.27.029` / Galvanized `262.27.921`)
- **B34 (Shaft 34 mm)**:
  - เกลียวยาว 8 mm (พาร์ต: Bright `262.28.020` / Galvanized `262.28.920`)
  - เกลียวยาว 11 mm (พาร์ต: Bright `262.28.026` / Galvanized `262.28.928`)

### 2.3 C100 Spreading Bolts (แกนเบ่งแบบไม่ต้องใช้เครื่องมือ)
*ใช้กับรูเจาะ Ø8 mm ยึดติดแน่นด้วยกลไกเบ่งขยายเกลียวพลาสติก*
- **B24 (Shaft 24 mm)**: เกลียวยาว 11.5 mm (พาร์ต: `262.09.202`)
- **B34 (Shaft 34 mm)**: เกลียวยาว 11.5 mm (พาร์ต: `262.09.302`)

---

## 3. Sleeves for M6 Bolts (ปลอกฝังสำหรับ Bolt เกลียว M6)
ยึดติดในรูเจาะบอร์ด **Ø8 mm**
- **M6 Spreading Sleeve (ปลอกทองเหลืองเบ่ง)**: ขนาด Ø8 x 9 mm (พาร์ต: `039.00.267`)
- **M6 Glue-in Sleeve (ปลอกพลาสติกอัดกาว)**: ขนาด Ø8 x 11 mm (พาร์ต: `039.33.462`)
- **M6 Spreading Sleeve with pellet**: ขนาด Ø8 x 12 mm (พาร์ต: `039.00.061`)

---

## 4. Cover Caps & Tool Details
- **Cover Caps (ฝาปิด CAM)**: ฝาปิดพลาสติก Ø15 mm สำหรับปิดหัว Cam Minifix 15
  - สีขาว (RAL 9010): พาร์ต `262.24.760`
  - สีดำ (RAL 9005): พาร์ต `262.24.368`
  - สีน้ำตาล (RAL 8007): พาร์ต `262.24.162`
- **Precision Drilling Jig (จิ๊กนำเจาะ)**: พาร์ต `001.27.202` (เหล็กชุบ zinc) สำหรับเจาะรูแกน Minifix ขอบไม้ช่วงหนา 16–29 mm

---

## ⚠️ ความเชื่อมโยงกับ MONOLITH
- โค้ดใน `master-hardware-database.md` บันทึกค่า depth ของ Cam = `12.7 mm` ซึ่งไม่ตรงกับสเปกไม้ 16/18 mm ของแคตตาล็อกหลัก
- แต่ Specs config ใน `hardware-drilling-specifications.md` แยก `mf15_16` (depth 12.5) และ `mf15_18` (depth 13.5) ได้ตรงตามสเปกแคตตาล็อกเล่มนี้
- รหัสพาร์ต Bolt (`262.27.670`/`262.28.670`) และ Sleeve (`262.29.014`/`262.29.024`) ในฐานข้อมูล MONOLITH เป็นประเด็นรอการตรวจสอบยืนยัน (Unresolved Conflicts)
