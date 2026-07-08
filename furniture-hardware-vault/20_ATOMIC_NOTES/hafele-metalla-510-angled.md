---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 94
sku:
  - "329.96.600"
  - "329.96.601"
  - "329.96.602"
source_refs:
  - "blaetterkatalog (1).pdf:p.211 (MB 5.33)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 11
  tab_TB_mm: {min: 3, max: 6}
  mounting_plate_spacing_MD_mm: [0]
  front_overlay_FA: null
  min_gap_F: null
  load_rating_kg: 4
  adjustment_mm: {side: "up to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 94deg, angled, corner-cabinet]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 94° Angled Hinges (15°/24°/30°)

> draft/review_ready — บานพับซ่อนสำหรับหน้าตู้เฉียงหักมุม (15/24/30 องศา) ของ Häfele Metalla 510

## สรุป
บานพับสำหรับหน้าบานเฉียงหรือบานตู้เข้ามุมในองศาต่างๆ (Angled Corner Applications) ตั้งแต่ 15 องศา ถึง 45 องศา ในตระกูล Metalla 510 โดยบานพับมีการคำนวณหน้าเฉียงของมุมตู้จากโรงงานช่วยลดขั้นตอนการติดตั้งลิ่มรองเฉียง มีระยะเจาะถ้วย Ø35 มม. ความลึกเจาะถ้วย 11 มม.

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 11 มม.
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 6 มม.
* **Drilling Pattern (ระยะเจาะถ้วย):** มาตรฐาน 48/6 มม. แบบใช้สกรูยึด (screw fixing)
* **Adjustment Facility (ระยะปรับตั้ง):** ปรับด้านข้างได้ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทมุมเฉลียงตู้ | วิธีการยึดถ้วย | สปริงปิดอัตโนมัติ | รหัสสินค้า |
|---|---|---|---|
| **15° Corner Hinge** | Screw fixing | มี | 329.96.600 |
| **24° Corner Hinge** | Screw fixing | มี | 329.96.601 |
| **30° Corner Hinge (Half overlay)** | Screw fixing | มี | 329.96.602 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นเหล่านี้ได้รับการจัดเก็บในระบบคำนวณมุมของ MONOLITH ภายใต้รหัสสินค้า (`hardware-drilling-specifications.md` ส่วนที่ 12.9)
  - `ANGLE_15` -> SKU `329.96.600`
  - `ANGLE_24` -> SKU `329.96.601`
  - `ANGLE_30` -> SKU `329.96.602`
- ทำงานสอดคล้องกับค่าเจาะ CNC ลึก 11 มม. และเพลทรอง D=0 มม. (ซึ่งเป็นค่าตั้งต้นของการคำนวณทับขอบหน้าเฉียง)

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
