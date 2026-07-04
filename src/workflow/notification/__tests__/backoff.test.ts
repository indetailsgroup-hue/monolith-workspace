// Feature: monolith-workflow-copilot — property tests for backoff + delivery failure (Req 18)
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { nextBackoffDelayMs, isRetriesExhausted, recordAttempt, type DeliveryState } from '../backoff';
import { DEFAULT_WORKFLOW_CONFIG } from '../../domain/config';

const CFG = DEFAULT_WORKFLOW_CONFIG.retry;

describe('notification backoff + business continuity (Req 18)', () => {
  // Feature: monolith-workflow-copilot, Property 31: ความต่อเนื่องทางธุรกิจและการไม่พึ่งพา LINE ช่องทางเดียว
  it('Property 31: backoff เพิ่มขึ้นแบบ monotonic ไม่ลดลง และไม่เกิน maxDelay', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (attempt) => {
        const d = nextBackoffDelayMs(attempt, CFG);
        const dNext = nextBackoffDelayMs(attempt + 1, CFG);
        expect(d).toBeLessThanOrEqual(CFG.maxDelayMs);
        expect(dNext).toBeGreaterThanOrEqual(d); // ไม่ลดลง
      }),
      { numRuns: 100 },
    );
  });

  it('Property 31b: ครบ maxAttempts → delivery_failure คงถาวร (ไม่ย้อนสถานะ)', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), (outcomes) => {
        let state: DeliveryState = { attempts: 0, status: 'pending' };
        for (const success of outcomes) {
          state = recordAttempt(state, success, CFG);
        }
        if (state.status === 'delivery_failure') {
          // recover ภายหลัง (success) ไม่ย้อนกลับ
          const after = recordAttempt(state, true, CFG);
          expect(after.status).toBe('delivery_failure');
        }
        // ถ้าล้มเหลวครบจำนวน → ต้องเป็น delivery_failure
        const consecutiveFails = (() => {
          let c = 0;
          for (const s of outcomes) {
            if (s) return 0; // success ตัดจบ (เป็น sent)
            c++;
          }
          return c;
        })();
        if (consecutiveFails >= CFG.maxAttempts) {
          expect(state.status).toBe('delivery_failure');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('isRetriesExhausted ตรงกับ maxAttempts', () => {
    expect(isRetriesExhausted(CFG.maxAttempts, CFG)).toBe(true);
    expect(isRetriesExhausted(CFG.maxAttempts - 1, CFG)).toBe(false);
  });

  it('success ทันที → sent', () => {
    expect(recordAttempt({ attempts: 0, status: 'pending' }, true, CFG).status).toBe('sent');
  });
});
