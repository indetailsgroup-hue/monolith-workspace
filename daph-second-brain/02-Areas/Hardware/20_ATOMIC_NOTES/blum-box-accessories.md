---
note_type: product
vendor: blum
system: accessory
truth_layer: draft
review_status: review_ready
sku:
  - "ZF7N70E2"
  - "ZF7N7002"
  - "ZF7M70E2"
  - "ZF7M7002"
  - "ZF7K70E2"
  - "ZF7K7002"
  - "ZF7C70E2"
  - "ZF7C7002"
  - "ZB7N000S"
  - "ZB7M000S"
  - "ZB7K000S"
  - "ZB7C000S"
  - "ZB7F000S"
  - "ZB4N000S"
  - "ZB4M000S"
  - "ZB4K000S"
  - "ZB4E000S"
  - "Z30N000S.04"
  - "Z30M000S.04"
  - "Z30K000S"
  - "Z30C000S"
  - "Z30D000S"
  - "609.1500"
  - "609.1700"
  - "61D.1500"
  - "661.1450.HG"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.204, 206, 210, 214, 220, 258, 260, 264, 268, 298, 300, 304, 308, 312"
specs:
  system_family: null
  height_class: null
  side_height_mm: null
  nominal_length_NL_mm: []
  load_rating_kg: null
  extension_type: null
  cabinet_width_min_mm: null
  side_clearance_mm: null
  soft_close: null
  push_to_open: null
  drill_pattern: null
needs_verify: []
conflicts: []
related_monolith:
  - "specs/reference/master-hardware-database.md"
tags:
  - blum
  - accessory
  - fasteners
last_verified_at: null
is_stale: false
---

# Blum Box Systems Accessories & Fasteners

> draft/review_ready — ชุดตัวยึดหน้าบาน ตัวยึดแผงหลัง และสกรูติดตั้งสำหรับระบบลิ้นชัก Blum

## สรุป
รวบรวมรหัสชิ้นส่วนยึดและชิ้นส่วนประกอบย่อย (Accessories/Fasteners) สำหรับระบบกล่องลิ้นชัก Blum ทั้ง LEGRABOX, MERIVOBOX และ TANDEMBOX เพื่อการเตรียมสเปกของเครื่องเจาะ CAM CNC ได้แม่นยำ

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)

### 1. ตัวยึดหน้าบาน (Front Fixing Brackets)
ยึดระหว่างหน้าบานลิ้นชักกับแผงข้างโลหะ

#### LEGRABOX Front Fixings (หน้า 204, 206, 210, 214, 220)
* **Height N:** EXPANDO = `ZF7N70E2` · Screw-on = `ZF7N7002` · EXPANDO T (บานบาง) = `ZF7N70T2`
* **Height M:** EXPANDO = `ZF7M70E2` · Screw-on = `ZF7M7002` · EXPANDO T = `ZF7M70T2`
* **Height K:** EXPANDO = `ZF7K70E2` · Screw-on = `ZF7K7002` · EXPANDO T = `ZF7K70T2`
* **Height C / F:** EXPANDO = `ZF7C70E2` · Screw-on = `ZF7C7002` · EXPANDO T = `ZF7C70T2`

#### MERIVOBOX Front Fixings (หน้า 258, 260, 264)
* **ทุกความสูง (N/M/K/E):** INSERTA = `ZF4.10I2` · Screw-on = `ZF4.1002` · EXPANDO T = `ZF4.10T2`

#### TANDEMBOX antaro Front Fixings (หน้า 298, 300, 304, 308, 312)
* **ทุกความสูง (N/M/K/C/D):** Knock-in = `ZSF.36A2` · INSERTA = `ZSF.39A2` · Screw-on = `ZSF.35A2`

---

### 2. ตัวยึดแผงหลังไม้ (Chipboard Back Fixings L/R)

| ความสูงของระบบ | LEGRABOX | MERIVOBOX | TANDEMBOX antaro |
|---|---|---|---|
| **Height N** | ZB7N000S | ZB4N000S | Z30N000S.04 |
| **Height M** | ZB7M000S | ZB4M000S | Z30M000S.04 |
| **Height K** | ZB7K000S | ZB4K000S | Z30K000S |
| **Height C** | ZB7C000S | - | Z30C000S |
| **Height D** | - | - | Z30D000S / Z30D000S.22 |
| **Height E** | - | ZB4E000S | - |
| **Height F** | ZB7F000S | - | - |

---

### 3. สกรูติดตั้งแนะนำ (Recommended Screws)
* **เจาะยึดหน้าบานไม้พาร์ติเคิลทั่วไป:** สกรูเกลียวปล่อยปล่อย Ø 3.5 x 15 mm (`609.1500`) หรือ Ø 3.5 x 17 mm (`609.1700`)
* **เจาะยึดตัวยึดแผงหลังไม้ และยึดแผ่นพื้นเข้ากับข้าง:** สกรูหัวแบนแพนเฮด (Pan Head) Ø 4.0 x 15 mm (`61D.1500`) (ในหน้า 258 สำหรับ Merivobox แนะนำสกรูหัวแบนราบ Flat Head Ø 3.5 x 15 mm รหัส `61R.1500` เพื่อหัวสกรูไม่เกิน 2 mm)
* **ยึดรางลิ้นชัก (Cabinet Profile) เข้ากับข้างตู้ไม้:** สกรูระบบยึดพิเศษ Ø 6.0 x 14.5 mm (`661.1450.HG`) หรือสกรูเกลียวปล่อยธรรมดา Ø 4.0 x 15 mm

## เชื่อมกับ MONOLITH
- คอนฟิกตัวยึดหน้าบาน LEGRABOX ใน `master-hardware-database.md` (`BLUM_LEGRABOX_FRONT_FIXING`) ตรงกับแคตตาล็อก
- รหัสสกรูต่างๆ สามารถใช้เป็นตัวเลือกอัตโนมัติในโมดูล CAM program generator (`legraboxOp.ts`) เพื่อสร้างคำสั่งเลือกหัวเจาะเจาะรูนำสกรู

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
