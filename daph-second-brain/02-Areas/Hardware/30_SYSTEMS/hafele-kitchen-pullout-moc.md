---
note_type: system_moc
vendor: [hafele, kesseboehmer]
system: kitchen_pullout
truth_layer: draft
review_status: review_ready
tags: [moc, hafele, kesseboehmer, kitchen_pullout, larder-pullout, base-pullout, corner-carousel]
---

# 🍽️ Häfele & Kesseböhmer — Kitchen Cabinet Fittings & Pullouts (MOC)

Source: [[hafele-catalog-2021]] (เล่มหลัก Furniture Fittings: `blaetterkatalog (1).pdf`)

> [!NOTE]
> โน้ตกลุ่มนี้ครอบคลุมระบบอุปกรณ์ดึงตะแกรงและอุปกรณ์ภายในตู้ครัวแบรนด์ **Kesseböhmer** ที่จัดจำหน่ายโดย **Häfele** ในลักษณะ **Baseline Coverage** สำหรับการเตรียมตัวเขียนแบบ CAD และจับพารามิเตอร์การเจาะยึด (drillMap) ซึ่งใน MONOLITH ปัจจุบันระบบนี้ถือเป็นโครงสร้างใหม่ (ยังไม่มีโมเดลโค้ดทำงานจริงในฝั่งโปรดักชัน)

---

## 1. System Categorization (การแบ่งหมวดหมู่ระบบดึงตะแกรงครัว)

ระบบอุปกรณ์ดึงในห้องครัวแบรนด์ Kesseböhmer สามารถแบ่งตามพื้นที่การใช้งานและการเจาะยึดได้เป็น 4 ซีรีส์หลัก:

### 1.1 Corner Cabinet Systems (ระบบตู้เข้ามุม)
- ออกแบบมาเพื่อเพิ่มพื้นที่เก็บของในตู้มุมรูปตัว L โดยการหมุนตะแกรงออกนอกหน้าตู้ทั้งหมด
- **รุ่นหลัก**: **LeMans II Corner Carousel**
- **จุดเจาะสำคัญ**: แกนหมุนแนวตั้ง (Spindle Assembly) และชุดติดตั้งโช้ค Soft-close
- **ลิงก์อ้างอิง**: [[hafele-kesseboehmer-lemans-ii]]

### 1.2 Tall Cabinet Larder Pullouts (ตู้ดึงสูง/ตู้คลังอาหาร)
- ตะแกรงดึงความสูงระดับสายตาถึงติดเพดาน (1200–2300 mm) เลื่อนออกแบบเต็มบาน
- **รุ่นหลัก**: **Dispensa Larder Pullout**
- **จุดเจาะสำคัญ**: แนวกึ่งกลางตู้ด้านล่างและแผงบนตู้ (Centerline Drilling) และจุดยึดหน้าบานประตู
- **ลิงก์อ้างอิง**: [[hafele-kesseboehmer-dispensa-larder]]

### 1.3 Base Cabinet Pullouts (ตู้ดึงล่างมาตรฐาน)
- ตะแกรงดึงสำหรับติดตั้งกับฐานตู้ด้านล่าง ปรับระดับชั้นวางภายในได้หลากหลาย
- **รุ่นหลัก**: **Dispensa Junior III**
- **จุดเจาะสำคัญ**: ยึดติดแผงพื้นตู้ด้านล่าง (Bottom panel fixing) พร้อมปรับหน้าบานประตูแบบ 3D
- **ลิงก์อ้างอิง**: [[hafele-kesseboehmer-dispensa-junior]]

