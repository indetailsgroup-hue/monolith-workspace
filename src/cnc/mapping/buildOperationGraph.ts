/**
 * buildOperationGraph.ts - Main Entry for Building Operation Graphs
 *
 * Combines all mappers to create a complete OperationGraph
 * from a verified factory packet.
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This function requires a ValidatedFactoryPacket - a branded type that
 * can only be created by:
 * - assertValidatedPacket() - For external/untrusted packets
 * - markPacketAsValidated() - For internally-built packets
 *
 * @version 1.1.0 - G9 Persistence Boundary
 */

import type { FactoryPacket } from '../../factory/packet/types';
import type { ValidatedFactoryPacket } from '../../core/gate/brandTypes';
import type { MachineProfile } from '../machine/machineProfile';
import type {
  Operation,
  OperationGraph,
  OperationGraphMetadata,
} from '../operation/operationTypes';
import { getToolsUsed } from '../operation/operationTypes';
import { mapDrillMapToOps, type MapDrillOptions } from './mapDrillMapToOps';
import { mapMinifixToOps, type MapMinifixOptions } from './mapMinifixToOps';

// ============================================
// TYPES
// ============================================

export interface BuildOperationGraphResult {
  /** The built operation graph */
  graph: OperationGraph;
  /** Build warnings */
  warnings: string[];
  /** Build errors (if any) */
  errors: string[];
  /** Statistics */
  stats: BuildStats;
}

export interface BuildStats {
  totalOperations: number;
  drillOperations: number;
  boreOperations: number;
  unmappedDrillPoints: number;
  unmappedMinifixPairs: number;
  toolsUsed: string[];
  /** D4: Number of operations with positions outside machine axis limits */
  outOfBoundsCount: number;
}

export interface BuildOperationGraphOptions {
  /** Drill map mapping options */
  drillMapOptions?: MapDrillOptions;
  /** Minifix mapping options */
  minifixOptions?: MapMinifixOptions;
  /** Tool version string */
  toolVersion?: string;
}

const DEFAULT_TOOL_VERSION = 'monolith-cnc@1.0.0';

// ============================================
// MAIN BUILDER
// ============================================

/**
 * Build an OperationGraph from a validated factory packet.
 *
 * GATE RULE (G9): This function requires ValidatedFactoryPacket.
 *
 * To obtain a ValidatedFactoryPacket:
 * - External source: `assertValidatedPacket(packet, 'source')`
 * - Internal build: `markPacketAsValidated(packet)`
 *
 * @param packet - G9-validated factory packet (branded type)
 * @param machine - Target machine profile
 * @param options - Build options
 * @returns Build result with graph, warnings, and stats
 *
 * @throws G9ViolationError if packet structure is invalid at runtime
 *
 * @example
 * ```typescript
 * // External packet - must validate
 * const validated = assertValidatedPacket(rawPacket, 'import');
 * const result = buildOperationGraph(validated, machine);
 *
 * // Internal build - mark as validated
 * const { packet } = await buildFactoryPacket(input, context);
 * const validated = markPacketAsValidated(packet);
 * const result = buildOperationGraph(validated, machine);
 * ```
 */
