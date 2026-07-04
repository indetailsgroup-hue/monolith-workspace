// Feature: monolith-mcp-layer, Property 17: Write_Tool idempotency (conflict-reject)
// Validates: Requirements 17.2, 17.4, 17.7, 17.8
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decideIdempotency, isValidKey, type IdempotencyRecord } from '../idempotency';

describe('mcp idempotency — Property 17', () => {
  it('key ว่าง/>255 → invalid; 1–255 → valid (Req 17.7)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (k) => {
        expect(isValidKey(k)).toBe(k.length >= 1 && k.length <= 255);
      }),
      { numRuns: 300 },
    );
  });

  it('ไม่มี key → proceed; key+ไม่มี record → proceed (Req 17.4)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), fc.string(), (key, hash) => {
        expect(decideIdempotency(undefined, hash, undefined).action).toBe('proceed');
        expect(decideIdempotency(key, hash, undefined).action).toBe('proceed');
      }),
      { numRuns: 200 },
    );
  });

  it('record เดิม: input เดิม+executed→replay; +pending→return_pending; input ต่าง→reject_conflict (Req 17.2/17.8)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.boolean(),
        (key, hashA, hashB, pending) => {
          const existing: IdempotencyRecord = { inputHash: hashA, pending };
          const sameHash = decideIdempotency(key, hashA, existing);
          expect(sameHash.action).toBe(pending ? 'return_pending' : 'replay');
          if (hashA !== hashB) {
            expect(decideIdempotency(key, hashB, existing).action).toBe('reject_conflict');
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('invalid key ชนะก่อนเช็ค record (Req 17.7 no side effects)', () => {
    const existing: IdempotencyRecord = { inputHash: 'x', pending: false };
    expect(decideIdempotency('', 'x', existing).action).toBe('reject_invalid_key');
    expect(decideIdempotency('a'.repeat(256), 'x', existing).action).toBe('reject_invalid_key');
  });
});
