/**
 * SYSTEM 32 — SINGLE SOURCE OF TRUTH
 * ==================================
 *
 * The 32mm cabinet system defines the drilling grid that every piece of
 * European frameless hardware is manufactured to: shelf pins, hinge plates,
 * drawer runners and knock-down connectors all expect holes on the same grid.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this file, the grid was declared independently in FOUR places:
 *   - src/core/designer/policy.ts          (SYSTEM_32)
 *   - src/core/catalog/ShelfPinCatalog.ts  (DEFAULT_SYSTEM_32_CONFIG)
 *   - src/core/catalog/CabinetTaxonomy.ts  (CONSTRUCTION_TYPES.FRAMELESS.holePatternSpacing)
 *   - src/core/catalog/MinifixHardware.ts  (local SYSTEM_32_FIRST_HOLE)
 * They agreed by coincidence, not by construction. Nothing failed if one drifted.
 * A drifted grid does not throw — it silently emits a boring program whose holes
 * do not line up with the hardware that will be fitted into them, which is only
 * discovered on the shop floor after the panel is already cut.
 *
 * All four sites now import from here. See __tests__/system32.test.ts for the
 * cross-consumer agreement test that fails if any single site drifts.
 *
 * DEPENDENCY-FREE LEAF
 * --------------------
 * This module imports NOTHING. ShelfPinCatalog.ts and MinifixHardware.ts are
 * themselves import-free leaves; giving them a dependency that in turn reached
 * back into CabinetTaxonomy would create the same class of runtime import cycle
 * that panelFormulas.ts was extracted to break. Keep it import-free.
 *
 * PROVENANCE
 * ----------
 * 32mm pitch and 5mm hole diameter are the defining constants of the 32mm
 * system and are effectively universal across European hardware manufacturers.
 * The 37mm front setback is the common industry convention (it centres a 35mm
 * hinge cup boring with clearance) but is a CONVENTION, not a published
 * standard dimension — some manufacturers' systems use different setbacks and
 * hardware datasheets should be honoured over this default where they differ.
 */

/** Provenance of a System 32 value, so consumers can tell standard from convention. */
export type System32Provenance =
  /** Defining constant of the 32mm system; universal across manufacturers. */
  | 'SYSTEM_32_DEFINING'
  /** Widespread industry convention, not a published standard dimension. */
  | 'INDUSTRY_CONVENTION';

export interface System32Grid {
  /**
   * Vertical hole spacing along the line of holes (mm).
   * This is the constant the whole system is named after.
   */
  readonly pitch: number;
  /**
   * Distance from the FRONT edge of the panel to the line of holes (mm).
   * Referred to as `firstHoleZ` / `frontSetback` by different consumers;
   * they are the same dimension measured the same way.
   */
  readonly frontSetback: number;
  /** Standard hole diameter (mm). 5mm accepts standard shelf pins and system screws. */
  readonly holeDiameter: number;
  /** Standard hole depth into the panel face (mm). */
  readonly holeDepth: number;

  readonly provenance: {
    readonly pitch: System32Provenance;
    readonly frontSetback: System32Provenance;
    readonly holeDiameter: System32Provenance;
    readonly holeDepth: System32Provenance;
  };
}

/**
 * THE canonical 32mm drilling grid. Every consumer derives from this object.
 * Do not copy these numbers into another module — import this instead.
 */
export const SYSTEM_32_GRID: System32Grid = {
  pitch: 32,
  frontSetback: 37,
  holeDiameter: 5,
  holeDepth: 13,
  provenance: {
    pitch: 'SYSTEM_32_DEFINING',
    frontSetback: 'INDUSTRY_CONVENTION',
    holeDiameter: 'SYSTEM_32_DEFINING',
    holeDepth: 'INDUSTRY_CONVENTION',
  },
} as const;

/**
 * Snap a position (mm from the datum end of the panel) onto the System 32 grid.
 * Shared by every consumer so that "on the grid" means one thing system-wide.
 */
export function nearestSystem32Position(
  position: number,
  grid: System32Grid = SYSTEM_32_GRID
): number {
  return (
    Math.round((position - grid.frontSetback) / grid.pitch) * grid.pitch +
    grid.frontSetback
  );
}

/**
 * True when `position` sits on the System 32 grid within `tolerance` mm.
 */
export function isOnSystem32Grid(
  position: number,
  tolerance = 2,
  grid: System32Grid = SYSTEM_32_GRID
): boolean {
  return Math.abs(position - nearestSystem32Position(position, grid)) <= tolerance;
}
