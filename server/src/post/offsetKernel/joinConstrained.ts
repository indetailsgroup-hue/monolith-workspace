/**
 * Constrained Join Solver
 *
 * Step 10.5.7: CAM-grade join solving with analytic constraints.
 * Step 10.5.8: Added FILLET fallback for tool radius arcs.
 *
 * This replaces the simple "closest intersection" approach from Step 10.5.6
 * with a proper constrained solver that:
 * 1. Generates all intersection candidates
 * 2. Applies membership + forward constraints
 * 3. Uses stable scoring for deterministic tie-breaking
 * 4. Falls back through a deterministic ladder (OK → MITER → FILLET → CONNECTOR)
 *
 * FILLET fallback (Step 10.5.8):
 * - Creates tool-radius arc tangent to both segments
 * - Works for LINE-LINE, LINE-ARC, ARC-LINE, ARC-ARC
 * - Requires toolR > 0 to activate
 */

import type { SegLine, SegArc, Segment } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  EPS_PARAM,
  add,
  sub,
  mul,
  dot,
  len,
  dist,
  norm,
  cross,
  almostEq,
  stableSortPoints,
  perpLeft,
  angleOfPointDeg,
} from './mathCore.js';
import {
  forwardOkSegment_AEnd,
  forwardOkSegment_BStart,
} from './constraints.js';
import { pointOnArcSweep } from './arcSweep.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A candidate intersection point with deterministic scoring.
 */
export interface JoinCandidate {
  /** Intersection point */
  p: Vec2;
  /** Primary score: distance to midpoint of reference endpoints (smaller is better) */
  scorePrimary: number;
  /** Secondary score: sum of distances to endpoints (smaller is better) */
  scoreSecondary: number;
  /** Metadata for audit/debug */
  meta: string;
}

/**
 * Fillet arc result - a tool-radius arc tangent to both segments.
 * Used as fallback when direct intersection fails.
 */
export interface FilletArc {
  /** Arc segment */
  arc: SegArc;
  /** Tangent point on segment A (new A end) */
  tangentA: Vec2;
  /** Tangent point on segment B (new B start) */
  tangentB: Vec2;
}

/**
 * Result of join solving.
 */
export type JoinResult =
  | { kind: 'OK'; p: Vec2; chosen: JoinCandidate }
  | { kind: 'FALLBACK_MITER'; p: Vec2; reason: string }
  | { kind: 'FALLBACK_FILLET'; fillet: FilletArc; reason: string }
  | { kind: 'FALLBACK_CONNECTOR'; p: Vec2; connector: SegLine; reason: string }
  | { kind: 'BLOCK_GATE'; reason: string };

// ============================================================================
// Intersection Generators (Infinite Geometry)
// ============================================================================

/**
 * Intersect two infinite lines.
 */
export function intersectLineLineInfinite(
  segA: SegLine,
  segB: SegLine,
  eps = EPS_POS
): Vec2 | null {
  const dA = sub(segA.b, segA.a);
  const dB = sub(segB.b, segB.a);
  const rxs = cross(dA, dB);

  // Check for parallel lines
  if (Math.abs(rxs) < eps) return null;

  // Solve for intersection parameter
  const qp = sub(segB.a, segA.a);
  const t = cross(qp, dB) / rxs;

  return add(segA.a, mul(dA, t));
}

/**
 * Intersect infinite line with circle.
 * Returns 0, 1, or 2 intersection points.
 */
export function intersectLineCircle(
  seg: SegLine,
  c: Vec2,
  r: number,
  eps = EPS_POS
): Vec2[] {
  const d = sub(seg.b, seg.a);
  const f = sub(seg.a, c);

  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const cc = dot(f, f) - r * r;

  const discriminant = b * b - 4 * a * cc;

  if (discriminant < -eps) return [];

  if (discriminant < eps) {
    // Tangent case: one intersection
    const t = -b / (2 * a);
    return [add(seg.a, mul(d, t))];
  }

  // Two intersections
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  return stableSortPoints([
    add(seg.a, mul(d, t1)),
    add(seg.a, mul(d, t2)),
  ]);
}

