/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix to CNC Operations Compiler
 *
 * Converts MinifixPlacement objects into panel-local CNC drill operations
 */

import {
  MinifixPlacement,
  MinifixDrillOp,
  PanelDrillOps,
  Vec3,
} from "../../../contracts/minifixJointContracts";
import { MinifixTopologyApi, PanelBounds } from "./resolveMinifixPlacement";

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate Transformation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform world coordinates to panel local coordinates
 * Panel local coordinates have origin at panel min corner
 * X = width, Y = height, Z = depth
 */
function worldToLocal(worldPos: Vec3, panelBounds: PanelBounds): Vec3 {
  return [
    worldPos[0] - panelBounds.min[0],
    worldPos[1] - panelBounds.min[1],
    worldPos[2] - panelBounds.min[2],
  ];
}

/**
 * Transform direction vector from world to panel local
 * For axis-aligned panels, this is typically identity or sign flip
 */
function worldToLocalDir(worldDir: Vec3, _panelBounds: PanelBounds): Vec3 {
  // For axis-aligned panels, directions stay the same
  // If panels can be rotated, this needs a proper rotation matrix
  return worldDir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation Compilation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile CAM housing drill operation
 */
function compileCamOp(
  placement: MinifixPlacement,
  panelBounds: PanelBounds
): MinifixDrillOp {
  const { cam } = placement;

  return {
    kind: "MINIFIX_DRILL_OP",
    type: "CAM_HOUSING",
    panelId: cam.face.panelId,
    origin: worldToLocal(cam.origin, panelBounds),
    axis: worldToLocalDir(cam.axis, panelBounds),
    diameter: cam.spec.camDiameter,
    depth: cam.spec.camDepth,
    rotationDeg: cam.rotationDeg,
    sourcePlacement: placement,
  };
}

/**
 * Compile BOLT hole drill operation
 */
function compileBoltOp(
  placement: MinifixPlacement,
  panelBounds: PanelBounds
): MinifixDrillOp {
  const { bolt } = placement;

  return {
    kind: "MINIFIX_DRILL_OP",
    type: "BOLT_HOLE",
    panelId: bolt.edge!.panelId,
    origin: worldToLocal(bolt.origin, panelBounds),
    axis: worldToLocalDir(bolt.axis, panelBounds),
    diameter: bolt.spec.boltDiameter,
    depth: bolt.spec.boltDepth,
    sourcePlacement: placement,
  };
}

/**
 * Compile a single MinifixPlacement into drill operations
 */
export function compileMinifixToOps(
  placement: MinifixPlacement,
  api: MinifixTopologyApi
): MinifixDrillOp[] {
  const ops: MinifixDrillOp[] = [];

  // Guard: bolt.edge must be defined for compilation
  if (!placement.bolt.edge) {
    console.warn("Bolt edge is undefined, cannot compile Minifix placement");
    return ops;
  }

  // Get panel bounds for coordinate transformation
  const camPanelBounds = api.getPanelBounds(placement.cam.face.panelId);
  const boltPanelBounds = api.getPanelBounds(placement.bolt.edge.panelId);

  if (!camPanelBounds || !boltPanelBounds) {
    console.warn("Could not get panel bounds for Minifix compilation");
    return ops;
  }

  // Compile CAM operation (on horizontal panel)
  ops.push(compileCamOp(placement, camPanelBounds));

  // Compile BOLT operation (on vertical panel)
  ops.push(compileBoltOp(placement, boltPanelBounds));

  return ops;
}

/**
 * Compile multiple placements into panel-grouped operations
 */
export function compileAllMinifixToOps(
  placements: MinifixPlacement[],
  api: MinifixTopologyApi
): PanelDrillOps[] {
  // Collect all operations
  const allOps: MinifixDrillOp[] = [];
  for (const placement of placements) {
    allOps.push(...compileMinifixToOps(placement, api));
  }

  // Group by panel ID
  const byPanel = new Map<string, MinifixDrillOp[]>();
  for (const op of allOps) {
    const existing = byPanel.get(op.panelId) ?? [];
    existing.push(op);
    byPanel.set(op.panelId, existing);
  }

  // Convert to array
  const result: PanelDrillOps[] = [];
  for (const [panelId, operations] of byPanel.entries()) {
    result.push({ panelId, operations });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// G-Code Generation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format drill operation as G-code comment (for debugging/documentation)
 */
export function opToGCodeComment(op: MinifixDrillOp): string {
  const type = op.type === "CAM_HOUSING" ? "CAM" : "BOLT";
  return `; ${type} D${op.diameter} H${op.depth} @ (${op.origin.map((v) => v.toFixed(1)).join(", ")})`;
}

/**
 * Generate drill cycle parameters for a Minifix operation
 * Returns parameters suitable for G81 (drill) or G82 (spot drill with dwell)
 */
export interface DrillCycleParams {
  x: number;
  y: number;
  z: number;
  depth: number;
  feedRate: number;
  spindleSpeed: number;
}

export function getDrillCycleParams(
  op: MinifixDrillOp,
  options: {
    feedRatePerMm?: number;
    spindleSpeedBase?: number;
  } = {}
): DrillCycleParams {
  const { feedRatePerMm = 100, spindleSpeedBase = 3000 } = options;

  // Adjust feed rate based on hole diameter
  const feedRate = feedRatePerMm * Math.sqrt(op.diameter / 10);

  // Adjust spindle speed based on material (could be parameterized)
  const spindleSpeed = spindleSpeedBase;

  return {
    x: op.origin[0],
    y: op.origin[2], // Swap Y/Z for typical CNC orientation
    z: op.origin[1],
    depth: op.depth,
    feedRate,
    spindleSpeed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation Sorting and Optimization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort operations for efficient machining
 * Groups by tool (diameter), then optimizes path
 */
export function sortOperationsForMachining(ops: MinifixDrillOp[]): MinifixDrillOp[] {
  // Group by diameter (tool changes are expensive)
  const byDiameter = new Map<number, MinifixDrillOp[]>();
  for (const op of ops) {
    const existing = byDiameter.get(op.diameter) ?? [];
    existing.push(op);
    byDiameter.set(op.diameter, existing);
  }

  // Sort diameters (smaller first for pilot holes)
  const sortedDiameters = Array.from(byDiameter.keys()).sort((a, b) => a - b);

  // For each diameter group, sort by position (simple nearest-neighbor)
  const result: MinifixDrillOp[] = [];

  for (const diameter of sortedDiameters) {
    const group = byDiameter.get(diameter)!;

    // Sort by X then Z for simple path optimization
    group.sort((a, b) => {
      const dx = a.origin[0] - b.origin[0];
      if (Math.abs(dx) > 1) return dx;
      return a.origin[2] - b.origin[2];
    });

    result.push(...group);
  }

  return result;
}

/**
 * Estimate machining time for operations (in seconds)
 */
export function estimateMachiningTime(
  ops: MinifixDrillOp[],
  options: {
    rapidSpeed?: number; // mm/s for rapid moves
    drillSpeed?: number; // mm/s average drilling speed
    toolChangeTime?: number; // seconds per tool change
  } = {}
): number {
  const { rapidSpeed = 100, drillSpeed = 5, toolChangeTime = 30 } = options;

  let totalTime = 0;
  let lastPos: Vec3 | null = null;
  let lastDiameter: number | null = null;

  for (const op of ops) {
    // Tool change time
    if (lastDiameter !== null && lastDiameter !== op.diameter) {
      totalTime += toolChangeTime;
    }
    lastDiameter = op.diameter;

    // Rapid move time
    if (lastPos) {
      const dx = op.origin[0] - lastPos[0];
      const dy = op.origin[1] - lastPos[1];
      const dz = op.origin[2] - lastPos[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      totalTime += distance / rapidSpeed;
    }
    lastPos = op.origin;

    // Drilling time (down and up)
    totalTime += (op.depth * 2) / drillSpeed;
  }

  return totalTime;
}
