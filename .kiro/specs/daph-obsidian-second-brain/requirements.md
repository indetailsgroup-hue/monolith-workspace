# Requirements Document

## Introduction

ฟีเจอร์นี้คือการสร้าง Obsidian "Second Brain" เพียง **Vault เดียว** สำหรับธุรกิจ DAPH Decor (งานออกแบบตกแต่งภายใน / ผลิตเฟอร์นิเจอร์) โดยรวมความรู้สองโดเมนหลักไว้ในที่เดียว เชื่อมโยงถึงกันได้ ค้นหาได้ และนำทางได้

**โดเมน A — Hardware (ฮาร์ดแวร์เฟอร์นิเจอร์):** ผนวก Vault ที่มีอยู่แล้ว `furniture-hardware-vault` ซึ่งเก็บ atomic note ของอุปกรณ์ยี่ห้อ Blum / Häfele / Italiana Ferramenta / Salice พร้อม source note, MOC, spec และ validation รวมถึงไฟล์ PDF แค็ตตาล็อกต้นฉบับ

**โดเมน B — Process (กระบวนการธุรกิจ / QMS):** ชุดเอกสารระบบบริหารคุณภาพของ DAPH ในโฟลเดอร์ `New folder` ได้แก่ SOS, JES, PFMEA, Process Control Plan, เทมเพลตปฏิบัติการ และเมทริกซ์กระบวนการรวมของบริษัท

ความจริงสำคัญที่ตรวจสอบจากเนื้อหาไฟล์จริงและกำหนดรูปแบบของข้อกำหนดชุดนี้:

1. กระบวนการธุรกิจ **ไม่ใช่ 7 แผนกแบนราบ** แต่แบ่งเป็น **สามกลุ่มกระบวนการย่อย (sub-process group)**:
   - **Office / ก่อนการผลิต:** Sale → Area Measurement → Designer → 3D Perspective → Production Planning
   - **Factory line (6 สถานี):** Laminate HPL → Cutting → Edging → CNC → Assembly → Packing
   - **On-site (Installation 16 ขั้นตอน):** ตั้งแต่บรีฟงานจนถึงเก็บของ
2. ชื่อไฟล์ "Main Process" ทำให้เข้าใจผิด: `1.SOS DAPH, Main Process.xlsx` และ `2.JES DAPH, Main Process.xlsx` ครอบคลุม 5 แผนกฝั่ง Office (หลายแผนกในไฟล์เดียว) ส่วน `1.SOS DAPH.xlsx` ครอบคลุม Factory line 6 สถานี ดังนั้นการจัดประเภท **ห้ามสมมติว่าหนึ่งไฟล์ = หนึ่งแผนก** ไฟล์เดียวอาจครอบคลุมหลายแผนก/สถานี (สร้างหนึ่งโน้ตต่อไฟล์ แต่ต้องอนุญาตให้ติดหลายแท็กแผนกและแยกหัวข้อย่อยรายชีต)
3. ประเภทเอกสารจัดกันเป็น **ชุดที่ลิงก์ถึงกัน (Document_Set)** ต่อแผนก/สถานี: SOS ↔ JES ↔ PFMEA ↔ Process Control Plan โดย PFMEA อ้างถึง "ตาม SOS, JES Sheet" และ SOS อ้างรหัส JES (JES-001) กับรหัสเครื่องจักร (MC-001) ข้อกำหนดต้องบังคับการลิงก์ข้ามเอกสารในชุดเดียวกัน ไม่ใช่แค่ลิงก์แผนกก่อนหน้า/ถัดไป
4. PFMEA มีโครงสร้างคอลัมน์: Process Step / Requirement / Potential Failure Mode / Effects / SEV / Causes / OCC / Current Controls (Prevention) / Detection / DET / RPN / Actions / Owner มี PFMEA รายแผนก รวมทั้งฉบับ master `DAPH PFMEA.xlsx` (Production) และฉบับ "Main Process" ที่รวม 5 แผนก Office ตัวแปรเจ้าของมี "P'Mean" (เจ้าของฝั่ง Production) และ "P'oil" (ตัวแปรวางแผนฝั่ง Installation) ส่วน "(Revise 1)" และ "(1)" คือฉบับปรับปรุงที่ละเอียดกว่า
5. `สำหรับคุณชุ.xlsx` เป็น **เมทริกซ์กระบวนการ+เวลา+ต้นทุน+RACI ระดับบริษัท** (กว่า 1000 แถว ครอบคลุม Line sales → measure → Production → House design → 3D → Installation พร้อมคอลัมน์เวลาและต้นทุน) ไม่ใช่ไฟล์ขยะ ต้องถือเป็น **แผนที่กระบวนการหลัก (Master Process Matrix)** และเป็นแหล่ง MOC สำคัญ
6. ไฟล์ `.xls` 10 ไฟล์ (Process Control Plan รายแผนก + `Citadines Arch ID KDR cklst.xls`) ถูกระบุว่า extractor เดิมอ่านไม่ได้ใน `_INDEX.json` (`xls_unsupported`) ข้อกำหนดต้องครอบคลุมการแปลง/จัดการไฟล์ `.xls` ให้ค้นหาได้ หรืออย่างน้อยแนบไฟล์พร้อมโน้ตกำกับ ส่วน `Citadines Arch ID KDR cklst.xls` เป็น checklist ของโครงการลูกค้าจริง ต้องอยู่ในพื้นที่ Projects ไม่ใช่เอกสาร QMS มาตรฐาน
7. เทมเพลตที่มี: `Template Feasibility By Daph decor send 251019.xlsx` (เทมเพลต feasibility/ใบเสนอราคา 12 ชีต), `interior-designer-sample-spec sheet-template.xlsx` (spec sheet แบบ Houzz ทั่วไป), `แผนการทำงานช่างติดตั้ง ประจำวัน.xlsx` (ฟอร์มแผนงานช่างติดตั้งรายวัน) ไฟล์ขยะ: `~$1.SOS DAPH Draft.xlsx` ฉบับร่าง: ไฟล์ที่มีคำว่า "Draft"
8. ซอฟต์แวร์ที่อ้างถึงในกระบวนการ (ต้องอยู่ใน Glossary): Pytha, MaxCut, AutoCAD, 3D Max

