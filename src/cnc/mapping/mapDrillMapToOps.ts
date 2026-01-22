/**
 * mapDrillMapToOps.ts - Map DrillMap to CNC Operations
 *
 * Converts factory packet drill map to machine-specific drill operations.
 *
 * @version 1.0.0 - Phase D1
 */

import type { PacketDrillMap, PacketDrillPoint } from '../../factory/packet/types';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getToolByDiameter } from '../machine/machineProfile';
import type { DrillOperation, BoreOperation, Operation } from '../operation/operationTypes';

// ============================================
// TYPES
// ============================================

export interface MapDrillResult {
  /** Successfully mapped operations */
  operations: Operation[];
  /** Points that couldn't be mapped (no suitable tool) */
  unmappedPoints: PacketDrillPoint[];
  /** Warnings (e.g., tool substitution) */
  warnings: string[];
}

export interface MapDrillOptions {
  /** Use peck drilling for deep holes */
  usePeckDrilling?: boolean;
  /** Peck depth as fraction of tool diameter (default: 1.5) */
  peckDepthRatio?: number;
  /** Allow tool diameter substitution within tolerance (mm) */
  diameterTolerance?: number;
}

const DEFAULT_OPTIONS: Required<MapDrillOptions> = {
  usePeckDrilling: true,
  peckDepthRatio: 1.5,
  diameterTolerance: 0.5,
};

// ============================================
// MAPPER
// ============================================

/**
 * Map drill map points to CNC drill/bore operations
 *
 * @param drillMap - Drill map from verified packet
 * @param machine - Target machine profile
 * @param options - Mapping options
 * @returns Mapped operations with any unmapped points
 */
export function mapDrillMapToOps(
  drillMap: PacketDrillMap,
  machine: MachineProfile,
  options: MapDrillOptions = {}
): MapDrillResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const operations: Operation[] = [];
  const unmappedPoints: PacketDrillPoint[] = [];
  const warnings: string[] = [];

  // Flatten all drill points from all panels
  const allPoints: PacketDrillPoint[] = drillMap.panels.flatMap((panel) => panel.points);

  for (const point of allPoints) {
    const result = mapSinglePoint(point, machine, opts, warnings);
    if (result) {
      operations.push(result);
    } else {
      unmappedPoints.push(point);
    }
  }

  return { operations, unmappedPoints, warnings };
}

/**
 * Map a single drill point to an operation
 */
function mapSinglePoint(
  point: PacketDrillPoint,
  machine: MachineProfile,
  opts: Required<MapDrillOptions>,
  warnings: string[]
): Operation | null {
  // Determine if this is a bore (large diameter) or drill
  const isBore = point.diameter >= 15;
  const toolType = isBore ? 'BORE' : 'DRILL';

  // Find matching tool
  let tool = getToolByDiameter(machine, point.diameter, toolType);

  // If no exact match, try within tolerance
  if (!tool && opts.diameterTolerance > 0) {
    tool = findToolWithinTolerance(machine, point.diameter, toolType, opts.diameterTolerance);
    if (tool) {
      warnings.push(
        `Point ${point.id}: Using ${tool.toolId} (${tool.diameter}mm) for requested ${point.diameter}mm`
      );
    }
  }

  if (!tool) {
    warnings.push(
      `Point ${point.id}: No suitable ${toolType} tool for diameter ${point.diameter}mm`
    );
    return null;
  }

  // Check depth
  if (point.depth > tool.maxDepth) {
    warnings.push(
      `Point ${point.id}: Depth ${point.depth}mm exceeds tool max depth ${tool.maxDepth}mm`
    );
    // Still create the operation but flag it
  }

  // Create operation
  if (isBore) {
    return createBoreOperation(point, tool);
  } else {
    return createDrillOperation(point, tool, opts);
  }
}

/**
 * Find a tool within diameter tolerance
 */
function findToolWithinTolerance(
  machine: MachineProfile,
  diameter: number,
  type: 'DRILL' | 'BORE',
  tolerance: number
): ToolCapability | null {
  const candidates = machine.tools.filter(
    (t) =>
      t.type === type &&
      Math.abs(t.diameter - diameter) <= tolerance
  );

  if (candidates.length === 0) return null;

  // Prefer larger tool if within tolerance (safer)
  candidates.sort((a, b) => {
    const aDiff = a.diameter - diameter;
    const bDiff = b.diameter - diameter;
    // Prefer positive difference (larger), then smaller absolute difference
    if (aDiff >= 0 && bDiff < 0) return -1;
    if (aDiff < 0 && bDiff >= 0) return 1;
    return Math.abs(aDiff) - Math.abs(bDiff);
  });

  return candidates[0];
}

/**
 * Create a drill operation from a drill point
 */
function createDrillOperation(
  point: PacketDrillPoint,
  tool: ToolCapability,
  opts: Required<MapDrillOptions>
): DrillOperation {
  // Calculate peck depth for deep holes
  const needsPeck = opts.usePeckDrilling &&
    tool.supportsPeck &&
    point.depth > tool.diameter * opts.peckDepthRatio;

  const peckDepth = needsPeck
    ? Math.round(tool.diameter * opts.peckDepthRatio * 10) / 10
    : undefined;

  return {
    type: 'DRILL',
    id: `drill-${point.id}`,
    sourceId: point.id,
    toolId: tool.toolId,
    position: {
      x: point.position[0],
      y: point.position[1],
      z: point.position[2],
    },
    depth: point.depth,
    peckDepth,
    throughHole: point.throughHole,
    feedRate: tool.defaultFeedRate,
    comment: `${point.purpose} - ${point.face}`,
  };
}

/**
 * Create a bore operation from a drill point
 */
function createBoreOperation(
  point: PacketDrillPoint,
  tool: ToolCapability
): BoreOperation {
  return {
    type: 'BORE',
    id: `bore-${point.id}`,
    sourceId: point.id,
    toolId: tool.toolId,
    position: {
      x: point.position[0],
      y: point.position[1],
      z: point.position[2],
    },
    diameter: point.diameter,
    depth: point.depth,
    flatBottom: true, // Minifix cam housing needs flat bottom
    feedRate: tool.defaultFeedRate,
    comment: `${point.purpose} - ${point.face}`,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Get statistics about mapped operations
 */
export function getDrillMapStats(result: MapDrillResult): {
  totalPoints: number;
  drillOps: number;
  boreOps: number;
  unmapped: number;
  warningCount: number;
} {
  const drillOps = result.operations.filter((op) => op.type === 'DRILL').length;
  const boreOps = result.operations.filter((op) => op.type === 'BORE').length;

  return {
    totalPoints: drillOps + boreOps + result.unmappedPoints.length,
    drillOps,
    boreOps,
    unmapped: result.unmappedPoints.length,
    warningCount: result.warnings.length,
  };
}
