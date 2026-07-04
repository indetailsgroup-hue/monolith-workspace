# Requirements Document

## Introduction

เอกสารนี้กำหนดความต้องการ (requirements) สำหรับการ "ยืนยันการแยกทิศทาง" ระหว่างสองโครงการที่ไม่เกี่ยวข้องกัน คือ MONOLITH และ TCCK โดยตัดสินใจว่าจะ **ไม่** ดำเนินการตามแนวคิดแพลตฟอร์ม SaaS ร่วม (shared SaaS platform) อีกต่อไป

บริบทเดิม: เคยมีชุดเอกสารวางแผนชื่อ "TCCK Monolith shared SaaS architecture" ที่เสนอให้ทั้ง MONOLITH และ TCCK ใช้ฐานร่วมเดียวกัน (shared auth, billing, gate/evidence model, shared component library) ในรูปแบบ "Dual Vertical Kernels on ONE Shared SaaS Platform"

ข้อเท็จจริงสำคัญ: ชุดเอกสารดังกล่าวเป็น **เอกสารวางแผนเท่านั้น** สถานะ canonical promoted = 0 กล่าวคือ **ไม่เคยมีการเขียนโค้ดแพลตฟอร์มร่วมเกิดขึ้นจริงเลย** ไม่มี shared runtime, shared database, shared deployment หรือการ import ซอร์สโค้ดข้ามโครงการอยู่ในปัจจุบัน

การตัดสินใจ: ผู้ใช้ตัดสินใจ **ไม่ดำเนินการ** ตามแนวคิดแพลตฟอร์มร่วม เนื่องจากทั้งสองโดเมนต่างกันโดยสิ้นเชิงและแทบไม่มี business logic ที่ใช้ร่วมกัน ส่วนที่เคยถูกมองว่า "ใช้ร่วมกันได้" (auth, billing, component library) ล้วนเป็นโครงสร้างพื้นฐานทั่วไป (generic infrastructure) ที่ควรใช้ไลบรารีสำเร็จรูป (เช่น Auth0/Supabase Auth, Stripe, shadcn/ui) มากกว่าการสร้างแพลตฟอร์มร่วมขึ้นมาเอง

ขอบเขตของฟีเจอร์นี้ (ที่เบาและสมเหตุสมผลกับงานจริง): บันทึกการตัดสินใจ จัดเก็บชุดเอกสารวางแผนเดิมเข้าคลังถาวร (archive) โดยไม่ลบทิ้ง ทำให้แต่ละโครงการมีที่จัดเก็บเอกสารวางแผนของตัวเองโดยไม่มีการอ้างอิงข้ามกัน บันทึกการตัดสินใจลงในบันทึกการตัดสินใจถาวรของทั้งสองโครงการ และยืนยันแบบเบา ๆ ว่าปัจจุบันไม่มีการผูกพันข้ามโครงการ (cross-project coupling)

หมายเหตุขอบเขต: เนื่องจากทั้งสองโครงการไม่เคยถูกผูกเข้าด้วยกันจริง งานนี้จึงเป็นงานด้านการบันทึกการตัดสินใจและการจัดระเบียบเอกสาร ไม่ใช่การแยกระบบที่พันกันอยู่ จึงไม่จำเป็นต้องมีกลไกหนัก เช่น เครื่องมือจัดประเภทขอบเขตอัตโนมัติ ตัวตรวจสอบการพึ่งพาแบบสแกน 100% หรือ state machine ติดตามการแยก

## Glossary

