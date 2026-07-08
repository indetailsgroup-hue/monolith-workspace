---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 94
sku:
  - "329.05.605"
  - "329.05.614"
  - "329.05.632"
source_refs:
  - "blaetterkatalog (1).pdf:p.203 (MB 5.25)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 13
  tab_TB_mm: {min: 3, max: 15}
  mounting_plate_spacing_MD_mm: [0, 3, 6, 9]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 16}
    - {application: "overlay", MD: 0, TB: 9, FA: 22}
    - {application: "half_overlay", MD: 0, TB: 3, FA: 7}
    - {application: "inset", MD: 0, TB: 3, FA: -2}
  min_gap_F:
    - {FD: 19, TB: 3, F: 0.1}
    - {FD: 24, TB: 3, F: 0.7}
    - {FD: 28, TB: 3, F: 2.6}
    - {FD: 32, TB: 3, F: 6.4}
    - {FD: 35, TB: 3, F: 9.3}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 94deg, profile, thick-door]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 94° Profile Hinge (Thick Doors)

> draft/review_ready — บานพับถ้วยเจาะลึก 13 มม. สำหรับหน้าบานไม้หนาพิเศษและบานมีโปรไฟล์ (สูงสุด 35 มม.) ของ Häfele Metalla 510

## สรุป
บานพับสำหรับบานไม้หนาพิเศษ (Thick Doors) และบานพับหน้าบานตกแต่งมีลวดลายโปรไฟล์ (Profile Doors) ที่มีความหนาได้ถึง 35 มม. ระบบบานพับ Metalla 510 องศาเปิด 94 องศา ต้องการความลึกในการเจาะถ้วยบานพับที่ **13 มม.** และมีระยะเจาะรูสกรูยึดถ้วยรูปแบบพิเศษ **52/7.5 มม.**

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 13 มม. (ลึกเพื่อรองรับโครงสร้างข้อต่อบานหนา)
* **Crank Constant (ค่าคงที่บานพับ K):**
  - Full Overlay (ทับขอบ): K = 13 (SKU `329.05.605`)
  - Half Overlay (กลางขอบ): K = 4 (SKU `329.05.614`)
  - Inset (ฝังใน): K = -5 (SKU `329.05.632`)
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 15 มม.
* **Drilling Pattern (ระยะรูเจาะสกรูยึดถ้วย):** รูปแบบเฉพาะ **52/7.5 มม.** (กว้างกว่ามาตรฐาน 48/6 มม.) แบบขันสกรู (screw fixing)
* **Adjustment Facility (ระยะปรับตั้ง):** ปรับด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทหน้าบาน | วิธีการยึดถ้วย | สปริงปิดอัตโนมัติ | Soft Close ในตัว | รหัสสินค้า |
|---|---|---|---|---|
| **Full Overlay** | Screw-on | มี | ไม่มี | 329.05.605 |
| **Half Overlay** | Screw-on | มี | ไม่มี | 329.05.614 |
| **Inset** | Screw-on | มี | ไม่มี | 329.05.632 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ได้รับการแมปใน MONOLITH Specialty Hinge Engine ภายใต้ไอดี `PROFILE_94` (`hardware-drilling-specifications.md` ส่วนที่ 12.9)
- **จุดระวังการเจาะ CAM (Drill Program):**
  - รูล้อคเกลียวยึดถ้วยต้องเปลี่ยนพิกัด X, Y ใน CNC เจาะ จากมาตรฐาน Y = ±24 มม. (48/6) ไปเป็น **Y = ±26 มม. (52/7.5)** และค่าถอยร่น **X = 7.5 มม.** จากศูนย์กลางเจาะถ้วย (`generateSpecialtyHingeOps` บรรทัด 3806-3810)
  - ความลึกในการเจาะถ้วยต้องเซ็ตค่า CNC ไว้ที่ **13 มม.** เสมอ ป้องกันการใส่บานพับไม่สนิทและปีกถ้วยลอย

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
