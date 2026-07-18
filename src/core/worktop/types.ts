/**
 * Worktop / cabinet-run domain types.
 *
 * Runs are DERIVED, never persisted. saveProject (useProjectStore.ts:233-241)
 * serializes only {id, name, category, dimensions, scenePosition, sceneRotation}
 * per cabinet — panels and structure are dropped for every non-active cabinet.
 * Anything computed purely from those fields survives a save/load round-trip;
 * anything stored alongside panels does not. That is the whole reason this
 * module is a set of pure functions over placements rather than a store slice.
 *
 * This file deliberately imports nothing from the store, so it stays free of
 * cycles and cheap to test.
 */

import type { CabinetPanel } from '../types/Cabinet';

/**
 * World-space transform of one cabinet, resolved once so nothing downstream has
 * to re-read the `as any` scenePosition/sceneRotation shape.
 *
 * PINNED BY src/core/worktop/__tests__/conventionPin.test.ts:
 * scenePosition X/Z are the footprint CENTRE and Y is the FLOOR. App.tsx and
 * useSnapTargets.ts comment it as the min corner; the renderer disagrees and
 * the renderer is what puts pixels on screen.
 */
export interface CabinetPlacement {
  readonly cabinetId: string;
  /** scenePosition — X/Z are the footprint CENTRE, Y is the FLOOR. mm. */
  readonly origin: readonly [number, number, number];
  /** sceneRotation[1], radians, normalised to [0, 2π). */
  readonly yaw: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly toeKickHeight: number;
  /** origin[1] + toeKickHeight + height — world Y of the carcass top face. mm. */
  readonly carcassTopY: number;
  /** Run direction: world (x, z) of the cabinet's local +X. Unit. */
  readonly u: readonly [number, number];
  /** Front normal: world (x, z) of the cabinet's local +Z. Unit. */
  readonly n: readonly [number, number];
  /** Footprint centre projected onto u. mm. */
  readonly uc: number;
  /** Footprint centre projected onto n. mm. */
  readonly nc: number;
  /**
   * Outer-face proudness of this cabinet's fronts past the carcass face, mm.
   * = doorConfig.doorThickness when doors exist, 0 when they explicitly do not,
   * and `undefined` when `structure` is unavailable (post-save/load, where only
   * dimensions and the scene transform survive). Undefined means "unknown", NOT
   * "zero" — the worktop deriver falls back to config.assumedDoorThickness so a
   * reloaded project does not silently shrink its slabs.
   */
  readonly frontProud?: number;
}

/**
 * A maximal set of same-yaw, front-coplanar, touching cabinets. One slab per
 * segment (before blank splitting).
 */
export interface RunSegment {
  readonly segmentId: string;
  readonly yaw: number;
  /** Members sorted ascending along the run axis u. */
  readonly members: readonly CabinetPlacement[];
  /** Host for the emitted panel(s): members[0]. */
  readonly hostCabinetId: string;
  /** Extent along u in WORLD units, mm. */
  readonly u0: number;
  readonly u1: number;
  /** Back-face and front-face offsets along n in WORLD units, mm. */
  readonly nBack: number;
  readonly nFront: number;
  readonly carcassTopY: number;
  /** True when members disagree on depth; the slab uses the deepest. */
  readonly mixedDepth: boolean;
  /**
   * Largest known frontProud across members, mm, or `undefined` when no member
   * could report one. The slab must clear the PROUDEST front in the run.
   */
  readonly maxFrontProud?: number;
}

/** A connected component of the adjacency graph. An L-run has 2 segments; an island has 1. */
export interface CabinetRun {
  /** Stable across saves: derived from the sorted member cabinet ids. */
  readonly runId: string;
  readonly segments: readonly RunSegment[];
  readonly cabinetIds: readonly string[];
}

/**
 * Worktop material + overhang policy.
 *
 * NOTE ON THICKNESS — deviation from the approved design, stated plainly:
 * the design specified a fixed 40mm slab on a new `core-worktop-hmr-38`
 * catalog entry. That entry does not exist and inventing cost/CO2 figures for
 * it would put guessed numbers into the BOM, which the design's own risk
 * register says should block the lane. So thickness is DERIVED from a real
 * catalog core via calculateRealThickness, exactly as generatePanels does for
 * every other panel. Swap coreMaterialId when a sourced worktop core lands.
 */
export interface WorktopConfig {
  /** Projection past the front DATUM (see frontDatum), mm. */
  readonly frontOverhang: number;
  /**
   * Projection past the carcass back face, mm. 0 = wall-abutting.
   *
   * GEOMETRY ONLY — this no longer decides whether the back edge is banded.
   * See backIsExposed.
   */
  readonly backOverhang: number;
  /**
   * Whether the back edge is banded, quoted and shown as finished.
   *
   * DELIBERATELY DECOUPLED FROM backOverhang, and defaulted to true.
   *
   * It used to be derived as `backOverhang > 0`, which meant every run in the
   * app shipped a raw, untaped, unquoted back edge — because both live entry
   * points defaulted to backOverhang 0 and ISLAND_WORKTOP_CONFIG had no runtime
   * caller at all.
   *
   * The obvious repair — "detect islands and give them the island config" — does
   * not work. A free-standing island and a straight galley run against a wall
   * are both a single segment with nothing adjacent; they are geometrically
   * indistinguishable, because walls are not modelled anywhere in this codebase.
   * Guessing island would push a 20mm overhang into the wall on the most common
   * layout in the product, which is a slab that does not fit.
   *
   * So the two concerns are separated and each defaults to its own safe
   * direction:
   *   - OVERHANG defaults to 0. A slab that is too deep cannot be installed;
   *     a slab that is flush always can.
   *   - BANDING defaults to ON. Over-banding a wall run costs a metre of tape
   *     that is honestly quoted. Under-banding an island ships bare
   *     particleboard on one of the most visible edges in the room AND
   *     under-quotes the job. Only the second one is a defect.
   */
  readonly backIsExposed: boolean;
  /** Projection past an exposed run end, mm. */
  readonly endOverhang: number;
  /**
   * Datum the front overhang is measured from.
   * - 'CARCASS': the carcass front face at local Z = +D/2.
   * - 'FRONT' (default): the door / drawer-front OUTER face, i.e. the carcass
   *   face plus the door thickness. This is the joinery convention — an
   *   overhang is a projection past the thing a person's knees touch.
   * Mirrors KickboardSetbackDatum so the two applied parts share one datum
   * vocabulary.
   */
  readonly frontDatum: 'CARCASS' | 'FRONT';
  /**
   * Door thickness assumed under the 'FRONT' datum when the segment cannot
   * report one. saveProject drops `structure` for every non-active cabinet
   * (useProjectStore.ts:233-241), so after a save/load round-trip doorConfig is
   * simply not there to read. 18 = DEFAULT_DOOR_CONFIG.doorThickness.
   */
  readonly assumedDoorThickness: number;
  /** Max slab length obtainable from one blank, mm. */
  readonly maxBlankLength: number;
  readonly coreMaterialId: string;
  readonly surfaceMaterialId: string;
  readonly edgeMaterialId: string;
}

