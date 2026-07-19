/**
 * Formaldehyde Emission Class Tests
 *
 * Three things are under test, in order of how much damage they prevent:
 *
 * 1. The three verified schemes round-trip intact — every member of the compound field
 *    survives, because a numeric limit without its test method and unit is not a fact.
 * 2. Cross-scheme comparison is REJECTED, at runtime and (where the compiler can) at
 *    compile time. This is the dangerous operation: EN, CARB and JIS measure different
 *    quantities, so any numeric comparison between them is an unfounded compliance claim.
 * 3. A material with no emission data is ALLOWED in normal use but FLAGGED when an
 *    export-destined packet is validated.
 */

import { describe, it, expect } from 'vitest';
import {
  EN_E1,
  CARB_P2,
  JIS_F_FOUR_STAR,
  FORMALDEHYDE_EMISSION_CATALOG,
  DESTINATION_EMISSION_REQUIREMENTS,
  CrossSchemeComparisonError,
  compareEmissionLimits,
  assertSameScheme,
  isSameScheme,
  describeEmission,
  validateEmissionForExport,
  assertEmissionCompliantForExport,
  type AnyFormaldehydeEmission,
  type EmissionBearingMaterial,
} from '../FormaldehydeEmission';
import * as EmissionModule from '../FormaldehydeEmission';
import { CORE_MATERIALS_CATALOG } from '../PanelMaterialSystem';

// ============================================
// 1. THE THREE SCHEMES ROUND-TRIP
// ============================================

describe('the three verified emission classes', () => {
  it('encodes EU E1 exactly: EN 120 perforator, 8 mg/100g, EU', () => {
    expect(EN_E1.scheme).toBe('EN');
    expect(EN_E1.class).toBe('E1');
    expect(EN_E1.testMethod).toBe('EN 120 perforator');
    expect(EN_E1.numericLimit).toBe(8);
    expect(EN_E1.unit).toBe('mg/100g');
    expect(EN_E1.region).toBe('EU');
  });

  it('encodes CARB Phase 2 exactly: ASTM E1333, 0.09 ppm, US-CA', () => {
    expect(CARB_P2.scheme).toBe('CARB');
    expect(CARB_P2.class).toBe('P2');
    expect(CARB_P2.testMethod).toBe('ASTM E1333');
    expect(CARB_P2.numericLimit).toBe(0.09);
    expect(CARB_P2.unit).toBe('ppm');
    expect(CARB_P2.region).toBe('US-CA');
  });

  it('encodes JIS F**** exactly: desiccator, 0.3 mg/L, JP', () => {
    expect(JIS_F_FOUR_STAR.scheme).toBe('JIS');
    expect(JIS_F_FOUR_STAR.class).toBe('F****');
    expect(JIS_F_FOUR_STAR.testMethod).toBe('desiccator');
    expect(JIS_F_FOUR_STAR.numericLimit).toBe(0.3);
    expect(JIS_F_FOUR_STAR.unit).toBe('mg/L');
    expect(JIS_F_FOUR_STAR.region).toBe('JP');
  });

  it('survives a JSON round-trip with every member of the compound field intact', () => {
    // A packet is serialised before it crosses a border. If the test method or unit is lost
    // in transit, the number that survives is a bare figure with no meaning — exactly the
    // state this whole module exists to end.
    for (const original of [EN_E1, CARB_P2, JIS_F_FOUR_STAR]) {
      const revived = JSON.parse(JSON.stringify(original)) as AnyFormaldehydeEmission;
      expect(revived.scheme).toBe(original.scheme);
      expect(revived.class).toBe(original.class);
      expect(revived.testMethod).toBe(original.testMethod);
      expect(revived.numericLimit).toBe(original.numericLimit);
      expect(revived.unit).toBe(original.unit);
      expect(revived.region).toBe(original.region);
    }
  });

  it('holds exactly three classes — a fourth is a sourcing task, not a coding task', () => {
    expect(Object.keys(FORMALDEHYDE_EMISSION_CATALOG)).toHaveLength(3);
    expect(Object.values(FORMALDEHYDE_EMISSION_CATALOG).map((e) => e.scheme).sort()).toEqual([
      'CARB',
      'EN',
      'JIS',
    ]);
  });

  it('never uses the same unit for two schemes, which is why they cannot be compared', () => {
    const units = Object.values(FORMALDEHYDE_EMISSION_CATALOG).map((e) => e.unit);
    expect(new Set(units).size).toBe(units.length);
  });

  it('always renders the method and unit alongside the number', () => {
    expect(describeEmission(EN_E1)).toBe('EN E1 (EN 120 perforator, <= 8 mg/100g, EU)');
    expect(describeEmission(CARB_P2)).toBe('CARB P2 (ASTM E1333, <= 0.09 ppm, US-CA)');
  });

  it('records provenance that is NOT the kitchen-part3 document', () => {
    // kitchen-part3 mislabels a Chinese GB 18580 desiccator value as the EU threshold.
    // The EU record must say so, so nobody "helpfully" reconciles it back to that document.
    expect(EN_E1.provenance).toBe('VERIFIED');
    expect(EN_E1.sourceNote).toContain('kitchen-part3');
    expect(EN_E1.sourceNote).toContain('GB 18580');
  });
});

