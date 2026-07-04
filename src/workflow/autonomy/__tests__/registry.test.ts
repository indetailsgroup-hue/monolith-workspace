// Feature: monolith-workflow-copilot — property tests for Action Type Registry (Req 19)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  type ActionTypeEntry,
  type AutonomyLadderTier,
  type PfmeaRiskRow,
  type RiskClass,
  TIER_RANK,
  PHASE_MAX_TIER,
  deriveRiskFromExport,
  classifyAutonomyTier,
  clampTierForPhase,
  satisfiesR02ImpliesHigh,
  satisfiesCeilingForRisk,
  satisfiesPhaseCap,
  UnregisteredActionTypeError,
} from '../registry';

const RISK_CLASSES: RiskClass[] = ['low', 'medium', 'high'];
const TIERS: AutonomyLadderTier[] = [
  'L0_advisory',
  'L1_propose',
  'L2_auto_within_guardrail',
  'L3_auto_with_notify',
];

const arbTier = fc.constantFrom(...TIERS);
const arbRisk = fc.constantFrom(...RISK_CLASSES);

/** entry ที่ valid ตามทุก invariant (จำลองสิ่งที่ DB ยอมรับ) */
const arbValidEntry = fc
  .record({
    actionType: fc.string({ minLength: 1, maxLength: 12 }),
    r02Bound: fc.boolean(),
    maxAllowedTier: fc.constantFrom<AutonomyLadderTier>('L0_advisory', 'L1_propose'),
    riskSource: fc.constantFrom<'manual' | 'derived'>('manual', 'derived'),
  })
  .map(({ actionType, r02Bound, maxAllowedTier, riskSource }) => {
    // r02_bound ⇒ high; มิฉะนั้นสุ่ม risk ใดก็ได้ (tier ≤ L1 ครอบทุก risk อยู่แล้ว)
    const riskClass: RiskClass = r02Bound ? 'high' : 'medium';
    const entry: ActionTypeEntry = {
      actionType,
      riskClass,
      maxAllowedTier,
      r02Bound,
      riskSource,
    };
    return entry;
  });

