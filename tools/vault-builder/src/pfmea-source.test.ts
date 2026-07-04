/**
 * pfmea-source.test.ts — tests + smoke report สำหรับ canonical map + resolver
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveCanonicalStep } from './pfmea-canonical-map.js';
import { resolvePfmeaRows } from './pfmea-source.js';
import { PROCESS_STEP_IDS } from './process-model.js';
import { scoreRisk } from './risk-scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const extractDir = join(here, '..', '..', '..', '_daph_extract');

describe('pfmea-canonical-map', () => {
  it('map: Factory / 3D สองขั้น / PP wildcard / Installation', () => {
    expect(resolveCanonicalStep('DAPH_PFMEA.xlsx.txt', '3.Cutting')?.canonicalStep).toBe('Cutting');
    // Incoming → Laminate HPL (CONFIRMED จาก SOS — ไม่ flag แล้ว)
    const inc = resolveCanonicalStep('DAPH_PFMEA.xlsx.txt', '1. Incoming Inspection');
    expect(inc?.canonicalStep).toBe('Laminate HPL');
    expect(inc?.flagged).toBeFalsy();
    // Construction Drawing → 3D_Presentation ยังเป็น draft (flagged)
    const cd = resolveCanonicalStep('DAPH_PFMEA_3D_Perspective.xlsx.txt', '3.Contruction Drawing');
    expect(cd?.canonicalStep).toBe('3D_Presentation');
    expect(cd?.flagged).toBeTruthy();
    // 3D สองขั้น
    expect(resolveCanonicalStep('DAPH_PFMEA_3D_Perspective.xlsx.txt', '1.3D Model')?.canonicalStep).toBe('3D_Presentation');
    expect(resolveCanonicalStep('DAPH_PFMEA_3D_Perspective.xlsx.txt', '2.3D Rendering')?.canonicalStep).toBe('3D_Rendering_Final');
    // PP wildcard
    expect(resolveCanonicalStep('DAPH_PFMEA_Producting_Planning_1_.xlsx.txt', '5.การใส่ Material')?.canonicalStep).toBe('Production Planning');
    // Installation by name
    expect(resolveCanonicalStep('DAPH_PFMEA_INSTALLATION.xlsx.txt', '1 PFMEA การบรีฟงาน')?.canonicalStep).toBe('การบรีฟงาน');
    // ไฟล์ไม่อยู่ในแผน → null
    expect(resolveCanonicalStep('UNKNOWN.txt', 'x')).toBeNull();
  });

  it('smoke: resolvePfmeaRows จากข้อมูลจริง — ทุก row ถูกต้อง + 3D_Rendering_Final มีเนื้อหา', () => {
    if (!existsSync(extractDir)) {
      console.warn(`[pfmea-source] ไม่พบ ${extractDir} — ข้าม smoke`);
      return;
    }
    const res = resolvePfmeaRows(extractDir);

    // ทุก row: processStep ถูกต้อง + มี sourceFile
    for (const r of res.rows) {
      expect(PROCESS_STEP_IDS.has(r.processStep)).toBe(true);
      expect(r.sourceFile.length).toBeGreaterThan(0);
    }

    // Factory ต้องมี computed RPN rows
    const factoryComputed = res.rows.filter(
      (r) => ['Laminate HPL', 'Cutting', 'Edging', 'CNC', 'Assembly', 'Packing'].includes(r.processStep) &&
        scoreRisk(r.sev, r.occ, r.det).rpnStatus === 'computed',
    );
    expect(factoryComputed.length).toBeGreaterThan(0);

    // 3D_Rendering_Final ต้องมีเนื้อหา (ไม่ว่างเปล่า) — หัวใจของ ADR-010
    const rendering = res.rows.filter((r) => r.processStep === '3D_Rendering_Final');
    expect(rendering.length).toBeGreaterThan(0);

    // รายงาน distribution
    const dist = new Map<string, number>();
    for (const r of res.rows) dist.set(r.processStep, (dist.get(r.processStep) ?? 0) + 1);
    const lines = [...dist.entries()].map(([k, v]) => `   ${k}: ${v}`).join('\n');
    console.log(
      `\n===== PFMEA CANONICAL RESOLUTION =====\n` +
        `filesRead=${res.filesRead.length} filesMissing=${res.filesMissing.length} rows=${res.rows.length}\n` +
        `unmapped=${res.unmapped.length} flags=${res.flags.length}\n` +
        `--- rows per canonical step ---\n${lines}\n` +
        (res.unmapped.length ? `--- unmapped ---\n${res.unmapped.map((u) => `   ${u.sourceFile} :: ${u.fileStep} (${u.count})`).join('\n')}\n` : '') +
        (res.flags.length ? `--- flags ---\n${res.flags.map((f) => `   ${f.canonicalStep} ← ${f.sourceFile}: ${f.note}`).join('\n')}\n` : ''),
    );
  });
});
