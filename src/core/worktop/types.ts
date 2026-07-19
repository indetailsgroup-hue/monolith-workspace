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
import {
  DEFAULT_APPLIED_PART_DATUM,
  DEFAULT_ASSUMED_FRONT_PROUD_MM,
  WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM,
  type AppliedPartDatum,
} from '../geometry/appliedPartDatum';

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
 * Which edge of a run people SIT AT.
 *
 * 'NONE' is the default and the only safe default. Auto-detecting a seated
 * island is impossible here for the same reason auto-detecting an island at all
 * is impossible: this codebase has NO CONCEPT OF WALLS. A free-standing island
 * and a galley run against a wall are both a single segment with nothing
 * adjacent — geometrically identical to this code. Guessing 'BACK' would push a
 * 380mm slab projection into a wall on the most common layout in the product.
 *
 * Whether anyone sits at a run is a human fact about the room, not a derivable
 * property of the cabinets. It must be declared.
 */
export type SeatingSide = 'NONE' | 'BACK';

/**
 * Seated-island knee clearance. Distinct from backOverhang by design — see
 * src/core/worktop/seatingOverhang.ts for why mirroring the front projection to
 * the back is a geometric mirror and not knee space.
 *
 * DATUM: the seating overhang is measured from the CARCASS BACK FACE. Declared
 * here rather than inferred, per src/core/geometry/appliedPartDatum.ts.
 */
export interface SeatingConfig {
  /** Which edge is seated. 'NONE' (default) leaves backOverhang in charge. */
  readonly side: SeatingSide;
  /**
   * Finished counter height AT THE SEAT, mm. Keys into the NKBA knee-clearance
   * ladder — the required overhang depends on how high the sitter is perched.
   *
   * Defaults to the owner-confirmed Thai 850mm (leg 70 + carcass 760 + worktop
   * 20). NOT imported from CabinetTaxonomy.DEFAULT_COUNTER_HEIGHT_MM: that
   * module imports DEFAULT_WORKTOP_CONFIG from THIS file, so the import would
   * be a cycle. The literal is kept honest by a test that asserts it equals
   * DEFAULT_COUNTER_HEIGHT_MM.
   *
   * 850mm is BELOW the lowest published rung (900mm). resolveSeatingOverhang
   * reports that explicitly as a lower bound rather than extrapolating.
   */
  readonly counterHeightMm: number;
}

/** No seats. backOverhang governs the back edge. */
export const NO_SEATING: SeatingConfig = { side: 'NONE', counterHeightMm: 850 };

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
   * Knee clearance for seats at this run. OPT-IN — see SeatingConfig.
   *
   * When `side` is 'BACK' this REPLACES backOverhang on the back edge; the two
   * are different quantities measured for different reasons and must not be
   * added together.
   */
  readonly seating: SeatingConfig;
  /**
   * Datum the front overhang is measured from.
   *
   * NO LONGER A LOCAL STRING UNION. It is the shared AppliedPartDatum, defined
   * once in src/core/geometry/appliedPartDatum.ts and used by the PLINTH as
   * well. The two applied parts that bracket a cabinet front previously
   * defaulted to DIFFERENT datums (plinth 'CARCASS', worktop 'FRONT') with
   * nothing declaring it, so their two "distance from the front" figures were
   * not comparable to each other or to any published number. Both now default
   * to 'FRONT' from one constant.
   *
   * - 'CARCASS': the carcass front face at local Z = +D/2.
   * - 'FRONT' (default): the door / drawer-front OUTER face.
   */
  readonly frontDatum: AppliedPartDatum;
  /**
   * Door thickness assumed under the 'FRONT' datum when the segment cannot
   * report one. saveProject drops `structure` for every non-active cabinet
   * (useProjectStore.ts:233-241), so after a save/load round-trip doorConfig is
   * simply not there to read. 18 = DEFAULT_DOOR_CONFIG.doorThickness, shared
   * with the plinth as DEFAULT_ASSUMED_FRONT_PROUD_MM.
   *
   * UNKNOWN, NOT ZERO. A segment that is genuinely doorless reports
   * maxFrontProud === 0 and that 0 is honoured; only absence falls back here.
   * Collapsing the two would silently demote the slab to the CARCASS datum.
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
 *
 * ── UPDATE: THE THAI TARGET IS 20mm, AND 18.6 IS 1.4mm SHORT OF IT ───────────
 * The "38-40mm real worktop" premise above is EUROPEAN. The owner of the Thai
 * kitchen business this system is built for specifies a 20mm worktop, which
 * makes the 23mm edge tape a non-issue — the blocker recorded above does not
 * apply at the real target thickness.
 *
 * The target now lives at CabinetTaxonomy.DEFAULT_WORKTOP_THICKNESS_MM (20) and
 * the gap between it and this catalog is computed, not asserted, at
 * DEFAULT_WORKTOP_THICKNESS_GAP. The finding: exactly 20.0mm is UNREACHABLE
 * (no 20mm core exists; surfaces are only 0.3 and 0.8, so core + 2 x surface
 * cannot land on 20.0). The closest BUILDABLE slab is 19.6mm — 18mm HMR + two
 * 0.8mm HPL faces.
 *
 * This config is deliberately NOT switched to that combination: it would swap a
 * 0.3mm melamine face for a 0.8mm HPL one, changing the finish and the quoted
 * cost of every slab in the kitchen to chase 1.0mm. The 0.4mm residual against
 * target is absorbed by the adjustable leg instead. Material choice is a human
 * decision; see the WORKTOP_TARGET_NOT_IN_CATALOG warning.
 *
 * STILL OPEN, NOT ASSUMED: whether the Thai 20mm worktop is STONE (20mm is the
 * standard 2cm granite/quartz thickness) or a wood-based panel. Unconfirmed by
 * the owner. Nothing here branches on it.
 */
