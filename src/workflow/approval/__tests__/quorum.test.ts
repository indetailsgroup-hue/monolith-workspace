// Feature: monolith-workflow-copilot — property tests for approval quorum (Req 15)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { aggregateQuorum, type ApproverDecision } from '../quorum';

const arbDecision = fc.constantFrom<'approved' | 'rejected'>('approved', 'rejected');

function makeDecisions(kinds: ('approved' | 'rejected')[]): ApproverDecision[] {
  return kinds.map((decision, i) => ({ approverId: `a${i}`, decision }));
}

describe('approval quorum aggregation (Req 15)', () => {
  // Feature: monolith-workflow-copilot, Property 28: ความหมายการรวมผล Approval_Quorum (ผ่าน/ล้มเหลว)
  it('Property 28: unanimous — reject ใดก็ตาม → rejected; ครบทุกคน approve → approved', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.array(arbDecision, { maxLength: 6 }),
        (total, kinds) => {
          const decisions = makeDecisions(kinds.slice(0, total));
          const out = aggregateQuorum('unanimous', total, decisions);
          const hasReject = decisions.some((d) => d.decision === 'rejected');
          const allApprove =
            decisions.length >= total && decisions.every((d) => d.decision === 'approved');
          if (hasReject) expect(out).toBe('rejected');
          else if (allApprove) expect(out).toBe('approved');
          else expect(out).toBe('pending');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Property 28b: majority — approve > ครึ่ง → approved', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 7 }), (total) => {
        const needed = Math.floor(total / 2) + 1;
        const allApprove = makeDecisions(Array(total).fill('approved'));
        expect(aggregateQuorum('majority', total, allApprove)).toBe('approved');
        // reject เกินจน approve เป็นไปไม่ได้
        const allReject = makeDecisions(Array(total).fill('rejected'));
        expect(aggregateQuorum('majority', total, allReject)).toBe('rejected');
        // pending: ยังไม่ถึง needed และเหลือพอจะถึง
        if (total >= 3 && needed >= 2) {
          const partial = makeDecisions(['approved']);
          const remaining = total - 1;
          // ตรวจแบบตรง: 1 approve, ที่เหลือยังไม่ตัดสิน
          const out = aggregateQuorum('majority', total, partial);
          if (1 >= needed) expect(out).toBe('approved');
          else if (1 + remaining < needed) expect(out).toBe('rejected');
          else expect(out).toBe('pending');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 28c: first_response — การตัดสินแรกชี้ขาด', () => {
    fc.assert(
      fc.property(arbDecision, fc.array(arbDecision, { maxLength: 5 }), (first, rest) => {
        const decisions = makeDecisions([first, ...rest]);
        expect(aggregateQuorum('first_response', 3, decisions)).toBe(first);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 28d: ไม่มีผู้อนุมัติ → pending', () => {
    expect(aggregateQuorum('unanimous', 0, [])).toBe('pending');
    expect(aggregateQuorum('first_response', 3, [])).toBe('pending');
  });

  it('dedupe: ผู้อนุมัติคนเดิมยึดการตัดสินครั้งแรก', () => {
    const decisions: ApproverDecision[] = [
      { approverId: 'a', decision: 'approved' },
      { approverId: 'a', decision: 'rejected' },
    ];
    expect(aggregateQuorum('unanimous', 1, decisions)).toBe('approved');
  });
});
