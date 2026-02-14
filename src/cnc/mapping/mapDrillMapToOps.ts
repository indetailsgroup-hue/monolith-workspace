/**
 * mapDrillMapToOps - v2.0 (Clean Rebuild)
 *
 * Converts DrillMap to CNC operations.
 * Maps DrillMapPoints to appropriate DrillOperation or BoreOperation based on:
 * - Diameter: small (<=8mm) -> DRILL, large (>8mm) -> BORE
 * - Purpose: HINGE, SHELF_PIN, DOWEL -> DRILL; CAM_LOCK, MINIFIX -> BORE
 *
 * @version 2.0.0 - Phase D1: Full implementation
 */

import type {
  DrillMap,
  DrillMapPanel,
  DrillMapPoint,
  DrillPurpose,
} from '../../core/manufacturing/drillMap/types';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getToolByDiameter } from '../machine/machineProfile';
import type {
  Operation,
  DrillOperation,
  BoreOperation,
  Position3D,
} from '../operation/operationTypes';
import type { WorkpieceTransformContext, OperationWorkpieceContext } from '../transform/workpieceTypes';
import { transformToMachine } from '../transform/transformPrimitives';

// ============================================
// TYPES
// ============================================

export interface MapDrillOptions {
  toolDiameter?: number;
  feedRate?: number;
  spindleSpeed?: number;
  /** Optional workpiece transform contexts keyed by panel ID */
  workpieceTransforms?: Map<string, WorkpieceTransformContext>;
  /** Whether to attach workpiece context to operations */
  attachWorkpieceContext?: boolean;
  /** Skip points with ERROR status */
  skipErrorPoints?: boolean;
  /** Skip points with WARNING status */
  skipWarningPoints?: boolean;
  /** Default peck depth for deep holes (mm) */
  defaultPeckDepth?: number;
}

export interface MapDrillResult {
  operations: Operation[];
  stats: {
    totalOps: number;
    drillOps: number;
    boreOps: number;
  };
  warnings?: string[];
  unmappedPoints?: DrillMapPoint[];
}

// ============================================
// CONSTANTS
// ============================================

/** Diameter threshold: <=8mm = DRILL, >8mm = BORE */
const DIAMETER_THRESHOLD = 8;

/** Standard hinge cup diameter (mm) */
const HINGE_CUP_DIAMETER = 35;

/** Standard cam lock diameter (mm) */
const CAM_LOCK_DIAMETER = 15;

/** Default peck depth for deep holes (mm) */
const DEFAULT_PECK_DEPTH = 10;

/** Depth threshold for peck drilling (mm) */
const PECK_DEPTH_THRESHOLD = 15;

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Map DrillMap to CNC operations
 *
 * @param drillMap - DrillMap containing panels with drill points
 * @param machine - Optional machine profile for tool selection
 * @param options - Mapping options
 * @returns MapDrillResult with operations, stats, warnings, and unmapped points
 */