/**
 * Intersect two circles.
 * Returns 0, 1, or 2 intersection points.
 */
export function intersectCircleCircle(
  c1: Vec2,
  r1: number,
  c2: Vec2,
  r2: number,
  eps = EPS_POS
): Vec2[] {
  const d = dist(c1, c2);

  // No intersection cases
  if (d > r1 + r2 + eps) return []; // Circles too far apart
  if (d < Math.abs(r1 - r2) - eps) return []; // One circle inside other
  if (d < eps && almostEq(r1, r2, eps)) return []; // Concentric circles

  // Handle coincident centers with different radii
  if (d < eps) return [];

  // Calculate intersection point(s)
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;

  if (h2 < -eps) return [];

  // Direction from c1 to c2
  const dir = norm(sub(c2, c1));
  const perpDir = perpLeft(dir);

  // Point on line between centers
  const p = add(c1, mul(dir, a));

  if (h2 < eps) {
    // Tangent case: one intersection
    return [p];
  }

  // Two intersections
  const h = Math.sqrt(h2);

  return stableSortPoints([
    add(p, mul(perpDir, h)),
    add(p, mul(perpDir, -h)),
  ]);
}

// ============================================================================
// Raw Intersection Generator
// ============================================================================

/**
 * Generate all intersection candidates between two segments (infinite geometry).
 * Results are sorted stably for determinism.
 */
export function intersectSegsInfinite(
  segA: Segment,
  segB: Segment,
  eps = EPS_POS
): JoinCandidate[] {
  // LINE-LINE
  if (segA.kind === 'LINE' && segB.kind === 'LINE') {
    const p = intersectLineLineInfinite(segA as SegLine, segB as SegLine, eps);
    return p ? [{ p, scorePrimary: 0, scoreSecondary: 0, meta: 'LL#0' }] : [];
  }

  // LINE-ARC
  if (segA.kind === 'LINE' && segB.kind === 'ARC') {
    const arc = segB as SegArc;
    const ps = intersectLineCircle(segA as SegLine, arc.c, arc.r, eps);
    return ps.map((p, i) => ({ p, scorePrimary: 0, scoreSecondary: 0, meta: `LA#${i}` }));
  }

  // ARC-LINE
  if (segA.kind === 'ARC' && segB.kind === 'LINE') {
    const arc = segA as SegArc;
    const ps = intersectLineCircle(segB as SegLine, arc.c, arc.r, eps);
    return ps.map((p, i) => ({ p, scorePrimary: 0, scoreSecondary: 0, meta: `AL#${i}` }));
  }

  // ARC-ARC
  if (segA.kind === 'ARC' && segB.kind === 'ARC') {
    const arcA = segA as SegArc;
    const arcB = segB as SegArc;
    const ps = intersectCircleCircle(arcA.c, arcA.r, arcB.c, arcB.r, eps);
    return ps.map((p, i) => ({ p, scorePrimary: 0, scoreSecondary: 0, meta: `AA#${i}` }));
  }

  return [];
}

// ============================================================================
// Stable Candidate Sorting
// ============================================================================

/**
 * Sort candidates deterministically: by primary score, then secondary, then meta.
 */
function stableSortCandidates(xs: JoinCandidate[]): JoinCandidate[] {
  return xs.slice().sort((a, b) => {
    if (!almostEq(a.scorePrimary, b.scorePrimary, EPS_POS)) {
      return a.scorePrimary - b.scorePrimary;
    }
    if (!almostEq(a.scoreSecondary, b.scoreSecondary, EPS_POS)) {
      return a.scoreSecondary - b.scoreSecondary;
    }
    // Stable string comparison for meta
    return a.meta < b.meta ? -1 : a.meta > b.meta ? 1 : 0;
  });
}

// ============================================================================
// Fallback Join Strategies
// ============================================================================

/**
 * Try miter fallback for LINE-LINE joins.
 */