เนื่องจาก Obsidian ทำงานบนไฟล์ Markdown เป็นหลัก และไฟล์ Excel ไม่สามารถลิงก์หรือค้นหาเนื้อหาภายในได้โดยตรง ระบบจึงต้องสร้าง Markdown Index/MOC note หนึ่งโน้ตต่อหนึ่งเอกสาร Excel เพื่อเป็นจุดเชื่อมโยงและค้นหา ทั้งหมดต้องอยู่ภายในเวิร์กสเปซ `determined-williams` (self-contained) และไม่แก้ไขไฟล์ต้นฉบับ

## Glossary

- **DAPH Decor**: ธุรกิจออกแบบตกแต่งภายในและผลิตเฟอร์นิเจอร์ที่เป็นเจ้าของเอกสารทั้งหมด
- **Vault_Builder**: ระบบ/กระบวนการที่ทำหน้าที่สร้างและจัดระเบียบ Obsidian Vault ตามข้อกำหนดในเอกสารนี้
- **Obsidian_Vault**: โฟลเดอร์ปลายทางเดียวที่ Obsidian ใช้งาน ประกอบด้วยไฟล์ Markdown และไฟล์แนบ ครอบคลุมทั้งสองโดเมน
- **Domain**: โดเมนความรู้ระดับบนสุดของ Obsidian_Vault หนึ่งค่าจากชุด {Hardware, Process}
- **Hardware_Domain**: โดเมนความรู้อุปกรณ์เฟอร์นิเจอร์ที่มาจาก Hardware_Source (Blum/Häfele/Italiana Ferramenta/Salice)
- **Process_Domain**: โดเมนความรู้กระบวนการธุรกิจ/QMS ที่มาจาก Process_Source
- **Hardware_Source**: โฟลเดอร์ต้นทาง `determined-williams/furniture-hardware-vault` พร้อมไฟล์ PDF แค็ตตาล็อกใน `New folder (2)`
- **Process_Source**: โฟลเดอร์ต้นทาง `determined-williams/New folder` ที่เก็บไฟล์ Excel ของ QMS
- **Extract_Folder**: โฟลเดอร์ `determined-williams/_daph_extract` ที่เก็บเนื้อหา Excel ที่แตกเป็นข้อความแล้วและไฟล์ `_INDEX.json`
- **Archive_Folder**: โฟลเดอร์ภายใน Obsidian_Vault ที่ใช้เก็บไฟล์ขยะ/ซ้ำ/ฉบับร่างแทนการลบทิ้ง
- **Index_Note**: โน้ต Markdown หนึ่งไฟล์ที่อธิบายและลิงก์ไปยังเอกสาร Excel หรือ PDF หนึ่งไฟล์ (เรียกอีกชื่อว่า doc note)
- **MOC**: Map of Content คือโน้ตศูนย์รวมที่ลิงก์ไปยังโน้ตอื่น ๆ ในหัวข้อเดียวกัน
- **Home_Dashboard**: โน้ต MOC หลักที่เป็นจุดเริ่มต้นการนำทางทั้ง Vault ครอบคลุมทั้งสองโดเมน
- **Sub_Process_Group**: กลุ่มกระบวนการย่อยหนึ่งค่าจากชุด {Office, Factory, Installation}
- **Department**: หน่วยงานในกลุ่ม Office ได้แก่ Sale, Area Measurement, Designer, 3D Perspective, Production Planning
- **Station**: สถานีในกลุ่ม Factory ได้แก่ Laminate HPL, Cutting, Edging, CNC, Assembly, Packing
- **Installation_Step**: ขั้นตอนงานหน้างานในกลุ่ม Installation (16 ขั้นตอน เช่น การบรีฟงาน, การตรวจสอบหน้างาน, การติดตั้งโครงอลูมิเนียม)
- **Process_Unit**: คำรวมที่หมายถึง Department หรือ Station หรือ Installation_Step หนึ่งหน่วย
- **SOS**: Standardized Operation Sheet เอกสารกำหนดมาตรฐานการปฏิบัติงานต่อหน่วยกระบวนการ
- **JES**: Job Element Sheet เอกสารแจกแจงองค์ประกอบของงาน อ้างถึงด้วยรหัส เช่น JES-001
- **MC_Code**: รหัสเครื่องจักร/อุปกรณ์ที่อ้างใน SOS เช่น MC-001
- **PFMEA**: Process Failure Mode and Effects Analysis เอกสารวิเคราะห์ความเสี่ยงของกระบวนการ (มีคอลัมน์ Process Step, SEV, OCC, DET, RPN ฯลฯ)
- **RPN**: Risk Priority Number ค่าจัดลำดับความเสี่ยงใน PFMEA (= SEV × OCC × DET)
- **Process_Control_Plan**: แผนควบคุมกระบวนการตามมาตรฐาน APQP แยกตามหน่วยกระบวนการ
- **Document_Set**: ชุดเอกสารที่สัมพันธ์กันของหน่วยกระบวนการเดียวกัน ประกอบด้วย SOS, JES, PFMEA, Process_Control_Plan ที่ต้องลิงก์ถึงกัน
- **Master_Process_Matrix**: เมทริกซ์กระบวนการ+เวลา+ต้นทุน+RACI ระดับบริษัทจากไฟล์ `สำหรับคุณชุ.xlsx` ใช้เป็นแผนที่กระบวนการหลัก
- **Document_Type**: ประเภทเอกสาร ได้แก่ SOS, JES, PFMEA, Process Control Plan, Template, Master Matrix, Project Doc, Other
- **Status_Tag**: แท็กสถานะของเอกสาร ได้แก่ active, draft, revise, archived
- **PARA**: ระบบจัดหมวดความรู้ 4 กลุ่ม Projects, Areas, Resources, Archives
- **Project_Area**: พื้นที่ `01-Projects` สำหรับเอกสารงานลูกค้ารายโครงการ (เช่น Citadines)
- **Naming_Convention**: รูปแบบมาตรฐานในการตั้งชื่อไฟล์และโน้ต
- **Junk_File**: ไฟล์ขยะ/ชั่วคราว เช่น ไฟล์ที่ขึ้นต้นด้วย `~$` หรือไฟล์ที่ไม่ใช่เอกสารงานจริง
- **Process_Flow_Diagram**: แผนภาพลำดับกระบวนการที่เขียนด้วย Mermaid ภายในโน้ต Markdown แสดงทั้งสามกลุ่มกระบวนการย่อย
- **Project_Template**: เทมเพลตโน้ตสำหรับเริ่มงานลูกค้ารายใหม่
- **Pytha**: ซอฟต์แวร์ออกแบบ/ถอดวัสดุเฟอร์นิเจอร์ 3D ที่ใช้ในขั้น Production Planning
- **MaxCut**: ซอฟต์แวร์วางแผนการตัดและถอดรายการวัสดุ
- **AutoCAD**: ซอฟต์แวร์เขียนแบบ 2D ที่ใช้แปลงไฟล์เจาะส่งร้านนอก
- **3D_Max**: ซอฟต์แวร์ขึ้นโมเดลและเรนเดอร์ 3D ที่ใช้ในขั้น 3D Perspective

