/**
 * FormaldehydeEmission.ts — formaldehyde emission class as a REGULATORY FACT, not a label.
 *
 * WHY THIS FILE EXISTS
 * Before this file the entire concept existed as one comment in PanelMaterialSystem.ts:
 *
 *     // PARTICLEBOARD E1 (Low Formaldehyde <=8mg/100g)
 *
 * No material record carried an emission property; nothing validated one; nothing exported
 * one. For a Manufacturing OS with export ambitions that is a LEGAL GATE left open. Panels
 * shipped into the US are subject to CARB Phase 2 / TSCA Title VI (40 CFR 770); panels
 * shipped into Japan are graded by the F-star system. A packet that cannot state the
 * emission class of its panels cannot lawfully cross either border.
 *
 * THE CENTRAL RULE: SCHEMES DO NOT COMPARE.
 * EN, CARB and JIS each define a class by a DIFFERENT TEST METHOD producing a DIFFERENT
 * QUANTITY in a DIFFERENT UNIT:
 *
 *     EN 120 perforator  -> mg of formaldehyde per 100 g of oven-dry board   (mg/100g)
 *     ASTM E1333 chamber -> concentration in chamber air                      (ppm)
 *     JIS desiccator     -> mg per litre of absorbing water                   (mg/L)
 *
 * A perforator result and a chamber result are not the same physical measurement expressed
 * in different units; there is no exact conversion between them, only empirical correlations
 * that vary by product. So `enLimit < carbLimit` is not merely apples-to-oranges arithmetic,
 * it is a compliance claim with no basis. This module therefore:
 *
 *   - brands each limit with its scheme, so a limit from one scheme cannot be passed to a
 *     function expecting another,
 *   - locks the only comparison helper to a single scheme via NoInfer AND a runtime throw,
 *   - exports NO conversion, equivalence or auto-upgrade function of any kind, and asserts
 *     that absence in the tests.
 *
 * ONLY THREE CLASSES ARE ENCODED, and every one of them is independently verified. Nothing
 * is seeded from the kitchen-part3 document: that document mislabels a Chinese GB 18580
 * desiccator value as the EU threshold, and copying it would have put a wrong number behind
 * a legal gate. Every other material is left with NO emission data for a human to fill in
 * from a real supplier certificate.
 *
 * Keep this file free of ALL imports. Its leaf status is load-bearing: PanelMaterialSystem.ts
 * imports it to type an optional field on CoreMaterial, and PanelMaterialSystem.ts sits low
 * in the dependency graph.
 */

// ============================================
// SCHEMES
// ============================================

/**
 * The three emission schemes MONOLITH can currently state a class in.
 *
 * Adding a scheme means adding a verified test method, unit and region below. Do not add a
 * scheme name alone — a scheme with no test method is a label, which is the defect this
 * file exists to remove.
 */
export type EmissionScheme = 'EN' | 'CARB' | 'JIS';

/**
 * Class names, keyed to their scheme. Deliberately narrow.
 *
 * Only classes whose numeric limit and test method have been independently verified appear
 * here. EN E0, EN E2, CARB P1 and the lower F-star grades are real classes intentionally ABSENT:
 * adding one requires sourcing its limit first, and the type error you get when you try to
 * write `class: 'E0'` is the reminder to do that.
 */
export type EmissionClassName<S extends EmissionScheme> = S extends 'EN'
  ? 'E1'
  : S extends 'CARB'
    ? 'P2'
    : S extends 'JIS'
      ? 'F****'
      : never;

/** The test method that DEFINES the class. Not decoration — the number is meaningless without it. */
export type EmissionTestMethod<S extends EmissionScheme> = S extends 'EN'
  ? 'EN 120 perforator'
  : S extends 'CARB'
    ? 'ASTM E1333'
    : S extends 'JIS'
      ? 'desiccator'
      : never;

/** The unit the test method reports in. Bound to the scheme so it cannot be mismatched. */
export type EmissionUnit<S extends EmissionScheme> = S extends 'EN'
  ? 'mg/100g'
  : S extends 'CARB'
    ? 'ppm'
    : S extends 'JIS'
      ? 'mg/L'
      : never;

/** The jurisdiction that promulgates the scheme. */
export type EmissionRegion<S extends EmissionScheme> = S extends 'EN'
  ? 'EU'
  : S extends 'CARB'
    ? 'US-CA'
    : S extends 'JIS'
      ? 'JP'
      : never;

// ============================================
// SCHEME-BRANDED LIMIT
// ============================================

declare const EMISSION_SCHEME_BRAND: unique symbol;

