---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "378N4002SA"
  - "378N4502SA"
  - "378N5002SA"
  - "378N5502SA"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.298 (MB 294)"
specs:
  system_family: TANDEMBOX
  height_class: N
  side_height_mm: 68
  nominal_length_NL_mm:
    - 400
    - 450
    - 500
    - 550
  load_rating_kg: 30
  extension_type: full
  cabinet_width_min_mm: null
  side_clearance_mm: 13
  soft_close: true
  push_to_open: null
  drill_pattern: "System 32"
finishes:
  - "SW (Silk white)"
  - "R9006 (RAL 9006 grey)"
needs_verify:
  - side_clearance_mm
conflicts: []
related_monolith: []
tags:
  - blum
  - tandembox
  - antaro
  - drawer-box
last_verified_at: null
is_stale: false
---

# Blum TANDEMBOX antaro — Height N

> draft/review_ready — กล่องลิ้นชักสำเร็จระบบโลหะ ความสูง N (68 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum TANDEMBOX antaro ความสูงข้าง N (68 mm) เป็นลิ้นชักเตี้ยขอบเหลี่ยม ใช้สำหรับใส่ของชิ้นเล็กหรือพื้นที่เตี้ย เช่น ใต้เตาไฟฟ้า ข้างหนามาตรฐาน ตลับลูกปืนทนทาน รับน้ำหนัก 30 kg

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 68 mm (ระบุในตารางประมาณ 68.5 mm)
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 81.5 mm
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 75 mm (LW = ความกว้างภายในตู้)
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 87 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 69 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 24 mm
  - หลังเหล็ก: NL - 22 mm

### Drawer Side Set รหัสสินค้า (Antaro N)
| NL (mm) | สี Silk white (SW) / Grey (R9006) |
|---|---|
| 400 | 378N4002SA |
| 450 | 378N4502SA |
| 500 | 378N5002SA |
| 550 | 378N5502SA |

## เชื่อมกับ MONOLITH
- ปัจจุบัน MONOLITH ยังไม่มีการบันทึกฐานข้อมูลของ TANDEMBOX (รางลิ้นชักเหล็กกล่องสำเร็จ) ใน `master-hardware-database.md` มีเพียงรางซ่อนสำหรับลิ้นชักไม้ (TANDEM 500/550H)
- สูตรการตัดพื้นไม้สำหรับ TANDEMBOX คือ `LW - 75 mm` ซึ่งต้องแยกคลาสจาก LEGRABOX (`LW - 35 mm`)

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
