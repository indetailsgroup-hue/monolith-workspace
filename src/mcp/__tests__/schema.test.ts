// Feature: monolith-mcp-layer, Property 13: I/O schema validation + round-trip
// Validates: Requirements 13.1, 13.2, 13.4, 13.5
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validate, canonicalize, roundTrips, type JsonValue, type JsonSchema } from '../schema';

const arbJson: fc.Arbitrary<JsonValue> = fc.letrec((tie) => ({
  json: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string(),
    fc.array(tie('json'), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 6 }), tie('json'), { maxKeys: 4 }),
  ),
})).json as fc.Arbitrary<JsonValue>;

describe('mcp schema — Property 13', () => {
  it('round-trip: serialize→parse→serialize ได้ canonical เดิม (Req 13.4/13.5)', () => {
    fc.assert(
      fc.property(arbJson, (v) => {
        expect(roundTrips(v)).toBe(true);
        // canonicalize idempotent
        const c = canonicalize(v);
        const parsed = JSON.parse(JSON.stringify(v)) as JsonValue;
        expect(canonicalize(parsed)).toBe(c);
      }),
      { numRuns: 300 },
    );
  });

  it('required field ขาด → invalid; ครบ + type ตรง → valid (Req 13.1/13.2)', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['site_code'],
      properties: { site_code: { type: 'string' }, count: { type: 'integer' } },
    };
    fc.assert(
      fc.property(
        fc.record({ site_code: fc.option(fc.string(), { nil: undefined }), count: fc.option(fc.integer(), { nil: undefined }) }),
        (obj) => {
          const clean: Record<string, JsonValue> = {};
          if (obj.site_code !== undefined) clean.site_code = obj.site_code;
          if (obj.count !== undefined) clean.count = obj.count;
          const r = validate(clean, schema);
          expect(r.ok).toBe('site_code' in clean);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('type mismatch → invalid (Req 13.2)', () => {
    const schema: JsonSchema = { type: 'object', properties: { n: { type: 'number' } } };
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.boolean()), (notNum) => {
        const r = validate({ n: notNum as JsonValue }, schema);
        expect(r.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
