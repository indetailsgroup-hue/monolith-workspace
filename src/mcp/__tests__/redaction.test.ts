// Feature: monolith-mcp-layer, Property 9: PII redaction fail-safe ที่ boundary
// Validates: Requirements 9.1, 9.3, 9.4
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyRedaction, type RedactionPolicy } from '../redaction';
import type { JsonValue } from '../schema';

const arbObj = fc.dictionary(
  fc.constantFrom('name', 'phone', 'address', 'note', 'amount', 'id'),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()) as fc.Arbitrary<JsonValue>,
  { maxKeys: 6 },
);
const arbPolicy: fc.Arbitrary<RedactionPolicy> = fc.record({
  piiFields: fc.array(fc.constantFrom('name', 'phone', 'address'), { maxLength: 3 }),
  allowedFields: fc.option(fc.array(fc.constantFrom('name', 'phone', 'address', 'note', 'amount', 'id'), { maxLength: 6 }), { nil: undefined }),
  mask: fc.constant('[REDACTED]'),
});

describe('mcp redaction — Property 9', () => {
  it('no policy หรือ output ไม่ใช่ object → block (fail-safe, Req 9.4)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.array(fc.string())) as fc.Arbitrary<JsonValue>, (v) => {
        expect(applyRedaction(v, null).ok).toBe(false);
        const r = applyRedaction(v, { piiFields: ['name'] });
        expect(r.ok).toBe(false); // non-object → redaction_failed
      }),
      { numRuns: 200 },
    );
  });

  it('PII fields ถูกมาส์ก + ไม่มีค่า PII เดิมหลุด (Req 9.1/9.3)', () => {
    fc.assert(
      fc.property(arbObj, arbPolicy, (obj, policy) => {
        const r = applyRedaction(obj, policy);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (const f of policy.piiFields) {
          if (f in r.output) expect(r.output[f]).toBe(policy.mask);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('data minimization: allowedFields กำหนด → output มีเฉพาะ field ที่อนุญาต (Req 9.2)', () => {
    fc.assert(
      fc.property(arbObj, arbPolicy, (obj, policy) => {
        const r = applyRedaction(obj, policy);
        if (!r.ok || policy.allowedFields === undefined) return;
        for (const k of Object.keys(r.output)) {
          expect(policy.allowedFields).toContain(k);
        }
      }),
      { numRuns: 300 },
    );
  });
});
