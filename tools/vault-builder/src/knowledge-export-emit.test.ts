/**
 * knowledge-export-emit.test.ts — integration: emit JSON จริง + ตรวจ contract (Req 11)
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 *
 * - ประกอบจาก _daph_extract จริง → validate ผ่าน
 * - ตรวจ contract ฝั่ง consumer: canonical order 0-based, quorum ครบทุก step,
 *   rpn_status + source_file ครบทุก row, RACI draft-guard, 3D_Rendering_Final มีเนื้อหา
 * - เขียน artifact จริงที่ daph-second-brain/_knowledge-export.json แล้วอ่านกลับ validate (round-trip)
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assembleKnowledgeExport,
  emitKnowledgeExportToFile,
} from './knowledge-export-emit.js';
import { validateKnowledgeExport, type KnowledgeExport } from './knowledge-export.js';
import { PROCESS_MODEL } from './process-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const extractDir = join(repoRoot, '_daph_extract');
const outPath = join(repoRoot, 'daph-second-brain', '_knowledge-export.json');

describe('knowledge-export-emit (integration, Req 11 contract)', () => {
  it('assemble จาก _daph_extract จริง → valid + contract ครบ', () => {
    if (!existsSync(extractDir)) {
      console.warn(`[emit] ไม่พบ ${extractDir} — ข้าม`);
      return;
    }
    const { export: exp, validation, pfmeaSource } = assembleKnowledgeExport(extractDir, new Date('2020-10-01T00:00:00Z'));

    // validation ผ่าน
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    // canonical order 0-based ต่อเนื่อง
    exp.processModel.forEach((s, i) => expect(s.canonicalOrder).toBe(i));

    // quorum ครบทุก step
    for (const s of PROCESS_MODEL) {
      expect(exp.approvalQuorumByStep).toHaveProperty(s.processStep);
    }

    // ทุก PFMEA row: rpn_status + source_file ครบ
    for (const row of exp.pfmeaRiskRows) {
      expect(['computed', 'severity_only', 'not_assessed']).toContain(row.rpnStatus);
      expect(row.sourceFile.length).toBeGreaterThan(0);
    }

    // RACI draft-guard: 28 entries, status draft
    expect(exp.raciMap.status).toBe('draft');
    expect(exp.raciMap.entries.length).toBe(28);

    // OQ-KX-2 §7: customer-as-approver + unanimous ในขั้น design/3D
    const customerApprovalSteps = ['Designer', '3D_Presentation', '3D_Rendering_Final'];
    for (const step of customerApprovalSteps) {
      const entry = exp.raciMap.entries.find((e) => e.processStep === step);
      expect(entry?.approvers?.some((a) => a.kind === 'customer')).toBe(true);
      expect(entry?.approvers?.some((a) => a.kind === 'role')).toBe(true);
      expect(entry?.informed).not.toContain('ลูกค้า'); // ลูกค้าเลื่อนจาก informed → approver
      expect(exp.approvalQuorumByStep[step]).toBe('unanimous');
    }
    // ขั้น internal อื่นคง first_response (ไม่กระทบ)
    expect(exp.approvalQuorumByStep['Production Planning']).toBe('first_response');

    // 3D_Rendering_Final มีเนื้อหา PFMEA จริง (ADR-010) + requirement ไม่ว่าง (กัน data-loss)
    const rendering = exp.pfmeaRiskRows.filter((r) => r.processStep === '3D_Rendering_Final');
    expect(rendering.length).toBeGreaterThan(0);
    expect(rendering.every((r) => (r.requirement ?? '').length > 0)).toBe(true);

    // Factory มี computed RPN
    expect(exp.pfmeaRiskRows.filter((r) => r.rpnStatus === 'computed').length).toBeGreaterThan(0);

    // files ถูกอ่านครบ ไม่มี missing
    expect(pfmeaSource.filesMissing).toEqual([]);
  });

  it('emit JSON จริง → อ่านกลับ validate ผ่าน (round-trip)', () => {
    if (!existsSync(extractDir)) return;
    const result = emitKnowledgeExportToFile(extractDir, outPath, new Date('2020-10-01T00:00:00Z'));
    expect(result.validation.valid).toBe(true);
    expect(existsSync(outPath)).toBe(true);

    const reloaded = JSON.parse(readFileSync(outPath, 'utf8')) as KnowledgeExport;
    const reval = validateKnowledgeExport(reloaded);
    expect(reval.valid).toBe(true);
    expect(reloaded.processModel.length).toBe(28);
  });
});
