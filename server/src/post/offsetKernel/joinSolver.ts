/**
 * Join Solver
 *
 * Step 10.5.6: Analytic join between consecutive offset segments.
 * Step 10.5.7: Added constrained join solver with arc sweep membership.
 *
 * Solves LINE-LINE, LINE-ARC, ARC-LINE, and ARC-ARC intersections
 * to create smooth, continuous offset paths.
 *
 * Priority:
 * 1. Constrained analytic intersection (best quality, factory-safe)
 * 2. Simple analytic intersection (legacy mode)
 * 3. Fallback to connector line (deterministic, always works)
 */

import type { SegLine, SegArc } from '../planTypes.js';
import {
  type Pt,
  intersectLines,
  lineCircleIntersections,
  circleCircleIntersections,
  dist,
  sub,
  TOLERANCE,
} from './geom.js';
import {
  solveConstrainedJoin,
  type ConstrainedJoinResult,
} from './joinConstrained.js';
import {
  type OffsetSegment,
  segStart,
  segEnd,
  segDirAtEnd,
  segDirAtStart,
} from './offsetPrimitives.js';

// ============================================================================
// Types
// ============================================================================

export interface JoinResult {
  /** Whether analytic join succeeded */
  ok: boolean;
  /** New end point for previous segment */
  aEnd: Pt;
  /** New start point for next segment */
  bStart: Pt;
  /** Connector segment if join failed (fallback) */
  connector?: SegLine;
  /** Reason for fallback */
  reason?: string;
}

// ============================================================================
// Join Selection Helpers
// ============================================================================

/**
 * Choose the best intersection point from candidates.
 *
 * Criteria:
 * 1. Closest to the preference point (original vertex)
 * 2. On the "forward" side of both segments (not backtracking)
 *
 * @param candidates - Intersection candidates
 * @param prefer - Preferred point (original vertex location)
 * @param prevEnd - Original end of previous segment
 * @param nextStart - Original start of next segment
 * @param maxDist - Maximum allowed distance from prefer point
 */
function chooseBestIntersection(
  candidates: Pt[],
  prefer: Pt,
  prevEnd: Pt,
  nextStart: Pt,
  maxDist: number = 100 // Reasonable limit for CAM
): Pt | null {
  if (candidates.length === 0) {
    return null;
  }

  // Filter candidates that are reasonably close to the prefer point
  const valid = candidates.filter((p) => dist(p, prefer) < maxDist);

  if (valid.length === 0) {
    return null;
  }

  // Sort by distance to prefer point
  valid.sort((a, b) => dist(a, prefer) - dist(b, prefer));

  return valid[0];
}

// ============================================================================
// LINE-LINE Join
// ============================================================================

/**
 * Join two LINE segments by finding their intersection.
 */
function joinLineLine(
  prev: SegLine,
  next: SegLine,
  prefer: Pt
): JoinResult {
  const p = prev.a;
  const r = sub(prev.b, prev.a);
  const q = next.a;
  const s = sub(next.b, next.a);

  const result = intersectLines(p, r, q, s);

  if (!result.hit || result.parallel) {
    // Parallel lines - use connector
    return {
      ok: false,
      aEnd: prev.b,
      bStart: next.a,
      connector: { kind: 'LINE', a: prev.b, b: next.a },
      reason: 'parallel-lines',
    };
  }

  const inter = result.pt!;

  // Check if intersection is reasonable
  // For offset joins, we allow extension beyond segment ends
  // but not too far (would indicate bad geometry)
  const distFromPrefer = dist(inter, prefer);

  if (distFromPrefer > 100) {
    // Too far - use connector
    return {
      ok: false,
      aEnd: prev.b,
      bStart: next.a,
      connector: { kind: 'LINE', a: prev.b, b: next.a },
      reason: 'intersection-too-far',
    };
  }

  return {
    ok: true,
    aEnd: inter,
    bStart: inter,
  };
}

// ============================================================================
// LINE-ARC Join
// ============================================================================

/**
 * Join a LINE segment followed by an ARC segment.
 */
function joinLineArc(
  prev: SegLine,
  next: SegArc,
  prefer: Pt
): JoinResult {
  // Extend the line infinitely and intersect with arc's circle
  const hits = lineCircleIntersections(prev.a, prev.b, next.c, next.r);

  const best = chooseBestIntersection(hits, prefer, prev.b, next.start);

  if (!best) {
    return {
      ok: false,
      aEnd: prev.b,
      bStart: next.start,
      connector: { kind: 'LINE', a: prev.b, b: next.start },
      reason: 'no-line-arc-intersection',
    };
  }

  // Verify intersection is on the "forward extension" of the line
  // and within reasonable arc sweep
  const lineDir = sub(prev.b, prev.a);
  const toInter = sub(best, prev.a);
  const t = (lineDir.x !== 0) ? toInter.x / lineDir.x : toInter.y / lineDir.y;

  // t should be >= 0 (on or beyond start) and close to 1 (near end)
  // For offset joins, we're typically extending the line, so t >= 0 is enough
  if (t < -TOLERANCE) {
    return {
      ok: false,
      aEnd: prev.b,
      bStart: next.start,
      connector: { kind: 'LINE', a: prev.b, b: next.start },
      reason: 'intersection-behind-line',
    };
  }

  return {
    ok: true,
    aEnd: best,
    bStart: best,
  };
}

// ============================================================================
// ARC-LINE Join
// ============================================================================

/**
 * Join an ARC segment followed by a LINE segment.
 */
