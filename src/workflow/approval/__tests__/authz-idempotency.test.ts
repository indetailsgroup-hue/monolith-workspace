// Feature: monolith-workflow-copilot — property tests for authz + idempotency (Req 4)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkApprovalAuthz, applyDecisionEffect } from '../authz';
import { applyIdempotent } from '../idempotency';
import type { WorkItemStatus } from '../../domain/types';

describe('approval anti-impersonation (Req 4.3, 4.4, 4.9)', () => {
  // Feature: monolith-workflow-copilot, Property 7: การกันการปลอมตัวและการคงสถานะ blocked
  it('Property 7: ผู้กด ∉ approver หรือ authz ไม่ผ่าน → reject + keepBlocked', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 6 }),
        fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 4 }),
        fc.boolean(),
        (actor, approvers, otherAuthz) => {
          const res = checkApprovalAuthz({
            resolvedActorId: actor,
            authorizedApproverIds: approvers,
            otherAuthzPasses: otherAuthz,
          });
          const isApprover = approvers.includes(actor);
          if (!isApprover) {
            expect(res).toEqual({ authorized: false, keepBlocked: true, reason: 'not_approver' });
          } else if (!otherAuthz) {
            expect(res).toEqual({ authorized: false, keepBlocked: true, reason: 'authz_failed' });
          } else {
            expect(res).toEqual({ authorized: true });
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 10: ผลของ Approval_Decision ต่อ Work_Item
  it('Property 10: approved → unblock/continue; rejected → rework', () => {
    const statuses: WorkItemStatus[] = ['blocked', 'awaiting_approval', 'in_progress'];
    fc.assert(
      fc.property(fc.constantFrom(...statuses), fc.constantFrom<'approved' | 'rejected'>('approved', 'rejected'), (st, dec) => {
        const next = applyDecisionEffect(dec, st);
        if (dec === 'rejected') expect(next).toBe('rework');
        else if (st === 'blocked' || st === 'awaiting_approval') expect(next).toBe('in_progress');
        else expect(next).toBe(st);
      }),
      { numRuns: 100 },
    );
  });
});

describe('approval idempotency (Req 4.7, 16.5)', () => {
  // Feature: monolith-workflow-copilot, Property 9: Idempotency ของการอนุมัติและการ retry ที่อิสระ
  it('Property 9: event_id ซ้ำ → คืนผลเดิม ไม่ apply ซ้ำ', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 20 }), (ids) => {
        const seen = new Map<string, number>();
        let applyCount = 0;
        const results = ids.map((id) =>
          applyIdempotent(seen, id, () => {
            applyCount++;
            return applyCount;
          }),
        );
        const uniqueIds = new Set(ids);
        // จำนวนครั้งที่ apply จริง = จำนวน id ที่ไม่ซ้ำ
        expect(applyCount).toBe(uniqueIds.size);
        // ผลของ id เดิมต้องเท่ากันทุกครั้ง
        const byId = new Map<string, number>();
        ids.forEach((id, i) => {
          if (byId.has(id)) expect(results[i].result).toBe(byId.get(id));
          else byId.set(id, results[i].result);
        });
      }),
      { numRuns: 200 },
    );
  });
});
