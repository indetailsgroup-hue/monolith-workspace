/**
 * Dowel Types — Configuration, drilling params, and preview state
 *
 * Häfele standard wooden dowel specifications:
 * - Ø8×30mm standard (Häfele 262.00.xxx series)
 * - Ø6×30mm for thinner panels (< 16mm)
 * - Ø10×40mm for heavy-duty applications
 *
 * Placement: System 32 grid, endOffset = 37mm from panel front edge.
 * Construction: Side-covers-Top (European standard)
 * - Side panel: FACE bore (into inner face)
 * - Horizontal panel: EDGE bore (into end grain)
 *
 * @version 1.0.0
 */

// ============================================================================
// Dowel Config (Manufacturing truth — used by compiler)
// ============================================================================

/**
 * Manufacturing config for dowel connectors.
 * All measurements in mm per Häfele catalog.
 */
export interface DowelConfig {
  /** Dowel diameter — Ø8mm standard (Häfele 262.00.xxx) */
  dowelDia: number;

  /** Total dowel length — 30mm standard (split between face + edge bore) */
  dowelLength: number;

  /** Depth into SIDE panel inner face (FACE_BORE) — 12mm standard */
  depthFaceBore: number;

  /** Depth into HORIZONTAL panel end grain (EDGE_BORE) — 18mm standard */
  depthEdgeBore: number;

  /** Distance from panel front edge to first dowel (System 32) — 37mm */
  endOffset: number;

  /** System 32 pitch between dowels — 32mm */
  pitch: number;

  /** Wood thickness of target panels — 18mm default */
  woodThickness: number;

  /**
   * Minimum dowel count policy by joint length:
   * - ≤ 457mm (18"): 3 dowels
   * - ≤ 610mm (24"): 4 dowels
   * - ≤ 914mm (36"): 5 dowels
   * - > 914mm: 6 dowels
   *
   * null = auto (fill based on available space)
   */
  minDowelCount: number | null;
}

/** Default DowelConfig — Häfele Ø8×30 standard for 18mm wood */
export const DEFAULT_DOWEL_CONFIG: DowelConfig = {
  dowelDia: 8,
  dowelLength: 30,
  depthFaceBore: 12,
  depthEdgeBore: 18,
  endOffset: 37,
  pitch: 32,
  woodThickness: 18,
  minDowelCount: null,
};

// ============================================================================
// Dowel Drilling Params (User-adjustable at drill time)
// ============================================================================

/**
 * User-adjustable drilling parameters for dowel placement.
 * Separate from DowelConfig to allow per-job tweaks without changing hardware spec.
 */
export interface DowelDrillingParams {
  /** First dowel Z position from panel front edge (default: 37mm = endOffset) */
  firstHoleZ: number;

  /** Distance from mating edge to dowel center (default: half of wood thickness) */
  edgeDistance: number;
}

/** Default DowelDrillingParams */
export const DEFAULT_DOWEL_DRILLING_PARAMS: DowelDrillingParams = {
  firstHoleZ: 37,
  edgeDistance: 9, // 18mm / 2 = 9mm (center of panel thickness)
};

// ============================================================================
// Dowel Preview State (UI-only — never reaches compiler)
// ============================================================================

/**
 * Preview-only fields for the Dowel editor 3D view.
 * These affect ONLY the visual preview in the hardware editor modal.
 * They must NEVER leak into manufacturing config or CNC compiler.
 */
export interface DowelPreviewState {
  flipVertical: boolean;
  flipHorizontal: boolean;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  moveX: number;
  moveY: number;
  moveZ: number;
}

/** Keys that must be stripped before sending config to compiler */
export const DOWEL_PREVIEW_ONLY_KEYS: readonly (keyof DowelPreviewState)[] = [
  'flipVertical',
  'flipHorizontal',
  'rotationX',
  'rotationY',
  'rotationZ',
  'moveX',
  'moveY',
  'moveZ',
] as const;

/** Default preview state — all transforms zeroed */
export const DEFAULT_DOWEL_PREVIEW_STATE: DowelPreviewState = {
  flipVertical: false,
  flipHorizontal: false,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  moveX: 0,
  moveY: 0,
  moveZ: 0,
};
