// Feature: monolith-mcp-layer, Property 15: Rate-limit + cost atomic (no overshoot)
// Validates: Requirements 15.1, 15.2, 15.3, 15.6, 15.7, 15.8
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateRateLimit, type ScopeState } from '../ratelimit';
import type { ScopeKind } from '../domain/types';

const arbScope: fc.Arbitrary<ScopeState> = fc.record({
  scopeKind: fc.constantFrom<ScopeKind>('Principal', 'MCP_Client', 'Tool_Class'),
  scopeKey: fc.string({ minLength: 1, maxLength: 8 }),
  currentCount: fc.nat({ max: 20 }),
  accruedCost: fc.double({ min: 0, max: 100, noNaN: true }),
  maxCount: fc.integer({ min: 1, max: 20 }),
  maxCost: fc.double({ min: 1, max: 100, noNaN: true }),
});

describe('mcp ratelimit — Property 15', () => {
  it('reject ⟺ มี scope ที่ count+1>max หรือ cost+est≥budget (Req 15.2/15.3)', () => {
    fc.assert(
      fc.property(fc.array(arbScope, { minLength: 1, maxLength: 3 }), fc.double({ min: 0, max: 50, noNaN: true }), (scopes, est) => {
        const r = evaluateRateLimit(scopes, est);
        const anyViolate = scopes.some(
          (s) => s.currentCount + 1 > s.maxCount || s.accruedCost + est >= s.maxCost,
        );
        expect(r.ok).toBe(!anyViolate);
      }),
      { numRuns: 400 },
    );
  });

  it('deterministic: คืน scope แรกที่ละเมิดตามลำดับ (Req 15.1)', () => {
    fc.assert(
      fc.property(fc.array(arbScope, { minLength: 1, maxLength: 3 }), fc.double({ min: 0, max: 50, noNaN: true }), (scopes, est) => {
        const r = evaluateRateLimit(scopes, est);
        if (r.ok) return;
        const firstIdx = scopes.findIndex(
          (s) => s.currentCount + 1 > s.maxCount || s.accruedCost + est >= s.maxCost,
        );
        expect(r.scopeKey).toBe(scopes[firstIdx].scopeKey);
      }),
      { numRuns: 300 },
    );
  });

  it('ทุก scope ภายในเพดาน → ok (no false reject)', () => {
    fc.assert(
      fc.property(fc.array(arbScope, { minLength: 1, maxLength: 3 }), fc.double({ min: 0, max: 50, noNaN: true }), (scopes, est) => {
        const allOk = scopes.every((s) => s.currentCount + 1 <= s.maxCount && s.accruedCost + est < s.maxCost);
        if (allOk) expect(evaluateRateLimit(scopes, est).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
