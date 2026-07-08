---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku: []
source_refs: ["hardware-drilling-specifications.md:L449,454-456"]
specs:
  type: undermount slide
  load_rating_kg: 30
  length_min_mm: 250
  length_max_mm: 600
  side_clearance_min_mm: 10
  side_clearance_max_mm: 15
  drawer_bottom_thickness_mm: "12-16"
  drawer_side_thickness_mm: "12-19"
related_monolith: ["src/core/manufacturing/drillMap/", "src/core/fitting/FittingCatalogue.ts"]
tags: [blum, tandem, runner, undermount, drawer]
last_verified_at: null
is_stale: false
---

# Blum TANDEM 500 — Undermount Slide

> review_ready — รางลิ้นชักซ่อนใต้ (undermount) สำหรับลิ้นชักไม้ รับน้ำหนัก 30kg
> (โน้ตแรกของหมวด **Runner Systems** ใน vault)

## สรุป
รางซ่อนใต้ลิ้นชัก ไม่เห็นตัวรางด้านข้าง — ใช้กับลิ้นชักไม้ รองรับ soft-close (BLUMOTION)

## สเปก
| พารามิเตอร์ | ค่า |
|---|---|
| Load capacity | 30 kg |
| Available length (NL) | 250–600 mm |
| Side clearance (ต่อข้าง) | 10–15 mm |
| Drawer bottom thickness | 12–16 mm |
| Drawer side thickness | 12–19 mm |

## เชื่อมกับ MONOLITH
- **Side clearance** ต้องลบออกจากความกว้างภายในตู้ → ได้ความกว้าง drawer box ภายนอก
  (กระทบการตัดแผ่นข้าง/พื้นลิ้นชักใน parametric calc)
- NL (ความยาวราง) จำกัดความลึก drawer box

## อ้างอิง
- Source: [[hardware-drilling-specifications]] (L449,454-456)
- ⚠️ ค่าจาก internal reference — ยืนยันกับแคตตาล็อก Blum (Runner หน้า 412–535) ก่อน verified
