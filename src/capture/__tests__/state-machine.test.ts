// Feature: capture-spine, Property 1 + Property 6: no-commit-until-emitted + terminal immutability
// Validates: Requirements 4.1, 5.1, 5.2, 5.4
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  type CaptureStatus,
  canTransition,
  canPromote,
  canCommitBusiness,
  isTerminal,
  isContentImmutable,
} from '../state-machine';

const STATUSES: CaptureStatus[] = ['proposed', 'approved', 'rejected', 'emitted', 'superseded'];
const arbStatus = fc.constantFrom(...STATUSES);

describe('capture state-machine — Property 1 (no-commit-until-emitted)', () => {
  it('canCommitBusiness ⟺ status === emitted', () => {
    fc.assert(
      fc.property(arbStatus, (s) => {
        expect(canCommitBusiness(s)).toBe(s === 'emitted');
      }),
      { numRuns: 100 },
    );
  });

  it('canPromote ⟺ status === approved (approve-before-promote Req 5.2)', () => {
    fc.assert(
      fc.property(arbStatus, (s) => {
        expect(canPromote(s)).toBe(s === 'approved');
      }),
      { numRuns: 100 },
    );
  });
});

describe('capture state-machine — Property 6 (terminal / immutability) + K1 fix', () => {
  it('terminal (no outgoing) = rejected/superseded เท่านั้น; emitted ไม่ใช่ terminal (→superseded ได้)', () => {
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('superseded')).toBe(true);
    expect(isTerminal('emitted')).toBe(false); // K1
    expect(canTransition('emitted', 'superseded')).toBe(true);
  });

  it('terminal จริง (rejected/superseded) ไม่มี transition ออกเลย', () => {
    fc.assert(
      fc.property(arbStatus, (to) => {
        expect(canTransition('rejected', to)).toBe(false);
        expect(canTransition('superseded', to)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('content immutable = emitted/superseded/rejected (Req 5.4)', () => {
    fc.assert(
      fc.property(arbStatus, (s) => {
        expect(isContentImmutable(s)).toBe(s === 'emitted' || s === 'superseded' || s === 'rejected');
      }),
      { numRuns: 100 },
    );
  });

  it('transition graph: proposed→{approved,rejected}, approved→emitted, emitted→superseded เท่านั้น', () => {
    fc.assert(
      fc.property(arbStatus, arbStatus, (from, to) => {
        const allowed =
          (from === 'proposed' && (to === 'approved' || to === 'rejected')) ||
          (from === 'approved' && to === 'emitted') ||
          (from === 'emitted' && to === 'superseded');
        expect(canTransition(from, to)).toBe(allowed);
      }),
      { numRuns: 300 },
    );
  });
});