export const DEFAULT_WORKTOP_CONFIG: WorktopConfig = {
  // 25mm past the FRONT datum (door face) — was 20mm past the same datum. The
  // datum is now declared from one shared constant that the plinth also reads.
  frontOverhang: WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM,
  backOverhang: 0,
  backIsExposed: true,
  endOverhang: 0,
  seating: NO_SEATING,
  frontDatum: DEFAULT_APPLIED_PART_DATUM,
  assumedDoorThickness: DEFAULT_ASSUMED_FRONT_PROUD_MM,
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
 *
 * ── THIS ISLAND HAS NO SEATS, AND THAT IS NOW EXPLICIT ───────────────────────
 * The back and end projections below are a GEOMETRIC MIRROR of the front — the
 * slab floats symmetrically over its carcasses. That is correct for an UNSEATED
 * island and completely wrong for a seated one: a 25mm projection is a drip
 * edge, not knee space, and a stool pulled up to it puts the sitter's knees
 * against the carcass.
 *
 * Seating is therefore a separate, opt-in parameter rather than something this
 * config implies. `seating` stays NO_SEATING here; use SEATED_ISLAND_WORKTOP_CONFIG
 * or set `seating` yourself. See src/core/worktop/seatingOverhang.ts.
 */
export const ISLAND_WORKTOP_CONFIG: WorktopConfig = {
  ...DEFAULT_WORKTOP_CONFIG,
  backOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
  endOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
  seating: NO_SEATING,
};

/**
 * Island WITH SEATS at the back edge, at the Thai 850mm counter height.
 *
 * The back edge projection is no longer the front's 25mm mirror: it comes from
 * the NKBA knee-clearance ladder via resolveSeatingOverhang, keyed to
 * `seating.counterHeightMm`. The end overhangs stay the geometric mirror,
 * because nobody's knees are under them.
 *
 * OPT-IN, like ISLAND_WORKTOP_CONFIG and for a stronger reason: "is this run
 * seated" is a fact about the room and the client's furniture, not a property
 * of the cabinets. Nothing detects it.
 *
 * HONEST CAVEAT: at 850mm this run sits BELOW the lowest published rung, so the
 * figure it resolves (380mm) is a documented LOWER BOUND, not a sourced answer
 * for 850mm. deriveWorktopPanels surfaces that as a SEATING_OVERHANG note on
 * every derivation rather than letting it pass silently.
 */
export const SEATED_ISLAND_WORKTOP_CONFIG: WorktopConfig = {
  ...ISLAND_WORKTOP_CONFIG,
  seating: { side: 'BACK', counterHeightMm: 850 },
};

export interface WorktopNote {
  readonly code:
    | 'SPLIT_FOR_BLANK'
    | 'CORNER_BUTT'
    | 'MIXED_DEPTH'
    /**
     * The datum every front dimension on this slab was measured from, emitted on
     * EVERY derivation whether or not anything is unusual. That is deliberate:
     * an undeclared datum is not a rare failure, it is the normal state of a
     * spec, and the only way it stops being normal is if the declaration is
     * unconditional.
     */
    | 'DATUM_DECLARED'
    /** Knee clearance applied, with its evidence level and any lower-bound caveat. */
    | 'SEATING_OVERHANG';
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