function tryMiterFallback(
  segA: SegLine,
  segB: SegLine,
  aEndRef: Vec2,
  bStartRef: Vec2,
  _eps: number
): JoinResult | null {
  const p = intersectLineLineInfinite(segA, segB, EPS_POS * 0.001);

  if (p) {
    // Check if intersection is reasonably close to references
    const distToA = dist(p, aEndRef);
    const distToB = dist(p, bStartRef);

    // Allow miter if intersection is not too far from original vertex
    // (prevents extreme miter spikes)
    const maxMiterDist = 100; // mm - reasonable limit for cabinet work

    if (distToA <= maxMiterDist && distToB <= maxMiterDist) {
      return {
        kind: 'FALLBACK_MITER',
        p,
        reason: 'No constrained join; miter fallback',
      };
    }
  }

  return null;
}

/**
 * Create a connector line fallback when no intersection is possible.
 */
function tryConnectorFallback(
  _segA: Segment,
  _segB: Segment,
  aEndRef: Vec2,
  bStartRef: Vec2
): JoinResult {
  // Use the midpoint of the reference endpoints as the meeting point
  const mid = mul(add(aEndRef, bStartRef), 0.5);

  // Create connector from A's end to B's start
  const connector: SegLine = {
    kind: 'LINE',
    a: aEndRef,
    b: bStartRef,
  };

  return {
    kind: 'FALLBACK_CONNECTOR',
    p: mid,
    connector,
    reason: 'No valid intersection; connector line fallback',
  };
}

// ============================================================================
// Step 10.5.8: FILLET Fallback Functions
// ============================================================================

/**
 * Get line direction as unit vector.
 */
function lineDir(seg: SegLine): Vec2 {
  const d = sub(seg.b, seg.a);
  const L = len(d);
  if (L < EPS_POS) return { x: 1, y: 0 };
  return { x: d.x / L, y: d.y / L };
}

/**
 * Get arc tangent direction at a given point on the arc.
 * For CW arc, tangent is -perpLeft of radial direction.
 * For CCW arc, tangent is perpLeft of radial direction.
 */
function arcTangentAtPoint(arc: SegArc, p: Vec2): Vec2 {
  const radial = norm(sub(p, arc.c));
  // CCW: tangent is perpLeft (counterclockwise from radial)
  // CW: tangent is perpRight (clockwise from radial)
  if (arc.cw) {
    return { x: radial.y, y: -radial.x }; // perpRight
  } else {
    return { x: -radial.y, y: radial.x }; // perpLeft
  }
}

/**
 * Create fillet arc between two lines.
 *
 * Algorithm:
 * 1. Find intersection of lines (infinite extension)
 * 2. Compute bisector direction
 * 3. Find fillet center along bisector at distance r/sin(θ/2)
 * 4. Project tangent points onto both lines
 * 5. Determine arc direction (CW/CCW) based on turn direction
 *
 * @param segA - First line segment (joining at END)
 * @param segB - Second line segment (joining at START)
 * @param r - Fillet radius (tool radius)
 * @returns Fillet arc or null if not possible
 */