/**
 * A numeric limit that REMEMBERS which scheme produced it.
 *
 * The brand is phantom — at runtime this is just a number — but it makes
 * `f(carbEmission.numericLimit)` a compile error where `f` wants an EN limit. That closes
 * the realistic mixing vector, which is a limit travelling through a helper as a bare
 * number and being checked against the wrong threshold.
 *
 * KNOWN RESIDUAL HOLE, STATED HONESTLY: TypeScript permits the relational operators on any
 * number-like type, so `a.numericLimit < b.numericLimit` still compiles across schemes. The
 * brand cannot close that. `compareEmissionLimits` below is the supported comparison and it
 * throws at runtime on a scheme mismatch, so the hole is a lint concern rather than a silent
 * production path.
 */
export type EmissionLimitValue<S extends EmissionScheme> = number & {
  readonly [EMISSION_SCHEME_BRAND]: S;
};

/**
 * How well-established an emission record is.
 *
 * `VERIFIED` means the class, test method, unit and numeric limit were each confirmed from
 * the standard itself. `SUPPLIER_DECLARED` is reserved for a figure taken from a real
 * supplier certificate and is not used by anything in this file yet — no certificates have
 * been supplied.
 */
export type EmissionProvenance = 'VERIFIED' | 'SUPPLIER_DECLARED';

/**
 * The compound emission field. Shape is exactly
 * `{ scheme, class, testMethod, numericLimit, unit, region }`, with every member after
 * `scheme` pinned to it by the type system.
 */
export interface FormaldehydeEmission<S extends EmissionScheme = EmissionScheme> {
  readonly scheme: S;
  readonly class: EmissionClassName<S>;
  readonly testMethod: EmissionTestMethod<S>;
  /** Scheme-branded. Never compare this against a limit from another scheme. */
  readonly numericLimit: EmissionLimitValue<S>;
  readonly unit: EmissionUnit<S>;
  readonly region: EmissionRegion<S>;
  readonly provenance: EmissionProvenance;
  /** Where the figure came from, in words, so a reader can re-check it. */
  readonly sourceNote: string;
}

/**
 * The union to use wherever an emission of ANY scheme is accepted.
 *
 * Use this rather than `FormaldehydeEmission<EmissionScheme>`: the generic form distributes
 * its conditional types and would accept the nonsense combination
 * `{ scheme: 'EN', class: 'P2', unit: 'ppm' }`. The explicit union does not.
 */
export type AnyFormaldehydeEmission =
  | FormaldehydeEmission<'EN'>
  | FormaldehydeEmission<'CARB'>
  | FormaldehydeEmission<'JIS'>;

/**
 * Blocks a type parameter from being inferred at this position.
 *
 * Hand-rolled because the project is on TypeScript 5.2 and the built-in `NoInfer` landed in
 * 5.4. Delete this in favour of the built-in when the toolchain moves.
 */
type NoInferScheme<T> = [T][T extends unknown ? 0 : never];

/**
 * The only way to build an emission record. Brands the limit and forces every member to
 * agree with the scheme at compile time.
 */
function defineEmission<S extends EmissionScheme>(spec: {
  scheme: S;
  class: EmissionClassName<S>;
  testMethod: EmissionTestMethod<S>;
  numericLimit: number;
  unit: EmissionUnit<S>;
  region: EmissionRegion<S>;
  provenance: EmissionProvenance;
  sourceNote: string;
}): FormaldehydeEmission<S> {
  return {
    ...spec,
    // The single branding cast in this module. It adds a phantom marker to a plain number;
    // it does not reinterpret the value.
    numericLimit: spec.numericLimit as EmissionLimitValue<S>,
  };
}

// ============================================
// THE THREE VERIFIED CLASSES
// ============================================

/**
 * EU E1 — 8 mg/100g by the EN 120 perforator method.
 *
 * NOT the value in the kitchen-part3 document. That document presents a Chinese GB 18580
 * desiccator figure under an EU heading; it is a different method in a different unit and
 * seeding it here would have made this constant wrong.
 */
export const EN_E1: FormaldehydeEmission<'EN'> = defineEmission({
  scheme: 'EN',
  class: 'E1',
  testMethod: 'EN 120 perforator',
  numericLimit: 8,
  unit: 'mg/100g',
  region: 'EU',
  provenance: 'VERIFIED',
  sourceNote:
    'EN 120 perforator value for class E1: 8 mg formaldehyde per 100 g oven-dry board. ' +
    'Independently verified. Explicitly NOT sourced from kitchen-part3, which mislabels a ' +
    'GB 18580 desiccator value as the EU threshold.',
});

