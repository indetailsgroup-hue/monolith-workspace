// Feature: monolith-workflow-copilot — property tests for capture-once-reuse (Req 12.1)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { missingFields, canReuseAll, mergeCaptured } from '../capture-reuse';

describe('capture-once-reuse (Req 12.1)', () => {
  // Feature: monolith-workflow-copilot, Property 24: Capture-once-reuse
  it('Property 24: field ที่ป้อนแล้วไม่ถูกขอซ้ำ', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 4 }), fc.integer()),
        fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 8 }),
        (data, required) => {
          const missing = missingFields(data, required);
          // ทุก field ที่ "missing" ต้องไม่มีค่าใน data
          for (const f of missing) {
            expect(data[f] === undefined || data[f] === null).toBe(true);
          }
          // field ที่ required และมีค่าแล้ว ต้องไม่อยู่ใน missing
          for (const f of required) {
            if (data[f] !== undefined && data[f] !== null) {
              expect(missing).not.toContain(f);
            }
          }
          expect(canReuseAll(data, required)).toBe(missing.length === 0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('mergeCaptured: ของเดิมคงไว้ ใหม่ override', () => {
    expect(mergeCaptured({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });
});