- **MONOLITH**: ระบบออกแบบ/ผลิตแบบ parametric สำหรับตู้ครัวและเฟอร์นิเจอร์ built-in เขียนด้วย TypeScript (ซอร์สโค้ดประมาณ 1,166 ไฟล์ ไฟล์ทดสอบ 149 ไฟล์) ตั้งอยู่ที่ `c:\Users\thai3\OneDrive\Documents\MONOLITH\determined-williams (3)\determined-williams (2)\determined-williams`
- **TCCK**: Thai Curry Cloud Kitchen (แบรนด์ "โคตรไทย-KOTHAI") ธุรกิจ cloud-kitchen/food ERP พร้อมระบบแฟรนไชส์ แอปหลัก "cp06-clean-cowork" (React 19 + Vite 6 + Supabase + Playwright) ตั้งอยู่ที่ `C:\Users\thai3\TCCK-All-Projects-Backup`
- **Shared_Docset**: ชุดเอกสารวางแผน "TCCK Monolith shared SaaS architecture" ตั้งอยู่ที่ `C:\Users\thai3\TCCK-All-Projects-Backup\TCCK  Monolith shared SaaS architecture` สถานะปัจจุบันเป็นเอกสารวางแผนเท่านั้น (canonical promoted = 0)
- **Decision_Record**: บันทึกการตัดสินใจที่ระบุว่าจะไม่ดำเนินการตามแนวคิดแพลตฟอร์ม SaaS ร่วม พร้อมเหตุผลและวันที่
- **Decision_Log**: ไฟล์บันทึกการตัดสินใจแบบ append-only ของแต่ละโครงการ (TCCK มี `DECISIONS.md` อยู่แล้ว ส่วน MONOLITH ใช้ `.claude/decisions.md`)
- **Archive_Location**: ที่จัดเก็บถาวรสำหรับ Shared_Docset เดิม ที่เก็บเนื้อหาและประวัติไว้ครบโดยไม่ลบทิ้ง
- **Cross_Project_Coupling**: การพึ่งพาข้ามโครงการ ได้แก่ shared runtime, shared database, shared deployment หรือการ import ซอร์สโค้ดข้ามโครงการโดยตรง ระหว่าง MONOLITH กับ TCCK
- **Separation_Plan**: เอกสารสรุปผลการแยกทิศทางที่บันทึกการตัดสินใจ การจัดเก็บเอกสารเข้าคลัง และผลการยืนยันความเป็นอิสระของทั้งสองโครงการ

## Requirements

### Requirement 1: บันทึกการตัดสินใจไม่ดำเนินการแพลตฟอร์มร่วม

**User Story:** ในฐานะเจ้าของโครงการ ฉันต้องการบันทึกการตัดสินใจว่าจะไม่ใช้แพลตฟอร์ม SaaS ร่วมกัน เพื่อให้ทิศทางของทั้งสองโครงการชัดเจนและไม่มีการกลับไปสับสนภายหลัง

#### Acceptance Criteria

1. THE Decision_Record SHALL ระบุข้อความว่าจะไม่ดำเนินการตามแนวคิดแพลตฟอร์ม SaaS ร่วม พร้อมเหตุผลว่าทั้งสองโดเมนต่างกันและส่วนที่ใช้ร่วมเป็นโครงสร้างพื้นฐานทั่วไปที่ใช้ไลบรารีสำเร็จรูปแทนได้
2. THE Decision_Record SHALL ระบุข้อเท็จจริงว่าไม่เคยมีการเขียนโค้ดแพลตฟอร์มร่วมเกิดขึ้นจริง (canonical promoted = 0)
3. THE Decision_Record SHALL บันทึกวันที่ของการตัดสินใจ

### Requirement 2: จัดเก็บชุดเอกสารวางแผนเดิมเข้าคลังถาวร

**User Story:** ในฐานะเจ้าของเอกสาร ฉันต้องการเก็บ Shared_Docset เดิมไว้ในคลังถาวรโดยไม่ลบทิ้ง เพื่อรักษาประวัติของแนวคิดและเหตุผลของการตัดสินใจไว้

#### Acceptance Criteria

1. WHEN ดำเนินการจัดเก็บ Shared_Docset, THE Archive_Location SHALL เก็บเนื้อหาของ Shared_Docset ไว้ครบถ้วนโดยไม่ลบและไม่แก้ไขเนื้อหาเดิม
2. THE Archive_Location SHALL ถูกทำเครื่องหมายสถานะเป็น "archived" เพื่อระบุว่าเป็นเอกสารอ้างอิงทางประวัติศาสตร์ที่ไม่ใช้ดำเนินการต่อ
3. IF การจัดเก็บเข้าคลังล้มเหลว, THEN THE Archive_Location SHALL คง Shared_Docset ต้นทางไว้ไม่เปลี่ยนแปลง และแสดงข้อความแจ้งความล้มเหลว

