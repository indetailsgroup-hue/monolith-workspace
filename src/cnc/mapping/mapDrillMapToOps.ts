/**
 * mapDrillMapToOps.ts - Map DrillMap to CNC Operations
 *
 * Converts factory packet drill map to machine-specific drill operations.
 *
 * @version 1.1.0 - Phase D4.1: Added workpiece transform support
 */

import type { PacketDrillMap, PacketDrillPoint, PacketDrillPanel } from '../../factory/packet/types';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getToolByDiameter } from '../machine/machineProfile';
import type { DrillOperation, BoreOperation, Operation, Position3D } from '../operation/operationTypes';
import type {
  WorkpieceTransformContext,
  OperationWorkpieceContext,
  PanelFace,
} from '../transform/workpieceTypes';
import {
  transformToMachine,
  createIdentityContext,
} from '../transform';

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
  /**
   * Workpiece transform contexts per panel.
   * Key is panelId, value is the transform context.
   * If not provided, positions are used as-is (identity transform).
   * @since D4.1
   */
  workpieceTransforms?: Map<string, WorkpieceTransformContext>;
  /**
   * Whether to attach workpiece context to operations.
   * Default: true if workpieceTransforms is provided, false otherwise.
   * @since D4.1
   */
  attachWorkpieceContext?: boolean;
}

const DEFAULT_OPTIONS: Omit<Required<MapDrillOptions>, 'workpieceTransforms' | 'attachWorkpieceContext'> = {
  usePeckDrilling: true,
  peckDepthRatio: 1.5,
  diameterTolerance: 0.5,
};

/**
 * Internal point with panel context attached
 */
interface PointWithPanelContext {
  point: PacketDrillPoint;
  panelId: string;
  panelDimensions: [number, number, number];
}

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
  const { workpieceTransforms } = options;
  const attachContext = options.attachWorkpieceContext ?? (workpieceTransforms !== undefined);

  const operations: Operation[] = [];
  const unmappedPoints: PacketDrillPoint[] = [];
  const warnings: string[] = [];

  // Process each panel with its context
  for (const panel of drillMap.panels) {
    // Get transform context for this panel (or create identity)
    const transformContext = workpieceTransforms?.get(panel.panelId)
      ?? createIdentityContextForPanel(panel);

    for (const point of panel.points) {
      const pointWithContext: PointWithPanelContext = {
        point,
        panelId: panel.panelId,
        panelDimensions: panel.dimensions,
      };

      const result = mapSinglePoint(
        pointWithContext,
        machine,
        opts,
        warnings,
        transformContext,
        attachContext
      );

      if (result) {
        operations.push(result);
      } else {
        unmappedPoints.push(point);
      }
    }
  }

  return { operations, unmappedPoints, warnings };
}

/**
 * Create identity transform context for a panel (no transformation).
 */
function createIdentityContextForPanel(panel: PacketDrillPanel): WorkpieceTransformContext {
  return {
    panelId: panel.panelId,
    frame: {
      datum: 'FRONT_LEFT',
      face: 'TOP',
      dimensions: {
        length: panel.dimensions[0],
        width: panel.dimensions[1],
        thickness: panel.dimensions[2],
      },
    },
    placement: {
      offset: { x: 0, y: 0, z: 0 },
      rotationZ: 0,
    },
  };
}

/**
 * Map a single drill point to an operation
 */
function mapSinglePoint(
  pointCtx: PointWithPanelContext,
  machine: MachineProfile,
  opts: Omit<Required<MapDrillOptions>, 'workpieceTransforms' | 'attachWorkpieceContext'>,
  warnings: string[],
  transformContext: WorkpieceTransformContext,
  attachContext: boolean
): Operation | null {
  const { point, panelId } = pointCtx;

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

  // Transform position from workpiece to machine coordinates
  const workpiecePos: Position3D = {
    x: point.position[0],
    y: point.position[1],
    z: point.position[2],
  };

  const transformResult = transformToMachine(workpiecePos, transformContext);
  const machinePos = transformResult.machinePosition;

  // Build workpiece context for operation (if attaching)
  const workpieceContext: OperationWorkpieceContext | undefined = attachContext
    ? {
        panelId,
        face: transformContext.frame.face,
        appliedOffset: transformContext.placement.offset,
      }
    : undefined;

  // Create operation
  if (isBore) {
    return createBoreOperation(point, tool, machinePos, workpieceContext);
  } else {
    return createDrillOperation(point, tool, opts, machinePos, workpieceContext);
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
): ToolCapability | undefined {
  const candidates = machine.tools.filter(
    (t) =>
      t.type === type &&
      Math.abs(t.diameter - diameter) <= tolerance
  );

  if (candidates.length === 0) return undefined;

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
  opts: Omit<Required<MapDrillOptions>, 'workpieceTransforms' | 'attachWorkpieceContext'>,
  machinePos: Position3D,
  workpieceContext?: OperationWorkpieceContext
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
    position: machinePos,
    depth: point.depth,
    peckDepth,
    throughHole: point.throughHole,
    feedRate: tool.defaultFeedRate,
    comment: `${point.purpose} - ${point.face}`,
    workpieceContext,
  };
}

/**
 * Create a bore operation from a drill point
 */
function createBoreOperation(
  point: PacketDrillPoint,
  tool: ToolCapability,
  machinePos: Position3D,
  workpieceContext?: OperationWorkpieceContext
): BoreOperation {
  return {
    type: 'BORE',
    id: `bore-${point.id}`,
    sourceId: point.id,
    toolId: tool.toolId,
    position: machinePos,
    diameter: point.diameter,
    depth: point.depth,
    flatBottom: true, // Minifix cam housing needs flat bottom
    feedRate: tool.defaultFeedRate,
    comment: `${point.purpose} - ${point.face}`,
    workpieceContext,
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
