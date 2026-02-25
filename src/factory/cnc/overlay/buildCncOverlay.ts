/**
 * buildCncOverlay.ts - Build CNC Overlay from OperationGraph
 *
 * Converts OperationGraph operations to overlay points for 3D visualization.
 * Uses the same OperationGraph + policy chain that generates G-code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ TRUST CHAIN: This builder uses the SAME data path as G-code generation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Data Flow:
 * 1. OperationGraph (from buildOperationGraph)
 * 2. decideDrillParams (D5 policy) for cycle/feed/rpm
 * 3. CncOverlayPoint with full traceability
 *
 * This ensures what you SEE in the overlay matches what gets CUT on the machine.
 *
 * @version 1.0.0 - Phase D4.x
 */

import type { OperationGraph, Operation } from '../../../cnc/operation/operationTypes';
import { isDrillOperation, isBoreOperation } from '../../../cnc/operation/operationTypes';
import type { MachineProfile } from '../../../cnc/machine/machineProfile';
import { decideDrillParams, type DecideDrillParamsInput } from '../../../cnc/post/decideDrillParams';
import type { CncPolicyOptions } from '../../../cnc/post/types';
import { classifyHoleKind } from '../../../cnc/policy/drillPolicyTypes';
import type { CncOverlayPoint, CncOverlayBuildResult } from './cncOverlayTypes';
import { calculateOverlayStats } from './cncOverlayTypes';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for building CNC overlay.
 */
export interface BuildCncOverlayOptions {
  /** Machine profile for tool lookup */
  machine: MachineProfile;
  /** Policy options (same as used for G-code) */
  policyOptions?: CncPolicyOptions;
  /** Include only DRILL/BORE operations (default: true) */
  drillBoreOnly?: boolean;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build CNC overlay points from an OperationGraph.
 *
 * Uses the same policy chain as G-code generation to ensure
 * visual representation matches manufacturing output.
 *
 * @param graph - OperationGraph from buildOperationGraph
 * @param options - Build options
 * @returns Overlay build result with points and stats
 */
export function buildCncOverlay(
  graph: OperationGraph,
  options: BuildCncOverlayOptions
): CncOverlayBuildResult {
  const { machine, policyOptions, drillBoreOnly = true } = options;
  const points: CncOverlayPoint[] = [];

  for (const op of graph.operations) {
    // Filter to drill/bore if requested
    if (drillBoreOnly && !isDrillOperation(op) && !isBoreOperation(op)) {
      continue;
    }

    // Only process DRILL and BORE operations
    if (!isDrillOperation(op) && !isBoreOperation(op)) {
      continue;
    }

    const point = buildOverlayPoint(op, machine, policyOptions);
    if (point) {
      points.push(point);
    }
  }

  // Calculate stats
  const stats = calculateOverlayStats(points);

  // Generate content hash for cache invalidation
  const contentHash = generateContentHash(points, graph.metadata.sourceContentHash);

  return {
    points,
    stats,
    jobId: graph.metadata.jobId,
    machineId: graph.machineId,
    builtAt: new Date().toISOString(),
    contentHash,
  };
}

// ============================================================================
// POINT BUILDER
// ============================================================================

/**
 * Build a single overlay point from an operation.
 *
 * Uses decideDrillParams to get the same policy decisions
 * that will be used during G-code generation.
 */
function buildOverlayPoint(
  op: Operation,
  machine: MachineProfile,
  policyOptions?: CncPolicyOptions
): CncOverlayPoint | null {
  // Build input for policy decision
  const input: DecideDrillParamsInput = {
    op,
    machine,
    policyOptions,
  };

  // Get policy decision (same as G-code generation)
  const decision = decideDrillParams(input);

  // Determine diameter
  const diameter = isBoreOperation(op) ? op.diameter : decision.holeSpec.diameter;

  // Determine depth
  const depth = isDrillOperation(op) || isBoreOperation(op) ? op.depth : 0;

  // Get workpiece context
  const ctx = op.workpieceContext;
  const panelId = ctx?.panelId ?? 'unknown';
  const face = ctx?.face ?? 'TOP';

  // Classify hole kind
  const holeKind = classifyHoleKind({
    diameter,
    depth,
    panelThickness: decision.throughHole.panelThicknessMm,
    throughHole: decision.throughHole.isThroughHole,
  });

  // Build label
  const label = buildPointLabel(op, diameter, depth, decision.params.cycle);

  // D4.2: Forward DrillMap visualization metadata for preview transforms
  const dm = ctx?.drillmap;
  const preview = dm
    ? {
        key: dm.pointId,
        anchor: dm.anchor ?? { ...op.position },
        normal: dm.normal,
        edgeSide: dm.edgeSide,
        face6: dm.face6,
        pairId: dm.pairId,
        cornerType: dm.cornerType,
      }
    : undefined;

  return {
    id: op.id,
    type: op.type as 'DRILL' | 'BORE',
    position: { ...op.position },
    diameter,
    depth,
    face,
    panelId,
    cycle: decision.params.cycle,
    holeKind,
    feedRate: decision.params.feedRate,
    rpm: decision.params.rpm,
    throughHole: decision.throughHole.isThroughHole,
    label,
    comment: op.comment,
    peckDepth: decision.params.peckDepth,
    dwellTime: decision.params.dwellTime,
    preview,
  };
}

/**
 * Build human-readable label for tooltip.
 */
function buildPointLabel(
  op: Operation,
  diameter: number,
  depth: number,
  cycle: string
): string {
  const typeLabel = op.type === 'BORE' ? 'Bore' : 'Drill';
  return `${typeLabel} Ø${diameter}mm × ${depth}mm (${cycle})`;
}

// ============================================================================
// HASH GENERATION
// ============================================================================

/**
 * Generate content hash for cache invalidation.
 *
 * Uses a simple hash combining source hash and point count/positions.
 * This ensures overlay updates when operations change.
 */
function generateContentHash(points: CncOverlayPoint[], sourceHash: string): string {
  // Combine source hash with overlay-specific data
  const pointSummary = points
    .map((p) => `${p.id}:${p.position.x},${p.position.y},${p.position.z}`)
    .join('|');

  // Simple hash (for production, use SHA-256)
  let hash = 0;
  const combined = `${sourceHash}|${points.length}|${pointSummary}`;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `overlay-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if an overlay build result is empty.
 */
export function isOverlayEmpty(result: CncOverlayBuildResult): boolean {
  return result.points.length === 0;
}

/**
 * Get overlay points for a specific panel.
 */
export function getPointsByPanel(
  result: CncOverlayBuildResult,
  panelId: string
): CncOverlayPoint[] {
  return result.points.filter((p) => p.panelId === panelId);
}

/**
 * Get through-hole points only.
 */
export function getThroughHolePoints(
  result: CncOverlayBuildResult
): CncOverlayPoint[] {
  return result.points.filter((p) => p.throughHole);
}

/**
 * Get points requiring peck drilling (G83).
 */
export function getPeckDrillPoints(
  result: CncOverlayBuildResult
): CncOverlayPoint[] {
  return result.points.filter((p) => p.cycle === 'G83');
}

/**
 * Get points requiring dwell (G82).
 */
export function getDwellPoints(
  result: CncOverlayBuildResult
): CncOverlayPoint[] {
  return result.points.filter((p) => p.cycle === 'G82');
}
