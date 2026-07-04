/**
 * types.ts — ชนิดข้อมูลกลางของ Vault_Builder
 *
 * Feature: daph-obsidian-second-brain (Task 1.2)
 * Requirements: 2.1, 2.2, 2.3, 2.4, 11.5
 *
 * ชนิดข้อมูลทั้งหมดในไฟล์นี้สะท้อนหัวข้อ "Components and Interfaces" และ
 * "Data Models" ของ design.md โดยตรง เพื่อให้ทุกคอมโพเนนต์ในไปป์ไลน์
 * (Scanner → Classifier → Inventory → XlsConverter → NoteGenerator → …)
 * ใช้สัญญาเดียวกัน ชื่อฟิลด์ตรงกับดีไซน์ทุกตัว
 */

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/** นามสกุลไฟล์ที่รู้จัก (เปิดให้รับค่าอื่นเป็น string ได้ด้วย) */
export type Ext = '.xlsx' | '.xls' | '.pdf' | '.md' | (string & {});

/** ไฟล์ต้นทางหนึ่งไฟล์ที่ Scanner อ่านพบ */
export interface SourceFile {
  /** ชื่อไฟล์เดิม เช่น "DAPH PFMEA, Sale.xlsx" */
  originalName: string;
  /** path เต็มของไฟล์ต้นฉบับ */
  absolutePath: string;
  /** โดเมนที่เดาจากรากที่สแกนเจอ */
  domainHint: 'Hardware' | 'Process';
  /** นามสกุลไฟล์ */
  ext: Ext;
  /** ขนาดไฟล์เป็นไบต์ */
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/** โดเมนความรู้ระดับบนสุด */
export type Domain = 'Hardware' | 'Process';

/** กลุ่มกระบวนการย่อยทั้งสามของฝั่ง Process */
export type SubProcessGroup = 'Office' | 'Factory' | 'Installation';

/** ประเภทเอกสารฝั่ง Process */
export type DocumentType =
  | 'SOS'
  | 'JES'
  | 'PFMEA'
  | 'Process Control Plan'
  | 'Template'
  | 'Master Matrix'
  | 'Project Doc'
  | 'Other';

/** แท็กสถานะของเอกสาร */
export type StatusTag = 'active' | 'draft' | 'revise' | 'archived';

/**
 * Process_Unit เป็น string ของหน่วยจริง
 * เช่น 'Sale', 'Laminate HPL', 'การบรีฟงาน'
 */
export type ProcessUnit = string;

/** ผลการจัดประเภทของไฟล์หนึ่งไฟล์ */
export interface Classification {
  domain: Domain;
  /** null เมื่อ isJunk */
  documentType: DocumentType | null;
  /** null เมื่อไม่สังกัดกลุ่ม (Hardware / Resources) */
  group: SubProcessGroup | null;
  /** ได้หลายค่า (multi-unit) ; [] เมื่อไม่สังกัดหน่วย */
  units: ProcessUnit[];
  statusTag: StatusTag;
  /** "P'oil", "P'Mean" — เก็บใน frontmatter ไม่ใส่ในชื่อไฟล์ */
  owner: string | null;
  isJunk: boolean;
}

// ---------------------------------------------------------------------------
// Extract index (_daph_extract/_INDEX.json)
// ---------------------------------------------------------------------------

/** รายการหนึ่งไฟล์ใน `_INDEX.json.xlsx` (ไฟล์ที่แตกข้อความสำเร็จ) */
export interface ExtractIndexEntry {
  /** ชื่อไฟล์ Excel ต้นฉบับ */
  file: string;
  /** ชื่อไฟล์ข้อความที่แตกแล้วใน Extract_Folder */
  outName: string;
  /** จำนวนชีต */
  sheets: number;
  /** ขนาดของไฟล์ข้อความที่แตกแล้ว (ไบต์) */
  bytes: number;
}

/** โครงสร้างของ `_daph_extract/_INDEX.json` */
export interface ExtractIndex {
  /** ไฟล์ Excel ที่แตกข้อความได้สำเร็จ */
  xlsx: ExtractIndexEntry[];
  /** ไฟล์ `.xls` ที่ extractor เดิมอ่านไม่ได้ */
  xls_unsupported: string[];
}

// ---------------------------------------------------------------------------
// Inventory + Duplicate Detection
// ---------------------------------------------------------------------------

/** วิธีที่ใช้แปลงไฟล์ `.xls` (ถ้ามี) */
export type ConversionMethod = 'sheetjs' | 'libreoffice' | 'attach-only';

/** หนึ่งรายการในบัญชีไฟล์ (SourceFile + Classification + ผลการวางตำแหน่ง) */
export interface InventoryEntry extends SourceFile, Classification {
  /** ตำแหน่งไฟล์แนบใน Vault */
  vaultRelativePath: string;
  /** path ของ Index_Note (null เมื่อ junk) */
  noteRelativePath: string | null;
  noteTitle: string;
  /** คีย์ของ Document_Set (group+unit) สำหรับลิงก์ */
  documentSetKey: string | null;
  /** ชี้ไปยังไฟล์ "ตัวจริง" เมื่อไฟล์นี้เป็นฉบับซ้ำ */
  duplicateOf: string | null;
  conversion?: ConversionMethod;
}

/** บัญชีไฟล์ทั้งหมดของ Vault */
export interface Inventory {
  entries: InventoryEntry[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// XlsConverter
// ---------------------------------------------------------------------------

/** ผลการแปลงไฟล์ `.xls` หนึ่งไฟล์ */
export interface XlsConversionResult {
  ok: boolean;
  method: ConversionMethod;
  /** เนื้อหาที่แปลงได้ (สำหรับฝังในโน้ต) — null เมื่อแปลงไม่สำเร็จ */
  text: string | null;
  /** เหตุผลเมื่อ ok=false */
  reason?: string;
}

// ---------------------------------------------------------------------------
// DocumentSetLinker
// ---------------------------------------------------------------------------

/** ชุดเอกสารที่สัมพันธ์กันของ Process_Unit หนึ่งหน่วย */
export interface DocumentSet {
  group: SubProcessGroup;
  unit: ProcessUnit;
  /** note paths ของสมาชิกที่มีอยู่จริงในชุด */
  members: {
    sos?: string;
    jes?: string;
    pfmea?: string;
    controlPlan?: string;
  };
}
