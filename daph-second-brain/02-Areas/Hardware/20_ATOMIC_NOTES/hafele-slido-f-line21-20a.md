---
note_type: product
vendor: hafele
system: sliding_door
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (1).pdf:p.1876-1877 (MB 10.50-10.51)"]
sku: ["402.33.029", "402.33.030", "402.33.031", "402.33.642", "402.33.643", "402.30.642", "402.30.643", "402.30.802", "402.30.803"]
specs:
  max_door_weight_kg: 20
  door_thickness_range_mm: [16, 19]
  max_door_height_mm: 1400
  max_door_width_mm: 1250
  min_door_width_one_soft_close_mm: 350
  min_door_width_two_soft_close_mm: 530
  running_track_groove_width_mm: 16
  bottom_guide_track_groove_width_mm: 6
  height_adjustment_mm: 2.0
conflicts: []
needs_verify:
  - running_track_groove_width_mm
  - bottom_guide_track_groove_width_mm
related_monolith: []
tags: [hafele, slido, sliding-door, vorfront, cabinet-hardware, drillmap]
last_verified_at: null
is_stale: false
---

# Häfele Slido F-Line21 20A (ระบบบานเลื่อนนอกตู้บานไม้ 20 kg)

ระบบอุปกรณ์บานเลื่อนชนิดวิ่งนอกตัวตู้ (Vorfront) สำหรับบานไม้ที่มีน้ำหนักไม่เกิน **20 kg** ของ **Häfele Slido** เหมาะสำหรับตู้บานเลื่อนขนาดเล็กถึงปานกลาง เช่น ตู้แขวน หรือตู้วางของเตี้ย

---

## 1. Technical Specifications (ข้อมูลทางเทคนิค)
- **ประเภทการติดตั้ง (Running Style)**: วิ่งนอกตู้ (Vorfront) บอดี้ล้อซ่อนวิ่งบนรางประคองเดี่ยวเด่นนอกตู้
- **น้ำหนักบานสูงสุด (Max Door Weight)**: **20 kg** ต่อบานประตู
- **ความหนาบานประตู (Door Thickness)**: **16 – 19 mm**
- **สัดส่วนบานสูงสุด (Door Dimensions)**: 
  - ความสูงบานประตูสูงสุด: **< 1,400 mm**
  - ความกว้างบานประตูสูงสุด: **< 1,250 mm**
  - *ข้อแนะนำจากผู้ผลิต (Manufacturer Guidelines)*: อัตราส่วนมิติความสูงของบานต้องไม่เกิน 3 เท่าของความกว้างบานเด็ดขาด ($H \le 3 \times W$) (ยังไม่มีผลควบคุมในโค้ด MONOLITH)
- **การปรับตั้งระดับบาน (Adjustment)**: ปรับระดับสูง-ต่ำได้ **±2.0 mm** ผ่านล้อปรับระดับ (adjusting wheel)
- **ตัววิ่งด้านบน (Running Gear)**: ระบบลูกล้อ 4 ล้อ วัสดุพลาสติกเหนียว แกนเพลาเหล็กประกบแป้นรับซิงก์อัลลอย

---

## 2. drillMap & CAD Specifications (ข้อมูลการบากเซาะร่องผลิตบอร์ด)
*ข้อมูลเชิงขนาดที่มีผลต่อการทำไฟล์สั่งผลิตของฝั่งตู้เฟอร์นิเจอร์ (drillMap critical):*

- **ร่องฝังรางวิ่งบน (Running Track Groove Width)**: กว้าง **16.0 mm** (ความลึกเซาะบอร์ดขึ้นอยู่กับประเภทราง โดยทั่วไปจะบากบอร์ดแผงบนใต้ตู้เพื่อกดอัดรางลงในร่อง)
  - *หมายเหตุการยึด*: รางวิ่งบนชนิดฝังและยึดกาว ต้องการความหนาแผงบนตู้ขั้นต่ำ 19 mm สำหรับฝัง หากใช้วิธียึดสกรูผ่านราง ต้องการความหนาแผงบนตู้ขั้นต่ำ 30 mm
  - *ขนาดราง*: หากใช้วิธียึดสกรูผ่านรางโดยตรง (Screw fixing tracks) ความกว้างและระยะติดตั้งจะเพิ่มขึ้น 14 mm ตามสเปก
- **ร่องฝังรางประคองล่าง (Bottom Guide Track Groove Width)**: กว้าง **6.0 mm** เจาะแบบเซาะร่อง (groove mounting) เพื่ออัดฝังรางนำร่องพลาสติก

---

## 3. Product Sets & SKU Mappings

### 3.1 Sets for 1 Door (ชุดอุปกรณ์ต่อบานเดี่ยว)
*ในชุดมาพร้อมล้อวิ่ง 2 ชิ้น, ตัวประคองล่าง 2 ชิ้น และอุปกรณ์ติดตั้ง*
- **ชุดมีตัวหยุดแบบคลิป (With clip-in door stopper)**: พาร์ต `402.33.029`
- **ชุดระบบโช้คดึงปิดด้านเดียว (With soft/self close on one side)**: พาร์ต `402.33.030`
  - *เงื่อนไขความกว้างบานขั้นต่ำ*: **350 mm**
  - *ระยะห่างพิตช์ล้อวิ่งคู่*: ขั้นต่ำ 245 mm
- **ชุดระบบโช้คดึงปิดสองด้าน (With soft/self close on both sides)**: พาร์ต `402.33.031`
  - *เงื่อนไขความกว้างบานขั้นต่ำ*: **530 mm**
  - *ระยะห่างพิตช์ล้อวิ่งคู่*: ขั้นต่ำ 425 mm

### 3.2 Running & Guide Tracks (รางวิ่งและรางประคอง)
- **รางวิ่งบนเดี่ยว (Single top running track)**:
  - แบบฝังร่อง 16mm/ยึดสกรู 3mm (Aluminium bright): ยาว 2.5m (`402.33.642`) · ยาว 3.5m (`402.33.643`)
  - แบบยึดสกรู 3.5mm (Aluminium silver anodized): ยาว 2.5m (`402.30.642`) · ยาว 3.5m (`402.30.643`)
- **รางประคองล่างเดี่ยว (Single bottom guide track with harpoon rib)**:
  - แบบฝังร่อง 6mm (Plastic grey): ยาว 2.5m (`402.30.802`) · ยาว 3.5m (`402.30.803`)

---

## 4. Related Code Integration
- `related_monolith`: *drillMap candidate ในอนาคต* (ใช้ควบคุมขนาดรางวิ่งและระยะเซาะบอร์ดแผงบนตู้กว้าง 16 mm และรางประคองล่างบอร์ดไม้หนา 6 mm)
