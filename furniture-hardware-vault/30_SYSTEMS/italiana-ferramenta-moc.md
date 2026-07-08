---
note_type: system_moc
vendor: [italiana_ferramenta]
system: connector
truth_layer: draft
review_status: review_ready
tags: [moc, italiana_ferramenta, drillmap]
---

# 🇮🇹 Italiana Ferramenta — Hardware Systems (MOC)

Source: [[italiana-ferramenta-specs]]

> [!NOTE]
> โน้ตกลุ่มนี้ครอบคลุมสินค้าจากผู้ผลิต **Italiana Ferramenta** ประเทศอิตาลี ซึ่งเน้นอุปกรณ์ฟิตติ้งข้อต่อตู้ (Connectors), ขาปรับระดับคุณภาพสูง (Levellers) และตัวรับชั้นบอร์ด (Shelf Supports) เพื่อสร้างฐานข้อมูลแบบแปลนรูเจาะ CNC (drillMap) ในระบบ MONOLITH

---

## 1. System Categorization (การแบ่งหมวดหมู่ฟิตติ้ง)

ระบบฟิตติ้งย่อยของ Italiana Ferramenta แบ่งออกเป็น 3 กลุ่มหลักตามประเภทงาน:

### 1.1 ขาปรับระดับตู้หนัก (Levellers)
* อุปกรณ์ขาปรับระดับสำหรับตู้และตู้เสื้อผ้าขนาดใหญ่ที่มีช่องสำหรับหมุนปรับระดับด้วยกุญแจหกเหลี่ยม (Allen key) จากภายในตู้
* **โน้ตย่อย**: [[italiana-ferramenta-leveller-integrato]]

### 1.2 ตัวต่อแผงไม้และข้อต่อตู้ (Connectors / Fasteners)
* ชุดอุปกรณ์เชื่อมต่อโครงตู้ แคมล็อค เดือยเหล็ก และพุกฝังเกลียวรับแรงดึง
* **โน้ตย่อย**:
  * ตัวต่อแคมล็อคและเดือยกลม: [[italiana-ferramenta-connector-cams-dowels]]
  * กระบอกข้อต่อและน็อตยึดขวาง: [[italiana-ferramenta-connector-cross-dowels]]
  * พุกฝังเกลียวในเนื้อไม้ (Insert nuts): [[italiana-ferramenta-connector-insert-nuts]]

### 1.3 ตัวรับชั้นบอร์ดไม้/กระจก (Shelf Supports)
* ตัวรับน้ำหนักชั้นในตู้ ทั้งแบบธรรมดาและแบบล็อคหัวรับเพื่อความปลอดภัยในการขนย้าย
* **โน้ตย่อย**: [[italiana-ferramenta-shelf-support-entry-level]]

---

## 2. Common Mounting & drillMap Guidelines (แนวทางรูเจาะร่วม)

*รายละเอียดพารามิเตอร์การเจาะ (CNC Boring) สำหรับวางตำแหน่งออกแบบใน MONOLITH:*

1. **ขาปรับระดับตู้ (Integrato Tech Levellers)**:
   * **รูเจาะพื้นตู้ตัวหลัก (Main boring Ø):** ต้องการการเจาะคว้านขนาด **$\varnothing31\text{ mm}$** ลึกอย่างน้อย $20\text{ mm}$ หรือเจาะทะลุขึ้นอยู่กับรุ่น
   * **รูเจาะปรับระดับด้านใน (Adjustment access Ø):** รูร้อยไขควงหกเหลี่ยมเพื่อปรับระดับบนแผงบอร์ดพื้นตู้ มี 2 ขนาด:
     * รูเจาะ **$\varnothing6\text{ mm}$** สำหรับกุญแจหกเหลี่ยม S4
     * รูเจาะ **$\varnothing8\text{ mm}$** สำหรับกุญแจหกเหลี่ยม S6
2. **ตัวต่อแคมและกระบอกขวาง (Cams & Cross Dowels)**:
   * **รูเจาะแป้นถ้วยแคม (Cam boring Ø):** เจาะผิวบอร์ดไม้ขนาด **$\varnothing15\text{ mm}$** หรือ **$\varnothing25\text{ mm}$** (ลึก 12.4 mm หรือ 13.4 mm)
   * **รูเจาะกระบอก Cross Dowel (Barrel boring Ø):** ต้องการการเจาะแผงบอร์ดบานข้างขนาด **$\varnothing10\text{ mm}$**, **$\varnothing14\text{ mm}$** หรือ **$\varnothing16\text{ mm}$** ปรับตามขนาดรับแรงดึง
3. **พุกเกลียว (Insert Nuts)**:
   * รูนำเจาะพุกฝังเกลียว M6 หรือ M8 เพื่อขันอัดพุกหรือพุกขยาย (Spreading) มีขนาด **$\varnothing5\text{ mm}$**, **$\varnothing8\text{ mm}$** หรือ **$\varnothing10\text{ mm}$** ตามรุ่นความหนา
4. **ตัวรับชั้นมาตรฐาน (Shelf Supports)**:
   * ตัวนำเจาะแกนเสียบ (Shelf pin boring Ø) ต้องการความกว้างรูมาตรฐาน **$\varnothing5\text{ mm}$** ความลึก 8–11.5 mm
