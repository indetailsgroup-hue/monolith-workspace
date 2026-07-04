// Feature: monolith-mcp-layer, Property 10: PDPA consent + cross-border fail-safe
// Validates: Requirements 10.1, 10.2, 10.3
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluatePdpa, type PdpaInput } from '../pdpa';

const arbInput: fc.Arbitrary<PdpaInput> = fc.record({
  hasPii: fc.boolean(),
  hasConsent: fc.boolean(),
  llmLocationKnown: fc.boolean(),
  isCrossBorder: fc.boolean(),
  hasAdequateSafeguards: fc.boolean(),
});

describe('mcp pdpa — Property 10', () => {
  it('PII + ไม่มี consent → suppress_no_consent (Req 10.1)', () => {
    fc.assert(
      fc.property(arbInput, (i) => {
        if (i.hasPii && !i.hasConsent) {
          expect(evaluatePdpa(i).action).toBe('suppress_no_consent');
        }
      }),
      { numRuns: 300 },
    );
  });

  it('cross-border (รวม location ไม่ทราบ) + ไม่มีมาตรการพอ → suppress_cross_border (Req 10.3 fail-safe)', () => {
    fc.assert(
      fc.property(arbInput, (i) => {
        if (!i.hasPii || !i.hasConsent) return;
        const crossBorder = i.llmLocationKnown ? i.isCrossBorder : true;
        if (crossBorder && !i.hasAdequateSafeguards) {
          expect(evaluatePdpa(i).action).toBe('suppress_cross_border');
        }
      }),
      { numRuns: 400 },
    );
  });

  it('location ไม่ทราบ → ถือเป็น cross-border เสมอ (fail-safe OQ-MCP-1)', () => {
    fc.assert(
      fc.property(arbInput, (i) => {
        if (!i.hasPii || !i.hasConsent || i.llmLocationKnown) return;
        const d = evaluatePdpa(i);
        // ไม่มีมาตรการ → suppress; มีมาตรการ → allow แต่ crossBorder=true + mustRedact
        if (i.hasAdequateSafeguards) {
          expect(d).toEqual({ action: 'allow', crossBorder: true, mustRedact: true });
        } else {
          expect(d.action).toBe('suppress_cross_border');
        }
      }),
      { numRuns: 300 },
    );
  });

  it('ไม่มี PII → allow เสมอ (no PDPA gate)', () => {
    fc.assert(
      fc.property(arbInput, (i) => {
        if (!i.hasPii) expect(evaluatePdpa(i)).toEqual({ action: 'allow', crossBorder: false, mustRedact: false });
      }),
      { numRuns: 200 },
    );
  });
});