### Requirement 3: ที่จัดเก็บเอกสารวางแผนแยกอิสระของแต่ละโครงการ

**User Story:** ในฐานะเจ้าของโครงการ ฉันต้องการให้ MONOLITH และ TCCK แต่ละโครงการมีที่จัดเก็บเอกสารวางแผนของตัวเอง เพื่อให้การวางแผนแต่ละโครงการดำเนินต่อไปได้อย่างอิสระ

#### Acceptance Criteria

1. THE MONOLITH SHALL มีที่จัดเก็บเอกสารวางแผนของตัวเองที่แยกจากของ TCCK
2. THE TCCK SHALL มีที่จัดเก็บเอกสารวางแผนของตัวเองที่แยกจากของ MONOLITH
3. THE MONOLITH SHALL ไม่มีการอ้างอิง (cross-reference) ไปยังเอกสารวางแผนของ TCCK และ THE TCCK SHALL ไม่มีการอ้างอิงไปยังเอกสารวางแผนของ MONOLITH

### Requirement 4: บันทึกการตัดสินใจลงบันทึกถาวรของทั้งสองโครงการ

**User Story:** ในฐานะสมาชิกทีม ฉันต้องการให้การตัดสินใจถูกบันทึกอย่างถาวรในแต่ละโครงการ เพื่อให้สืบค้นย้อนหลังได้ว่าทำไมจึงเลือกแยกทิศทาง

#### Acceptance Criteria

1. WHEN บันทึกการตัดสินใจ, THE Decision_Log ของ TCCK SHALL เพิ่มรายการ Decision_Record แบบ append (ต่อท้าย) โดยไม่ลบหรือแก้ไขรายการเดิมที่มีอยู่
2. WHEN บันทึกการตัดสินใจ, THE Decision_Log ของ MONOLITH SHALL เพิ่มรายการ Decision_Record แบบ append (ต่อท้าย) โดยไม่ลบหรือแก้ไขรายการเดิมที่มีอยู่
3. THE Decision_Log แต่ละโครงการ SHALL บันทึกข้อความการตัดสินใจที่สอดคล้องตรงกันกับ Decision_Record (ข้อสรุปและเหตุผลตรงกัน)

### Requirement 5: ยืนยันแบบเบาว่าไม่มีการผูกพันข้ามโครงการในปัจจุบัน

**User Story:** ในฐานะวิศวกร ฉันต้องการยืนยันสั้น ๆ ว่าวันนี้ยังไม่มีการพึ่งพาข้ามโครงการ เพื่อยืนยันว่าทั้งสองโครงการเป็นอิสระต่อกันอยู่แล้วและไม่ต้องแก้ไขอะไรเพิ่ม

#### Acceptance Criteria

1. THE Separation_Plan SHALL บันทึกข้อยืนยัน (assertion) ว่าปัจจุบันไม่มี Cross_Project_Coupling ระหว่าง MONOLITH กับ TCCK ได้แก่ไม่มี shared runtime, shared database, shared deployment และไม่มีการ import ซอร์สโค้ดข้ามโครงการ
2. IF พบ Cross_Project_Coupling อย่างน้อยหนึ่งรายการระหว่างการยืนยัน, THEN THE Separation_Plan SHALL บันทึกรายการนั้นพร้อมประเภทของการพึ่งพา และทำเครื่องหมายว่าต้องแก้ไขก่อนถือว่าทั้งสองโครงการเป็นอิสระ
3. WHERE การยืนยันเสร็จสิ้นและไม่พบ Cross_Project_Coupling, THE Separation_Plan SHALL บันทึกผลการยืนยันเป็น "อิสระต่อกัน (independent)" พร้อมวันที่ยืนยัน