## Requirements

### Requirement 1: สแกนและจัดทำบัญชีไฟล์จากทั้งสองโดเมน

**User Story:** ในฐานะเจ้าของธุรกิจ DAPH Decor ฉันต้องการให้ระบบสแกนทั้งโฟลเดอร์ฮาร์ดแวร์ที่มีอยู่และโฟลเดอร์เอกสาร QMS แล้วจัดทำบัญชีไฟล์ทั้งหมด เพื่อให้ทราบว่ามีเอกสารใดบ้างในแต่ละโดเมนก่อนจัดระเบียบ

#### Acceptance Criteria

1. WHEN Vault_Builder เริ่มทำงาน, THE Vault_Builder SHALL อ่านรายชื่อไฟล์ทั้งหมดจาก Hardware_Source และ Process_Source รวมถึงโฟลเดอร์ย่อย
2. THE Vault_Builder SHALL กำหนด Domain ให้แต่ละไฟล์หนึ่งค่าจากชุด {Hardware, Process}
3. THE Vault_Builder SHALL จัดประเภทแต่ละไฟล์ในโดเมน Process เป็น Document_Type หนึ่งค่าจากชุด {SOS, JES, PFMEA, Process Control Plan, Template, Master Matrix, Project Doc, Other} ยกเว้นไฟล์ที่เป็น Junk_File
4. IF ไฟล์เป็น Junk_File (ชื่อขึ้นต้นด้วย `~$` หรือมีนามสกุล `.tmp`/`.temp` หรือเป็นไฟล์ชั่วคราว), THEN THE Vault_Builder SHALL ทำเครื่องหมายไฟล์นั้นเป็น Junk_File ในบัญชีไฟล์ และไม่กำหนด Document_Type
5. THE Vault_Builder SHALL บันทึก `_INDEX.json` ของ Extract_Folder เพื่อระบุว่าไฟล์ Excel ใดมีเนื้อหาที่แตกเป็นข้อความแล้ว และไฟล์ `.xls` ใดอยู่ในรายการ `xls_unsupported`
6. THE Vault_Builder SHALL สร้างบัญชีไฟล์ (inventory) ที่ระบุชื่อไฟล์เดิม Domain Document_Type Process_Unit ที่เกี่ยวข้อง และ Status_Tag ของแต่ละไฟล์