/**
 * Wall-abutting default. Every material is an existing catalog entry with an
 * already-sourced Thai-market figure — nothing here is a placeholder price.
 * maxBlankLength 2440 = the 2450mm SHEET_PB_MDF_HMR sheet minus 10mm trim.
 *
 * ── CORE: WHY 18mm HMR AND NOT 38mm ──────────────────────────────────────────
 * A real kitchen worktop is 38-40mm on a moisture-resistant core. The catalog
 * has no such entry and inventing a price for one would put a guessed number in
 * a customer quote, which this project's rules forbid.
 *
 * The previous default, 'core-pb-35', was worse than a guess: it is a REAL
 * price (THB 520/m2) attached to a board that must not be used as a worktop —
 * PanelMaterialSystem.ts:165 declares it moistureResistant: false, so it fails
 * at the sink. A precise number for the wrong board is still a wrong quote.
 *
 * 'core-hmr-18' is the thickest core in the catalog that satisfies BOTH real
 * constraints simultaneously:
 *   - moistureResistant: true (PanelMaterialSystem.ts:417-428), and
 *   - thin enough for tape that exists. EVERY entry in EDGE_MATERIALS_CATALOG
 *     is height 23mm, so 22.4mm of core+surface is the hard ceiling on any
 *     bandable slab. 'core-hmr-28' and 'core-pb-35' cannot be banded by any
 *     tape in this catalog at all.
 * Both constraints are enforced by resolveWorktopMaterials, which throws rather
 * than shipping an unbuildable packet.
 *
 * So this slab is honest but THIN: 18.6mm finished. It is a buildable, correctly
 * priced part, not a guess — but it is not yet a premium worktop. Swap
 * coreMaterialId and edgeMaterialId together the moment a sourced 38mm HMR core
 * and a sourced ~45mm tape land in the catalog.
 */
export const DEFAULT_WORKTOP_CONFIG: WorktopConfig = {
  frontOverhang: 20,
  backOverhang: 0,
  backIsExposed: true,
  endOverhang: 0,
  frontDatum: 'FRONT',
  assumedDoorThickness: 18,
  maxBlankLength: 2440,
  coreMaterialId: 'core-hmr-18',
  surfaceMaterialId: 'surf-mel-white',
  edgeMaterialId: 'edge-pvc-white-20',
};

/**
 * Island / free-standing variant: the slab OVERHANGS at the back and at both
 * ends, as a free-standing island does.
 *
 * This differs from the default in GEOMETRY only. Banding is not the difference
 * any more — DEFAULT_WORKTOP_CONFIG already bands the back edge (see
 * backIsExposed), so choosing the wrong one of these two can no longer ship a
 * raw edge or under-quote tape. It only changes how far the slab projects.
 *
 * Pass it explicitly: `applyWorktops(ISLAND_WORKTOP_CONFIG)`. It is NOT selected
 * automatically, because a free-standing island and a galley run against a wall
 * are geometrically identical to this code and guessing wrong in this direction
 * produces a slab that will not fit the room.
 */
export const ISLAND_WORKTOP_CONFIG: WorktopConfig = {
  ...DEFAULT_WORKTOP_CONFIG,
  backOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
  endOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
};

export interface WorktopNote {
  readonly code: 'SPLIT_FOR_BLANK' | 'CORNER_BUTT' | 'MIXED_DEPTH';
  readonly runId: string;
  readonly message: string;
}

export interface WorktopDerivationResult {
  /** cabinetId -> WORKTOP panels expressed in THAT cabinet's local frame. */
  readonly panelsByHostId: ReadonlyMap<string, readonly CabinetPanel[]>;
  readonly runs: readonly CabinetRun[];
  /** Honest, surfaced rather than silently swallowed. */
  readonly notes: readonly WorktopNote[];
}

/** Cabinets that never carry a worktop. */
export const NON_WORKTOP_CABINET_TYPES: ReadonlySet<string> = new Set(['WALL', 'TALL']);

/** Two carcass tops within this many mm count as the same horizontal band. */
export const Y_BAND_TOL = 2;
/** Cabinets within this many mm of each other count as touching. */
export const GAP_TOL = 5;
/** Angular slop when testing for a multiple of 90°, radians (~0.5°). */
export const ANGLE_TOL = 0.0087;
/** Front planes within this many mm count as coplanar. */
export const PLANE_TOL = 2;
