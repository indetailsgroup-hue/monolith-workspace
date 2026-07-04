// Feature: monolith-workflow-copilot — property tests for approver resolution + delegation (Req 3, 14)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveApprovers, type ApproverCandidate } from '../approver';
import { routeApprover, type Delegation } from '../delegation-routing';
import { authorizeDelegation } from '../../delegation/authorize';

describe('approver resolution (Req 3.1–3.4)', () => {
  const arbCandidate = fc.record({
    id: fc.string({ minLength: 1, maxLength: 5 }),
    isAccountable: fc.boolean(),
    hasAppRole: fc.boolean(),
  });
  // Feature: monolith-workflow-copilot, Property 6: การหา Approver จาก RACI + C12 และ fail-safe escalation
  it('Property 6: eligible = accountable ∩ hasAppRole; ว่าง → fail-safe escalate', () => {
    fc.assert(
      fc.property(fc.array(arbCandidate, { maxLength: 6 }), (cands) => {
        // ทำ id ไม่ซ้ำเพื่อความชัดเจน
        const uniq: ApproverCandidate[] = [];
        const seen = new Set<string>();
        for (const c of cands) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            uniq.push(c);
          }
        }
        const res = resolveApprovers(uniq);
        const eligible = uniq.filter((c) => c.isAccountable && c.hasAppRole);
        if (eligible.length === 0) {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.escalateTo).toBe('executive_owner');
        } else {
          expect(res.ok).toBe(true);
          if (res.ok) {
            expect(res.approverIds.sort()).toEqual(eligible.map((c) => c.id).sort());
            expect(res.requiresQuorum).toBe(eligible.length > 1);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('delegation routing + authorization (Req 14)', () => {
  // Feature: monolith-workflow-copilot, Property 27: การมอบหมายผ่านเมื่อบทบาทเพียงพอ + route ตามช่วงเวลา
  it('Property 27a: route ไป acting เฉพาะเมื่อ now ∈ [start,end]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (start, span, now) => {
          const end = start + span;
          const deleg: Delegation = {
            approverId: 'app',
            actingApproverId: 'acting',
            startMs: start,
            endMs: end,
          };
          const routed = routeApprover('app', [deleg], now);
          if (now >= start && now <= end) expect(routed).toBe('acting');
          else expect(routed).toBe('app');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('Property 27b: authorize ผ่านเมื่อบทบาทเพียงพอเท่านั้น', () => {
    fc.assert(
      fc.property(fc.boolean(), (sufficient) => {
        const res = authorizeDelegation({ actingHasSufficientRole: sufficient });
        expect(res.allowed).toBe(sufficient);
      }),
      { numRuns: 50 },
    );
  });
});
