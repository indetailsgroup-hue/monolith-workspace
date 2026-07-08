---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 105
sku:
  - "329.28.600"
  - "329.28.601"
  - "329.28.602"
source_refs:
  - "blaetterkatalog (1).pdf:p.196 (MB 5.18)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 8
  tab_TB_mm: {min: 3, max: 6}
  mounting_plate_spacing_MD_mm: [0, 3, 6]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 16}
    - {application: "overlay", MD: 3, TB: 3, FA: 13}
    - {application: "half_overlay", MD: 0, TB: 3, FA: 7}
  min_gap_F:
    - {FD: 10, TB: 3, F: 0.2}
    - {FD: 12, TB: 3, F: 0.4}
    - {FD: 15, TB: 3, F: 1.0}
    - {FD: 18, TB: 3, F: 1.9}
    - {FD: 20, TB: 3, F: 2.7}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 105deg, thin-door]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 Thin Door Hinge (105°)

> draft/review_ready — บานพับถ้วยเจาะตื้น 8 มม. สำหรับหน้าบานบางเฉียบ (10-16 มม.) ของ Häfele Metalla 510

## สรุป
บานพับสำหรับบานตู้ไม้บางเฉียบ (Thin Doors) ที่มีความหนาตั้งแต่ 10 มม. ขึ้นไป โดยบานพับรุ่นนี้ต้องการความลึกเจาะถ้วย (Drilling Depth) เพียง **8 มม.** ช่วยลดความเสี่ยงที่การเจาะจะทะลุหรือทำให้ผิวหน้าบานเสียหาย มีมุมเปิด 105 องศา พร้อมระบบสปริงปิดอัตโนมัติ

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 8 มม. (ตื้นพิเศษ ป้องกันไม้ทะลุ)
* **Crank Constant (ค่าคงที่บานพับ K):**
  - Full Overlay (ทับขอบ): K = 13 (SKU `329.28.600`)
  - Full/Half Overlay (ทับขอบ/ทับครึ่ง): K = 4 (SKU `329.28.601`)
  - Half Overlay (ทับครึ่งขอบ): K = 0 (SKU `329.28.602`)
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 6 มม.
* **Drilling Pattern (ระยะรูเจาะถ้วย):** มาตรฐาน 48/6 มม. แบบใช้สกรูยึด (screw fixing)
* **Adjustment Facility (ระยะปรับตั้ง):** ด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทหน้าบาน | วิธีการยึดถ้วย | สปริงปิดอัตโนมัติ | Soft Close ในตัว | รหัสสินค้า |
|---|---|---|---|---|
| **Full Overlay** | Screw-on | มี | ไม่มี | 329.28.600 |
| **Full/Half Overlay** | Screw-on | มี | ไม่มี | 329.28.601 |
| **Half Overlay** | Screw-on | มี | ไม่มี | 329.28.602 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ได้รับการแมปลงฐานข้อมูลของ MONOLITH ภายใต้ไอดี `h_thin_full` (`hardware-drilling-specifications.md` ส่วนที่ 13.2)
- จุดสำคัญทางวิศวกรรม: ความลึกในการเจาะถ้วยบานพับถูกกำหนดไว้อย่างปลอดภัยที่ **8 มม.** (`specs.cupDepth: 8.0`) ซึ่งช่วยปกป้องวัสดุไม้ที่มีความหนาต่ำกว่า 15 มม. เพื่อป้องกันหน้าบานแตกทะลุระหว่างการผลิตบน CNC

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
