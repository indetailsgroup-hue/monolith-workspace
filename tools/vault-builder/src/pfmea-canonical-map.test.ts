/**
 * pfmea-canonical-map.test.ts — ยืนยันความครบ/ถูกต้องของแผนที่เลือก PFMEA canonical
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROCESS_MODEL, PROCESS_STEP_IDS } from './process-model.js';
import {
  PFMEA_CANONICAL_MAP,
  PFMEA_SUPERSEDED,
  INSTALLATION_PFMEA_SOURCE,
} from './pfmea-canonical-map.js';

const here = dirname(fileURLToPath(import.meta.url));
const extractDir = join(here, '..', '..', '..', '_daph_extract');

describe('pfmea-canonical-map', () => {
  it('Office+Factory canonical steps ทั้ง 12 ถูก map ครบและไม่ซ้ำ', () => {
    const officeFactory = PROCESS_MODEL.filter(
      (s) => s.subProcessGroup === 'Office' || s.subProcessGroup === 'Factory',
    ).map((s) => s.processStep);
    expect(officeFactory.length).toBe(12);

    const mapped = PFMEA_CANONICAL_MAP.map((m) => m.processStep);
    // ไม่ซ้ำ
    expect(new Set(mapped).size).toBe(mapped.length);
    // ครบทุก Office+Factory step
    for (const step of officeFactory) {
      expect(mapped).toContain(step);
    }
  });

  it('ทุก mapping อ้าง processStep ที่มีจริงใน process model', () => {
    for (const m of PFMEA_CANONICAL_MAP) {
      expect(PROCESS_STEP_IDS.has(m.processStep)).toBe(true);
    }
  });

  it('ไฟล์ที่เลือก (canonical) และ superseded ไม่ทับกัน', () => {
    const selected = new Set(PFMEA_CANONICAL_MAP.map((m) => m.sourceFile));
    selected.add(INSTALLATION_PFMEA_SOURCE);
    for (const s of PFMEA_SUPERSEDED) {
      expect(selected.has(s.sourceFile)).toBe(false);
    }
  });

  it('ไฟล์ต้นทางที่อ้างถึงมีอยู่จริงใน _daph_extract', () => {
    if (!existsSync(extractDir)) {
      console.warn('ข้าม — ไม่พบ _daph_extract');
      return;
    }
    const refs = new Set<string>([
      ...PFMEA_CANONICAL_MAP.map((m) => m.sourceFile),
      INSTALLATION_PFMEA_SOURCE,
      ...PFMEA_SUPERSEDED.map((s) => s.sourceFile),
    ]);
    for (const f of refs) {
      expect(existsSync(join(extractDir, f))).toBe(true);
    }
  });
});
