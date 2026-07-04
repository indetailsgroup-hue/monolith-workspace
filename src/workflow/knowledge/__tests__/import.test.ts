// Feature: monolith-workflow-copilot — property tests for knowledge import + last-good (Req 11)
import { describe, it, expect } from 'vitest';
import {
  validateExport,
  selectCurrent,
  normalizeProcessModel,
  accountableForStep,
  approversForStep,
  type KnowledgeExport,
} from '../import';

const validExport: KnowledgeExport = {
  schemaVersion: '1.0.0',
  pfmeaRiskRows: [],
  processModel: [
    { processStep: 'Sale', subProcessGroup: 'Office', requiresApproval: false, approvalQuorum: null, canonicalOrder: 0 },
    { processStep: 'Designer', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'unanimous', canonicalOrder: 1 },
  ],
  raciMap: { status: 'draft', entries: [{ processStep: 'Designer', accountable: 'lead', responsible: 'designer' }] },
  approvalQuorumByStep: { Sale: null, Designer: 'unanimous' },
  knowledgeFreshness: { sourceVersion: 'v1', importedAt: '2026-01-01', reviewStatus: 'approved' },
};

describe('knowledge import validation + last-good (Req 11)', () => {
  it('export ที่ถูกต้องผ่าน validation', () => {
    expect(validateExport(validExport)).toEqual({ valid: true, errors: [] });
  });

  it('canonicalOrder ไม่เริ่มที่ 0 / ไม่ต่อเนื่อง → invalid (Req 11.8)', () => {
    const bad = { ...validExport, processModel: [{ processStep: 'Sale', subProcessGroup: 'Office', requiresApproval: false, approvalQuorum: null, canonicalOrder: 1 }] };
    const res = validateExport(bad);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('processModel_canonicalOrder_not_contiguous_from_zero');
  });

  it('approvalQuorumByStep ค่าไม่ถูกต้อง → invalid', () => {
    const bad = { ...validExport, approvalQuorumByStep: { Designer: 'all_must_sign' } };
    expect(validateExport(bad).valid).toBe(false);
  });

  it('raciMap ไม่มี entries array → invalid', () => {
    const bad = { ...validExport, raciMap: { status: 'draft' } };
    expect(validateExport(bad).valid).toBe(false);
  });

  it('normalizeProcessModel → step/order/group/quorum เรียงตาม order', () => {
    const norm = normalizeProcessModel(validExport);
    expect(norm.map((n) => n.step)).toEqual(['Sale', 'Designer']);
    expect(norm[1]).toMatchObject({ step: 'Designer', order: 1, group: 'Office', quorum: 'unanimous', requiresApproval: true });
  });

  it('accountableForStep → array 1 ตัวจาก entries (accountable เดี่ยว)', () => {
    expect(accountableForStep(validExport, 'Designer')).toEqual(['lead']);
    expect(accountableForStep(validExport, 'Sale')).toEqual([]); // ไม่มี entry
  });

  it('approversForStep (ADR-018): unanimous → approvers[].ref; อื่น ๆ → accountable', () => {
    const exp2 = {
      ...validExport,
      raciMap: {
        status: 'draft',
        entries: [
          { processStep: 'Designer', accountable: 'lead', approvers: [{ ref: 'a1', kind: 'r' }, { ref: 'a2', kind: 'r' }] },
          { processStep: 'Production Planning', accountable: 'pp_lead' },
        ],
      },
    };
    expect(approversForStep(exp2, 'Designer', 'unanimous')).toEqual(['a1', 'a2']); // จาก approvers array
    expect(approversForStep(exp2, 'Production Planning', 'first_response')).toEqual(['pp_lead']); // accountable
    // unanimous แต่ไม่มี approvers array → fallback accountable
    expect(approversForStep(exp2, 'Production Planning', 'unanimous')).toEqual(['pp_lead']);
  });

  // Feature: monolith-workflow-copilot, Property 23: ความถูกต้องของ Knowledge_Export และ last-good
  it('Property 23: candidate invalid → คง last-good; valid → ใช้ candidate', () => {
    const lastGood = validExport;
    const candidateValid = { ...validExport, knowledgeFreshness: { sourceVersion: 'v2', importedAt: '2026-02-01', reviewStatus: 'approved' } };
    expect(selectCurrent(lastGood, candidateValid).accepted).toBe(true);
    const candidateBad = { pfmeaRiskRows: 'not-array' };
    const r = selectCurrent(lastGood, candidateBad);
    expect(r.accepted).toBe(false);
    expect(r.current).toBe(lastGood);
  });

  it('payload ไม่ใช่ object → invalid', () => {
    expect(validateExport(null).valid).toBe(false);
    expect(validateExport(42).valid).toBe(false);
  });
});
