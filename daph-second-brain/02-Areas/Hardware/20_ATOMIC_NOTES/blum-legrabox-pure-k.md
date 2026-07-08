---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "770K3002S"
  - "770K3502S"
  - "770K3502I"
  - "770K4002S"
  - "770K4002I"
  - "770K4502S"
  - "770K4502I"
  - "770K5002S"
  - "770K5002I"
  - "770K5502S"
  - "770K5502I"
  - "770K6002S"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.210 (MB 206)"
specs:
  system_family: LEGRABOX
  height_class: K
  side_height_mm: 128.5
  nominal_length_NL_mm:
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
finishes:
  - "SW-M (Silk white matt)"
  - "OG-M (Orion grey matt)"
  - "CS-M (Carbon black matt)"
  - "INGL (Stainless steel Anti-fingerprint)"
needs_verify:
  - side_clearance_mm
conflicts:
  - field: backHeight
    note_value: 101
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.211 (MB 207) cutting height for K chipboard back is 101 mm"
    monolith_value: 116
    monolith_ref: "master-hardware-database.md:L158"
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

# Blum LEGRABOX pure — Height K

> draft/review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียม ความสูง K (128.5 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum LEGRABOX pure ความสูงข้าง K (128.5 mm) สำหรับลิ้นชักขนาดกลาง เหมาะกับการจัดระเบียบในห้องครัวหรือห้องแต่งตัว ข้างบางเรียบรับน้ำหนัก 40/70 kg

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 128.5 mm
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 144 mm (ลิ้นชักหน้าบาน) หรือ 142 mm (ลิ้นชักใน Inner drawer)
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 35 mm
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 38 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 101 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 10 mm
  - หลังเหล็ก: NL - 21 mm

### Drawer Side Set รหัสสินค้า (Pure K)
| NL (mm) | สี SW-M / OG-M / CS-M | สี INGL (Stainless Steel) |
|---|---|---|
| 300 | 770K3002S | - |
| 350 | 770K3502S | 770K3502I |
| 400 | 770K4002S | 770K4002I |
| 450 | 770K4502S | 770K4502I |
| 500 | 770K5002S | 770K5002I |
| 550 | 770K5502S | 770K5502I |
| 600 | 770K6002S | - |

## เชื่อมกับ MONOLITH
- มีความขัดแย้งในค่าความสูงแผ่นหลังไม้ (`backHeight`): ในระบบ MONOLITH กำหนดไว้ `116` mm แต่ในแคตตาล็อกระบุสูตรตัดไม้ความสูงเพียง `101` mm (ความสูง 116 mm ตรงกับ TANDEMBOX Height K)
- ระบบคำนวณแผ่นพื้นตรงตามมาตรฐาน Blum

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
