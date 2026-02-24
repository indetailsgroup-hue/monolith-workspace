/**
 * T027: Cut Optimization Algorithm — Domain Types
 *
 * Types for FFDH (First Fit Decreasing Height) sheet nesting.
 * Complements existing NestingSheet type in monolithExportContext.ts
 *
 * @version 2.0.0 - Phase 2: Grain direction constraints & rotation
 */

// ============================================
// GRAIN DIRECTION
// ============================================

/**
 * Grain direction of a part relative to its cut dimensions.
 *
 * - `'HORIZONTAL'` — grain runs parallel to the part's width (left-right)
 * - `'VERTICAL'`   — grain runs parallel to the part's height (top-bottom)
 * - `'NONE'`       — no grain constraint (MDF, plywood, etc.)
 *
 * When a part is rotated 90°, its grain direction relative to the sheet also
 * rotates. Parts with grain constraints can only be rotated if the resulting
 * grain direction remains valid for the material group.
 */
export type GrainDirection = 'HORIZONTAL' | 'VERTICAL' | 'NONE';

// ============================================
// INPUT TYPES
// ============================================

/**
 * A single part to be placed on a sheet.
 *
 * One CutListRow with qty > 1 expands into multiple NestingPart entries.
 */
export interface NestingPart {
  /** Unique identifier (e.g., "SIDE_L#1", "SIDE_L#2" for qty=2) */
  id: string;

  /** Original CutListRow partId (for traceability) */
  sourcePartId: string;

  /** Cabinet ID this part belongs to */
  cabinetId: string;

  /** Cut width in mm (from CutListRow.cutW) */
  width: number;

  /** Cut height in mm (from CutListRow.cutH) */
  height: number;

  /** Material ID (for grouping by material) */
  materialId: string;

  /**
   * Whether 90° rotation is allowed.
   *
   * When `grainDirection` is 'NONE', this is always `true`.
   * When `grainDirection` is 'HORIZONTAL' or 'VERTICAL', rotation is
   * allowed only if the result maintains a consistent grain direction
   * across the sheet — controlled by the algorithm.
   */
  canRotate: boolean;

  /**
   * Grain direction of this part's material.
   *
   * Controls rotation constraints and visual indicators.
   * Parts with grain='NONE' are freely rotatable.
   * Parts with grain='HORIZONTAL' or 'VERTICAL' may be restricted.
   */
  grainDirection: GrainDirection;
}

/**
 * Configuration for the nesting algorithm.
 */
export interface NestingConfig {
  /** Saw blade kerf width in mm (material removed per cut) */
  kerfWidth: number;

  /** Minimum edge clearance from sheet boundary in mm */
  edgeClearance: number;

  /** Sheet width in mm (shorter dimension, e.g., 1220) */
  sheetWidth: number;

  /** Sheet height in mm (longer dimension, e.g., 2440) */
  sheetHeight: number;

  /** Sheet thickness in mm */
  sheetThickness: number;
}

/** Default nesting configuration matching standard board stock */
export const DEFAULT_NESTING_CONFIG: NestingConfig = {
  kerfWidth: 3.5,
  edgeClearance: 10,
  sheetWidth: 1220,
  sheetHeight: 2440,
  sheetThickness: 18,
};

// ============================================
// ALGORITHM INTERNALS
// ============================================

/**
 * A single part placement on a sheet.
 */
export interface Placement {
  /** Part ID (matches NestingPart.id) */
  partId: string;

  /** X position from sheet left edge (mm) */
  x: number;

  /** Y position from sheet bottom edge (mm) */
  y: number;

  /** Rotation applied: 0 (original) or 90 (rotated) */
  rotation: 0 | 90;

  /** Original cut width before rotation */
  cutW: number;

  /** Original cut height before rotation */
  cutH: number;

  /**
   * Grain direction of the placed part.
   * When rotation=90, the visual grain indicator rotates accordingly:
   * - HORIZONTAL + rotation=0 → grain runs left-right on sheet
   * - HORIZONTAL + rotation=90 → grain runs top-bottom on sheet
   * - VERTICAL + rotation=0 → grain runs top-bottom on sheet
   * - VERTICAL + rotation=90 → grain runs left-right on sheet
   */
  grainDirection: GrainDirection;
}

/**
 * Internal shelf representation for FFDH algorithm.
 *
 * A shelf is a horizontal band across the sheet where parts are
 * placed left-to-right. New shelves stack bottom-to-top.
 */
export interface Shelf {
  /** Y position of shelf bottom edge (mm) */
  y: number;

  /** Shelf height = tallest part in this shelf (mm) */
  height: number;

  /** Current X cursor — next part will be placed here */
  currentX: number;

  /** Remaining usable width in this shelf (mm) */
  remainingWidth: number;
}

// ============================================
// OUTPUT TYPES
// ============================================

/**
 * Result for a single sheet.
 */
export interface SheetResult {
  /** Parts placed on this sheet */
  placements: Placement[];

  /** Usable area within edge clearance (mm²) */
  usableArea: number;

  /** Area consumed by placed parts (mm²) */
  usedArea: number;

  /** Utilization percentage (0–100) */
  utilization: number;
}

/**
 * Complete nesting result for one material group.
 */
export interface NestingResult {
  /** Material ID these results apply to */
  materialId: string;

  /** Number of sheets consumed */
  sheetsUsed: number;

  /** Per-sheet results */
  sheets: SheetResult[];

  /** Weighted-average utilization across all sheets (0–100) */
  overallUtilization: number;

  /** Total waste area across all sheets (mm²) */
  totalWaste: number;

  /** Computation time in milliseconds */
  computeTimeMs: number;

  /** Parts that could not be placed (too large for sheet) */
  unplacedParts: NestingPart[];
}
