---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "770C2702S"
  - "770C2702I"
  - "770C3002S"
  - "770C3002I"
  - "770C3502S"
  - "770C3502I"
  - "770C4002S"
  - "770C4002I"
  - "770C4502S"
  - "770C4502I"
  - "770C5002S"
  - "770C5002I"
  - "770C5502S"
  - "770C5502I"
  - "770C6002S"
  - "770C6002I"
  - "770C6502S"
  - "770C6502I"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.214 (MB 210)"
specs:
  system_family: LEGRABOX
  height_class: C
  side_height_mm: 177
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
    note_value: 148
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.215 (MB 211) cutting height for C chipboard back is 148 mm"
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

# Blum LEGRABOX pure — Height C

> draft/review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียม ความสูง C (177 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum LEGRABOX pure ความสูงข้าง C (177 mm) สำหรับลิ้นชักสูง/ลิ้นชักหม้อ (High fronted pull-out) ข้างเหล็กหรือสแตนเลสทรงสูงปิดเรียบ รับน้ำหนัก 40/70 kg 

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 177 mm
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 193 mm (ลิ้นชักหน้าบาน) หรือ 191 mm (ลิ้นชักใน Inner pull-out)
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 35 mm
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 38 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 148 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 10 mm
  - หลังเหล็ก: NL - 21 mm

### Drawer Side Set รหัสสินค้า (Pure C)
| NL (mm) | สี SW-M / OG-M / CS-M | สี INGL (Stainless Steel) |
|---|---|---|
| 270 | 770C2702S | 770C2702I |
| 300 | 770C3002S | 770C3002I |
| 350 | 770C3502S | 770C3502I |
| 400 | 770C4002S | 770C4002I |
| 450 | 770C4502S | 770C4502I |
| 500 | 770C5002S | 770C5002I |
| 550 | 770C5502S | 770C5502I |
| 600 | 770C6002S | 770C6002I |
| 650 | 770C6502S | 770C6502I |

## เชื่อมกับ MONOLITH
- มีความขัดแย้งในค่าความสูงแผ่นหลังไม้ (`backHeight`): ในระบบ MONOLITH กำหนดไว้ `167` mm แต่ในแคตตาล็อกระบุสูตรตัดไม้ความสูงเพียง `148` mm (ความสูง 167 mm ตรงกับ TANDEMBOX Height C)
- ระบบคำนวณแผ่นพื้นตรงตามมาตรฐาน Blum

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
