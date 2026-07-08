---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 155
sku:
  - "329.29.217"
  - "329.29.317"
  - "329.29.334"
  - "329.29.221"
  - "329.29.321"
  - "329.29.336"
source_refs:
  - "blaetterkatalog (1).pdf:p.190 (MB 5.12)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 13.5
  tab_TB_mm: {min: 3, max: 9}
  mounting_plate_spacing_MD_mm: [0, 3, 6]
  front_overlay_FA:
    - {application: "overlay", MD: 0, TB: 3, FA: 16}
    - {application: "overlay", MD: 3, TB: 3, FA: 13}
    - {application: "overlay", MD: 0, TB: 9, FA: 22}
    - {application: "half_overlay", MD: 0, TB: 3, FA: 7}
    - {application: "half_overlay", MD: 3, TB: 3, FA: 4}
  min_gap_F:
    - {FD: 16, TB: 3, F: 0.0}
    - {FD: 20, TB: 3, F: 0.0}
    - {FD: 24, TB: 3, F: 0.0}
    - {FD: 26, TB: 3, F: 0.4}
    - {FD: 28, TB: 3, F: 1.2}
  load_rating_kg: 4
  adjustment_mm: {side: "-1.5 to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
needs_verify: []
conflicts:
  - field: cup_depth_mm
    note_value: 13.5
    note_value_evidence: "PDF text layer p.190 ระบุ 'Drilling depth: Hinge cup 13.5 mm' (ยืนยันโดยผู้ใช้ 2026-06)"
    monolith_value: 13.5
    monolith_ref: "hardware-drilling-specifications.md §13 h155_full — แก้จาก 11.5→13.5 + citation แล้ว"
    status: resolved   # catalog=code=13.5 ตรงกันแล้ว
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 155deg, zero-protrusion]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 155° Zero Protrusion Hinge

> draft/review_ready — บานพับมุมเปิดกว้าง 155 องศาแบบ Zero Protrusion ของ Häfele Metalla 510

## สรุป
บานพับสำหรับเปิดหน้าบานกว้าง 155 องศา ระบบ Metalla 510 ออกแบบมาเป็นพิเศษสำหรับการใช้งานกับตู้ที่มีกล่องลิ้นชักภายใน (Internal Drawers) หรือถาดสไลด์ โดยมีโครงสร้างแบบ **0-door offset** (Zero Protrusion) เมื่อเปิดหน้าบานพับสุด หน้าบานจะไม่ยื่นล้ำเข้าไปในช่องตู้ ทำให้ดึงลิ้นชักออกได้สะดวก เจาะถ้วยบานพับขนาด Ø35 มม. ความลึกเจาะถ้วย 13.5 มม. มีระบบโช้คปิดนุ่มนวลสองชิ้น (two silicone oil dampers) ในถ้วยบานพับ

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกเจาะถ้วย):** 13.5 มม. (ลึกพิเศษเพื่อรองรับโช้คและสปริงเปิดกว้าง)
* **Crank Constant (ค่าคงที่บานพับ K):**
  - Full Overlay (ทับขอบ): K = 13
  - Half Overlay (กลางขอบ): K = 4
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 9 มม.
* **Drilling Pattern (ระยะรูเจาะถ้วย):** 45/9.5 มม., 48/6 มม., หรือ 52/5.5 มม.
* **Adjustment Facility (ระยะปรับตั้ง):** ปรับด้านข้าง -1.5 ถึง +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทหน้าบาน | วิธีการยึดถ้วย | Drilling Pattern | Soft Close ในตัว | รหัสสินค้า |
|---|---|---|---|---|
| **Full Overlay** | Screw-on | 45/9.5 | มี | 329.29.217 |
| **Full Overlay** | Screw-on | 48/6 | มี | 329.29.317 |
| **Full Overlay** | Screw-on | 52/5.5 | มี | 329.29.334 |
| **Half Overlay** | Screw-on | 45/9.5 | มี | 329.29.221 |
| **Half Overlay** | Screw-on | 48/6 | มี | 329.29.321 |
| **Half Overlay** | Screw-on | 52/5.5 | มี | 329.29.336 |

## เชื่อมกับ MONOLITH
- บานพับรุ่นนี้ถูกจัดเก็บในฐานข้อมูลบานพับของ MONOLITH ภายใต้ไอดี `h155_full` (`hardware-drilling-specifications.md` ส่วนที่ 13.2) พร้อมค่าคงที่สำหรับการคำนวณการทับขอบ `crankConstant: 13`
- ✅ **RESOLVED:** ความลึกเจาะถ้วย — แคตตาล็อกยืนยัน 13.5mm (PDF text layer p.190) และได้แก้โค้ด MONOLITH `h155_full` จาก 11.5→13.5 พร้อม citation แล้ว ค่าตรงกันทั้งสองฝั่ง (ดู field `conflicts` ใน frontmatter)

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