export function tryFilletLineLine(
  segA: SegLine,
  segB: SegLine,
  r: number
): FilletArc | null {
  if (r <= EPS_POS) return null;

  // Get line directions
  const dirA = lineDir(segA);
  const dirB = lineDir(segB);

  // Find intersection point of infinite lines
  const inter = intersectLineLineInfinite(segA, segB, EPS_POS * 0.001);
  if (!inter) return null; // Parallel lines

  // Calculate angle between lines using cross product
  const crossAB = cross(dirA, dirB);
  const dotAB = dot(dirA, dirB);
  const angleRad = Math.atan2(Math.abs(crossAB), dotAB);

  // Check if angle is too small or too large for fillet
  if (angleRad < 0.01 || angleRad > Math.PI - 0.01) return null;

  // Calculate bisector direction
  // The bisector points toward the "inside" of the turn
  const bisectorRaw = add(dirA, dirB);
  const bisectorLen = len(bisectorRaw);
  if (bisectorLen < EPS_POS) return null;
  const bisector = { x: bisectorRaw.x / bisectorLen, y: bisectorRaw.y / bisectorLen };

  // Distance from intersection to fillet center
  const halfAngle = angleRad / 2;
  const sinHalf = Math.sin(halfAngle);
  if (sinHalf < EPS_POS) return null;
  const distToCenter = r / sinHalf;

  // Choose which side of intersection for fillet center
  // Based on turn direction (cross product sign)
  const turnSign = crossAB >= 0 ? 1 : -1;

  // Perpendicular to bisector for offset
  const perpBisector = perpLeft(bisector);
  const centerOffset = mul(perpBisector, turnSign * distToCenter);

  // Fillet center - offset from intersection perpendicular to bisector
  // Actually, center is along the angle bisector from intersection
  // Need to recalculate: center is at distance r/sin(θ/2) along perpendicular to bisector
  // OR equivalently: distance to line A = r, distance to line B = r

  // Simpler approach: use perpendicular distance formula
  // Fillet center must be at distance r from both lines
  // It lies on the angle bisector from intersection at distance d = r/sin(θ/2)

  // The center is offset from intersection along perpendicular to bisector
  const center = add(inter, mul(perpBisector, -turnSign * r / sinHalf));

  // Find tangent points: project center onto each line
  // Tangent point on A: center + perpendicular to dirA pointing toward line
  const perpA = perpLeft(dirA);
  const signA = dot(perpA, sub(inter, center)) > 0 ? 1 : -1;
  const tangentA = add(center, mul(perpA, signA * r));

  // Tangent point on B
  const perpB = perpLeft(dirB);
  const signB = dot(perpB, sub(inter, center)) > 0 ? 1 : -1;
  const tangentB = add(center, mul(perpB, signB * r));

  // Validate tangent points are on the correct side (forward extension)
  // A's tangent should be "forward" from A's direction
  const tA_param = dot(sub(tangentA, segA.a), dirA);
  const tB_param = dot(sub(tangentB, segB.a), dirB);

  // Both tangent points should be on reasonable extensions
  const lineALen = len(sub(segA.b, segA.a));
  const lineBLen = len(sub(segB.b, segB.a));

  // Allow extension up to 2x line length or 100mm
  const maxExtA = Math.max(lineALen * 2, 100);
  const maxExtB = Math.max(lineBLen * 2, 100);

  if (tA_param < -maxExtA || tA_param > lineALen + maxExtA) return null;
  if (tB_param < -EPS_POS || tB_param > lineBLen + maxExtB) return null;

  // Calculate arc angles
  const startAngle = angleOfPointDeg(center, tangentA);
  const endAngle = angleOfPointDeg(center, tangentB);

  // Determine CW/CCW: arc goes from tangentA to tangentB
  // Turn direction determines arc direction
  const arcCw = crossAB < 0;

  const arc: SegArc = {
    kind: 'ARC',
    c: center,
    r,
    startDeg: startAngle,
    endDeg: endAngle,
    cw: arcCw,
    start: tangentA,
    end: tangentB,
  };

  return { arc, tangentA, tangentB };
}

/**
 * Create fillet arc between line and arc.
 *
 * Algorithm:
 * 1. Offset the arc by ±r (depending on concave/convex)
 * 2. Offset the line by r
 * 3. Find intersection of offset geometries
 * 4. Project back to original geometries for tangent points
 *
 * @param segA - Line segment (joining at END)
 * @param segB - Arc segment (joining at START)
 * @param r - Fillet radius (tool radius)
 * @returns Fillet arc or null if not possible
 */
