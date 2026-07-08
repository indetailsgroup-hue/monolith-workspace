---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "560F2500B"
  - "560F2700B"
  - "560F3000B"
  - "560F3500B"
  - "560F4000B"
  - "560F4500B"
  - "560F5000B"
  - "560F5500B"
  - "560F6000B"
  - "560F2500T"
  - "560F2700T"
  - "560F3000T"
  - "560F3500T"
  - "560F4000T"
  - "560F4500T"
  - "560F5000T"
  - "560F5500T"
  - "560F6000T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.442"
  - "BIun 412-535 Runner systems.pdf:p.520"
specs:
  system_family: TANDEM
  mount_type: undermount
  load_rating_kg: 30
  extension_type: full
  nominal_length_NL_mm: [250, 270, 300, 350, 400, 450, 500, 550, 600]
  side_clearance_mm: 24.5
  cabinet_depth_min_mm: null
  drill_pattern: "first hole 37mm"
  motion_tech: [BLUMOTION, TIP-ON, SERVO-DRIVE]
  soft_close: true
  push_to_open: true
  finishes: [zinc plated]
needs_verify:
  - nominal_length_NL_mm
  - side_clearance_mm
  - drill_pattern
conflicts:
  - field: side_clearance_mm
    note_value: 24.5
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.442 'SKW = LW - 49 mm'. Distance to internal drawer side is 24.5 mm."
    monolith_value: 20.5
    monolith_ref: "Production.ts:L306, drawerRules.ts:L246"
    status: unresolved
  - field: blum_tandem_500_discrepancy
    note_value: 24.5
    note_value_evidence: "The legacy blum-tandem-500-undermount.md file incorrectly listed side clearance as 10-15 mm per side, which is invalid for TANDEM 19 mm runners. Outer gap clearance for 19 mm wood panels is 5.5 mm per side (LW - SKW - 38) / 2 = 5.5 mm, and 6.5 mm per side for 18 mm wood panels."
    monolith_value: null
    monolith_ref: null
    status: unresolved
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, undermount, tandem]
last_verified_at: null
is_stale: false
---

# Blum TANDEM 560F (19 mm) — Undermount Runners (Full Extension)

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ TANDEM 19 mm full extension แบบใช้ตัวล็อกหน้าบาน (Locking Device) สำหรับไม้หนา 17–19 mm รับน้ำหนัก 30 kg

## สรุป
รางลิ้นชักซ่อนใต้แบบดึงเปิดได้เต็มตัว (Full extension) สำหรับลิ้นชักโครงสร้างไม้ที่มีความหนาแผงข้าง 17–19 mm (แผงข้างหนาพิเศษ เช่น ไม้ 18–19 mm) รับน้ำหนักไดนามิกได้ 30 kg ทำงานร่วมกับคลิปยึดล็อกหน้าบาน (Locking Device) 
- **BLUMOTION (Suffix B):** ระบบปิดนุ่มนวลในตัวราง
- **TIP-ON (Suffix T):** ระบบเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง (ไม่มีนุ่มนวล)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 250 | 560F2500B | 560F2500T | 30 | p.442, p.520 |
| 270 | 560F2700B | 560F2700T | 30 | p.442, p.520 |
| 300 | 560F3000B | 560F3000T | 30 | p.442, p.520 |
| 350 | 560F3500B | 560F3500T | 30 | p.442, p.520 |
| 400 | 560F4000B | 560F4000T | 30 | p.442, p.520 |
| 450 | 560F4500B | 560F4500T | 30 | p.442, p.520 |
| 500 | 560F5000B | 560F5000T | 30 | p.442, p.520 |
| 550 | 560F5500B | 560F5500T | 30 | p.442, p.520 |
| 600 | 560F6000B | 560F6000T | 30 | p.442, p.520 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 49 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 24.5 mm ต่อข้าง
- **Outer Gap (ระยะห่างข้างลิ้นชักภายนอก):**
  - ไม้ข้าง 19 mm: $5.5 \text{ mm}$ ต่อข้าง
  - ไม้ข้าง 18 mm: $6.5 \text{ mm}$ ต่อข้าง
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะเจาะขอบหน้าตู้รูแรก `37 mm` (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้พื้นไม้สูง `12–15 mm`

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับสเปก (24.5 mm) สำหรับไม้หนา 19 mm ส่งผลกระทบอย่างรุนแรงต่อการหาความกว้างกล่องลิ้นชักนอก
- **TANDEM 500 Discrepancy:** โน้ตเดิม `blum-tandem-500-undermount` ระบุระยะ clearance 10–15 mm ซึ่งเกิดจากการนิยามสับสนกับระยะภายนอกหรือระบบอื่น ไม่ควรนำมาใช้อ้างอิงการผลิตจริง

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
