/**
 * normalizeOperations.ts - Operation Normalization for Deterministic Output
 *
 * Sorts and groups operations for optimal toolpath and deterministic G-code.
 *
 * @version 1.0.0 - Phase D2
 */

import type { Operation, DrillOperation, BoreOperation } from '../operation/operationTypes';

// ============================================================================
// Types
// ============================================================================

export interface NormalizeOptions {
  /** Preserve original order (skip normalization) */
  preserveOrder?: boolean;

  /** Group by tool first to minimize tool changes */
  groupByTool?: boolean;

  /** Use nearest-neighbor sorting within tool groups */
  optimizePath?: boolean;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Normalize operations for deterministic, optimized G-code output.
 *
 * Default strategy:
 * 1. Group by toolId (minimize tool changes)
 * 2. Within each tool group, sort by position (Y then X)
 * 3. This ensures deterministic output for same input
 *
 * @param ops - Operations to normalize
 * @param options - Normalization options
 * @returns Normalized operations array
 */
export function normalizeOperations(
  ops: Operation[],
  options: NormalizeOptions = {}
): Operation[] {
  const { preserveOrder = false, groupByTool = true, optimizePath = false } = options;

  // Return copy in original order if requested
  if (preserveOrder) {
    return [...ops];
  }

  // Group operations by tool
  const byTool = groupOperationsByTool(ops);

  // Sort tool groups by tool ID for determinism
  const sortedToolIds = Object.keys(byTool).sort();

  // Build result array
  const result: Operation[] = [];

  for (const toolId of sortedToolIds) {
    const toolOps = byTool[toolId];

    if (optimizePath) {
      // Nearest-neighbor optimization within tool group
      result.push(...sortByNearestNeighbor(toolOps));
    } else {
      // Simple deterministic sort: type -> depth -> Y -> X
      result.push(...sortDeterministic(toolOps));
    }
  }

  return result;
}

// ============================================================================
// Grouping Functions
// ============================================================================

/**
 * Group operations by tool ID.
 */
export function groupOperationsByTool(ops: Operation[]): Record<string, Operation[]> {
  const groups: Record<string, Operation[]> = {};

  for (const op of ops) {
    const toolId = op.toolId;
    if (!groups[toolId]) {
      groups[toolId] = [];
    }
    groups[toolId].push(op);
  }

  return groups;
}

/**
 * Get unique tool IDs in order of first appearance.
 */
export function getToolOrder(ops: Operation[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];

  for (const op of ops) {
    if (!seen.has(op.toolId)) {
      seen.add(op.toolId);
      order.push(op.toolId);
    }
  }

  return order;
}

/**
 * Count tool changes in operation sequence.
 */
export function countToolChanges(ops: Operation[]): number {
  if (ops.length === 0) return 0;

  let changes = 0;
  let currentTool = ops[0].toolId;

  for (let i = 1; i < ops.length; i++) {
    if (ops[i].toolId !== currentTool) {
      changes++;
      currentTool = ops[i].toolId;
    }
  }

  return changes;
}

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sort operations deterministically: type -> depth -> Y -> X.
 */
function sortDeterministic(ops: Operation[]): Operation[] {
  return [...ops].sort((a, b) => {
    // 1. Sort by type (DRILL before BORE)
    const typeOrder: Record<string, number> = { DRILL: 0, BORE: 1, POCKET: 2, PROFILE: 3, SLOT: 4 };
    const typeA = typeOrder[a.type] ?? 99;
    const typeB = typeOrder[b.type] ?? 99;
    if (typeA !== typeB) return typeA - typeB;

    // 2. Sort by depth (shallower first)
    const depthA = getOperationDepth(a);
    const depthB = getOperationDepth(b);
    if (depthA !== depthB) return depthA - depthB;

    // 3. Sort by Y position (front to back)
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;

    // 4. Sort by X position (left to right)
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;

    // 5. Final tiebreaker: ID
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sort operations using nearest-neighbor algorithm for path optimization.
 */
function sortByNearestNeighbor(ops: Operation[]): Operation[] {
  if (ops.length <= 1) return [...ops];

  const result: Operation[] = [];
  const remaining = new Set(ops);

  // Start with operation closest to origin
  let current = findClosestToOrigin(ops);
  result.push(current);
  remaining.delete(current);

  // Greedily select nearest unvisited operation
  while (remaining.size > 0) {
    const nearest = findNearestTo(current.position, Array.from(remaining));
    if (nearest) {
      result.push(nearest);
      remaining.delete(nearest);
      current = nearest;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Find operation closest to origin (0, 0, 0).
 */
function findClosestToOrigin(ops: Operation[]): Operation {
  let closest = ops[0];
  let minDist = distance2D(ops[0].position, { x: 0, y: 0 });

  for (const op of ops) {
    const dist = distance2D(op.position, { x: 0, y: 0 });
    if (dist < minDist) {
      minDist = dist;
      closest = op;
    }
  }

  return closest;
}

/**
 * Find operation nearest to a position.
 */
function findNearestTo(
  pos: { x: number; y: number },
  ops: Operation[]
): Operation | undefined {
  if (ops.length === 0) return undefined;

  let nearest = ops[0];
  let minDist = distance2D(pos, ops[0].position);

  for (const op of ops) {
    const dist = distance2D(pos, op.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = op;
    }
  }

  return nearest;
}

/**
 * Calculate 2D distance between points (XY plane).
 */
function distance2D(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get operation depth (for DRILL/BORE operations).
 */
function getOperationDepth(op: Operation): number {
  if (op.type === 'DRILL' || op.type === 'BORE') {
    return (op as DrillOperation | BoreOperation).depth;
  }
  return 0;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Calculate total travel distance for operation sequence.
 */
export function calculateTravelDistance(
  ops: Operation[],
  startPos: { x: number; y: number } = { x: 0, y: 0 }
): number {
  if (ops.length === 0) return 0;

  let total = distance2D(startPos, ops[0].position);

  for (let i = 1; i < ops.length; i++) {
    total += distance2D(ops[i - 1].position, ops[i].position);
  }

  return total;
}