### Requirement 2: โมเดลกระบวนการแบบสามกลุ่มกระบวนการย่อย

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ระบบสะท้อนกระบวนการจริงที่แบ่งเป็นสามกลุ่ม (Office, Factory, Installation) เพื่อให้โครงสร้างตรงกับการทำงานจริง ไม่ใช่เจ็ดแผนกแบนราบ

#### Acceptance Criteria

1. THE Vault_Builder SHALL จัดกระบวนการเป็นสาม Sub_Process_Group ได้แก่ Office, Factory, และ Installation
2. THE Vault_Builder SHALL กำหนด Department ของกลุ่ม Office ตามลำดับ Sale → Area Measurement → Designer → 3D Perspective → Production Planning
3. THE Vault_Builder SHALL กำหนด Station ของกลุ่ม Factory ตามลำดับ Laminate HPL → Cutting → Edging → CNC → Assembly → Packing
4. THE Vault_Builder SHALL กำหนดกลุ่ม Installation ให้ครอบคลุม Installation_Step ทั้ง 16 ขั้นตอนตามลำดับที่ปรากฏใน `1.SOS DAPH, INSTALLATION.xlsx`
5. WHERE ไฟล์หนึ่งครอบคลุมหลาย Process_Unit (เช่น `1.SOS DAPH, Main Process.xlsx` ครอบคลุม 5 แผนก Office และ `1.SOS DAPH.xlsx` ครอบคลุม 6 สถานี Factory), THE Vault_Builder SHALL สร้างหนึ่ง Index_Note ต่อไฟล์ แต่ติดแท็ก Process_Unit ได้หลายค่า และแยกหัวข้อย่อยรายชีตภายในโน้ตเดียวกัน
6. THE Vault_Builder SHALL ไม่สมมติว่าหนึ่งชื่อไฟล์ตรงกับหนึ่ง Process_Unit เสมอ

### Requirement 3: โครงสร้างโฟลเดอร์ของ Obsidian Vault แบบสองโดเมน

**User Story:** ในฐานะผู้ใช้ ฉันต้องการโครงสร้างโฟลเดอร์เดียวแบบ PARA ที่แยกสองโดเมนชัดเจน เพื่อให้นำทางและหาเอกสารทั้งฝั่งฮาร์ดแวร์และฝั่งกระบวนการได้ง่าย

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้าง Obsidian_Vault เดียวที่รวมทั้ง Hardware_Domain และ Process_Domain โดยมีโฟลเดอร์ระดับบนสุดตามระบบ PARA ได้แก่ `01-Projects`, `02-Areas`, `03-Resources`, `04-Archives`
2. THE Vault_Builder SHALL จัดวางเนื้อหา Hardware_Domain ไว้ใต้ `02-Areas` โดยคงโครงสร้างเดิมของ `furniture-hardware-vault` (atomic notes, sources, systems/MOC, specs, validation, templates)
3. THE Vault_Builder SHALL สร้างโฟลเดอร์ของ Process_Domain ใต้ `02-Areas` แยกเป็นสามกลุ่ม Office, Factory, และ Installation พร้อมโฟลเดอร์ย่อยตาม Process_Unit
4. THE Vault_Builder SHALL วาง Index_Note และไฟล์แนบของแต่ละเอกสารไว้ในโฟลเดอร์ Process_Unit ที่ตรงกับเอกสารนั้น และเมื่อเอกสารครอบคลุมหลายหน่วย SHALL วางไว้ในโฟลเดอร์ของกลุ่มที่เกี่ยวข้อง
5. THE Vault_Builder SHALL วางเอกสารงานลูกค้ารายโครงการ (เช่น `Citadines Arch ID KDR cklst.xls`) ไว้ใน `01-Projects`
6. WHERE เอกสารไม่สังกัด Process_Unit ใด (เช่น เทมเพลตทั่วไป อภิธานศัพท์ หรือ Master_Process_Matrix), THE Vault_Builder SHALL วางเอกสารนั้นไว้ใน `03-Resources`
7. THE Vault_Builder SHALL สร้าง `04-Archives` เพื่อใช้เป็น Archive_Folder สำหรับไฟล์ขยะ/ซ้ำ/ฉบับร่าง