export function tryFilletLineArc(
  segA: SegLine,
  segB: SegArc,
  r: number
): FilletArc | null {
  if (r <= EPS_POS) return null;

  const dirA = lineDir(segA);

  // Offset line by r on the side toward arc center
  // Check which side of line the arc center is on
  const perpA = perpLeft(dirA);
  const toCenter = sub(segB.c, segA.a);
  const sideSign = dot(perpA, toCenter) > 0 ? 1 : -1;

  // Offset line: parallel line at distance r
  const offsetLineStart = add(segA.a, mul(perpA, sideSign * r));
  const offsetLineEnd = add(segA.b, mul(perpA, sideSign * r));
  const offsetLine: SegLine = { kind: 'LINE', a: offsetLineStart, b: offsetLineEnd };

  // Offset arc: concentric circle with radius ± r
  // If fillet is on outside of arc, use r + segB.r
  // If fillet is on inside of arc, use |segB.r - r|

  // Determine if fillet is on inside or outside of arc
  // Check direction from arc start toward center vs line direction
  const arcStartToCenter = sub(segB.c, segB.start);
  const lineEndDir = dirA;
  const dotProduct = dot(arcStartToCenter, lineEndDir);

  // If line is going toward arc center, fillet is on inside
  const isInside = dotProduct > 0;

  let offsetR: number;
  if (isInside) {
    offsetR = segB.r - r;
    if (offsetR <= EPS_POS) return null; // Fillet too large
  } else {
    offsetR = segB.r + r;
  }

  // Intersect offset line with offset circle
  const centers = intersectLineCircle(offsetLine, segB.c, offsetR, EPS_POS);
  if (centers.length === 0) return null;

  // Choose the fillet center closest to the joint
  const jointApprox = mul(add(segA.b, segB.start), 0.5);
  let bestCenter = centers[0];
  let bestDist = dist(centers[0], jointApprox);

  for (let i = 1; i < centers.length; i++) {
    const d = dist(centers[i], jointApprox);
    if (d < bestDist) {
      bestDist = d;
      bestCenter = centers[i];
    }
  }

  const center = bestCenter;

  // Find tangent point on line: project center onto original line
  const tA_vec = sub(center, segA.a);
  const tA_param = dot(tA_vec, dirA);
  const tangentA: Vec2 = add(segA.a, mul(dirA, tA_param));

  // Find tangent point on arc: point on arc at distance r from fillet center
  const toArcCenter = sub(segB.c, center);
  const toArcCenterLen = len(toArcCenter);
  if (toArcCenterLen < EPS_POS) return null;

  const toArcCenterDir = { x: toArcCenter.x / toArcCenterLen, y: toArcCenter.y / toArcCenterLen };
  const tangentB: Vec2 = add(center, mul(toArcCenterDir, r));

  // Verify tangent point is on arc sweep
  if (!pointOnArcSweep(segB, tangentB, EPS_POS * 100)) {
    // Try the other direction
    const tangentB2: Vec2 = add(center, mul(toArcCenterDir, -r));
    if (!pointOnArcSweep(segB, tangentB2, EPS_POS * 100)) {
      return null;
    }
    // Use tangentB2
    Object.assign(tangentB, tangentB2);
  }

  // Calculate arc angles
  const startAngle = angleOfPointDeg(center, tangentA);
  const endAngle = angleOfPointDeg(center, tangentB);

  // Determine CW/CCW based on turn direction
  // From line direction to arc tangent at start
  const arcTangentDir = arcTangentAtPoint(segB, tangentB);
  const turnCross = cross(dirA, arcTangentDir);
  const arcCw = turnCross < 0;

  const arc: SegArc = {
    kind: 'ARC',
    c: center,
    r,
    startDeg: startAngle,
    endDeg: endAngle,
    cw: arcCw,
    start: tangentA,
    end: tangentB,
  };

  return { arc, tangentA, tangentB };
}

/**
 * Create fillet arc between arc and line (reversed order).
 */
