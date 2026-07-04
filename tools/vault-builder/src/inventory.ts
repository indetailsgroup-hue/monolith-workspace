/**
 * inventory.ts — Inventory + Duplicate Detection + Placement + Naming
 *
 * Feature: daph-obsidian-second-brain (Task 4.1)
 * Requirements: 1.6, 3.4, 3.6, 9.1, 9.3, 9.4, 10.1, 10.2, 10.6
 *
 * หน้าที่:
 *  1. ประกอบ `InventoryEntry` จาก `SourceFile` + `Classification` (classify())
 *     โดยคำนวณ `documentSetKey` (`group/unit` — null เมื่อไม่ใช่หน่วยเดียว)
 *  2. กำหนด `vaultRelativePath` ตามกฎ placement (design §Data Models / Property 11):
 *       - junk                                   → `04-Archives`
 *       - draft/revise ที่มีฉบับ active คู่กัน    → `04-Archives`
 *       - Hardware domain                        → `02-Areas/Hardware/<คงโครงสร้างเดิม>`
 *       - Project Doc                            → `01-Projects`
 *       - single-unit                            → `02-Areas/Process/<Group>/<Unit>`
 *       - multi-unit (หรือผูกกลุ่มแต่ไม่ผูกหน่วย) → `02-Areas/Process/<Group>`
 *       - ไม่สังกัดหน่วย (Template/Master Matrix/Other) → `03-Resources`
 *  3. ตั้งชื่อโน้ตตาม Naming_Convention (Req 9.1) `{Type}-{Group|Unit}-{ชื่อย่อ}`
 *     โดย owner token (`P'oil`/`P'Mean`) ไม่อยู่ในชื่อ (Req 9.3) คงอักขระไทย (Req 9.5)
 *     และแก้ชื่อชนด้วยการเติม suffix ` (2)`, ` (3)` (Req 9.4)
 *  4. ตรวจไฟล์ซ้ำด้วยคีย์ (Document_Type + group + units) ตั้ง `duplicateOf` (Req 10.6)
 *  5. เขียน `daph-second-brain/_inventory.json` (Req 1.6)
 *
 * หมายเหตุ: การจัด placement ของ draft/revise อิง Property 11 — เก็บเข้า `04-Archives`
 * เฉพาะเมื่อมีฉบับ active คู่กัน (กล่าวคือ `duplicateOf !== null`) มิฉะนั้นจัดวางตามกฎปกติ
 *
 * ฟังก์ชันสร้าง Inventory เป็น deterministic (เรียงผลตาม absolutePath) เพื่อให้รันซ้ำ
 * ได้ผลเดิม (idempotent) ทั้ง path ที่จัดวางและ suffix ที่แก้ชื่อชน
 */

import {
  GROUP_TAG_SLUG,
  UNIT_TAG_SLUG,
} from './constants.js';
import {
  HARDWARE_PDF_SOURCE,
  HARDWARE_SOURCE,
  PROCESS_ROOTS,
  HARDWARE_ROOTS,
  VAULT_INVENTORY,
} from './paths.js';
import { classify } from './classifier.js';
import { readExtractIndex, scan } from './scanner.js';
import { writeUtf8 } from './fs-utils.js';
import type {
  Classification,
  ExtractIndex,
  Inventory,
  InventoryEntry,
  SourceFile,
} from './types.js';

// ---------------------------------------------------------------------------
// ชื่อโฟลเดอร์ระดับบนสุด (POSIX-style — Obsidian ใช้ `/` ในลิงก์/พาธเสมอ)
// ---------------------------------------------------------------------------

const PARA = {
  projects: '01-Projects',
  areas: '02-Areas',
  resources: '03-Resources',
  archives: '04-Archives',
} as const;

const PROCESS_AREA = `${PARA.areas}/Process`;
const HARDWARE_AREA = `${PARA.areas}/Hardware`;

// ---------------------------------------------------------------------------
// ยูทิลิตี้พาธ/สตริง
// ---------------------------------------------------------------------------

/** แปลง path เป็น POSIX (ใช้ `/`) เพื่อความสม่ำเสมอใน Vault */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** ต่อชิ้นส่วนพาธแบบ POSIX โดยตัดส่วนว่างทิ้ง */
function joinPosix(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .join('/');
}

