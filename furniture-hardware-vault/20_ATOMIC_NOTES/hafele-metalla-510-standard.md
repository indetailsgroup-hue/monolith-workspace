---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 110
sku:
  - "329.17.600"
  - "329.17.602"
  - "329.17.603"
  - "329.17.610"
  - "329.17.612"
  - "329.17.613"
  - "329.17.620"
  - "329.17.622"
  - "329.17.623"
  - "329.17.630"
  - "329.17.632"
  - "329.17.633"
  - "329.17.100"
  - "329.17.102"
  - "329.17.103"
  - "329.17.700"
  - "329.17.730"
  - "329.17.740"
  - "329.17.770"
source_refs:
  - "blaetterkatalog (1).pdf:p.195 (MB 5.17)"
  - "blaetterkatalog (1).pdf:p.452 (MB 5.248)"
  - "blaetterkatalog (1).pdf:p.457 (MB 5.253)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 11
  tab_TB_mm: {min: 3, max: 6}
  mounting_plate_spacing_MD_mm: [0, 3, 6]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 16}
    - {application: "overlay", MD: 3, TB: 3, FA: 13}
    - {application: "overlay", MD: 6, TB: 3, FA: 10}
    - {application: "half_overlay", MD: 0, TB: 3, FA: 7}
    - {application: "half_overlay", MD: 3, TB: 3, FA: 4}
    - {application: "half_overlay", MD: 6, TB: 3, FA: 1}
    - {application: "inset", MD: 0, TB: 3, FA: -2}
    - {application: "inset", MD: 3, TB: 3, FA: -5}
    - {application: "inset", MD: 6, TB: 3, FA: -8}
  min_gap_F:
    - {FD: 16, TB: 3, F: 0.5}
    - {FD: 18, TB: 3, F: 0.9}
    - {FD: 20, TB: 3, F: 1.5}
    - {FD: 22, TB: 3, F: 2.4}
    - {FD: 24, TB: 3, F: 5.1}
    - {FD: 26, TB: 3, F: 7.8}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 110deg, standard]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 110° Standard Hinge

> draft/review_ready — บานพับซ่อนรุ่นมาตรฐาน 110 องศา ของ Häfele Metalla 510

## สรุป
บานพับถ้วยซ่อนระบบ Metalla 510 ขนาดถ้วย 35 มม. ความลึกเจาะถ้วย 11 มม. ใช้สำหรับการเปิดหน้าบานตู้ไม้ทั่วไป โดยมีมุมเปิด 110 องศา รองรับการติดตั้งแบบทับขอบ (Full Overlay), ทับครึ่งขอบ (Half Overlay/Twin Mounting) และฝังในวงกบ (Inset) ติดตั้งเข้ากับแผงข้างตู้ด้วยระบบสไลด์ (slide-on) กับเพลท Metalla 510 A หรือระบบคลิกติดตั้งเร็ว (quick fixing) กับเพลท Metalla 510 SM

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม. (อ้างอิง p.209)
* **Cup Depth (ความลึกถ้วย):** 11 มม.
* **Crank Constant (ค่าคงที่บานพับ K):**
  - Full Overlay (ทับขอบ): K = 13
  - Half Overlay (กลางขอบ): K = 4
  - Inset (ฝังใน): K = -5
* **Drilling Pattern (ระยะเจาะรูสกรูยึดถ้วย):** มาตรฐาน 48/6 มม. (หรือ 52/5.5 มม. สำหรับบางรหัส)
* **Adjustment Facility (ระยะปรับตั้ง):**
  - ด้านข้าง (Side): -1.5 ถึง +4.5 มม.
  - ความสูง (Height): -2 ถึง +2 มม.
  - ความลึก (Depth): +2.8 มม. (เพลทแบบ A) หรือ -0.5 ถึง +2.8 มม. (เพลทแบบ SM)

### รหัสสินค้า (SKUs)
| ประเภทหน้าบาน | วิธีการยึดถ้วย | สปริงปิดอัตโนมัติ | Soft Close ในตัว | รหัสสินค้า (48/6) | รหัสสินค้า (52/5.5) |
|---|---|---|---|---|---|
| **Full Overlay** | Screw-on | มี | ไม่มี | 329.17.600 | 329.17.640 |
| **Full Overlay** | Screw-on | มี | **มี (Integrated)** | 329.17.700 | 329.17.740 |
| **Full Overlay** | Toolless | มี | ไม่มี | 329.17.630 | 329.17.670 |
| **Full Overlay** | Toolless | มี | **มี (Integrated)** | 329.17.730 | 329.17.770 |
| **Half Overlay** | Screw-on | มี | ไม่มี | 329.17.602 | 329.17.642 |
| **Half Overlay** | Toolless | มี | ไม่มี | 329.17.632 | 329.17.672 |
| **Inset** | Screw-on | มี | ไม่มี | 329.17.603 | 329.17.643 |
| **Inset** | Toolless | มี | ไม่มี | 329.17.633 | 329.17.673 |

## เชื่อมกับ MONOLITH
- ค่าการเจาะถ้วยบานพับ Ø35 มม. ความลึกเจาะถ้วย 11.0 มม. และระยะเจาะสกรูยึดถ้วยรูปแบบ 48/6 มม. ถูกแมปลงใน MONOLITH Kinematics Engine ของบานพับตระกูล Häfele Metalla 510 ในโมดูลบานพับและตำแหน่งรูเจาะ (`hardware-drilling-specifications.md` ส่วนที่ 13) โดยใช้สูตรคำนวณการทับขอบ:
  `Overlay (FA) = E + K - D` (E = ระยะเจาะห่างจากขอบบาน 3-6 มม., D = ระยะเพลท 0/2/3 มม.)

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
