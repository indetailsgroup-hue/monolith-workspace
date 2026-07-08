---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "770M2702S"
  - "770M2702I"
  - "770M3002S"
  - "770M3002I"
  - "770M3502S"
  - "770M3502I"
  - "770M4002S"
  - "770M4002I"
  - "770M4502S"
  - "770M4502I"
  - "770M5002S"
  - "770M5002I"
  - "770M5502S"
  - "770M5502I"
  - "770M6002S"
  - "770M6002I"
  - "770M6502S"
  - "770M6502I"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.206 (MB 202)"
specs:
  system_family: LEGRABOX
  height_class: M
  side_height_mm: 90.5
  nominal_length_NL_mm:
    - 270
    - 300
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
  - "INGL (Stainless steel Anti-fingerprint)"
needs_verify:
  - side_clearance_mm
conflicts:
  - field: backHeight
    note_value: 63
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.207 (MB 203) cutting height for M chipboard back is 63 mm"
    monolith_value: 84
    monolith_ref: "master-hardware-database.md:L157"
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

# Blum LEGRABOX pure — Height M

> draft/review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียม ความสูง M (90.5 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum LEGRABOX pure ความสูงข้าง M (90.5 mm) เป็นความสูงมาตรฐานสำหรับลิ้นชักเก็บของทั่วไป ข้างบางเรียบรับน้ำหนัก 40/70 kg 

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 90.5 mm
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 106 mm (ลิ้นชักหน้าบาน) หรือ 104 mm (ลิ้นชักใน Inner drawer)
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 35 mm
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 38 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 63 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 10 mm
  - หลังเหล็ก: NL - 21 mm

### Drawer Side Set รหัสสินค้า (Pure M)
| NL (mm) | สี SW-M / OG-M / CS-M | สี INGL (Stainless Steel) |
|---|---|---|
| 270 | 770M2702S | 770M2702I |
| 300 | 770M3002S | 770M3002I |
| 350 | 770M3502S | 770M3502I |
| 400 | 770M4002S | 770M4002I |
| 450 | 770M4502S | 770M4502I |
| 500 | 770M5002S | 770M5002I |
| 550 | 770M5502S | 770M5502I |
| 600 | 770M6002S | 770M6002I |
| 650 | 770M6502S | 770M6502I |

## เชื่อมกับ MONOLITH
- มีความขัดแย้งในค่าความสูงแผ่นหลังไม้ (`backHeight`): ในระบบ MONOLITH กำหนดไว้ `84` mm แต่ในแคตตาล็อกระบุสูตรตัดไม้ความสูงเพียง `63` mm (ความสูง 84 mm ตรงกับ TANDEMBOX Height M)
- ระบบคำนวณแผ่นพื้นตรงตามมาตรฐาน Blum

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
