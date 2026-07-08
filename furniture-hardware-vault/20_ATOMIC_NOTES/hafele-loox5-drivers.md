---
note_type: product
vendor: hafele
system: lighting
truth_layer: draft
review_status: review_ready
source_refs: ["blaetterkatalog (2).pdf:p.1176-1184 (MB 2.309-2.314)"]
sku: ["833.74.665", "833.74.666", "833.74.667", "833.74.636", "833.77.972", "833.77.973", "833.77.974", "833.77.975"]
# หมายเหตุ: label→SKU (12V/24V × วัตต์) อยู่ในตาราง body
specs:
  voltage_constant_v: [12, 24]
  flat_height_mm: 16
  heavy_duty_height_mm: 38
  lifetime_hours: 50000
  standby_power_w: [0.08, 0.42]
conflicts: []
needs_verify: []
tags: [hafele, lighting, loox, loox5, driver, power-supply, cabinet-hardware]
last_verified_at: null
is_stale: false
---

# Häfele Loox5 — Constant Voltage Drivers (แหล่งจ่ายไฟและระบบแปลงไฟ)

ระบบแหล่งจ่ายไฟและแปลงแรงดันไฟฟ้าคงที่ (Constant Voltage Drivers) ของ **Häfele Loox5** ทำหน้าที่แปลงไฟบ้าน (100–240 V AC หรือ 220–240 V AC) เป็นไฟกระแสตรง (DC) ขนาด **12 V DC** หรือ **24 V DC** เพื่อขับเคลื่อนโคมไฟ สวิตช์ และอุปกรณ์ชาร์จในตู้เฟอร์นิเจอร์

---

## 1. Technical Specifications (รายละเอียดทางเทคนิค)

### 1.1 Flat Constant Voltage Drivers (รุ่นบางพิเศษ 16 มม.)
*รุ่นมาตรฐานออกแบบมาให้มีขนาดบางพิเศษเพียง 16 มม. เพื่อซ่อนตัวอยู่หลังแผงบอร์ด ขอบตู้ หรือในพื้นที่ช่องแคบได้ง่าย*
- **ความสูงตัวเครื่อง (Flat Height)**: **16.0 mm** (ความกว้าง/ความยาวแปรผันตามกำลังวัตต์)
- **อายุการใช้งาน (Lifetime)**: **> 50,000 hours** (อายุการใช้งานจะเพิ่มขึ้นเป็น 2 เท่าหากใช้อุณหภูมิสิ่งแวดล้อมแวดล้อม < 30°C)
- **ระบบป้องกัน (Protection)**: มีระบบป้องกันการโหลดกระแสไฟล้น (Overload protection)
- **การเชื่อมต่อด้านออก (Output Connections)**: 1 x ช่องต่อ socket ระบบปลั๊ก Loox5 2-pin (แบบ Box-to-Box)

### 1.2 Heavy Duty Driver (รุ่นกำลังวัตต์สูง)
*สำหรับการติดตั้งระบบไฟขนาดใหญ่ โหลดไฟสูง*
- **รุ่น 240 W (2 x 120 W)**: ใช้ความสูง **38.0 mm** (พาร์ต `833.77.975`) มีช่องต่อ Socket สองฝั่งแยกจุดโหลดละ 120 W สูงสุด

---

## 2. Product Range & SKU Mappings

### 2.1 Drivers 12 V DC System
- **12 V DC Flat Drivers (16 mm Height)**:
  - **20 W**: Standby `0.08 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `140 x 50 x 16 mm` · พาร์ต `833.74.665` (220–240 V AC)
  - **40 W**: Standby `0.12 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `191 x 60 x 16 mm` · พาร์ต `833.74.666` (100–240 V AC)
  - **60 W**: Standby `0.14 W` · อุณหภูมิใช้งาน `-25°C ถึง 40°C` · ขนาด `230 x 70 x 16 mm` · พาร์ต `833.74.667` (100–240 V AC)
- **12 V DC Wall Plug Driver (72 mm Height)**:
  - **27 W**: Standby `0.45 W` · อุณหภูมิใช้งาน `-10°C ถึง 40°C` · ขนาด `84 x 50 x 72 mm` · พาร์ต `833.74.636` · อายุการใช้งาน `30,000 hours` (มาพร้อมสายสั้น 0.1 ม.)

### 2.2 Drivers 24 V DC System
- **24 V DC Flat Drivers (16 mm Height)**:
  - **20 W**: Standby `0.10 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `140 x 50 x 16 mm` · พาร์ต `833.77.972` (220–240 V AC)
  - **40 W**: Standby `0.15 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `191 x 60 x 16 mm` · พาร์ต `833.77.973` (100–240 V AC)
  - **90 W**: Standby `0.21 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `316 x 70 x 16 mm` · พาร์ต `833.77.974` (100–240 V AC)
- **24 V DC Heavy Duty Driver (38 mm Height)**:
  - **240 W (2 x 120 W)**: Standby `0.42 W` · อุณหภูมิใช้งาน `-25°C ถึง 45°C` · ขนาด `234 x 75 x 38 mm` · พาร์ต `833.77.975` (220–240 V AC)

---

## 3. Installation & CAD/drillMap Guidelines (คำแนะนำสำหรับการเจาะและติดตั้ง)
- **ตารางการเตรียมช่องระบายอากาศ (Air Supply & Circulation)**:
  - ไดรเวอร์มีความร้อนสะสมขณะทำงาน ต้องเตรียมช่องอากาศรอบตัวเครื่องและช่องตรวจสอบเพื่อซ่อมบำรุง (Provide inspection opening)
  - ระยะเผื่อรอบตัวบอร์ดขณะยึดสกรูผ่านหูยึดพลาสติกทั้งสองฝั่ง (For screw fixing)
- **ข้อจำกัดสายเชื่อมต่อ (Maximum Cable Length)**:
  - **สูงสุด 10.0 m**: ระยะสายไฟนำส่งจากตัวไดรเวอร์ไปยังสวิตช์หรือโหลดโคมไฟปลายทางเพื่อป้องกันปัญหาแรงดันไฟตก (Voltage drop) ในสายที่ทำให้ไฟหรี่ลงผิดปกติ
- **ความสัมพันธ์กับ MONOLITH**:
  - `related_monolith`: *drillMap candidate ในอนาคต* (ใช้ตรวจสอบขนาดช่องซ่อนกล่องและตำแหน่งรูยึดสกรูบอร์ด)
