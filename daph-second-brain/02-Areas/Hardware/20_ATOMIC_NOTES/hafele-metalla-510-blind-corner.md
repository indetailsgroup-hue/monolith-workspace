---
note_type: product
vendor: hafele
system: hinge
truth_layer: draft
review_status: review_ready
angle_deg: 110
sku:
  - "329.11.705"
  - "329.34.601"
  - "329.35.600"
  - "329.88.609"
source_refs:
  - "blaetterkatalog (1).pdf:p.191 (MB 5.13)"
  - "blaetterkatalog (1).pdf:p.207 (MB 5.29)"
specs:
  cup_diameter_mm: 35
  cup_depth_mm: 13.5
  tab_TB_mm: {min: 3, max: 6}
  mounting_plate_spacing_MD_mm: [0, 3, 6, 9]
  front_overlay_FA: null
  min_gap_F:
    - {FD: 16, TB: 3, F: 0.7}
    - {FD: 18, TB: 3, F: 1.1}
    - {FD: 20, TB: 3, F: 1.6}
    - {FD: 22, TB: 3, F: 2.2}
    - {FD: 24, TB: 3, F: 3.2}
    - {FD: 26, TB: 3, F: 5.7}
  load_rating_kg: 4
  adjustment_mm: {side: "up to +4.5", height: "-2 to +2", depth: "+2.8 (A) / -0.5 to +2.8 (SM)"}
needs_verify: []
conflicts:
  - field: cup_depth_mm
    note_value: 13.5
    note_value_evidence: "PDF text layer p.191 ระบุ 'Drilling depth: Hinge cup 13.5 mm' (ยืนยันโดยผู้ใช้ 2026-06)"
    monolith_value: 13.5
    monolith_ref: "hardware-drilling-specifications.md §13 h_blind — แก้จาก 11.5→13.5 + citation แล้ว"
    status: resolved   # catalog=code=13.5 ตรงกันแล้ว
related_monolith:
  - "determined-williams/specs/manufacturing/hardware-drilling-specifications.md"
tags: [hafele, hinge, metalla-510, 110deg, blind-corner, specialty]
last_verified_at: null
is_stale: false
---

# Häfele Metalla 510 Blind Corner Hinges

> draft/review_ready — บานพับซ่อนสำหรับมุมตู้แบบบานชน (Blind Corner) ของ Häfele Metalla 510

## สรุป
บานพับสำหรับหน้าบานตู้เข้ามุมแบบบานชน (Blind Corner Applications) ในตระกูล Metalla 510 โดยแบ่งออกเป็น 3 รุ่นย่อยตามลักษณะช่องเข้ามุม ได้แก่:
1. **Standard Blind Corner 110°** (มีระบบโช้คปิดนุ่มนวลสองชุดในถ้วย เจาะลึก 13.5 มม.)
2. **Small Blind Corner 94°** (สำหรับช่องมุมแคบ เปิดมุม 94 องศา เจาะลึก 11 มม.) ต้องใช้ร่วมกับเพลทรองบานพับเฉพาะรุ่นหนา 9 มม. (`329.88.609`)
3. **Large Blind Corner 110°** (สำหรับช่องมุมกว้าง เปิดมุม 110 องศา เจาะลึก 11 มม.)

## ตารางรหัส/สเปก
* **Cup Diameter (เส้นผ่านศูนย์กลางถ้วย):** 35 มม.
* **Cup Depth (ความลึกถ้วยเจาะ):**
  - Standard Blind Corner (`329.11.705`): **13.5 มม.**
  - Small / Large Blind Corner (`329.34.601` / `329.35.600`): **11.0 มม.**
* **Drilling Distance to Cup E (ระยะห่างถ้วยจากขอบบาน E):** 3 ถึง 6 มม.
* **Drilling Pattern (ระยะเจาะถ้วย):** มาตรฐาน 48/6 มม. แบบใช้สกรูยึด (screw fixing)
* **Adjustment Facility (ระยะปรับตั้ง):** ปรับด้านข้างสูงสุด +4.5 มม., สูง -2 ถึง +2 มม., ลึก +2.8 มม. (เพลท A) หรือ -0.5 ถึง +2.8 มม. (เพลท SM)

### รหัสสินค้า (SKUs)
| ประเภทบานชน | มุมเปิด | เจาะถ้วยลึก | Soft Close ในตัว | รหัสบานพับ | รหัสเพลทเฉพาะ |
|---|---|---|---|---|---|
| **Standard Blind Corner** | 110° | 13.5 มม. | มี | 329.11.705 | ใช้ร่วมกับเพลททั่วไปได้ (D0/D3/D6) |
| **Small Blind Corner** | 94° | 11.0 มม. | ไม่มี | 329.34.601 | **329.88.609** (Plate D=9 มม.) เท่านั้น |
| **Large Blind Corner** | 110° | 11.0 มม. | ไม่มี | 329.35.600 | ใช้ร่วมกับเพลททั่วไปได้ |

## เชื่อมกับ MONOLITH
- บานพับมุมชนเหล่านี้ได้รับการจัดเก็บในระบบของ MONOLITH (`hardware-drilling-specifications.md` ส่วนที่ 12.9)
  - ⚠️ **CONFLICT (ยังไม่ resolve):** `h_blind` -> Standard Blind Corner (SKU `329.11.705`) — โค้ด MONOLITH ระบุ `cupDepth: 11.5` mm แต่โน้ตนี้สกัดจากแคตตาล็อกได้ **13.5 mm** ทั้งสองค่ายังไม่ผ่านการ verify โดยมนุษย์ → **ห้ามแก้โค้ดผลิตจริงจนกว่าจะเปิด PDF หน้า p.191 (MB 5.13) ยืนยันค่าจริง** (ดู field `conflicts` ใน frontmatter)
  - `Blind Small` -> Small Blind Corner 94° (SKU `329.34.601`, ต้องตั้งค่าความสูงเพลทในระบบไว้ที่ **D=9mm** เป็นกฎไฟต์บังคับ `plateDistanceD: 9`)
  - `Blind Large` -> Large Blind Corner 110° (SKU `329.35.600`, ใช้กับเพลท D=3mm)

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- MOC: [[salice-hafele-systems-moc]]
- Validation: [[CK-salice-hafele-specs]]