export function buildOperationGraph(
  packet: ValidatedFactoryPacket,
  machine: MachineProfile,
  options: BuildOperationGraphOptions = {}
): BuildOperationGraphResult {
  // G9 RUNTIME ASSERTION: Defense in depth
  // Even with compile-time branded type, verify at runtime
  if (!packet || typeof packet !== 'object' || !packet.manifest) {
    throw new Error('[MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH] Invalid packet structure at runtime');
  }
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate packet has required data
  if (!packet.drillMap) {
    errors.push('Packet missing drillMap data');
  }
  if (!packet.connectors) {
    errors.push('Packet missing connectors data');
  }

  // Map drill points
  // Note: PacketDrillMap is compatible with DrillMap for operation mapping purposes
  const drillResult = packet.drillMap
    ? mapDrillMapToOps(packet.drillMap as unknown as import('../../core/manufacturing/drillMap/types').DrillMap, machine, options.drillMapOptions)
    : { operations: [], unmappedPoints: [], warnings: [] };
  warnings.push(...(drillResult.warnings ?? []));

  // Map minifix connectors
  const minifixResult = packet.connectors
    ? mapMinifixToOps(packet.connectors, machine, options.minifixOptions)
    : { operations: [], unmappedPairs: [], warnings: [] };
  warnings.push(...minifixResult.warnings);

  // Combine operations
  const allOperations = [...drillResult.operations, ...minifixResult.operations];

  // Sort operations for efficient toolpath
  const sortedOperations = sortOperationsForEfficiency(allOperations, machine);

  // D4: Validate operation positions against machine axis limits
  const boundsResult = validateOperationBounds(sortedOperations, machine);
  warnings.push(...boundsResult.warnings);

  // Build metadata
  const metadata: OperationGraphMetadata = {
    jobId: packet.manifest.jobId,
    sourceContentHash: packet.manifest.contentHash,
    builtAt: new Date().toISOString(),
    toolVersion: options.toolVersion || DEFAULT_TOOL_VERSION,
  };

  // Build the graph
  const graph: OperationGraph = {
    machineId: machine.id,
    safeZ: machine.defaultSafeZ,
    rapidZ: machine.defaultSafeZ + 10, // 10mm above safe Z
    operations: sortedOperations,
    metadata,
    toolsUsed: getToolsUsed(sortedOperations),
    estimatedTimeSeconds: estimateRunTime(sortedOperations, machine),
  };

  // Collect stats
  const stats: BuildStats = {
    totalOperations: allOperations.length,
    drillOperations: drillResult.operations.filter((op) => op.type === 'DRILL').length,
    boreOperations: drillResult.operations.filter((op) => op.type === 'BORE').length +
      minifixResult.operations.filter((op) => op.type === 'BORE').length,
    unmappedDrillPoints: (drillResult.unmappedPoints ?? []).length,
    unmappedMinifixPairs: minifixResult.unmappedPairs.length,
    toolsUsed: graph.toolsUsed,
    outOfBoundsCount: boundsResult.outOfBoundsCount,
  };

  return { graph, warnings, errors, stats };
}

// ============================================
// BOUNDS VALIDATION (D4)
// ============================================

interface BoundsValidationResult {
  warnings: string[];
  outOfBoundsCount: number;
}

/**
 * D4: Validate all operation positions are within machine axis limits.
 * Returns warnings for out-of-bounds positions.
 */
function validateOperationBounds(
  operations: Operation[],
  machine: MachineProfile
): BoundsValidationResult {
  const warnings: string[] = [];
  let outOfBoundsCount = 0;

  for (const op of operations) {
    const { x, y, z } = op.position;
    const axis = machine.axis;
    if (!axis) continue;
    const violations: string[] = [];

    // Check X axis
    if (x < axis.x.min || x > axis.x.max) {
      violations.push(`X=${x.toFixed(1)} outside [${axis.x.min}, ${axis.x.max}]`);
    }

    // Check Y axis
    if (y < axis.y.min || y > axis.y.max) {
      violations.push(`Y=${y.toFixed(1)} outside [${axis.y.min}, ${axis.y.max}]`);
    }

    // Check Z axis
    if (z < axis.z.min || z > axis.z.max) {
      violations.push(`Z=${z.toFixed(1)} outside [${axis.z.min}, ${axis.z.max}]`);
    }

    if (violations.length > 0) {
      outOfBoundsCount++;
      warnings.push(`Op ${op.id}: position out of bounds - ${violations.join(', ')}`);
    }
  }

  return { warnings, outOfBoundsCount };
}

// ============================================
// OPERATION SORTING
// ============================================

/**
 * Sort operations for efficient machining:
 * 1. Group by tool (minimize tool changes)
 * 2. Within tool group, sort by proximity (shortest path)
 */
