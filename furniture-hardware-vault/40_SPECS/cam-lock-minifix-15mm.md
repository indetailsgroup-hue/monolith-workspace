---
note_type: fitting_spec
vendor: hafele
system: connector
truth_layer: draft
review_status: review_ready
sku: []
source_refs: ["hardware-drilling-specifications.md:L253-264"]
specs:
  housing_diameter_mm: 15
  housing_depth_mm: 12.5
  housing_edge_distance_mm: 34
  bolt_diameter_mm: 8
  bolt_center_from_edge_mm: 9.5
  bolt_drill: through
related_monolith: ["src/gate/rules/gateG11_types.ts", "src/core/catalog/MinifixHardware.ts", "src/core/manufacturing/drillMap/"]
tags: [connector, minifix, cam-lock, drilling]
last_verified_at: null
is_stale: false
---

# Minifix 15mm Cam Lock — Drilling Pattern

> review_ready — ตัวยึด knock-down: housing (cam) Ø15 ในหน้าแผ่น + bolt ในสันไม้
> DXF: housing `DRILL_V_15_D12.5` · bolt `DRILL_H_8_THRU`

## สเปก
| พารามิเตอร์ | Housing (cam) | Bolt |
|---|---|---|
| Diameter | 15 mm | 8 mm |
| Depth | 12.5 mm | ทะลุ (through) |
| Edge distance | **34 mm** | 9.5 mm (center) |

## ⚠️ Conflict ที่ต้องตรวจ (vs โน้ตเดิมใน vault)
| ค่า | โน้ตนี้ (internal ref) | [[hafele-minifix-fasteners]] (Häfele catalog) | [[gateG11_types]] / MONOLITH |
|---|---|---|---|
| bolt Ø | **8 mm** | bolt **hole Ø5**, head Ø6.5 | cam Ø15, bolt sleeve Ø10 |
| cam depth | 12.5 mm | — | camDepth **13.5** (DEFAULT_MINIFIX_SPEC) |
| edge dist | 34 mm | Distance B 24 (std) / 34 (ext) | edgeOffset 24 |

→ **bolt Ø8 vs Ø5/Ø10 และ depth 12.5 vs 13.5 ขัดกัน** — อาจเป็นคนละนิยาม (bore vs sleeve) หรือคนละแหล่ง
ต้อง VERIFY กับแคตตาล็อก Häfele จริง + เทียบ `CANONICAL_SPEC.md` ก่อนนำเข้า drillMap

## อ้างอิง
- Source: [[hardware-drilling-specifications]] (L253-264) · เทียบ [[hafele-minifix-fasteners]]
