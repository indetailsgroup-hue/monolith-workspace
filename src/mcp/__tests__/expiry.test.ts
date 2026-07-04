// Feature: monolith-mcp-layer, Property 16: Pending expiry + cleanup (no side effects, decision-wins-race)
// Validates: Requirements 16.1, 16.2, 16.3, 16.6, 16.7
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeExpiry,
  resolveExpiry,
  canRecordDecision,
  ONE_HOUR_MS,
  THIRTY_DAYS_MS,
  DEFAULT_TIMEOUT_MS,
} from '../expiry';

describe('mcp expiry — Property 16', () => {
  it('computeExpiry clamp ช่วง 1h–30d; default 72h เมื่อไม่ระบุ (Req 16.1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), fc.option(fc.integer({ min: -ONE_HOUR_MS, max: THIRTY_DAYS_MS * 2 }), { nil: undefined }), (created, timeout) => {
        const exp = computeExpiry(created, timeout ?? undefined);
        const delta = exp - created;
        expect(delta).toBeGreaterThanOrEqual(ONE_HOUR_MS);
        expect(delta).toBeLessThanOrEqual(THIRTY_DAYS_MS);
        if (timeout === undefined) expect(delta).toBe(DEFAULT_TIMEOUT_MS);
      }),
      { numRuns: 300 },
    );
  });

  it('decision ภายใน expiry ชนะ race; เลย expiry+ไม่มี decision → expired; ก่อน → pending (Req 16.7/16.2)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 1, max: 1_000_000 }), fc.option(fc.integer({ min: 0, max: 2_000_000 }), { nil: null }), (now, expiry, decision) => {
        const res = resolveExpiry(now, expiry, decision);
        if (decision !== null && decision <= expiry) expect(res).toBe('decision_wins');
        else if (now >= expiry) expect(res).toBe('expired');
        else expect(res).toBe('pending');
      }),
      { numRuns: 400 },
    );
  });

  it('canRecordDecision: เฉพาะ pending เท่านั้น (Req 16.6 — expired/executed/rejected → ห้าม)', () => {
    expect(canRecordDecision('pending')).toBe(true);
    for (const s of ['expired', 'executed', 'rejected'] as const) {
      expect(canRecordDecision(s)).toBe(false);
    }
  });
});
