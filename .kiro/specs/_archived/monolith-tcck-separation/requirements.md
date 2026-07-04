# Requirements Document

## Introduction

ฟีเจอร์นี้มีเป้าหมายเพื่อ **แยกสองโปรเจกต์ "MONOLITH" และ "TCCK" ออกจากกันอย่างเด็ดขาด** ให้แต่ละโปรเจกต์เป็นอิสระและพึ่งพาตนเองได้ (self-contained) โดยไม่ทำให้กระบวนการ build, การทดสอบ (tests) หรือสายโซ่ธรรมาภิบาล (governance chain) ของฝ่ายใดฝ่ายหนึ่งเสียหาย

ปัจจุบันทั้งสองโปรเจกต์มีขนาดใหญ่มากและเดิมเคยตั้งใจรวม/จัดการไว้ด้วยกัน เอกสารธรรมาภิบาลของ TCCK (`_CURRENT-STATE.md` rev-5, 2026-05-18) ได้ระบุไว้แล้วว่า "MONOLITH reclassified as SEPARATE PROJECT not TCCK companion — only shares Sub-Agent Ecosystem" ซึ่งยืนยันว่าทั้งสองเป็นคนละโปรเจกต์กัน และสิ่งที่ยังใช้ร่วมกันคือชุดเครื่องมือ Sub-Agent Ecosystem (เช่น เครื่องมือใน `.claude/` ได้แก่ prompts, gates, commands, plugins อย่าง ralph-wiggum)

ขอบเขตของข้อกำหนดนี้ครอบคลุม: การจัดทำบัญชีรายการ (inventory) สิ่งที่ใช้ร่วมกันหรือพันกันอยู่, การนิยามสถานะปลายทางที่แยกขาดจากกัน (desired separated end-state), แนวทางจัดการ Sub-Agent Ecosystem ที่ใช้ร่วมกัน, ข้อกำหนดด้านความปลอดภัยและการไม่ถดถอย (non-regression), และการสืบย้อน/จัดทำเอกสารกำกับการแยกโปรเจกต์

> หมายเหตุ: เอกสารนี้กำหนด "สิ่งที่ต้องเป็น" (what) ไม่ใช่ "วิธีทำ" (how) รายละเอียดเชิงเทคนิคจะถูกกำหนดในเอกสารการออกแบบ (design) ต่อไป

## Glossary

- **MONOLITH**: โปรเจกต์ระบบออกแบบและผลิตเฟอร์นิเจอร์บิลท์อิน/ตู้ครัวแบบพาราเมตริก (v2.1.0) ปรัชญา "Design is Free — Manufacturing is Deterministic" สแตก React + TypeScript + Vite + Three.js (R3F) + Zustand, Express server, Python PyOCC kernel, Ed25519 signer service ตั้งอยู่ที่ `c:\Users\thai3\OneDrive\Documents\MONOLITH\determined-williams (3)\determined-williams (2)\determined-williams`
- **TCCK**: โปรเจกต์ระบบ Thai Cloud Kitchen + แฟรนไชส์ (แอป "โคตรไทย 2 — Master PDI · ERP") สแตก React 19 + Vite 6 + Supabase + Playwright ตั้งอยู่ที่ `C:\Users\thai3\TCCK-All-Projects-Backup` (อยู่นอก workspace ปัจจุบัน)
- **Separation_System**: ระบบ/กระบวนการที่รับผิดชอบการแยกโปรเจกต์ตามข้อกำหนดในเอกสารนี้ (รวมสคริปต์ ขั้นตอน และเอกสารกำกับ)
- **Sub_Agent_Ecosystem**: ชุดเครื่องมือ AI ที่ทั้งสองโปรเจกต์ใช้ร่วมกัน ประกอบด้วยเนื้อหาในไดเรกทอรี `.claude/` เช่น `commands/`, `prompts/`, `gates/`, `plugins/` (รวม `ralph-wiggum`), `docs/`
- **Shared_Asset**: ไฟล์ ไดเรกทอรี การตั้งค่า หรือทรัพยากรใด ๆ ที่ปัจจุบันถูกใช้หรืออ้างอิงโดยทั้ง MONOLITH และ TCCK
- **Entanglement**: จุดที่โปรเจกต์ทั้งสองพันกัน เช่น การอ้างอิงข้ามโปรเจกต์ การใช้ไฟล์ร่วม หรือเอกสารธรรมาภิบาลที่กล่าวถึงอีกโปรเจกต์หนึ่ง
- **Inventory_Report**: เอกสารบัญชีรายการที่บันทึก Shared_Asset และ Entanglement ทั้งหมดที่ตรวจพบ
- **Governance_Chain**: ระบบเอกสารธรรมาภิบาลแบบ append-only ของแต่ละโปรเจกต์ (เช่น `_CURRENT-STATE.md`, `DECISIONS.md`, `CLAUDE.md` ของ TCCK และ `.claude/context.md`, `.claude/decisions.md`, `.claude/progress.md` ของ MONOLITH)
- **Trust_Chain**: สายโซ่ความน่าเชื่อถือของ MONOLITH ที่ใช้ Ed25519 + SHA-256 ในกระบวนการ export
- **Baseline**: ผลลัพธ์ที่บันทึกไว้ของ build, test และ governance ของแต่ละโปรเจกต์ ก่อนเริ่มกระบวนการแยก ใช้เป็นเกณฑ์เปรียบเทียบการไม่ถดถอย
- **Separation_Strategy**: แนวทางที่ผู้ใช้เลือกในการจัดการ Sub_Agent_Ecosystem ได้แก่ "ทำสำเนาแยกต่อโปรเจกต์ (duplicate)" หรือ "สกัดไปยังตำแหน่งกลางที่ใช้ร่วมกัน (extract to shared location)"

