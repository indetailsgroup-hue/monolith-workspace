/**
 * Open Path Offset
 *
 * Step 10.5.6: Offset open paths (e.g., tab subpaths) with caps.
 * Step 10.5.7: Added true round caps (stroke-style with semicircle ends).
 *
 * Cap styles:
 * - BUTT: No cap, ends cut off perpendicular (safest)
 * - ROUND: Semicircle cap at ends (smoother entry/exit)
 * - ROUND_TRUE: Full stroke outline with true semicircle caps (Step 10.5.7)
 * - SQUARE: Extended perpendicular cap
 */

import type { Path, SegLine, SegArc, Segment } from '../planTypes.js';
import {
  type Pt,
  type Vec,
  add,
  mul,
  radToDeg,
  arcPoint,
  TOLERANCE,
} from './geom.js';
import {
  type OffsetMode,
  type CapStyle,
  type OffsetSegment,
  offsetSegment,
  segStart,
  segEnd,
  setSegStart,
  setSegEnd,
  segDirAtStart,
  segDirAtEnd,
  interiorNormal,
} from './offsetPrimitives.js';
import { join } from './joinSolver.js';
import {
  offsetOpenPathTrueRoundCaps,
  makeOpenRoundCapArc,
  addOpenCapsCenterline,
  type RoundCapResult,
  type SegEx,
  type SegHint,
} from './roundCaps.js';

// ============================================================================
// Types
// ============================================================================

