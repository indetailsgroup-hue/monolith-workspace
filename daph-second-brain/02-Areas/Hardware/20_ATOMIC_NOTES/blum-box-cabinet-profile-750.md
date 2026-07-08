---
note_type: product
vendor: blum
system: runner
truth_layer: draft
review_status: review_ready
sku:
  - "750.2701S"
  - "750.3001S"
  - "750.3501S"
  - "750.4001S"
  - "750.4501S"
  - "750.5001S"
  - "750.5501S"
  - "750.6001S"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.201, 204, 206 (MB 197, 200, 202)"
specs:
  system_family: LEGRABOX
  height_class: null
  side_height_mm: null
  nominal_length_NL_mm:
    - 270
    - 300
    - 350
    - 400
    - 450
    - 500
    - 550
    - 600
  load_rating_kg: 40
  extension_type: full
  cabinet_width_min_mm: null
  side_clearance_mm: 13
  soft_close: true
  push_to_open: null
  drill_pattern: "System 32"
needs_verify:
  - side_clearance_mm
conflicts: []
related_monolith:
  - "specs/reference/master-hardware-database.md"
tags:
  - blum
  - legrabox
  - runner
last_verified_at: null
is_stale: false
---

# Blum LEGRABOX Cabinet Profile 750 (40 kg)

> draft/review_ready — รางลิ้นชักสำหรับระบบ LEGRABOX รุ่น 750 รับน้ำหนัก 40 kg พร้อม BLUMOTION S

## สรุป
รางลิ้นชักตัวล่าง (Cabinet Profile) ของ Blum รุ่น 750 ออกแบบเฉพาะสำหรับระบบลิ้นชัก LEGRABOX (pure/free) รองรับน้ำหนักบรรทุก 40 kg มาพร้อมกับกลไกปิดนุ่มนวล BLUMOTION S ในตัว ซึ่งสามารถเลือกปิด/เปิดเพื่อใช้งานร่วมกับระบบเปิดอัตโนมัติด้วยไฟฟ้า SERVO-DRIVE หรือระบบกดกระเด้งกลไก TIP-ON BLUMOTION ได้

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสามารถในการรับน้ำหนัก (Dynamic Carrying Capacity):** 40 kg
- **ระยะรูเจาะแถวแรกจากขอบหน้า:** 37 mm (มาตรฐาน System 32)
- **ลักษณะการดึง:** ดึงออกได้สุด (Full Extension)
- **ระยะเผื่อติดตั้ง (Side Clearance):** 13 mm ต่อข้าง

### Cabinet Profiles Left/Right รหัสสินค้า (750.XXXS Series)
| NL (mm) | Part No. (BLUMOTION S) |
|---|---|
| 270 | 750.2701S |
| 300 | 750.3001S |
| 350 | 750.3501S |
| 400 | 750.4001S |
| 450 | 750.4501S |
| 500 | 750.5001S |
| 550 | 750.5501S |
| 600 | 750.6001S |

## เชื่อมกับ MONOLITH
- คอนฟิกใน `master-hardware-database.md` ของ MONOLITH (`BLUM_LEGRABOX_RUNNERS` แหล่งอ้างอิงรหัส `LGB_40_NL`) ตรงตามข้อมูล part numbers ในแคตตาล็อก Blum 2024-2025 หน้า 204 และ 206 ทุกตัว

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