/**
 * CARB Phase 2 — 0.09 ppm by ASTM E1333 large chamber, for particleboard.
 *
 * CARB is a California regulation; TSCA Title VI (40 CFR 770) adopted the same limits
 * federally, which is why a US-destined packet is checked against this scheme even though
 * `region` records the originating jurisdiction as US-CA.
 */
export const CARB_P2: FormaldehydeEmission<'CARB'> = defineEmission({
  scheme: 'CARB',
  class: 'P2',
  testMethod: 'ASTM E1333',
  numericLimit: 0.09,
  unit: 'ppm',
  region: 'US-CA',
  provenance: 'VERIFIED',
  sourceNote:
    'CARB Phase 2 particleboard limit, 0.09 ppm by ASTM E1333 large chamber. ' +
    'Independently verified. Mirrored federally by TSCA Title VI / 40 CFR 770.',
});

/**
 * JIS F-four-star — 0.3 mg/L average by the desiccator method.
 *
 * The highest (lowest-emitting) grade in the F-star system.
 */
export const JIS_F_FOUR_STAR: FormaldehydeEmission<'JIS'> = defineEmission({
  scheme: 'JIS',
  class: 'F****',
  testMethod: 'desiccator',
  numericLimit: 0.3,
  unit: 'mg/L',
  region: 'JP',
  provenance: 'VERIFIED',
  sourceNote:
    'JIS F**** (F-four-star) desiccator average of 0.3 mg/L. Independently verified.',
});

/**
 * Every emission class MONOLITH knows about. Three entries, on purpose.
 *
 * A fourth entry is a sourcing task, not a coding task.
 */
export const FORMALDEHYDE_EMISSION_CATALOG: Readonly<Record<string, AnyFormaldehydeEmission>> = {
  'emission-en-e1': EN_E1,
  'emission-carb-p2': CARB_P2,
  'emission-jis-f4star': JIS_F_FOUR_STAR,
};

// ============================================
// COMPARISON — SINGLE SCHEME ONLY
// ============================================

/**
 * Thrown whenever two schemes are brought together in a numeric context.
 *
 * A distinct class so callers can catch it specifically and so it reads unambiguously in a
 * compliance log: this is never a transient failure, it is always a modelling mistake.
 */
/**
 * The minimum needed to check scheme identity.
 *
 * Structural rather than `AnyFormaldehydeEmission` on purpose: the scheme guards must also
 * accept a still-generic `FormaldehydeEmission<S>` from inside a generic function, which the
 * closed union cannot absorb.
 */
export interface SchemeBearing {
  readonly scheme: EmissionScheme;
}

export class CrossSchemeComparisonError extends Error {
  readonly leftScheme: EmissionScheme;
  readonly rightScheme: EmissionScheme;

  constructor(leftScheme: EmissionScheme, rightScheme: EmissionScheme) {
    super(
      `Refusing to compare a ${leftScheme} emission limit with a ${rightScheme} one. ` +
        `${leftScheme} and ${rightScheme} are measured by different test methods in different ` +
        `units, so the comparison has no physical meaning and any compliance conclusion drawn ` +
        `from it would be unfounded. There is no conversion between these schemes, and this ` +
        `codebase deliberately provides none. To compare, obtain a test result in the SAME ` +
        `scheme as the target market's requirement.`,
    );
    this.name = 'CrossSchemeComparisonError';
    this.leftScheme = leftScheme;
    this.rightScheme = rightScheme;
  }
}

/**
 * Compare two limits WITHIN one scheme. Returns -1, 0 or 1 in the usual sort order.
 *
 * `S` is inferred from `a` only; `b` is then pinned to that same scheme, so mixing schemes
 * is a compile error. The runtime throw is not redundant — it catches callers reaching this
 * function from untyped JavaScript or through a widened `AnyFormaldehydeEmission`.
 */
export function compareEmissionLimits<S extends EmissionScheme>(
  a: FormaldehydeEmission<S>,
  b: FormaldehydeEmission<NoInferScheme<S>>,
): -1 | 0 | 1 {
  assertSameScheme(a, b);
  if (a.numericLimit < b.numericLimit) return -1;
  if (a.numericLimit > b.numericLimit) return 1;
  return 0;
}

/**
 * Guard for the same rule at a runtime boundary — deserialised records, store contents,
 * anything that arrived as data rather than as a literal.
 */
export function assertSameScheme(
  a: SchemeBearing,
  b: SchemeBearing,
): void {
  if (a.scheme !== b.scheme) {
    throw new CrossSchemeComparisonError(a.scheme, b.scheme);
  }
}

