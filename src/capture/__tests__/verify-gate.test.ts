// Feature: capture-spine, Property 2 + Property 4: critical/suspicious → human confirm + fail-safe no-guess
// Validates: Requirements 4.2, 6.1, 10.2
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateGate, canEmit, isNoGuess, type GateInput } from '../verify-gate';

const arbGate: fc.Arbitrary<GateInput> = fc.record({
  hasCriticalFieldPending: fc.boolean(),
  minConfidence: fc.double({ min: 0, max: 1, noNaN: true }),
  confidenceThreshold: fc.double({ min: 0, max: 1, noNaN: true }),
  isSuspicious: fc.boolean(),
});

describe('capture verify-gate — Property 2', () => {
  it('mustConfirm ⟺ critical pending OR confidence<threshold OR suspicious (Req 4.2/10.2)', () => {
    fc.assert(
      fc.property(arbGate, (g) => {
        const expected = g.hasCriticalFieldPending || g.minConfidence < g.confidenceThreshold || g.isSuspicious;
        expect(evaluateGate(g).mustConfirm).toBe(expected);
      }),
      { numRuns: 400 },
    );
  });

  it('emit ถูกบล็อกจนกว่า human confirm เมื่อ mustConfirm (Property 2)', () => {
    fc.assert(
      fc.property(arbGate, fc.boolean(), (g, confirmed) => {
        const gate = evaluateGate(g);
        const ok = canEmit({ status: 'approved', gate, humanConfirmed: confirmed });
        if (gate.mustConfirm && !confirmed) expect(ok).toBe(false);
      }),
      { numRuns: 400 },
    );
  });

  it('emit เฉพาะจาก approved (ไม่ proposed/rejected/emitted/superseded)', () => {
    const gate = evaluateGate({ hasCriticalFieldPending: false, minConfidence: 1, confidenceThreshold: 0.5, isSuspicious: false });
    for (const s of ['proposed', 'rejected', 'emitted', 'superseded'] as const) {
      expect(canEmit({ status: s, gate, humanConfirmed: true })).toBe(false);
    }
    expect(canEmit({ status: 'approved', gate, humanConfirmed: true })).toBe(true);
  });
});

describe('capture verify-gate — Property 4 (fail-safe no-guess)', () => {
  it('placeholder sentinel ใน field → isNoGuess=false (Req 6.1)', () => {
    expect(isNoGuess({ vendor: 'N/A', total: 100 })).toBe(false);
    expect(isNoGuess({ vendor: 'ACME', total: 100, vat: null })).toBe(true);
    expect(isNoGuess({ note: 'unknown' })).toBe(false);
  });
});