### Requirement 4: การสร้าง Index Note ต่อเอกสาร

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้แต่ละไฟล์เอกสารมีโน้ต Markdown กำกับ เพื่อให้ค้นหา ลิงก์ และเปิดไฟล์ต้นฉบับได้จากภายใน Obsidian

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้าง Index_Note หนึ่งไฟล์ Markdown ต่อหนึ่งไฟล์เอกสารที่ไม่ใช่ Junk_File
2. THE Index_Note SHALL มีลิงก์ที่เปิดไฟล์ต้นฉบับ (Excel, PDF หรือ `.xls`) ที่เกี่ยวข้องได้
3. THE Index_Note SHALL มีบล็อก frontmatter ที่ระบุฟิลด์ Domain, Document_Type, Process_Unit (หนึ่งค่าหรือหลายค่า), Sub_Process_Group และ Status_Tag
4. THE Index_Note SHALL มีหัวข้อสรุปอธิบายว่าเอกสารคืออะไรและใช้ในขั้นตอนใดของกระบวนการธุรกิจ โดยอ้างเนื้อหาจริงจาก Extract_Folder เมื่อมี
5. WHERE เอกสารครอบคลุมหลาย Process_Unit หรือหลายชีต, THE Index_Note SHALL แยกหัวข้อย่อยหนึ่งหัวข้อต่อหนึ่ง Process_Unit/ชีต
6. THE Index_Note SHALL มีลิงก์ไปยัง Index_Note ของ Process_Unit ก่อนหน้าและถัดไปในลำดับกระบวนการ เมื่อมีหน่วยดังกล่าวอยู่

### Requirement 5: การลิงก์เอกสารเป็นชุด (Document Set) ต่อหน่วยกระบวนการ

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้เอกสาร SOS, JES, PFMEA และ Process Control Plan ของหน่วยกระบวนการเดียวกันลิงก์ถึงกัน เพื่อให้เปิดจากเอกสารหนึ่งแล้วไปยังเอกสารที่เกี่ยวข้องในชุดเดียวกันได้ทันที

#### Acceptance Criteria

1. THE Vault_Builder SHALL จัดกลุ่มเอกสารที่สังกัด Process_Unit เดียวกันให้เป็น Document_Set หนึ่งชุด
2. THE Index_Note ของเอกสารในชุดเดียวกัน SHALL มีลิงก์ไปยัง Index_Note อื่นทุกฉบับใน Document_Set เดียวกัน (SOS ↔ JES ↔ PFMEA ↔ Process Control Plan)
3. WHERE SOS อ้างรหัส JES (เช่น JES-001) หรือรหัส MC_Code (เช่น MC-001), THE Index_Note ของ SOS SHALL แสดงรหัสเหล่านั้นและลิงก์ไปยัง Index_Note ของ JES ที่เกี่ยวข้องเมื่อมี
4. WHERE PFMEA อ้างถึง "ตาม SOS, JES Sheet", THE Index_Note ของ PFMEA SHALL ลิงก์ไปยัง Index_Note ของ SOS และ JES ใน Document_Set เดียวกัน
5. WHERE Process_Control_Plan อ้างถึงการควบคุมด้วยเอกสาร SOS, JES, THE Index_Note ของ Process_Control_Plan SHALL ลิงก์ไปยัง Index_Note ของ SOS และ JES ใน Document_Set เดียวกัน

### Requirement 6: Master Process Matrix

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ไฟล์ `สำหรับคุณชุ.xlsx` ถูกปฏิบัติเป็นแผนที่กระบวนการหลัก เพื่อให้เห็นภาพรวมกระบวนการ เวลา ต้นทุน และความรับผิดชอบของทั้งบริษัท

#### Acceptance Criteria

1. THE Vault_Builder SHALL จัดประเภท `สำหรับคุณชุ.xlsx` เป็น Document_Type = Master Matrix และไม่ถือเป็น Junk_File
2. THE Vault_Builder SHALL สร้าง Index_Note สำหรับ Master_Process_Matrix ใน `03-Resources`
3. THE Index_Note ของ Master_Process_Matrix SHALL สรุปขอบเขตที่ครอบคลุม (Line sales → measure → Production → House design → 3D → Installation) พร้อมระบุว่ามีคอลัมน์เวลาและต้นทุน
4. THE Index_Note ของ Master_Process_Matrix SHALL ลิงก์ไปยัง MOC ของแต่ละ Sub_Process_Group ที่เกี่ยวข้อง
5. THE Home_Dashboard SHALL มีลิงก์ไปยัง Index_Note ของ Master_Process_Matrix

### Requirement 7: การแปลงและจัดการไฟล์ .xls ที่อ่านเนื้อหาไม่ได้

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ไฟล์ `.xls` (Process Control Plan และ checklist โครงการ) ค้นหาได้ใน Obsidian เพื่อไม่ให้ข้อมูลในไฟล์เหล่านี้สูญหายจากการค้นหา

#### Acceptance Criteria

1. WHEN Vault_Builder พบไฟล์ `.xls` ที่อยู่ในรายการ `xls_unsupported` ของ `_INDEX.json`, THE Vault_Builder SHALL พยายามแปลงเนื้อหาไฟล์นั้นเป็นข้อความหรือ Markdown ที่ค้นหาได้
2. IF การแปลงไฟล์ `.xls` สำเร็จ, THEN THE Vault_Builder SHALL ฝังหรือสรุปเนื้อหาที่แปลงได้ลงใน Index_Note ของไฟล์นั้น
3. IF การแปลงไฟล์ `.xls` ไม่สำเร็จ, THEN THE Vault_Builder SHALL แนบไฟล์ต้นฉบับไว้ใน Obsidian_Vault พร้อมโน้ตกำกับที่ระบุให้เปิดด้วย Excel และเหตุผลที่อ่านเนื้อหาไม่ได้
4. THE Vault_Builder SHALL สร้าง Index_Note ให้ไฟล์ `.xls` ที่ไม่ใช่ Junk_File ทุกไฟล์ไม่ว่าการแปลงจะสำเร็จหรือไม่
5. THE Vault_Builder SHALL ลิงก์ Index_Note ของ Process Control Plan แต่ละไฟล์เข้ากับ Document_Set ของ Process_Unit ที่ตรงกัน

