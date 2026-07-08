---
note_type: product
vendor: hafele
system: connector
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.58-60 (MB 4.40-4.42)"]
sku: ["264.37.196", "264.39.192", "264.42.190", "264.43.600", "264.43.111", "264.43.291", "001.22.467", "001.22.485"]
# หมายเหตุ: 001.22.467 = stepped drill bit 5mm shank · 001.22.485 = 7mm shank · label→SKU เต็มอยู่ใน body
specs:
  shank_diameters: [5, 7]
  standard_length_mm: 50
  boring_profile:
    stepped_5mm_shank:
      drill_bit_1st_step_dia_mm: 4.0   # Blind hole for thread
      drill_bit_2nd_step_dia_mm: 5.0   # Through hole for shank
      countersinker_dia_mm: 8.3
    stepped_7mm_shank:
      drill_bit_1st_step_dia_mm: 5.0   # Blind hole for thread
      drill_bit_2nd_step_dia_mm: 7.0   # Through hole for shank
      countersinker_dia_mm: 10.0
conflicts: []
needs_verify: []
related_monolith: []
tags: [hafele, confirmat, screw, connector, drilling-specs, knock-down]
last_verified_at: null
is_stale: false
---

# Häfele — Confirmat One-Piece Connectors

สกรูประกอบโครงตู้แบบชิ้นเดียว (Confirmat Screws) มีกำลังรับแรงดึงและแรงดัดงอสูงมาก เหมาะสำหรับการประกอบตู้ Knock-down ที่ต้องทนแรงกดทับหนัก โดยการเจาะรูประกอบจะต้องเจาะเป็นสองขั้นตอน (Stepped drilling) เพื่อรับขนาดแกนสกรูและเกลียวปล่อยที่ต่างกัน

---

## 1. Stepped Drilling Specifications (ขนาดรูเจาะสองขั้นตอน)
เพื่อให้เกลียวสกรูกระชับแน่นในแผ่นข้างและแผ่นล่าง/แผ่นชั้น โดยไม่ทำลายเนื้อไม้รอบนอก ต้องใช้ **Stepped Drill Bit (ดอกสว่านเจาะสองระดับ)**

### 1.1 สำหรับ Confirmat แกนสกรู Ø5 mm (Shank Ø5 mm)
- **ขั้นตอนที่ 1 (Blind Hole ในขอบชั้น)**: เจาะนำขนาด **Ø4.0 mm**
- **ขั้นตอนที่ 2 (Through Hole ในแผงข้าง)**: เจาะนำขนาด **Ø5.0 mm**
- **การเจาะจมหัว (Countersink)**: ขนาดคว้านหัวผาย **Ø8.3 mm**
- **พาร์ตดอกสว่านขั้นบันได (Stepped Drill Bit)**: `001.22.467` (ความยาวช่วงเจาะ 38+50 mm)

### 1.2 สำหรับ Confirmat แกนสกรู Ø7 mm (Shank Ø7 mm)
- **ขั้นตอนที่ 1 (Blind Hole ในขอบชั้น)**: เจาะนำขนาด **Ø5.0 mm**
- **ขั้นตอนที่ 2 (Through Hole ในแผงข้าง)**: เจาะนำขนาด **Ø7.0 mm**
- **การเจาะจมหัว (Countersink)**: ขนาดคว้านหัวผาย **Ø10.0 mm**
- **พาร์ตดอกสว่านขั้นบันได (Stepped Drill Bit)**: `001.22.485` (ความยาวเจาะ 38+50 mm) หรือ `001.22.390` (ความยาวเจาะ 70 mm)

---

## 2. Confirmat Screw Product Range

### 2.1 Shank Diameter 5 mm (เกลียวปล่อยช่วงแกนนำขนาด 5 mm)
- **หัวขับกากบาท PZ2 (พร้อมรูเจาะกลาง 2.5 mm สำหรับปิดฝาครอบ)**
  - ขนาดเกลียว Ø5 x ยาว 38 mm: พาร์ต Galvanized `264.37.098`
  - ขนาดเกลียว Ø5 x ยาว 50 mm: พาร์ต Galvanized `264.37.196`
- **หัวขับหกเหลี่ยม SW3 (SW3 Hexagon Socket)**
  - ขนาดเกลียว Ø5 x ยาว 50 mm: พาร์ต Galvanized `264.39.192`
- **หัวขับ T-Star TS20**
  - ขนาดเกลียว Ø5 x ยาว 37 mm: พาร์ต Galvanized `264.42.301`
  - ขนาดเกลียว Ø5 x ยาว 50 mm: พาร์ต Galvanized `264.42.303`

### 2.2 Shank Diameter 7 mm (เกลียวปล่อยช่วงแกนนำขนาด 7 mm)
- **หัวขับกากบาท PZ3 (พร้อมรูเจาะกลาง 3.0 mm สำหรับปิดฝาครอบ)**
  - ขนาดเกลียว Ø7 x ยาว 38 mm: พาร์ต Galvanized `264.42.091`
  - ขนาดเกลียว Ø7 x ยาว 50 mm: พาร์ต Galvanized `264.42.190`
  - ขนาดเกลียว Ø7 x ยาว 70 mm: พาร์ต Galvanized `264.42.291`
- **หัวขับหกเหลี่ยม SW4 (SW4 Hexagon Socket)**
  - ขนาดเกลียว Ø7 x ยาว 38 mm: พาร์ต Galvanized `264.43.091`
  - ขนาดเกลียว Ø7 x ยาว 50 mm: พาร์ต Galvanized `264.43.600` / ดำ `264.43.111`
  - ขนาดเกลียว Ø7 x ยาว 60 mm: พาร์ต Galvanized `264.43.196`
  - ขนาดเกลียว Ø7 x ยาว 70 mm: พาร์ต Galvanized `264.43.291` / ดำ `264.43.211`
- **หัวขับ T-Star TS25**
  - ขนาดเกลียว Ø6.3 x ยาว 50 mm: พาร์ต Galvanized `264.42.313`
  - ขนาดเกลียว Ø7.0 x ยาว 50 mm: พาร์ต Galvanized `264.42.323`

---

## 3. Accessories
- **Cover Caps (ฝาปิดหัวสกรู)**: พลาสติกกลมปิดรูหัวสกรูหลบเกลียว
  - สำหรับหัวหกเหลี่ยม SW4 (หมุดขนาด Ø12.5 mm): ขาว `045.01.731` / ดำ `045.01.339` / น้ำตาล `045.01.133`
  - สำหรับหัว PZ2 (หมุดขนาด Ø12 mm): ขาว `045.04.705` / ดำ `045.04.303` / นิกเกิลด้าน `045.04.509`
- **Pressure Plate (เพลทกดผิวไม้บอร์ดข้างตู้)**: เหล็กกึ่งสปริงหนา เพื่อยึดหัวสกรูจมไม่ทำลายผิวบอร์ดรอบข้าง (พาร์ต: Galvanized `260.51.910`)
