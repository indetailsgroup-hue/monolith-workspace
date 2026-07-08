---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "560H2500B"
  - "560H2700B"
  - "560H3000B"
  - "560H3200B"
  - "560H3500B"
  - "560H3800B"
  - "560H4000B"
  - "560H4200B"
  - "560H4500B"
  - "560H4800B"
  - "560H5000B"
  - "560H5200B"
  - "560H5500B"
  - "560H6000B"
  - "560H2500T"
  - "560H2700T"
  - "560H3000T"
  - "560H3200T"
  - "560H3500T"
  - "560H3800T"
  - "560H4000T"
  - "560H4200T"
  - "560H4500T"
  - "560H4800T"
  - "560H5000T"
  - "560H5200T"
  - "560H5500T"
  - "560H6000T"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.434"
  - "BIun 412-535 Runner systems.pdf:p.512"
specs:
  system_family: TANDEM
  mount_type: undermount
  load_rating_kg: 30
  extension_type: full
  nominal_length_NL_mm: [250, 270, 300, 320, 350, 380, 400, 420, 450, 480, 500, 520, 550, 600]
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
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.434 'SKW = LW - 42 mm'. Distance to internal drawer side is 21 mm."
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

# Blum TANDEM 560H (16 mm) — Undermount Runners (Full Extension)

> draft/review_ready — รางลิ้นชักซ่อนใต้ไม้ TANDEM full extension แบบใช้ตัวล็อกหน้าบาน (Locking Device) สำหรับไม้หนา 11–16 mm รับน้ำหนัก 30 kg

## สรุป
รางลิ้นชักซ่อนใต้แบบดึงเปิดได้เต็มตัว (Full extension) สำหรับลิ้นชักโครงสร้างไม้ที่มีความหนาแผงข้าง 11–16 mm รับน้ำหนักไดนามิกได้ 30 kg ทำงานร่วมกับคลิปยึดล็อกหน้าบาน (Locking Device) 
- **BLUMOTION (Suffix B):** ระบบปิดนุ่มนวลในตัวราง
- **TIP-ON (Suffix T):** ระบบเปิดด้วยการกดกระเด้งแบบกลไกในตัวราง (ไม่มีนุ่มนวล)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION SKU | TIP-ON SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|---|
| 250 | 560H2500B | 560H2500T | 30 | p.434, p.512 |
| 270 | 560H2700B | 560H2700T | 30 | p.434, p.512 |
| 300 | 560H3000B | 560H3000T | 30 | p.434, p.512 |
| 320 | 560H3200B | 560H3200T | 30 | p.434, p.512 |
| 350 | 560H3500B | 560H3500T | 30 | p.434, p.512 |
| 380 | 560H3800B | 560H3800T | 30 | p.434, p.512 |
| 400 | 560H4000B | 560H4000T | 30 | p.434, p.512 |
| 420 | 560H4200B | 560H4200T | 30 | p.434, p.512 |
| 450 | 560H4500B | 560H4500T | 30 | p.434, p.512 |
| 480 | 560H4800B | 560H4800T | 30 | p.434, p.512 |
| 500 | 560H5000B | 560H5000T | 30 | p.434, p.512 |
| 520 | 560H5200B | 560H5200T | 30 | p.434, p.512 |
| 550 | 560H5500B | 560H5500T | 30 | p.434, p.512 |
| 600 | 560H6000B | 560H6000T | 30 | p.434, p.512 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 42 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 21 mm ต่อข้าง
- **Outer Gap (ระยะห่างข้างลิ้นชักภายนอก):**
  - ไม้ข้าง 16 mm: $5.0 \text{ mm}$ ต่อข้าง
  - ไม้ข้าง 15 mm: $6.0 \text{ mm}$ ต่อข้าง
- **Cabinet depth requirement (LT):**
  - มาตรฐาน: $\text{Min LT} = NL + 3 \text{ mm}$
  - เมื่อมีชุด Stabilisation: $\text{Min LT} = NL + 12 \text{ mm}$
- **Drill pattern:** ระยะเจาะขอบหน้าตู้รูแรก `37 mm` (System 32)
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้พื้นไม้สูง `12–15 mm`

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH ปัจจุบันหักระยะด้านข้างคงที่ `SIDE_GAP: 20.5` mm ซึ่งขัดแย้งกับสเปก (21.0 mm)
- **TANDEM 500 Discrepancy:** โน้ตเดิม `blum-tandem-500-undermount` ระบุระยะ clearance 10–15 mm ซึ่งเกิดจากการนิยามสับสนกับระยะภายนอกหรือระบบอื่น ไม่ควรนำมาใช้อ้างอิงการผลิตจริง

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
