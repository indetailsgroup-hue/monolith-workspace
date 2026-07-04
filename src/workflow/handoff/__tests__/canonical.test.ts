// Feature: monolith-workflow-copilot — property tests for canonical handoff (Req 2)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildDefaultProcessModel, CANONICAL_PROCESS_ORDER } from '../../domain/constants';
import { validateHandoff, nextCanonicalStep, isLastStep } from '../canonical';
import type { ProcessStep } from '../../domain/types';

const MODEL = buildDefaultProcessModel();
const STEPS = CANONICAL_PROCESS_ORDER;
const arbStepIdx = fc.integer({ min: 0, max: STEPS.length - 1 });

describe('canonical handoff (Req 2)', () => {
  // Feature: monolith-workflow-copilot, Property 4: การบังคับลำดับ canonical ของ Process_Step
  it('Property 4: handoff ผ่านเฉพาะขั้นถัดไปติดกันเท่านั้น', () => {
    fc.assert(
      fc.property(arbStepIdx, arbStepIdx, (fromIdx, toIdx) => {
        const from = STEPS[fromIdx];
        const to = STEPS[toIdx];
        const res = validateHandoff(MODEL, from, to);
        if (toIdx === fromIdx + 1) {
          expect(res.ok).toBe(true);
        } else {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.error).toBe('invalid_sequence');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Property 4b: step ที่ไม่อยู่ในโมเดล → unknown_*_step', () => {
    const ghost = 'GhostStep' as ProcessStep;
    expect(validateHandoff(MODEL, ghost, 'Sale')).toEqual({
      ok: false,
      error: 'unknown_current_step',
    });
    expect(validateHandoff(MODEL, 'Sale', ghost)).toEqual({
      ok: false,
      error: 'unknown_target_step',
    });
  });

  // Feature: monolith-workflow-copilot, Property 5: Site_Code ยอมรับเมื่อ active เท่านั้น
  it('Property 5: site_code ที่ไม่ active → inactive_site', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: STEPS.length - 2 }),
        fc.string(),
        fc.array(fc.string(), { maxLength: 4 }),
        (fromIdx, site, active) => {
          const res = validateHandoff(MODEL, STEPS[fromIdx], STEPS[fromIdx + 1], {
            siteCode: site,
            activeSiteCodes: active,
          });
          if (active.includes(site)) {
            expect(res.ok).toBe(true);
          } else {
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.error).toBe('inactive_site');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 5b: site_code = null + เปิดเงื่อนไข active → inactive_site', () => {
    const res = validateHandoff(MODEL, 'Sale', 'Area Measurement', {
      siteCode: null,
      activeSiteCodes: ['BKK-HQ-01'],
    });
    expect(res).toEqual({ ok: false, error: 'inactive_site' });
  });

  it('nextCanonicalStep + isLastStep สอดคล้องกับลำดับ', () => {
    expect(nextCanonicalStep(MODEL, 'Sale')).toBe('Area Measurement');
    expect(nextCanonicalStep(MODEL, 'Installation')).toBeUndefined();
    expect(isLastStep(MODEL, 'Installation')).toBe(true);
    expect(isLastStep(MODEL, 'Sale')).toBe(false);
  });
});
