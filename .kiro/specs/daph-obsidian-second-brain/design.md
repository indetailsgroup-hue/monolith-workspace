# Technical Design Document

## Overview

เอกสารนี้อธิบายการออกแบบทางเทคนิคของ **Vault_Builder** ซึ่งเป็นสคริปต์ Node.js (TypeScript) ที่อ่านเอกสารสองโดเมนของ DAPH Decor แล้วสร้าง Obsidian Vault แบบ Second Brain **เพียง Vault เดียว** ตามที่ระบุไว้ใน `requirements.md`

การออกแบบนี้อิงข้อมูลจริงที่ตรวจสอบแล้วในเวิร์กสเปซ:

- **โดเมน Hardware** — Vault ที่มีอยู่แล้วที่ `determined-williams/furniture-hardware-vault/` มีโครงสร้างภายในของตัวเองครบ (`00_INBOX`, `10_SOURCES`, `20_ATOMIC_NOTES`, `30_SYSTEMS`, `40_SPECS`, `50_MOC`, `60_VALIDATION`, `90_TEMPLATES`) พร้อมไฟล์ PDF แค็ตตาล็อกต้นฉบับใน `determined-williams/New folder (2)/`
- **โดเมน Process** — เอกสาร QMS ของ DAPH ใน `determined-williams/New folder/` โดยเนื้อหาถูกแตกเป็นข้อความแล้วใน `determined-williams/_daph_extract/` (ไฟล์ `*.xlsx.txt` / `*.xls.txt`) พร้อมไฟล์ดัชนี `_daph_extract/_INDEX.json`
- ผลลัพธ์ทั้งหมดถูกสร้างไว้ที่ `determined-williams/daph-second-brain/` เพื่อให้ self-contained ภายในเวิร์กสเปซเดียว

ความจริงสำคัญที่ตรวจสอบจากเนื้อหาไฟล์จริง (ใช้กำหนดรูปแบบการออกแบบ):

1. กระบวนการธุรกิจ **ไม่ใช่ 7 แผนกแบนราบ** แต่แบ่งเป็น **สามกลุ่มกระบวนการย่อย** (อ้างอิง `_daph_extract/`):
   - **Office** (จาก `1.SOS DAPH, Main Process.xlsx` 5 ชีต): Sale → Area Measurement → Designer → 3D Perspective → Production Planning
   - **Factory** (จาก `1.SOS DAPH.xlsx` 6 ชีต): Laminate HPL → Cutting → Edging → CNC → Assembly → Packing
   - **Installation** (จาก `1.SOS DAPH, INSTALLATION.xlsx` 16 ชีต): การบรีฟงาน → … → การเก็บของ
2. ไฟล์เดียวครอบคลุมได้หลายหน่วย: `1.SOS DAPH, Main Process.xlsx` = 5 แผนก Office, `1.SOS DAPH.xlsx` = 6 สถานี Factory ดังนั้น Classifier **ห้ามสมมติว่าหนึ่งไฟล์ = หนึ่งหน่วย** — ต้องสร้างหนึ่ง Index_Note ต่อไฟล์ แต่ติดได้หลายแท็ก Process_Unit และแยกหัวข้อย่อยรายชีต
3. เอกสารจัดเป็น **ชุดที่ลิงก์ถึงกัน (Document_Set)** ต่อหน่วย: SOS ↔ JES ↔ PFMEA ↔ Process Control Plan โดย SOS อ้างรหัส `JES-001`/`MC-001` (เห็นจริงใน `1.SOS DAPH.xlsx` ชีต Laminate HPL), PFMEA และ Control Plan อ้าง "ตาม SOS, JES" (เห็นจริงใน `DAPH Process control plan,Sale.xls` → "ควบคุมด้วย เอกสาร SOS, JES")
4. `สำหรับคุณชุ.xlsx` เป็น **เมทริกซ์กระบวนการ+เวลา+ต้นทุน+RACI ระดับบริษัท** (1075 แถว ครอบคลุม Line sales → measure → Production → House design → 3D → Installation) เป็น Master Process Matrix ไม่ใช่ขยะ
5. ไฟล์ `.xls` 10 ไฟล์อยู่ใน `_INDEX.json.xls_unsupported` (Process Control Plan รายหน่วย + `Citadines Arch ID KDR cklst.xls`) ต้องมี **XLS Converter** เพื่อทำให้ค้นหาได้

หลักการออกแบบสำคัญ:

1. **Non-destructive** — ไม่ลบหรือแก้ไฟล์ต้นฉบับใน Hardware_Source / Process_Source ใช้วิธี copy เข้า Vault เท่านั้น และบันทึก move log
2. **Idempotent** — รันซ้ำได้ผลเหมือนเดิม ไม่สร้างไฟล์ซ้ำซ้อน
3. **Data-grounded** — ใช้เนื้อหาจริงจาก `_daph_extract/` มาสร้างหัวข้อสรุป ไม่เดาเนื้อหา
4. **Deterministic classification** — การจัดประเภทอิงกฎจากชื่อไฟล์ + ชื่อชีตที่ตรวจสอบและทดสอบได้
5. **Thai-safe** — เขียน/อ่านไฟล์เป็น UTF-8 รักษาอักขระไทยไม่ให้เพี้ยน

### Goals

- รวมความรู้สองโดเมน (Hardware + Process) ใน Obsidian Vault เดียวที่ค้นหาได้ เชื่อมโยงได้ นำทางได้
- สะท้อนโมเดลกระบวนการสามกลุ่มจริง (Office / Factory / Installation) ไม่ใช่เจ็ดแผนกแบนราบ
- รักษาข้อมูลทุกไฟล์จากทั้งสองแหล่ง (รวม junk/draft/revise/.xls) ไว้ครบ ไม่สูญหาย

### Non-Goals

- ไม่แปลงตาราง Excel ทั้งหมดเป็น Markdown แบบเต็ม (สร้างเฉพาะ Index_Note + สรุป + ลิงก์ไฟล์แนบ)
- ไม่ติดตั้ง/ตั้งค่า Obsidian plugin อัตโนมัติ (สร้างเฉพาะโน้ตคำแนะนำ)
- ไม่จัดระเบียบใหม่ภายในโครงสร้างเดิมของ `furniture-hardware-vault` (คงไว้ตามเดิม)
- ไม่ทำ OCR หรืออ่านรูปภาพภายในไฟล์

## Architecture