// ============================================
// 2. CROSS-SCHEME COMPARISON IS REJECTED
// ============================================

describe('cross-scheme comparison is forbidden', () => {
  it('throws CrossSchemeComparisonError when EN meets CARB', () => {
    expect(() => assertSameScheme(EN_E1, CARB_P2)).toThrow(CrossSchemeComparisonError);
  });

  it('throws for every ordered pair of different schemes', () => {
    const all = [EN_E1, CARB_P2, JIS_F_FOUR_STAR] as const;
    let thrown = 0;
    for (const a of all) {
      for (const b of all) {
        if (a.scheme === b.scheme) {
          expect(() => assertSameScheme(a, b)).not.toThrow();
        } else {
          expect(() => assertSameScheme(a, b)).toThrow(CrossSchemeComparisonError);
          thrown += 1;
        }
      }
    }
    // 3 schemes -> 6 ordered mixed pairs. Proves the loop actually exercised the failure
    // path rather than silently matching nothing.
    expect(thrown).toBe(6);
  });

  it('carries both scheme names on the error so a compliance log is unambiguous', () => {
    try {
      assertSameScheme(JIS_F_FOUR_STAR, EN_E1);
      expect.unreachable('assertSameScheme should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CrossSchemeComparisonError);
      const e = error as CrossSchemeComparisonError;
      expect(e.leftScheme).toBe('JIS');
      expect(e.rightScheme).toBe('EN');
      expect(e.message).toContain('different test methods');
      expect(e.message).toContain('no conversion');
    }
  });

  it('rejects the mixed comparison even when reached from untyped JavaScript', () => {
    // The compile-time guard cannot help a caller coming in through `any`. This is the
    // reason the runtime throw is not redundant with the type system.
    const untyped = compareEmissionLimits as unknown as (
      a: AnyFormaldehydeEmission,
      b: AnyFormaldehydeEmission,
    ) => number;
    expect(() => untyped(EN_E1, CARB_P2)).toThrow(CrossSchemeComparisonError);
  });

  it('DOES compare within one scheme, so the rejection is targeted and not a blanket refusal', () => {
    const strictEn: typeof EN_E1 = { ...EN_E1, numericLimit: 4 as typeof EN_E1.numericLimit };
    expect(compareEmissionLimits(strictEn, EN_E1)).toBe(-1);
    expect(compareEmissionLimits(EN_E1, strictEn)).toBe(1);
    expect(compareEmissionLimits(EN_E1, EN_E1)).toBe(0);
  });

  it('is a COMPILE error too, not only a runtime throw', () => {
    // These lines are checked by `npm run typecheck:all`, not by vitest — the function is
    // deliberately never invoked. Each @ts-expect-error is an assertion in its own right:
    // if a future change makes any of these legal, the directive becomes unused and tsc
    // fails. Verified against tsc 5.2: all three produce TS2345/TS2322.
    const neverCalled = (): void => {
      // @ts-expect-error EN and CARB cannot meet in one comparison.
      compareEmissionLimits(EN_E1, CARB_P2);

      const wantsEnLimit = (_limit: typeof EN_E1.numericLimit): void => {};
      // @ts-expect-error a CARB-branded limit cannot stand in for an EN-branded one.
      wantsEnLimit(CARB_P2.numericLimit);

      // @ts-expect-error a class name cannot be paired with the wrong scheme.
      const mismatched: typeof EN_E1 = { ...EN_E1, class: 'P2' };
      void mismatched;
    };
    expect(typeof neverCalled).toBe('function');
  });

  it('reports scheme identity without throwing, for branching', () => {
    expect(isSameScheme(EN_E1, EN_E1)).toBe(true);
    expect(isSameScheme(EN_E1, JIS_F_FOUR_STAR)).toBe(false);
  });

  it('exports NO conversion, equivalence or auto-upgrade function of any kind', () => {
    // The most likely future regression is somebody adding `carbEquivalentOf(enClass)`
    // because a caller wanted one number. This test fails the moment that appears.
    const forbidden = /convert|upgrade|equivalent|normalis|normaliz|toPpm|toMg|crosswalk|harmoni/i;
    const offenders = Object.keys(EmissionModule).filter((name) => forbidden.test(name));
    expect(offenders).toEqual([]);
  });
});

// ============================================
// 3. MISSING DATA: ALLOWED, BUT FLAGGED FOR EXPORT
// ============================================

const UNDECLARED: EmissionBearingMaterial = { id: 'core-pb-18', name: 'Particleboard E1 18mm' };
const DECLARED_EN: EmissionBearingMaterial = {
  id: 'core-test-en',
  name: 'Test board, EN declared',
  formaldehydeEmission: EN_E1,
};
const DECLARED_CARB: EmissionBearingMaterial = {
  id: 'core-test-carb',
  name: 'Test board, CARB declared',
  formaldehydeEmission: CARB_P2,
};

describe('a material with no emission data', () => {
  it('is allowed in the catalog — every shipped core material omits the field today', () => {
    const cores = Object.values(CORE_MATERIALS_CATALOG);
    expect(cores.length).toBeGreaterThan(0);
    for (const core of cores) {
      // Nothing is seeded. A name containing "E1" is a purchasing convention, not evidence,
      // and must not have become a declared class.
      expect(core.formaldehydeEmission ?? null).toBeNull();
    }
  });

  it('is flagged as a BLOCKER when an export packet requires a class', () => {
    const report = validateEmissionForExport([UNDECLARED], 'US');
    expect(report.compliant).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].code).toBe('EMISSION_DATA_MISSING');
    expect(report.findings[0].severity).toBe('BLOCKER');
    expect(report.findings[0].materialId).toBe('core-pb-18');
    expect(report.findings[0].message).toContain('do not infer it from the product name');
  });

  it('makes the export gate THROW rather than pass a packet through', () => {
    expect(() => assertEmissionCompliantForExport([UNDECLARED], 'JP')).toThrow(
      /Formaldehyde emission gate FAILED/,
    );
  });
});

