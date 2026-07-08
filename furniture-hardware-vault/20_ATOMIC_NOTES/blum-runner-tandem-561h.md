---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "561H2601B"
  - "561H2851B"
  - "561H3101B"
  - "561H3351B"
  - "561H3601B"
  - "561H3851B"
  - "561H4101B"
  - "561H4351B"
  - "561H4601B"
  - "561H4851B"
  - "561H5101B"
  - "561H5351B"
  - "561H5601B"
  - "561H2601T"
  - "561H2851T"
  - "561H3101T"
  - "561H3351T"
  - "561H3601T"
  - "561H3851T"
  - "561H4101T"
  - "561H4351T"
  - "561H4601T"
  - "561H4851T"
  - "561H5101T"
  - "561H5351T"
  - "561H5601T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.438"
  - "BIun 412-535 Runner systems.pdf:p.516"
specs:
  system_family: TANDEM
  mount_type: undermount
  load_rating_kg: 30
  extension_type: full
  nominal_length_NL_mm: [260, 285, 310, 335, 360, 385, 410, 435, 460, 485, 510, 535, 560]
  side_clearance_mm: 21
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
    note_value: 21
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.438 'SKW = LW - 42 mm'. Distance to internal drawer side is 21 mm."
    monolith_value: 20.5
    monolith_ref: "Production.ts:L306, drawerRules.ts:L246"
    status: unresolved
  - field: blum_tandem_500_discrepancy
    note_value: 21
    note_value_evidence: "The legacy blum-tandem-500-undermount.md file incorrectly listed side clearance as 10-15 mm per side, which is invalid for TANDEM 16 mm runners. Outer gap clearance for 16 mm wood panels is 5 mm per side (LW - SKW - 32) / 2 = 5 mm, and 6 mm per side for 15 mm wood panels."
    monolith_value: null
    monolith_ref: null
    status: unresolved
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, undermount, tandem]
last_verified_at: null
is_stale: false
---

# Blum TANDEM 561H (16 mm) — Undermount Runners (Full Extension - Hook & Peg)

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ TANDEM full extension แบบเกี่ยวและสลักหลัง (Hook & Peg) สำหรับไม้หนา 11–16 mm รับน้ำหนัก 30 kg

## สรุป
รางลิ้นชักซ่อนใต้แบบดึงเปิดได้เต็มตัว (Full extension) สำหรับลิ้นชักโครงสร้างไม้ที่มีความหนาแผงข้าง 11–16 mm รับน้ำหนักไดนามิกได้ 30 kg รุ่นเกี่ยวลิ้นชักและใช้สลักหลัง (Hook & Peg) โดยไม่ต้องใช้กิ๊บล็อคหน้าตู้ (Locking Device) 
- **BLUMOTION (Suffix B):** ระบบปิดนุ่มนวลในตัวราง
- **TIP-ON (Suffix T):** ระบบเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง (ไม่มีนุ่มนวล)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 260 | 561H2601B | 561H2601T | 30 | p.438, p.516 |
| 285 | 561H2851B | 561H2851T | 30 | p.438, p.516 |
| 310 | 561H3101B | 561H3101T | 30 | p.438, p.516 |
| 335 | 561H3351B | 561H3351T | 30 | p.438, p.516 |
| 360 | 561H3601B | 561H3601T | 30 | p.438, p.516 |
| 385 | 561H3851B | 561H3851T | 30 | p.438, p.516 |
| 410 | 561H4101B | 561H4101T | 30 | p.438, p.516 |
| 435 | 561H4351B | 561H4351T | 30 | p.438, p.516 |
| 460 | 561H4601B | 561H4601T | 30 | p.438, p.516 |
| 485 | 561H4851B | 561H4851T | 30 | p.438, p.516 |
| 510 | 561H5101B | 561H5101T | 30 | p.438, p.516 |
| 535 | 561H5351B | 561H5351T | 30 | p.438, p.516 |
| 560 | 561H5601B | 561H5601T | 30 | p.438, p.516 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 42 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 21 mm ต่อข้าง
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะเจาะขอบหน้าตู้รูแรก `37 mm` (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้พื้นไม้สูง `12–15 mm`
- **Hook & Peg Drill Spec:** ระยะรูเจาะเกี่ยวและเจาะสลักหลังลิ้นชักไม้ เป็นค่าพิกัดสำคัญทางเรขาคณิต (drillMap-critical) ต้องทวนสอบจากแบบแปลนหน้างานจริง

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับสเปก (21.0 mm)
- **TANDEM 500 Discrepancy:** โน้ตเดิม `blum-tandem-500-undermount` ระบุระยะ clearance 10–15 mm ซึ่งผิดพลาดจากการนิยาม

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
