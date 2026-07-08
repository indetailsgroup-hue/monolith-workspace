---
note_type: product
vendor: blum
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 170
source_refs: ["Blum-2024:p.88-89"]
sku: ["71T6540B","70T6540BTL","71T6550","70T6550.TL","71T6580","71T6640B","71T6650","70T6650.TL","71T6680"]
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 11.0
  safety_note: "มีเด็กเล็ก → แนะนำใช้ 155° 0-protrusion แทน"
related_monolith: ["src/core/manufacturing/drillMap/"]
tags: [blum, hinge, clip-top, 170, wide-angle]
last_verified_at: null
is_stale: false
needs_verify: [cup_depth_mm]
---

# Blum CLIP top 170° — Wide Angle สูงสุด

> review_ready (หน้า 88–89) — เปิดกว้างสุด 170° (ไม่มีรุ่น BLUMOTION ในตัว, รหัสกลุ่ม **6xxx**)
> ⚠️ ความปลอดภัย: ถ้ามีเด็กเล็กเข้าถึง แนะนำใช้ [[blum-hinge-155|155° 0-protrusion]] แทน

## ตารางรหัส (Part no.)
| หน้าบาน | Boss | สปริง | สี | Part no. |
|---|---|---|---|---|
| Overlay | INSERTA | ● | NI | 71T6540B |
| Overlay | INSERTA | ○ | NI | 70T6540BTL |
| Overlay | Screw-on | ● | NI | 71T6550 |
| Overlay | Screw-on | ○ | NI | 70T6550.TL |
| Overlay | Knock-in | ● | NI | 71T6580 |
| Dual | INSERTA | ● | NI | 71T6640B |
| Dual | Screw-on | ● | NI | 71T6650 |
| Dual | Screw-on | ○ | NI | 70T6650.TL |
| Dual | Knock-in | ● | NI | 71T6680 |

- **Inset**: ใช้ Dual + เพลทหนา 9 mm
- Soft-close: ใช้ [[blum-blumotion-addon|973A6000]] (สำหรับ 170°)

## ระยะเจาะ TB → FA (Overlay MD0)
TB3→14 … TB8→19 (เชิงเส้น)
- ไม่มีข้อกำหนด min gap (องศากว้างมาก หน้าบานไม่ชนช่องไฟ)

## ความลึกถ้วยบานพับ (Cup Depth)
- **ความลึกถ้วย (Cup Depth):** **11.0 mm** (โค้ด runtime `HingeCatalog.ts` + `HardwareLibrary.tsx` ถูก unify เป็นค่านี้แล้ว)
- **สถานะค่า (drawing-derived — medium confidence):** อ่านจาก **เส้น dimension บนแบบแปลนลายเส้น** หน้า 89 (PDF หน้า 93) ของแคตตาล็อก Blum 2024-2025 — ยังไม่ใช่ตัวเลขจาก text layer
- ⚠️ **ยังคงอยู่ใน `needs_verify: [cup_depth_mm]`** — drillMap-critical ต้องให้วิศวกรยืนยันมิติจากแบบแปลนจริงก่อนเลื่อนเป็น `verified` (industry/web-spec อยู่ต่ำกว่าเกณฑ์)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · [[blum-hinge-systems-moc]] · `Blum-2024:p.89`

