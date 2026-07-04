# Implementation Plan: DAPH Obsidian Second Brain (Vault_Builder)

## Overview

แผนนี้แปลงดีไซน์ของ **Vault_Builder** (สคริปต์ Node.js + TypeScript) เป็นชุดงานเขียนโค้ดแบบเพิ่มทีละขั้น เครื่องมือนี้อยู่แบบ self-contained ภายใน `determined-williams/` อ่านเอกสารสองโดเมน (Hardware + Process) แล้วสร้าง Obsidian Vault เดียวที่ `determined-williams/daph-second-brain/`

แนวทาง:

- **Self-contained:** โค้ดเครื่องมืออยู่ใต้ `determined-williams/tools/vault-builder/` (ตรงกับ `workspaces: tools/*`) เอาต์พุต Vault อยู่ที่ `determined-williams/daph-second-brain/`
- **Test-first ตรงจุดที่เป็น property:** Correctness Properties ทั้ง 15 ข้อในดีไซน์ map เป็น property-based test (fast-check + Vitest) อย่างละหนึ่งเทสต์ รันอย่างน้อย 100 iterations และติดแท็กคอมเมนต์ `// Feature: daph-obsidian-second-brain, Property N: ...`
- **Non-destructive / Idempotent / Thai-safe:** ทุกขั้นคัดลอกไฟล์ (ไม่แก้ต้นฉบับ) เขียน UTF-8 และรันซ้ำได้ผลเดิม
- ข้อมูลต้นทางจริงที่ใช้: `New folder/` (Excel), `_daph_extract/` (ข้อความที่แตกแล้ว + `_INDEX.json`), `furniture-hardware-vault/` (Hardware), `New folder (2)/` (PDF แค็ตตาล็อก)

หมายเหตุ: งานย่อยที่ลงท้ายด้วย `*` เป็นงานทดสอบ (optional) สามารถข้ามได้สำหรับ MVP แต่แนะนำให้ทำเพื่อความถูกต้อง งานหลัก (ไม่มี `*`) ต้องทำเสมอ

## Tasks

