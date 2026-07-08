---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 70
sku:
  - "329.19.700"
  - "329.19.740"
source_refs:
  - "blaetterkatalog (1).pdf:p.209 (MB 5.31)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 11
  tab_TB_mm: {min: 3, max: 6}
  mounting_plate_spacing_MD_mm: [0]
  front_overlay_FA: null
  min_gap_F: null
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 70deg, bifold, corner-cabinet]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 Bi-fold Corner Hinge (70°)

> draft/review_ready — บานพับบานคู่ถังมุม 70 องศา (Bi-fold door) สำหรับตู้มุมของ Häfele Metalla 510

## สรุป
บานพับสำหรับเชื่อมต่อระหว่างหน้าบานสองบานในชุดหน้าบานพับคู่ (Bi-fold corner cabinet doors) ในตระกูล Metalla 510 โดยมีมุมเปิดปกติ 70 องศา ช่วยให้การพับเก็บและกางบานหน้าตู้เข้ามุมแอลเป็นไปได้โดยสะดวก เจาะถ้วยบานพับขนาด Ø35 มม. ความลึกเจาะถ้วย 11 มม.

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 11 มม.
* **Drilling Distance to Cup E (ระยะเจาะห่างจากขอบบาน E):** 3 ถึง 6 มม.
* **Drilling Pattern (ระยะรูเจาะสกรูยึดถ้วย):** 48/6 มม. หรือ 52/5.5 มม.
* **Adjustment Facility (ระยะปรับตั้ง):** ด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| วิธีการยึดถ้วย | สปริงปิดอัตโนมัติ | Drilling Pattern | รหัสสินค้า |
|---|---|---|---|
| **Screw fixing** | มี | 48/6 มม. | 329.19.700 |
| **Screw fixing** | มี | 52/5.5 มม. | 329.19.740 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ได้รับการแมปในระบบของ MONOLITH ภายใต้ไอดี `CORNER_70` (`hardware-drilling-specifications.md` ส่วนที่ 12.9)
- ทำงานสอดคล้องกับชุดสเปกการเจาะถ้วย Ø35 มม. ความลึก 11 มม. และเพลทรองมาตรฐาน D=0 มม.

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
