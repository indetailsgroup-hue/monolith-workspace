---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 110
sku:
  - "329.26.611"
  - "329.26.603"
  - "329.26.624"
  - "329.26.613"
  - "329.26.607"
  - "329.26.601"
  - "329.26.602"
  - "329.26.605"
  - "329.26.612"
  - "329.26.614"
source_refs:
  - "blaetterkatalog (1).pdf:p.204-205 (MB 5.26-5.27)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 9
  tab_TB_mm: {min: 3, max: 18}
  mounting_plate_spacing_MD_mm: [0, 3, 6, 9]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 7}
    - {application: "overlay", MD: 0, TB: 18, FA: 22}
  min_gap_F:
    - {FD: 16, TB: 3, F: 0.0}
    - {FD: 18, TB: 3, F: 0.0}
    - {FD: 20, TB: 3, F: 0.0}
    - {FD: 22, TB: 3, F: 0.0}
    - {FD: 24, TB: 3, F: 0.3}
    - {FD: 26, TB: 3, F: 1.4}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 110deg, rebated, profile-door]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 110° Rebated Hinge (Profile Doors)

> draft/review_ready — บานพับถ้วยเจาะตื้น 9 มม. สำหรับบานเปิดมีบังใบ บานขอบมน หรือบานเฟรมโปรไฟล์ ของ Häfele Metalla 510

## สรุป
บานพับเอนกประสงค์ (All-rounder Hinge) สำหรับหน้าบานตกแต่งที่มีขอบบังใบ (Rebated Doors) ขอบมน หรือมีหน้าโปรไฟล์ตกแต่งต่างระดับ บานพับมีความลึกเจาะถ้วยเพียง **9 มม.** เพื่อความปลอดภัยและหลีกเลี่ยงการเจาะบานทะลุในส่วนความหนาต่างระดับ และมีแผ่นป้องกันนิ้วมือถูกหนีบ (Hinge guard finger-trap protection)

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 9 มม. (ตื้นพิเศษเพื่อบานมีบังใบ)
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 18 มม.
* **Drilling Pattern (ระยะรูเจาะถ้วย):** 48/6 มม. หรือ 45/9.5 มม.
* **Finish/Colour (สีและสารเคลือบ):** Nickel plated (ชุบนิกเกิล) หรือ Titanium coloured (สีไทเทเนียม)
* **Adjustment Facility (ระยะปรับตั้ง):** ปรับด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| วิธีการยึดถ้วย | สเปกปิด/เปิด | Finishing | Pattern 48/6 | Pattern 45/9.5 |
|---|---|---|---|---|
| **Screw fixing** | สปริงปิดธรรมดา | Nickel plated | 329.26.611 | 329.26.624 |
| **Screw fixing** | สปริงปิดธรรมดา | Titanium coloured | 329.26.603 | – |
| **Screw fixing** | Soft Close ในตัว | Nickel plated | 329.26.613 | – |
| **Screw fixing** | Soft Close ในตัว | Titanium coloured | 329.26.607 | – |
| **Screw fixing** | เปิดอัตโนมัติ (Push) | Nickel plated | 329.26.601 | – |
| **Screw fixing** | ไม่มีสปริงดึง | Nickel plated | 329.26.602 | – |
| **Press fitting** | สปริงปิดธรรมดา | Nickel plated | 329.26.612 | – |
| **Press fitting** | Soft Close ในตัว | Nickel plated | 329.26.614 | – |
| **Press fitting** | เปิดอัตโนมัติ (Push) | Nickel plated | 329.26.605 | – |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ได้รับการแมปในระบบของ MONOLITH ภายใต้ไอดี `REBATED_110` (`hardware-drilling-specifications.md` ส่วนที่ 12.9)
- **จุดระวังการเจาะ CAM (Drill Program):**
  - ความลึกในการเจาะถ้วยสำหรับหน้าบานบังใบนี้ถูกระบุไว้อย่างเจาะจงที่ **9.0 มม.** (`specs.cupDepth: 9.0`) เพื่อป้องกันการเจาะลึกทะลุขอบล่างของบังใบหน้าบาน

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
