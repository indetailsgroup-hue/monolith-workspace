---
note_type: product
vendor: hafele
system: wardrobe_system
truth_layer: draft
review_status: review_ready
sku:
  - "805.22.560"
  - "805.22.760"
  - "805.22.561"
  - "805.22.761"
  - "805.22.565"
  - "805.22.765"
  - "805.22.595"
  - "805.22.795"
  - "805.22.596"
  - "805.22.796"
  - "806.35.572"
  - "806.35.772"
  - "806.35.573"
  - "806.35.773"
  - "806.35.574"
  - "806.35.774"
  - "806.35.575"
  - "806.35.775"
  - "806.35.576"
  - "806.35.776"
  - "806.35.990"
  - "806.31.512"
  - "806.31.513"
  - "806.31.514"
  - "806.31.515"
  - "806.31.516"
  - "806.31.522"
  - "806.31.523"
  - "806.31.524"
  - "806.31.525"
  - "806.31.526"
  - "806.31.550"
  - "803.17.980"
  - "803.17.981"
  - "803.17.997"
  - "803.17.996"
  - "807.06.501"
  - "807.06.701"
  - "806.36.700"
  - "806.31.570"
  - "801.26.501"
  - "801.26.701"
  - "801.26.502"
  - "801.26.702"
  - "557.64.402"
  - "557.64.403"
  - "557.64.404"
  - "557.64.405"
source_refs:
  - "hafele-catalog-2021:p.1174"
  - "hafele-catalog-2021:p.1175"
  - "hafele-catalog-2021:p.1176"
  - "hafele-catalog-2021:p.1178"
  - "hafele-catalog-2021:p.1187"
  - "hafele-catalog-2021:p.1188"
  - "hafele-catalog-2021:p.1189"
  - "hafele-catalog-2021:p.1191"
  - "hafele-catalog-2021:p.1192"
  - "hafele-catalog-2021:p.1196"
needs_verify:
  - width_formula
related_monolith: []
tags: [product, hafele, wardrobe_system, dresscode, drillmap]
last_verified_at:
is_stale: false
---

# Häfele Dresscode Cabinet Organizer System

## สรุป
Häfele Dresscode เป็นระบบจัดระเบียบตู้เสื้อผ้าแบบโมดูลาร์ที่ใช้โครงเฟรมอะลูมิเนียมและปลั๊กต่อประกอบที่ง่ายต่อการถอดเข้าออกโดยไม่ต้องใช้เครื่องมือ (Toolless Connector) โดยสามารถเสียบประกอบกับรูเจาะระบบ System 32 (รูขนาด Ø5 mm ระยะพิช 32 mm) บนแผงข้างตู้ไม้ทั่วไป หรือใช้ประกอบร่วมกับโครงอะลูมิเนียมแผงข้างเฉพาะของระบบ

---

## สเปกสำคัญ

<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
### 1. ความกว้างและการคำนวณระยะหลบบานประตู (Width Calculation & Spacers)
*อ้างอิง: `hafele-catalog-2021:p.1174` (MB 8.18) และ `p.1175` (MB 8.19)*

ในการติดตั้งชุดดึงของ Dresscode (เช่น Pull-out frame หรือ Trouser rack) ร่วมกับตู้ที่มีบานประตู (บานพับถ้วยหรือบานเลื่อน) จำเป็นต้องใช้ตัวหนุน (Spacer bar) เสริมด้านข้างเพื่อหลบระยะทับบานประตู:
- **สูตรคำนวณความกว้างของโครงเฟรม (Frame Width $B$ รวมรางสไลด์):**
  $$B = \text{Internal Cabinet Width} - 42\text{ mm}$$
  *(เมื่อใช้ตัวหนุนขนาด $21\text{ mm}$ สองฝั่งซ้าย-ขวา)*
- **ตัวหนุนระยะหลบ (Spacer bar thickness options):** 
  - รุ่นบาง: ความหนา $21\text{ mm}$ (รหัสสินค้า `805.22.595` / `805.22.795`)
  - รุ่นหนา: ความหนา $42\text{ mm}$ (รหัสสินค้า `805.22.596` / `805.22.796`)
- **ความลึกติดตั้งขั้นต่ำที่ต้องการ (Internal Installation Depth):**
  - สำหรับ Pull-out frame: $\ge 540\text{ mm}$
  - สำหรับ Trouser rack: $\ge 520\text{ mm}$
  - สำหรับ Multi-functional pull out: $\ge 500\text{ mm}$
- **พิกัดรับน้ำหนักสูงสุด (Load capacity guidelines):**
  - ถาดดึง/ตะแกรงอะลูมิเนียม: $\le 30\text{ kg}$
  - ถาดลิ้นชักไม้จริง (Solid wood drawer): $\le 30\text{ kg}$ (เมื่อติดตั้งในตู้ไม้ปกติ) หรือ $\le 15\text{ kg}$ (เมื่อติดตั้งในเฟรม Dresscode อะลูมิเนียม)

<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->

---

## Drilling / การเจาะ (drillMap Specifications)

### 1. ขนาดและพิกัดการเจาะฝั่งตู้
- **ขนาดรูเจาะรับปลั๊กต่อ (Hole diameter for connector inserts):** **Ø5 mm**
- **ระยะห่างแนวตั้ง (Vertical grid spacing):** **32 mm** (ตามกริต System 32 มาตรฐาน)
- **การติดตั้งปลั๊กต่อตัวผู้ (Häfele Dresscode Connector):**
  - กดเดือยของ Connector ตัวผู้ (Boss Insert/Support) เข้ากับรูเจาะ Ø5 mm และกดก้านโยก (Fold down lever) ลงเพื่อล็อคให้อยู่กับที่โดยไม่ต้องขันสกรู
  - รหัสอะไหล่ Connector ทดแทน:
    - Connector A (สำหรับ Lift, Spacer, Multi-functional): `803.17.997`
    - Connector B (สำหรับ Runners/รางสไลด์): `803.17.996`

---

## อ้างอิง
- Source: [[hafele-catalog-2021]]
- Catalog Pages: `MB 8.18`, `MB 8.19`, `MB 8.20`, `MB 8.26`, `MB 8.27`, `MB 8.30`

## เชื่อมกับ MONOLITH
- โครงสร้างรูเจาะยังไม่ได้ทำการ Map เข้าระบบ drillMap อัตโนมัติ (เป็นพารามิเตอร์ประเภท `drillmap` เชิงออกแบบสำหรับวิศวกรโรงงานตรวจสอบ)
