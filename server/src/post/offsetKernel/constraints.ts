/**
 * Forward Extension Constraints
 *
 * Step 10.5.7: Segment membership and forward extension tests for join solving.
 *
 * For joins at A_END -> B_START:
 * - A candidate must lie on A's forward extension from its end
 * - A candidate must lie on B's forward extension from its start
 *
 * These constraints ensure geometrically valid joins that don't create
 * impossible toolpaths.
 */

import type { SegLine, SegArc, Segment } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  EPS_PARAM,
  sub,
  dot,
  len,
  cross,
  norm,
} from './mathCore.js';
import {
  pointOnArcSweep,
  arcPointAtDeg,
  arcTangentDirAtDeg,
} from './arcSweep.js';

// ============================================================================
// Line Segment Utilities
// ============================================================================

export interface LineDirLen {
  dir: Vec2;
  L: number;
}

/**
 * Get unit direction and length of a line segment.
 */
export function lineDirLen(seg: SegLine): LineDirLen {
  const v = sub(seg.b, seg.a);
  const L = len(v);
  return {
    dir: L < EPS_POS ? { x: 1, y: 0 } : { x: v.x / L, y: v.y / L },
    L,
  };
}

/**
 * Get scalar parameter t along line from a (t=0) to b (t=L).
 * This is NOT normalized to [0,1] - it returns the actual distance.
 */
export function lineParam(seg: SegLine, p: Vec2): number {
  const { dir } = lineDirLen(seg);
  return dot(sub(p, seg.a), dir);
}

/**
 * Get normalized parameter t ∈ [0,1] for point on line segment.
 */
export function lineParamNormalized(seg: SegLine, p: Vec2): number {
  const { dir, L } = lineDirLen(seg);
  if (L < EPS_POS) return 0;
  return dot(sub(p, seg.a), dir) / L;
}

/**
 * Check if point lies on infinite line (perpendicular distance test).
 */
export function pointOnLineInfinite(seg: SegLine, p: Vec2, eps = EPS_POS * 10): boolean {
  const v = sub(seg.b, seg.a);
  const w = sub(p, seg.a);
  const L = len(v);

  if (L < EPS_POS) {
    // Degenerate segment: just check distance to point a
    return len(w) <= eps;
  }

  // Perpendicular distance = |v × w| / |v|
  const dist = Math.abs(cross(v, w)) / L;
  return dist <= eps;
}

/**
 * Check if point lies on bounded line segment.
 */
export function pointOnLineSegment(seg: SegLine, p: Vec2, eps = EPS_POS * 10): boolean {
  if (!pointOnLineInfinite(seg, p, eps)) return false;

  const { L } = lineDirLen(seg);
  const t = lineParam(seg, p);

  return t >= -eps && t <= L + eps;
}

// ============================================================================
// Forward Extension Tests for Lines
// ============================================================================

/**
 * Check if point is on forward extension of line from its END.
 * Used for segment A in A_END -> B_START joins.
 *
 * Forward from end means: t >= L - eps (at or beyond the end point)
 */
export function forwardOkLine_AEnd(seg: SegLine, p: Vec2, eps = EPS_PARAM): boolean {
  if (!pointOnLineInfinite(seg, p, EPS_POS * 100)) return false;

  const { L } = lineDirLen(seg);
  const t = lineParam(seg, p);

  // At or beyond end point
  return t >= L - eps;
}

/**
 * Check if point is on forward extension of line from its START.
 * Used for segment B in A_END -> B_START joins.
 *
 * Forward from start means: t >= 0 - eps (at or beyond the start point, going forward)
 */
export function forwardOkLine_BStart(seg: SegLine, p: Vec2, eps = EPS_PARAM): boolean {
  if (!pointOnLineInfinite(seg, p, EPS_POS * 100)) return false;

  const t = lineParam(seg, p);

  // At or beyond start point (in forward direction)
  return t >= -eps;
}

// ============================================================================
// Forward Extension Tests for Arcs
// ============================================================================