export function mapDrillMapToOps(
  drillMap: DrillMap,
  machine?: MachineProfile,
  options?: MapDrillOptions
): MapDrillResult {
  const operations: Operation[] = [];
  const warnings: string[] = [];
  const unmappedPoints: DrillMapPoint[] = [];

  const opts: Required<MapDrillOptions> = {
    toolDiameter: options?.toolDiameter ?? 0,
    feedRate: options?.feedRate ?? 0,
    spindleSpeed: options?.spindleSpeed ?? 0,
    workpieceTransforms: options?.workpieceTransforms ?? new Map(),
    attachWorkpieceContext: options?.attachWorkpieceContext ?? false,
    skipErrorPoints: options?.skipErrorPoints ?? true,
    skipWarningPoints: options?.skipWarningPoints ?? false,
    defaultPeckDepth: options?.defaultPeckDepth ?? DEFAULT_PECK_DEPTH,
  };

  // Process each panel
  for (const panel of drillMap.panels) {
    const workpieceContext = opts.workpieceTransforms.get(panel.panelId);

    for (const point of panel.points) {
      // Skip based on status
      if (opts.skipErrorPoints && point.status === 'ERROR') {
        warnings.push(`Skipping error point ${point.id}: ${point.statusMessage ?? point.issues?.join(', ') ?? 'unknown error'}`);
        unmappedPoints.push(point);
        continue;
      }
      if (opts.skipWarningPoints && point.status === 'WARNING') {
        warnings.push(`Skipping warning point ${point.id}: ${point.statusMessage ?? point.issues?.join(', ') ?? 'unknown warning'}`);
        unmappedPoints.push(point);
        continue;
      }

      // Validate blind hole depth vs panel thickness
      if (!point.throughHole && panel.dimensions?.thickness && point.depth > panel.dimensions.thickness) {
        warnings.push(
          `Point ${point.id}: blind hole depth ${point.depth}mm exceeds panel thickness ${panel.dimensions.thickness}mm (panel: ${panel.panelId})`
        );
      }

      // Map point to operation
      const op = mapPointToOperation(point, panel, machine, opts, warnings);
      if (op) {
        // D4: Apply workpiece transform if context provided
        if (opts.attachWorkpieceContext && workpieceContext) {
          // Store original workpiece position
          const originalPosition = { ...op.position };

          // Transform from workpiece coordinates to machine coordinates
          const transformResult = transformToMachine(op.position, workpieceContext);

          // Apply transformed position
          op.position = transformResult.machinePosition;

          // Attach context with original position for audit trail
          op.workpieceContext = {
            ...transformResult.context,
            workpiecePosition: originalPosition,
          };
        }
        operations.push(op);
      } else {
        unmappedPoints.push(point);
        warnings.push(`Could not map point ${point.id} (purpose: ${point.purpose}, diameter: ${point.diameter}mm)`);
      }
    }
  }

  // Compute stats
  const stats = computeStats(operations);

  return {
    operations,
    stats,
    warnings: warnings.length > 0 ? warnings : undefined,
    unmappedPoints: unmappedPoints.length > 0 ? unmappedPoints : undefined,
  };
}

// ============================================
// POINT TO OPERATION MAPPING
// ============================================

/**
 * Map a single DrillMapPoint to an Operation
 */
function mapPointToOperation(
  point: DrillMapPoint,
  panel: DrillMapPanel,
  machine: MachineProfile | undefined,
  opts: Required<MapDrillOptions>,
  warnings: string[]
): Operation | null {
  // Determine operation type based on purpose and diameter
  switch (point.purpose) {
    case 'HINGE':
      return createHingeCupOp(point, panel, machine, opts, warnings);

    case 'SHELF_PIN':
    case 'DOWEL':
      return createDrillOp(point, panel, machine, opts, warnings);

    case 'CAM_LOCK':
    case 'MINIFIX':
      return createBoreOp(point, panel, machine, opts, warnings);

    case 'BOLT':
      // Bolt holes can be either drill or bore depending on diameter
      if (point.diameter > DIAMETER_THRESHOLD) {
        return createBoreOp(point, panel, machine, opts, warnings);
      } else {
        return createDrillOp(point, panel, machine, opts, warnings);
      }

    case 'OTHER':
    default:
      // Default: use diameter to determine operation type
      if (point.diameter > DIAMETER_THRESHOLD) {
        return createBoreOp(point, panel, machine, opts, warnings);
      } else {
        return createDrillOp(point, panel, machine, opts, warnings);
      }
  }
}

// ============================================
// OPERATION CREATORS
// ============================================

/**
 * Create a hinge cup boring operation (typically 35mm)
 */
function createHingeCupOp(
  point: DrillMapPoint,
  panel: DrillMapPanel,
  machine: MachineProfile | undefined,
  opts: Required<MapDrillOptions>,
  warnings: string[]
): BoreOperation | null {
  const diameter = point.diameter || HINGE_CUP_DIAMETER;
  const tool = findTool(machine, diameter, 'BORE', opts);

  if (!tool) {
    warnings.push(`No ${diameter}mm bore tool available for hinge cup at point ${point.id}`);
    // Still create operation with placeholder tool
  }

  const position = convertPosition(point.position);
  validateDepth(point, tool, warnings);

  return {
    type: 'BORE',
    id: `hinge-${point.id}`,
    sourceId: point.id,
    toolId: tool?.toolId ?? `bore-${diameter}mm`,
    position,
    diameter,
    depth: point.depth,
    flatBottom: true, // Hinge cups need flat bottom
    feedRate: opts.feedRate || tool?.defaultFeedRate,
    comment: `Hinge cup (panel: ${panel.panelId})`,
  };
}

/**
 * Create a drill operation for small holes
 */