/**
 * Whether two records describe the same scheme. The non-throwing form, for branching.
 *
 * Note what this is NOT: it is not an equivalence test between schemes, and there is no
 * such function anywhere in this module. An EN E1 board is not "at least a CARB P2 board",
 * and no amount of arithmetic here can make it one.
 */
export function isSameScheme(a: SchemeBearing, b: SchemeBearing): boolean {
  return a.scheme === b.scheme;
}

/** Human-readable rendering, always carrying the method and unit so it cannot be misread. */
export function describeEmission(emission: AnyFormaldehydeEmission): string {
  return `${emission.scheme} ${emission.class} (${emission.testMethod}, <= ${emission.numericLimit} ${emission.unit}, ${emission.region})`;
}

// ============================================
// EXPORT DESTINATION REQUIREMENTS
// ============================================

export type ExportDestination = 'EU' | 'US' | 'JP' | 'TH';

/**
 * Whether the requirement for a destination is known.
 *
 * `UNSOURCED` is a real state and is treated as BLOCKING, not as "no requirement". Asserting
 * that a market has no formaldehyde rule is itself a regulatory claim, and an unsourced one
 * is exactly as dangerous as an invented limit.
 */
export type RequirementStatus = 'REQUIRED' | 'UNSOURCED';

export interface DestinationEmissionRequirement {
  readonly destination: ExportDestination;
  readonly status: RequirementStatus;
  /** The scheme a packet for this destination must state its class in. Null when unsourced. */
  readonly requiredScheme: EmissionScheme | null;
  /** Classes accepted for this destination, in the required scheme. Empty when unsourced. */
  readonly acceptedClasses: readonly string[];
  readonly regulation: string;
  readonly note: string;
}

export const DESTINATION_EMISSION_REQUIREMENTS: Readonly<
  Record<ExportDestination, DestinationEmissionRequirement>
> = {
  EU: {
    destination: 'EU',
    status: 'REQUIRED',
    requiredScheme: 'EN',
    acceptedClasses: ['E1'],
    regulation: 'EN 120 / E-class',
    note: 'E1 is the only EN class encoded. E0 exists and is stricter, but its limit has not been sourced, so a board declared E0 cannot yet be recorded here.',
  },
  US: {
    destination: 'US',
    status: 'REQUIRED',
    requiredScheme: 'CARB',
    acceptedClasses: ['P2'],
    regulation: 'CARB Phase 2 / TSCA Title VI (40 CFR 770)',
    note: 'CARB Phase 2 originates in California; TSCA Title VI applies the same limits across the US, so a CARB P2 declaration is what a US-destined packet carries.',
  },
  JP: {
    destination: 'JP',
    status: 'REQUIRED',
    requiredScheme: 'JIS',
    acceptedClasses: ['F****'],
    regulation: 'JIS F-star',
    note: 'F**** is the only F-star grade encoded. F*** and F** are real, less strict grades whose limits have not been sourced.',
  },
  TH: {
    destination: 'TH',
    status: 'UNSOURCED',
    requiredScheme: null,
    acceptedClasses: [],
    regulation: 'UNSOURCED',
    note: 'The Thai domestic formaldehyde requirement has NOT been sourced. This is recorded as unknown, never as "no requirement" — declaring a market unregulated without a source is itself an unfounded regulatory claim. A human must supply the TIS/Thai standard reference.',
  },
};

// ============================================
// EXPORT-PACKET VALIDATION
// ============================================

export type EmissionFindingCode =
  /** The material carries no emission data at all. Fine day to day; blocking for export. */
  | 'EMISSION_DATA_MISSING'
  /** The material states a class, but in a scheme this destination does not accept. */
  | 'EMISSION_SCHEME_MISMATCH'
  /** Right scheme, but the class is not on the destination's accepted list. */
  | 'EMISSION_CLASS_NOT_ACCEPTED'
  /** We do not know what this destination requires. */
  | 'DESTINATION_REQUIREMENT_UNSOURCED';

/**
 * `BLOCKER` — a definite failure against a known rule.
 * `UNKNOWN` — we cannot tell, because the requirement itself is unsourced. Both stop a
 * packet; they are separated so a reader can tell "this board is wrong" from "we do not
 * know the rule", which need completely different fixes.
 */
export type EmissionFindingSeverity = 'BLOCKER' | 'UNKNOWN';

export interface EmissionComplianceFinding {
  readonly code: EmissionFindingCode;
  readonly severity: EmissionFindingSeverity;
  /** Null when the finding is about the destination rather than a specific material. */
  readonly materialId: string | null;
  readonly message: string;
}