describe('destination requirements', () => {
  it('passes an EN-declared board for the EU', () => {
    const report = validateEmissionForExport([DECLARED_EN], 'EU');
    expect(report.compliant).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.declaredMaterialIds).toEqual(['core-test-en']);
    expect(() => assertEmissionCompliantForExport([DECLARED_EN], 'EU')).not.toThrow();
  });

  it('passes a CARB-declared board for the US under TSCA Title VI', () => {
    const report = validateEmissionForExport([DECLARED_CARB], 'US');
    expect(report.compliant).toBe(true);
    expect(report.requirement.regulation).toContain('TSCA Title VI');
  });

  it('REFUSES an EN-declared board for the US — no scheme upgrade exists', () => {
    // The tempting wrong behaviour: 8 mg/100g "looks strict", so wave it through. The
    // gate must not, because a perforator result says nothing about a chamber result.
    const report = validateEmissionForExport([DECLARED_EN], 'US');
    expect(report.compliant).toBe(false);
    expect(report.findings[0].code).toBe('EMISSION_SCHEME_MISMATCH');
    expect(report.findings[0].message).toContain('cannot be converted or upgraded');
    expect(report.findings[0].message).toContain('must be re-tested');
  });

  it('REFUSES a CARB-declared board for Japan for the same reason', () => {
    const report = validateEmissionForExport([DECLARED_CARB], 'JP');
    expect(report.compliant).toBe(false);
    expect(report.findings[0].code).toBe('EMISSION_SCHEME_MISMATCH');
  });

  it('treats Thailand as UNKNOWN, never as "no requirement"', () => {
    // Even a fully declared board does not pass, because the rule itself is unsourced.
    // Declaring a market unregulated without a source is its own unfounded claim.
    const report = validateEmissionForExport([DECLARED_EN], 'TH');
    expect(report.compliant).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].code).toBe('DESTINATION_REQUIREMENT_UNSOURCED');
    expect(report.findings[0].severity).toBe('UNKNOWN');
    expect(report.findings[0].message).toContain('Do not read this as "no requirement"');
    expect(DESTINATION_EMISSION_REQUIREMENTS.TH.requiredScheme).toBeNull();
  });

  it('separates BLOCKER from UNKNOWN — "board is wrong" and "rule is unknown" need different fixes', () => {
    const wrongBoard = validateEmissionForExport([DECLARED_EN], 'US');
    const unknownRule = validateEmissionForExport([DECLARED_EN], 'TH');
    expect(wrongBoard.findings[0].severity).toBe('BLOCKER');
    expect(unknownRule.findings[0].severity).toBe('UNKNOWN');
    // Both still stop the packet.
    expect(wrongBoard.compliant).toBe(false);
    expect(unknownRule.compliant).toBe(false);
  });

  it('reports one finding per failing material and still lists the ones that passed', () => {
    const report = validateEmissionForExport([DECLARED_CARB, UNDECLARED, DECLARED_EN], 'US');
    expect(report.compliant).toBe(false);
    expect(report.findings.map((f) => f.code)).toEqual([
      'EMISSION_DATA_MISSING',
      'EMISSION_SCHEME_MISMATCH',
    ]);
    expect(report.declaredMaterialIds).toEqual(['core-test-carb']);
  });

  it('never accepts a class in a scheme other than the destination requires', () => {
    for (const destination of ['EU', 'US', 'JP'] as const) {
      const requirement = DESTINATION_EMISSION_REQUIREMENTS[destination];
      expect(requirement.status).toBe('REQUIRED');
      expect(requirement.requiredScheme).not.toBeNull();
      for (const emission of [EN_E1, CARB_P2, JIS_F_FOUR_STAR]) {
        const report = validateEmissionForExport(
          [{ id: 'probe', formaldehydeEmission: emission }],
          destination,
        );
        expect(report.compliant).toBe(emission.scheme === requirement.requiredScheme);
      }
    }
  });

  it('vacuously passes an empty packet, which is a real edge and worth stating', () => {
    // No materials means nothing to declare. This is correct but must be deliberate:
    // callers must not treat "compliant" on an empty set as evidence of anything.
    const report = validateEmissionForExport([], 'US');
    expect(report.compliant).toBe(true);
    expect(report.declaredMaterialIds).toEqual([]);
  });
});
