/**
 * mapMinifixToOps.ts - Map Minifix Connectors to CNC Operations
 *
 * Converts factory packet minifix pairs to machine-specific bore/drill operations.
 * Each minifix pair consists of:
 * - Cam housing (15mm bore, ~12mm deep)
 * - Bolt hole (5mm or 8mm drill)
 *
 * @version 1.0.0 - Phase D1
 */

import type { PacketConnectors, PacketMinifixPair } from '../../factory/packet/types';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getToolByDiameter } from '../machine/machineProfile';
import type { DrillOperation, BoreOperation, Operation } from '../operation/operationTypes';

// ============================================
// TYPES
// ============================================

export interface MapMinifixResult {
  /** Successfully mapped operations */
  operations: Operation[];
  /** Pairs that couldn't be fully mapped */
  unmappedPairs: PacketMinifixPair[];
  /** Warnings */
  warnings: string[];
}

export interface MapMinifixOptions {
  /** Skip pairs with ERROR status */
  skipErrorPairs?: boolean;
  /** Skip pairs with WARNING status */
  skipWarningPairs?: boolean;
}

const DEFAULT_OPTIONS: Required<MapMinifixOptions> = {
  skipErrorPairs: true,
  skipWarningPairs: false,
};

// ============================================
// CONSTANTS
// ============================================

/** Standard Minifix cam housing diameter */
const MINIFIX_CAM_DIAMETER = 15;

/** Standard Minifix bolt diameter */
const MINIFIX_BOLT_DIAMETER = 5;

// ============================================
// MAPPER
// ============================================

/**
 * Map minifix connector pairs to CNC operations
 *
 * @param connectors - Connectors data from verified packet
 * @param machine - Target machine profile
 * @param options - Mapping options
 * @returns Mapped operations with any unmapped pairs
 */
export function mapMinifixToOps(
  connectors: PacketConnectors,
  machine: MachineProfile,
  options: MapMinifixOptions = {}
): MapMinifixResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const operations: Operation[] = [];
  const unmappedPairs: PacketMinifixPair[] = [];
  const warnings: string[] = [];

  // Find required tools
  const boreTool = getToolByDiameter(machine, MINIFIX_CAM_DIAMETER, 'BORE');
  const drillTool = getToolByDiameter(machine, MINIFIX_BOLT_DIAMETER, 'DRILL');

  if (!boreTool) {
    warnings.push(`No ${MINIFIX_CAM_DIAMETER}mm bore tool available for Minifix cam housing`);
  }
  if (!drillTool) {
    warnings.push(`No ${MINIFIX_BOLT_DIAMETER}mm drill tool available for Minifix bolt`);
  }

  // If missing essential tools, return early
  if (!boreTool && !drillTool) {
    return {
      operations: [],
      unmappedPairs: connectors.minifix,
      warnings,
    };
  }

  for (const pair of connectors.minifix) {
    // Skip based on status
    if (opts.skipErrorPairs && pair.status === 'ERROR') {
      warnings.push(`Skipping error pair ${pair.id}: ${pair.issues?.join(', ')}`);
      unmappedPairs.push(pair);
      continue;
    }
    if (opts.skipWarningPairs && pair.status === 'WARNING') {
      warnings.push(`Skipping warning pair ${pair.id}: ${pair.issues?.join(', ')}`);
      unmappedPairs.push(pair);
      continue;
    }

    const pairOps = mapSinglePair(pair, boreTool, drillTool, warnings);
    if (pairOps.length > 0) {
      operations.push(...pairOps);
    } else {
      unmappedPairs.push(pair);
    }
  }

  return { operations, unmappedPairs, warnings };
}

/**
 * Map a single minifix pair to operations
 */
function mapSinglePair(
  pair: PacketMinifixPair,
  boreTool: ToolCapability | undefined,
  drillTool: ToolCapability | undefined,
  warnings: string[]
): Operation[] {
  const ops: Operation[] = [];

  // Cam housing (bore operation)
  if (boreTool) {
    const camOp = createCamBoreOperation(pair, boreTool);
    ops.push(camOp);

    // Check depth
    if (boreTool.maxDepth != null && pair.cam.depth > boreTool.maxDepth) {
      warnings.push(
        `Pair ${pair.id}: Cam depth ${pair.cam.depth}mm exceeds tool max ${boreTool.maxDepth}mm`
      );
    }
  } else {
    warnings.push(`Pair ${pair.id}: Cannot create cam operation - no bore tool`);
  }

  // Bolt hole (drill operation)
  if (drillTool) {
    const boltOp = createBoltDrillOperation(pair, drillTool);
    ops.push(boltOp);

    // Check depth
    if (drillTool.maxDepth != null && pair.bolt.depth > drillTool.maxDepth) {
      warnings.push(
        `Pair ${pair.id}: Bolt depth ${pair.bolt.depth}mm exceeds tool max ${drillTool.maxDepth}mm`
      );
    }
  } else {
    warnings.push(`Pair ${pair.id}: Cannot create bolt operation - no drill tool`);
  }

  return ops;
}

/**
 * Create bore operation for Minifix cam housing
 */
function createCamBoreOperation(
  pair: PacketMinifixPair,
  tool: ToolCapability
): BoreOperation {
  return {
    type: 'BORE',
    id: `minifix-cam-${pair.id}`,
    sourceId: pair.cam.pointId,
    toolId: tool.toolId,
    position: {
      x: pair.cam.position[0],
      y: pair.cam.position[1],
      z: pair.cam.position[2],
    },
    diameter: pair.cam.diameter ?? MINIFIX_CAM_DIAMETER,
    depth: pair.cam.depth,
    flatBottom: true, // Minifix cam needs flat bottom
    feedRate: tool.defaultFeedRate,
    comment: `Minifix cam housing (pair ${pair.id})`,
  };
}

/**
 * Create drill operation for Minifix bolt
 */
function createBoltDrillOperation(
  pair: PacketMinifixPair,
  tool: ToolCapability
): DrillOperation {
  return {
    type: 'DRILL',
    id: `minifix-bolt-${pair.id}`,
    sourceId: pair.bolt.pointId,
    toolId: tool.toolId,
    position: {
      x: pair.bolt.position[0],
      y: pair.bolt.position[1],
      z: pair.bolt.position[2],
    },
    depth: pair.bolt.depth,
    throughHole: false,
    feedRate: tool.defaultFeedRate,
    comment: `Minifix bolt hole (pair ${pair.id})`,
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Get statistics about mapped minifix operations
 */
export function getMinifixMapStats(result: MapMinifixResult): {
  totalPairs: number;
  camOps: number;
  boltOps: number;
  unmapped: number;
  warningCount: number;
} {
  const camOps = result.operations.filter((op) => op.id.includes('minifix-cam')).length;
  const boltOps = result.operations.filter((op) => op.id.includes('minifix-bolt')).length;

  return {
    totalPairs: Math.max(camOps, boltOps) + result.unmappedPairs.length,
    camOps,
    boltOps,
    unmapped: result.unmappedPairs.length,
    warningCount: result.warnings.length,
  };
}