## Requirements

### Requirement 1: จัดทำบัญชีรายการสิ่งที่ใช้ร่วมกันและจุดที่พันกัน

**User Story:** ในฐานะเจ้าของโปรเจกต์ ฉันต้องการบัญชีรายการครบถ้วนของทุกสิ่งที่ MONOLITH และ TCCK ใช้ร่วมกันหรือพันกันอยู่ เพื่อให้ฉันเข้าใจขอบเขตงานแยกโปรเจกต์ก่อนลงมือเปลี่ยนแปลง

#### Acceptance Criteria

1. WHEN กระบวนการแยกเริ่มต้น THE Separation_System SHALL บันทึกขอบเขตที่ตรวจสอบ (scan scope) โดยอ้างอิงไดเรกทอรีรากของ MONOLITH และ TCCK ตามที่นิยามใน Glossary ลงใน Inventory_Report
2. WHEN กระบวนการตรวจสอบดำเนินการ THE Separation_System SHALL บันทึก Shared_Asset ทุกรายการที่อยู่ภายในขอบเขตที่ตรวจสอบลงใน Inventory_Report โดยแต่ละรายการระบุตำแหน่งไฟล์ (path) และโปรเจกต์ที่อ้างอิงถึง (MONOLITH, TCCK หรือทั้งสอง)
3. THE Separation_System SHALL บันทึก Entanglement แต่ละรายการลงใน Inventory_Report โดยจัดประเภทเป็นหนึ่งในสามประเภทเท่านั้น ได้แก่ (ก) ไฟล์/ไดเรกทอรีที่ใช้ร่วมกัน (ข) การอ้างอิงข้ามโปรเจกต์ (ค) การกล่าวถึงในเอกสารธรรมาภิบาล
4. THE Separation_System SHALL ระบุใน Inventory_Report สำหรับ Shared_Asset แต่ละรายการด้วยค่าธงแบบใช่/ไม่ใช่ (yes/no) ว่าเป็นสมาชิกของ Sub_Agent_Ecosystem หรือไม่
5. THE Inventory_Report SHALL ระบุการจัดสรร (allocation) ของ Shared_Asset แต่ละรายการเป็นหนึ่งในสามค่าเท่านั้น ได้แก่ MONOLITH | TCCK | ทรัพยากรที่ใช้ร่วมกัน
6. IF ตรวจไม่พบ Shared_Asset หรือ Entanglement ใด ๆ ภายในขอบเขตที่ตรวจสอบ THEN THE Separation_System SHALL บันทึกผลว่า "ไม่พบรายการ" ลงใน Inventory_Report พร้อมระบุขอบเขตที่ตรวจสอบ
7. IF ตำแหน่งที่ต้องตรวจสอบเข้าถึงไม่ได้ THEN THE Separation_System SHALL ทำเครื่องหมายว่า Inventory_Report ไม่สมบูรณ์ พร้อมระบุสาเหตุและตำแหน่งที่เข้าถึงไม่ได้ (เช่น TCCK อยู่นอก workspace ปัจจุบัน)

