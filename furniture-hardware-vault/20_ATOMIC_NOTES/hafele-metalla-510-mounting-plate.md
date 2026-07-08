---
note_type: product
vendor: hafele
system: mounting_plate
truth_layer: draft
review_status: review_ready
sku:
  - "329.67.060"
  - "329.67.063"
  - "329.71.500"
  - "329.71.503"
  - "329.32.509"
  - "329.32.539"
source_refs:
  - "blaetterkatalog (1).pdf:p.189 (MB 5.11)"
  - "blaetterkatalog (1).pdf:p.457 (MB 5.253)"
specs:
  cup_diameter_mm: null
  cup_depth_mm: null
  tab_TB_mm: null
  mounting_plate_spacing_MD_mm: [0, 3]
  front_overlay_FA: null
  min_gap_F: null
  load_rating_kg: null
  adjustment_mm: {side: null, height: "±2.0", depth: "-0.5 to +2.8"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, mounting-plate, metalla-510, accessories, system32]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 Mounting Plates & Cover Caps

> draft/review_ready — เพลทรองบานพับและฝาครอบรุ่น Metalla 510 ของ Häfele

## สรุป
เพลทรองบานพับสำหรับระบบบานพับถ้วยซ่อน Metalla 510 ใช้ในการยึดบานพับเข้ากับโครงสร้างตู้เฟอร์นิเจอร์ตามระบบ System 32 ระยะเจาะห่างจากขอบหน้าตู้มาตรฐาน 37 มม. และรูเจาะในตู้ห่างกันในแนวตั้ง 32 มม. มีระบบติดตั้งแบบขันสกรู (screw fixing) รองรับระบบคลิกติดตั้งเร็ว (quick fixing) และสามารถปรับตั้งความสูงและความลึกผ่านเกลียวเยื้องศูนย์ (eccentric adjustment)

## ตารางรหัส/สเปก
* **Spacing (ระยะหนาของเพลท D):** 0 มม. และ 3 มม.
* **Material (วัสดุ):** Zinc alloy (ซิงค์อัลลอย) / Steel (เหล็ก)
* **Finish/Colour (สีและสารเคลือบ):** Galvanized (ชุบกัลวาไนซ์), Titanium coloured (สีไทเทเนียม) หรือ Nickel plated (ชุบนิกเกิล)
* **Adjustment Facility (การปรับแต่ง):** ปรับความสูง ±2.0 มม., ปรับความลึก -0.5 ถึง +2.8 มม.
* **Hole Pattern (ระยะรูเจาะตู้):** ระยะห่างรูเจาะแนวดิ่ง 32 มม. ระยะถอย 37 มม. (System 32) เจาะรูขนาด Ø5 มม. ความลึก 13 มม.

### รหัสสินค้า (SKUs)
| รุ่นเพลท / อุปกรณ์ | ระยะ D (มม.) | สี/พื้นผิว | การติดตั้ง | รหัสสินค้า |
|---|---|---|---|---|
| **Metalla 510 SM Mounting Plate** | 0 | Titanium coloured | Screw fixing (quick fixing) | 329.67.060 |
| **Metalla 510 SM Mounting Plate** | 3 | Titanium coloured | Screw fixing (quick fixing) | 329.67.063 |
| **Metalla 510 SM Cruciform Plate** | 0 | Nickel plated | Screw fixing (quick fixing) | 329.71.500 |
| **Metalla 510 SM Cruciform Plate** | 3 | Nickel plated | Screw fixing (quick fixing) | 329.71.503 |
| **Hinge arm cover plate** | - | Titanium coloured | สวมครอบแขนบานพับ | 329.32.509 |
| **Cup cover cap** | - | Titanium coloured | สวมครอบถ้วยบานพับ | 329.32.539 |

## เชื่อมกับ MONOLITH
- เพลทรองเหล่านี้ถูกแมปข้อมูลใน MONOLITH Mounting Plates Database (`hardware-drilling-specifications.md` ส่วนที่ 13.2) โดยใช้รหัสสินค้า `329.67.060` (D=0), `329.67.062` (D=2 - ในแคตตาล็อกเล่มนี้ไม่มีระบุ), และ `329.67.063` (D=3)
- ระยะเจาะยึดแผงข้างตู้กำหนดไว้ที่ X = 37 มม. จากขอบหน้าตู้ และเจาะรูห่างกัน 32 มม. (System 32) ด้วยดอกสว่าน Ø5 มม. ลึก 13 มม. (`generateStandardHingeOps` ใน `hardware-drilling-specifications.md` บรรทัด 4547-4562)

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