- [x] 1. ตั้งค่าสแคโฟลด์เครื่องมือ Vault_Builder และชนิดข้อมูลกลาง
  - [x] 1.1 สร้างสแคโฟลด์โปรเจกต์เครื่องมือและเพิ่ม dependency ที่จำเป็น
    - สร้างโฟลเดอร์ `tools/vault-builder/` พร้อม `package.json`, `tsconfig.json`, และ `vitest.config.ts` (เปิด ESM ให้ตรงกับ root `"type": "module"`)
    - เพิ่ม dependency `xlsx` (SheetJS) สำหรับอ่าน `.xls` BIFF (root มีแค่ `exceljs` ซึ่งอ่าน `.xls` ไม่ได้) ใช้ `vitest` + `fast-check` ที่มีอยู่แล้วใน root
    - กำหนด path คงที่ของแหล่งข้อมูลและปลายทาง (Hardware_Source, Process_Source, Extract_Folder, ปลายทาง `daph-second-brain/`)
    - _Requirements: 1.1_

  - [x] 1.2 นิยามชนิดข้อมูลกลางและค่าคงที่ canonical
    - สร้าง `src/types.ts`: `SourceFile`, `Domain`, `SubProcessGroup`, `DocumentType`, `StatusTag`, `ProcessUnit`, `Classification`, `InventoryEntry`, `Inventory`, `XlsConversionResult`, `DocumentSet`
    - สร้าง `src/constants.ts`: ลำดับ canonical ของแต่ละกลุ่ม (Office 5 แผนก, Factory 6 สถานี, Installation 16 ขั้นตอน), ตาราง keyword→group/unit, taxonomy ของแท็ก (`domain/`, `group/`, `unit/`, `type/`, `status/`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.5_

- [x] 2. Scanner — สแกนไฟล์จากทั้งสองโดเมน
  - [x] 2.1 implement `scan(hardwareRoots, processRoots)` ใน `src/scanner.ts`
    - อ่านไฟล์ recursive จาก Hardware_Source (`furniture-hardware-vault/`, `New folder (2)/`) และ Process_Source (`New folder/`)
    - คืน `SourceFile[]` พร้อม `domainHint`, `ext`, `sizeBytes`; ไฟล์อ่านไม่ได้บันทึกเป็น warning ไม่ throw (fail-soft)
    - เพิ่มตัวอ่าน `_INDEX.json` ของ Extract_Folder เพื่อระบุไฟล์ที่แตกข้อความแล้วและรายการ `xls_unsupported` (มี fallback เมื่อหาไฟล์ไม่พบ/parse ไม่ได้)
    - _Requirements: 1.1, 1.5_

- [x] 3. Classifier — จัดประเภท Domain / Type / Unit(s) / Status (test-first)
  - [x] 3.1 implement `classify(file, index)` ใน `src/classifier.ts`
    - ใช้ลำดับกฎ deterministic: Hardware short-circuit → junk detection → Document_Type → Process_Unit(s)+group (อิงชื่อชีตจาก extract ก่อน แล้วจึงชื่อไฟล์) → Status_Tag → owner regex `P'[\wก-๙]+`
    - รองรับ multi-unit (เช่น `1.SOS DAPH, Main Process.xlsx`=5 แผนก Office, `1.SOS DAPH.xlsx`=6 สถานี Factory) โดยไม่สมมติว่าหนึ่งไฟล์=หนึ่งหน่วย
    - _Requirements: 1.2, 1.3, 1.4, 2.5, 2.6, 9.3, 10.3_

  - [x]* 3.2 เขียน property test สำหรับ total classification
    - **Property 1: Total classification และค่าอยู่ในเซ็ตที่กำหนด**
    - **Validates: Requirements 1.2, 1.3, 2.1**

  - [x]* 3.3 เขียน property test สำหรับ junk exclusivity
    - **Property 2: Junk exclusivity** (`isJunk === true` ⟺ `documentType === null`, junk → `archived`)
    - **Validates: Requirements 1.4, 10.1**

  - [x]* 3.4 เขียน property test สำหรับ status tag domain
    - **Property 3: Status tag อยู่ในโดเมนที่กำหนด** ({active, draft, revise, archived})
    - **Validates: Requirements 11.4, 10.3**

  - [x]* 3.5 เขียน property test สำหรับ multi-unit tagging
    - **Property 4: Multi-unit tagging correctness** (เซ็ตแท็ก `unit/*` ตรงกับ `units`, แท็ก `group/*` ตรงกับ `group`)
    - **Validates: Requirements 2.5, 2.6, 11.2**

  - [x]* 3.6 เขียน unit test กรณีจัดประเภทตายตัว
    - `สำหรับคุณชุ.xlsx` → Master Matrix; `Citadines Arch ID KDR cklst.xls` → Project Doc; ลำดับ canonical ของสามกลุ่มถูกต้อง
    - _Requirements: 6.1, 3.5, 2.2, 2.3, 2.4_

- [x] 4. Inventory + Duplicate Detection + Placement + Naming
  - [x] 4.1 implement การสร้าง Inventory, ตรวจไฟล์ซ้ำ, แก้ path ปลายทาง และตั้งชื่อโน้ต ใน `src/inventory.ts`
    - ประกอบ `InventoryEntry` จาก `SourceFile` + `Classification`, คำนวณ `documentSetKey` (`group/unit`)
    - กำหนด `vaultRelativePath` ตามกฎ placement (junk/draft/revise→`04-Archives`, single-unit→โฟลเดอร์หน่วย, multi-unit→โฟลเดอร์กลุ่ม, Project Doc→`01-Projects`, ไม่สังกัดหน่วย→`03-Resources`)
    - ตั้งชื่อโน้ตตาม Naming_Convention `{Type}-{Group|Unit}-{ชื่อย่อ}` + ตัวแก้ชื่อชน (เติม suffix ` (2)`) โดยไม่ใส่ owner token ในชื่อ
    - ตรวจไฟล์ซ้ำด้วยคีย์ (Document_Type + group + units) ตั้ง `duplicateOf`; เขียน `daph-second-brain/_inventory.json`
    - _Requirements: 1.6, 3.4, 3.6, 9.1, 9.3, 9.4, 10.1, 10.2, 10.6_

  - [x]* 4.2 เขียน property test สำหรับ duplicate detection
    - **Property 15: Duplicate detection**
    - **Validates: Requirements 10.6**

  - [x]* 4.3 เขียน property test สำหรับ placement correctness
    - **Property 11: Placement correctness**
    - **Validates: Requirements 3.4, 3.6, 10.1, 10.2**

  - [x]* 4.4 เขียน property test สำหรับ naming uniqueness
    - **Property 12: Naming uniqueness** (ไม่มี `noteRelativePath` ซ้ำ, ชื่อไม่มี owner token)
    - **Validates: Requirements 9.4, 9.3**

- [x] 5. ยูทิลิตี้ระบบไฟล์ UTF-8-safe และโครงสร้าง PARA
  - [x] 5.1 implement `src/fs-utils.ts`
    - `writeUtf8`/`readUtf8` เขียนผ่าน temp แล้ว rename (atomic, idempotent), สร้างโครงสร้าง PARA (`01-Projects`, `02-Areas`, `03-Resources`, `04-Archives`)
    - คงโครงสร้างเดิมของ `furniture-hardware-vault` ใต้ `02-Areas/Hardware/` และสร้างโฟลเดอร์ Process สามกลุ่มพร้อมโฟลเดอร์ย่อยตามหน่วย
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 9.5_

  - [x]* 5.2 เขียน property test สำหรับ Thai round-trip
    - **Property 13: Thai character integrity (round-trip)** (เขียน→อ่าน UTF-8 เป็น identity)
    - **Validates: Requirements 9.5**

- [x] 6. XlsConverter — แปลงไฟล์ `.xls` ที่อ่านไม่ได้ให้ค้นหาได้
  - [x] 6.1 implement `convertXls(absolutePath)` ใน `src/xls-converter.ts`
    - กลยุทธ์ลำดับชั้น: SheetJS (`XLSX.readFile` + `sheet_to_csv`) → LibreOffice headless (`soffice --headless --convert-to`) → attach-only พร้อมเหตุผล
    - คืน `XlsConversionResult { ok, method, text, reason }`; ตรวจการมี/ไม่มี LibreOffice แล้วข้ามไป attach-only เมื่อไม่พบ
    - _Requirements: 7.1, 7.3_

  - [x]* 6.2 เขียน unit test สำหรับลำดับ fallback ของการแปลง
    - ทดสอบ SheetJS สำเร็จ, จำลอง SheetJS ล้มเหลว→LibreOffice/attach-only, และกรณีไม่มี LibreOffice
    - _Requirements: 7.1, 7.3_

- [x] 7. FileMover — คัดลอกไฟล์เข้า Vault แบบ non-destructive + move log
  - [x] 7.1 implement การคัดลอกไฟล์และเขียน `_move-log.md` ใน `src/file-mover.ts`
    - คัดลอก (ไม่ย้าย/ไม่แก้ต้นฉบับ) ทุกไฟล์ไปยัง `vaultRelativePath`; junk/draft/revise → `04-Archives`
    - บันทึก move log ทุกรายการพร้อมตำแหน่งเดิมและตำแหน่งใหม่; คงอย่างน้อยหนึ่งสำเนาของทุกไฟล์ต้นทาง
    - _Requirements: 10.1, 10.4, 10.5_

  - [x]* 7.2 เขียน property test สำหรับ no file loss + move log
    - **Property 10: No file loss + move-log completeness**
    - **Validates: Requirements 10.4, 10.5**

- [x] 8. NoteGenerator — สร้าง Index_Note หนึ่งโน้ตต่อไฟล์ non-junk
  - [x] 8.1 implement `generateIndexNote(entry, extractText, neighbors)` ใน `src/note-generator.ts`
    - frontmatter ครบ (domain, doc_type, group, units, status, owner, document_set, source_file, tags), embed ไฟล์ต้นฉบับด้วย `![[...]]`
    - หัวข้อย่อยรายหน่วย/ชีตสำหรับ multi-unit, ลิงก์ prev/next ตามลำดับ canonical, ลิงก์คำย่อไป Glossary
    - กรณี `.xls`: ฝังข้อความที่แปลงได้เมื่อ `ok=true` หรือใส่หมายเหตุ "เปิดด้วย Excel" + เหตุผลเมื่อ `ok=false`; สร้างโน้ตให้ไฟล์ non-junk เสมอ
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.2, 7.3, 7.4, 11.1, 11.2, 11.3, 11.4, 12.5_

  - [x]* 8.2 เขียน property test สำหรับ one note per non-junk file
    - **Property 5: One Index_Note per non-junk file (รวมการจัดการ .xls)**
    - **Validates: Requirements 4.1, 7.4**

  - [x]* 8.3 เขียน property test สำหรับ xls outcome ในโน้ต
    - **Property 6: XLS conversion outcome สะท้อนในโน้ต**
    - **Validates: Requirements 7.2, 7.3**

  - [x]* 8.4 เขียน property test สำหรับ process-order linkage
    - **Property 7: Process-order linkage** (prev/next ตาม canonical order ของกลุ่ม)
    - **Validates: Requirements 4.6**

  - [x]* 8.5 เขียน unit test สำหรับ frontmatter และ auto-link Glossary
    - ตรวจฟิลด์ frontmatter ครบและคำย่อ (SOS/JES/PFMEA/MC) ลิงก์ไป Glossary
    - _Requirements: 4.3, 12.5_

- [x] 9. DocumentSetLinker — ลิงก์ SOS↔JES↔PFMEA↔Process Control Plan
  - [x] 9.1 implement `buildDocumentSets(inv)` + `crossLink(sets)` ใน `src/document-set-linker.ts`
    - จับกลุ่มสมาชิกตามคีย์ `group/unit` (เอกสาร multi-unit เป็นสมาชิกหลายชุด), ลิงก์ข้ามแบบสมมาตรเฉพาะสมาชิกที่มีอยู่จริง
    - parse `JES-\d+` / `MC-\d+` จากเนื้อหา SOS แล้วลิงก์ไป JES ที่ตรง; รหัสที่ไม่มีปลายทางแสดงเป็นข้อความธรรมดา + warning
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.5_

  - [x]* 9.2 เขียน property test สำหรับ document-set completeness/symmetry
    - **Property 8: Document-set completeness และ symmetry**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5, 7.5**

  - [x]* 9.3 เขียน property test สำหรับ JES/MC linkage
    - **Property 9: SOS แสดงและลิงก์รหัส JES/MC ที่พบ**
    - **Validates: Requirements 5.3**

- [x] 10. Checkpoint — ตรวจ pipeline แกนกลางผ่าน
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. MOCGenerator — สร้าง MOC ต่อหน่วย / ต่อกลุ่ม / Hardware
  - [x] 11.1 implement `src/moc-generator.ts`
    - Unit MOC หนึ่งโน้ตต่อหน่วย (ลิงก์ Index_Note ทุกไฟล์ในหน่วย จัดกลุ่มตาม Document_Set), Group MOC สามกลุ่ม, ลิงก์ไป Hardware MOC เดิมโดยไม่สร้างใหม่
    - ใส่ Dataview query + fallback ลิงก์ static
    - _Requirements: 3.2, 8.2, 8.3, 8.4_

  - [x]* 11.2 เขียน property test สำหรับ MOC link completeness
    - **Property 14: MOC link completeness**
    - **Validates: Requirements 8.3, 8.4**

- [x] 12. DashboardGenerator — Home + Mermaid 3-group flow
  - [x] 12.1 implement `src/dashboard-generator.ts`
    - สร้าง `Home.md` ที่รากของ Vault ลิงก์ไป Hardware MOC + สามกลุ่ม Process MOC + Glossary + Master Matrix + Process Flow
    - ฝัง Mermaid flow สามกลุ่มตามลำดับ (Office → Factory → Installation) แต่ละ node ลิงก์ไป Unit MOC
    - _Requirements: 8.1, 8.2, 8.5, 13.1, 13.2, 13.3, 13.4_

  - [x]* 12.2 เขียน unit test สำหรับ Home links และ Mermaid blocks
    - ตรวจลิงก์ครบและมีบล็อก Mermaid สามกลุ่มตามลำดับพร้อมลิงก์หน่วย
    - _Requirements: 8.1, 8.2, 8.5, 13.2, 13.4_

- [x] 13. StaticAssets — Glossary, Master Matrix, Templates, Plugin Guide, Tag Reference
  - [x] 13.1 implement Glossary และ Tag-Reference ใน `src/static-assets.ts`
    - `03-Resources/Glossary.md`: คำย่อ (SOS/JES/PFMEA/RPN/MC_Code/MOC/PARA) + ซอฟต์แวร์ (Pytha/MaxCut/AutoCAD/3D Max) พร้อมชื่อเต็มและคำอธิบายไทย
    - `03-Resources/Tag-Reference.md`: รายการแท็กทั้งหมดรูปแบบ `<dim>/<slug>` พร้อมความหมาย
    - _Requirements: 11.5, 12.1, 12.2, 12.3, 12.4_

  - [x] 13.2 implement Master Matrix note
    - `03-Resources/Master-Matrix-สำหรับคุณชุ.md`: สรุปขอบเขต (Line sales → measure → Production → House design → 3D → Installation) + ระบุคอลัมน์เวลา/ต้นทุน + ลิงก์ไปสามกลุ่ม MOC
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 13.3 implement Project Template และ Index_Note ของเทมเพลตปฏิบัติการ
    - `03-Resources/Project-Template.md`: หัวข้อสามกลุ่ม + frontmatter ลูกค้า/โครงการ/วันที่ + ลิงก์ไปเทมเพลตปฏิบัติการ
    - คัดลอกเทมเพลตปฏิบัติการ (Feasibility, spec sheet, แผนงานช่างติดตั้งรายวัน) ไป `03-Resources/Templates/` พร้อม Index_Note
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 13.4 implement Plugin Guide
    - `03-Resources/Plugin-Guide.md`: อธิบาย Dataview/Templater/Excalidraw, บทบาทใน Vault นี้, การพึ่ง Dataview ของ MOC/Home, และขั้นตอนเปิดใช้งาน
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x]* 13.5 เขียน unit tests สำหรับเนื้อหา static assets
    - ตรวจ Glossary ครบคำย่อ/ซอฟต์แวร์, Tag-Reference สม่ำเสมอ, Master Matrix ขอบเขต+ลิงก์, Project Template หัวข้อ+frontmatter, Plugin Guide ครบสามปลั๊กอิน
    - _Requirements: 6.3, 11.5, 12.2, 12.3, 14.2, 14.3, 15.1_

