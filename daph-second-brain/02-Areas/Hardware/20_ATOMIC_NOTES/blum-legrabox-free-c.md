---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "780C3502S"
  - "780C4002S"
  - "780C4502S"
  - "780C5002S"
  - "780C5502S"
  - "780C6002S"
  - "780C6502S"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.222 (MB 218)"
specs:
  system_family: LEGRABOX
  height_class: C
  side_height_mm: 177
  nominal_length_NL_mm:
    - 350
    - 400
    - 450
    - 500
    - 550
    - 600
    - 650
  load_rating_kg: 40
  extension_type: full
  cabinet_width_min_mm: null
  side_clearance_mm: 13
  soft_close: true
  push_to_open: null
  drill_pattern: "System 32"
finishes:
  - "SW-M (Silk white matt)"
  - "OG-M (Orion grey matt)"
  - "CS-M (Carbon black matt)"
needs_verify:
  - side_clearance_mm
conflicts:
  - field: backHeight
    note_value: 148
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.223 (MB 219) cutting height for C chipboard back is 148 mm"
    monolith_value: 167
    monolith_ref: "master-hardware-database.md:L159"
    status: unresolved
related_monolith:
  - "specs/reference/master-hardware-database.md"
tags:
  - blum
  - legrabox
  - drawer-box
last_verified_at: null
is_stale: false
---

# Blum LEGRABOX free — Height C

> draft/review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียมรุ่น free ความสูง C (177 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum LEGRABOX free ความสูงข้าง C (177 mm) สำหรับใส่แผงกระจกหรือวัสดุตกแต่งด้านข้าง (design elements เช่น ไม้ หิน หนัง) เพิ่มความสวยงามหรูหรา 

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 177 mm
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 193 mm (ลิ้นชักหน้าบาน) หรือ 191 mm (ลิ้นชักใน Inner pull-out)
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 35 mm
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 38 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 148 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 10 mm
  - หลังเหล็ก: NL - 21 mm

### Drawer Side Set รหัสสินค้า (Free C)
| NL (mm) | สี SW-M / OG-M / CS-M |
|---|---|
| 350 | 780C3502S |
| 400 | 780C4002S |
| 450 | 780C4502S |
| 500 | 780C5002S |
| 550 | 780C5502S |
| 600 | 780C6002S |
| 650 | 780C6502S |

## เชื่อมกับ MONOLITH
- มีความขัดแย้งในค่าความสูงแผ่นหลังไม้ (`backHeight`): ในระบบ MONOLITH กำหนดไว้ `167` mm แต่ในแคตตาล็อกระบุสูตรตัดไม้ความสูงจริงเพียง `148` mm
- ระบบคำนวณแผ่นพื้นตรงตามมาตรฐาน Blum

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
