/**
 * knowledge-export-emit.ts — ประกอบ + เขียน Knowledge_Export JSON ลงดิสก์ (Phase 3 wiring)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export)
 * อิง ADR-009 (emit machine-readable), ADR-013 (per-unit canonical selection)
 *
 * รวม: resolvePfmeaRows (PFMEA จาก canonical map) + RACI_ENTRIES (draft-guard) +
 * Knowledge_Freshness → buildKnowledgeExport → validate → เขียน JSON (atomic, fail-soft)
 */

import {
  buildKnowledgeExport,
  validateKnowledgeExport,
  type KnowledgeExport,
  type KnowledgeFreshness,
  type ValidationResult,
} from './knowledge-export.js';
import { resolvePfmeaRows, type PfmeaSourceResult } from './pfmea-source.js';
import { RACI_ENTRIES, RACI_STATUS } from './raci-data.js';
import { writeUtf8 } from './fs-utils.js';

/** เวอร์ชันแหล่งความรู้ — สะท้อน QMS source (Oct 2020 Rev 00) */
export const KNOWLEDGE_SOURCE_VERSION = 'daph-qms-2020-rev00';

export interface EmitResult {
  export: KnowledgeExport;
  validation: ValidationResult;
  pfmeaSource: PfmeaSourceResult;
}

/**
 * ประกอบ Knowledge_Export จากแหล่งจริงใน extractDir
 * review_status = 'draft' (ซื่อตรง: RACI ยัง draft + Office RPN not_assessed) → Req 17 low-confidence
 */
export function assembleKnowledgeExport(extractDir: string, now: Date = new Date()): EmitResult {
  const pfmeaSource = resolvePfmeaRows(extractDir);
  const freshness: KnowledgeFreshness = {
    sourceVersion: KNOWLEDGE_SOURCE_VERSION,
    importedAt: now.toISOString(),
    reviewStatus: 'draft',
  };
  const exp = buildKnowledgeExport({
    pfmea: pfmeaSource.rows,
    raci: [...RACI_ENTRIES],
    raciStatus: RACI_STATUS,
    freshness,
  });
  return { export: exp, validation: validateKnowledgeExport(exp), pfmeaSource };
}

/**
 * ประกอบ + เขียน JSON; คืน EmitResult
 * fail-soft: ถ้า validation ไม่ผ่าน จะ throw (caller ใน pipeline ห่อ try/catch ไม่ให้ vault build พัง)
 */
export function emitKnowledgeExportToFile(
  extractDir: string,
  outPath: string,
  now: Date = new Date(),
): EmitResult {
  const result = assembleKnowledgeExport(extractDir, now);
  if (!result.validation.valid) {
    throw new Error(`Knowledge_Export validation failed:\n- ${result.validation.errors.join('\n- ')}`);
  }
  writeUtf8(outPath, JSON.stringify(result.export, null, 2));
  return result;
}