- [x] 14. เชื่อมต่อ pipeline แบบ end-to-end และ CLI entry
  - [x] 14.1 implement `src/pipeline.ts` + `src/index.ts` (CLI)
    - ต่อขั้นตามลำดับ: Scanner → Classifier → Inventory/Duplicate → XlsConverter → FileMover → NoteGenerator → DocumentSetLinker → MOCGenerator → DashboardGenerator → StaticAssets
    - รับประกัน idempotency (เขียนทับโน้ตที่สร้างเอง ไม่สร้างไฟล์ซ้ำ), fail-soft ต่อไฟล์รายตัว, fail-fast ต่อข้อผิดพลาดเขียนดิสก์; เพิ่ม script รันใน `package.json`
    - _Requirements: 1.6, 6.5, 8.1, 10.4_

  - [x]* 14.2 เขียน integration test สำหรับ idempotency
    - รัน pipeline สองครั้งติดกันบนชุดข้อมูลตัวอย่าง แล้วยืนยันผลใน Vault ไม่เปลี่ยนและไม่เกิดไฟล์ซ้ำ
    - _Requirements: 10.4_

- [x] 15. Checkpoint — ตรวจ pipeline เต็มผ่าน
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Integration / Smoke run กับข้อมูลจริง
  - [x]* 16.1 เขียน smoke test รัน pipeline กับข้อมูลจริงใน `New folder/` และแหล่งอื่น
    - ยืนยัน: Scanner อ่านครบ + อ่าน `_INDEX.json`/`xls_unsupported` ถูกต้อง, XlsConverter แปลง `.xls` ตัวอย่างได้ข้อความค้นหาได้, โครงสร้าง PARA ครบ, Hardware domain ถูกคัดลอกคงโครงสร้างเดิมใต้ `02-Areas/Hardware/`
    - _Requirements: 1.1, 1.5, 3.1, 3.2, 3.7, 7.1_

