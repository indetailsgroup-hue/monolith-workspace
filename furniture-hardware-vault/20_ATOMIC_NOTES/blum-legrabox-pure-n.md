---
note_type: product
vendor: blum
system: drawer_box
truth_layer: draft
review_status: review_ready
sku:
  - "770N4002S"
  - "770N4502S"
  - "770N4502I"
  - "770N5002S"
  - "770N5002I"
  - "770N5502S"
source_refs:
  - "BIun 198-411 Box systems.pdf:p.204 (MB 200)"
specs:
  system_family: LEGRABOX
  height_class: N
  side_height_mm: 66.5
  nominal_length_NL_mm:
    - 400
    - 450
    - 500
    - 550
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
    note_value: 39
    note_value_evidence: "BIun 198-411 Box systems.pdf:p.205 (MB 201) cutting height for N chipboard back is 39 mm"
    monolith_value: 63
    monolith_ref: "master-hardware-database.md:L156"
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

# Blum LEGRABOX pure — Height N

> draft/review_ready — กล่องลิ้นชักสำเร็จระดับพรีเมียม ความสูง N (66.5 mm)

## สรุป
ระบบกล่องลิ้นชักสำเร็จ Blum LEGRABOX pure ความสูงข้าง N (66.5 mm) ใช้กับงานลิ้นชักเตี้ย/ใต้เตาไฟฟ้าเป็นหลัก ข้างบาง 12.8 mm รับน้ำหนักสูงสุด 40 kg 

## ตารางรหัส/สเปก (เท่าที่อ่านได้จากภาพ)
- **ความสูงข้าง (Side Height):** 66.5 mm
- **พื้นที่ต้องการในตู้ (Space Requirement):** สูงอย่างน้อย 80 mm (หรือ 81 mm หากเจาะติดตั้งแผงข้างก่อนประกอบตู้)
- **ความกว้างแผ่นพื้น (Bottom Width):** LW - 35 mm (LW = ความกว้างภายในตู้)
- **ความกว้างแผ่นหลังไม้ (Back Width):** LW - 38 mm
- **ความสูงแผ่นหลังไม้ (Back Height):** 39 mm
- **ความลึกแผ่นพื้นไม้ (Bottom Depth):** 
  - หลังไม้: NL - 10 mm
  - หลังเหล็ก: NL - 21 mm

### Drawer Side Set รหัสสินค้า (Pure N)
| NL (mm) | สี SW-M / OG-M / CS-M | สี INGL (Stainless Steel) |
|---|---|---|
| 400 | 770N4002S | - |
| 450 | 770N4502S | 770N4502I |
| 500 | 770N5002S | 770N5002I |
| 550 | 770N5502S | - |

## เชื่อมกับ MONOLITH
- มีความขัดแย้งในค่าความสูงแผ่นหลังไม้ (`backHeight`): ในระบบ MONOLITH กำหนดไว้ `63` mm แต่ในแคตตาล็อกระบุสูตรตัดไม้ความสูงเพียง `39` mm
- ระบบคำนวณแผ่นพื้น (`Bottom Width` = LW - 35 mm) ตรงกับเอกสารประกอบใน MONOLITH

## อ้างอิง
- Source: [[blum-catalogue-2024-2025]] · MOC: [[blum-box-systems-moc]] · Validation: [[CK-blum-box-specs]]