### Requirement 2: นิยามสถานะปลายทางที่แยกขาดจากกัน

**User Story:** ในฐานะเจ้าของโปรเจกต์ ฉันต้องการนิยามสถานะปลายทางที่แต่ละโปรเจกต์เป็นอิสระและพึ่งพาตนเองได้ เพื่อให้มีเกณฑ์ชัดเจนว่าการแยกเสร็จสมบูรณ์เมื่อใด

#### Acceptance Criteria

1. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL จัดให้ MONOLITH มี workspace ของตนเองที่มีจำนวนการอ้างอิง (import, เส้นทางไฟล์, ไฟล์คอนฟิก) ไปยัง TCCK เท่ากับ 0 รายการ
2. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL จัดให้ TCCK มี workspace ของตนเองที่มีจำนวนการอ้างอิง (import, เส้นทางไฟล์, ไฟล์คอนฟิก) ไปยัง MONOLITH เท่ากับ 0 รายการ
3. IF ยังพบการอ้างอิงข้ามโปรเจกต์หลงเหลือ THEN THE Separation_System SHALL ถือว่าการแยกไม่สมบูรณ์ และแสดงรายการการอ้างอิงที่เหลือแต่ละรายการพร้อมตำแหน่ง (path) และโปรเจกต์ปลายทาง
4. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL จัดให้แต่ละโปรเจกต์มีเอกสารกำกับ (documentation) ของตนเองที่แยกจากกัน
5. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL จัดให้แต่ละโปรเจกต์มี Governance_Chain ของตนเองที่แยกจากกัน
6. WHERE มีทรัพยากรที่ผู้ใช้ตัดสินใจให้ใช้ร่วมกัน THE Separation_System SHALL วางทรัพยากรนั้นไว้เพียงตำแหน่งเดียวซึ่งอยู่นอกไดเรกทอรีภายในของทั้งสองโปรเจกต์ และทั้งสองโปรเจกต์อ้างอิงได้
7. THE Separation_System SHALL จัดทำรายการเกณฑ์ตรวจรับ (checklist) ที่ประเมินแต่ละเงื่อนไขเป็นค่าทวิภาค ผ่าน/ไม่ผ่าน และถือว่าการแยกเสร็จสมบูรณ์เฉพาะเมื่อทุกเงื่อนไขมีค่า ผ่าน เท่านั้น

### Requirement 3: บันทึก Baseline ก่อนการแยก

**User Story:** ในฐานะวิศวกร ฉันต้องการบันทึกสถานะ build, test และ governance ของแต่ละโปรเจกต์ก่อนเริ่มแยก เพื่อให้สามารถเปรียบเทียบและตรวจสอบการไม่ถดถอยได้ภายหลัง

#### Acceptance Criteria

1. WHEN กระบวนการแยกเริ่มต้น THE Separation_System SHALL บันทึก Baseline ของผลการ build ของ MONOLITH และ TCCK พร้อมวันเวลา (timestamp) โดยสถานะ build เป็นหนึ่งในค่าต่อไปนี้เท่านั้น: สำเร็จ | ล้มเหลว | กำลังดำเนินการ
2. WHEN กระบวนการแยกเริ่มต้น THE Separation_System SHALL บันทึก Baseline ของผลการทดสอบ (test) ของ MONOLITH และ TCCK โดยจำนวนการทดสอบที่ผ่านและจำนวนที่ไม่ผ่านเป็นจำนวนเต็มที่ไม่เป็นลบ (non-negative integer) ทั้งสองค่า
3. WHEN กระบวนการแยกเริ่มต้น THE Separation_System SHALL บันทึกสถานะปัจจุบันของ Governance_Chain ของแต่ละโปรเจกต์ลงใน Baseline ไม่ว่า Governance_Chain จะอยู่ในสถานะใด
4. THE Separation_System SHALL จัดเก็บ Baseline ในโครงสร้างและชุดฟิลด์เดียวกันกับผลลัพธ์หลังการแยก เพื่อให้เปรียบเทียบได้แบบฟิลด์ต่อฟิลด์ (field-by-field)
5. IF ไม่สามารถระบุสถานะ build หรือ test ของโปรเจกต์ใดได้ THEN THE Separation_System SHALL บันทึกค่าสถานะนั้นเป็น "ไม่สามารถระบุได้" และดำเนินการต่อ
6. IF การจัดเก็บ Baseline ล้มเหลว THEN THE Separation_System SHALL หยุดก่อนเริ่มการแยก คงสถานะเดิมของทั้งสองโปรเจกต์ และแสดงข้อผิดพลาด

