// Feature: monolith-workflow-copilot — property tests for Copilot builder + freshness (Req 5, 17)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildSuggestion, type CopilotOption, type PfmeaCitation } from '../builder';
import { evaluateFreshness } from '../freshness';
import type { AutonomyLadderTier } from '../../autonomy/registry';

const goodOption: CopilotOption = { label: 'opt', pros: ['p'], cons: ['c'] };
const citation: PfmeaCitation = {
  processStep: 'Designer',
  failureMode: 'fm',
  rpn: 80,
  rpnStatus: 'computed',
};
const arbTier = fc.constantFrom<AutonomyLadderTier>('L0_advisory', 'L1_propose');

describe('Copilot suggestion builder (Req 5)', () => {
  // Feature: monolith-workflow-copilot, Property 11: รูปร่าง Copilot_Suggestion และการกำกับ D2
  it('Property 11: 2–3 options + pros/cons + citation; advisory-only', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), arbTier, fc.boolean(), (n, tier, mech) => {
        const options = Array.from({ length: n }, () => ({ ...goodOption }));
        const res = buildSuggestion({
          options,
          citation,
          autonomyTier: tier,
          approvalMechanismReady: mech,
        });
        if (n < 2 || n > 3) {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.error).toBe('invalid_option_count');
        } else if (tier !== 'L0_advisory' && !mech) {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.error).toBe('fail_safe_block_no_approval');
        } else {
          expect(res.ok).toBe(true);
          if (res.ok) expect(res.advisoryOnly).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Property 11b: ขาด citation → reject', () => {
    const res = buildSuggestion({
      options: [goodOption, goodOption],
      citation: null,
      autonomyTier: 'L0_advisory',
      approvalMechanismReady: true,
    });
    expect(res).toEqual({ ok: false, error: 'missing_pfmea_citation' });
  });

  it('Property 11c: option ไม่มี pros/cons → reject', () => {
    const res = buildSuggestion({
      options: [{ label: 'a', pros: [], cons: ['c'] }, goodOption],
      citation,
      autonomyTier: 'L0_advisory',
      approvalMechanismReady: true,
    });
    expect(res).toEqual({ ok: false, error: 'option_missing_pros_cons' });
  });
});

describe('knowledge freshness (Req 17)', () => {
  // Feature: monolith-workflow-copilot, Property 30: ความสดใหม่และความน่าเชื่อถือของความรู้
  it('Property 30: stale → warning; review≠approved → low confidence; ไม่ซ่อนเสมอ', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: 1, max: 90 }),
        fc.constantFrom('approved', 'pending', 'draft'),
        (ageDays, threshold, review) => {
          const now = 1_000_000_000_000;
          const importedAt = now - ageDays * 24 * 60 * 60 * 1000;
          const res = evaluateFreshness({
            sourceVersion: 'v1',
            importedAtMs: importedAt,
            nowMs: now,
            staleAfterDays: threshold,
            reviewStatus: review,
          });
          expect(res.hidden).toBe(false);
          expect(res.stale).toBe(ageDays > threshold);
          expect(res.warning).toBe(ageDays > threshold);
          expect(res.lowConfidence).toBe(review !== 'approved');
        },
      ),
      { numRuns: 200 },
    );
  });
});