### Requirement 8: Home Dashboard และ MOC

**User Story:** ในฐานะผู้ใช้ ฉันต้องการหน้าแรกที่เป็นศูนย์รวมการนำทาง เพื่อเข้าถึงทั้งสองโดเมน ทุกกลุ่มกระบวนการ และทุกประเภทเอกสารได้จากจุดเดียว

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้าง Home_Dashboard หนึ่งโน้ตที่รากของ Obsidian_Vault
2. THE Home_Dashboard SHALL มีลิงก์ไปยัง MOC ของ Hardware_Domain และ MOC ของแต่ละ Sub_Process_Group ในกลุ่ม Process_Domain
3. THE Vault_Builder SHALL สร้างโน้ต MOC หนึ่งโน้ตต่อหนึ่ง Sub_Process_Group และหนึ่งโน้ต MOC ต่อหนึ่ง Process_Unit
4. THE Process_Unit MOC SHALL มีลิงก์ไปยัง Index_Note ทุกไฟล์ที่สังกัดหน่วยนั้น โดยจัดกลุ่มตาม Document_Set
5. THE Home_Dashboard SHALL มีลิงก์ไปยังอภิธานศัพท์ (Glossary), Master_Process_Matrix และ Process_Flow_Diagram

### Requirement 9: มาตรฐานการตั้งชื่อไฟล์

**User Story:** ในฐานะผู้ใช้ ฉันต้องการชื่อไฟล์ที่เป็นมาตรฐานเดียวกัน เพื่อให้เรียงลำดับ ค้นหา และเข้าใจได้ง่าย

#### Acceptance Criteria

1. THE Vault_Builder SHALL กำหนดชื่อให้แต่ละ Index_Note ของ Process_Domain ตามรูปแบบ `{Document_Type}-{Process_Unit หรือ Sub_Process_Group}-{ชื่อเอกสาร}` โดยใช้ตัวคั่นและการเว้นวรรคที่สม่ำเสมอ
2. THE Vault_Builder SHALL คงรูปแบบการตั้งชื่อเดิมของ Hardware_Domain (kebab-case ของ `furniture-hardware-vault`) ไว้โดยไม่เปลี่ยนแปลง
3. WHERE ชื่อเอกสารต้นฉบับมีคำกำกับเจ้าของ (เช่น "P'oil", "P'Mean"), THE Vault_Builder SHALL คงข้อมูลเจ้าของไว้ในฟิลด์ frontmatter แทนการใส่ในชื่อไฟล์
4. IF การตั้งชื่อตาม Naming_Convention ทำให้เกิดชื่อซ้ำกัน, THEN THE Vault_Builder SHALL เพิ่มส่วนต่อท้ายที่ทำให้ชื่อไม่ซ้ำกัน
5. THE Vault_Builder SHALL รองรับชื่อเอกสารที่เป็นภาษาไทยโดยไม่ทำให้อักขระเสียหาย

### Requirement 10: การจัดการไฟล์ขยะ ซ้ำ และฉบับร่าง

**User Story:** ในฐานะผู้ใช้ ฉันต้องการให้ไฟล์ขยะและไฟล์ซ้ำถูกแยกออกไป เพื่อให้พื้นที่ทำงานหลักสะอาด โดยไม่สูญเสียข้อมูลใด ๆ

#### Acceptance Criteria

1. WHEN Vault_Builder พบ Junk_File (เช่น `~$1.SOS DAPH Draft.xlsx`), THE Vault_Builder SHALL ย้ายไฟล์นั้นไปยัง Archive_Folder แทนการลบ
2. WHEN Vault_Builder พบเอกสารที่มี Status_Tag เป็น draft หรือ revise และมีฉบับ active ที่คู่กันอยู่, THE Vault_Builder SHALL ย้ายฉบับ draft หรือ revise ไปยัง Archive_Folder
3. THE Vault_Builder SHALL ถือว่าไฟล์ที่มีคำว่า "Draft" เป็น Status_Tag = draft และไฟล์ที่มี "(Revise 1)" หรือ "(1)" เป็น Status_Tag = revise
4. THE Vault_Builder SHALL คงไฟล์ทุกไฟล์จาก Hardware_Source และ Process_Source ไว้อย่างน้อยหนึ่งสำเนาภายใน Obsidian_Vault โดยไม่แก้ไขไฟล์ต้นฉบับ
5. THE Vault_Builder SHALL บันทึกรายการการย้าย/คัดลอกไฟล์ทุกครั้ง โดยระบุตำแหน่งเดิมและตำแหน่งใหม่
6. IF ไฟล์สองไฟล์มีเนื้อหาเหมือนกันและชื่อต่างกันเล็กน้อย, THEN THE Vault_Builder SHALL ทำเครื่องหมายไฟล์เหล่านั้นเป็นไฟล์ซ้ำในบัญชีไฟล์เพื่อให้ผู้ใช้ตรวจสอบ