export function tryFilletArcLine(
  segA: SegArc,
  segB: SegLine,
  r: number
): FilletArc | null {
  if (r <= EPS_POS) return null;

  const dirB = lineDir(segB);

  // Offset line by r on the side toward arc center
  const perpB = perpLeft(dirB);
  const toCenter = sub(segA.c, segB.a);
  const sideSign = dot(perpB, toCenter) > 0 ? 1 : -1;

  // Offset line
  const offsetLineStart = add(segB.a, mul(perpB, sideSign * r));
  const offsetLineEnd = add(segB.b, mul(perpB, sideSign * r));
  const offsetLine: SegLine = { kind: 'LINE', a: offsetLineStart, b: offsetLineEnd };

  // Determine offset arc radius
  const arcEndToCenter = sub(segA.c, segA.end);
  const dotProduct = dot(arcEndToCenter, dirB);
  const isInside = dotProduct > 0;

  let offsetR: number;
  if (isInside) {
    offsetR = segA.r - r;
    if (offsetR <= EPS_POS) return null;
  } else {
    offsetR = segA.r + r;
  }

  // Intersect offset line with offset circle
  const centers = intersectLineCircle(offsetLine, segA.c, offsetR, EPS_POS);
  if (centers.length === 0) return null;

  // Choose fillet center closest to joint
  const jointApprox = mul(add(segA.end, segB.a), 0.5);
  let bestCenter = centers[0];
  let bestDist = dist(centers[0], jointApprox);

  for (let i = 1; i < centers.length; i++) {
    const d = dist(centers[i], jointApprox);
    if (d < bestDist) {
      bestDist = d;
      bestCenter = centers[i];
    }
  }

  const center = bestCenter;

  // Find tangent point on arc
  const toArcCenter = sub(segA.c, center);
  const toArcCenterLen = len(toArcCenter);
  if (toArcCenterLen < EPS_POS) return null;

  const toArcCenterDir = { x: toArcCenter.x / toArcCenterLen, y: toArcCenter.y / toArcCenterLen };
  const tangentA: Vec2 = add(center, mul(toArcCenterDir, r));

  // Verify tangent point is on arc sweep
  if (!pointOnArcSweep(segA, tangentA, EPS_POS * 100)) {
    const tangentA2: Vec2 = add(center, mul(toArcCenterDir, -r));
    if (!pointOnArcSweep(segA, tangentA2, EPS_POS * 100)) {
      return null;
    }
    Object.assign(tangentA, tangentA2);
  }

  // Find tangent point on line
  const tB_vec = sub(center, segB.a);
  const tB_param = dot(tB_vec, dirB);
  const tangentB: Vec2 = add(segB.a, mul(dirB, tB_param));

  // Calculate arc angles
  const startAngle = angleOfPointDeg(center, tangentA);
  const endAngle = angleOfPointDeg(center, tangentB);

  // Determine CW/CCW
  const arcATangent = arcTangentAtPoint(segA, tangentA);
  const turnCross = cross(arcATangent, dirB);
  const arcCw = turnCross < 0;

  const arc: SegArc = {
    kind: 'ARC',
    c: center,
    r,
    startDeg: startAngle,
    endDeg: endAngle,
    cw: arcCw,
    start: tangentA,
    end: tangentB,
  };

  return { arc, tangentA, tangentB };
}

/**
 * Create fillet arc between two arcs.
 *
 * Algorithm:
 * 1. Offset both arcs by ±r
 * 2. Find circle-circle intersections
 * 3. Choose best candidate as fillet center
 * 4. Calculate tangent points
 *
 * @param segA - First arc (joining at END)
 * @param segB - Second arc (joining at START)
 * @param r - Fillet radius (tool radius)
 * @returns Fillet arc or null if not possible
 */