/**
 * Check if point is on forward extension of arc from its END.
 * Used for segment A in A_END -> B_START joins.
 *
 * Requirements:
 * 1. Point must be on arc sweep (radius + angle)
 * 2. Dot product of (p - endPt) with tangent at end must be >= -eps
 */
export function forwardOkArc_End(arc: SegArc, p: Vec2, eps = EPS_PARAM): boolean {
  // Must be on arc sweep (or very close)
  if (!pointOnArcSweep(arc, p, EPS_POS * 100)) return false;

  // Check tangent direction constraint
  const endPt = arcPointAtDeg(arc, arc.endDeg);
  const tan = arcTangentDirAtDeg(arc, arc.endDeg);

  // Displacement from end point
  const disp = sub(p, endPt);

  // Must be at or ahead of end point in tangent direction
  return dot(disp, tan) >= -eps;
}

/**
 * Check if point is on forward extension of arc from its START.
 * Used for segment B in A_END -> B_START joins.
 *
 * Requirements:
 * 1. Point must be on arc sweep (radius + angle)
 * 2. Dot product of (p - startPt) with tangent at start must be >= -eps
 */
export function forwardOkArc_Start(arc: SegArc, p: Vec2, eps = EPS_PARAM): boolean {
  // Must be on arc sweep (or very close)
  if (!pointOnArcSweep(arc, p, EPS_POS * 100)) return false;

  // Check tangent direction constraint
  const startPt = arcPointAtDeg(arc, arc.startDeg);
  const tan = arcTangentDirAtDeg(arc, arc.startDeg);

  // Displacement from start point
  const disp = sub(p, startPt);

  // Must be at or ahead of start point in tangent direction
  return dot(disp, tan) >= -eps;
}

// ============================================================================
// Generic Segment Constraint Checks
// ============================================================================

/**
 * Check if point satisfies forward constraint for segment A at its END.
 */
export function forwardOkSegment_AEnd(seg: Segment, p: Vec2, eps = EPS_PARAM): boolean {
  if (seg.kind === 'LINE') {
    return forwardOkLine_AEnd(seg as SegLine, p, eps);
  } else if (seg.kind === 'ARC') {
    return forwardOkArc_End(seg as SegArc, p, eps);
  }
  return false;
}

/**
 * Check if point satisfies forward constraint for segment B at its START.
 */
export function forwardOkSegment_BStart(seg: Segment, p: Vec2, eps = EPS_PARAM): boolean {
  if (seg.kind === 'LINE') {
    return forwardOkLine_BStart(seg as SegLine, p, eps);
  } else if (seg.kind === 'ARC') {
    return forwardOkArc_Start(seg as SegArc, p, eps);
  }
  return false;
}

// ============================================================================
// Segment Start/End Point Helpers
// ============================================================================

/**
 * Get start point of a segment.
 */
export function segmentStartPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).a;
  } else if (seg.kind === 'ARC') {
    return arcPointAtDeg(seg as SegArc, (seg as SegArc).startDeg);
  }
  throw new Error(`Unknown segment kind: ${(seg as any).kind}`);
}

/**
 * Get end point of a segment.
 */
export function segmentEndPoint(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).b;
  } else if (seg.kind === 'ARC') {
    return arcPointAtDeg(seg as SegArc, (seg as SegArc).endDeg);
  }
  throw new Error(`Unknown segment kind: ${(seg as any).kind}`);
}

/**
 * Get tangent direction at start of segment (unit vector).
 */
export function segmentTangentAtStart(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    const { dir } = lineDirLen(seg as SegLine);
    return dir;
  } else if (seg.kind === 'ARC') {
    return arcTangentDirAtDeg(seg as SegArc, (seg as SegArc).startDeg);
  }
  throw new Error(`Unknown segment kind: ${(seg as any).kind}`);
}

/**
 * Get tangent direction at end of segment (unit vector).
 */
export function segmentTangentAtEnd(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    const { dir } = lineDirLen(seg as SegLine);
    return dir;
  } else if (seg.kind === 'ARC') {
    return arcTangentDirAtDeg(seg as SegArc, (seg as SegArc).endDeg);
  }
  throw new Error(`Unknown segment kind: ${(seg as any).kind}`);
}
