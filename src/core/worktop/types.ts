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
  /** Projection past the carcass front face, mm. */
  readonly frontOverhang: number;
  /** Projection past the carcass back face, mm. 0 = wall-abutting. */
  readonly backOverhang: number;
  /** Projection past an exposed run end, mm. */
  readonly endOverhang: number;
  /** Max slab length obtainable from one blank, mm. */
  readonly maxBlankLength: number;
  readonly coreMaterialId: string;
  readonly surfaceMaterialId: string;
  readonly edgeMaterialId: string;
}

/**
 * Wall-abutting default. Materials are all existing catalog entries with
 * already-sourced Thai-market figures — nothing here is a placeholder price.
 * maxBlankLength 2440 = the 2450mm SHEET_PB_MDF_HMR sheet minus 10mm trim.
 */
export const DEFAULT_WORKTOP_CONFIG: WorktopConfig = {
  frontOverhang: 20,
  backOverhang: 0,
  endOverhang: 0,
  maxBlankLength: 2440,
  coreMaterialId: 'core-pb-35',
  surfaceMaterialId: 'surf-mel-white',
  edgeMaterialId: 'edge-pvc-white-20',
};

/**
 * Island variant: no wall behind, so the back edge overhangs and is exposed.
 * Kept as a named config rather than a geometric guess because "is there a
 * wall here" is not derivable from cabinet placements alone.
 */
export const ISLAND_WORKTOP_CONFIG: WorktopConfig = {
  ...DEFAULT_WORKTOP_CONFIG,
  backOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
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