export function tryFilletArcArc(
  segA: SegArc,
  segB: SegArc,
  r: number
): FilletArc | null {
  if (r <= EPS_POS) return null;

  // Try different offset combinations (inside/outside for each arc)
  const offsetCombinations = [
    [segA.r + r, segB.r + r],   // Both outside
    [segA.r + r, segB.r - r],   // A outside, B inside
    [segA.r - r, segB.r + r],   // A inside, B outside
    [segA.r - r, segB.r - r],   // Both inside
  ];

  const jointApprox = mul(add(segA.end, segB.start), 0.5);
  let bestResult: FilletArc | null = null;
  let bestDist = Infinity;

  for (const [offsetRA, offsetRB] of offsetCombinations) {
    if (offsetRA <= EPS_POS || offsetRB <= EPS_POS) continue;

    // Find circle-circle intersections
    const centers = intersectCircleCircle(segA.c, offsetRA, segB.c, offsetRB, EPS_POS);

    for (const center of centers) {
      // Find tangent point on arc A
      const toA = sub(segA.c, center);
      const toALen = len(toA);
      if (toALen < EPS_POS) continue;

      const toADir = { x: toA.x / toALen, y: toA.y / toALen };
      const tangentA = add(center, mul(toADir, r));

      // Verify on arc A sweep
      if (!pointOnArcSweep(segA, tangentA, EPS_POS * 100)) {
        const tangentA2 = add(center, mul(toADir, -r));
        if (!pointOnArcSweep(segA, tangentA2, EPS_POS * 100)) continue;
        Object.assign(tangentA, tangentA2);
      }

      // Find tangent point on arc B
      const toB = sub(segB.c, center);
      const toBLen = len(toB);
      if (toBLen < EPS_POS) continue;

      const toBDir = { x: toB.x / toBLen, y: toB.y / toBLen };
      const tangentB = add(center, mul(toBDir, r));

      // Verify on arc B sweep
      if (!pointOnArcSweep(segB, tangentB, EPS_POS * 100)) {
        const tangentB2 = add(center, mul(toBDir, -r));
        if (!pointOnArcSweep(segB, tangentB2, EPS_POS * 100)) continue;
        Object.assign(tangentB, tangentB2);
      }

      // Calculate distance to joint approximation
      const d = dist(center, jointApprox);
      if (d < bestDist) {
        bestDist = d;

        // Calculate arc angles
        const startAngle = angleOfPointDeg(center, tangentA);
        const endAngle = angleOfPointDeg(center, tangentB);

        // Determine CW/CCW based on turn direction
        const arcATangent = arcTangentAtPoint(segA, tangentA);
        const arcBTangent = arcTangentAtPoint(segB, tangentB);
        const turnCross = cross(arcATangent, arcBTangent);
        const arcCw = turnCross < 0;

        const arc: SegArc = {
          kind: 'ARC',
          c: center,
          r,
          startDeg: startAngle,
          endDeg: endAngle,
          cw: arcCw,
          start: tangentA,
          end: tangentB,
        };

        bestResult = { arc, tangentA, tangentB };
      }
    }
  }

  return bestResult;
}

/**
 * Try fillet fallback for any segment pair.
 */
function tryFilletFallback(
  segA: Segment,
  segB: Segment,
  toolR: number
): JoinResult | null {
  if (toolR <= EPS_POS) return null;

  let fillet: FilletArc | null = null;

  if (segA.kind === 'LINE' && segB.kind === 'LINE') {
    fillet = tryFilletLineLine(segA as SegLine, segB as SegLine, toolR);
  } else if (segA.kind === 'LINE' && segB.kind === 'ARC') {
    fillet = tryFilletLineArc(segA as SegLine, segB as SegArc, toolR);
  } else if (segA.kind === 'ARC' && segB.kind === 'LINE') {
    fillet = tryFilletArcLine(segA as SegArc, segB as SegLine, toolR);
  } else if (segA.kind === 'ARC' && segB.kind === 'ARC') {
    fillet = tryFilletArcArc(segA as SegArc, segB as SegArc, toolR);
  }

  if (fillet) {
    return {
      kind: 'FALLBACK_FILLET',
      fillet,
      reason: `Fillet arc r=${toolR}mm`,
    };
  }

  return null;
}

// ============================================================================
// Main Constrained Join Solver
// ============================================================================

/**
 * Solve join at A_END -> B_START with full constraints.
 *
 * @param segA - First segment (joining at its END)
 * @param segB - Second segment (joining at its START)
 * @param aEndRef - Reference point for A's end (original vertex)
 * @param bStartRef - Reference point for B's start (original vertex)
 * @param toolR - Tool radius (for potential fillet fallback)
 * @param eps - Tolerance
 */
