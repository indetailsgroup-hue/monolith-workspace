// Feature: capture-spine, Property 3 + 10 + 11: idempotency, suspicious-not-auto-emit, verify-rule pfmea trace
// Validates: Requirements 1.2, 10.1, 10.2, 11.2, 11.3
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildIdempotencyKey, decideIngest } from '../idempotency';
import { evaluateSuspicion, vatMismatch, type SignalEval } from '../fraud-signal';
import { priorityScore, sortByPriority, allRulesTracePfmea, type VerifyRule } from '../verify-rules';

describe('capture idempotency — Property 3', () => {
  it('key scoped: capture_type/principal ต่าง → key ต่าง แม้ content เดียวกัน (J2)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), fc.string({ minLength: 1, maxLength: 8 }), fc.string({ minLength: 1, maxLength: 8 }), (t, p, h) => {
        expect(buildIdempotencyKey(t, p, h)).toBe(`${t}:${p}:${h}`);
        expect(buildIdempotencyKey(t + 'x', p, h)).not.toBe(buildIdempotencyKey(t, p, h));
      }),
      { numRuns: 200 },
    );
  });

  it('ingest ซ้ำ (มี existing) → return_existing; ไม่มี → create (Req 1.2)', () => {
    expect(decideIngest(undefined)).toEqual({ action: 'create' });
    expect(decideIngest({ id: 'a1' })).toEqual({ action: 'return_existing', id: 'a1' });
  });
});

describe('capture fraud-signal — Property 10', () => {
  it('isSuspicious ⟺ มี signal ใด triggered; ไม่ auto-reject (flag only)', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ signalKey: fc.string({ minLength: 1, maxLength: 6 }), triggered: fc.boolean() }), { maxLength: 6 }), (sigs: SignalEval[]) => {
        const r = evaluateSuspicion(sigs);
        expect(r.isSuspicious).toBe(sigs.some((s) => s.triggered));
        expect(r.triggeredKeys.length).toBe(sigs.filter((s) => s.triggered).length);
      }),
      { numRuns: 300 },
    );
  });

  it('vatMismatch: vat ใกล้ total*7/107 → ไม่ trigger; ผิดมาก → trigger', () => {
    expect(vatMismatch(1070, 70, 0.02)).toBe(false); // 1070*7/107 = 70
    expect(vatMismatch(1070, 200, 0.02)).toBe(true);
    expect(vatMismatch(0, 0, 0.02)).toBe(true); // total ไม่สมเหตุผล
  });
});

describe('capture verify-rules — Property 11', () => {
  const rpnRule = (rpn: number): VerifyRule => ({ checkpoint: 'c', guards_against: 'g', method: 'm', pfmea_ref: { source_file: 'f', source_step: 's' }, priority: { kind: 'rpn', rpn } });
  const sevRule = (sev: number): VerifyRule => ({ checkpoint: 'c', guards_against: 'g', method: 'm', pfmea_ref: { source_file: 'f', source_step: 's' }, priority: { kind: 'severity_only', sev } });

  it('computed RPN ทุกตัวจัดอันดับเหนือ severity_only ทุกตัว (Req 11.3)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 1, max: 10 }), (rpn, sev) => {
        expect(priorityScore(rpnRule(rpn))).toBeGreaterThan(priorityScore(sevRule(sev)));
      }),
      { numRuns: 200 },
    );
  });

  it('sortByPriority: เสี่ยงสูงก่อน (rpn สูง → rpn ต่ำ → sev สูง → sev ต่ำ)', () => {
    const sorted = sortByPriority([sevRule(8), rpnRule(100), sevRule(9), rpnRule(280)]);
    expect(sorted.map((r) => (r.priority.kind === 'rpn' ? `rpn${r.priority.rpn}` : `sev${r.priority.sev}`)))
      .toEqual(['rpn280', 'rpn100', 'sev9', 'sev8']);
  });

  it('ทุก active rule มี pfmea_ref ครบ (Property 11)', () => {
    expect(allRulesTracePfmea([rpnRule(280), sevRule(9)])).toBe(true);
    expect(allRulesTracePfmea([{ checkpoint: 'c', guards_against: 'g', method: 'm', pfmea_ref: { source_file: '', source_step: 's' }, priority: { kind: 'rpn', rpn: 1 } }])).toBe(false);
  });
});
