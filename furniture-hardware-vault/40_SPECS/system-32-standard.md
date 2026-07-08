---
note_type: fitting_spec
vendor: generic
system: system32
truth_layer: draft
review_status: review_ready
sku: []
source_refs: ["hardware-drilling-specifications.md:L65-73"]
specs:
  grid_spacing_mm: 32
  front_setback_mm: 37
  rear_setback_mm: 37
  row_spacing_mm: 32
  shelf_pin_hole_diameter_mm: 5
  shelf_pin_hole_depth_mm: 13
related_monolith: ["src/core/designer/policy.ts", "src/core/manufacturing/drillMap/"]
tags: [system32, drilling, standard]
last_verified_at: null
is_stale: false
---

# System 32 — Standard Drilling Pattern

> review_ready — มาตรฐานสากลการเจาะตู้: grid 32mm, setback 37mm, รูยึด Ø5×13

## สเปก
| พารามิเตอร์ | ค่า | คำอธิบาย |
|---|---|---|
| Grid spacing (pitch) | 32 mm | ระยะรูแนวดิ่ง |
| Front setback (first hole) | **37 mm** | ขอบหน้า → แถวแรก |
| Rear setback | 37 mm | ขอบหลัง → แถวสุดท้าย |
| Row spacing | 32 mm | ระยะระหว่างแถว |
| Shelf-pin hole | Ø5 × 13 mm | รูยึด |

## ✅ ยืนยัน first-hole 37mm
แหล่งนี้ระบุ **front setback 37mm** — สอดคล้องกับ Rafix drill guide (Ø5+Ø37), Salice Backset 37mm,
และค่า `SYSTEM_32.firstHoleZ = 37` ในโค้ด MONOLITH (`policy.ts`) → หลักฐานยืนยันที่ **5 แล้ว**

## อ้างอิง
- Source: [[hardware-drilling-specifications]] (L65-73) · เทียบ [[hinge-cup-35mm-system32]]
