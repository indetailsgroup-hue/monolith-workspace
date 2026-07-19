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
 * Board substrates an emission limit can be published against.
 *
 * DECLARED HERE, NOT IMPORTED, and structurally identical to
 * PanelMaterialSystem.CoreType. This module is a deliberate import-free leaf — see the
 * header — and PanelMaterialSystem already imports FROM it, so importing CoreType back
 * would close a cycle. The two are pinned together by a compile-time assertion at
 * PanelMaterialSystem.ts (`CoreType extends EmissionSubstrate`), so adding a core type
 * there without extending this union is a build error rather than a silent gap.
 */
export type EmissionSubstrate =
  | 'PARTICLE_BOARD'
  | 'MDF'
  | 'HMR'
  | 'PLYWOOD'
  | 'BLOCKBOARD';

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
 * The SUBSTRATES each published limit actually covers, keyed `${scheme}:${class}`.
 *
 * A CLASS NAME IS NOT SUBSTRATE-INDEPENDENT, and treating it as one silently validates a
 * board against the wrong number. CARB Phase 2 "P2" is the clearest case: 0.09 ppm is the
 * PARTICLEBOARD limit, while MDF and thin MDF are regulated under the SAME class name at
 * DIFFERENT limits. Because the emission field hangs off CoreMaterial — which includes MDF
 * cores — nothing else stops a P2 certificate being attached to an MDF board and checked
 * against a particleboard threshold.
 *
 * KEPT AS A SIDE TABLE rather than a field on FormaldehydeEmission ON PURPOSE. That record
 * is stored on catalog materials and flows through an Immer store; adding a readonly array
 * to it forces `WritableDraft` incompatibilities at every assignment, and the casts needed
 * to silence those would be a worse outcome than the hazard being fixed. Scope is a
 * property of the PUBLISHED LIMIT, not of a particular board's certificate, so a lookup
 * keyed by scheme and class is also the more honest home for it.
 *
 * `null` means substrate-independent AS PUBLISHED — a positive finding about the standard,
 * never a default for "nobody checked". Limits for substrates absent from a list are NOT
 * recorded, because they have not been independently verified; a mismatch is therefore
 * reported as UNKNOWN rather than resolved against a fabricated number.
 */
export const EMISSION_LIMIT_SUBSTRATE_SCOPE: Readonly<
  Record<string, readonly EmissionSubstrate[] | null>
> = {
  // EN 120's perforator value is expressed per 100g of oven-dry board and E1 is applied
  // across wood-based panels rather than being split by substrate the way CARB P2 is.
  'EN:E1': null,
  // PARTICLEBOARD ONLY. See CARB_P2.
  'CARB:P2': ['PARTICLE_BOARD'],
  // The F-star grades are defined by the desiccator result itself, across wood-based panels.
  'JIS:F****': null,
};

/** Key an emission record into EMISSION_LIMIT_SUBSTRATE_SCOPE. */
export function emissionScopeKey(emission: AnyFormaldehydeEmission): string {
  return `${emission.scheme}:${emission.class}`;
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
 * CARB Phase 2 — 0.09 ppm by ASTM E1333 large chamber, FOR PARTICLEBOARD ONLY.
 *
 * CARB is a California regulation; TSCA Title VI (40 CFR 770) adopted the same limits
 * federally, which is why a US-destined packet is checked against this scheme even though
 * `region` records the originating jurisdiction as US-CA.
 *
 * THE SUBSTRATE IS PART OF THE LIMIT, NOT A FOOTNOTE. 0.09 ppm is the particleboard
 * threshold. MDF and thin MDF are regulated under the SAME class name "P2" at DIFFERENT
 * numeric limits, which are NOT recorded here because they have not been independently
 * verified — and guessing them would be indistinguishable from the fabricated-figure
 * defect this module exists to prevent. EMISSION_LIMIT_SUBSTRATE_SCOPE therefore scopes
 * 'CARB:P2' to PARTICLE_BOARD alone, and attaching this record to an MDF core is reported
 * as an UNKNOWN finding rather than silently validated against the wrong number.
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
    'Independently verified. Mirrored federally by TSCA Title VI / 40 CFR 770. ' +
    'PARTICLEBOARD ONLY — the MDF and thin-MDF limits under the same P2 class name are ' +
    'different figures and are NOT sourced here.',
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
  | 'DESTINATION_REQUIREMENT_UNSOURCED'
  /**
   * The class is accepted, but its published limit was NOT written for this board's
   * substrate — e.g. a CARB P2 certificate on an MDF core, where 0.09 ppm is the
   * particleboard figure. The correct limit for the actual substrate is unsourced, so this
   * is UNKNOWN rather than BLOCKER: the board may well comply, but not against this number.
   */
  | 'EMISSION_LIMIT_SUBSTRATE_MISMATCH';

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
  /**
   * The board's substrate, checked against the published limit's scope.
   *
   * NAMED `substrate`, NOT `type`. CoreMaterial.type happens to hold exactly this, but
   * SurfaceMaterial.type holds a finish ('MELAMINE', 'HPL', ...) — a completely different
   * axis under the same word. Reusing `type` here made a surface material structurally
   * unassignable to this interface and would have invited a cast at the one place the
   * regulatory check is assembled. Callers map their own field in explicitly.
   *
   * Optional, so surface materials and any other catalog still satisfy the interface.
   * `undefined` SKIPS the substrate check rather than assuming one — inferring a substrate
   * is exactly the guess this module refuses to make.
   */
  readonly substrate?: EmissionSubstrate;
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

    // The class is accepted — but was its published limit written for THIS board?
    // A scheme and a class name can both match while the number behind them belongs to a
    // different substrate entirely. Checked last, because it only matters once everything
    // else lines up, and skipped when the substrate is unstated rather than guessed.
    const scope = EMISSION_LIMIT_SUBSTRATE_SCOPE[emissionScopeKey(emission)];
    if (scope !== undefined && scope !== null && material.substrate !== undefined) {
      if (!scope.includes(material.substrate)) {
        findings.push({
          code: 'EMISSION_LIMIT_SUBSTRATE_MISMATCH',
          severity: 'UNKNOWN',
          materialId: material.id,
          message:
            `${label} is a ${material.substrate} board declared ${describeEmission(emission)}, but ` +
            `that ${emission.numericLimit}${emission.unit} limit is published for ` +
            `${scope.join(', ')} only. The same class name carries a DIFFERENT limit for ` +
            `${material.substrate}, and that figure is not sourced here — so this board has not ` +
            `been checked against anything. Obtain the ${emission.scheme} ${emission.class} limit ` +
            `for ${material.substrate} from the regulation text and record it; do not reuse the ` +
            `${scope.join('/')} number.`,
        });
        continue;
      }
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
