---
note_type: system_moc
vendor: [hafele]
system: wardrobe_system
truth_layer: draft
review_status: review_ready
tags: [moc, hafele, wardrobe_system, dresscode, wardrobe_lifts, wardrobe_rails, drillmap]
---

# 👔 Häfele — Wardrobe Fittings & Equipment (MOC)

Source: [[hafele-catalog-2021]] (เล่มหลัก Furniture Fittings: `blaetterkatalog (1).pdf`)

> [!NOTE]
> โน้ตกลุ่มนี้ครอบคลุมระบบอุปกรณ์จัดระเบียบตู้เสื้อผ้า ราวแขวนผ้า และระบบลิฟต์ยกราวแขวนเสื้อผ้าแบรนด์ **Häfele** ในลักษณะ **Baseline Coverage** สำหรับการออกแบบและเตรียมจัดตำแหน่งรูเจาะ (drillMap) ซึ่งเป็นโครงสร้างใหม่ (ยังไม่มีการเชื่อมต่อเข้ากับซอร์สโค้ดหลักของ MONOLITH)

---

## 1. System Categorization (การแบ่งหมวดหมู่ระบบจัดระเบียบตู้เสื้อผ้า)

ระบบอุปกรณ์ตู้เสื้อผ้าแบ่งออกเป็น 3 ซีรีส์หลักตามลักษณะการใช้งานและการเจาะประกอบ:

### 1.1 Häfele Dresscode Cabinet Organizer System
- ระบบจัดระเบียบโมดูลาร์โครงเฟรมอะลูมิเนียม ประกอบด้วยถาดดึงออก, ตะแกรงผ้า, และที่แขวนกางเกง
- **จุดเด่น**: ติดตั้งง่ายโดยใช้ปลั๊กเสียบแบบไม่ต้องใช้เครื่องมือ (Toolless Plugin Connectors) เสียบเข้ากับรูเจาะระบบ System 32 ของแผงตู้
- **ลิงก์อ้างอิง**: [[hafele-wardrobe-dresscode]]

### 1.2 Wardrobe Lifts (ลิฟต์ยกราวแขวนเสื้อผ้า)
- ระบบราวแขวนที่ยกขึ้น-ลงได้เพื่อใช้พื้นที่ส่วนสูงของตู้ มีทั้งรุ่นควบคุมด้วยไฟฟ้าและโช้คอัพดึงด้วยมือ
- **รุ่นหลัก**: Electric, Professional, Super, Super Pro, Only, และ Wall-mounted
- **จุดเจาะสำคัญ**: ยึดติดกับแผงข้างโดยจับระยะห่างของแถวเจาะตามแนวระดับที่ **450 mm** หรือ **480 mm**
- **ลิงก์อ้างอิง**: [[hafele-wardrobe-lifts]]

### 1.3 Wardrobe Rails & Accessories (ราวแขวนและแป้นรับราว)
- ราวแขวนผ้ารูปทรง OVA ขนาด $30 \times 15\text{ mm}$ และแป้นรับราวแบบต่างๆ
- **จุดเจาะสำคัญ**: แป้นรับราวเจาะยึดเข้าระบบ System 32 โดยมีบางรุ่นมีเดือยประคองขนาด $5\text{ mm}$ และสามารถเดินสายไฟสำหรับโคมไฟ LED ของระบบ Loox ได้
- **ลิงก์อ้างอิง**: [[hafele-wardrobe-rails]]

---

## 2. Common Mounting & drillMap Guidelines (แนวทางรูเจาะร่วม)

*รายละเอียดพารามิเตอร์เครื่องจักร (CNC Boring) และข้อกำหนด CAD:*

1. **System 32 Integration (การเชื่อมโยงรูเจาะ)**:
   - รูเจาะสำหรับปลั๊กเสียบ Dresscode, ราวแขวน, และลิฟต์ยกบาน ใช้รูเจาะมาตรฐานขนาด $\varnothing5\text{ mm}$ ระยะกริต $32\text{ mm}$
2. **Horizontal Row Spacing for Lifts (ระยะเจาะห่างแนวนอนของลิฟต์)**:
   - ลิฟต์ยกราวแขวนต้องการระยะห่างระหว่างแถวเจาะแนวตั้งในแนวนอน (Horizontal spacing between vertical hole lines) ที่ **450 mm** หรือ **480 mm** เพื่อติดตั้งฐานยึดให้แข็งแรงและสมดุล
3. **OVA Rail Supports (จุดรับราวแขวน)**:
   - แป้นรับราวแบบตรงขอบเหลี่ยม เจาะยึดเข้าระบบ System 32 ด้วยระยะห่างของรูยึดคู่แนวดิ่ง $32\text{ mm}$ พร้อมช่องเดินสายไฟสำหรับระบบไฟ Loox ผ่านแป้นรับและราวแขวนที่เจาะรูผ่านแกนกลาง

---

## 3. Structural Limits & Dimensions (ข้อแนะนำภาระน้ำหนักและการคำนวณ)

<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
### 3.1 Dresscode Width Formula (สูตรความกว้างเฟรม Dresscode)
- ความกว้างของโครงเฟรมอะลูมิเนียมดึงออก ($B$) ต้องเผื่อระยะตัวหนุน (Spacer bar) สำหรับหลบบานพับหรือบานเลื่อน โดยคำนวณดังนี้:
  $$B = \text{Internal Cabinet Width} - 42\text{ mm (ใช้ Spacer Bar สองข้างข้างละ 21 mm)}$$
  (โดยทั่วไปความหนาตัวหนุนแปรผันได้ระหว่าง $21\text{ mm}$ และ $42\text{ mm}$ ต่อข้าง)
- ความลึกตู้ขั้นต่ำที่ต้องการ: 
  - โครงเฟรมดึงออก: $\ge 540\text{ mm}$
  - ราวแขวนกางเกง: $\ge 520\text{ mm}$
  - ถาดดึงออกอเนกประสงค์: $\ge 500\text{ mm}$

### 3.2 Load Capacities (พิกัดการรับน้ำหนัก)
- **Dresscode Pull-out components**: รับน้ำหนักปลอดภัยสูงสุด **30 kg**
- **Wardrobe Lifts (พิกัดรับน้ำหนักสูงสุด)**:
  - รุ่น Electric: **17 kg**
  - รุ่น Super Pro: **18 kg**
  - รุ่น Professional: **15 kg**
  - รุ่น Super: **12.5 kg**
  - รุ่น Only: **12 kg**
  - รุ่น Wall-mounted: **10 kg**
<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
