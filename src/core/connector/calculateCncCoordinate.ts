/**
 * Connector OS v1.1 - CNC Coordinate Calculator
 *
 * Core function for computing deterministic drill coordinates
 * based on material stack and manufacturing mode.
 *
 * @see docs/connector-os/material-stack.md
 */

export interface Stack {
  core: number;      // Core board thickness (e.g. 18.0mm HMR)
  finished: number;  // Finished thickness including HPL (e.g. 19.6mm)
  pvc: number;       // Edge banding thickness (e.g. 1.0mm PVC)
}

export type ManufacturingMode = 'DRILL_ON_CORE' | 'DRILL_ON_FINISHED';

export interface CncCoordinate {
  u: number;  // U-axis: width / drilling distance B from JOIN_EDGE
  v: number;  // V-axis: depth / System 32 backset from FRONT_EDGE
  n: number;  // N-axis: center point within panel thickness
}

/**
 * Calculate CNC drill coordinates for a structural connector bore.
 *
 * N-axis (center): ALWAYS uses core thickness / 2 for structural integrity.
 * V-axis (depth):  Mode-dependent - compensates for PVC only in DRILL_ON_CORE mode.
 * U-axis (width):  Direct pass-through of drilling distance B.
 *
 * @param system32S - System 32 backset distance (typically 37mm from finished front)
 * @param distanceB - Drilling distance B from join edge
 * @param stack     - Material stack definition
 * @param mode      - Manufacturing mode (before or after edge banding)
 */
export function calculateCncCoordinate(
  system32S: number,
  distanceB: number,
  stack: Stack,
  mode: ManufacturingMode,
): CncCoordinate {
  return {
    u: distanceB,
    v: mode === 'DRILL_ON_CORE' ? system32S - stack.pvc : system32S,
    n: stack.core / 2,
  };
}

/**
 * Apply Target J10 transform: B = A - 25
 *
 * @param distanceA - Distance A on the side panel
 * @returns Distance B for the pinion hole on the mating panel
 */
export function targetJ10Transform(distanceA: number): number {
  return distanceA - 25;
}