### Requirement 11: ระบบแท็ก

**User Story:** ในฐานะผู้ใช้ ฉันต้องการระบบแท็กที่สม่ำเสมอ เพื่อให้กรองและค้นหาเอกสารตามโดเมน กลุ่มกระบวนการ หน่วยงาน ประเภท และสถานะได้

#### Acceptance Criteria

1. THE Vault_Builder SHALL ใส่แท็ก Domain ให้ทุก Index_Note ตามโดเมนของเอกสาร
2. THE Vault_Builder SHALL ใส่แท็ก Sub_Process_Group และแท็ก Process_Unit ให้ทุก Index_Note ของ Process_Domain โดยอนุญาตให้มีหลายแท็ก Process_Unit เมื่อเอกสารครอบคลุมหลายหน่วย
3. THE Vault_Builder SHALL ใส่แท็ก Document_Type ให้ทุก Index_Note ตามประเภทของเอกสาร
4. THE Vault_Builder SHALL ใส่ Status_Tag ให้ทุก Index_Note หนึ่งค่าจากชุด {active, draft, revise, archived}
5. THE Vault_Builder SHALL ใช้รูปแบบการตั้งชื่อแท็กเดียวกันกับทุกโน้ต และจัดทำรายการแท็กทั้งหมดที่ใช้พร้อมความหมายไว้ในโน้ตอ้างอิงหนึ่งโน้ต

### Requirement 12: อภิธานศัพท์คำย่อและซอฟต์แวร์

**User Story:** ในฐานะผู้ใช้หรือพนักงานใหม่ ฉันต้องการอภิธานศัพท์ที่อธิบายคำย่อและซอฟต์แวร์ทั้งหมด เพื่อให้เข้าใจเอกสารได้โดยไม่ต้องถามคนอื่น

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้างโน้ตอภิธานศัพท์ (Glossary) หนึ่งโน้ตใน `03-Resources`
2. THE Glossary SHALL มีคำนิยามของคำย่ออย่างน้อย SOS, JES, PFMEA, RPN, MC_Code, MOC, และ PARA
3. THE Glossary SHALL มีคำนิยามของซอฟต์แวร์ที่ใช้ในกระบวนการอย่างน้อย Pytha, MaxCut, AutoCAD, และ 3D Max
4. THE Glossary SHALL ระบุชื่อเต็มและคำอธิบายภาษาไทยสำหรับแต่ละคำย่อและซอฟต์แวร์
5. WHERE Index_Note อ้างถึงคำย่อหรือซอฟต์แวร์ที่นิยามไว้ใน Glossary, THE Vault_Builder SHALL ทำให้คำนั้นลิงก์ไปยัง Glossary ได้

### Requirement 13: แผนภาพลำดับกระบวนการ

**User Story:** ในฐานะผู้ใช้ ฉันต้องการแผนภาพแสดงลำดับกระบวนการธุรกิจทั้งสามกลุ่ม เพื่อให้เห็นภาพรวมการไหลของงานและคลิกเข้าถึงแต่ละหน่วยได้

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้าง Process_Flow_Diagram ด้วย Mermaid ภายในโน้ต Markdown
2. THE Process_Flow_Diagram SHALL แสดงทั้งสาม Sub_Process_Group ตามลำดับ Office (Sale → Area Measurement → Designer → 3D Perspective → Production Planning) → Factory (Laminate HPL → Cutting → Edging → CNC → Assembly → Packing) → Installation
3. THE Process_Flow_Diagram SHALL ปรากฏอยู่ในหรือถูกลิงก์จาก Home_Dashboard
4. THE Vault_Builder SHALL ทำให้แต่ละ Process_Unit ในแผนภาพหรือข้อความประกอบลิงก์ไปยัง MOC ของหน่วยนั้นได้

### Requirement 14: เทมเพลตโครงการสำหรับงานลูกค้าใหม่

**User Story:** ในฐานะผู้ใช้ ฉันต้องการเทมเพลตสำหรับงานลูกค้ารายใหม่ เพื่อให้เริ่มงานแต่ละโครงการด้วยโครงสร้างที่สม่ำเสมอ

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้าง Project_Template หนึ่งไฟล์ใน `03-Resources`
2. THE Project_Template SHALL มีหัวข้อตามลำดับกระบวนการทั้งสามกลุ่ม (Office, Factory, Installation)
3. THE Project_Template SHALL มีบล็อก frontmatter สำหรับข้อมูลลูกค้า ชื่อโครงการ และวันที่
4. WHEN ผู้ใช้สร้างโครงการใหม่จาก Project_Template, THE Project_Template SHALL ให้โครงสร้างที่พร้อมลิงก์ไปยังเอกสารอ้างอิงของแต่ละหน่วยกระบวนการและไปยังเทมเพลตปฏิบัติการที่มีอยู่ (Feasibility, spec sheet, แผนงานช่างติดตั้งรายวัน)
5. THE Vault_Builder SHALL วางเทมเพลตปฏิบัติการที่มีอยู่เดิม (`Template Feasibility By Daph decor send 251019.xlsx`, `interior-designer-sample-spec sheet-template.xlsx`, `แผนการทำงานช่างติดตั้ง ประจำวัน.xlsx`) ไว้ใน `03-Resources` พร้อม Index_Note

