---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 165
sku:
  - "329.07.700"
  - "329.07.702"
  - "329.07.703"
  - "329.07.710"
  - "329.07.712"
  - "329.07.713"
  - "329.07.730"
  - "329.07.732"
  - "329.07.733"
  - "329.07.740"
  - "329.07.742"
  - "329.07.743"
  - "329.07.750"
  - "329.07.752"
  - "329.07.753"
  - "329.07.770"
  - "329.07.772"
  - "329.07.773"
source_refs:
  - "blaetterkatalog (1).pdf:p.198 (MB 5.20)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 11
  tab_TB_mm: {min: 3, max: 8}
  mounting_plate_spacing_MD_mm: [0, 3, 6]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 16}
    - {application: "overlay", MD: 3, TB: 3, FA: 13}
    - {application: "half_overlay", MD: 0, TB: 3, FA: 7}
    - {application: "inset", MD: 0, TB: 3, FA: -2}
  min_gap_F:
    - {FD: 16, TB: 3, F: 0.0}
    - {FD: 20, TB: 3, F: 0.0}
    - {FD: 22, TB: 3, F: 0.7}
    - {FD: 24, TB: 3, F: 2.7}
    - {FD: 26, TB: 3, F: 4.6}
    - {FD: 28, TB: 3, F: 7.9}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 165deg, wide-angle]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 165° Wide Angle Hinge

> draft/review_ready — บานพับมุมเปิดกว้างพิเศษ 165 องศาแบบ Zero Protrusion ของ Häfele Metalla 510

## สรุป
บานพับเปิดกว้าง 165 องศาของ Häfele Metalla 510 ใช้สำหรับการเปิดหน้าบานตู้ที่ต้องการพื้นที่เข้าถึงตู้ได้อย่างเต็มที่ หรือตู้ที่มีกล่องลิ้นชัก/ตะกร้าสไลด์ด้านใน มีโครงสร้างแบบ **No offset** (Zero Protrusion) เมื่อเปิดหน้าบานจนสุดขอบหน้าบานจะไม่ยื่นเกะกะบังช่องเปิดภายในตู้ เจาะถ้วยบานพับขนาด Ø35 มม. ความลึกเจาะถ้วย 11 มม.

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 11 มม.
* **Crank Constant (ค่าคงที่บานพับ K):**
  - Full Overlay (ทับขอบ): K = 13
  - Half Overlay (กลางขอบ): K = 4
  - Inset (ฝังใน): K = -5
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 8 มม.
* **Drilling Pattern (ระยะรูเจาะถ้วย):** 48/6 มม. หรือ 52/5.5 มม.
* **Adjustment Facility (ระยะปรับตั้ง):** ด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทหน้าบาน | วิธีการยึดถ้วย | รหัสสินค้า (48/6) | รหัสสินค้า (52/5.5) |
|---|---|---|---|
| **Full Overlay** | Screw-on | 329.07.700 | 329.07.740 |
| **Full Overlay** | Press fitting | 329.07.710 | 329.07.750 |
| **Full Overlay** | Without tools | 329.07.730 | 329.07.770 |
| **Half Overlay** | Screw-on | 329.07.702 | 329.07.742 |
| **Half Overlay** | Press fitting | 329.07.712 | 329.07.752 |
| **Half Overlay** | Without tools | 329.07.732 | 329.07.772 |
| **Inset** | Screw-on | 329.07.703 | 329.07.743 |
| **Inset** | Press fitting | 329.07.713 | 329.07.753 |
| **Inset** | Without tools | 329.07.733 | 329.07.773 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ได้รับการแมปลงฐานข้อมูลของ MONOLITH ภายใต้ไอดี `h165_full` (`hardware-drilling-specifications.md` ส่วนที่ 13.2) พร้อมสเปกความลึกเจาะถ้วย **11 มม.**
- ใช้ระบบคำนวณระยะทับขอบแบบเดียวกันกับรุ่นมาตรฐาน 110 องศา (K=13, K=4, K=-5) ทำให้เพลทรองตัวเดียวกันสามารถสลับไปมาระหว่างบานพับ 110 และ 165 องศาได้โดยไม่ต้องเจาะตู้ใหม่

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
