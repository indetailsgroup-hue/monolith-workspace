---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "766H4500S"
  - "766H5000S"
  - "766H5200S"
  - "766H5500S"
  - "766H5800S"
  - "766H6000S"
  - "766H6500S"
  - "766H7000S"
  - "766H7500S"
  - "766H4500T"
  - "766H5000T"
  - "766H5200T"
  - "766H5500T"
  - "766H5800T"
  - "766H6000T"
  - "766H6500T"
  - "766H7000T"
  - "766H7500T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.412"
  - "BIun 412-535 Runner systems.pdf:p.510"
specs:
  system_family: MOVENTO
  mount_type: undermount
  load_rating_kg: 70
  extension_type: full
  nominal_length_NL_mm: [450, 500, 520, 550, 580, 600, 650, 700, 750]
  side_clearance_mm: 21
  cabinet_depth_min_mm: null
  drill_pattern: "first hole 37mm"
  motion_tech: [BLUMOTION, TIP-ON, TIP-ON BLUMOTION, SERVO-DRIVE]
  soft_close: true
  push_to_open: true
  finishes: [zinc plated]
needs_verify:
  - nominal_length_NL_mm
  - side_clearance_mm
  - drill_pattern
conflicts:
  - field: side_clearance_mm
    note_value: 21
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.412 'SKW = LW - 42 mm'. Distance to internal drawer side is 21 mm."
    monolith_value: 20.5
    monolith_ref: "Production.ts:L306, drawerRules.ts:L246"
    status: unresolved
  - field: nominal_length_NL_mm
    note_value: [450, 500, 520, 550, 580, 600, 650, 700, 750]
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.412. Only NL 450-750 are listed for 70 kg class runners (580 mm is 60 kg class)."
    monolith_value: null
    monolith_ref: null
    status: unresolved
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, undermount, movento]
last_verified_at: null
is_stale: false
---

# Blum MOVENTO 766H (60/70 kg) — Undermount Runners

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ระดับพรีเมียมรับน้ำหนักสูง 60/70 kg ปรับได้ 4 มิติ

## สรุป
รางลิ้นชักซ่อนใต้ไม้ (Undermount slide) สำหรับโครงสร้างลิ้นชักไม้ขนาดใหญ่และลึกระดับพรีเมียม รุ่นปรับ 4 ทิศทาง รองรับน้ำหนักแบบไดนามิกได้สูงถึง 70 kg (ยกเว้นความยาว 580 mm รองรับได้ 60 kg) 
- **BLUMOTION S (Suffix S):** ใช้สำหรับบานปิดนุ่มนวลแบบดึงปกติ หรือทำงานร่วมกับชุด TIP-ON BLUMOTION
- **TIP-ON (Suffix T):** ใช้สำหรับเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION S SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 450 | 766H4500S | 766H4500T | 70 | p.412, p.510 |
| 500 | 766H5000S | 766H5000T | 70 | p.412, p.510 |
| 520 | 766H5200S | 766H5200T | 70 | p.412, p.510 |
| 550 | 766H5500S | 766H5500T | 70 | p.412, p.510 |
| 580 | 766H5800S | 766H5800T | 60 | p.412, p.510 |
| 600 | 766H6000S | 766H6000T | 70 | p.412, p.510 |
| 650 | 766H6500S | 766H6500T | 70 | p.412, p.510 |
| 700 | 766H7000S | 766H7000T | 70 | p.412, p.510 |
| 750 | 766H7500S | 766H7500T | 70 | p.412, p.510 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 42 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 21 mm ต่อข้าง (ระยะจากผนังตู้ด้านในถึงผนังลิ้นชักด้านใน)
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะรูเจาะแรกยึดราง `37 mm` จากขอบด้านหน้าตู้ (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้แผ่นพื้นสูง `12–15 mm`

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับแคตตาล็อกจริง (21.0 mm)
- **Conflict #5 (Restricted NLs):** โค้ดระบบคำนวณเดิมสมมติว่าราง 70kg มีทุกไซส์เหมือน 40kg แต่ความจริงผลิตเฉพาะช่วงความลึก 450–750 mm เท่านั้น (ไม่มีไซส์สั้น 250–420 mm)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