export function solveJoinConstrained(
  segA: Segment,
  segB: Segment,
  aEndRef: Vec2,
  bStartRef: Vec2,
  toolR: number = 0,
  eps = EPS_PARAM
): JoinResult {
  // 1) Generate raw intersection candidates
  const raw = intersectSegsInfinite(segA, segB, EPS_POS);

  // 2) Apply membership + forward constraints
  const valids: JoinCandidate[] = [];

  for (const cand of raw) {
    const p = cand.p;

    // Check A constraint: must be on forward extension from A's end
    const okA = forwardOkSegment_AEnd(segA, p, eps * 100); // Relaxed for robustness

    // Check B constraint: must be on forward extension from B's start
    const okB = forwardOkSegment_BStart(segB, p, eps * 100);

    if (!okA || !okB) continue;

    // 3) Score candidates for deterministic selection
    // Primary: distance to midpoint of reference endpoints
    const mid = mul(add(aEndRef, bStartRef), 0.5);
    const dMid = dist(p, mid);

    // Secondary: sum of distances to endpoints (helps pick correct branch)
    const dEnds = dist(p, aEndRef) + dist(p, bStartRef);

    valids.push({
      p,
      scorePrimary: dMid,
      scoreSecondary: dEnds,
      meta: cand.meta,
    });
  }

  // 4) Choose best candidate
  const sorted = stableSortCandidates(valids);
  const chosen = sorted[0];

  if (chosen) {
    return { kind: 'OK', p: chosen.p, chosen };
  }

  // 5) Deterministic fallback ladder

  // Fallback 1: MITER for LINE-LINE only
  if (segA.kind === 'LINE' && segB.kind === 'LINE') {
    const miter = tryMiterFallback(
      segA as SegLine,
      segB as SegLine,
      aEndRef,
      bStartRef,
      eps
    );
    if (miter) return miter;
  }

  // Fallback 2: FILLET with tool radius (Step 10.5.8)
  if (toolR > EPS_POS) {
    const fillet = tryFilletFallback(segA, segB, toolR);
    if (fillet) return fillet;
  }

  // Fallback 3: Connector line (always works, deterministic)
  return tryConnectorFallback(segA, segB, aEndRef, bStartRef);
}

// ============================================================================
// Simplified API for Integration
// ============================================================================

export interface ConstrainedJoinResult {
  /** Whether a valid join was found */
  ok: boolean;
  /** Join point for segment A end */
  aEnd: Vec2;
  /** Join point for segment B start */
  bStart: Vec2;
  /** Optional connector segment (if fallback) */
  connector?: SegLine;
  /** Optional fillet arc (Step 10.5.8) */
  fillet?: FilletArc;
  /** Reason for fallback (if any) */
  reason?: string;
  /** Join method used */
  method: 'OK' | 'MITER' | 'FILLET' | 'CONNECTOR' | 'BLOCK';
}

/**
 * Solve constrained join and return simplified result.
 */
export function solveConstrainedJoin(
  segA: Segment,
  segB: Segment,
  aEndRef: Vec2,
  bStartRef: Vec2,
  toolR: number = 0
): ConstrainedJoinResult {
  const result = solveJoinConstrained(segA, segB, aEndRef, bStartRef, toolR);

  switch (result.kind) {
    case 'OK':
      return {
        ok: true,
        aEnd: result.p,
        bStart: result.p,
        method: 'OK',
      };

    case 'FALLBACK_MITER':
      return {
        ok: true,
        aEnd: result.p,
        bStart: result.p,
        reason: result.reason,
        method: 'MITER',
      };

    case 'FALLBACK_FILLET':
      // Fillet arc provides tangent points for segment trimming
      return {
        ok: true,
        aEnd: result.fillet.tangentA,
        bStart: result.fillet.tangentB,
        fillet: result.fillet,
        reason: result.reason,
        method: 'FILLET',
      };

    case 'FALLBACK_CONNECTOR':
      return {
        ok: false,
        aEnd: result.connector.a,
        bStart: result.connector.b,
        connector: result.connector,
        reason: result.reason,
        method: 'CONNECTOR',
      };

    case 'BLOCK_GATE':
      // Fall back to connector as last resort
      return {
        ok: false,
        aEnd: aEndRef,
        bStart: bStartRef,
        connector: { kind: 'LINE', a: aEndRef, b: bStartRef },
        reason: result.reason,
        method: 'BLOCK',
      };
  }
}
