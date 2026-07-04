/**
 * pipeline.ts — เชื่อมต่อ pipeline ของ Vault_Builder แบบ end-to-end
 *
 * Feature: daph-obsidian-second-brain (Task 14.1)
 * Requirements: 1.6, 6.5, 8.1, 10.4 (+ ใช้คอมโพเนนต์ของ Req 2–13)
 *
 * ลำดับ: Scanner → Classifier → Inventory → (PARA structure) → FileMover →
 *        NoteGenerator (+ DocumentSetLinker) → MOCGenerator → DashboardGenerator →
 *        StaticAssets  แล้วเขียนทั้งหมดลง Vault แบบ idempotent
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CANONICAL_UNITS_BY_GROUP } from './constants.js';
import { generateHome } from './dashboard-generator.js';
import { buildDocumentSets, documentSetSection } from './document-set-linker.js';
import { placeFiles } from './file-mover.js';
import { createVaultStructure, readUtf8, writeUtf8 } from './fs-utils.js';
import { buildInventoryFromSources, writeInventory } from './inventory.js';
import { generateMocs, type GeneratedNote } from './moc-generator.js';
import { generateIndexNote, type NoteNeighbors } from './note-generator.js';
import { emitKnowledgeExportToFile } from './knowledge-export-emit.js';
import { EXTRACT_FOLDER, KNOWLEDGE_EXPORT_OUTPUT, VAULT_OUTPUT } from './paths.js';
import { readExtractIndex } from './scanner.js';
import { generateStaticAssets } from './static-assets.js';
import { convertXls } from './xls-converter.js';
import type { ExtractIndex, Inventory, InventoryEntry } from './types.js';

/** ผลสรุปการรัน pipeline */
export interface PipelineResult {
  scanned: number;
  notes: number;
  mocs: number;
  staticAssets: number;
  copied: number;
  /** ผลการ emit Knowledge_Export (fail-soft — ล้มเหลวไม่ทำ vault build พัง) */
  knowledgeExport: { ok: boolean; rows: number; error?: string };
}

/** หาเนื้อหาที่แตก/แปลงได้สำหรับ entry หนึ่ง (จาก _daph_extract หรือ XlsConverter) */
async function resolveExtractText(entry: InventoryEntry, index: ExtractIndex): Promise<string | null> {
  // .xlsx ที่แตกข้อความไว้แล้วใน _daph_extract
  const hit = index.xlsx.find((e) => e.file === entry.originalName);
  if (hit) {
    const p = join(EXTRACT_FOLDER, hit.outName);
    if (existsSync(p)) {
      try {
        return readUtf8(p);
      } catch {
        /* fall through */
      }
    }
  }
  // .xls → แปลงสด
  if (entry.ext.toLowerCase() === '.xls') {
    const res = await convertXls(entry.absolutePath);
    return res.ok ? res.text : null;
  }
  return null;
}

/** คำนวณหน่วยก่อนหน้า/ถัดไปตามลำดับ canonical ของกลุ่ม (จากหน่วยแรกของ entry) */
function neighborsFor(entry: InventoryEntry): NoteNeighbors {
  if (entry.group === null || entry.units.length === 0) {
    return { prev: null, next: null };
  }
  const order = CANONICAL_UNITS_BY_GROUP[entry.group];
  const idx = order.indexOf(entry.units[0]);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? order[idx - 1] : null,
    next: idx < order.length - 1 ? order[idx + 1] : null,
  };
}

/** เขียน GeneratedNote ลง Vault */
function writeGenerated(notes: GeneratedNote[], vaultRoot: string): void {
  for (const n of notes) {
    writeUtf8(join(vaultRoot, n.relativePath), n.content);
  }
}

/**
 * รัน pipeline เต็ม สร้าง Vault ที่ vaultRoot จาก Inventory
 */
export async function runPipeline(vaultRoot: string = VAULT_OUTPUT): Promise<PipelineResult> {
  // 1) Scan + Classify + Inventory
  const inv: Inventory = buildInventoryFromSources();
  const scanned = inv.entries.length;

  // 2) โครงสร้าง PARA + โฟลเดอร์ Process/Hardware
  createVaultStructure(vaultRoot);

  // 3) เขียน inventory + 4) คัดลอกไฟล์ + move log
  writeInventory(inv);
  const moveRecords = placeFiles(inv, vaultRoot);
  const copied = moveRecords.filter((r) => r.copied).length;

  // 5) Document sets (สำหรับลิงก์ข้าม)
  const sets = buildDocumentSets(inv);

  // 6) Index_Note ต่อไฟล์ non-junk (Process)
  const index = readExtractIndex();
  let notes = 0;
  for (const entry of inv.entries) {
    if (entry.isJunk || entry.noteRelativePath === null || entry.domain !== 'Process') continue;
    const extractText = await resolveExtractText(entry, index);
    let content = generateIndexNote(entry, extractText, neighborsFor(entry));
    const dsSection = documentSetSection(entry, sets);
    if (dsSection) {
      content = `${content.trimEnd()}\n\n${dsSection}\n`;
    }
    writeUtf8(join(vaultRoot, entry.noteRelativePath), content);
    notes += 1;
  }

  // 7) MOCs + 8) Home dashboard + 9) Static assets
  const mocs = generateMocs(inv);
  writeGenerated(mocs, vaultRoot);
  writeGenerated([generateHome()], vaultRoot);
  const assets = generateStaticAssets();
  writeGenerated(assets, vaultRoot);

  // 10) Knowledge_Export (ADR-009) — fail-soft: emit ล้มเหลวต้องไม่ทำ vault build พัง
  let knowledgeExport: PipelineResult['knowledgeExport'];
  try {
    const res = emitKnowledgeExportToFile(EXTRACT_FOLDER, KNOWLEDGE_EXPORT_OUTPUT);
    knowledgeExport = { ok: res.validation.valid, rows: res.export.pfmeaRiskRows.length };
  } catch (err) {
    knowledgeExport = { ok: false, rows: 0, error: err instanceof Error ? err.message : String(err) };
  }

  return { scanned, notes, mocs: mocs.length, staticAssets: assets.length, copied, knowledgeExport };
}
