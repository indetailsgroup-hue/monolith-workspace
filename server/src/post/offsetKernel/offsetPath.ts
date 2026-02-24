/**
 * Closed Path Offset
 *
 * Step 10.5.6: Offset closed paths using analytic joins.
 *
 * Features:
 * - Preserves LINE and ARC segment types
 * - Uses analytic joins (L-L, L-A, A-L, A-A intersections)
 * - Deterministic fallback for edge cases
 */

import type { Path, SegLine, SegArc, Segment } from '../planTypes.js';
import { dist, TOLERANCE } from './geom.js';
import {
  type OffsetMode,
  type OffsetSegment,
  offsetSegment,
  segStart,
  segEnd,
  setSegStart,
  setSegEnd,
} from './offsetPrimitives.js';
import { join } from './joinSolver.js';

// ============================================================================
// Types
// ============================================================================

export interface OffsetPathResult {
  /** Whether offset was successful */
  success: boolean;
  /** Offset path (if successful) */
  path?: Path;
  /** Warnings during offset (non-fatal issues) */
  warnings: string[];
  /** Errors (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Closed Path Offset
// ============================================================================

/**
 * Offset a closed path using analytic joins.
 *
 * @param path - Closed path to offset
 * @param d - Offset distance (positive)
 * @param mode - INSET (toward interior) or OUTSET (away from interior)
 * @returns Offset result
 */
export function offsetClosedPath(
  path: Path,
  d: number,
  mode: OffsetMode
): OffsetPathResult {
  const warnings: string[] = [];

  // Validation
  if (!path.closed) {
    return {
      success: false,
      warnings,
      error: 'Path must be closed',
    };
  }

  if (path.segs.length < 2) {
    return {
      success: false,
      warnings,
      error: 'Path must have at least 2 segments',
    };
  }

  if (d < TOLERANCE) {
    // Zero offset - return copy of original
    return {
      success: true,
      path: { ...path, segs: [...path.segs] },
      warnings,
    };
  }

  // Step 1: Offset each segment independently
  const offsets: OffsetSegment[] = [];

  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i] as SegLine | SegArc;
    const result = offsetSegment(seg, path.winding, mode, d);

    if (!result) {
      // Arc collapsed - try to handle gracefully
      warnings.push(`segment-${i}:arc-collapsed`);

      // Fallback: create a LINE from start to end of original arc
      if (seg.kind === 'ARC') {
        const fallbackLine: SegLine = {
          kind: 'LINE',
          a: seg.start,
          b: seg.end,
        };
        const lineOffset = offsetSegment(fallbackLine, path.winding, mode, d);
        if (lineOffset) {
          offsets.push(lineOffset);
          continue;
        }
      }

      return {
        success: false,
        warnings,
        error: `Failed to offset segment ${i}`,
      };
    }