function sortOperationsForEfficiency(
  operations: Operation[],
  _machine: MachineProfile
): Operation[] {
  if (operations.length <= 1) return operations;

  // Group by tool
  const byTool = new Map<string, Operation[]>();
  for (const op of operations) {
    const existing = byTool.get(op.toolId) || [];
    existing.push(op);
    byTool.set(op.toolId, existing);
  }

  // Sort groups by largest first (minimize travel after big groups)
  const sortedGroups = Array.from(byTool.entries())
    .sort((a, b) => b[1].length - a[1].length);

  // Within each group, sort by nearest neighbor
  const result: Operation[] = [];
  let currentPos = { x: 0, y: 0 };

  for (const [_toolId, group] of sortedGroups) {
    const sortedGroup = sortByNearestNeighbor(group, currentPos);
    result.push(...sortedGroup);

    // Update current position to last operation
    if (sortedGroup.length > 0) {
      const last = sortedGroup[sortedGroup.length - 1];
      currentPos = { x: last.position.x, y: last.position.y };
    }
  }

  return result;
}

/**
 * Simple nearest neighbor sort
 */
function sortByNearestNeighbor(
  operations: Operation[],
  startPos: { x: number; y: number }
): Operation[] {
  if (operations.length <= 1) return [...operations];

  const result: Operation[] = [];
  const remaining = [...operations];
  let current = startPos;

  while (remaining.length > 0) {
    // Find nearest
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const op = remaining[i];
      const dist = Math.hypot(op.position.x - current.x, op.position.y - current.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    result.push(nearest);
    current = { x: nearest.position.x, y: nearest.position.y };
  }

  return result;
}

// ============================================
// TIME ESTIMATION
// ============================================

/**
 * Estimate total run time in seconds
 * This is a rough estimate based on operation count and average speeds
 */
function estimateRunTime(operations: Operation[], machine: MachineProfile): number {
  if (operations.length === 0) return 0;

  let totalSeconds = 0;
  const defaultFeedRate = 2000; // mm/min fallback

  for (const op of operations) {
    const feedRate = op.feedRate || defaultFeedRate;

    switch (op.type) {
      case 'DRILL': {
        // Time = (depth * 2) / feedRate + retract time
        const drillTime = (op.depth * 2) / feedRate * 60; // seconds
        const peckTime = op.peckDepth ? (op.depth / op.peckDepth) * 0.5 : 0;
        totalSeconds += drillTime + peckTime + 1; // +1s for positioning
        break;
      }
      case 'BORE': {
        // Time = depth / feedRate + retract
        const boreTime = (op.depth * 2) / feedRate * 60;
        totalSeconds += boreTime + 1.5; // +1.5s for larger positioning
        break;
      }
      default:
        totalSeconds += 2; // Default 2s per unknown operation
    }
  }

  // Add tool change time (5s per change)
  const toolsUsed = getToolsUsed(operations);
  totalSeconds += (toolsUsed.length - 1) * 5;

  // Add machine startup/warmup (30s)
  totalSeconds += 30;

  return Math.round(totalSeconds);
}

// ============================================
// HELPERS
// ============================================

/**
 * Check if a build result has errors
 */
export function hasBuildErrors(result: BuildOperationGraphResult): boolean {
  return result.errors.length > 0;
}

/**
 * Check if a build result has unmapped items
 */
export function hasUnmappedItems(result: BuildOperationGraphResult): boolean {
  return result.stats.unmappedDrillPoints > 0 || result.stats.unmappedMinifixPairs > 0;
}

/**
 * Format build result for logging
 */
export function formatBuildResult(result: BuildOperationGraphResult): string {
  const lines: string[] = [];

  lines.push(`Operation Graph Build Result`);
  lines.push(`─`.repeat(40));
  lines.push(`Machine: ${result.graph.machineId}`);
  lines.push(`Operations: ${result.stats.totalOperations}`);
  lines.push(`  - Drill: ${result.stats.drillOperations}`);
  lines.push(`  - Bore: ${result.stats.boreOperations}`);
  lines.push(`Tools: ${result.stats.toolsUsed.join(', ')}`);
  lines.push(`Est. Time: ${Math.round(result.graph.estimatedTimeSeconds! / 60)} min`);

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 5)) {
      lines.push(`  ⚠ ${w}`);
    }
    if (result.warnings.length > 5) {
      lines.push(`  ... and ${result.warnings.length - 5} more`);
    }
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors) {
      lines.push(`  ✗ ${e}`);
    }
  }

  return lines.join('\n');
}
