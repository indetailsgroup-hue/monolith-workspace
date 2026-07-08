---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "550F2700B"
  - "550F3000B"
  - "550F3500B"
  - "550F4000B"
  - "550F4500B"
  - "550F5000B"
  - "550F5500B"
  - "550F6000B"
  - "550F6500B"
  - "550F2700T"
  - "550F3000T"
  - "550F3500T"
  - "550F4000T"
  - "550F4500T"
  - "550F5000T"
  - "550F5500T"
  - "550F6000T"
  - "550F6500T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.444"
  - "BIun 412-535 Runner systems.pdf:p.522"
specs:
  system_family: TANDEM
  mount_type: undermount
  load_rating_kg: 30
  extension_type: partial
  nominal_length_NL_mm: [270, 300, 350, 400, 450, 500, 550, 600, 650]
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
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.444 'SKW = LW - 49 mm'. Distance to internal drawer side is 24.5 mm."
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

# Blum TANDEM 550F (19 mm) — Undermount Runners (Single Extension)

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ TANDEM 19 mm single extension แบบใช้ตัวล็อกหน้าบาน (Locking Device) สำหรับไม้หนา 17–19 mm รับน้ำหนัก 30 kg

## สรุป
รางลิ้นชักซ่อนใต้แบบดึงเปิดได้บางส่วน (Single/partial extension) สำหรับลิ้นชักโครงสร้างไม้ที่มีความหนาแผงข้าง 17–19 mm รับน้ำหนักไดนามิกได้ 30 kg ทำงานร่วมกับคลิปยึดล็อกหน้าบาน (Locking Device) 
- **BLUMOTION (Suffix B):** ระบบปิดนุ่มนวลในตัวราง
- **TIP-ON (Suffix T):** ระบบเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง (ไม่มีนุ่มนวล)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 270 | 550F2700B | 550F2700T | 30 | p.444, p.522 |
| 300 | 550F3000B | 550F3000T | 30 | p.444, p.522 |
| 350 | 550F3500B | 550F3500T | 30 | p.444, p.522 |
| 400 | 550F4000B | 550F4000T | 30 | p.444, p.522 |
| 450 | 550F4500B | 550F4500T | 30 | p.444, p.522 |
| 500 | 550F5000B | 550F5000T | 30 | p.444, p.522 |
| 550 | 550F5500B | 550F5500T | 30 | p.444, p.522 |
| 600 | 550F6000B | 550F6000T | 30 | p.444, p.522 |
| 650 | 550F6500B | 550F6500T | 30 | p.444, p.522 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 49 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 24.5 mm ต่อข้าง
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะเจาะขอบหน้าตู้รูแรก `37 mm` (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้พื้นไม้สูง `12–15 mm`

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับสเปก (24.5 mm) สำหรับไม้หนา 19 mm
- **TANDEM 500 Discrepancy:** โน้ตเดิม `blum-tandem-500-undermount` ระบุระยะ clearance 10–15 mm ซึ่งเกิดจากการนิยามสับสน

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
