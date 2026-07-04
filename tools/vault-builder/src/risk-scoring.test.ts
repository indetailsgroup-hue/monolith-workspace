/**
 * risk-scoring.test.ts — Property tests สำหรับการให้คะแนนความเสี่ยง PFMEA
 *
 * Feature: daph-obsidian-second-brain (Knowledge_Export — Phase 3)
 * อิง ADR-011 (RPN fail-safe) + ADR-012 (raw SOD + dual-standard RPN/Action Priority)
 *
 * Properties:
 *  - P-RS1: rpnStatus สอดคล้องกับความครบของ SEV/OCC/DET
 *  - P-RS2: rpn = SEV×OCC×DET เมื่อ computed; มิฉะนั้น null
 *  - P-RS3: Action Priority เป็น monotonic ไม่ลดลงเมื่อ SEV/OCC/DET เพิ่ม (หลัก AIAG-VDA)
 *  - P-RS4: fail-safe — status ≠ computed ⇒ requiresHumanReview = true (ADR-011)
 *  - P-RS5: actionPriority/rpn = null ก็ต่อเมื่อ rpnStatus ≠ computed
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  computeActionPriority,
  scoreRisk,
  type ActionPriority,
} from './risk-scoring.js';

const RUNS = { numRuns: 200 };

const arbRating = fc.integer({ min: 1, max: 10 });
/** ค่าที่อาจ "ยังไม่ประเมิน": จำนวนเต็ม 1–10 หรือ null */
const arbMaybe = fc.option(arbRating, { nil: null });

const apRank: Record<ActionPriority, number> = { Low: 0, Medium: 1, High: 2 };

describe('risk-scoring (ADR-011 / ADR-012)', () => {
  it('P-RS1: rpnStatus สอดคล้องกับความครบของค่า', () => {
    fc.assert(
      fc.property(arbMaybe, arbMaybe, arbMaybe, (sev, occ, det) => {
        const r = scoreRisk(sev, occ, det);
        if (sev !== null && occ !== null && det !== null) {
          expect(r.rpnStatus).toBe('computed');
        } else if (sev !== null) {
          expect(r.rpnStatus).toBe('severity_only');
        } else {
          expect(r.rpnStatus).toBe('not_assessed');
        }
      }),
      RUNS,
    );
  });

  it('P-RS2: rpn = SEV×OCC×DET เมื่อ computed; มิฉะนั้น null', () => {
    fc.assert(
      fc.property(arbMaybe, arbMaybe, arbMaybe, (sev, occ, det) => {
        const r = scoreRisk(sev, occ, det);
        if (r.rpnStatus === 'computed') {
          expect(r.rpn).toBe((sev as number) * (occ as number) * (det as number));
        } else {
          expect(r.rpn).toBeNull();
        }
      }),
      RUNS,
    );
  });

  it('P-RS3: Action Priority เป็น monotonic ไม่ลดลงเมื่อ SEV/OCC/DET เพิ่ม', () => {
    fc.assert(
      fc.property(
        arbRating,
        arbRating,
        arbRating,
        fc.nat({ max: 9 }),
        fc.nat({ max: 9 }),
        fc.nat({ max: 9 }),
        (sev, occ, det, ds, doo, dd) => {
          const sev2 = Math.min(10, sev + ds);
          const occ2 = Math.min(10, occ + doo);
          const det2 = Math.min(10, det + dd);
          const ap1 = computeActionPriority(sev, occ, det);
          const ap2 = computeActionPriority(sev2, occ2, det2);
          expect(apRank[ap2]).toBeGreaterThanOrEqual(apRank[ap1]);
        },
      ),
      RUNS,
    );
  });

  it('P-RS4: fail-safe — status ≠ computed ⇒ requiresHumanReview = true', () => {
    fc.assert(
      fc.property(arbMaybe, arbMaybe, arbMaybe, (sev, occ, det) => {
        const r = scoreRisk(sev, occ, det);
        if (r.rpnStatus !== 'computed') {
          expect(r.requiresHumanReview).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('P-RS5: actionPriority/rpn = null ก็ต่อเมื่อ rpnStatus ≠ computed', () => {
    fc.assert(
      fc.property(arbMaybe, arbMaybe, arbMaybe, (sev, occ, det) => {
        const r = scoreRisk(sev, occ, det);
        const isComputed = r.rpnStatus === 'computed';
        expect(r.actionPriority !== null).toBe(isComputed);
        expect(r.rpn !== null).toBe(isComputed);
      }),
      RUNS,
    );
  });

  // ----- Anchor unit tests (จุดอ้างอิงเชิงความหมาย AIAG-VDA) -----
  it('anchors: ค่าสุดขั้วและกรณีฐาน', () => {
    expect(computeActionPriority(10, 10, 10)).toBe('High');
    expect(computeActionPriority(1, 1, 1)).toBe('Low');
    // SEV สูงมากแต่เกิดยากที่สุด + ตรวจจับได้ดีที่สุด → ยังคง Medium (ไม่ใช่ Low)
    expect(computeActionPriority(9, 1, 1)).toBe('Medium');
    // เกิดบ่อยมาก + ตรวจจับแทบไม่ได้ แม้ SEV ต่ำ → High
    expect(computeActionPriority(3, 9, 9)).toBe('High');
  });

  it('severity_only: SEV ≥ 8 ตั้ง severityWarning และบังคับ review', () => {
    const r = scoreRisk(9, null, null);
    expect(r.rpnStatus).toBe('severity_only');
    expect(r.severityWarning).toBe(true);
    expect(r.requiresHumanReview).toBe(true);
    expect(r.actionPriority).toBeNull();
  });

  it('not_assessed: ไม่มี SEV → บังคับ review', () => {
    const r = scoreRisk(null, 5, 5);
    expect(r.rpnStatus).toBe('not_assessed');
    expect(r.requiresHumanReview).toBe(true);
  });

  it('normalize: ค่านอกช่วง 1–10 หรือไม่ใช่จำนวนเต็ม ถือว่ายังไม่ประเมิน', () => {
    expect(scoreRisk(0, 5, 5).rpnStatus).toBe('not_assessed'); // sev=0 invalid → null
    expect(scoreRisk(11, 5, 5).rpnStatus).toBe('not_assessed');
    expect(scoreRisk(5.5, 5, 5).rpnStatus).toBe('not_assessed');
    expect(scoreRisk(8, 11, 5).rpnStatus).toBe('severity_only'); // occ invalid → null
  });
});