export interface OffsetOpenResult {
  /** Whether offset was successful */
  success: boolean;
  /** Offset path (if successful) */
  path?: Path;
  /** Start cap segment (if ROUND cap) */
  startCap?: SegArc;
  /** End cap segment (if ROUND cap) */
  endCap?: SegArc;
  /** Warnings during offset */
  warnings: string[];
  /** Error (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Cap Generation
// ============================================================================

/**
 * Create a round cap (semicircle) at the start of an open path.
 *
 * The cap connects from the "left" offset path back to the "right" offset path
 * (or vice versa for bi-directional offset). For single-side offset, this
 * creates a smooth entry point.
 *
 * @param pt - Original path start point
 * @param dir - Direction into the path
 * @param d - Offset distance (radius of cap)
 * @param winding - Path winding
 * @param mode - INSET or OUTSET
 */
function createRoundStartCap(
  pt: Pt,
  dir: Vec,
  d: number,
  winding: 'CW' | 'CCW',
  mode: OffsetMode
): SegArc {
  // The cap is centered at the original point, radius = d
  // It sweeps from the offset side back to the path direction

  const normal = interiorNormal(dir, winding);
  const sign = mode === 'INSET' ? 1 : -1;
  const offsetDir = mul(normal, sign);

  // Start of arc is at offset position
  const arcStart = add(pt, mul(offsetDir, d));

  // For a proper cap, we'd need bi-directional offset
  // For MVP, create a minimal arc that smooths entry
  const startAngle = Math.atan2(offsetDir.y, offsetDir.x);
  const endAngle = startAngle + Math.PI; // 180° sweep

  // Direction: CCW for aesthetic consistency
  return {
    kind: 'ARC',
    c: pt,
    r: d,
    startDeg: radToDeg(startAngle),
    endDeg: radToDeg(endAngle),
    cw: false,
    start: arcStart,
    end: arcPoint(pt, d, endAngle),
  };
}

/**
 * Create a round cap at the end of an open path.
 */
function createRoundEndCap(
  pt: Pt,
  dir: Vec,
  d: number,
  winding: 'CW' | 'CCW',
  mode: OffsetMode
): SegArc {
  const normal = interiorNormal(dir, winding);
  const sign = mode === 'INSET' ? 1 : -1;
  const offsetDir = mul(normal, sign);

  const arcStart = add(pt, mul(offsetDir, d));
  const startAngle = Math.atan2(offsetDir.y, offsetDir.x);
  const endAngle = startAngle + Math.PI;

  return {
    kind: 'ARC',
    c: pt,
    r: d,
    startDeg: radToDeg(startAngle),
    endDeg: radToDeg(endAngle),
    cw: true, // Opposite direction from start cap
    start: arcStart,
    end: arcPoint(pt, d, endAngle),
  };
}

// ============================================================================
// Open Path Offset
// ============================================================================

/**
 * Offset an open path with optional caps.
 *
 * @param path - Open path to offset
 * @param d - Offset distance (positive)
 * @param mode - INSET or OUTSET
 * @param cap - Cap style for path ends
 * @returns Offset result
 */
export function offsetOpenPath(
  path: Path,
  d: number,
  mode: OffsetMode,
  cap: CapStyle = 'BUTT'
): OffsetOpenResult {
  const warnings: string[] = [];

  // Validation
  if (path.closed) {
    return {
      success: false,
      warnings,
      error: 'Path must be open (use offsetClosedPath for closed paths)',
    };
  }

  if (path.segs.length === 0) {
    return {
      success: false,
      warnings,
      error: 'Path has no segments',
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
      warnings.push(`segment-${i}:collapsed`);

      // Fallback for collapsed arc
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

  // Step 2: Join consecutive segments (all except last)
  for (let i = 0; i < offsets.length - 1; i++) {
    const prev = offsets[i];
    const next = offsets[i + 1];

    // Original vertex as preference point
    const originalVertex = segEnd(path.segs[i] as SegLine | SegArc);

    const joinResult = join(prev, next, originalVertex);

    setSegEnd(prev.seg, joinResult.aEnd);
    setSegStart(next.seg, joinResult.bStart);

    if (!joinResult.ok) {
      warnings.push(`join-${i}:${joinResult.reason || 'failed'}`);
    }
  }

  // Step 3: Build segment list
  const finalSegs: Segment[] = offsets.map((o) => o.seg);

  // Step 4: Add caps if requested
  let startCap: SegArc | undefined;
  let endCap: SegArc | undefined;

  if (cap === 'ROUND' && offsets.length > 0) {
    // Get original path start/end points and directions
    const firstOriginal = path.segs[0] as SegLine | SegArc;
    const lastOriginal = path.segs[path.segs.length - 1] as SegLine | SegArc;

    const startPt = segStart(firstOriginal);
    const startDir = segDirAtStart(firstOriginal);
    const endPt = segEnd(lastOriginal);
    const endDir = segDirAtEnd(lastOriginal);

    startCap = createRoundStartCap(startPt, startDir, d, path.winding, mode);
    endCap = createRoundEndCap(endPt, endDir, d, path.winding, mode);

    warnings.push('cap:round-generated');
  } else if (cap === 'SQUARE' && offsets.length > 0) {
    // Square cap: extend path perpendicular at ends
    // For MVP, we just note it in warnings
    warnings.push('cap:square-not-implemented');
  }

  return {
    success: true,
    path: {
      closed: false,
      segs: finalSegs,
      winding: path.winding,
    },
    startCap,
    endCap,
    warnings,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Offset open path for finishing pass (default BUTT cap).
 */
export function finishingOffsetOpen(
  path: Path,
  finishAllowance: number,
  outsideCut: boolean = true
): OffsetOpenResult {
  const mode: OffsetMode = outsideCut ? 'OUTSET' : 'INSET';
  return offsetOpenPath(path, finishAllowance, mode, 'BUTT');
}

/**
 * Check if an open path can be offset.
 */
export function canOffsetOpenPath(path: Path): boolean {
  if (path.closed) return false;
  if (path.segs.length === 0) return false;

  for (const seg of path.segs) {
    if (seg.kind !== 'LINE' && seg.kind !== 'ARC') {
      return false;
    }
  }

  return true;
}

/**
 * Offset multiple open paths (e.g., tab subpaths).
 */
export function offsetOpenPaths(
  paths: Path[],
  d: number,
  mode: OffsetMode,
  cap: CapStyle = 'BUTT'
): { paths: Path[]; warnings: string[] } {
  const results: Path[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];

    if (path.closed) {
      // Skip closed paths
      results.push(path);
      allWarnings.push(`path-${i}:skipped-closed`);
      continue;
    }

    const result = offsetOpenPath(path, d, mode, cap);

    if (result.success && result.path) {
      results.push(result.path);
    } else {
      // Fallback: use original
      results.push(path);
      allWarnings.push(`path-${i}:offset-failed`);
    }

    // Collect warnings
    result.warnings.forEach((w) => {
      allWarnings.push(`path-${i}:${w}`);
    });
  }

  return { paths: results, warnings: allWarnings };
}

// ============================================================================
// Step 10.5.7: Open Centerline Round Caps (Mode A)
// ============================================================================

/**
 * Result type for open centerline offset with caps.
 */
export interface OpenCenterlineResult {
  /** Whether operation was successful */
  success: boolean;
  /** Segments with hint metadata */
  segsEx: SegEx[];
  /** Warnings during processing */
  warnings: string[];
  /** Error message if unsuccessful */
  error?: string;
}

/**
 * Offset an open path with round caps for CENTERLINE mode.
 *
 * Mode A: Tool follows centerline, lifts/rapids across gaps.
 * Round caps are 180° arcs at endpoints that start and end at the same point.
 *
 * @param path - Open path to offset
 * @param d - Offset distance
 * @param mode - INSET or OUTSET
 * @param emitCaps - Whether to emit cap arcs (from MachineProfile policy)
 * @returns Segments with hints, including optional cap arcs
 */
export function offsetOpenPathCenterline(
  path: Path,
  d: number,
  mode: OffsetMode,
  emitCaps: boolean = false
): OpenCenterlineResult {
  const warnings: string[] = [];

  // First, do the basic offset
  const basicResult = offsetOpenPath(path, d, mode, 'BUTT');

  if (!basicResult.success || !basicResult.path) {
    return {
      success: false,
      segsEx: [],
      warnings: basicResult.warnings,
      error: basicResult.error,
    };
  }

  // Convert segments to SegEx with default hints
  const segsEx: SegEx[] = basicResult.path.segs.map((seg) => ({
    seg,
    hint: { emit: true, role: 'OFFSET_CORE' as const },
  }));

  // Get tangents for cap creation
  const startTangent = segDirAtStart(path.segs[0] as SegLine | SegArc);
  const endTangent = segDirAtEnd(path.segs[path.segs.length - 1] as SegLine | SegArc);

  // Add round caps using addOpenCapsCenterline
  const withCaps = addOpenCapsCenterline(segsEx, startTangent, endTangent, d, emitCaps);

  if (emitCaps) {
    warnings.push('centerline-caps:enabled');
  } else {
    warnings.push('centerline-caps:geometry-only');
  }

  return {
    success: true,
    segsEx: withCaps,
    warnings: [...basicResult.warnings, ...warnings],
  };
}

/**
 * Create round cap arc for an endpoint (Mode A convenience function).
 *
 * @param endpoint - Path endpoint
 * @param tangent - Tangent direction at endpoint
 * @param offsetD - Offset distance
 * @param isEndCap - true for end of path, false for start
 * @returns Cap arc segment with hint
 */
export function createCenterlineCapArc(
  endpoint: Pt,
  tangent: Vec,
  offsetD: number,
  isEndCap: boolean,
  emit: boolean = false
): SegEx | null {
  const cap = makeOpenRoundCapArc(endpoint, tangent, offsetD, isEndCap);
  if (!cap) return null;

  return {
    seg: cap,
    hint: { emit, role: 'ROUND_CAP' },
  };
}

// ============================================================================
// Step 10.5.7: True Round Caps (Stroke-Style) - Mode B
// ============================================================================

/**
 * Offset an open path with TRUE round caps (full stroke outline).
 *
 * Unlike the simple ROUND cap which just adds semicircles to a single-side
 * offset, this creates a complete stroke outline by:
 * 1. Offsetting left (path + d)
 * 2. Offsetting right (path - d) and reversing
 * 3. Connecting with true semicircle caps at both ends
 *
 * The result is a CLOSED path representing the stroke outline.
 *
 * @param path - Open base path
 * @param d - Offset distance (stroke half-width)
 * @returns Closed stroke outline with round caps
 */
export function offsetOpenPathWithTrueRoundCaps(
  path: Path,
  d: number
): OffsetOpenResult {
  const result: RoundCapResult = offsetOpenPathTrueRoundCaps(path, d);

  if (!result.success) {
    return {
      success: false,
      warnings: result.warnings,
      error: result.error,
    };
  }

  return {
    success: true,
    path: result.path,
    warnings: result.warnings,
  };
}

/**
 * Offset multiple open paths with true round caps.
 *
 * Creates closed stroke outlines for each path.
 */
export function offsetOpenPathsWithTrueRoundCaps(
  paths: Path[],
  d: number
): { paths: Path[]; warnings: string[] } {
  const results: Path[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];

    if (path.closed) {
      // Already closed - pass through
      results.push(path);
      allWarnings.push(`path-${i}:skipped-already-closed`);
      continue;
    }

    const result = offsetOpenPathWithTrueRoundCaps(path, d);

    if (result.success && result.path) {
      results.push(result.path);
    } else {
      // Fallback: use original
      results.push(path);
      allWarnings.push(`path-${i}:true-round-cap-failed`);
    }

    result.warnings.forEach((w) => {
      allWarnings.push(`path-${i}:${w}`);
    });
  }

  return { paths: results, warnings: allWarnings };
}