function createDrillOp(
  point: DrillMapPoint,
  panel: DrillMapPanel,
  machine: MachineProfile | undefined,
  opts: Required<MapDrillOptions>,
  warnings: string[]
): DrillOperation | null {
  const diameter = opts.toolDiameter || point.diameter;
  const tool = findTool(machine, diameter, 'DRILL', opts);

  if (!tool) {
    warnings.push(`No ${diameter}mm drill tool available for point ${point.id}`);
  }

  const position = convertPosition(point.position);
  validateDepth(point, tool, warnings);

  // Determine if peck drilling is needed for deep holes
  const needsPeck = point.depth > PECK_DEPTH_THRESHOLD && (tool?.supportsPeck ?? true);

  return {
    type: 'DRILL',
    id: `drill-${point.id}`,
    sourceId: point.id,
    toolId: tool?.toolId ?? `drill-${diameter}mm`,
    position,
    depth: point.depth,
    throughHole: point.throughHole ?? false,
    peckDepth: needsPeck ? opts.defaultPeckDepth : undefined,
    feedRate: opts.feedRate || tool?.defaultFeedRate,
    comment: `${formatPurpose(point.purpose)} drill (panel: ${panel.panelId})`,
  };
}

/**
 * Create a bore operation for large holes
 */
function createBoreOp(
  point: DrillMapPoint,
  panel: DrillMapPanel,
  machine: MachineProfile | undefined,
  opts: Required<MapDrillOptions>,
  warnings: string[]
): BoreOperation | null {
  const diameter = point.diameter || CAM_LOCK_DIAMETER;
  const tool = findTool(machine, diameter, 'BORE', opts);

  if (!tool) {
    warnings.push(`No ${diameter}mm bore tool available for point ${point.id}`);
  }

  const position = convertPosition(point.position);
  validateDepth(point, tool, warnings);

  return {
    type: 'BORE',
    id: `bore-${point.id}`,
    sourceId: point.id,
    toolId: tool?.toolId ?? `bore-${diameter}mm`,
    position,
    diameter,
    depth: point.depth,
    flatBottom: point.purpose === 'CAM_LOCK' || point.purpose === 'MINIFIX' || point.purpose === 'BOLT',
    feedRate: opts.feedRate || tool?.defaultFeedRate,
    comment: `${formatPurpose(point.purpose)} bore (panel: ${panel.panelId})`,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find appropriate tool from machine profile
 */
function findTool(
  machine: MachineProfile | undefined,
  diameter: number,
  type: 'DRILL' | 'BORE',
  opts: Required<MapDrillOptions>
): ToolCapability | undefined {
  if (!machine) return undefined;

  // First try exact match
  let tool = getToolByDiameter(machine, diameter, type);

  // If no exact match for BORE, try with just the diameter
  if (!tool && type === 'BORE') {
    tool = getToolByDiameter(machine, diameter);
  }

  return tool;
}

/**
 * Convert Vec3Tuple position to Position3D
 */
function convertPosition(position: [number, number, number]): Position3D {
  return {
    x: position[0],
    y: position[1],
    z: position[2],
  };
}

/**
 * Validate depth against tool capability
 */
function validateDepth(
  point: DrillMapPoint,
  tool: ToolCapability | undefined,
  warnings: string[]
): void {
  if (tool && tool.maxDepth !== undefined && point.depth > tool.maxDepth) {
    warnings.push(
      `Point ${point.id}: depth ${point.depth}mm exceeds tool max ${tool.maxDepth}mm`
    );
  }
}

/**
 * Format purpose for human-readable comments
 */
function formatPurpose(purpose: DrillPurpose): string {
  const map: Record<DrillPurpose, string> = {
    CAM_LOCK: 'Cam lock',
    BOLT: 'Bolt',
    DOWEL: 'Dowel',
    SHELF_PIN: 'Shelf pin',
    HINGE: 'Hinge',
    MINIFIX: 'Minifix',
    DRAWER_SLIDE: 'Drawer slide',
    OTHER: 'General',
  };
  return map[purpose] ?? 'Unknown';
}

/**
 * Compute statistics for mapped operations
 */
function computeStats(operations: Operation[]): MapDrillResult['stats'] {
  let drillOps = 0;
  let boreOps = 0;

  for (const op of operations) {
    if (op.type === 'DRILL') {
      drillOps++;
    } else if (op.type === 'BORE') {
      boreOps++;
    }
  }

  return {
    totalOps: operations.length,
    drillOps,
    boreOps,
  };
}

/**
 * Get drill map statistics (convenience export)
 */
export function getDrillMapStats(drillMap: DrillMap) {
  return drillMap.stats;
}
