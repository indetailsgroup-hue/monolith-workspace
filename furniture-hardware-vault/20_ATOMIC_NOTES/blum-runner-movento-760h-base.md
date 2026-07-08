---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "760H3500SU"
  - "760H4000SU"
  - "760H4500SU"
  - "760H5000SU"
source_refs:
  - "BIun 412-535 Runner systems.pdf:p.414"
specs:
  system_family: MOVENTO
  mount_type: base-mount
  load_rating_kg: 40
  extension_type: full
  nominal_length_NL_mm: [350, 400, 450, 500]
  side_clearance_mm: 21
  cabinet_depth_min_mm: null
  drill_pattern: null
  motion_tech: [BLUMOTION]
  soft_close: true
  push_to_open: false
  finishes: [zinc plated]
needs_verify:
  - nominal_length_NL_mm
  - side_clearance_mm
  - drill_pattern
conflicts:
  - field: side_clearance_mm
    note_value: 21
    note_value_evidence: "BIun 412-535 Runner systems.pdf:p.414 'SKW = LW - 42 mm'. Distance to internal drawer side is 21 mm."
    monolith_value: 20.5
    monolith_ref: "Production.ts:L306, drawerRules.ts:L246"
    status: unresolved
related_monolith:
  - "determined-williams/src/core/types/Production.ts"
tags: [blum, runner, base-mount, movento]
last_verified_at: null
is_stale: false
---

# Blum MOVENTO 760H — Base Fixing Runners

> draft/review_ready — รางลิ้นชักซ่อนใต้แบบติดตั้งกับแผ่นพื้นตู้หรือชั้นตู้ ปรับได้ 4 มิติ รับน้ำหนัก 40 kg

## สรุป
รางลิ้นชักซ่อนใต้ไม้รุ่นพิเศษ ติดตั้งบนชั้นตู้หรือแผ่นพื้นด้านล่างโดยตรง (Base mount) เหมาะสำหรับตู้อ่างล้างจานหรือตู้ดึงขยะด้านล่าง รองรับน้ำหนักไดนามิก 40 kg มาพร้อมกับระบบปิดนุ่มนวล BLUMOTION ในตัว (Suffix SU)

## ตารางรหัสและสเปก
| NL (mm) | BLUMOTION SKU | Dynamic Load (kg) | Page Reference |
|---|---|---|---|
| 350 | 760H3500SU | 40 | p.414 |
| 400 | 760H4000SU | 40 | p.414 |
| 450 | 760H4500SU | 40 | p.414 |
| 500 | 760H5000SU | 40 | p.414 |

## ค่าเจาะ/พิกัด (drillMap-critical — pending engineer sign-off)
- **Internal Drawer Width (SKW):** $$SKW = LW - 42 \text{ mm}$$ (LW = Cabinet internal width)
- **Side clearance:** 21 mm ต่อข้าง
- **Cabinet depth requirement (LT):** $\text{Min LT} = NL + 3 \text{ mm}$
- **Bottom Recess:** ระยะหลบก้นลิ้นชักใต้แผ่นพื้นสูง `12–15 mm`
- **Drill pattern:** ติดตั้งกับพื้นโดยตรง (ใช้รูเจาะด้านใต้ตัวราง) รายละเอียดพิกัดพิทช์การติดตั้งเป็น drawing-derived ต้องทวนสอบจากแบบแปลนหน้างานจริง

## เชื่อมกับ MONOLITH
- **Conflict #7:** โค้ด MONOLITH หักระยะข้าง `SIDE_GAP: 20.5` mm ซึ่งไม่ตรงกับสเปก (21 mm)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-runner-systems-moc]]
