/**
 * mapMinifixToOps.ts - Map Minifix Connectors to CNC Operations
 *
 * Converts factory packet minifix pairs to machine-specific bore/drill operations.
 * Each minifix pair consists of:
 * - Cam housing (15mm bore, ~12mm deep)
 * - Bolt hole (5mm or 8mm drill)
 *
 * @version 1.0.0 - Phase D1
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CRITICAL: This is the CNC MANUFACTURING DOMAIN (O_panel)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This mapper operates EXCLUSIVELY in the CNC manufacturing domain.
 * It reads validated packet data (PacketMinifixPair) containing:
 *
 * - pair.cam.diameter  → Actual bore diameter (15mm standard)
 * - pair.cam.depth     → Actual bore depth (per wood thickness)
 * - pair.bolt.diameter → Implicit from drillTool selection
 * - pair.bolt.depth    → Actual pilot hole depth
 *
 * ⚠️ THIS MAPPER DOES NOT USE ASSEMBLY PREVIEW DATA!
 * ─────────────────────────────────────────────────────────────────────────────
 * The MinifixConfigPanel.tsx shows visual assembly preview (ball head, sleeve,
 * shaft dimensions) for designer verification. Those dimensions are IRRELEVANT
 * to CNC operations.
 *
 * CNC operations use ONLY:
 * 1. Validated PacketMinifixPair from factory packet
 * 2. Machine profile tool capabilities
 * 3. Standard Minifix catalog drilling specs
 *
 * The distinction matters because:
 * - Assembly preview shows "how it looks assembled"
 * - CNC spec defines "what holes to drill"
 * - A designer might adjust preview visuals without affecting manufacturing
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { PacketConnectors, PacketMinifixPair } from '../../factory/packet/types';
import type { MachineProfile, ToolCapability } from '../machine/machineProfile';
import { getToolByDiameter } from '../machine/machineProfile';
import type { DrillOperation, BoreOperation, Operation } from '../operation/operationTypes';
import type { OperationWorkpieceContext } from '../transform/workpieceTypes';

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

/**
 * Diameter threshold: <=8mm = DRILL, >8mm = BORE.
 * MUST match mapDrillMapToOps so the same physical hole maps to the SAME
 * operation spec from both packet sources (drillmap.json + connectors.json).
 * buildOperationGraph dedupes only spec-equal duplicates (ADR-065) — a spec
 * mismatch between the two sources is a blocking conflict, not a dedupe.
 */
const DIAMETER_THRESHOLD = 8;

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

    const pairOps = mapSinglePair(pair, machine, warnings);
    if (pairOps.length > 0) {
      operations.push(...pairOps);
    } else {
      unmappedPairs.push(pair);
    }
  }

  return { operations, unmappedPairs, warnings };
}

/**
 * Find a tool for a connector hole.
 * Mirrors mapDrillMapToOps.findTool: exact (diameter, type) match first,
 * then for BORE fall back to any tool with the right diameter.
 * Spec parity between the two mappers is what lets buildOperationGraph
 * recognize drillmap-vs-connector re-descriptions as the SAME operation.
 */
function findConnectorTool(
  machine: MachineProfile,
  diameter: number,
  type: 'DRILL' | 'BORE'
): ToolCapability | undefined {
  let tool = getToolByDiameter(machine, diameter, type);
  if (!tool && type === 'BORE') {
    tool = getToolByDiameter(machine, diameter);
  }
  return tool;
}

/**
 * Workpiece context for a connector operation.
 * ADR-065: panel identity MUST travel with the operation — the dedupe key and
 * the per-panel DXF split are both scoped by workpieceContext.panelId.
 */
function connectorWorkpieceContext(panelId: string): OperationWorkpieceContext {
  return {
    panelId,
    face: 'TOP',
    appliedOffset: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Map a single minifix pair to operations
 */
function mapSinglePair(
  pair: PacketMinifixPair,
  machine: MachineProfile,
  warnings: string[]
): Operation[] {
  const ops: Operation[] = [];

  // Cam housing (bore operation)
  const camDiameter = pair.cam.diameter ?? MINIFIX_CAM_DIAMETER;
  const boreTool = findConnectorTool(machine, camDiameter, 'BORE');
  if (boreTool) {
    const camOp = createCamBoreOperation(pair, boreTool, camDiameter);
    ops.push(camOp);

    // Check depth
    if (boreTool.maxDepth != null && pair.cam.depth > boreTool.maxDepth) {
      warnings.push(
        `Pair ${pair.id}: Cam depth ${pair.cam.depth}mm exceeds tool max ${boreTool.maxDepth}mm`
      );
    }
  } else {
    warnings.push(`Pair ${pair.id}: Cannot create cam operation - no ${camDiameter}mm bore tool`);
  }

  // Bolt hole — DRILL vs BORE by diameter, same rule as mapDrillMapToOps
  const boltDiameter = pair.bolt.diameter ?? MINIFIX_BOLT_DIAMETER;
  const boltType = boltDiameter > DIAMETER_THRESHOLD ? 'BORE' : 'DRILL';
  const boltTool = findConnectorTool(machine, boltDiameter, boltType);
  if (boltTool) {
    const boltOp =
      boltType === 'BORE'
        ? createBoltBoreOperation(pair, boltTool, boltDiameter)
        : createBoltDrillOperation(pair, boltTool);
    ops.push(boltOp);

    // Check depth
    if (boltTool.maxDepth != null && pair.bolt.depth > boltTool.maxDepth) {
      warnings.push(
        `Pair ${pair.id}: Bolt depth ${pair.bolt.depth}mm exceeds tool max ${boltTool.maxDepth}mm`
      );
    }
  } else {
    warnings.push(
      `Pair ${pair.id}: Cannot create bolt operation - no ${boltDiameter}mm ${boltType.toLowerCase()} tool`
    );
  }

  return ops;
}

/**
 * Create bore operation for Minifix cam housing
 */
function createCamBoreOperation(
  pair: PacketMinifixPair,
  tool: ToolCapability,
  diameter: number
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
    diameter,
    depth: pair.cam.depth,
    flatBottom: true, // Minifix cam needs flat bottom
    feedRate: tool.defaultFeedRate,
    comment: `Minifix cam housing (pair ${pair.id})`,
    workpieceContext: connectorWorkpieceContext(pair.cam.panelId),
  };
}

/**
 * Create drill operation for Minifix bolt (small pilot, <=8mm)
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
    workpieceContext: connectorWorkpieceContext(pair.bolt.panelId),
  };
}

/**
 * Create bore operation for a large Minifix bolt sleeve (>8mm).
 * Mirrors mapDrillMapToOps (BOLT purpose, diameter > threshold → BORE).
 */
function createBoltBoreOperation(
  pair: PacketMinifixPair,
  tool: ToolCapability,
  diameter: number
): BoreOperation {
  return {
    type: 'BORE',
    id: `minifix-bolt-${pair.id}`,
    sourceId: pair.bolt.pointId,
    toolId: tool.toolId,
    position: {
      x: pair.bolt.position[0],
      y: pair.bolt.position[1],
      z: pair.bolt.position[2],
    },
    diameter,
    depth: pair.bolt.depth,
    flatBottom: true, // same as mapDrillMapToOps BOLT purpose
    feedRate: tool.defaultFeedRate,
    comment: `Minifix bolt hole (pair ${pair.id})`,
    workpieceContext: connectorWorkpieceContext(pair.bolt.panelId),
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