```mermaid
flowchart TD
    HW[Hardware_Source\nfurniture-hardware-vault + New folder 2 PDFs] --> SC[Scanner]
    PS[Process_Source\nNew folder/ Excel] --> SC
    EX[_daph_extract/ + _INDEX.json] --> NG[NoteGenerator]
    SC --> CL[Classifier\nDomain/Type/Unit(s)/Status]
    CL --> INV[Inventory JSON]
    INV --> XC[XlsConverter]
    XC --> EX2[converted text]
    EX2 --> NG
    INV --> FM[FileMover\ncopy + move log]
    INV --> NG
    NG --> DS[DocumentSetLinker]
    DS --> V[(daph-second-brain/ Vault)]
    FM --> V
    NG --> MOC[MOCGenerator\nper-unit + per-group + Hardware MOC]
    MOC --> V
    MOC --> DB[DashboardGenerator\nHome + Mermaid 3-group flow]
    DB --> V
    SA[StaticAssets\nGlossary / Templates / PluginGuide / TagReference / MasterMatrix note] --> V
```

ลำดับการทำงาน (pipeline):

1. **Scanner** อ่านไฟล์ recursive จากทั้ง Hardware_Source และ Process_Source
2. **Classifier** กำหนด Domain, Document_Type, Process_Unit(s), Sub_Process_Group, Status_Tag, owner, isJunk
3. สร้าง **Inventory** (โครงสร้างกลาง) เขียนเป็น `daph-second-brain/_inventory.json`
4. **XlsConverter** แปลงไฟล์ `.xls` ใน `xls_unsupported` ให้เป็นข้อความค้นหาได้ (มี fallback)
5. **FileMover** copy ไฟล์เข้าปลายทาง (active → โฟลเดอร์หน่วย, junk/draft/revise → `04-Archives`) + เขียน `_move-log.md`
6. **NoteGenerator** สร้าง Index_Note หนึ่งโน้ตต่อไฟล์ non-junk (ดึงสรุปจาก extract / ผลแปลง)
7. **DocumentSetLinker** จับกลุ่มเอกสารตาม Process_Unit เป็น Document_Set แล้วลิงก์ข้ามถึงกัน + แยกวิเคราะห์รหัส JES/MC
8. **MOCGenerator** สร้าง MOC ต่อ Process_Unit, ต่อ Sub_Process_Group, และเชื่อม Hardware MOC เดิม
9. **DashboardGenerator** สร้าง `Home.md` + Mermaid flow สามกลุ่ม
10. **StaticAssets** สร้าง Glossary, Project Template + Index_Note ของเทมเพลตปฏิบัติการ, Plugin Guide, Tag Reference, Master Matrix note

### Technology Choices

| ด้าน | ตัวเลือก | เหตุผล |
|------|---------|--------|
| Runtime | Node.js + TypeScript (มี `package.json` แล้ว) | ไม่เพิ่ม toolchain ใหม่ |
| อ่าน `.xlsx` | ใช้เนื้อหาที่แตกแล้วใน `_daph_extract/*.xlsx.txt` | extractor ทำงานแล้ว |
| แปลง `.xls` (BIFF เก่า) | **SheetJS `xlsx`** เป็นหลัก, **LibreOffice `--headless --convert-to`** เป็นทางเลือก, สุดท้าย attach + note | ดูหัวข้อ XlsConverter |
| เขียนไฟล์ | `node:fs/promises` เขียน `utf-8` | รองรับภาษาไทย (Req 9.5) |
| Test | **Vitest + fast-check** | โปรเจกต์ root มี `vitest@^3`, `fast-check@^4.5.3` อยู่แล้ว |

หมายเหตุ: โปรเจกต์ root มี `exceljs` อยู่แล้ว แต่ `exceljs` อ่านได้เฉพาะ `.xlsx` (OOXML) ไม่รองรับ BIFF `.xls` จึงเลือก SheetJS สำหรับ `.xls` โดยเฉพาะ

## Components and Interfaces

### 1. Scanner

```typescript
type Ext = '.xlsx' | '.xls' | '.pdf' | '.md' | string;

interface SourceFile {
  originalName: string;        // เช่น "DAPH PFMEA, Sale.xlsx"
  absolutePath: string;
  domainHint: 'Hardware' | 'Process'; // จากรากที่สแกนเจอ
  ext: Ext;
  sizeBytes: number;
}

function scan(hardwareRoots: string[], processRoots: string[]): SourceFile[];
```

- อ่าน recursive ทั้งสองแหล่ง (Req 1.1)
- ไม่ throw เมื่อเจอไฟล์อ่านไม่ได้ — บันทึกเป็น warning

### 2. Classifier

```typescript
type Domain = 'Hardware' | 'Process';
type SubProcessGroup = 'Office' | 'Factory' | 'Installation';

type DocumentType =
  | 'SOS' | 'JES' | 'PFMEA' | 'Process Control Plan'
  | 'Template' | 'Master Matrix' | 'Project Doc' | 'Other';

type StatusTag = 'active' | 'draft' | 'revise' | 'archived';

// Process_Unit เป็น string ของหน่วยจริง เช่น 'Sale', 'Laminate HPL', 'การบรีฟงาน'
type ProcessUnit = string;

interface Classification {
  domain: Domain;
  documentType: DocumentType | null;   // null เมื่อ isJunk
  group: SubProcessGroup | null;        // null เมื่อไม่สังกัดกลุ่ม (Hardware / Resources)
  units: ProcessUnit[];                 // ได้หลายค่า (multi-unit) ; [] เมื่อไม่สังกัดหน่วย
  statusTag: StatusTag;
  owner: string | null;                 // "P'oil", "P'Mean" (Req 9.3)
  isJunk: boolean;
}

function classify(file: SourceFile, index: ExtractIndex): Classification;
```

**ลำดับกฎ (deterministic):**

(ก) ถ้า `domainHint === 'Hardware'` → `domain = Hardware`, ไม่กำหนด group/units, `documentType = Other`, คงโครงสร้างเดิม (ไม่ rename) — ดู FileMover

(ข) Junk detection (Req 1.4, 10.1) — ตรวจก่อนเสมอ: ชื่อขึ้นต้น `~$` หรือ ext `.tmp`/`.temp` → `isJunk = true`, `documentType = null`, `statusTag = 'archived'`

(ค) Document_Type (Req 1.3) — match case-insensitive:

| Pattern ในชื่อไฟล์ | DocumentType |
|---|---|
| ขึ้นต้น `1.SOS` หรือมี `SOS` | SOS |
| ขึ้นต้น `2.JES` หรือมี `JES` | JES |
| มี `PFMEA` | PFMEA |
| มี `Process control plan` | Process Control Plan |
| ชื่อ = `สำหรับคุณชุ.xlsx` | Master Matrix |
| มี `Citadines` (checklist โครงการลูกค้า) | Project Doc |
| มี `Template`/`sample-spec`/`Feasibility`/`แผนการทำงานช่างติดตั้ง` | Template |
| ที่เหลือ (เช่น `Installation.xlsx`) | Other |

