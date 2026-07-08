---
note_type: validation_checklist
target_note:
  - "blum-runner-movento-760h"
  - "blum-runner-movento-766h"
  - "blum-runner-movento-760h-base"
  - "blum-runner-tandem-560h"
  - "blum-runner-tandem-550h"
  - "blum-runner-tandem-561h"
  - "blum-runner-tandem-551h"
  - "blum-runner-tandem-560f"
  - "blum-runner-tandem-550f"
  - "blum-runner-tandem-561f"
  - "blum-runner-tandem-551f"
  - "blum-runner-locking-device"
  - "blum-runner-depth-adjuster"
  - "blum-runner-fixing-bracket"
  - "blum-runner-side-stabilisation"
  - "blum-runner-shelf-lock"
  - "blum-runner-screws"
  - "blum-runner-tip-on-unit"
review_roles: [hardware_engineer, production]
truth_layer: draft
review_status: unreviewed
tags: [validation, blum, runner, undermount]
---

# Validation: Blum Runner Systems Specs

รับรองและตรวจสอบความถูกต้องของสเปกรางลิ้นชักซ่อนใต้ Blum (MOVENTO / TANDEM) ก่อนนำไปใช้ในงานผลิตจริงและแก้ไขค่าในระบบคำนวณของ MONOLITH

## 📋 เกณฑ์รับรองมาตรฐาน (Checklist)
- [ ] ความลึกใช้งานจริง (Nominal Length - NL) และรหัสสินค้า (SKU) ตรงกับแคตตาล็อก
- [ ] ระยะเจาะยึดแผงตู้ด้านหน้า (First-hole 37mm จากขอบหน้า) ยืนยันตำแหน่งเจาะรางลิ้นชัก
- [ ] อุปกรณ์ประกอบตัวล็อค (Locking Device) ระบุรหัสข้างซ้าย/ขวาครบถ้วน
- [ ] วิศวกรฮาร์ดแวร์ตรวจสอบและรับรอง → เลื่อนสถานะเป็น `verified`

## 🔴 CONFLICT ประเด็นขัดแย้งที่ต้องแก้ไขในโค้ด (Critical Codebase Discrepancies)
> [!CAUTION]
> **ห้ามผลิตลิ้นชักซ่อนใต้ด้วยสูตรคำนวณเดิมในระบบเด็ดขาด หากยังไม่มีการปรับปรุงค่า clearances**

1. **ประเด็นระยะเจาะหักข้าง (Side Gap Clearance):**
   - **ในโค้ด MONOLITH ปัจจุบัน:**
     - `Production.ts` (L306): กำหนด `SIDE_GAP: 20.5` mm ต่อข้าง (ลบความกว้างกล่องทั้งหมด `41 mm`)
     - `drawerRules.ts` (L246): `undermountClearance = 41` mm
   - **ในแคตตาล็อก Blum จริง:**
     - ราง 16mm (MOVENTO & TANDEM 16): สูตรหาความกว้างด้านในลิ้นชักคือ `SKW = LW - 42`
       - หากใช้ไม้ข้างหนา 16 mm ความกว้างกล่องภายนอกคือ `SKW + 32 = LW - 10 mm` (ลบออกเพียง `10 mm` หรือ `5 mm` ต่อข้าง)
       - หากใช้ไม้ข้างหนา 15 mm ความกว้างกล่องภายนอกคือ `SKW + 30 = LW - 12 mm` (ลบออกเพียง `12 mm` หรือ `6 mm` ต่อข้าง)
     - ราง 19mm (TANDEM 19): สูตรหาความกว้างด้านในลิ้นชักคือ `SKW = LW - 49`
       - หากใช้ไม้ข้างหนา 18 mm ความกว้างกล่องภายนอกคือ `SKW + 36 = LW - 13 mm` (ลบออกเพียง `13 mm` หรือ `6.5 mm` ต่อข้าง)
   - **ผลกระทบ:** ค่า `SIDE_GAP: 20.5` ของ MONOLITH ทำให้กล่องลิ้นชัก **แคบเกินไป 29–31 mm** ส่งผลให้ลิ้นชักหลุดจากราง ไม่สามารถเกาะกิ๊บล็อคได้
   - **ข้อแนะนำ:** ต้องปรับโครงสร้างสูตรคำนวณใน `drawerCalculations.ts` ให้คำนวณจากความหนาของไม้ข้างลิ้นชัก (`sideThickness`) แทนการลบค่าคงที่สำเร็จรูป

2. **ตำแหน่งเจาะรูนำยึดรางตัวล่าง (Vertical Offset Y):**
   - **ในโค้ด MONOLITH ปัจจุบัน:**
     - `Production.ts` (L307): `SLIDE_OFFSET_Y: 37` mm
   - **ในแคตตาล็อก Blum จริง:**
     - ตารางการเจาะติดตั้งของ MOVENTO และ TANDEM ระบุตำแหน่งแตกต่างกันขึ้นอยู่กับหน้าบานและลักษณะติดตั้ง
     - ต้องสืบหาที่มาของค่า `37 mm` ว่าอ้างอิงจากตำแหน่งความกว้างในการเฉือนขอบล่างของลิ้นชัก (Bottom recess) หรือไม่

---

## 📝 บันทึกผลการตรวจสอบ (Audit Log)
<!-- บันทึกการแก้ไข หรือความเห็นเพิ่มเติมหลังจากวิศวกรตรวจสอบแล้ว -->