    offsets.push(result);
  }

  // Step 2: Join consecutive segments using analytic solver
  const connectors: (SegLine | null)[] = [];
  let joinFailures = 0;

  for (let i = 0; i < offsets.length; i++) {
    const prev = offsets[i];
    const next = offsets[(i + 1) % offsets.length];

    // Get original vertex as preference point
    const originalVertex = segEnd(path.segs[i] as SegLine | SegArc);

    const joinResult = join(prev, next, originalVertex);

    // Update segment endpoints
    setSegEnd(prev.seg, joinResult.aEnd);
    setSegStart(next.seg, joinResult.bStart);

    if (!joinResult.ok) {
      joinFailures++;
      warnings.push(`join-${i}:${joinResult.reason || 'failed'}`);

      if (joinResult.connector) {
        connectors.push(joinResult.connector);
      } else {
        connectors.push(null);
      }
    } else {
      connectors.push(null);
    }
  }

  // Step 3: Build final segment list
  const finalSegs: Segment[] = [];

  for (let i = 0; i < offsets.length; i++) {
    finalSegs.push(offsets[i].seg);

    const connector = connectors[i];
    if (connector && dist(connector.a, connector.b) > TOLERANCE) {
      // Only add connector if it has non-zero length
      finalSegs.push(connector);
    }
  }

  // Step 4: Ensure closure
  if (finalSegs.length > 0) {
    const firstStart = segStart(finalSegs[0] as SegLine | SegArc);
    const lastEnd = segEnd(finalSegs[finalSegs.length - 1] as SegLine | SegArc);

    if (dist(firstStart, lastEnd) > TOLERANCE) {
      // Add closing connector
      finalSegs.push({
        kind: 'LINE',
        a: lastEnd,
        b: firstStart,
      } as SegLine);
      warnings.push('added-closing-connector');
    }
  }

  // Report join statistics
  if (joinFailures > 0) {
    warnings.push(`join-failures:${joinFailures}/${offsets.length}`);
  }

  return {
    success: true,
    path: {
      closed: true,
      segs: finalSegs,
      winding: path.winding,
    },
    warnings,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Inset a closed path (shrink toward interior).
 */
export function insetClosedPath(
  path: Path,
  d: number
): OffsetPathResult {
  return offsetClosedPath(path, d, 'INSET');
}

/**
 * Outset a closed path (expand toward exterior).
 */
export function outsetClosedPath(
  path: Path,
  d: number
): OffsetPathResult {
  return offsetClosedPath(path, d, 'OUTSET');
}

/**
 * Create roughing offset for finishing pass.
 *
 * For profile cuts:
 * - Outside cut: rough with OUTSET, finish at original
 * - Inside cut (pocket): rough with INSET, finish at original
 */
export function roughingOffset(
  path: Path,
  finishAllowance: number,
  outsideCut: boolean = true
): OffsetPathResult {
  const mode: OffsetMode = outsideCut ? 'OUTSET' : 'INSET';
  return offsetClosedPath(path, finishAllowance, mode);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a path can be offset with the kernel.
 */
export function canOffsetWithKernel(path: Path): boolean {
  if (!path.closed) return false;
  if (path.segs.length < 2) return false;

  // Check for valid segment types
  for (const seg of path.segs) {
    if (seg.kind !== 'LINE' && seg.kind !== 'ARC') {
      return false;
    }
  }

  return true;
}

/**
 * Estimate maximum safe inset distance.
 * Beyond this, arcs may collapse or path may self-intersect.
 */
export function estimateMaxInset(path: Path): number {
  if (!path.closed) return 0;

  let minFeature = Infinity;

  // Check arc radii
  for (const seg of path.segs) {
    if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      minFeature = Math.min(minFeature, arc.r);
    }
  }

  // A safe inset is typically less than the minimum arc radius
  // and less than half the minimum "neck width" of the path
  // For MVP, use 90% of minimum arc radius as conservative limit

  if (minFeature === Infinity) {
    // No arcs - check line segment widths
    // This would require more complex analysis
    return 50; // Default safe limit
  }

  return minFeature * 0.9;
}

/**
 * Validate offset result quality.
 */
export function validateOffsetResult(
  result: OffsetPathResult
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!result.success || !result.path) {
    return { valid: false, issues: ['offset-failed'] };
  }

  const path = result.path;

  // Check for degenerate segments
  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i] as SegLine | SegArc;
    const start = segStart(seg);
    const end = segEnd(seg);

    if (dist(start, end) < TOLERANCE) {
      issues.push(`segment-${i}:degenerate`);
    }
  }

  // Check for large gaps (connector segments added)
  if (result.warnings.some((w) => w.includes('connector'))) {
    issues.push('has-connector-segments');
  }

  // Check join failure rate
  const joinFailureMatch = result.warnings.find((w) => w.startsWith('join-failures:'));
  if (joinFailureMatch) {
    const [count, total] = joinFailureMatch.split(':')[1].split('/').map(Number);
    if (count / total > 0.2) {
      issues.push('high-join-failure-rate');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