function joinArcLine(
  prev: SegArc,
  next: SegLine,
  prefer: Pt
): JoinResult {
  // Extend the line infinitely and intersect with arc's circle
  const hits = lineCircleIntersections(next.a, next.b, prev.c, prev.r);

  const best = chooseBestIntersection(hits, prefer, prev.end, next.a);

  if (!best) {
    return {
      ok: false,
      aEnd: prev.end,
      bStart: next.a,
      connector: { kind: 'LINE', a: prev.end, b: next.a },
      reason: 'no-arc-line-intersection',
    };
  }

  return {
    ok: true,
    aEnd: best,
    bStart: best,
  };
}

// ============================================================================
// ARC-ARC Join
// ============================================================================

/**
 * Join two ARC segments by finding their circle intersections.
 */
function joinArcArc(
  prev: SegArc,
  next: SegArc,
  prefer: Pt
): JoinResult {
  const hits = circleCircleIntersections(prev.c, prev.r, next.c, next.r);

  const best = chooseBestIntersection(hits, prefer, prev.end, next.start);

  if (!best) {
    return {
      ok: false,
      aEnd: prev.end,
      bStart: next.start,
      connector: { kind: 'LINE', a: prev.end, b: next.start },
      reason: 'no-arc-arc-intersection',
    };
  }

  return {
    ok: true,
    aEnd: best,
    bStart: best,
  };
}

// ============================================================================
// Main Join Function
// ============================================================================

/**
 * Join two consecutive offset segments.
 *
 * @param prev - Previous offset segment
 * @param next - Next offset segment
 * @param prefer - Preferred intersection point (original vertex)
 * @returns Join result with adjusted endpoints
 */
export function join(
  prev: OffsetSegment,
  next: OffsetSegment,
  prefer: Pt
): JoinResult {
  const prevSeg = prev.seg;
  const nextSeg = next.seg;

  // Check if already continuous
  if (dist(segEnd(prevSeg), segStart(nextSeg)) < TOLERANCE) {
    return {
      ok: true,
      aEnd: segEnd(prevSeg),
      bStart: segStart(nextSeg),
    };
  }

  // Dispatch based on segment types
  if (prevSeg.kind === 'LINE' && nextSeg.kind === 'LINE') {
    return joinLineLine(prevSeg, nextSeg as SegLine, prefer);
  }

  if (prevSeg.kind === 'LINE' && nextSeg.kind === 'ARC') {
    return joinLineArc(prevSeg, nextSeg as SegArc, prefer);
  }

  if (prevSeg.kind === 'ARC' && nextSeg.kind === 'LINE') {
    return joinArcLine(prevSeg as SegArc, nextSeg as SegLine, prefer);
  }

  if (prevSeg.kind === 'ARC' && nextSeg.kind === 'ARC') {
    return joinArcArc(prevSeg as SegArc, nextSeg as SegArc, prefer);
  }

  // Fallback (should not reach here)
  return {
    ok: false,
    aEnd: segEnd(prevSeg),
    bStart: segStart(nextSeg),
    connector: { kind: 'LINE', a: segEnd(prevSeg), b: segStart(nextSeg) },
    reason: 'unknown-segment-types',
  };
}

/**
 * Join segments directly (without OffsetSegment wrapper).
 */
export function joinSegments(
  prev: SegLine | SegArc,
  next: SegLine | SegArc,
  prefer: Pt
): JoinResult {
  // Create minimal wrappers
  const prevWrapper: OffsetSegment = {
    seg: prev,
    original: prev,
    rawStart: segStart(prev),
    rawEnd: segEnd(prev),
    dirAtStart: segDirAtStart(prev),
    dirAtEnd: segDirAtEnd(prev),
  };

  const nextWrapper: OffsetSegment = {
    seg: next,
    original: next,
    rawStart: segStart(next),
    rawEnd: segEnd(next),
    dirAtStart: segDirAtStart(next),
    dirAtEnd: segDirAtEnd(next),
  };

  return join(prevWrapper, nextWrapper, prefer);
}

// ============================================================================
// Step 10.5.7: Constrained Join (CAM-grade)
// ============================================================================

/**
 * Join two segments using constrained solver with arc sweep membership.
 *
 * This is the preferred method for factory-grade toolpaths as it:
 * - Validates intersection candidates against segment bounds
 * - Uses deterministic fallback ladder
 * - Provides detailed diagnostics
 *
 * @param prev - Previous segment (joining at its END)
 * @param next - Next segment (joining at its START)
 * @param prefer - Preferred intersection point (original vertex)
 * @param toolR - Tool radius for potential fillet fallback
 */
export function joinConstrained(
  prev: SegLine | SegArc,
  next: SegLine | SegArc,
  _prefer: Pt, // Kept for API compatibility; constrained solver uses segment endpoints
  toolR: number = 0
): JoinResult {
  // Use the constrained solver from joinConstrained.ts
  const result: ConstrainedJoinResult = solveConstrainedJoin(
    prev,
    next,
    segEnd(prev),
    segStart(next),
    toolR
  );

  return {
    ok: result.ok,
    aEnd: result.aEnd,
    bStart: result.bStart,
    connector: result.connector,
    reason: result.reason,
  };
}

/**
 * Join offset segments using constrained solver.
 */
export function joinOffsetConstrained(
  prev: OffsetSegment,
  next: OffsetSegment,
  prefer: Pt,
  toolR: number = 0
): JoinResult {
  return joinConstrained(prev.seg, next.seg, prefer, toolR);
}