- [x] 17. Knowledge_Export emitter (Phase 3 — ADR-009/010/011/012/013/014)
  - [x] 17.1 โมเดลกระบวนการ canonical 28 ขั้น + risk-scoring (RPN/Action Priority + rpn_status fail-safe)
    - `src/process-model.ts` (0-based, 3D สองขั้น), `src/risk-scoring.ts` + property tests (monotonic AP, fail-safe)
    - _Requirements: 16.2, 16.3, 16.4_
  - [x] 17.2 PFMEA parser + canonical selection map (per-unit, provenance, superseded)
    - `src/pfmea-parser.ts` (carry-forward, RPN self-check, filler skip), `src/pfmea-canonical-map.ts`, `src/pfmea-source.ts` + tests
    - _Requirements: 16.5, 16.10_
  - [x] 17.3 installation code normalizer (รหัสซ้ำ → ลำดับชีต, non-destructive)
    - `src/installation-code-normalizer.ts` + property tests
    - _Requirements: 16.10_
  - [x] 17.4 assembler + schema validation + RACI draft-guard + freshness
    - `src/knowledge-export.ts` (build + validate), `src/raci-data.ts` + property tests
    - _Requirements: 16.6, 16.7, 16.8_
  - [x] 17.5 emit-to-file + wire เข้า pipeline แบบ fail-soft + integration/round-trip test
    - `src/knowledge-export-emit.ts`, `pipeline.ts` (try/catch), `paths.ts` (`KNOWLEDGE_EXPORT_OUTPUT`)
    - _Requirements: 16.1, 16.9_

