// Feature: monolith-workflow-copilot — resolve-then-route composition (Req 3 + 14.4)
// mirrors rpc_resolve_approver v2 (migration 0082): the resolved RACI Accountable
// set is routed through active delegations before Approval_Requests are created.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  resolveApproversWithDelegation,
  routeResolvedApprover,
  type StoredDelegation,
} from '../resolve-with-delegation';

function deleg(overrides: Partial<StoredDelegation>): StoredDelegation {
  return {
    approverActor: 'alice@daph',
    actingActor: 'bob@daph',
    processStep: 'Design',
    siteCode: null,
    startMs: 100,
    endMs: 200,
    isRevoked: false,
    ...overrides,
  };
}

describe('routeResolvedApprover — step/site/revoked filters (Req 14.4)', () => {
  const ctx = { processStep: 'Design', siteCode: 'HQ', nowMs: 150 };

  it('routes to acting when an active, in-window delegation matches step + site', () => {
    expect(routeResolvedApprover('alice@daph', [deleg({ siteCode: 'HQ' })], ctx)).toBe('bob@daph');
  });

  it('global (site null) delegation applies to any site', () => {
    expect(routeResolvedApprover('alice@daph', [deleg({ siteCode: null })], ctx)).toBe('bob@daph');
  });

  it('does NOT route when site differs', () => {
    expect(routeResolvedApprover('alice@daph', [deleg({ siteCode: 'OTHER' })], ctx)).toBe('alice@daph');
  });

  it('does NOT route when process step differs', () => {
    expect(routeResolvedApprover('alice@daph', [deleg({ processStep: 'Installation' })], ctx)).toBe('alice@daph');
  });

  it('does NOT route when revoked (Req 14.6 — next request returns to original)', () => {
    expect(routeResolvedApprover('alice@daph', [deleg({ isRevoked: true })], ctx)).toBe('alice@daph');
  });

  it('does NOT route when now is outside [start,end]', () => {
    const outside = { ...ctx, nowMs: 250 };
    expect(routeResolvedApprover('alice@daph', [deleg({})], outside)).toBe('alice@daph');
  });
});

describe('resolveApproversWithDelegation — resolve → route → dedup', () => {
  const ctx = { processStep: 'Design', siteCode: 'HQ', nowMs: 150 };

  it('marks routed approvers delegated and keeps un-delegated ones as themselves', () => {
    const out = resolveApproversWithDelegation(
      ['alice@daph', 'carol@daph'],
      [deleg({ approverActor: 'alice@daph', actingActor: 'bob@daph', siteCode: 'HQ' })],
      ctx,
    );
    expect(out).toEqual([
      { original: 'alice@daph', effective: 'bob@daph', delegated: true },
      { original: 'carol@daph', effective: 'carol@daph', delegated: false },
    ]);
  });

  it('dedups when two original approvers both delegate to the same acting approver (one request)', () => {
    const out = resolveApproversWithDelegation(
      ['alice@daph', 'carol@daph'],
      [
        deleg({ approverActor: 'alice@daph', actingActor: 'bob@daph', siteCode: 'HQ' }),
        deleg({ approverActor: 'carol@daph', actingActor: 'bob@daph', siteCode: 'HQ' }),
      ],
      ctx,
    );
    expect(out).toEqual([
      { original: 'alice@daph', effective: 'bob@daph', delegated: true },
      // carol → bob collapses into the single bob request
    ]);
  });

  it('is identity when there are no delegations', () => {
    const out = resolveApproversWithDelegation(['alice@daph', 'carol@daph'], [], ctx);
    expect(out.map((r) => r.effective)).toEqual(['alice@daph', 'carol@daph']);
    expect(out.every((r) => !r.delegated)).toBe(true);
  });

  // Property: an active delegation is applied iff now is in-window, and the
  // effective set never contains the delegating approver when routing is active.
  it('Property: active delegation ⇒ acting receives, original does not (in-window)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 }), (now) => {
        const d = deleg({ approverActor: 'alice@daph', actingActor: 'bob@daph', siteCode: null, startMs: 100, endMs: 200 });
        const out = resolveApproversWithDelegation(['alice@daph'], [d], { processStep: 'Design', siteCode: 'HQ', nowMs: now });
        const effective = out[0].effective;
        if (now >= 100 && now <= 200) {
          expect(effective).toBe('bob@daph');
        } else {
          expect(effective).toBe('alice@daph');
        }
      }),
      { numRuns: 200 },
    );
  });
});
