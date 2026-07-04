/**
 * bible-code.test.ts — golden vectors + negative cases + PBT (WO-3 / Req 8)
 *
 * Properties (BIBLE_CODE_GRAMMAR_SPEC §6 + RELEASED_SPEC_CONTRACT PBT-1/PBT-6):
 *  P1 round-trip · P2 reject-invalid · P3 type-exclusive · P4 option-order-stable
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  parseBibleCode,
  formatBibleCode,
  specEquals,
  type ParsedSpec,
  type SpecOption,
} from './bible-code.js';

const RUNS = { numRuns: 300 };

function ok(code: string): ParsedSpec {
  const r = parseBibleCode(code);
  if (!r.ok) throw new Error(`expected parse ok for ${code}, got: ${r.error}`);
  return r.spec;
}

describe('bible-code — golden vectors (catalog จริง)', () => {
  const counters: Array<[string, number, SpecOption[]]> = [
    ['DKC305875', 300, []],
    ['DKC305875S', 300, [{ kind: 'count', token: 'S', count: 1 }]],
    ['DKC3058752S', 300, [{ kind: 'count', token: 'S', count: 2 }]],
    ['DKC3058751S1D', 300, [{ kind: 'count', token: 'S', count: 1 }, { kind: 'count', token: 'D', count: 1 }]],
    ['DKC3058753D', 300, [{ kind: 'count', token: 'D', count: 3 }]],
    ['DKC6058751M1D', 600, [{ kind: 'count', token: 'M', count: 1 }, { kind: 'count', token: 'D', count: 1 }]],
    ['DKC955875L', 950, [{ kind: 'lshape', token: 'L' }]],
    ['DKC955875R', 950, [{ kind: 'lshape', token: 'R' }]],
    ['DKC1205875R', 1200, [{ kind: 'lshape', token: 'R' }]],
  ];
  it.each(counters)('Counter %s', (code, widthMm, options) => {
    const s = ok(code);
    expect(s.furnitureType).toBe('Counter');
    expect([s.widthMm, s.depthMm, s.heightMm]).toEqual([widthMm, 580, 750]);
    expect(specEquals(s, { furnitureType: 'Counter', widthMm, depthMm: 580, heightMm: 750, options })).toBe(true);
  });

  const cabinets: Array<[string, number, number, number]> = [
    ['DC3540651S', 350, 650, 1],
    ['DC3540852S', 350, 850, 2],
    ['DC4040601S', 400, 600, 1],
    ['DC12040601S', 1200, 600, 1],
    ['DC120401202S', 1200, 1200, 2],
  ];
  it.each(cabinets)('Cabinet %s', (code, widthMm, heightMm, shelve) => {
    const s = ok(code);
    expect(s.furnitureType).toBe('Cabinet');
    expect([s.widthMm, s.depthMm, s.heightMm]).toEqual([widthMm, 400, heightMm]);
    expect(s.options).toEqual([{ kind: 'count', token: 'S', count: shelve }]);
  });

  const wardrobes: Array<[string, number, number]> = [
    ['DWD6060240', 600, 600],
    ['DWD6053240', 600, 530],
    ['DWD10060240', 1000, 600],
    ['DWD10553240', 1050, 530],
  ];
  it.each(wardrobes)('Wardrobe %s', (code, widthMm, depthMm) => {
    const s = ok(code);
    expect(s.furnitureType).toBe('Wardrobe');
    expect([s.widthMm, s.depthMm, s.heightMm]).toEqual([widthMm, depthMm, 2400]);
    expect(s.options).toEqual([]);
  });

  it('format normalizes option order (1M1D → canonical 1D1M)', () => {
    // catalog code 1M1D parses to {M,D}; format outputs canonical S<D<M order
    expect(formatBibleCode(ok('DKC6058751M1D'))).toBe('DKC6058751D1M');
    // but spec-level round-trip is preserved
    expect(specEquals(ok('DKC6058751M1D'), ok('DKC6058751D1M'))).toBe(true);
  });
});

describe('bible-code — negative cases (ต้อง reject + ระบุ token)', () => {
  it.each([
    ['DKC3258750', /width/i],          // W=325 ไม่ step 50
    ['DC3040601S', /Cabinet width/i],  // W=300 < min 350
    ['DWD6055240', /wardrobe depth/i], // D=550 ไม่อยู่ใน {530,600}
    ['DKC305875X', /unknown option/i], // token X
    ['XYZ123', /unknown prefix/i],
  ])('reject %s', (code, re) => {
    const r = parseBibleCode(code);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(re);
  });
});

// --- PBT generators (valid specs ต่อชนิด) ---
const wSet = (min: number, max: number) => {
  const a: number[] = [];
  for (let v = min; v <= max; v += 50) a.push(v);
  return a;
};

const arbCounterOptions: fc.Arbitrary<SpecOption[]> = fc.oneof(
  fc.constant<SpecOption[]>([]),
  fc.constantFrom('L', 'R').map((t): SpecOption[] => [{ kind: 'lshape', token: t as 'L' | 'R' }]),
  fc
    .uniqueArray(fc.record({ token: fc.constantFrom('S', 'D', 'M'), count: fc.integer({ min: 1, max: 3 }) }), {
      selector: (o) => o.token,
      minLength: 1,
      maxLength: 3,
    })
    .map((arr): SpecOption[] => arr.map((o) => ({ kind: 'count', token: o.token as 'S' | 'D' | 'M', count: o.count }))),
);

const arbCounter: fc.Arbitrary<ParsedSpec> = fc.record({
  furnitureType: fc.constant<'Counter'>('Counter'),
  widthMm: fc.constantFrom(...wSet(300, 1200)),
  depthMm: fc.constant(580),
  heightMm: fc.constant(750),
  options: arbCounterOptions,
});

const arbCabinet: fc.Arbitrary<ParsedSpec> = fc.record({
  furnitureType: fc.constant<'Cabinet'>('Cabinet'),
  widthMm: fc.constantFrom(...wSet(350, 1200)),
  depthMm: fc.constant(400),
  heightMm: fc.constantFrom(...wSet(600, 1200)),
  options: fc.integer({ min: 1, max: 2 }).map((n): SpecOption[] => [{ kind: 'count', token: 'S', count: n }]),
});

const arbWardrobe: fc.Arbitrary<ParsedSpec> = fc.record({
  furnitureType: fc.constant<'Wardrobe'>('Wardrobe'),
  widthMm: fc.constantFrom(...wSet(600, 1050)),
  depthMm: fc.constantFrom(530, 600),
  heightMm: fc.constant(2400),
  options: fc.constant<SpecOption[]>([]),
});

const arbSpec = fc.oneof(arbCounter, arbCabinet, arbWardrobe);

describe('bible-code — properties (PBT)', () => {
  it('P1: round-trip spec → format → parse = equivalent spec', () => {
    fc.assert(
      fc.property(arbSpec, (spec) => {
        const code = formatBibleCode(spec);
        const r = parseBibleCode(code);
        expect(r.ok).toBe(true);
        if (r.ok) expect(specEquals(r.spec, spec)).toBe(true);
      }),
      RUNS,
    );
  });

  it('P2: reject dimension นอก range/step', () => {
    // Counter width enc นอก step 5 (= mm นอก step 50)
    const arbBadEnc = fc.integer({ min: 30, max: 120 }).filter((n) => n % 5 !== 0);
    fc.assert(
      fc.property(arbBadEnc, (encW) => {
        const r = parseBibleCode(`DKC${encW}5875`);
        expect(r.ok).toBe(false);
      }),
      RUNS,
    );
  });

  it('P3: type-exclusive (DKC≠DC≠DWD, longest-match)', () => {
    expect(ok('DKC305875').furnitureType).toBe('Counter');
    expect(ok('DC3540601S').furnitureType).toBe('Cabinet');
    expect(ok('DWD6060240').furnitureType).toBe('Wardrobe');
    // DKC ต้องไม่ถูกอ่านเป็น Cabinet
    fc.assert(
      fc.property(arbCounter, (spec) => {
        expect(parseBibleCode(formatBibleCode(spec)).ok && (parseBibleCode(formatBibleCode(spec)) as { ok: true; spec: ParsedSpec }).spec.furnitureType).toBe('Counter');
      }),
      RUNS,
    );
  });

  it('P4: option-order-stable (format ไม่ขึ้นกับลำดับ input)', () => {
    fc.assert(
      fc.property(arbCounter, (spec) => {
        const reversed: ParsedSpec = { ...spec, options: [...spec.options].reverse() };
        expect(formatBibleCode(reversed)).toBe(formatBibleCode(spec));
      }),
      RUNS,
    );
  });
});
