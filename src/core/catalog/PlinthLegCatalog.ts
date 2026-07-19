/**
 * PlinthLegCatalog.ts — the adjustable plinth leg, modelled as HARDWARE YOU BUY.
 *
 * WHY THIS FILE EXISTS
 * The height stack derives plinth height as `counter - carcass - worktop`. The previous
 * design treated that derived number as freely settable: whatever the subtraction
 * produced became the plinth. That is wrong in the same way "the gap is 111.4mm so cut a
 * 111.4mm leg" is wrong — a plinth is not a machined part, it is a LEG, and a leg is a
 * purchased SKU with a physical adjustment range.
 *
 * So the derived height must be validated as REACHABLE by a leg that exists. A target
 * counter height needing a plinth shorter than the shortest leg you can buy is not a
 * kitchen that gets built slightly wrong — it is a kitchen that cannot be assembled.
 *
 * THE ADJUSTMENT RANGE IS THE FLOOR-LEVELLING TOLERANCE, NOT SLACK.
 * An adjustable leg is wound down under a floor high spot and up under a low spot so the
 * carcass tops come level. The distance from the nominal plinth height to each end of the
 * leg's range is therefore the levelling headroom in that direction, and it is a real
 * installation constraint that has to be surfaced rather than discarded.
 *
 * Keep this file free of ALL imports. Its leaf status is load-bearing: CabinetTaxonomy.ts
 * imports it, and CabinetTaxonomy.ts is itself imported by types/Cabinet.ts.
 */

/**
 * How well-established a leg's figures are.
 *
 * `OWNER_CONFIRMED` is the strongest evidence in this codebase and outranks published
 * documents: it is the stated practice of the kitchen business MONOLITH is built for.
 */
export type LegProvenance = 'OWNER_CONFIRMED' | 'PUBLISHED' | 'UNSOURCED';

export interface PlinthLeg {
  readonly id: string;
  readonly name: string;
  readonly nameTH: string;
  /**
   * Height with the leg wound fully DOWN, mm. The shortest this leg can physically be,
   * and therefore the hard floor on any plinth height built from it.
   */
  readonly minHeight: number;
  /**
   * Height wound fully UP, mm.
   *
   * `null` means THE ADJUSTMENT TOP IS NOT SOURCED — not that the leg is unlimited.
   * A number here must come from a real product datasheet. Inventing one would put a
   * fabricated hardware figure into levelling tolerances that an installer relies on,
   * which is the exact defect class this work exists to eliminate. Consumers must treat
   * null as "unknown" and refuse to report an upper headroom, never as "infinite".
   */
  readonly maxHeight: number | null;
  readonly adjustable: boolean;
  readonly minHeightProvenance: LegProvenance;
  readonly maxHeightProvenance: LegProvenance;
  /** Retired SKUs stay listed as history but must never be selected for a new design. */
  readonly retired: boolean;
  readonly note: string;
}

/**
 * The current Thai adjustable leg. OWNER-CONFIRMED.
 *
 * 70mm is the MINIMUM — the leg's wound-fully-down height — and it adjusts UPWARD from
 * there. It is not a nominal that can also go shorter.
 *
 * This matters more than it looks. The Thai default stack lands at exactly 70mm:
 *
 *     850 counter - 760 carcass - 20 worktop = 70 plinth = this leg's minimum
 *
 * so a PERFECTLY FLAT FLOOR is the lower bound of the buildable range, and the whole of
 * the leg's adjustment is headroom for an uneven floor. There is ZERO room to shorten a
 * leg. Any floor high spot under a cabinet must be ground down or the whole run must be
 * datumed off that high point (raising every other leg), because no leg in this design
 * can go below 70mm to accommodate it.
 */
