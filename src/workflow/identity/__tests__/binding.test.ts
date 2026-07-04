// Feature: monolith-workflow-copilot — property tests for identity binding (Req 1)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canCreateBinding, canDirectPush, type IdentityBinding } from '../binding';

describe('identity binding (Req 1)', () => {
  // Feature: monolith-workflow-copilot, Property 1: ความไม่ซ้ำของ Identity_Binding ที่ active
  it('Property 1: สร้าง binding ใหม่ได้เฉพาะเมื่อไม่มี active binding ของ lineUserId เดิม', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineUserId: fc.constantFrom('U1', 'U2', 'U3'),
            actorId: fc.string({ minLength: 1, maxLength: 4 }),
            department: fc.constant('D'),
            isActive: fc.boolean(),
          }),
          { maxLength: 8 },
        ),
        fc.constantFrom('U1', 'U2', 'U3'),
        (existing, target) => {
          const res = canCreateBinding(existing as IdentityBinding[], target);
          const hasActive = (existing as IdentityBinding[]).some(
            (b) => b.lineUserId === target && b.isActive,
          );
          if (hasActive) {
            expect(res).toEqual({ ok: false, error: 'duplicate_active_line_user' });
          } else {
            expect(res).toEqual({ ok: true });
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 3: การเพิกถอน binding หยุด direct notification ทันที
  it('Property 3: revoked → ไม่ direct push แม้ isActive ยัง true', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isActive, revoked) => {
        expect(canDirectPush({ isActive, revoked })).toBe(isActive && !revoked);
      }),
      { numRuns: 50 },
    );
  });
});