/** The minimum a material must look like to be checked. Structural, so any catalog fits. */
export interface EmissionBearingMaterial {
  readonly id: string;
  readonly name?: string;
  readonly formaldehydeEmission?: AnyFormaldehydeEmission | null;
}

export interface EmissionComplianceReport {
  readonly destination: ExportDestination;
  readonly requirement: DestinationEmissionRequirement;
  /** True only when every material states an accepted class in the required scheme. */
  readonly compliant: boolean;
  readonly findings: readonly EmissionComplianceFinding[];
  /** Materials that passed, for the packet's evidence trail. */
  readonly declaredMaterialIds: readonly string[];
}

/**
 * Check a set of materials against a destination's requirement.
 *
 * Missing emission data is NOT an error in the material model — the field is optional and
 * most of the catalog legitimately has none, because no supplier certificate has been
 * collected. It becomes a blocker only here, at the point a packet claims it is fit to
 * cross a border.
 */
export function validateEmissionForExport(
  materials: readonly EmissionBearingMaterial[],
  destination: ExportDestination,
): EmissionComplianceReport {
  const requirement = DESTINATION_EMISSION_REQUIREMENTS[destination];
  const findings: EmissionComplianceFinding[] = [];
  const declaredMaterialIds: string[] = [];

  if (requirement.status === 'UNSOURCED' || requirement.requiredScheme === null) {
    findings.push({
      code: 'DESTINATION_REQUIREMENT_UNSOURCED',
      severity: 'UNKNOWN',
      materialId: null,
      message:
        `No sourced formaldehyde requirement for destination ${destination}. ${requirement.note} ` +
        `The packet cannot be certified for ${destination} until that reference exists. ` +
        `Do not read this as "no requirement".`,
    });
    return {
      destination,
      requirement,
      compliant: false,
      findings,
      declaredMaterialIds,
    };
  }

  const requiredScheme = requirement.requiredScheme;

  for (const material of materials) {
    const emission = material.formaldehydeEmission;
    const label = material.name ? `${material.name} (${material.id})` : material.id;

    if (emission === undefined || emission === null) {
      findings.push({
        code: 'EMISSION_DATA_MISSING',
        severity: 'BLOCKER',
        materialId: material.id,
        message:
          `${label} carries no formaldehyde emission data, and a packet for ${destination} must ` +
          `state a ${requiredScheme} class (${requirement.regulation}). Obtain the figure from a ` +
          `supplier certificate for this SKU and record it — do not infer it from the product name.`,
      });
      continue;
    }

    if (emission.scheme !== requiredScheme) {
      findings.push({
        code: 'EMISSION_SCHEME_MISMATCH',
        severity: 'BLOCKER',
        materialId: material.id,
        message:
          `${label} is declared ${describeEmission(emission)}, but ${destination} requires a ` +
          `${requiredScheme} class (${requirement.regulation}). These are different test methods ` +
          `in different units: the ${emission.scheme} result cannot be converted or upgraded into ` +
          `a ${requiredScheme} one. The board must be re-tested to ${requiredScheme}.`,
      });
      continue;
    }

    if (!requirement.acceptedClasses.includes(emission.class)) {
      findings.push({
        code: 'EMISSION_CLASS_NOT_ACCEPTED',
        severity: 'BLOCKER',
        materialId: material.id,
        message:
          `${label} is declared ${describeEmission(emission)}, which is not on the accepted list ` +
          `for ${destination} (${requirement.acceptedClasses.join(', ') || 'none'}).`,
      });
      continue;
    }

    declaredMaterialIds.push(material.id);
  }

  return {
    destination,
    requirement,
    compliant: findings.length === 0,
    findings,
    declaredMaterialIds,
  };
}

/**
 * The gate itself. Throws unless every material is cleared for the destination.
 *
 * Call this from anything that commits to an export packet. `validateEmissionForExport` is
 * the advisory form for UI; this is the one that must sit in front of the border.
 */
export function assertEmissionCompliantForExport(
  materials: readonly EmissionBearingMaterial[],
  destination: ExportDestination,
): EmissionComplianceReport {
  const report = validateEmissionForExport(materials, destination);
  if (!report.compliant) {
    const detail = report.findings.map((f) => `[${f.severity}] ${f.code}: ${f.message}`).join('\n');
    throw new Error(
      `Formaldehyde emission gate FAILED for destination ${destination}: ` +
        `${report.findings.length} finding(s).\n${detail}`,
    );
  }
  return report;
}
