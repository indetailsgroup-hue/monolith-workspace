/**
 * releaseStateModel.test.ts - Task 4 release state-machine tests
 *
 * Pins the pure release state machine for the MONOLITH Production Trust Kernel
 * (approved design 2026-07-22 §6 domain model & lifecycle, §10 release
 * transaction choreography). The legal/illegal transition table is DRIVEN from
 * Task 1's status tuples (`../result.js`), so the machine can never drift from
 * the authoritative status members. The database migration
 * `0182_trust_kernel_release_authority.sql` enforces the same machine at the
 * authority boundary; `../contracts/releasePorts.ts` mirrors the RPC surface
 * that Task 8's worker consumes.
 *
 * Phase: NOT_FOR_PRODUCTION. Pure functions and types only; no I/O, no crypto.
 *
 * @version 0.13.2
 */

import { describe, it, expect } from 'vitest';
import {
  RELEASE_ATTEMPT_STATUSES,
  ARTIFACT_STATUSES,
  RELEASE_REVISION_STATUSES,
} from '../result.js';
import {
  RELEASE_TRANSITIONS,
  RELEASE_AGGREGATES,
  canReleaseTransition,
  legalReleaseTargets,
  isTerminalReleaseStatus,
  isReleaseConsumable,
  type ReleaseAggregate,
} from '../contracts/releasePorts.js';

// ---------------------------------------------------------------------------
// Independently restated expected machine (design §6, §10). If the port drifts
// from this, the test fails; if Task 1's tuples drift, the "covers exactly"
// tests fail. Both anchors must agree.
// ---------------------------------------------------------------------------
const EXPECTED = {
  attempt: {
    PENDING: ['FAILED', 'PUBLISHED', 'VOID'],
    FAILED: [],
    PUBLISHED: [],
    VOID: [],
  },
  artifact: {
    QUARANTINED: ['MATERIALIZING', 'VOID'],
    MATERIALIZING: ['AVAILABLE', 'VOID'],
    AVAILABLE: [],
    VOID: [],
  },
  revision: {
    ACTIVE: ['REVOKED'],
    REVOKED: [],
  },
} as const;

const TUPLES: Record<ReleaseAggregate, readonly string[]> = {
  attempt: RELEASE_ATTEMPT_STATUSES,
  artifact: ARTIFACT_STATUSES,
  revision: RELEASE_REVISION_STATUSES,
};

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('release state machine — driven from Task 1 status tuples', () => {
  it('exposes exactly the three release aggregates', () => {
    expect(sorted(RELEASE_AGGREGATES)).toEqual(['artifact', 'attempt', 'revision']);
  });

  for (const aggregate of RELEASE_AGGREGATES) {
    it(`${aggregate}: transition-table states are exactly Task 1's status tuple`, () => {
      expect(sorted(Object.keys(RELEASE_TRANSITIONS[aggregate]))).toEqual(sorted(TUPLES[aggregate]));
      // Every declared target is itself a valid status of the same aggregate.
      for (const from of Object.keys(RELEASE_TRANSITIONS[aggregate])) {
        for (const to of RELEASE_TRANSITIONS[aggregate][from]) {
          expect(TUPLES[aggregate]).toContain(to);
        }
      }
    });

    it(`${aggregate}: legal transitions match the independently restated machine`, () => {
      const expected = EXPECTED[aggregate] as Record<string, readonly string[]>;
      for (const from of TUPLES[aggregate]) {
        expect(sorted(legalReleaseTargets(aggregate, from))).toEqual(sorted(expected[from]));
        for (const to of TUPLES[aggregate]) {
          expect(canReleaseTransition(aggregate, from, to)).toBe(expected[from].includes(to));
        }
      }
    });
  }
});

describe('terminal states have no outgoing transitions (append-only history)', () => {
  const terminals: Array<[ReleaseAggregate, string]> = [
    ['attempt', 'FAILED'],
    ['attempt', 'PUBLISHED'],
    ['attempt', 'VOID'],
    ['artifact', 'AVAILABLE'],
    ['artifact', 'VOID'],
    ['revision', 'REVOKED'],
  ];
  for (const [aggregate, status] of terminals) {
    it(`${aggregate}.${status} is terminal`, () => {
      expect(isTerminalReleaseStatus(aggregate, status)).toBe(true);
      expect(legalReleaseTargets(aggregate, status)).toEqual([]);
    });
  }

  it('PENDING / QUARANTINED / MATERIALIZING / ACTIVE are non-terminal', () => {
    expect(isTerminalReleaseStatus('attempt', 'PENDING')).toBe(false);
    expect(isTerminalReleaseStatus('artifact', 'QUARANTINED')).toBe(false);
    expect(isTerminalReleaseStatus('artifact', 'MATERIALIZING')).toBe(false);
    expect(isTerminalReleaseStatus('revision', 'ACTIVE')).toBe(false);
  });
});

describe('VOID is legal only for attempt and artifact, never a release revision (§6.6)', () => {
  it('VOID is a member of attempt and artifact status tuples', () => {
    expect(RELEASE_ATTEMPT_STATUSES).toContain('VOID');
    expect(ARTIFACT_STATUSES).toContain('VOID');
  });

  it('VOID is not a release-revision status at all', () => {
    expect(RELEASE_REVISION_STATUSES).not.toContain('VOID');
    // No revision transition can target VOID because it is not a revision state.
    for (const from of RELEASE_REVISION_STATUSES) {
      expect(canReleaseTransition('revision', from, 'VOID' as never)).toBe(false);
    }
  });

  it('VOID is a legal transition target for attempt and artifact', () => {
    expect(canReleaseTransition('attempt', 'PENDING', 'VOID')).toBe(true);
    expect(canReleaseTransition('artifact', 'QUARANTINED', 'VOID')).toBe(true);
    expect(canReleaseTransition('artifact', 'MATERIALIZING', 'VOID')).toBe(true);
  });
});

describe('unknown states are rejected (defensive)', () => {
  it('an unknown from/to never transitions', () => {
    expect(canReleaseTransition('attempt', 'NOPE' as never, 'VOID')).toBe(false);
    expect(canReleaseTransition('attempt', 'PENDING', 'NOPE' as never)).toBe(false);
    expect(legalReleaseTargets('attempt', 'NOPE' as never)).toEqual([]);
    expect(isTerminalReleaseStatus('attempt', 'NOPE' as never)).toBe(false);
  });
});

describe('a committed ACTIVE revision is consumable only with an AVAILABLE artifact (§10.2)', () => {
  it('is true only for (ACTIVE, AVAILABLE)', () => {
    for (const rev of RELEASE_REVISION_STATUSES) {
      for (const art of ARTIFACT_STATUSES) {
        const expected = rev === 'ACTIVE' && art === 'AVAILABLE';
        expect(isReleaseConsumable(rev, art)).toBe(expected);
      }
    }
  });

  it('a REVOKED revision with an AVAILABLE artifact is not consumable', () => {
    expect(isReleaseConsumable('REVOKED', 'AVAILABLE')).toBe(false);
  });

  it('an ACTIVE revision with a MATERIALIZING artifact is not yet consumable', () => {
    expect(isReleaseConsumable('ACTIVE', 'MATERIALIZING')).toBe(false);
  });
});
