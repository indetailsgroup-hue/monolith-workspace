# Requirements Document

## Introduction

เป้าหมายของฟีเจอร์นี้คือการเปลี่ยนกองไฟล์ Excel ของระบบงาน DAPH Decor (ในโฟลเดอร์ `New folder`)
ให้กลายเป็น **Obsidian Second Brain** ที่ค้นหา เชื่อมโยง และต่อยอดความรู้ได้
โดยยังคงรักษาไฟล์ Excel ต้นฉบับไว้ใช้งานตามปกติ

ระบบงานเดิมเป็นเอกสารบริหารคุณภาพ (QMS) 5 กลุ่ม ได้แก่ SOS, JES, PFMEA, Process Control Plan
และแบบฟอร์มปฏิบัติงาน (Templates) ครอบคลุม flow งาน:
Sale → Designer → Area Measurement → 3D Perspective → Production Planning → Main Process → Installation

ขอบเขตของฟีเจอร์นี้คือ **การจัดโครงสร้าง vault + สร้างชั้นความรู้แบบ Markdown** ครอบทับไฟล์เดิม
ไม่ใช่การแก้ไขเนื้อหาภายในไฟล์ Excel

## Glossary

- **SOS** (Standard of Service/Operation Sheet): เอกสารมาตรฐานการทำงาน
- **JES** (Job Element Sheet): รายละเอียดขั้นตอนงานย่อย
- **PFMEA** (Process Failure Mode and Effects Analysis): การวิเคราะห์ความเสี่ยงของกระบวนการ
- **Control Plan** (Process Control Plan): แผนควบคุมคุณภาพแต่ละจุด
- **RPN** (Risk Priority Number): ค่าลำดับความสำคัญของความเสี่ยงใน PFMEA
- **MOC** (Map of Content): โน้ตที่เป็นสารบัญ/ประตูเข้าถึงโน้ตอื่น
- **Vault**: คลังเก็บโน้ตทั้งหมดของ Obsidian
- **Junk file**: ไฟล์ชั่วคราว/ไม่จำเป็นที่ควรถูกแยกออกเพื่อลบ

## Requirements

### Requirement 1: จัดโครงสร้าง Vault และจัดระเบียบไฟล์

**User Story:** ในฐานะเจ้าของระบบงาน DAPH ฉันต้องการให้ไฟล์ทั้งหมดถูกจัดเข้าโครงสร้างโฟลเดอร์ที่ชัดเจน
เพื่อที่ฉันจะหาเอกสารแต่ละแผนกได้รวดเร็วและไม่สับสนกับไฟล์ซ้ำ

#### Acceptance Criteria

1. WHEN สร้าง vault THEN ระบบ SHALL สร้างโครงสร้างโฟลเดอร์มาตรฐาน (Inbox, Dashboard, Departments, QMS, Templates, Projects, Attachments)
2. WHEN จัดไฟล์ Excel THEN ระบบ SHALL คัดลอกไฟล์ต้นฉบับเข้ามาไว้ใน `99_Attachments/` (ภายในเวิร์กสเปซ) โดยจัดกลุ่มตามประเภทเอกสาร (SOS, JES, PFMEA, Control Plan, Templates) และคงไฟล์ต้นฉบับเดิมไว้ไม่แก้ไข
3. WHEN พบไฟล์ฉบับร่าง/ฉบับซ้ำ (เช่น `Draft`, `(1)`, `Revise 1`) THEN ระบบ SHALL คงไฟล์ฉบับล่าสุดเป็นหลัก และทำเครื่องหมายฉบับอื่นไว้ในโฟลเดอร์ย่อย `_archive/`
4. WHEN พบไฟล์ชั่วคราว THEN ระบบ SHALL ถือว่าเป็นไฟล์ขยะ (junk) ทั้งหมดโดยไม่ขึ้นกับรูปแบบการตั้งชื่อ — ครอบคลุมไฟล์ที่ลงท้ายด้วย `.tmp`, `.temp` หรือขึ้นต้นด้วย `~$` — และ SHALL แยกออกจาก vault ไปยังรายการสำหรับลบ
5. IF ชื่อไฟล์มีอักขระที่ไม่เหมาะกับการลิงก์ (comma, ช่องว่างซ้ำ) THEN ระบบ SHALL เสนอชื่อมาตรฐานใหม่โดยไม่ลบของเดิมจนกว่าผู้ใช้ยืนยัน

### Requirement 2: Markdown Index / MOC ต่อหนึ่งเอกสาร

**User Story:** ในฐานะผู้ใช้ ฉันต้องการโน้ต Markdown สรุปของแต่ละเอกสาร
เพื่อให้ค้นหา เชื่อมโยง (backlink) และเข้าใจบริบทได้โดยไม่ต้องเปิด Excel ทุกครั้ง

#### Acceptance Criteria

1. WHEN มีไฟล์ Excel หนึ่งไฟล์ THEN ระบบ SHALL สร้างโน้ต Markdown หนึ่งไฟล์ที่สรุป: ชื่อเอกสาร, ประเภท, แผนกที่เกี่ยวข้อง, วัตถุประสงค์, ผู้รับผิดชอบ
2. WHEN สร้างโน้ต Markdown THEN ระบบ SHALL ฝังลิงก์ไปยังไฟล์ Excel ต้นฉบับใน `99_Attachments/`
3. WHEN โน้ตเกี่ยวข้องกับแผนกหรือเอกสารอื่น THEN ระบบ SHALL ใส่ internal link `[[...]]` เพื่อสร้าง backlink

### Requirement 3: Home Dashboard (MOC หลัก)

**User Story:** ในฐานะผู้ใช้ ฉันต้องการหน้าแรกที่เห็น flow งานทั้งหมด
เพื่อเป็นประตูเข้าถึงทุกแผนกและเอกสารได้ในที่เดียว

#### Acceptance Criteria

1. WHEN เปิด vault THEN ระบบ SHALL มีไฟล์ `01_Dashboard/Home.md` เป็นจุดเริ่มต้น
2. WHEN ดู Home THEN ระบบ SHALL แสดงลิงก์ไปแต่ละแผนกเรียงตาม flow งาน
3. WHEN ดู Home THEN ระบบ SHALL แสดง process flow diagram ของขั้นตอนงาน (Mermaid)

### Requirement 4: ระบบ Tag และการค้นหา

**User Story:** ในฐานะผู้ใช้ ฉันต้องการระบบแท็กที่สม่ำเสมอ
เพื่อกรองเอกสารตามแผนก ประเภท และสถานะได้

#### Acceptance Criteria

1. WHEN สร้างโน้ต THEN ระบบ SHALL กำหนดแท็กมาตรฐาน เช่น `#แผนก/sale`, `#เอกสาร/pfmea`, `#สถานะ/final`
2. WHEN ผู้ใช้ค้นด้วยแท็ก THEN ระบบ SHALL คืนเฉพาะโน้ตที่ตรงกับแท็กนั้น

### Requirement 5: Templates และ Glossary

**User Story:** ในฐานะผู้ใช้ ฉันต้องการเทมเพลตเปิดงานใหม่และคำอธิบายคำย่อ
เพื่อเริ่มงานลูกค้าใหม่ได้เร็วและให้ทุกคนเข้าใจตรงกัน

#### Acceptance Criteria

1. WHEN เปิดงานลูกค้าใหม่ THEN ระบบ SHALL มี project template ใน `04_Templates/`
2. WHEN พบคำย่อ (SOS, JES, PFMEA, RPN) THEN ระบบ SHALL มี glossary อธิบายความหมาย
