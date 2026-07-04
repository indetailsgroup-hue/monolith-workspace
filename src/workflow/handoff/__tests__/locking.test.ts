// Feature: monolith-workflow-copilot — property tests for optimistic locking (Req 16)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { atomicTransition, checkVersion } from '../locking';

interface WI {
  version: number;
  status: string;
}

describe('optimistic locking + atomicity (Req 16)', () => {
  // Feature: monolith-workflow-copilot, Property 29: Optimistic locking และ atomicity ของ state transition
  it('Property 29: ใช้ได้เมื่อ version ตรงเท่านั้น; ไม่ตรง → คงสถานะเดิม', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (current, expected) => {
          const state: WI = { version: current, status: 'in_progress' };
          const res = atomicTransition(state, expected, () => ({ status: 'completed' }));
          if (current === expected) {
            expect(res.ok).toBe(true);
            if (res.ok) {
              expect(res.next.version).toBe(current + 1); // increment atomic
              expect(res.next.status).toBe('completed');
            }
          } else {
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.error).toBe('version_conflict');
            // state เดิมไม่ถูกแตะ
            expect(state.status).toBe('in_progress');
            expect(state.version).toBe(current);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('checkVersion ตรงไปตรงมา', () => {
    expect(checkVersion(3, 3)).toBe(true);
    expect(checkVersion(3, 2)).toBe(false);
  });
});
