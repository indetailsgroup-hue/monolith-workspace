---
note_type: product
vendor: blum
system: accessory
truth_layer: draft
review_status: review_ready
sku: []
source_refs:
  - "BIun 198-411 Box systems.pdf:p.389"
specs:
  system_family: "LEGRABOX | MERIVOBOX | TANDEMBOX"
  height_class: null
  side_height_mm: null
  nominal_length_NL_mm: []
  load_rating_kg: null
  extension_type: null
  cabinet_width_min_mm: null
  side_clearance_mm: null
  soft_close: null
  push_to_open: null
  drill_pattern:
    internal_cabinet_width_LW_max_mm: 387
    chipboard_back:
      legrabox_merivobox_tandembox: {X_mm: "NL - 45", Y_mm: "NL + 35", Z_mm: "LW / 2"}
      merivobox_cabinet_profile_over_extension: {X_mm: "NL - 95", Y_mm: "NL + 3", Z_mm: "LW / 2"}
    steel_back:
      legrabox_merivobox_tandembox: {X_mm: "NL - 62", Y_mm: "NL + 18", Z_mm: "LW / 2"}
      merivobox_cabinet_profile_over_extension: {X_mm: "NL - 112", Y_mm: "NL + 3", Z_mm: "LW / 2"}
finishes: []
needs_verify:
  - drill_pattern
  - nominal_length_NL_mm
  - cabinet_width_min_mm
  - side_clearance_mm
  - load_rating_kg
  - extension_type
conflicts: []
related_monolith: []
tags: [blum, servo-drive, waste-bin, accessory]
last_verified_at: null
is_stale: false
---

# SERVO-DRIVE uno for bottom mount waste bin solutions

> draft/review_ready — ตารางตำแหน่งติดตั้ง drive unit และระยะเจาะฐานสำหรับระบบกล่องลิ้นชัก Blum

## สรุป
หน้าสเปกระบุแนวทางการติดตั้ง SERVO-DRIVE uno สำหรับชุดถังขยะติดพื้นตู้ (bottom mount waste bin solutions) ที่ใช้ร่วมกับ LEGRABOX, MERIVOBOX และ TANDEMBOX

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)

### Position – drive unit
| Box system | A min (mm) | A max (mm) |
|---|---|---|
| LEGRABOX | 45 | 47 |
| MERIVOBOX | 28 | 45 |
| TANDEMBOX | 28 | 43 |

A = Distance between the bottom edge of the attachment bracket and the bottom edge of the drive unit

### Drilling distances – base (Internal cabinet width LW ≤ 387 mm)

#### Chipboard back
| System | X (mm) | Y (mm) | Z (mm) |
|---|---|---|---|
| LEGRABOX / MERIVOBOX / TANDEMBOX | NL − 45 | NL + 35 | LW / 2 |
| MERIVOBOX cabinet profile with over extension | NL − 95 | NL + 3 | LW / 2 |

#### Steel back
| System | X (mm) | Y (mm) | Z (mm) |
|---|---|---|---|
| LEGRABOX / MERIVOBOX / TANDEMBOX | NL − 62 | NL + 18 | LW / 2 |
| MERIVOBOX cabinet profile with over extension | NL − 112 | NL + 3 | LW / 2 |

Legend: NL = Nominal length · X = Drilling position · Y = Minimum space requirement · Z = Dimension of engagement

## เชื่อมกับ MONOLITH
ระยะ X/Y/Z และค่า A เป็นข้อมูล drillMap-critical จึงต้อง cross-check กับ MONOLITH ก่อนใช้งานจริง (ดู [[CK-blum-box-specs]])

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] (BIun 198-411 Box systems.pdf:p.389)
- MOC: [[blum-box-systems-moc]]
- Validation: [[CK-blum-box-specs]]