### Requirement 4: จัดการ Sub-Agent Ecosystem ที่ใช้ร่วมกัน

**User Story:** ในฐานะเจ้าของโปรเจกต์ ฉันต้องการกำหนดวิธีจัดการ Sub_Agent_Ecosystem ที่ทั้งสองโปรเจกต์ใช้ร่วมกัน เพื่อให้แต่ละโปรเจกต์ยังคงใช้เครื่องมือ AI ได้หลังการแยกตามแนวทางที่ฉันเลือก

#### Acceptance Criteria

1. THE Separation_System SHALL รองรับ Separation_Strategy สองแบบ ได้แก่ การทำสำเนาแยกต่อโปรเจกต์ และการสกัดไปยังตำแหน่งกลางที่ใช้ร่วมกัน
2. WHERE ผู้ใช้เลือก Separation_Strategy แบบทำสำเนาแยก THE Separation_System SHALL จัดให้แต่ละโปรเจกต์มีสำเนาของ Sub_Agent_Ecosystem ภายใน workspace ของตนเอง โดยการแก้ไขสำเนาในโปรเจกต์หนึ่งต้องไม่กระทบสำเนาในอีกโปรเจกต์หนึ่ง
3. WHERE ผู้ใช้เลือก Separation_Strategy แบบสกัดไปยังตำแหน่งกลาง THE Separation_System SHALL วาง Sub_Agent_Ecosystem ไว้ในตำแหน่งกลางหนึ่งตำแหน่ง และสร้างการอ้างอิงจากทั้ง MONOLITH และ TCCK ไปยังตำแหน่งกลางเดียวกันนั้น
4. WHEN จัดการ Sub_Agent_Ecosystem เสร็จสิ้น THE Separation_System SHALL จัดให้จำนวนรายการแยกตามประเภท (commands, prompts, gates, plugins) ในผลลัพธ์ตรงกับจำนวนในแหล่งต้นทาง และแต่ละรายการเข้าถึงได้จากแต่ละโปรเจกต์
5. IF ผู้ใช้เลือก Separation_Strategy แบบทำสำเนาแยกแต่ไม่สามารถสร้างสำเนาใน workspace ได้ (เช่น สิทธิ์ไม่พอหรือพื้นที่ดิสก์ไม่พอ) THEN THE Separation_System SHALL คืน workspace สู่สถานะก่อนเริ่ม โดยไม่มีสำเนาบางส่วนค้างอยู่ และรายงานสาเหตุข้อผิดพลาด
6. IF ผู้ใช้เลือก Separation_Strategy แบบสกัดไปยังตำแหน่งกลางแต่ไม่สามารถสร้างตำแหน่งกลางหรือการอ้างอิงได้ THEN THE Separation_System SHALL คืน workspace สู่สถานะก่อนเริ่ม โดยไม่มีการสกัดบางส่วนค้างอยู่ และรายงานสาเหตุข้อผิดพลาด
7. IF การตรวจสอบความครบถ้วนของ Sub_Agent_Ecosystem หลังแยกไม่ผ่าน THEN THE Separation_System SHALL รายงานผลและระงับการประกาศว่าการแยกเสร็จสมบูรณ์
8. THE Separation_System SHALL บันทึก Separation_Strategy ที่ใช้ วันเวลา (timestamp) และเหตุผลลงในเอกสารกำกับการแยก

### Requirement 5: ความปลอดภัยและการไม่ถดถอยของแต่ละโปรเจกต์

**User Story:** ในฐานะวิศวกร ฉันต้องการให้กระบวนการแยกไม่ทำให้ build, test หรือ governance ของฝ่ายใดฝ่ายหนึ่งเสียหาย เพื่อให้ทั้งสองโปรเจกต์ยังทำงานได้เหมือนเดิมหลังการแยก

#### Acceptance Criteria

