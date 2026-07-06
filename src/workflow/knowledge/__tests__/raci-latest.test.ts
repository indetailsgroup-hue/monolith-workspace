// Feature: monolith-workflow-copilot — unit test: RACI ฉบับล่าสุดถูกใช้กับ request ใหม่
// Spec task: 7.7 · Requirements: 3.6
//
// mirror ของเส้นทางจริงใน rpc_resolve_approver: knowledge_import ที่ is_current →
// accountable/approvers ของ step. ที่นี่พิสูจน์ 2 ด้านของ Req 3.6 บน pure logic:
//   (1) export ใหม่ที่ VALID ถูกยอมรับ → request ใหม่ใช้ RACI ฉบับใหม่ทันที
//   (2) candidate ที่ INVALID ถูกปฏิเสธ → คง last-good → request ใหม่ยังใช้ฉบับที่ดีล่าสุด
//       (ไม่ใช่ฉบับพัง และไม่ใช่ null)
import { describe, it, expect } from 'vitest';
import {
  selectCurrent,
  accountableForStep,
  approversForStep,
  type KnowledgeExport,
} from '../import';

function makeExport(accountable: string, sourceVersion: string): KnowledgeExport {
  return {
    schemaVersion: '1.0.0',
    pfmeaRiskRows: [],
    processModel: [
      { processStep: 'Sale', subProcessGroup: 'Office', requiresApproval: false, approvalQuorum: null, canonicalOrder: 0 },
      { processStep: 'Designer', subProcessGroup: 'Office', requiresApproval: true, approvalQuorum: 'unanimous', canonicalOrder: 1 },
    ],
    raciMap: {
      status: 'approved',
      entries: [{ processStep: 'Designer', accountable, responsible: 'designer' }],
    },
    approvalQuorumByStep: { Sale: null, Designer: 'unanimous' },
    knowledgeFreshness: { sourceVersion, importedAt: '2026-01-01', reviewStatus: 'approved' },
  };
}

describe('Req 3.6 — request ใหม่ใช้ RACI ฉบับล่าสุด (spec task 7.7)', () => {
  it('export ใหม่ valid ถูกยอมรับ → accountable ของ request ใหม่มาจากฉบับใหม่', () => {
    const v1 = makeExport('lead-v1', 'v1');
    const v2 = makeExport('lead-v2', 'v2');

    const first = selectCurrent(null, v1);
    expect(first.accepted).toBe(true);
    expect(accountableForStep(first.current as KnowledgeExport, 'Designer')).toEqual(['lead-v1']);

    // import ฉบับใหม่ → request หลังจากนี้ต้องเห็น lead-v2 ไม่ใช่ lead-v1
    const second = selectCurrent(first.current, v2);
    expect(second.accepted).toBe(true);
    expect(accountableForStep(second.current as KnowledgeExport, 'Designer')).toEqual(['lead-v2']);
  });

  it('candidate invalid → คง last-good → request ใหม่ยังใช้ฉบับดีล่าสุด (ไม่ใช่ฉบับพัง/ไม่ใช่ null)', () => {
    const good = makeExport('lead-good', 'v1');
    const accepted = selectCurrent(null, good);

    // ฉบับพัง: raciMap ไม่มี entries → validation fail
    const broken = {
      ...makeExport('lead-broken', 'v2'),
      raciMap: { status: 'approved' },
    } as unknown as KnowledgeExport;

    const after = selectCurrent(accepted.current, broken);
    expect(after.accepted).toBe(false);
    expect(after.current).toBe(accepted.current); // last-good คงเดิม (Req 11.5 หนุน 3.6)
    expect(accountableForStep(after.current as KnowledgeExport, 'Designer')).toEqual(['lead-good']);
  });

  it('approversForStep ก็สะท้อนฉบับล่าสุดเช่นกัน (เส้น ADR-018 ใน resolver)', () => {
    const v1 = makeExport('lead-v1', 'v1');
    const v2 = makeExport('lead-v2', 'v2');
    const cur = selectCurrent(selectCurrent(null, v1).current, v2).current as KnowledgeExport;
    expect(approversForStep(cur, 'Designer', 'majority')).toEqual(['lead-v2']);
  });
});