### 1.4 Narrow Cabinet Pullouts (ตู้ดึงขนาดเล็ก 150 mm)
- ตะแกรงดึงด้านข้างขนาดเล็กที่สุด (150 mm Cabinet Width) สำหรับพื้นที่ช่องแคบ
- **รุ่นหลัก**: **No. 15 Base Unit Pullout**
- **จุดเจาะสำคัญ**: ยึดกับแผงตู้ด้านขวาโดยใช้ระบบรูเจาะ System 32 พร้อมกำหนดระยะหน้าเยื้องขอบ (Setback Dim A)
- **ลิงก์อ้างอิง**: [[hafele-kesseboehmer-pullout-150]]

---

## 2. Common Mounting & drillMap Guidelines (แนวทางรูเจาะร่วม)

*รายละเอียดพารามิเตอร์เครื่องจักร (CNC Boring) และข้อกำหนด CAD:*

1. **Centerline Boring (การเจาะยึดแนวแกนกลาง)**:
   - ระบบตู้ดึงสูง Dispensa ใช้รางวิ่งที่ต้องติดตั้งบนกึ่งกลางความกว้างตู้พอดี โดยระยะเจาะยึดด้านข้าง (Dim X) คำนวณจากสูตร:
     $$\text{Dim X} = \text{Internal Cabinet Width} - 75\text{ mm}$$
     (นั่นคือห่างจากแผงตู้ด้านในฝั่งซ้ายและขวาเท่ากันข้างละ $37.5\text{ mm}$ สำหรับแผงตู้หนา 16 หรือ 19 mm)
2. **System 32 Setback (ระยะหน้าเยื้องขอบ)**:
   - ตู้ดึงหน้าแคบ No. 15 (Kesseböhmer) ใช้ระยะเยื้องรูเจาะแรกจากขอบด้านในแผงตู้ข้าง **Dim A = 38.0 mm** ซึ่งแตกต่างจากตู้ดึงหน้าแคบแบรนด์ Häfele เองที่ใช้ระยะ **Dim A = 13.0 mm**
3. **Proprietary Runner Systems (รางเลื่อนเฉพาะตัว)**:
   - อุปกรณ์ Kesseböhmer ส่วนใหญ่ใช้ชุดรางเลื่อนเฉพาะของตัวเอง (Proprietary runners) ที่ออกแบบและบรรจุมาในชุดสำเร็จรูป ดังนั้นการสร้างโมเดลประกอบ CAD **ห้ามนำไปเชื่อมโยงกับระบบรางสำเร็จรูปอื่น (เช่น Blum Tandem) นอกเสียจากว่าเอกสารแสดงสเปกของรุ่นนั้นระบุอย่างชัดเจน**

---

## 3. Structural Limits (ข้อแนะนำภาระน้ำหนักและมิติตู้)

*หมายเหตุ: ค่าเหล่านี้คือข้อแนะนำจากผู้ผลิต (Manufacturer Guidelines) เพื่อความปลอดภัยโครงสร้างตู้ครัวและการรับประกันสินค้า ปัจจุบันไม่มีผลบังคับทางโค้ดใน MONOLITH*

| รุ่นระบบดึง | ขนาดตู้อ้างอิง (W) | ความลึกตู้ขั้นต่ำ (D) | ความสูงตู้ที่ต้องการ (H) | พิกัดรับน้ำหนักสูงสุด (Load) |
|---|---|---|---|---|
| **LeMans II** | 400, 450, 500, 600 mm | $\ge 500\text{ mm}$ | $\ge 600 - 1265\text{ mm}$ | **25 kg** ต่อถาดชั้นวาง |
| **Dispensa Larder** | 300, 400, 500, 600 mm | $\ge 500\text{ mm}$ | $1200 - 2300\text{ mm}$ | **100 kg** รวมบานและเฟรม |
| **Dispensa Junior III** | 300, 400, 450, 500, 600 mm | $\ge 480\text{ mm}$ | $\ge 615\text{ mm}$ | **40 kg** รวมบานและเฟรม |
| **No. 15 Pullout** | 150 mm | $\ge 481\text{ mm}$ | $\ge 542 - 592\text{ mm}$ | **12 kg** รวมบานและเฟรม |