describe('Action Type Registry — autonomy classification (Req 19)', () => {
  // Feature: monolith-workflow-copilot, Property 32: REG-1 — r02_bound ⇒ high risk
  it('Property 32: REG-1 — r02_bound ⇒ high risk', () => {
    fc.assert(
      fc.property(arbRisk, arbTier, fc.boolean(), (riskClass, maxAllowedTier, r02Bound) => {
        const entry: ActionTypeEntry = {
          actionType: 'a',
          riskClass,
          maxAllowedTier,
          r02Bound,
          riskSource: 'manual',
        };
        // constraint satisfied ก็ต่อเมื่อ (ไม่ผูก r02) หรือ risk=high
        expect(satisfiesR02ImpliesHigh(entry)).toBe(!r02Bound || riskClass === 'high');
      }),
      { numRuns: 200 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 33: REG-2 — risk ≠ low ⇒ tier ≤ L1 (invariant ถาวร)
  it('Property 33: REG-2 — risk ≠ low ⇒ tier ≤ L1', () => {
    fc.assert(
      fc.property(arbRisk, arbTier, (riskClass, maxAllowedTier) => {
        const entry: ActionTypeEntry = {
          actionType: 'a',
          riskClass,
          maxAllowedTier,
          r02Bound: false,
          riskSource: 'manual',
        };
        const ok = satisfiesCeilingForRisk(entry);
        if (riskClass !== 'low') {
          expect(ok).toBe(TIER_RANK[maxAllowedTier] <= TIER_RANK.L1_propose);
        } else {
          expect(ok).toBe(true); // low → ceiling นี้ไม่บังคับ (phase cap จัดการแยก)
        }
      }),
      { numRuns: 200 },
    );
  });

  // Feature: monolith-workflow-copilot, Property 34: REG-3 — classify_autonomy_tier clamp ≤ L1
  it('Property 34: REG-3 — classify clamp ผลลัพธ์ ≤ L1 เสมอ', () => {
    fc.assert(
      fc.property(arbRisk, arbTier, fc.boolean(), (riskClass, maxAllowedTier, r02Bound) => {
        const registry = new Map<string, ActionTypeEntry>([
          ['act', { actionType: 'act', riskClass, maxAllowedTier, r02Bound, riskSource: 'manual' }],
        ]);
        const tier = classifyAutonomyTier(registry, 'act');
        // ผลลัพธ์ต้อง ≤ L1 ไม่ว่า table จะตั้งไว้สูงแค่ไหน
        expect(TIER_RANK[tier] <= TIER_RANK[PHASE_MAX_TIER]).toBe(true);
        // และตรงกับ clampTierForPhase ของ tier ที่ตั้งไว้
        expect(tier).toBe(clampTierForPhase(maxAllowedTier));
      }),
      { numRuns: 200 },
    );
  });

  it('Property 34b: classify action ที่ไม่ลงทะเบียน → throw (Req 19.6)', () => {
    const registry = new Map<string, ActionTypeEntry>();
    expect(() => classifyAutonomyTier(registry, 'nope')).toThrow(UnregisteredActionTypeError);
  });

  // Feature: monolith-workflow-copilot, Property 42: ทุก action_type max_allowed_tier ≤ L1 ใน phase นี้ (§5)
  it('Property 42: phase cap — ทุก row (รวม low) ⇒ tier ≤ L1', () => {
    fc.assert(
      fc.property(arbRisk, arbTier, (riskClass, maxAllowedTier) => {
        const entry: ActionTypeEntry = {
          actionType: 'a',
          riskClass,
          maxAllowedTier,
          r02Bound: false,
          riskSource: 'manual',
        };
        // phase cap ไม่สน risk_class — true ก็ต่อเมื่อ tier ∈ {L0,L1}
        const expected = maxAllowedTier === 'L0_advisory' || maxAllowedTier === 'L1_propose';
        expect(satisfiesPhaseCap(entry)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('Property 42b: entry ที่ valid ทุกตัวผ่าน phase cap (และ classify ไม่เกิน L1)', () => {
    fc.assert(
      fc.property(arbValidEntry, (entry) => {
        expect(satisfiesPhaseCap(entry)).toBe(true);
        const registry = new Map([[entry.actionType, entry]]);
        const tier = classifyAutonomyTier(registry, entry.actionType);
        expect(TIER_RANK[tier]).toBeLessThanOrEqual(TIER_RANK.L1_propose);
      }),
      { numRuns: 200 },
    );
  });
});

describe('derive_risk_from_export — fail-safe ceiling (Req 19.3)', () => {
  const arbRow = (step: string) =>
    fc.record({
      processStep: fc.constant(step),
      actionPriority: fc.constantFrom('High', 'Medium', 'Low'),
      rpnStatus: fc.constantFrom('computed', 'severity_only', 'not_assessed'),
    });

  it('Property 32b: derive — ไม่มีแถวของ step → high (fail-safe)', () => {
    fc.assert(
      fc.property(fc.array(arbRow('OtherStep'), { maxLength: 5 }), (rows) => {
        expect(deriveRiskFromExport('TargetStep', rows as PfmeaRiskRow[])).toBe('high');
      }),
      { numRuns: 100 },
    );
  });

  it('Property 32c: derive — มี rpnStatus ≠ computed → high', () => {
    const rows: PfmeaRiskRow[] = [
      { processStep: 'S', actionPriority: 'Low', rpnStatus: 'not_assessed' },
      { processStep: 'S', actionPriority: 'Low', rpnStatus: 'computed' },
    ];
    expect(deriveRiskFromExport('S', rows)).toBe('high');
  });

  it('Property 32d: derive — computed ทั้งหมด: High→high, Medium→medium, else low', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            processStep: fc.constant('S'),
            actionPriority: fc.constantFrom('High', 'Medium', 'Low'),
            rpnStatus: fc.constant('computed'),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (rows) => {
          const r = deriveRiskFromExport('S', rows as PfmeaRiskRow[]);
          const hasHigh = rows.some((x) => x.actionPriority === 'High');
          const hasMed = rows.some((x) => x.actionPriority === 'Medium');
          const expected: RiskClass = hasHigh ? 'high' : hasMed ? 'medium' : 'low';
          expect(r).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