(ง) Process_Unit(s) + Group (Req 2.5, 2.6) — กำหนดจาก **ชื่อชีตใน extract** ก่อน ถ้าไม่มีจึงใช้ชื่อไฟล์:

- ถ้า extract มีหลายชีตที่ตรงชื่อหน่วย → `units` = หน่วยทั้งหมด, `group` = กลุ่มของหน่วยเหล่านั้น
  - `1.SOS DAPH, Main Process.xlsx` → units = 5 แผนก Office, group = Office
  - `1.SOS DAPH.xlsx` → units = 6 สถานี Factory, group = Factory
  - `1.SOS DAPH, INSTALLATION.xlsx` → units = 16 ขั้นตอน Installation, group = Installation
- ถ้าชื่อไฟล์ระบุหน่วยเดียว → `units` = [หน่วยนั้น]
  - `DAPH PFMEA, Sale.xlsx` → ['Sale'], Office ; `DAPH PFMEA, INSTALLATION.xlsx` → group Installation
- ตาราง keyword → group:

| Keyword | Group | หน่วย |
|---|---|---|
| `Sale` | Office | Sale |
| `Area measurement` | Office | Area Measurement |
| `Designer` | Office | Designer |
| `3D Perspective` | Office | 3D Perspective |
| `Producting Planning`/`Production Planning` | Office | Production Planning |
| `Main Process` | Office | (5 แผนก ตามชีต) |
| `Laminate`/`Cutting`/`Edging`/`CNC`/`Asm`/`Packing` | Factory | สถานีตามชีต |
| `INSTALLATION`/`Installation` | Installation | (16 ขั้นตอน ตามชีต) |
| `P'Mean` | Factory | (master Production) |
| ไม่ตรงข้อใด | null | [] (→ `03-Resources`) |

(จ) Status_Tag (Req 10.3) — ลำดับ: มี `Draft` → draft ; มี `(Revise 1)`/`Revise`/`(1)` → revise ; junk → archived ; ที่เหลือ → active

(ฉ) Owner (Req 9.3) — regex `P'[\wก-๙]+` → เก็บใน `owner` ไม่ใส่ในชื่อไฟล์

#### Source-file → Classification mapping (grounded ใน `_daph_extract/`)