export const THAI_ADJUSTABLE_LEG_70: PlinthLeg = {
  id: 'leg-th-adj-70',
  name: 'Thai adjustable cabinet leg, 70mm minimum',
  nameTH: 'ขาปรับระดับ 70 มม. (ต่ำสุด)',
  minHeight: 70,
  // BLOCKED ON SOURCING. The owner confirmed the 70mm minimum and that the leg adjusts
  // upward; the top of that adjustment is a product-datasheet figure nobody has supplied.
  // Left null on purpose — see the field doc. Everything that needs only the lower bound
  // (reachability rejection, shorten-headroom) works fully today; only the upward
  // levelling headroom is withheld, and it is withheld loudly.
  maxHeight: null,
  adjustable: true,
  minHeightProvenance: 'OWNER_CONFIRMED',
  maxHeightProvenance: 'UNSOURCED',
  retired: false,
  note:
    'Minimum 70mm, adjusts upward. Adjustment top NOT SOURCED — needs a real Thai-market ' +
    'datasheet before any upward levelling tolerance can be quoted.',
};

/**
 * The previous generation of Thai leg, 100mm. RETIRED — the owner confirms this
 * generation is no longer used.
 *
 * Kept listed, and kept `retired: true`, for one reason: the literal `100` was hardcoded
 * in a dozen places in this codebase and its provenance was never written down. Anyone
 * finding a stray 100 in old data or an old drawing can now identify it as this SKU
 * rather than assume it is a current default and reinstate it.
 */
export const THAI_LEG_100_RETIRED: PlinthLeg = {
  id: 'leg-th-100-retired',
  name: 'Thai cabinet leg 100mm (retired generation)',
  nameTH: 'ขาตู้ 100 มม. (รุ่นเก่า เลิกใช้)',
  minHeight: 100,
  maxHeight: null,
  adjustable: true,
  minHeightProvenance: 'OWNER_CONFIRMED',
  maxHeightProvenance: 'UNSOURCED',
  retired: true,
  note:
    'Superseded by leg-th-adj-70. Present only so the legacy hardcoded 100mm plinth is ' +
    'identifiable as a retired SKU rather than mistaken for a live default.',
};

export const PLINTH_LEG_CATALOG: Readonly<Record<string, PlinthLeg>> = {
  [THAI_ADJUSTABLE_LEG_70.id]: THAI_ADJUSTABLE_LEG_70,
  [THAI_LEG_100_RETIRED.id]: THAI_LEG_100_RETIRED,
};

/** The leg every default configuration stands on. */
export const DEFAULT_PLINTH_LEG: PlinthLeg = THAI_ADJUSTABLE_LEG_70;

/**
 * Resolve a leg id against the catalog.
 *
 * Throws on unknown AND on retired, rather than falling back. A silent fallback here
 * would change every cabinet's standing height in a run.
 */
export function resolvePlinthLeg(legId: string): PlinthLeg {
  const leg = PLINTH_LEG_CATALOG[legId];
  if (!leg) {
    throw new Error(
      `Plinth leg not in catalog: ${legId}. Known: ${Object.keys(PLINTH_LEG_CATALOG).join(', ')}`
    );
  }
  if (leg.retired) {
    throw new Error(
      `Plinth leg ${legId} is a RETIRED generation and must not be specified for a new ` +
        `design. ${leg.note}`
    );
  }
  return leg;
}

/**
 * Floor-levelling tolerance left by standing a given nominal plinth height on a given leg.
 *
 * Sign convention, stated because it is easy to get backwards: under a floor HIGH spot a
 * leg must be SHORTENED, under a LOW spot LENGTHENED. So `shortenHeadroom` is what the
 * installer has to give away against a bump, and `lengthenHeadroom` is what is available
 * against a dip.
 */
export interface LevellingTolerance {
  readonly legId: string;
  /** Nominal plinth height the run is set out at, mm. */
  readonly plinthHeight: number;
  readonly legMinHeight: number;
  readonly legMaxHeight: number | null;
  /**
   * How far a leg can still be wound DOWN from the nominal, mm. = plinth - legMin.
   * Zero means the floor may not be high anywhere relative to the datum.
   */
  readonly shortenHeadroom: number;
  /**
   * How far a leg can still be wound UP from the nominal, mm. = legMax - plinth.
   * `null` when the leg's adjustment top is unsourced — unknown, NOT unlimited.
   */
  readonly lengthenHeadroom: number | null;
  /** Total usable levelling window, mm. `null` when the adjustment top is unsourced. */
  readonly totalRange: number | null;
}

