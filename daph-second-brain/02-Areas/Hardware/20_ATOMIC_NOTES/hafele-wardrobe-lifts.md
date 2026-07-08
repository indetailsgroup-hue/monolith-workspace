---
note_type: product
vendor: hafele
system: wardrobe_system
truth_layer: draft
review_status: review_ready
sku:
  - "805.23.762"
  - "805.23.662"
  - "805.23.162"
  - "805.23.362"
  - "805.23.998"
  - "805.23.996"
  - "805.24.230"
  - "805.24.530"
  - "805.24.910"
  - "805.24.970"
  - "805.20.900"
  - "805.20.901"
  - "805.24.950"
  - "805.24.961"
  - "805.24.579"
  - "805.29.901"
  - "805.29.200"
  - "805.21.510"
  - "805.21.500"
  - "805.21.911"
  - "805.21.901"
  - "805.21.210"
  - "805.21.200"
  - "805.20.470"
  - "805.20.971"
  - "805.20.370"
source_refs:
  - "hafele-catalog-2021:p.1224"
  - "hafele-catalog-2021:p.1226"
  - "hafele-catalog-2021:p.1232"
  - "hafele-catalog-2021:p.1233"
needs_verify:
  - horizontal_row_spacing
related_monolith: []
tags: [product, hafele, wardrobe_system, wardrobe_lift, drillmap]
last_verified_at:
is_stale: false
---

# Häfele Wardrobe Lifts

## สรุป
ระบบลิฟต์ยกราวแขวนเสื้อผ้า (Wardrobe Lifts) ของ Häfele ออกแบบมาเพื่อยึดติดกับแผงข้างตู้ โดยมีรุ่นการทำงานหลักๆ ทั้งแบบกลไกดึงมือพร้อมโช้คอัพช่วยผ่อนแรง (Super, Super Pro, Only, Wall-mounted) และควบคุมการทำงานด้วยไฟฟ้า (Electric) เพื่อช่วยให้เข้าถึงเสื้อผ้าที่แขวนอยู่บนที่สูงได้อย่างสะดวก

---

## สเปกสำคัญ

<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
### 1. รุ่นและขีดจำกัดภาระน้ำหนัก (Model & Load Capacities)
*อ้างอิง: `hafele-catalog-2021:p.1224` (MB 8.36), `p.1226` (MB 8.38), `p.1232` (MB 8.42), `p.1233` (MB 8.43)*

| รุ่นลิฟต์ยก (Model) | ระยะความกว้างตู้ภายใน (Cabinet Width) | ขนาดท่อราวแขวน (Rail Diameter) | พิกัดรับน้ำหนักสูงสุด (Load Capacity) |
|---|---|---|---|
| **Electric** (ไฟฟ้า 12V/60W) | 750–1200 mm | Ø 22.4 mm | **17 kg** |
| **Professional** (แบบดึงมือ) | 870–1190 mm | Ø 28.0 mm | **15 kg** *(แนะนำโหลดขั้นต่ำ 5 kg เพื่อการยกที่สมูท)* |
| **Super** (แบบดึงมือ) | 800–1100 mm | ตามมาตรฐาน | **12.5 kg** |
| **Super Pro** (แบบดึงมือ) | < 1100 mm *(ตัดราวสไลด์ให้สั้นลงได้)* | ตามมาตรฐาน | **18 kg** |
| **Only** (แบบดึงมือ) | 600–1190 mm *(มี 2 ช่วงกว้าง)* | Ø 22.4 mm | **12 kg** |
| **Wall-mounted** (แบบยึดผนังหลัง) | ปรับระยะราวได้ 620–950 mm | ตามมาตรฐาน | **10 kg** |

### 2. อุปกรณ์เสริมและการหนุนหลบบานพับ (Spacers)
- **Super / Super Pro spacer (13 mm):** รหัสสินค้า `805.24.579` (หนา 13 mm ซ้อนกันได้)
- **Only spacer (15 mm):** รหัสสินค้า `805.20.470` (Beige), `805.20.971` (Grey), `805.20.370` (Black)
<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->

---

## Drilling / การเจาะ (drillMap Specifications)

### 1. พิกัดรูเจาะยึดแผงข้างของลิฟต์ (Super และ Super Pro)
- **ระยะห่างระหว่างแถวเจาะแนวตั้งในแนวนอน (Horizontal row spacing):** **450 mm** หรือ **480 mm**
- **ขนาดและระบบรูเจาะ:** ขันยึดเข้าแผงข้างโดยตรงผ่านรูเจาะแถวระบบ System 32 ระยะพิช 32 mm มาตรฐาน

---

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- Catalog Pages: `MB 8.36`, `MB 8.38`, `MB 8.42`, `MB 8.43`

## เชื่อมกับ MONOLITH
- ระยะห่างแถวเจาะแนวนอน 450 mm และ 480 mm ยังไม่ได้เขียนสเปกลงในโค้ดหลักของ MONOLITH (เป็นพารามิเตอร์ประเภท `drillmap` เชิงออกแบบสำหรับวิศวกรโรงงานตรวจสอบ)
