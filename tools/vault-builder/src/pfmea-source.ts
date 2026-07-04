/**
 * pfmea-source.ts — รวบ PFMEA rows ตาม canonical map (Phase 3 data wiring, IO)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export)
 *
 * อ่านไฟล์ extract ที่เลือกตาม CANONICAL_PFMEA_RULES → parse → map file-step → canonical step
 * → คืน PfmeaRiskRowInput[] พร้อม sourceFile (traceability) + รายงาน unmapped/flags อย่างโปร่งใส
 * (ไม่ทิ้ง row เงียบ ๆ — row ที่ map ไม่ได้ถูกรายงานใน unmapped)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PfmeaRiskRowInput } from './knowledge-export.js';
import { CANONICAL_PFMEA_FILES, resolveCanonicalStep } from './pfmea-canonical-map.js';
import { parsePfmeaText } from './pfmea-parser.js';

export interface PfmeaSourceResult {
  rows: PfmeaRiskRowInput[];
  /** row ที่ map ไม่ได้ (รายงาน ไม่ทิ้งเงียบ) */
  unmapped: { sourceFile: string; fileStep: string; count: number }[];
  /** การ map ที่ flag ไว้ให้เจ้าของตรวจ/flip */
  flags: { sourceFile: string; canonicalStep: string; note: string }[];
  /** จำนวน row ที่ตั้งใจไม่ consume (สกัดจากแหล่งอื่น) */
  ignoredCount: number;
  filesRead: string[];
  filesMissing: string[];
}

export function resolvePfmeaRows(extractDir: string): PfmeaSourceResult {
  const rows: PfmeaRiskRowInput[] = [];
  const unmapped = new Map<string, { sourceFile: string; fileStep: string; count: number }>();
  const flags = new Map<string, { sourceFile: string; canonicalStep: string; note: string }>();
  const filesRead: string[] = [];
  const filesMissing: string[] = [];
  let ignoredCount = 0;

  for (const file of CANONICAL_PFMEA_FILES) {
    const path = join(extractDir, file);
    if (!existsSync(path)) {
      filesMissing.push(file);
      continue;
    }
    filesRead.push(file);
    const parsed = parsePfmeaText(file, readFileSync(path, 'utf8'));
    for (const r of parsed.rows) {
      const res = resolveCanonicalStep(file, r.processStep);
      if (!res) {
        const key = `${file}::${r.processStep}`;
        const cur = unmapped.get(key);
        if (cur) cur.count += 1;
        else unmapped.set(key, { sourceFile: file, fileStep: r.processStep, count: 1 });
        continue;
      }
      rows.push({
        processStep: res.canonicalStep,
        requirement: r.requirement ?? '',
        failureMode: r.failureMode ?? '',
        cause: r.cause ?? '',
        control: r.control ?? '',
        sev: r.sev,
        occ: r.occ,
        det: r.det,
        sourceFile: file,
        sourceStep: r.processStep,
      });
      if (res.flagged) {
        flags.set(`${file}::${res.canonicalStep}`, {
          sourceFile: file,
          canonicalStep: res.canonicalStep,
          note: res.flagged,
        });
      }
    }
  }

  return {
    rows,
    unmapped: [...unmapped.values()],
    flags: [...flags.values()],
    ignoredCount,
    filesRead,
    filesMissing,
  };
}