export function computeLevellingTolerance(plinthHeight: number, leg: PlinthLeg): LevellingTolerance {
  const shortenHeadroom = plinthHeight - leg.minHeight;
  const lengthenHeadroom = leg.maxHeight === null ? null : leg.maxHeight - plinthHeight;
  return {
    legId: leg.id,
    plinthHeight,
    legMinHeight: leg.minHeight,
    legMaxHeight: leg.maxHeight,
    shortenHeadroom,
    lengthenHeadroom,
    totalRange: lengthenHeadroom === null ? null : shortenHeadroom + lengthenHeadroom,
  };
}

export type LegReachabilityCode =
  /** The nominal plinth sits inside the leg's range on every bound that is known. */
  | 'REACHABLE'
  /** Below the leg's wound-fully-down height. UNBUILDABLE. */
  | 'BELOW_LEG_MINIMUM'
  /** Above the leg's wound-fully-up height. UNBUILDABLE. */
  | 'ABOVE_LEG_MAXIMUM';

export interface LegReachability {
  readonly code: LegReachabilityCode;
  /** False only for a bound that is KNOWN to be violated. */
  readonly reachable: boolean;
  /**
   * True when the upper bound could not be checked because the leg's adjustment top is
   * unsourced. `reachable: true` with this flag set means "no known bound is violated",
   * which is weaker than "verified in range" and must be reported as such.
   */
  readonly upperBoundUnverified: boolean;
  readonly message: string;
  readonly tolerance: LevellingTolerance;
}

/**
 * Is this derived plinth height reachable by this leg?
 *
 * A configuration that fails here is UNBUILDABLE and must be rejected. It must NOT be
 * rounded up to the leg minimum: silently lifting the plinth also lifts the worktop above
 * the counter height the customer specified, converting a loud failure into a kitchen
 * that is quietly the wrong height.
 */
export function assessLegReachability(plinthHeight: number, leg: PlinthLeg): LegReachability {
  const tolerance = computeLevellingTolerance(plinthHeight, leg);
  const upperBoundUnverified = leg.maxHeight === null;

  if (plinthHeight < leg.minHeight) {
    return {
      code: 'BELOW_LEG_MINIMUM',
      reachable: false,
      upperBoundUnverified,
      message:
        `Plinth height ${plinthHeight.toFixed(1)}mm is below the ${leg.minHeight}mm minimum of ` +
        `leg ${leg.id} (${leg.name}), which is its wound-fully-down height. This configuration ` +
        `is UNBUILDABLE: no leg in the catalog is short enough. Raise the counter height, ` +
        `reduce the carcass height or specify a thinner worktop — do not round the plinth up, ` +
        `which would push the finished worktop above the target counter height.`,
      tolerance,
    };
  }

  if (leg.maxHeight !== null && plinthHeight > leg.maxHeight) {
    return {
      code: 'ABOVE_LEG_MAXIMUM',
      reachable: false,
      upperBoundUnverified: false,
      message:
        `Plinth height ${plinthHeight.toFixed(1)}mm exceeds the ${leg.maxHeight}mm maximum of ` +
        `leg ${leg.id} (${leg.name}), which is its wound-fully-up height. This configuration ` +
        `is UNBUILDABLE with this leg.`,
      tolerance,
    };
  }

  return {
    code: 'REACHABLE',
    reachable: true,
    upperBoundUnverified,
    message: upperBoundUnverified
      ? `Plinth height ${plinthHeight.toFixed(1)}mm clears the ${leg.minHeight}mm minimum of leg ` +
        `${leg.id} with ${tolerance.shortenHeadroom.toFixed(1)}mm of shortening headroom. The ` +
        `UPPER bound could not be checked: this leg's adjustment top is not sourced, so the ` +
        `upward levelling headroom is UNKNOWN, not unlimited.`
      : `Plinth height ${plinthHeight.toFixed(1)}mm is within leg ${leg.id} range ` +
        `${leg.minHeight}-${leg.maxHeight}mm.`,
    tolerance,
  };
}