## Notes

- งานที่มาร์ก `*` เป็น optional (งานทดสอบ) ข้ามได้สำหรับ MVP แต่แนะนำให้ทำ
- แต่ละงานอ้างอิง sub-requirement เฉพาะเพื่อ traceability
- Property tests ใช้ fast-check + Vitest อย่างน้อย 100 iterations ต่อหนึ่ง property และติดแท็ก `// Feature: daph-obsidian-second-brain, Property N: ...`
- Checkpoints (งาน 10, 15) ใช้ตรวจความถูกต้องแบบเพิ่มทีละขั้น
- เครื่องมือต้อง non-destructive (ไม่แก้ต้นฉบับ), idempotent, และ UTF-8 Thai-safe ตลอดทุกขั้น

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "5.1", "6.1"] },
    { "id": 3, "tasks": ["4.1", "8.1", "3.2", "3.3", "3.4", "3.5", "3.6", "5.2", "6.2"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "7.1", "9.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 5, "tasks": ["7.2", "9.2", "9.3", "11.1", "13.1", "13.2", "13.3", "13.4"] },
    { "id": 6, "tasks": ["11.2", "12.1", "13.5"] },
    { "id": 7, "tasks": ["12.2", "14.1"] },
    { "id": 8, "tasks": ["14.2", "16.1"] }
  ]
}
```
