---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "753.4501S"
  - "753.5001S"
  - "753.5501S"
  - "753.6001S"
  - "753.6501S"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.206 (MB 202)"
specs:
  system_family: LEGRABOX
  height_class: null
  side_height_mm: null
  nominal_length_NL_mm:
    - 450
    - 500
    - 550
    - 600
    - 650
  load_rating_kg: 70
  extension_type: full
  cabinet_width_min_mm: null
  side_clearance_mm: 13
  soft_close: true
  push_to_open: null
  drill_pattern: "System 32"
needs_verify:
  - side_clearance_mm
conflicts:
  - field: LGB_70_270
    note_value: null
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.206 (MB 202) 70kg profiles are not offered for NL 270, 300, 350, 400"
    monolith_value: "753.2701S"
    monolith_ref: "master-hardware-database.md:L138-141"
    status: resolved
related_monolith:
  - "specs/reference/master-hardware-database.md"
tags:
  - blum
  - legrabox
  - runner
last_verified_at: null
is_stale: false
---

# Blum LEGRABOX Cabinet Profile 753 (70 kg)

> draft/review_ready — รางลิ้นชักสำหรับระบบ LEGRABOX รุ่น 753 รับน้ำหนัก 70 kg พร้อม BLUMOTION S

## สรุป
รางลิ้นชักตัวล่าง (Cabinet Profile) ของ Blum รุ่น 753 ออกแบบเฉพาะสำหรับลิ้นชักขนาดใหญ่หรือต้องการบรรทุกของหนักมากเป็นพิเศษ (Heavy Duty) รับน้ำหนักสูงสุด 70 kg มาพร้อมกับกลไกปิดนุ่มนวล BLUMOTION S ในตัว

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสามารถในการรับน้ำหนัก (Dynamic Carrying Capacity):** 70 kg
- **ระยะรูเจาะแถวแรกจากขอบหน้า:** 37 mm (มาตรฐาน System 32)
- **ลักษณะการดึง:** ดึงออกได้สุด (Full Extension)
- **ระยะเผื่อติดตั้ง (Side Clearance):** 13 mm ต่อข้าง

### Cabinet Profiles Left/Right รหัสสินค้า (753.XXXS Series)
| NL (mm) | Part No. (BLUMOTION S) |
|---|---|
| 450 | 753.4501S |
| 500 | 753.5001S |
| 550 | 753.5501S |
| 600 | 753.6001S |
| 650 | 753.6501S |

## เชื่อมกับ MONOLITH
- **ข้อขัดแย้งในพารามิเตอร์รหัส/ความยาว:** ใน `master-hardware-database.md` มีการเก็บรหัสราง 70kg สำหรับความลึกสั้น (`LGB_70_270` รหัส `753.2701S` ไปจนถึงลึก `400`) แต่ในแคตตาล็อก Blum ระบุว่าราง 70kg (รหัส 753) จะเริ่มผลิตตั้งแต่ความลึก **450 mm** ขึ้นไปเท่านั้น ไม่มีความลึกที่สั้นกว่านั้น

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