| ไฟล์ต้นฉบับ | Domain | Document_Type | Group | Process_Unit(s) | Status |
|---|---|---|---|---|---|
| `1.SOS DAPH, Main Process.xlsx` | Process | SOS | Office | Sale, Area Measurement, Designer, 3D Perspective, Production Planning | active |
| `2.JES DAPH, Main Process.xlsx` | Process | JES | Office | (5 แผนก Office) | active |
| `DAPH PFMEA, Main Process.xlsx` | Process | PFMEA | Office | (5 แผนก Office) | active |
| `DAPH PFMEA, Main Process (Revise 1).xlsx` | Process | PFMEA | Office | (5 แผนก Office) | revise |
| `DAPH Process control plan, Main Process.xls` | Process | Process Control Plan | Office | (5 แผนก Office) | active |
| `DAPH PFMEA, Sale.xlsx` | Process | PFMEA | Office | Sale | active |
| `DAPH PFMEA, Area measurement.xlsx` | Process | PFMEA | Office | Area Measurement | active |
| `DAPH PFMEA, Designer.xlsx` | Process | PFMEA | Office | Designer | active |
| `DAPH PFMEA, 3D Perspective.xlsx` | Process | PFMEA | Office | 3D Perspective | active |
| `DAPH PFMEA, Producting Planning.xlsx` | Process | PFMEA | Office | Production Planning | active |
| `DAPH PFMEA, Producting Planning(1).xlsx` | Process | PFMEA | Office | Production Planning | revise |
| `DAPH Process control plan,Sale.xls` | Process | Process Control Plan | Office | Sale | active |
| `DAPH Process control plan,Area Measurement.xls` | Process | Process Control Plan | Office | Area Measurement | active |
| `DAPH Process control plan,Designer.xls` | Process | Process Control Plan | Office | Designer | active |
| `DAPH Process control plan,3D Perspective.xls` | Process | Process Control Plan | Office | 3D Perspective | active |
| `DAPH Process control plan,Production Planning.xls` | Process | Process Control Plan | Office | Production Planning | active |
| `1.SOS DAPH.xlsx` | Process | SOS | Factory | Laminate HPL, Cutting, Edging, CNC, Assembly, Packing | active |
| `DAPH PFMEA.xlsx` | Process | PFMEA | Factory | (master Production) | active |
| `DAPH PFMEA, P'Mean.xlsx` | Process | PFMEA | Factory | (master Production, owner P'Mean) | active |
| `DAPH Process control plan.xls` | Process | Process Control Plan | Factory | (master Production) | active |
| `DAPH Process control plan,.xls` | Process | Process Control Plan | Factory | (master Production) | revise/dup |
| `1.SOS DAPH, INSTALLATION.xlsx` | Process | SOS | Installation | (16 ขั้นตอน) | active |
| `2.JES DAPH, INSTALLATION.xlsx` | Process | JES | Installation | (16 ขั้นตอน) | active |
| `DAPH PFMEA, INSTALLATION.xlsx` | Process | PFMEA | Installation | (16 ขั้นตอน) | active |
| `DAPH PFMEA, INSTALLATION,P'oil.xlsx` | Process | PFMEA | Installation | (16 ขั้นตอน, owner P'oil) | active |
| `DAPH Process control plan, INSTALLATION.xls` | Process | Process Control Plan | Installation | (16 ขั้นตอน) | active |
| `Installation.xlsx` | Process | Other | Installation | (รองรับ Installation) | active |
| `1.SOS DAPH Draft.xlsx` | Process | SOS | Office | (ฉบับร่าง) | draft |
| `2.JES DAPH Draft.xlsx` | Process | JES | Office | (ฉบับร่าง) | draft |
| `~$1.SOS DAPH Draft.xlsx` | Process | — (junk) | — | — | archived |
| `สำหรับคุณชุ.xlsx` | Process | Master Matrix | — | — | active |
| `Citadines Arch ID KDR cklst.xls` | Process | Project Doc | — | — | active |
| `Template Feasibility By Daph decor send 251019.xlsx` | Process | Template | — | — | active |
| `interior-designer-sample-spec sheet-template.xlsx` | Process | Template | — | — | active |
| `แผนการทำงานช่างติดตั้ง ประจำวัน.xlsx` | Process | Template | — | — | active |

### 3. Inventory + Duplicate Detection

```typescript
interface InventoryEntry extends SourceFile, Classification {
  vaultRelativePath: string;          // ตำแหน่งไฟล์แนบใน Vault
  noteRelativePath: string | null;    // path ของ Index_Note (null เมื่อ junk)
  noteTitle: string;
  documentSetKey: string | null;      // คีย์ของ Document_Set (group+unit) สำหรับลิงก์
  duplicateOf: string | null;
  conversion?: 'sheetjs' | 'libreoffice' | 'attach-only';
}

interface Inventory { entries: InventoryEntry[]; generatedAt: string; }
```

Duplicate detection (Req 10.6): จัดกลุ่มไฟล์ที่มี (Document_Type + group + units) เดียวกัน ภายในกลุ่มไฟล์ `active` ที่ชื่อไม่มี suffix = "ตัวจริง", ฉบับ `draft`/`revise`/`(1)` = duplicate → ตั้ง `duplicateOf` (เช่น `DAPH PFMEA, Main Process (Revise 1).xlsx` → ชี้ `DAPH PFMEA, Main Process.xlsx`). เขียน `_inventory.json` (Req 1.6, 10.6)

### 4. XlsConverter

แปลงไฟล์ `.xls` ใน `_INDEX.json.xls_unsupported` ให้ค้นหาได้ (Req 7.1–7.4)

```typescript
interface XlsConversionResult {
  ok: boolean;
  method: 'sheetjs' | 'libreoffice' | 'attach-only';
  text: string | null;       // เนื้อหาที่แปลงได้ (สำหรับฝังในโน้ต)
  reason?: string;           // เหตุผลเมื่อ ok=false
}

function convertXls(absolutePath: string): Promise<XlsConversionResult>;
```

กลยุทธ์แบบลำดับชั้น:

1. **SheetJS (`xlsx`)** — `XLSX.readFile(path)` รองรับ BIFF8 `.xls` แล้วแปลงแต่ละชีตเป็นข้อความด้วย `sheet_to_csv`/`sheet_to_txt` (เลือก SheetJS เพราะเป็น pure-JS ไม่ต้องพึ่ง binary ภายนอก ทำงานข้ามแพลตฟอร์ม และรองรับ `.xls` ที่ `exceljs` ทำไม่ได้)
2. **LibreOffice headless** (fallback) — `soffice --headless --convert-to xlsx/csv` เมื่อ SheetJS อ่านไฟล์เสียรูปแบบไม่ได้ (ใช้เมื่อมี LibreOffice ในเครื่องเท่านั้น)
3. **attach-only** (fallback สุดท้าย, Req 7.3) — เมื่อทั้งสองวิธีล้มเหลว → คัดลอกไฟล์ต้นฉบับเข้า Vault + ใส่หมายเหตุในโน้ตว่า "เปิดด้วย Excel" พร้อมเหตุผล

หลักฐานความเป็นไปได้: การ re-extract รอบสองได้สร้าง `_daph_extract/DAPH_Process_control_plan_*.xls.txt` และ `Citadines_Arch_ID_KDR_cklst.xls.txt` แล้ว (ยืนยันว่า BIFF `.xls` อ่านได้ด้วย reader ที่รองรับ) NoteGenerator จะใช้ผลแปลงนี้เมื่อมี

**สำคัญ (Req 7.4):** ไม่ว่าการแปลงจะสำเร็จหรือไม่ ทุกไฟล์ `.xls` ที่ไม่ใช่ junk จะได้ Index_Note เสมอ

### 5. NoteGenerator

อ่านสรุปจาก `_daph_extract/<outName>` (map `file` → `outName` ผ่าน `_INDEX.json`) หรือจากผล XlsConverter

```typescript
function generateIndexNote(
  entry: InventoryEntry,
  extractText: string | null,
  neighbors: { prev: ProcessUnit | null; next: ProcessUnit | null }
): string;
```

โครงสร้าง Index_Note (multi-unit + sub-section รายชีต ตาม Req 4.5):

```markdown
---
domain: Process
doc_type: SOS
group: Office
units: [Sale, Area Measurement, Designer, 3D Perspective, Production Planning]
status: active
owner: null
document_set: office/sale            # คีย์หลักของชุด (กรณี multi-unit จะอ้างชุดต่อหน่วยในเนื้อหา)
source_file: "1.SOS DAPH, Main Process.xlsx"
tags: [domain/process, group/office, unit/sale, unit/area-measurement, unit/designer, unit/3d-perspective, unit/production-planning, type/sos, status/active]
---

# SOS - Office - Main Process

## สรุป
<สรุปจาก _daph_extract — เอกสารคืออะไร ใช้ขั้นตอนใดของกระบวนการ Office>

## ไฟล์ต้นฉบับ
![[1.SOS DAPH, Main Process.xlsx]]

## หน่วยกระบวนการในเอกสารนี้ (รายชีต)
### Sale
<สรุปชีต SOS Sale Process> — Document_Set: [[SOS-Office-Sale]] · [[JES-Office-Sale]] · [[PFMEA-Office-Sale]] · [[Process-Control-Plan-Office-Sale]]
### Area Measurement
…
### Production Planning
…

## รหัสอ้างอิงที่พบ
- JES: JES-001 → [[JES-Factory-Laminate-HPL]]
- เครื่องจักร: MC-001

## การนำทางตามกระบวนการ
- ◀️ ก่อนหน้า: (ไม่มี — Sale เป็นจุดเริ่มกลุ่ม Office)
- ▶️ ถัดไป: [[Area-Measurement-MOC]]

## คำย่อที่เกี่ยวข้อง
[[Glossary#SOS|SOS]], [[Glossary#JES|JES]], [[Glossary#MC_Code|MC-001]]
```

- `![[...]]` เปิดไฟล์แนบ (Req 4.2)
- frontmatter ครบ domain/doc_type/group/units/status (Req 4.3)
- หัวข้อย่อยรายหน่วย/ชีต (Req 4.5)
- prev/next ตามลำดับในกลุ่ม (Req 4.6)
- กรณี `.xls`: ฝังเนื้อหาที่แปลงได้ (Req 7.2) หรือหมายเหตุ attach-only (Req 7.3)

### 6. DocumentSetLinker

จัดกลุ่ม Index_Note ที่มี Process_Unit เดียวกันเป็น Document_Set แล้วลิงก์ข้ามถึงกัน (Req 5)

```typescript
interface DocumentSet {
  group: SubProcessGroup;
  unit: ProcessUnit;
  members: { sos?: string; jes?: string; pfmea?: string; controlPlan?: string }; // note paths
}

function buildDocumentSets(inv: Inventory): DocumentSet[];
function crossLink(sets: DocumentSet[]): void; // เติมลิงก์ SOS↔JES↔PFMEA↔Control Plan
```

- คีย์ชุด = `group/unit` (เช่น `office/sale`, `factory/cutting`)
- เอกสาร multi-unit (Main Process) เป็นสมาชิกของหลายชุดพร้อมกัน — ลิงก์ในหัวข้อย่อยของแต่ละหน่วย
- Parse `JES-\d+` / `MC-\d+` จากเนื้อหา SOS แล้วลิงก์ไป JES ที่ตรง (Req 5.3)
- PFMEA/Control Plan ลิงก์กลับไป SOS+JES ในชุดเดียวกัน (Req 5.4, 5.5, 7.5)
- การลิงก์เป็นแบบ **สมมาตร**: ถ้า A อยู่ในชุดเดียวกับ B แล้ว A ลิงก์ถึง B และ B ลิงก์ถึง A

### 7. MOCGenerator

- **Process_Unit MOC**: หนึ่งโน้ตต่อหน่วย ที่ `02-Areas/Process/<Group>/<Unit>/<Unit>-MOC.md` ลิงก์ไป Index_Note ทุกไฟล์ในหน่วย จัดกลุ่มตาม Document_Set (Req 8.3, 8.4)
- **Sub_Process_Group MOC**: หนึ่งโน้ตต่อกลุ่ม (Office/Factory/Installation) ลิงก์ไปทุก Unit MOC (Req 8.3)
- **Hardware MOC**: ลิงก์ไป MOC เดิมใน `furniture-hardware-vault/50_MOC/` (ไม่สร้างใหม่ คงโครงสร้างเดิม) — Req 3.2, 8.2
- ใช้ Dataview query + fallback ลิงก์ static (ระบุใน Plugin Guide ว่าต้องติดตั้ง Dataview — Req 15.3)

### 8. DashboardGenerator

- `daph-second-brain/Home.md` (Req 8.1)
- ลิงก์ไป Hardware MOC + MOC ของสามกลุ่ม Process (Req 8.2), Glossary, Master Matrix, Process Flow (Req 8.5)
- ฝัง Mermaid flow สามกลุ่มตามลำดับ (Req 13.2) แต่ละ node ลิงก์ไป Unit MOC (Req 13.4)

### 9. Static Assets

| ไฟล์ | Requirement |
|------|-------------|
| `03-Resources/Glossary.md` | Req 12 — SOS, JES, PFMEA, RPN, MC_Code, MOC, PARA + Pytha/MaxCut/AutoCAD/3D Max + ไทย |
| `03-Resources/Master-Matrix-สำหรับคุณชุ.md` | Req 6 — Index_Note/MOC ของ Master Process Matrix |
| `03-Resources/Project-Template.md` | Req 14 — หัวข้อสามกลุ่ม + frontmatter ลูกค้า/โครงการ/วันที่ |
| `03-Resources/Templates/*` + Index_Note | Req 14.5 — Feasibility, spec sheet, แผนงานช่างติดตั้งรายวัน |
| `03-Resources/Plugin-Guide.md` | Req 15 — Dataview, Templater, Excalidraw + วิธีเปิดใช้ |
| `03-Resources/Tag-Reference.md` | Req 11.5 — รายการแท็กทั้งหมด + ความหมาย |

## Data Models

### Folder structure (Req 3)

```
daph-second-brain/
├── Home.md
├── _inventory.json
├── _move-log.md
├── 01-Projects/
│   └── Citadines/                         # Citadines checklist (Req 3.5)
├── 02-Areas/
│   ├── Hardware/                          # คงโครงสร้างเดิม furniture-hardware-vault (Req 3.2)
│   │   ├── 00_INBOX/ 10_SOURCES/ 20_ATOMIC_NOTES/ 30_SYSTEMS/
│   │   ├── 40_SPECS/ 50_MOC/ 60_VALIDATION/ 90_TEMPLATES/
│   │   └── Hardware-MOC.md
│   └── Process/
│       ├── Office/
│       │   ├── Sale/ Area Measurement/ Designer/ 3D Perspective/ Production Planning/
│       │   └── Office-MOC.md
│       ├── Factory/
│       │   ├── Laminate HPL/ Cutting/ Edging/ CNC/ Assembly/ Packing/
│       │   └── Factory-MOC.md
│       └── Installation/
│           ├── (16 ขั้นตอน)/
│           └── Installation-MOC.md
├── 03-Resources/
│   ├── Glossary.md
│   ├── Master-Matrix-สำหรับคุณชุ.md
│   ├── Project-Template.md
│   ├── Plugin-Guide.md
│   ├── Tag-Reference.md
│   └── Templates/
└── 04-Archives/                           # junk / draft / revise
```

### Naming Convention (Req 9)

- Index_Note ของ Process: `{Document_Type}-{Group|Unit}-{ชื่อย่อเอกสาร}` ตัวคั่น `-`
  - หน่วยใช้รูป kebab/standard (เช่น `SOS-Office-Sale`, `PFMEA-Factory-Master`)
- Hardware: คงรูป kebab-case เดิมของ `furniture-hardware-vault` ไม่เปลี่ยน (Req 9.2)
- owner (`P'oil`/`P'Mean`) อยู่ใน frontmatter `owner:` ไม่อยู่ในชื่อ (Req 9.3)
- ชนกัน → ต่อท้าย ` (2)`, ` (3)` ให้ไม่ซ้ำ (Req 9.4)
- เก็บอักขระไทยตามเดิม UTF-8 (Req 9.5)

### Tag taxonomy (Req 11)

| มิติ | รูปแบบแท็ก | ตัวอย่าง |
|------|-----------|---------|
| Domain | `domain/<slug>` | `domain/hardware`, `domain/process` |
| Group | `group/<slug>` | `group/office`, `group/factory`, `group/installation` |
| Process_Unit | `unit/<slug>` (หลายค่าได้) | `unit/sale`, `unit/laminate-hpl` |
| Document_Type | `type/<slug>` | `type/sos`, `type/pfmea`, `type/master-matrix` |
| Status | `status/<value>` | `status/active`, `status/revise` |

## Correctness Properties

*Property (คุณสมบัติ) คือพฤติกรรมหรือคุณลักษณะที่ต้องเป็นจริงเสมอในทุกการทำงานที่ถูกต้องของระบบ เป็นข้อความเชิงรูปนัยที่ระบุว่าระบบควรทำอะไร ทำหน้าที่เป็นสะพานเชื่อมระหว่างข้อกำหนดที่มนุษย์อ่านเข้าใจกับการรับประกันความถูกต้องที่เครื่องตรวจสอบได้*

หัวข้อนี้ระบุคุณสมบัติที่ผ่านการ pre-work วิเคราะห์แต่ละ acceptance criteria แล้ว โดยมุ่งทดสอบ **logic ภายในของ Vault_Builder** (Classifier, NoteGenerator, DocumentSetLinker, FileMover, MOCGenerator) ซึ่งเป็นฟังก์ชันที่ผลลัพธ์แปรผันตาม input อย่างมีนัยสำคัญ เหมาะกับ property-based testing ส่วนเนื้อหา static (Glossary, Home, Flow, Template, Plugin Guide), การสร้างโฟลเดอร์ PARA, การสแกนไฟล์ และการอ่าน `_INDEX.json` จะทดสอบด้วย unit/integration/smoke test (ดูหัวข้อ Testing Strategy)

### Property 1: Total classification และค่าอยู่ในเซ็ตที่กำหนด

*For any* รายการ SourceFile ที่ป้อนให้ Classifier ทุก entry ผลลัพธ์ SHALL มี `domain` ∈ {Hardware, Process} เสมอ และสำหรับไฟล์โดเมน Process ที่ไม่ใช่ Junk_File ทุกไฟล์ SHALL ได้ `documentType` ∈ {SOS, JES, PFMEA, Process Control Plan, Template, Master Matrix, Project Doc, Other} และ `group` ∈ {Office, Factory, Installation, null} (ไม่มีไฟล์ใดถูกปล่อยให้ไม่จัดประเภท)

**Validates: Requirements 1.2, 1.3, 2.1**

### Property 2: Junk exclusivity

*For any* ชื่อไฟล์ที่ป้อนให้ Classifier ผลลัพธ์ SHALL เป็นไปตามความสมมูล `isJunk === true` ⟺ `documentType === null` และเมื่อ `isJunk === true` แล้ว `statusTag` SHALL เท่ากับ `archived` เสมอ (ไฟล์ขยะจะไม่มีวันได้ Document_Type และไฟล์ที่ไม่ใช่ขยะจะต้องมี Document_Type)

**Validates: Requirements 1.4, 10.1**

### Property 3: Status tag อยู่ในโดเมนที่กำหนด

*For any* SourceFile ที่ป้อนให้ Classifier ผลลัพธ์ SHALL ได้ `statusTag` เพียงหนึ่งค่าจากเซ็ต {active, draft, revise, archived} โดยชื่อที่มี "Draft" → draft, ชื่อที่มี "(Revise 1)"/"(1)" → revise, junk → archived, ที่เหลือ → active

**Validates: Requirements 11.4, 10.3**

### Property 4: Multi-unit tagging correctness

*For any* ไฟล์โดเมน Process ที่ไม่ใช่ junk เซ็ตของแท็ก `unit/*` ที่ปรากฏใน Index_Note SHALL ตรงกันพอดีกับเซ็ต `units` ที่ Classifier กำหนด และโน้ต SHALL มีแท็ก `group/*` ตรงกับ `group` (ไฟล์ที่ครอบคลุมหลายหน่วย เช่น `1.SOS DAPH, Main Process.xlsx` ต้องได้แท็กครบทุกหน่วย ขณะที่ยังมี Index_Note เพียงโน้ตเดียว)

**Validates: Requirements 2.5, 2.6, 11.2**

### Property 5: One Index_Note per non-junk file (รวมการจัดการ .xls)

*For any* รายการไฟล์ผสมที่มีทั้ง junk และ non-junk (รวมไฟล์ `.xls` ทั้งที่แปลงสำเร็จและล้มเหลว) จำนวน Index_Note ที่สร้าง SHALL เท่ากับจำนวนไฟล์ non-junk พอดี โดยไฟล์ non-junk ทุกไฟล์ SHALL มี `noteRelativePath` ที่ไม่เป็น null และไฟล์ junk ทุกไฟล์ SHALL มี `noteRelativePath` เป็น null (ไฟล์ `.xls` ที่ไม่ใช่ junk ได้ Index_Note เสมอ ไม่ว่าผลการแปลงจะเป็นอย่างไร)

**Validates: Requirements 4.1, 7.4**

### Property 6: XLS conversion outcome สะท้อนในโน้ต

*For any* ไฟล์ `.xls` non-junk และผลการแปลง (XlsConversionResult) ที่กำหนด IF `ok === true` THEN Index_Note SHALL ฝังหรือสรุปข้อความที่แปลงได้ ELSE Index_Note SHALL มีไฟล์แนบต้นฉบับพร้อมหมายเหตุ "เปิดด้วย Excel" และระบุเหตุผลที่อ่านไม่ได้

**Validates: Requirements 7.2, 7.3**

### Property 7: Process-order linkage

*For any* Process_Unit ภายใน Sub_Process_Group หนึ่ง ลิงก์ prev/next ในโน้ต/MOC ของหน่วยนั้น SHALL ตรงกับลำดับ canonical ของกลุ่ม กล่าวคือ หน่วยแรกของกลุ่ม prev SHALL เป็น null, หน่วยสุดท้าย next SHALL เป็น null, และหน่วยอื่น prev/next SHALL ชี้ไปยังหน่วยที่อยู่ติดกันก่อนหน้า/ถัดไปตามลำดับจริง (Office: Sale→…→Production Planning; Factory: Laminate HPL→…→Packing; Installation 16 ขั้นตอน)

**Validates: Requirements 4.6**

### Property 8: Document-set completeness และ symmetry

*For any* Document_Set ของ Process_Unit หนึ่ง สำหรับทุกคู่สมาชิก (A, B) ที่มีอยู่จริงในชุด (จาก {SOS, JES, PFMEA, Process Control Plan}) Index_Note ของ A SHALL มีลิงก์ไป B และ Index_Note ของ B SHALL มีลิงก์ไป A (การลิงก์ครบทุกฉบับและเป็นสองทาง) — ครอบคลุมกรณี PFMEA→SOS+JES และ Process Control Plan→SOS+JES

**Validates: Requirements 5.1, 5.2, 5.4, 5.5, 7.5**

### Property 9: SOS แสดงและลิงก์รหัส JES/MC ที่พบ

*For any* เนื้อหา SOS ที่มีรหัสรูปแบบ `JES-\d+` หรือ `MC-\d+` ฝังอยู่ Index_Note ของ SOS นั้น SHALL แสดงรหัสที่พบทุกตัว และสำหรับทุกรหัส `JES-\d+` SHALL สร้างลิงก์ไปยัง Index_Note ของ JES ที่ตรงกันเมื่อมีอยู่ในชุดเดียวกัน

**Validates: Requirements 5.3**

### Property 10: No file loss + move-log completeness

*For any* รายการไฟล์ต้นฉบับจากทั้งสองแหล่ง (รวม junk/draft/revise/.xls) ไฟล์ทุกไฟล์ SHALL มีปลายทาง `vaultRelativePath` ภายใน Obsidian_Vault อย่างน้อยหนึ่งตำแหน่ง (ไม่มีไฟล์ใดสูญหาย) และจำนวนรายการใน move log SHALL เท่ากับจำนวนไฟล์ที่ถูกคัดลอก โดยแต่ละรายการ SHALL ระบุทั้งตำแหน่งเดิมและตำแหน่งใหม่ ทั้งนี้กระบวนการ SHALL ไม่แก้ไขไฟล์ต้นฉบับ

**Validates: Requirements 10.4, 10.5**

### Property 11: Placement correctness

*For any* ไฟล์ที่จัดประเภทแล้ว ตำแหน่ง `vaultRelativePath` SHALL เป็นไปตามกฎต่อไปนี้พร้อมกัน: junk และ draft/revise ที่มีฉบับ active คู่กัน → ใต้ `04-Archives`; เอกสาร single-unit → ใต้โฟลเดอร์หน่วยที่ตรงกัน; เอกสาร multi-unit → ใต้โฟลเดอร์ของ Sub_Process_Group; Project Doc → ใต้ `01-Projects`; เอกสารที่ไม่สังกัดหน่วย (Template/Master Matrix/Glossary) → ใต้ `03-Resources`

**Validates: Requirements 3.4, 3.6, 10.1, 10.2**

### Property 12: Naming uniqueness

*For any* รายการไฟล์ที่อาจทำให้เกิดชื่อโน้ตชนกัน เซ็ตของ `noteRelativePath` ที่สร้างทั้งหมด SHALL ไม่มีค่าซ้ำกัน (เมื่อชื่อตาม Naming_Convention ชนกัน ระบบเติม suffix จนไม่ซ้ำ) และชื่อโน้ต SHALL ไม่บรรจุ owner token (`P'oil`/`P'Mean`) โดย owner SHALL อยู่ใน frontmatter แทน

**Validates: Requirements 9.4, 9.3**

### Property 13: Thai character integrity (round-trip)

*For any* สตริงชื่อ/เนื้อหาภาษาไทย เมื่อ Vault_Builder เขียนไฟล์เป็น UTF-8 แล้วอ่านกลับ ผลที่ได้ SHALL เท่ากับสตริงต้นฉบับทุกอักขระ (เขียน→อ่าน เป็น identity ไม่ทำให้อักขระไทยเสียหาย)

**Validates: Requirements 9.5**

### Property 14: MOC link completeness

*For any* Process_Unit ที่มีเอกสารอย่างน้อยหนึ่งไฟล์ ระบบ SHALL สร้าง Unit MOC หนึ่งโน้ตสำหรับหน่วยนั้น และ Index_Note ของทุกไฟล์ที่สังกัดหน่วยนั้น SHALL ปรากฏเป็นลิงก์ภายใน Unit MOC ของหน่วยนั้น (จัดกลุ่มตาม Document_Set) พร้อมทั้งมี Group MOC ครบทั้งสามกลุ่มที่มีเอกสาร

**Validates: Requirements 8.3, 8.4**

### Property 15: Duplicate detection

*For any* กลุ่มไฟล์ที่มีคีย์ (Document_Type + group + units) เดียวกันมากกว่าหนึ่งไฟล์ ระบบ SHALL กำหนดให้ฉบับ active ที่ชื่อไม่มี suffix เป็น "ตัวจริง" และตั้ง `duplicateOf` ของฉบับ draft/revise/`(1)` ให้ชี้ไปยังตัวจริงในบัญชีไฟล์

**Validates: Requirements 10.6**

## Error Handling

| สถานการณ์ | การจัดการ | Requirement ที่เกี่ยวข้อง |
|---|---|---|
| ไฟล์ต้นฉบับอ่านไม่ได้ระหว่างสแกน | บันทึก warning ลง log ไม่ throw และดำเนินการกับไฟล์อื่นต่อ (fail-soft) | 1.1 |
| `_INDEX.json` ไม่พบหรือ parse ไม่ได้ | ใช้ค่าเริ่มต้น (ถือว่าไม่มี extract) Classifier ถอยไปใช้กฎจากชื่อไฟล์ และบันทึก warning | 1.5, 4.4 |
| ไม่มีไฟล์ extract สำหรับเอกสาร | NoteGenerator สร้างหัวข้อสรุปแบบ placeholder ที่ระบุว่า "ยังไม่มีเนื้อหาที่แตกข้อความ" แทนการ throw | 4.4 |
| แปลง `.xls` ด้วย SheetJS ล้มเหลว | ถอยไป LibreOffice headless; ถ้ายังล้มเหลว → attach-only + หมายเหตุพร้อมเหตุผล (ทุกกรณียังสร้าง Index_Note) | 7.1, 7.3, 7.4 |
| LibreOffice ไม่ติดตั้งในเครื่อง | ข้ามขั้น LibreOffice ไป attach-only ทันที และบันทึกเหตุผล "ไม่พบ LibreOffice" | 7.3 |
| ชื่อโน้ตชนกันหลังตั้งชื่อ | เติม suffix ` (2)`, ` (3)` … จนกว่าจะไม่ซ้ำ (รับประกันโดย Property 12) | 9.4 |
| รหัส JES ที่อ้างใน SOS ไม่มี note ปลายทาง | แสดงรหัสเป็นข้อความธรรมดา (ไม่สร้างลิงก์เสีย) และบันทึก warning | 5.3 |
| สมาชิก Document_Set ไม่ครบ (เช่น มี SOS แต่ไม่มี PCP) | ลิงก์เฉพาะสมาชิกที่มีอยู่จริง ไม่สร้างลิงก์ค้าง (Property 8 ยึดเฉพาะคู่ที่มีอยู่) | 5.2 |
| เขียนไฟล์ปลายทางไม่สำเร็จ (สิทธิ์/ดิสก์เต็ม) | หยุดด้วย error ที่อ่านเข้าใจง่าย ระบุ path ที่ล้มเหลว และไม่ทิ้ง Vault ในสภาพครึ่งๆ กลางๆ โดยเขียนผ่าน temp แล้ว rename | 10.4 |
| รันซ้ำบน Vault ที่มีอยู่แล้ว | ทำงานแบบ idempotent — เขียนทับโน้ตที่สร้างเอง ไม่สร้างไฟล์ซ้ำ และไม่แตะไฟล์ต้นฉบับ | (หลักการ Idempotent) |

หลักการจัดการข้อผิดพลาดโดยรวม: **fail-soft ต่อไฟล์รายตัว** (ไฟล์เสียหนึ่งไฟล์ไม่ทำให้ทั้ง pipeline ล้ม) แต่ **fail-fast ต่อข้อผิดพลาดระบบ** (เขียนดิสก์ไม่ได้) เพื่อไม่ให้ได้ Vault ที่ไม่สมบูรณ์โดยไม่รู้ตัว

## Testing Strategy

### แนวทางทดสอบสองชั้น

- **Property-based tests** — ตรวจคุณสมบัติสากลของ logic หลัก (Classifier, NoteGenerator, DocumentSetLinker, FileMover, MOCGenerator) ครอบคลุม Property 1–15
- **Unit tests** — ตรวจตัวอย่างเฉพาะ, เนื้อหา static และ edge case ที่ไม่เป็นสากล
- **Integration/Smoke tests** — ตรวจการทำงานกับ filesystem จริงและไลบรารีภายนอก

### Property-based testing

- ใช้ **fast-check** (มีใน root `package.json` แล้ว) ร่วมกับ **Vitest** ไม่ implement PBT เอง
- รันอย่างน้อย **100 iterations** ต่อหนึ่ง property test
- หนึ่ง property ในเอกสารนี้ → หนึ่ง property-based test
- ติดแท็กอ้างอิงในคอมเมนต์ของแต่ละเทสต์ตามรูปแบบ:
  `// Feature: daph-obsidian-second-brain, Property {number}: {property_text}`
- ตัวสร้าง (generators) สำคัญที่ต้องเตรียม:
  - `arbSourceFile` — ชื่อไฟล์ผสม (รวม `~$`, `.tmp`, "Draft", "(Revise 1)", "(1)", owner `P'oil`/`P'Mean`, ชื่อไทย, multi-unit เช่น "Main Process")
  - `arbSheetNames` — เซ็ตชื่อชีตที่ตรง/ไม่ตรงหน่วยจริง สำหรับทดสอบ multi-unit (Property 4)
  - `arbThaiString` — สตริงไทยรวมสระบน/ล่าง วรรณยุกต์ และอักขระผสม สำหรับ Property 13
  - `arbXlsConversionResult` — ok=true พร้อม text / ok=false พร้อม reason สำหรับ Property 6
  - `arbDocumentSet` — ชุดที่สมาชิกครบ/ไม่ครบ สำหรับ Property 8
- การ map property → test:

| Property | จุดทดสอบหลัก |
|---|---|
| 1, 2, 3 | `classify()` — domain/type/status membership, junk exclusivity |
| 4, 11 | `classify()` + placement — units/tags, โฟลเดอร์ปลายทาง |
| 5, 6 | `generateIndexNote()` — one-note-per-non-junk, ผลแปลง .xls |
| 7 | prev/next derivation จาก canonical order |
| 8, 9 | `buildDocumentSets()` + `crossLink()` — completeness/symmetry, JES/MC linkage |
| 10, 15 | FileMover + Inventory — no file loss, move log, duplicate |
| 12 | naming/uniqueness resolver |
| 13 | write→read round-trip UTF-8 |
| 14 | MOCGenerator — link completeness |

### Unit tests (ตัวอย่างเฉพาะ/edge case)

- Classifier กรณีตายตัว: `สำหรับคุณชุ.xlsx` → Master Matrix (Req 6.1); `Citadines Arch ID KDR cklst.xls` → Project Doc + 01-Projects (Req 3.5)
- ลำดับ canonical ของแต่ละกลุ่มถูกต้อง (Req 2.2–2.4)
- Master Matrix note: สรุปขอบเขต + คอลัมน์เวลา/ต้นทุน + ลิงก์สามกลุ่ม MOC + ลิงก์จาก Home (Req 6.3–6.5)
- Glossary มีคำย่อครบ (SOS/JES/PFMEA/RPN/MC_Code/MOC/PARA) + ซอฟต์แวร์ (Pytha/MaxCut/AutoCAD/3D Max) + auto-link (Req 12)
- Home_Dashboard มีลิงก์ Hardware MOC + สามกลุ่ม + Glossary/Master Matrix/Process Flow (Req 8.1, 8.2, 8.5)
- Process Flow Diagram: มี block Mermaid ครบสามกลุ่มตามลำดับ + ลิงก์หน่วย (Req 13)
- Project Template: หัวข้อสามกลุ่ม + frontmatter ลูกค้า/โครงการ/วันที่ + ลิงก์เทมเพลตปฏิบัติการ (Req 14)
- Plugin Guide: ระบุ Dataview/Templater/Excalidraw + วิธีเปิดใช้ (Req 15)
- Tag-Reference: รูปแบบแท็ก `<dim>/<slug>` สม่ำเสมอ (Req 11.5)
- Hardware naming คงเดิม ไม่ถูก rename (Req 9.2)

### Integration / Smoke tests

- Scanner อ่านไฟล์ครบจากโฟลเดอร์ตัวอย่างทั้งสองแหล่ง (Req 1.1)
- อ่าน `_INDEX.json` และระบุรายการ `xls_unsupported` ได้ถูกต้อง (Req 1.5)
- XlsConverter แปลงไฟล์ `.xls` ตัวอย่างด้วย SheetJS ได้ข้อความค้นหาได้จริง 1–2 ตัวอย่าง (Req 7.1)
- โครงสร้างโฟลเดอร์ PARA ถูกสร้างครบ (`01-Projects`, `02-Areas`, `03-Resources`, `04-Archives`) (Req 3.1, 3.7)
- Hardware domain ถูกคัดลอกคงโครงสร้างเดิมใต้ `02-Areas/Hardware/` (Req 3.2)
- รัน pipeline สองครั้งติดกัน (idempotency) ผลลัพธ์ใน Vault ไม่เปลี่ยนและไม่เกิดไฟล์ซ้ำ
