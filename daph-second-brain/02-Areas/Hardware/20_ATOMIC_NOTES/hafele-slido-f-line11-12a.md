---
note_type: product
vendor: hafele
system: sliding_door
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.1904-1905 (MB 10.78-10.79)"]
sku: ["404.72.311", "404.73.321", "404.71.302", "404.71.902", "404.71.800", "404.71.801", "404.74.940", "404.72.340", "404.74.003"]
specs:
  max_door_weight_kg: 12
  min_door_thickness_mm: 16
  guide_cup_drill_hole_diameter_mm: 35
  guide_cup_drill_hole_depth_mm: 11
  guide_cup_offset_backset_mm: 39
  height_adjustment_mm: 1.5
conflicts: []
needs_verify:
  - guide_cup_drill_hole_diameter_mm
  - guide_cup_drill_hole_depth_mm
  - guide_cup_offset_backset_mm
related_monolith: []
tags: [hafele, slido, sliding-door, infront, cabinet-hardware, drillmap, tool-optimization]
last_verified_at: null
is_stale: false
---

# Häfele Slido F-Line11 12A (ระบบบานเลื่อนในตู้บานไม้ 12 kg)

ระบบอุปกรณ์บานเลื่อนชนิดวิ่งในกรอบตู้ (Infront) สำหรับบานไม้ขนาดเล็กน้ำหนักไม่เกิน **12 kg** ของ **Häfele Slido** เหมาะสำหรับตู้วางของและเฟอร์นิเจอร์สำนักงานทั่วไปที่มีการปิดบานแบบอินเซ็ต

---

## 1. Technical Specifications (ข้อมูลทางเทคนิค)
- **ประเภทการติดตั้ง (Running Style)**: วิ่งในตู้ (Infront) บานประตูเลื่อนสลับกันหลบภายในแผงตู้ข้างซ้าย-ขวา
- **น้ำหนักบานสูงสุด (Max Door Weight)**: **12 kg** ต่อบานประตู
- **ความหนาบานประตูต่ำสุด (Min Door Thickness)**: **16 mm**
- **สัดส่วนบานสูงสุด (Door Dimensions)**: 
  - *ข้อแนะนำจากผู้ผลิต (Manufacturer Guidelines)*: อัตราส่วนมิติความสูงของบานต้องไม่เกิน 3 เท่าของความกว้างบานเด็ดขาด ($H \le 3 \times W$) (ยังไม่มีผลควบคุมในโค้ด MONOLITH)
- **การปรับตั้งระดับบาน (Adjustment)**: ปรับระดับสูง-ต่ำได้ **±1.5 mm** ที่ตัวล้อวิ่ง
- **การคำนวณความยาวรางบน-ล่าง**: 
  - $\text{Track Length} = \text{Internal Cabinet Width} - 2\text{ mm}$ (ระยะเผื่อฝาปิดและตัวหยุดบานสไลด์)

---

## 2. drillMap & CAD Specifications (ข้อมูลถ้วยประคองล่างและร่องเจาะผลิต)
*รายละเอียดมิติเชิงกลที่มีผลโดยตรงต่อเครื่องจักรเจาะบอร์ดฝั่งตู้เฟอร์นิเจอร์ (drillMap critical):*

- **ถ้วยประคองล่างฝังบอร์ดประตู (Bottom Guide Cup)**:
  - ตัวไกด์ประคองพลาสติกสีเทาพาร์ต `404.72.340` ออกแบบมาให้ฝังลงในบอร์ดประตูไม้
  - **เส้นผ่านศูนย์กลางรูเจาะถ้วย (Drill Hole Ø)**: **Ø 35.0 mm** (ใช้ดอกเจาะบานพับร่วมกันได้)
  - **ความลึกร่องเจาะถ้วย (Drilling Depth)**: **11.0 mm**
  - **ระยะศูนย์กลางรูเจาะถึงขอบประตู (Backset Offset)**: **39.0 mm**
- **รางวิ่งบนและรางนำล่าง**: ติดตั้งฝังลงในร่องบอร์ดไม้แผงบนและแผงล่างโดยใช้การกดอัดเข้าร่องยาง (Press fitting into groove)

> [!TIP]
> **การลดขั้นตอนการผลิตด้วย Tooling Optimization**:
> ขนาดถ้วยประคองล่าง **Ø 35.0 mm** ลึก **11.0 mm** นี้เป็นมิติเครื่องมือเจาะมาตรฐานเดียวกับถ้วยบานพับถ้วยตู้คอนซีลทั่วไป เช่น Blum [[blum-hinge-110-standard]] หรือ Salice [[salice-concealed-hinge]] ในการตั้งตารางเจาะ drillMap หรือโปรแกรมเขียนแบบ CAD สามารถตั้งค่ายึดเครื่องมือสว่านเจาะดอกเดียวกันและระดับแกนเจาะร่วมกันได้ เพื่อประหยัดเวลาการตั้งค่าเครื่องจักร (CNC tool change) ในกระบวนการเจาะไม้แผงประตู

---

## 3. Product Range & SKU Mappings

### 3.1 Housing & Running Gear (ล้อและตลับประคองบน)
- **ตลับรับล้อวิ่งเกลียวยึด (Housing for screw fixing - Grey plastic)**: พาร์ต `404.72.311`
- **ล้อวิ่งประคองบนยึดคลิป (Running gear for clip fixing - Grey plastic)**: พาร์ต `404.73.321` (สเกลปรับตั้งระดับได้ในตัว ±1.5 mm)

### 3.2 Guides & Stopper (ตัวนำรางล่างและสต็อปเปอร์)
- **ตัวนำไกด์ประคองล่างชนิดล้อวิ่งสไลด์ (Guide with glide rollers - Grey plastic)**: พาร์ต `404.74.940`
- **ตัวนำไกด์ประคองล่างชนิดฝังถ้วย Ø35 mm (Guide for press fitting - Grey plastic)**: พาร์ต `404.72.340`
- **ตัวหยุดบานเสียบรางวิ่งบน (Door stopper - Grey plastic)**: พาร์ต `404.74.003`

### 3.3 Running & Guide Tracks (รางพลาสติกแบบฝังเข้าร่องบอร์ด)
- **รางวิ่งบนเดี่ยว (Single top running track)**:
  - สีดำ ยางเหนียวยาว 2.0 m: พาร์ต `404.71.302`
  - สีบรอนซ์เงิน ยางเหนียวยาว 2.0 m: พาร์ต `404.71.902`
- **รางประคองล่างเดี่ยว (Single bottom guide track)**:
  - สีดำ ยาว 2.0 m: พาร์ต `404.71.800`
  - สีบรอนซ์เงิน ยาว 2.0 m: พาร์ต `404.71.801`

---

## 4. Related Code Integration
- `related_monolith`: *drillMap candidate ในอนาคต* (ใช้รหัสเจาะตำแหน่งถ้วยล่าง **Ø 35.0 mm** ระยะเยื้องขอบ **39.0 mm** ความลึกร่องเจาะ **11.0 mm** บนบอร์ดแผงประตู)
