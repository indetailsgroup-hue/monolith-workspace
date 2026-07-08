---
note_type: product
vendor: hafele
system: lighting
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (2).pdf:p.1164-1165 (MB 2.302-2.302 A)"]
sku: ["833.95.716", "833.95.721", "833.95.742", "833.95.743", "833.93.737", "833.75.744", "833.89.002", "833.89.009", "833.89.258", "833.89.265"]
# หมายเหตุ: label→SKU (RGB/mono/Y-dist/mains) อยู่ในตาราง body
specs:
  rgb_plug_drill_hole_mm: 9
  mono_plug_drill_hole_mm: 8
  socket_drill_hole_mm: 13
  rgb_current_capacity_a: 3.5
  rgb_wire_cross_section_awg: 20
  mono_current_capacity_a: 5.0
  mono_wire_cross_section_awg: 18
  max_total_cable_length_m: 10
conflicts: []
needs_verify:
  - mains_lead_c7_eu_2m
  - mains_lead_c13_schuko_2m
tags: [hafele, lighting, loox, loox5, extension-lead, cable, wire, cabinet-hardware, drillmap]
last_verified_at: null
is_stale: false
---

# Häfele Loox5 — Cables & Extension Leads (สายเชื่อมต่อและขยายสัญญาณ)

ระบบสายเชื่อมต่อ สายต่อขยาย และสายพ่วง (Extension Leads & Distributors) ของ **Häfele Loox5** ทำหน้าที่ส่งต่อกระแสไฟฟ้าจากกล่องจ่ายไฟไปยังอุปกรณ์ต่างๆ พร้อมข้อกำหนดในการเจาะบอร์ดฝังหัวต่อ (Plugs/Sockets) ในงานออกแบบตู้เฟอร์นิเจอร์

---

## 1. Drilling Specifications for CAD & drillMap (ขนาดรูเจาะสำหรับเตรียมทางเดินสายไฟ)
*ขนาดรูเจาะของแผ่นบอร์ดไม้ข้างตู้หรือผนังตู้มีความสำคัญเชิงวิศวกรรมการผลิต (drillMap) เพื่อให้สามารถร้อยสายไฟและหัวต่อผ่านได้โดยบอร์ดไม่เสียหาย:*

| ชนิดสายไฟ / อุปกรณ์ | ขนาดรูเจาะร้อยปลั๊ก (Plug Drill Hole) | ขนาดรูเจาะร้อยซ็อกเก็ต (Socket Drill Hole) | ข้อมูลจำเพาะทางไฟฟ้า |
|---|---|---|---|
| **สายไฟ RGB (4-pin)** | **Ø 9.0 mm** | **Ø 13.0 mm** | กระแสสูงสุด `3.5 A` · ขนาดสาย `AWG 20` |
| **สายไฟสีเดียว / 2-pin (Monochrome)** | **Ø 8.0 mm** | **Ø 13.0 mm** | กระแสสูงสุด `5.0 A` · ขนาดสาย `AWG 18` |
| **สายสวิตช์ / ปลั๊กกลไก modular** | **Ø 12.0 mm** | - | สำหรับร้อยหัวเสียบสวิตช์ที่มีกลไกสลักยึด |

---

## 2. Product Range & SKU Mappings

### 2.1 Extension Lead for RGB Lights (3.5 A, 4-wire)
*สายไฟต่อขยายจำนวน 4 แกนทองแดง สำหรับควบคุมโคมไฟเปลี่ยนสี RGB*
- **ความยาวสาย 2000 mm (2.0 m)**:
  - ระบบ **12 V RGB**: พาร์ต `833.95.716`
  - ระบบ **24 V RGB**: พาร์ต `833.95.721`

### 2.2 4-Way Extension Lead for Monochrome Lights (5.0 A, 2-wire)
*สายเชื่อมต่อขยายหัวแยกแบบขนาน จ่ายกระแสไฟฟ้าให้กับอุปกรณ์จุดละ 2-pin สูงสุด 4 อุปกรณ์พร้อมกัน*
- **ความยาวสาย 6500 mm (6.5 m)**:
  - ระบบ **12 V Monochrome**: พาร์ต `833.95.742`
  - ระบบ **24 V Monochrome**: พาร์ต `833.95.743`

### 2.3 Y-Distributor for Monochrome Lights (5.0 A, 2-wire)
*สายแยกพ่วง 2 ทางขนาน ระยะสายสั้น*
- **ความยาวสาย 1500 mm (1.5 m)**:
  - ระบบ **12 V**: พาร์ต `833.93.737`
  - ระบบ **24 V**: พาร์ต `833.75.744`

### 2.4 Mains Leads (สายไฟหลักแปลงเข้าไดรเวอร์)
- **สเปกใช้กับไดรเวอร์ 20 W – 90 W (ซ็อกเก็ตต่อท้ายแบบ C7)**:
  - ปลั๊กแบนมาตรฐานยุโรป (Flat EU plug), ยาว 2 m: พาร์ต `833.89.002` (ต้องการตรวจสอบการจัดจำหน่ายในภูมิภาค)
  - ชนิดปลายสายเปลือยสำหรับเข้าตู้ไฟแบบต่อขันเกลียว (Direct connection): พาร์ต `833.89.009`
- **สเปกใช้กับไดรเวอร์ 240 W (ซ็อกเก็ตแบบ cold appliance C13)**:
  - ปลั๊ก Schuko มาตรฐานความปลอดภัย (Safety plug), ยาว 2 m: พาร์ต `833.89.258` (ต้องการตรวจสอบสเปกหัวเสียบในประเทศไทย)
  - ชนิดปลายสายเปลือยสำหรับต่อขันเกลียว (Direct connection): พาร์ต `833.89.265`

---

## 3. Voltage Drop Warning (คำเตือนเรื่องกำลังตกในสาย)
- **ระยะสูงสุด 10.0 m**: ระยะสายรวมที่วัดจากกล่องไดรเวอร์แปลงไฟไปยังโคมไฟปลายทางห้ามเกิน 10.0 เมตรเด็ดขาด
- **ผลเสียสะสม**: การต่อสายไฟยาวเกินขีดจำกัด ร่วมกับภาระโหลดจำนวนวัตต์ของหลอดไฟที่ยาวเกินไป จะทำให้เกิดการสูญเสียแรงดันไฟฟ้าในสาย (Voltage drop) ส่งผลให้โคมไฟปลายทางมีความสว่างลดลงอย่างเห็นได้ชัด (Visible loss of brightness)

---

## 4. CAD & Manufacturing Integration
- `related_monolith`: *drillMap candidate ในอนาคต* (ใช้ตรวจสอบขนาดรูร้อยสายที่แผงบอร์ดข้างตู้ข้างหลังเพื่อร้อยหัวปลั๊ก Ø8/Ø9 มม. และซ็อกเก็ต Ø13 มม.)
