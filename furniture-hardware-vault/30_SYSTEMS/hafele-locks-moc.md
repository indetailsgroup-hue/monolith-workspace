---
note_type: system_moc
vendor: [hafele]
system: locking_system
truth_layer: draft
review_status: review_ready
tags: [moc, hafele, locking_system, symo, furniture_locks, drillmap]
---

# 🔑 Häfele — Locking Systems & Security (MOC)

Source: [[hafele-catalog-2021]] (เล่มหลัก Furniture Fittings: `blaetterkatalog (1).pdf`)

> [!NOTE]
> โน้ตกลุ่มนี้ครอบคลุมระบบกุญแจและระบบล็อคตู้เฟอร์นิเจอร์ (Locking Systems) แบรนด์ **Häfele** (ระบบ Symo 3000 และระบบกุญแจเสื้อทองเหลืองแบบฟิกซ์) ในลักษณะ **Baseline Coverage** สำหรับการออกแบบตู้และจัดตำแหน่งเจาะตู้ (drillMap) ซึ่งเป็นโครงสร้างใหม่ในระบบของ MONOLITH

---

## 1. System Categorization (การแบ่งหมวดหมู่ระบบกุญแจ)

ระบบกุญแจตู้เฟอร์นิเจอร์แบ่งออกเป็น 2 หมวดหลักตามโครงสร้างการทำงานและการประกอบ:

### 1.1 Häfele Symo 3000 (ระบบแกนถอดเปลี่ยนได้)
- เป็นระบบกุญแจแบบถอดเปลี่ยนไส้ (Cylinder Removable Core) โดยแยกสั่งตลับกุญแจ (Lock Case) และแกนกุญแจ (Cylinder Core) แยกชิ้นกัน
- **การติดตั้ง**: ติดตั้งตลับกุญแจเข้ากับตู้ล่วงหน้า จากนั้นจึงเสียบประกอบแกนกุญแจจากด้านหน้าตู้ได้โดยไม่ต้องใช้เครื่องมือช่วย
- **โน้ตย่อย**:
  - ตลับกุญแจ Symo (Rim, Mortice, Espagnolette): [[hafele-lock-symo-cases]]
  - แกนกุญแจและอุปกรณ์เสริม (Symo cores, keys, rosettes): [[hafele-lock-symo-cores]]
  - หมายเหตุ: กุญแจกระจก (Glass door plug-in lock `233.22.x`) ปัจจุบันบันทึกอยู่ในโน้ต [[hafele-lock-fixed-cylinder]] §6

### 1.2 Traditional Fixed Cylinder Locks (ระบบกุญแจเสื้อฟิกซ์)
- เป็นกุญแจเฟอร์นิเจอร์แบบดั้งเดิมที่ตลับกุญแจและแกนกุญแจ (เสื้อกุญแจ) ถูกประกอบติดกันมาเป็นชิ้นเดียวจากโรงงาน
- **การติดตั้ง**: ขันยึดสกรูและเจาะรูผ่านหน้าบานตู้เพื่อรับแกนหมุนกุญแจ
- **โน้ตย่อย**: [[hafele-lock-fixed-cylinder]]

---

## 2. Common Mounting & drillMap Guidelines (แนวทางรูเจาะร่วม)

*รายละเอียดพารามิเตอร์เครื่องจักร (CNC Boring) และข้อกำหนด CAD สำหรับแป้นรูเจาะ:*

1. **Cylinder Boring Diameter (ขนาดรูเจาะเสื้อกุญแจ)**:
   - ตลับกุญแจซีรีส์ **Symo 3000** ทั้งหมด ต้องการขนาดรูเจาะเสื้อกุญแจบนหน้าบาน/ลิ้นชักที่ขนาด **$\varnothing18\text{ mm}$**
   - กุญแจเสื้อฟิกซ์ทั่วไป มีขนาดเสื้อกุญแจแปรผันระหว่าง **$\varnothing18\text{ mm}$** และ **$\varnothing22\text{ mm}$** ขึ้นอยู่กับรุ่นและประเภทไส้ (เช่น ไส้พินจะใช้ Ø18 mm, ไส้เพลทปรับระดับบางรุ่นใช้ Ø22 mm)
2. **Backset D Spacing (ระยะเจาะห่างจากขอบบาน D)**:
   - ระยะเยื้องรูเจาะแกนกุญแจจากขอบหน้าบานตู้ปรับเปลี่ยนตามประเภทตลับกุญแจ:
     - กุญแจเดดโบลท์ (Deadbolt rim lock) และกุญแจลิ้นชักทั่วไป: **$D = 25\text{ mm}$**
     - กุญแจบานเลื่อนตู้กระจกและกุญแจมอร์ทิส (Sliding/Mortice lock): **$D = 22\text{ mm}$**
     - กุญแจตู้บานสไลด์/บานเลื่อนไม้ (Roller shutter rim lock): **$D = 24.5\text{ mm}$**
     - กุญแจฝังขอบบาน (Inlaid lock): **$D = 20\text{ mm}$**
     - กุญแจแบบปรับระยะได้ (Adjustable deadbolt): **$D = 15 - 40\text{ mm}$** (ปรับเพิ่มลดระยะทุกๆขั้นละ $5\text{ mm}$)

---

## 3. Structural Limits & Guidelines (ข้อแนะนำทางกายภาพ)

<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
### 3.1 Espagnolette Locking Rods (แกนกุญแจขวาสำหรับตู้สูง)
- กุญแจสำหรับตู้บานสูงแบบก้านล็อค (Espagnolette rod lock) ทำงานร่วมกับแกนโปรไฟล์เหล็กแบนขนาด $10 \times 3\text{ mm}$ ที่ต้องเดินสายแกนเหล็กพร้อมชุดประคองแกน (Bar guides) ยึดติดหลังบานตู้
- การติดตั้งต้องการระยะประกอบและคลิปประคองที่ตำแหน่งรูเจาะเฉพาะ

### 3.2 Glass Door Locks (กุญแจกระจก)
- ตลับกุญแจบานกระจก Symo ออกแบบมาสำหรับกระจกแบบไม่ต้องเจาะรูบานกระจก (ใช้การหนีบยึดด้วยแผ่นยางประคองและสกรูบีบจับที่ด้านหลัง)
- ⚠️ **needs_verify — ช่วงความหนากระจกขัดกันในเอกสาร:** MOC ฉบับร่างเคยระบุ 4–10 mm แต่โน้ต [[hafele-lock-fixed-cylinder]] §6 ระบุ 5–7 mm → ต้องเปิดแคตตาล็อกหน้า p.710 ยืนยันช่วงที่ถูกต้องก่อนใช้
<!-- manufacturer guideline (ยังไม่ wired เข้า MONOLITH) -->
