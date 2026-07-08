---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "760H2500S"
  - "760H2700S"
  - "760H3000S"
  - "760H3200S"
  - "760H3500S"
  - "760H3800S"
  - "760H4000S"
  - "760H4200S"
  - "760H4500S"
  - "760H4800S"
  - "760H5000S"
  - "760H5200S"
  - "760H5500S"
  - "760H6000S"
  - "760H2500T"
  - "760H2700T"
  - "760H3000T"
  - "760H3200T"
  - "760H3500T"
  - "760H3800T"
  - "760H4000T"
  - "760H4200T"
  - "760H4500T"
  - "760H4800T"
  - "760H5000T"
  - "760H5200T"
  - "760H5500T"
  - "760H6000T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.412"
  - "BIun 412-535 Runner systems.pdf:p.510"
specs:
  system_family: MOVENTO
  mount_type: undermount
  load_rating_kg: 40
  extension_type: full
  nominal_length_NL_mm: [250, 270, 300, 320, 350, 380, 400, 420, 450, 480, 500, 520, 550, 600]
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
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, undermount, movento]
last_verified_at: null
is_stale: false
---

# Blum MOVENTO 760H (40 kg) — Undermount Runners

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ระดับพรีเมียมรับน้ำหนัก 40 kg ปรับได้ 4 มิติ

## สรุป
รางลิ้นชักซ่อนใต้ไม้ (Undermount slide) สำหรับโครงสร้างลิ้นชักไม้ระดับพรีเมียม รุ่นปรับ 4 ทิศทาง (สูง-ต่ำ, ซ้าย-ขวา, ก้ม-เงย, ลึก-ตื้น) รองรับน้ำหนักแบบไดนามิกได้ 40 kg ใช้ร่วมกับเทคโนโลยีการเลื่อนแบบประสาน (feather-light glide)
- **BLUMOTION S (Suffix S):** ใช้สำหรับบานปิดนุ่มนวลแบบดึงปกติ หรือทำงานร่วมกับชุด TIP-ON BLUMOTION (ปุ่มเปิดพร้อมปิดนุ่มนวลในตัว)
- **TIP-ON (Suffix T):** ใช้สำหรับเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง (ไม่มีนุ่มนวล)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION S SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 250 | 760H2500S | 760H2500T | 40 | p.412, p.510 |
| 270 | 760H2700S | 760H2700T | 40 | p.412, p.510 |
| 300 | 760H3000S | 760H3000T | 40 | p.412, p.510 |
| 320 | 760H3200S | 760H3200T | 40 | p.412, p.510 |
| 350 | 760H3500S | 760H3500T | 40 | p.412, p.510 |
| 380 | 760H3800S | 760H3800T | 40 | p.412, p.510 |
| 400 | 760H4000S | 760H4000T | 40 | p.412, p.510 |
| 420 | 760H4200S | 760H4200T | 40 | p.412, p.510 |
| 450 | 760H4500S | 760H4500T | 40 | p.412, p.510 |
| 480 | 760H4800S | 760H4800T | 40 | p.412, p.510 |
| 500 | 760H5000S | 760H5000T | 40 | p.412, p.510 |
| 520 | 760H5200S | 760H5200T | 40 | p.412, p.510 |
| 550 | 760H5500S | 760H5500T | 40 | p.412, p.510 |
| 600 | 760H6000S | 760H6000T | 40 | p.412, p.510 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 42 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 21 mm ต่อข้าง (ระยะจากผนังตู้ด้านในถึงผนังลิ้นชักด้านใน)
- **Outer Gap (ระยะห่างข้างลิ้นชักภายนอก):**
  - ไม้แผ่นข้าง 16 mm: $5.0 \text{ mm}$ ต่อข้าง
  - ไม้แผ่นข้าง 15 mm: $6.0 \text{ mm}$ ต่อข้าง
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะรูเจาะแรกยึดราง `37 mm` จากขอบด้านหน้าตู้ (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้แผ่นพื้นสูง `12–15 mm`

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับแคตตาล็อกจริง (21.0 mm) ทำให้ลิ้นชักที่ผลิตจริงแคบเกินไป (หลุดจากราง/คลิปหนีบไม่อยู่) ต้องปรับสูตรให้คำนวณแบบ Dynamic ตามความหนาไม้ข้างลิ้นชัก

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