### Requirement 15: คำแนะนำและการตั้งค่าปลั๊กอิน

**User Story:** ในฐานะผู้ใช้ ฉันต้องการคำแนะนำปลั๊กอินที่จำเป็นพร้อมวิธีตั้งค่า เพื่อให้ฟีเจอร์อย่าง Dashboard และเทมเพลตทำงานได้เต็มประสิทธิภาพ

#### Acceptance Criteria

1. THE Vault_Builder SHALL สร้างโน้ตคำแนะนำที่ระบุปลั๊กอินที่แนะนำ ได้แก่ Dataview, Templater, และ Excalidraw
2. THE โน้ตคำแนะนำ SHALL อธิบายว่าแต่ละปลั๊กอินใช้ทำอะไรในบริบทของ Vault นี้
3. WHERE Home_Dashboard หรือ MOC ใช้ query แบบ Dataview, THE Vault_Builder SHALL ระบุไว้ในโน้ตคำแนะนำว่าต้องติดตั้ง Dataview เพื่อให้แสดงผลถูกต้อง
4. THE โน้ตคำแนะนำ SHALL ระบุขั้นตอนการเปิดใช้งานปลั๊กอินแต่ละตัวภายใน Obsidian

### Requirement 16: ปล่อย Knowledge_Export แบบ machine-readable ให้ชั้น workflow บริโภค

**User Story:** ในฐานะระบบ workflow (`monolith-workflow-copilot`) ฉันต้องการข้อมูล QMS ในรูป JSON ที่เครื่องอ่านได้ (process model + PFMEA risk + RACI + quorum + freshness) เพื่อขับเคลื่อน handoff/approval/Copilot โดยไม่ต้อง query Obsidian โดยตรง (อ้าง ADR-009)

#### Acceptance Criteria

1. THE Vault_Builder SHALL ปล่อยไฟล์ Knowledge_Export หนึ่งไฟล์ (`_knowledge-export.json`) ที่รากของ Vault ปลายทาง
2. THE Knowledge_Export SHALL มีโมเดลกระบวนการ canonical แบบ 0-based ต่อเนื่อง ครอบคลุมทั้งสามกลุ่ม โดยฝั่ง Office แยกขั้น 3D เป็น `3D_Presentation` และ `3D_Rendering_Final` ตาม ADR-010 (รวม 28 ขั้น)
3. THE Knowledge_Export SHALL ระบุต่อแต่ละ PFMEA_Risk_Row: ค่าดิบ SEV/OCC/DET, `rpn`, `action_priority`, และ `rpn_status` หนึ่งค่าจาก {computed, severity_only, not_assessed} ตาม ADR-011/012
4. THE Vault_Builder SHALL ตีความค่า OCC = 0 หรือว่าง และ DET ว่าง ว่าเป็น "ยังไม่ประเมิน" (ไม่ใช่ค่าต่ำสุด) และตั้ง `rpn_status` ให้สอดคล้อง
5. THE Knowledge_Export SHALL เก็บ provenance ต่อ PFMEA_Risk_Row อย่างน้อย `source_file` และ `source_step` และ SHALL เลือกฉบับ PFMEA canonical หนึ่งฉบับต่อ Process_Step โดยไม่รวม (merge) หลายฉบับเข้าด้วยกัน ตาม ADR-013
6. THE Knowledge_Export SHALL มี RACI_Map พร้อมระดับ `raci_status` และ `confidence` ต่อรายการ และ WHILE ยังมีรายการที่ยังไม่ยืนยัน THE `raci_status` SHALL เป็น `draft`
7. THE Knowledge_Export SHALL มี Knowledge_Freshness (`source_version`, `imported_at`, `review_status`) ที่สะท้อนความจริง โดย IF RACI ยัง draft หรือ PFMEA ฝั่งใดยัง not_assessed THEN `review_status` SHALL ไม่เป็น `approved`
8. THE Knowledge_Export SHALL ผ่าน schema validation เข้มก่อนเขียนลงดิสก์ และ IF validation ไม่ผ่าน THEN THE Vault_Builder SHALL ไม่เขียนทับไฟล์เดิม (คง last-good)
9. THE การปล่อย Knowledge_Export SHALL เป็นแบบ fail-soft ภายใน pipeline — IF การปล่อยล้มเหลว THEN การสร้าง Obsidian Vault หลัก SHALL ยังเสร็จสมบูรณ์
10. THE Vault_Builder SHALL ปรับรหัสเอกสาร Installation ที่ซ้ำในต้นฉบับ (JES/SOS ชีต 7–16) ให้ไม่ซ้ำตามลำดับชีตก่อนปล่อย โดยไม่แก้ไฟล์ Excel ต้นฉบับ (non-destructive)