1. WHEN กระบวนการแยกเริ่มต้น THE Separation_System SHALL บันทึก Baseline ของแต่ละโปรเจกต์ก่อนทำการเปลี่ยนแปลงใด ๆ ประกอบด้วยสถานะ build, จำนวน error, จำนวน warning, จำนวนการทดสอบที่ผ่าน และจำนวนการทดสอบที่ไม่ผ่าน
2. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL ทำให้ MONOLITH มีผลการ build สำเร็จ จำนวน error เท่ากับ 0 และจำนวน warning น้อยกว่าหรือเท่ากับ Baseline
3. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL ทำให้ TCCK มีผลการ build สำเร็จ จำนวน error เท่ากับ 0 และจำนวน warning น้อยกว่าหรือเท่ากับ Baseline
4. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL ทำให้แต่ละโปรเจกต์มีจำนวนการทดสอบที่ผ่านมากกว่าหรือเท่ากับ Baseline และจำนวนการทดสอบที่ไม่ผ่านเท่ากับ 0
5. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL ทำให้ลายเซ็น Ed25519 และค่าแฮช SHA-256 ของ Trust_Chain ของ MONOLITH ตรวจสอบผ่าน 100% โดยมีจำนวนการตรวจสอบที่ล้มเหลวเท่ากับ 0
6. IF การตรวจสอบหลังการแยกพบว่าผลลัพธ์ของโปรเจกต์ใดถดถอยจาก Baseline THEN THE Separation_System SHALL รายงานชื่อโปรเจกต์และตัวชี้วัดที่ถดถอยแต่ละรายการ ระงับการประกาศว่าการแยกเสร็จสมบูรณ์ และคงสถานะของทั้งสองโปรเจกต์ไว้
7. THE Separation_System SHALL คงไว้ซึ่งความสมบูรณ์ของ Governance_Chain แบบ append-only ของแต่ละโปรเจกต์ โดยมีจำนวนรายการประวัติเดิมที่ถูกลบหรือแก้ไขเท่ากับ 0

### Requirement 6: การสืบย้อนและเอกสารกำกับการแยก

**User Story:** ในฐานะเจ้าของโปรเจกต์ ฉันต้องการเอกสารกำกับที่สืบย้อนได้ของทุกการเปลี่ยนแปลงในการแยก เพื่อให้เข้าใจได้ว่ามีอะไรถูกย้าย ทำสำเนา หรือเปลี่ยนแปลง และเพราะเหตุใด

#### Acceptance Criteria

1. WHEN Separation_System ย้ายหรือทำสำเนา Shared_Asset THE Separation_System SHALL บันทึกรายการลงในเอกสารกำกับการแยก โดยแต่ละรายการประกอบด้วย ประเภทการกระทำ ตำแหน่งต้นทาง ตำแหน่งปลายทาง วันเวลา (timestamp) และเหตุผล
2. WHEN เกิดการตัดสินใจสำคัญในการแยก (ได้แก่ การเลือก Separation_Strategy การจัดสรร Shared_Asset และการระงับการประกาศเสร็จสมบูรณ์) THE Separation_System SHALL เพิ่มรายการการตัดสินใจนั้นต่อท้าย Governance_Chain ของแต่ละโปรเจกต์แบบ append-only โดยไม่แก้ไขหรือลบรายการก่อนหน้า
3. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL อัปเดต `_CURRENT-STATE.md` ของ TCCK ให้สะท้อนสถานะที่แยกขาดจาก MONOLITH แล้ว
4. THE เอกสารกำกับการแยก SHALL เชื่อมโยงรายการการเปลี่ยนแปลงแต่ละรายการกลับไปยังรายการใน Inventory_Report ผ่านตัวระบุ (identifier) ที่อ้างถึงแถวเดียวใน Inventory_Report
5. WHEN การแยกเสร็จสมบูรณ์ THE Separation_System SHALL จัดทำสรุปผลที่ระบุสถานะ ผ่าน/ไม่ผ่าน ของเกณฑ์ตรวจรับใน checklist แต่ละข้อ
6. IF การเขียนเอกสารกำกับการแยกล้มเหลว THEN THE Separation_System SHALL ระงับการประกาศว่าการแยกเสร็จสมบูรณ์ และแสดงข้อผิดพลาดพร้อมรายการที่เขียนไม่สำเร็จ
7. IF เกณฑ์ตรวจรับใน checklist ข้อใดมีค่า ไม่ผ่าน THEN THE Separation_System SHALL รายงานเกณฑ์ที่ไม่ผ่านแต่ละข้อและทำเครื่องหมายว่าการแยกไม่สมบูรณ์
8. IF รายการการเปลี่ยนแปลงใดไม่สามารถจับคู่กับรายการใน Inventory_Report ได้ THEN THE Separation_System SHALL ทำเครื่องหมายรายการนั้นว่าไม่จับคู่ (unmatched) และรายงานเพื่อให้ตรวจสอบ
