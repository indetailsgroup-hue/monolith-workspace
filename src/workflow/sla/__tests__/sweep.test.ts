// Feature: monolith-workflow-copilot — property tests for SLA sweep (Req 13)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeDeadlineMs, dueReminderFractions, isTimedOut } from '../sweep';
import type { SlaConfig } from '../../domain/config';

const CFG: SlaConfig = { deadlineMinutes: 100, reminderFractions: [0.5, 1.0] };

describe('SLA sweep (Req 13)', () => {
  // Feature: monolith-workflow-copilot, Property 26: SLA reminder และ timeout escalation
  it('Property 26: reminder ถึงกำหนดตามสัดส่วน elapsed; timeout เมื่อเกิน deadline', () => {
    const start = 1_000_000;
    const durationMs = CFG.deadlineMinutes * 60 * 1000;
    fc.assert(
      fc.property(fc.double({ min: 0, max: 2, noNaN: true }), (frac) => {
        const now = start + frac * durationMs;
        const due = dueReminderFractions(start, now, CFG);
        for (const f of CFG.reminderFractions) {
          if (frac >= f) expect(due).toContain(f);
          else expect(due).not.toContain(f);
        }
        expect(isTimedOut(start, now, CFG)).toBe(now > computeDeadlineMs(start, CFG));
      }),
      { numRuns: 200 },
    );
  });

  it('computeDeadlineMs ตรงตามสูตร', () => {
    expect(computeDeadlineMs(0, CFG)).toBe(100 * 60 * 1000);
  });
});
