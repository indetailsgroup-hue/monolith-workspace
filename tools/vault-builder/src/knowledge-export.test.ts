/**
 * knowledge-export.test.ts — Property tests สำหรับ Knowledge_Export emitter core
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 * Consumer contract: monolith-workflow-copilot Req 11
 *
 * Properties:
 *  - P-KE1: PROCESS_MODEL — canonicalOrder 0-based contiguous unique + step id ไม่ซ้ำ
 *  - P-KE2: buildKnowledgeExport → validate ผ่านเสมอ สำหรับ input ที่อ้างขั้นจริง
 *  - P-KE3: PFMEA rows ผ่าน risk-scoring (rpn/rpn_status สอดคล้อง)
 *  - P-KE4: RACI draft-guard ส่งผ่านสถานะ + confidence ครบ
 *  - P-KE5: validate จับ schema error ที่ฉีดเข้าไป (unknown step / order พัง)
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PROCESS_MODEL,
  PROCESS_STEP_IDS,
} from './process-model.js';
import {
  buildKnowledgeExport,
  validateKnowledgeExport,
  KNOWLEDGE_EXPORT_SCHEMA_VERSION,
  type BuildInput,
  type KnowledgeExport,
} from './knowledge-export.js';

const RUNS = { numRuns: 200 };

const stepIds = [...PROCESS_STEP_IDS];
const arbStepId = fc.constantFrom(...stepIds);
const arbRating = fc.option(fc.integer({ min: 1, max: 10 }), { nil: null });

const arbPfmea = fc.record({
  processStep: arbStepId,
  failureMode: fc.string(),
  cause: fc.string(),
  control: fc.string(),
  sev: arbRating,
  occ: arbRating,
  det: arbRating,
  sourceFile: fc.constantFrom('DAPH PFMEA.xlsx', 'DAPH PFMEA, Designer.xlsx'),
});

const arbRaci = fc.record({
  processStep: arbStepId,
  responsible: fc.option(fc.string(), { nil: null }),
  accountable: fc.option(fc.string(), { nil: null }),
  consulted: fc.array(fc.string(), { maxLength: 3 }),
  informed: fc.array(fc.string(), { maxLength: 3 }),
  confidence: fc.constantFrom('high' as const, 'needs_confirmation' as const),
});

const arbFreshness = fc.record({
  sourceVersion: fc.string({ minLength: 1 }).map((s) => `v${s}`),
  importedAt: fc.constant(new Date().toISOString()),
  reviewStatus: fc.constantFrom('approved' as const, 'pending' as const, 'draft' as const),
});

const arbInput: fc.Arbitrary<BuildInput> = fc.record({
  pfmea: fc.array(arbPfmea, { maxLength: 12 }),
  raci: fc.array(arbRaci, { maxLength: 12 }),
  raciStatus: fc.constantFrom('draft' as const, 'confirmed' as const),
  freshness: arbFreshness,
});

describe('knowledge-export (ADR-009/010/011/012)', () => {
  it('P-KE1: PROCESS_MODEL canonicalOrder 0-based contiguous + ids unique', () => {
    const orders = PROCESS_MODEL.map((s) => s.canonicalOrder);
    expect(orders).toEqual(PROCESS_MODEL.map((_, i) => i));
    expect(new Set(PROCESS_MODEL.map((s) => s.processStep)).size).toBe(PROCESS_MODEL.length);
    // 6 Office + 6 Factory + 16 Installation = 28
    expect(PROCESS_MODEL.length).toBe(28);
    // 3D สองขั้น ต้องอยู่ใน model (ADR-010)
    expect(PROCESS_STEP_IDS.has('3D_Presentation')).toBe(true);
    expect(PROCESS_STEP_IDS.has('3D_Rendering_Final')).toBe(true);
  });

  it('P-KE2: buildKnowledgeExport → validate ผ่านเสมอ', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const exp = buildKnowledgeExport(input);
        const result = validateKnowledgeExport(exp);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
        expect(exp.schemaVersion).toBe(KNOWLEDGE_EXPORT_SCHEMA_VERSION);
      }),
      RUNS,
    );
  });

  it('P-KE3: PFMEA rows สอดคล้อง risk-scoring', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const exp = buildKnowledgeExport(input);
        for (const row of exp.pfmeaRiskRows) {
          if (row.rpnStatus === 'computed') {
            expect(row.rpn).toBe((row.sev as number) * (row.occ as number) * (row.det as number));
            expect(row.actionPriority).not.toBeNull();
          } else {
            expect(row.rpn).toBeNull();
            expect(row.requiresHumanReview).toBe(true);
          }
        }
      }),
      RUNS,
    );
  });

  it('P-KE4: RACI draft-guard ส่งผ่านสถานะ + confidence', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const exp = buildKnowledgeExport(input);
        expect(exp.raciMap.status).toBe(input.raciStatus);
        expect(exp.raciMap.entries.length).toBe(input.raci.length);
        for (const e of exp.raciMap.entries) {
          expect(['high', 'needs_confirmation']).toContain(e.confidence);
        }
      }),
      RUNS,
    );
  });

  it('P-KE5: validate จับ schema error ที่ฉีดเข้าไป', () => {
    const base = buildKnowledgeExport({
      pfmea: [],
      raci: [],
      raciStatus: 'draft',
      freshness: { sourceVersion: 'v1', importedAt: new Date().toISOString(), reviewStatus: 'draft' },
    });

    // unknown processStep ใน pfmea
    const bad1: KnowledgeExport = {
      ...base,
      pfmeaRiskRows: [
        {
          processStep: 'NOT_A_STEP',
          failureMode: '',
          cause: '',
          control: '',
          sev: 5,
          occ: 5,
          det: 5,
          sourceFile: 'x.xlsx',
          rpnStatus: 'computed',
          rpn: 125,
          actionPriority: 'High',
          severityWarning: false,
          requiresHumanReview: false,
        },
      ],
    };
    expect(validateKnowledgeExport(bad1).valid).toBe(false);

    // canonicalOrder พัง
    const bad2: KnowledgeExport = {
      ...base,
      processModel: base.processModel.map((s, i) => (i === 0 ? { ...s, canonicalOrder: 99 } : s)),
    };
    expect(validateKnowledgeExport(bad2).valid).toBe(false);

    // freshness ไม่ครบ
    const bad3: KnowledgeExport = {
      ...base,
      knowledgeFreshness: { sourceVersion: '', importedAt: 'not-a-date', reviewStatus: 'draft' },
    };
    expect(validateKnowledgeExport(bad3).valid).toBe(false);
  });
});