/**
 * แปลงสตริงเป็นชิ้นส่วนชื่อโน้ต: ตัด token เจ้าของ (P'xxx) ทิ้ง, แทนช่องว่าง/จุลภาค
 * ด้วย `-`, ยุบ `-` ซ้ำ และตัด `-` หัวท้าย — คงอักขระไทยและตัวเลขไว้ครบ (Req 9.3, 9.5)
 */
function hyphenate(input: string): string {
  return input
    .replace(/P'[A-Za-z0-9_ก-๙]+/g, ' ') // กัน owner token หลุดเข้าชื่อ (Req 9.3)
    .replace(/[,\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** escape อักขระพิเศษของ regex */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** slug ของ Document_Type สำหรับชื่อโน้ต (ช่องว่าง → `-`) เช่น "Process Control Plan" → "Process-Control-Plan" */
function documentTypeSlug(documentType: string): string {
  return hyphenate(documentType);
}

/** slug ของหน่วย: ใช้ตาราง UNIT_TAG_SLUG (อังกฤษ) ถ้าไม่มีให้คงชื่อหน่วยเดิม (ไทย — Req 9.5) */
function unitSlug(unit: string): string {
  return UNIT_TAG_SLUG[unit] ?? unit;
}

// ---------------------------------------------------------------------------
// documentSetKey (Req 5 / design §DocumentSetLinker) — `group/unit`
// ---------------------------------------------------------------------------

/**
 * คีย์ของ Document_Set = `group/unit` (เช่น `office/sale`, `factory/cutting`)
 * คืน null เมื่อไม่มีหน่วยเดียวที่ชัดเจน (multi-unit หรือไม่สังกัดหน่วย)
 */
function computeDocumentSetKey(cls: Classification): string | null {
  if (cls.group === null || cls.units.length !== 1) {
    return null;
  }
  return `${GROUP_TAG_SLUG[cls.group]}/${unitSlug(cls.units[0])}`;
}

// ---------------------------------------------------------------------------
// ชื่อย่อเอกสาร (ส่วนท้ายของชื่อโน้ต) — ใช้สำหรับ multi-unit / ไม่สังกัดหน่วย
// ---------------------------------------------------------------------------

/** คำที่ตัดออกจากชื่อย่อ (แบรนด์/ประเภทเอกสาร) เพื่อให้ชื่อกระชับ */
const SHORT_NAME_NOISE = [
  'DAPH',
  'SOS',
  'JES',
  'PFMEA',
  'Process control plan',
  'Process Control Plan',
];

/**
 * สร้าง "ชื่อย่อเอกสาร" จากชื่อไฟล์เดิม:
 *  - ตัดนามสกุล, token เจ้าของ, เลขนำหน้า (`1.`), แบรนด์/ประเภทเอกสาร, และเครื่องหมายสถานะ
 *  - ยุบช่องว่าง แล้ว hyphenate
 *  - ถ้าว่างเปล่าหลังตัด → ถอยไปใช้ชื่อฐาน (ไม่รวมนามสกุล) เพื่อรับประกันว่ามีส่วนนี้เสมอ
 */
function deriveShortName(originalName: string): string {
  let s = originalName.replace(/\.[^.]+$/, ''); // ตัดนามสกุล

  // ตัด token เจ้าของ (Req 9.3)
  s = s.replace(/P'[A-Za-z0-9_ก-๙]+/g, ' ');
  // ตัดเลขนำหน้าแบบ "1." / "2."
  s = s.replace(/(^|[\s,])\d+\./g, ' ');
  // ตัดเครื่องหมายสถานะ draft/revise/(n)
  s = s.replace(/\(revise\s*\d*\)/gi, ' ');
  s = s.replace(/\(\d+\)/g, ' ');
  s = s.replace(/\brevise\b/gi, ' ');
  s = s.replace(/\bdraft\b/gi, ' ');
  // ตัดแบรนด์/ประเภทเอกสาร
  for (const noise of SHORT_NAME_NOISE) {
    s = s.replace(new RegExp(escapeRegExp(noise), 'gi'), ' ');
  }

  const cleaned = hyphenate(s);
  if (cleaned.length > 0) {
    return cleaned;
  }

  // fallback — ใช้ชื่อฐานเดิม (ยังตัด owner ออกเพื่อกัน Req 9.3)
  return hyphenate(originalName.replace(/\.[^.]+$/, '')) || 'document';
}

// ---------------------------------------------------------------------------
// ชื่อโน้ต (Req 9.1) — `{Type}-{Group|Unit}-{ชื่อย่อ}`
// ---------------------------------------------------------------------------

/**
 * ประกอบชื่อโน้ตของไฟล์ Process ที่ไม่ใช่ junk ตาม Naming_Convention:
 *   - single-unit  → `{Type}-{Group}-{Unit}`        (เช่น `SOS-Office-Sale`)
 *   - multi-unit   → `{Type}-{Group}-{ชื่อย่อ}`      (เช่น `SOS-Office-Main-Process`)
 *   - ผูกกลุ่มแต่ไม่ผูกหน่วย → `{Type}-{Group}-{ชื่อย่อ}` (เช่น Factory master)
 *   - ไม่สังกัดกลุ่ม/หน่วย   → `{Type}-{ชื่อย่อ}`       (Template/Master Matrix/Project Doc/Other)
 *
 * owner token ไม่ปรากฏในชื่อ (Req 9.3) และคงอักขระไทยไว้ (Req 9.5)
 */
function buildProcessNoteTitle(file: SourceFile, cls: Classification): string {
  const typePart = documentTypeSlug(cls.documentType ?? 'Other');
  // ใช้ชื่อกลุ่มเต็ม (Office/Factory/Installation) เป็นส่วนกลางเพื่อความอ่านง่าย
  const groupPart = cls.group ? hyphenate(cls.group) : '';

  let tailPart: string;
  if (cls.units.length === 1) {
    // single-unit → ใช้ชื่อหน่วยเป็นส่วนท้าย (คงอักขระไทยของกลุ่ม Installation)
    tailPart = hyphenate(cls.units[0]);
  } else {
    tailPart = deriveShortName(file.originalName);
  }

  return [typePart, groupPart, tailPart]
    .filter((p) => p.length > 0)
    .join('-');
}

// ---------------------------------------------------------------------------
// Placement (Req 3.4, 3.6, 10.1, 10.2 / Property 11)
// ---------------------------------------------------------------------------

/**
 * พาธโฟลเดอร์ปลายทาง (relative) ของ Hardware — คงโครงสร้างเดิมใต้ `02-Areas/Hardware/`
 * โดยคำนวณพาธสัมพัทธ์จากรากต้นทางฮาร์ดแวร์ที่ไฟล์นั้นสังกัด
 */
function hardwareRelativeDir(file: SourceFile): string {
  const abs = toPosix(file.absolutePath);
  for (const root of [HARDWARE_SOURCE, HARDWARE_PDF_SOURCE]) {
    const rootPosix = toPosix(root);
    if (abs.startsWith(`${rootPosix}/`)) {
      const rel = abs.slice(rootPosix.length + 1); // path สัมพัทธ์รวมชื่อไฟล์
      const relDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      return joinPosix(HARDWARE_AREA, relDir);
    }
  }
  // ไม่ตรงรากใด — วางใต้ Hardware root โดยตรง
  return HARDWARE_AREA;
}

/**
 * คำนวณ "โฟลเดอร์ปลายทาง" (relative, POSIX) ของไฟล์ตามกฎ placement
 *
 * @param file ไฟล์ต้นทาง
 * @param cls  ผลการจัดประเภท
 * @param isArchivedDuplicate true เมื่อเป็น draft/revise ที่มีฉบับ active คู่กัน
 */
function computePlacementDir(
  file: SourceFile,
  cls: Classification,
  isArchivedDuplicate: boolean,
): string {
  // (1) junk → Archives (Req 10.1)
  if (cls.isJunk) {
    return PARA.archives;
  }

  // (2) draft/revise ที่มีฉบับ active คู่กัน → Archives (Req 10.2 / Property 11)
  if (isArchivedDuplicate) {
    return PARA.archives;
  }

  // (3) Hardware domain → คงโครงสร้างเดิมใต้ 02-Areas/Hardware (Req 3.2)
  if (cls.domain === 'Hardware') {
    return hardwareRelativeDir(file);
  }

  // (4) Project Doc → 01-Projects (Req 3.5)
  if (cls.documentType === 'Project Doc') {
    return PARA.projects;
  }

  // (5) เอกสารที่ผูกกับหน่วย/กลุ่มของ Process
  if (cls.group !== null) {
    if (cls.units.length === 1) {
      // single-unit → โฟลเดอร์หน่วย (Req 3.4)
      return joinPosix(PROCESS_AREA, cls.group, cls.units[0]);
    }
    // multi-unit หรือ ผูกกลุ่มแต่ไม่ผูกหน่วยเดียว → โฟลเดอร์กลุ่ม (Req 3.4)
    return joinPosix(PROCESS_AREA, cls.group);
  }

  // (6) ไม่สังกัดหน่วย/กลุ่ม (Template/Master Matrix/Other) → 03-Resources (Req 3.6)
  return PARA.resources;
}

// ---------------------------------------------------------------------------
// Duplicate detection (Req 10.6 / Property 15)
// ---------------------------------------------------------------------------

/** คีย์จัดกลุ่มไฟล์ซ้ำ = Document_Type + group + units (เรียงคงที่) */
function duplicateKey(cls: Classification): string {
  return [
    cls.documentType ?? '',
    cls.group ?? '',
    [...cls.units].join(','),
  ].join('|');
}

interface Prepared {
  file: SourceFile;
  cls: Classification;
}

/**
 * ตรวจไฟล์ซ้ำ: จัดกลุ่มไฟล์ Process ที่ไม่ใช่ junk ตาม duplicateKey
 * ภายในกลุ่ม ไฟล์ active ที่ชื่อไม่มี suffix = "ตัวจริง", ฉบับ draft/revise → duplicate
 *
 * @returns Map จาก originalName → originalName ของ "ตัวจริง" (เมื่อเป็นฉบับซ้ำ)
 */
function detectDuplicates(prepared: Prepared[]): Map<string, string> {
  const duplicateOf = new Map<string, string>();

  // จัดกลุ่มเฉพาะไฟล์ Process ที่ไม่ใช่ junk และมี documentType
  const groups = new Map<string, Prepared[]>();
  for (const p of prepared) {
    if (p.cls.domain !== 'Process' || p.cls.isJunk || p.cls.documentType === null) {
      continue;
    }
    const key = duplicateKey(p.cls);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(p);
    } else {
      groups.set(key, [p]);
    }
  }

  for (const bucket of groups.values()) {
    if (bucket.length < 2) {
      continue; // ไม่มีไฟล์ซ้ำในกลุ่มนี้
    }
    // "ตัวจริง" = ฉบับ active (เรียงตามชื่อเพื่อ determinism เมื่อมีหลายตัว)
    const actives = bucket
      .filter((p) => p.cls.statusTag === 'active')
      .sort((a, b) => a.file.originalName.localeCompare(b.file.originalName));
    const real = actives[0];
    if (!real) {
      continue; // ไม่มีฉบับ active → ไม่มีตัวจริงให้ชี้
    }
    for (const p of bucket) {
      if (p === real) {
        continue;
      }
      if (p.cls.statusTag === 'draft' || p.cls.statusTag === 'revise') {
        duplicateOf.set(p.file.originalName, real.file.originalName);
      }
    }
  }

  return duplicateOf;
}

// ---------------------------------------------------------------------------
// สร้าง Inventory
// ---------------------------------------------------------------------------

/**
 * สร้างบัญชีไฟล์ (Inventory) จากรายการ SourceFile ที่สแกนได้ + ExtractIndex
 *
 * ขั้นตอน:
 *   1) classify() แต่ละไฟล์
 *   2) ตรวจไฟล์ซ้ำ (duplicateOf)
 *   3) คำนวณ placement, documentSetKey, noteTitle และแก้ชื่อชน (suffix)
 *
 * ผลลัพธ์เรียงตาม absolutePath เพื่อให้ deterministic/idempotent
 *
 * @param files รายการ SourceFile (เช่นจาก scan())
 * @param index ดัชนี `_INDEX.json` (เช่นจาก readExtractIndex())
 */
export function buildInventory(files: SourceFile[], index: ExtractIndex): Inventory {
  // 1) classify + เรียงคงที่
  const prepared: Prepared[] = files
    .map((file) => ({ file, cls: classify(file, index) }))
    .sort((a, b) => a.file.absolutePath.localeCompare(b.file.absolutePath));

  // 2) ตรวจไฟล์ซ้ำ
  const duplicateOf = detectDuplicates(prepared);

  // 3) ประกอบ entry + แก้ชื่อชน
  const usedNotePaths = new Set<string>();
  const entries: InventoryEntry[] = [];

  for (const { file, cls } of prepared) {
    const dupOf = duplicateOf.get(file.originalName) ?? null;
    const isArchivedDuplicate =
      dupOf !== null && (cls.statusTag === 'draft' || cls.statusTag === 'revise');

    const placementDir = computePlacementDir(file, cls, isArchivedDuplicate);
    const vaultRelativePath = joinPosix(placementDir, file.originalName);
    const documentSetKey = computeDocumentSetKey(cls);

    // ชื่อโน้ตและพาธโน้ต
    let noteTitle: string;
    let noteRelativePath: string | null;

    if (cls.isJunk) {
      // junk: ไม่สร้าง Index_Note (Req 4.1) — noteTitle เป็นชื่อฐานไว้อ้างอิงเฉย ๆ
      noteTitle = file.originalName.replace(/\.[^.]+$/, '');
      noteRelativePath = null;
    } else if (cls.domain === 'Hardware') {
      // Hardware: คงชื่อเดิม ไม่ rename และไม่สร้าง Index_Note ใหม่ (Req 9.2, Non-Goals)
      noteTitle = file.originalName.replace(/\.[^.]+$/, '');
      noteRelativePath = null;
    } else {
      // Process non-junk: ตั้งชื่อตาม Naming_Convention + แก้ชื่อชน (Req 9.1, 9.4)
      const baseTitle = buildProcessNoteTitle(file, cls);
      const resolved = resolveNotePath(placementDir, baseTitle, usedNotePaths);
      noteTitle = resolved.title;
      noteRelativePath = resolved.path;
      usedNotePaths.add(noteRelativePath);
    }

    const entry: InventoryEntry = {
      // SourceFile
      originalName: file.originalName,
      absolutePath: file.absolutePath,
      domainHint: file.domainHint,
      ext: file.ext,
      sizeBytes: file.sizeBytes,
      // Classification
      domain: cls.domain,
      documentType: cls.documentType,
      group: cls.group,
      units: cls.units,
      statusTag: cls.statusTag,
      owner: cls.owner,
      isJunk: cls.isJunk,
      // Placement / naming / linking
      vaultRelativePath,
      noteRelativePath,
      noteTitle,
      documentSetKey,
      duplicateOf: dupOf,
    };

    entries.push(entry);
  }

  return {
    entries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * แก้ชื่อโน้ตชนกัน (Req 9.4): ถ้าพาธ `.md` ซ้ำ ให้เติม suffix ` (2)`, ` (3)` … จนไม่ซ้ำ
 *
 * @returns ชื่อโน้ตและพาธโน้ตสุดท้ายที่ไม่ซ้ำกับที่ใช้ไปแล้ว
 */
function resolveNotePath(
  dir: string,
  baseTitle: string,
  used: ReadonlySet<string>,
): { title: string; path: string } {
  let title = baseTitle;
  let path = joinPosix(dir, `${title}.md`);
  let counter = 2;

  while (used.has(path)) {
    title = `${baseTitle} (${counter})`;
    path = joinPosix(dir, `${title}.md`);
    counter += 1;
  }

  return { title, path };
}

/**
 * สร้าง Inventory จากแหล่งข้อมูลจริง (สแกนผ่าน Scanner + อ่าน `_INDEX.json`)
 *
 * เป็น convenience สำหรับ pipeline — รวม scan() + readExtractIndex() + buildInventory()
 */
export function buildInventoryFromSources(): Inventory {
  const files = scan(HARDWARE_ROOTS, PROCESS_ROOTS);
  const index = readExtractIndex();
  return buildInventory(files, index);
}

/**
 * เขียน Inventory ลงไฟล์ `_inventory.json` แบบ UTF-8 atomic/idempotent (Req 1.6)
 *
 * @param inventory บัญชีไฟล์ที่ได้จาก buildInventory()
 * @param outPath   พาธปลายทาง (ดีฟอลต์ = `VAULT_INVENTORY` = `daph-second-brain/_inventory.json`)
 */
export function writeInventory(inventory: Inventory, outPath: string = VAULT_INVENTORY): void {
  writeUtf8(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
}
