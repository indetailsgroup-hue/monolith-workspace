/**
 * Geometry Guards - Self-Intersection and Winding Validation
 *
 * Step 10.5.7: Factory-safe guards that prevent unsafe toolpaths.
 *
 * Before emitting G-code, offset paths MUST pass these guards:
 * 1. No self-intersections (would cause tool collision)
 * 2. Consistent winding (no inverted normals)
 *
 * Any BLOCK issue prevents G-code export via the Gate system.
 */

import type { Path, Segment, SegLine, SegArc } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  sub,
  len,
  cross,
  dot,
  add,
  mul,
  dist,
  norm,
  almostEq,
  degToRad,
  pointAtAngleDeg,
} from './mathCore.js';
import {
  segmentStartPoint,
  segmentEndPoint,
  lineDirLen,
} from './constraints.js';
import { arcSweepDeg } from './arcSweep.js';
import {
  intersectLineLineInfinite,
  intersectLineCircle,
  intersectCircleCircle,
} from './joinConstrained.js';

// ============================================================================
// Types
// ============================================================================

export interface PreflightIssue {
  /** Issue code for programmatic handling */
  code: string;
  /** Severity: BLOCK prevents export, WARN allows with warning */
  severity: 'BLOCK' | 'WARN';
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint for deduplication */
  fingerprint: string;
}

export interface GuardResult {
  /** Whether path passes all guards */
  valid: boolean;
  /** List of issues found */
  issues: PreflightIssue[];
}

// ============================================================================
// Segment-Segment Intersection Detection
// ============================================================================

/**
 * Check if two line segments intersect (not at endpoints).
 */
function linesIntersectInterior(
  segA: SegLine,
  segB: SegLine,
  eps = EPS_POS * 10
): boolean {
  const p = intersectLineLineInfinite(segA, segB, EPS_POS * 0.01);
  if (!p) return false;

  // Check if intersection is interior to both segments (not at endpoints)
  const { dir: dirA, L: LA } = lineDirLen(segA);
  const tA = dot(sub(p, segA.a), dirA);

  const { dir: dirB, L: LB } = lineDirLen(segB);
  const tB = dot(sub(p, segB.a), dirB);

  // Interior means not at 0 or L (with tolerance)
  const interiorA = tA > eps && tA < LA - eps;
  const interiorB = tB > eps && tB < LB - eps;

  return interiorA && interiorB;
}

/**
 * Check if line segment intersects arc (not at endpoints).
 */
function lineArcIntersectInterior(
  line: SegLine,
  arc: SegArc,
  eps = EPS_POS * 10
): boolean {
  const intersections = intersectLineCircle(line, arc.c, arc.r, EPS_POS * 0.01);

  for (const p of intersections) {
    // Check if on line interior
    const { dir, L } = lineDirLen(line);
    const t = dot(sub(p, line.a), dir);
    if (t <= eps || t >= L - eps) continue;

    // Check if on arc interior (not at start/end)
    const arcStart = pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
    const arcEnd = pointAtAngleDeg(arc.c, arc.r, arc.endDeg);

    const distToStart = dist(p, arcStart);
    const distToEnd = dist(p, arcEnd);

    if (distToStart > eps && distToEnd > eps) {
      // Check if actually on arc sweep
      const angle = Math.atan2(p.y - arc.c.y, p.x - arc.c.x) * (180 / Math.PI);
      const normAngle = ((angle % 360) + 360) % 360;

      // This is a simplified check - could be more robust
      return true;
    }
  }

  return false;
}

/**
 * Check if two arcs intersect (not at endpoints).
 */
function arcsIntersectInterior(
  arcA: SegArc,
  arcB: SegArc,
  eps = EPS_POS * 10
): boolean {
  const intersections = intersectCircleCircle(arcA.c, arcA.r, arcB.c, arcB.r, EPS_POS * 0.01);

  for (const p of intersections) {
    // Check if on both arc interiors
    const aStart = pointAtAngleDeg(arcA.c, arcA.r, arcA.startDeg);
    const aEnd = pointAtAngleDeg(arcA.c, arcA.r, arcA.endDeg);
    const bStart = pointAtAngleDeg(arcB.c, arcB.r, arcB.startDeg);
    const bEnd = pointAtAngleDeg(arcB.c, arcB.r, arcB.endDeg);

    const distToAStart = dist(p, aStart);
    const distToAEnd = dist(p, aEnd);
    const distToBStart = dist(p, bStart);
    const distToBEnd = dist(p, bEnd);

    if (distToAStart > eps && distToAEnd > eps &&
        distToBStart > eps && distToBEnd > eps) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two segments intersect (not at shared endpoints).
 */
function segmentsIntersectInterior(
  segA: Segment,
  segB: Segment,
  iA: number,
  iB: number,
  eps = EPS_POS * 10
): boolean {
  // Skip adjacent segments (they share an endpoint)
  if (Math.abs(iA - iB) <= 1) return false;

  if (segA.kind === 'LINE' && segB.kind === 'LINE') {
    return linesIntersectInterior(segA as SegLine, segB as SegLine, eps);
  }

  if (segA.kind === 'LINE' && segB.kind === 'ARC') {
    return lineArcIntersectInterior(segA as SegLine, segB as SegArc, eps);
  }

  if (segA.kind === 'ARC' && segB.kind === 'LINE') {
    return lineArcIntersectInterior(segB as SegLine, segA as SegArc, eps);
  }

  if (segA.kind === 'ARC' && segB.kind === 'ARC') {
    return arcsIntersectInterior(segA as SegArc, segB as SegArc, eps);
  }

  return false;
}

// ============================================================================
// Self-Intersection Guard
// ============================================================================

/**
 * Check path for self-intersections.
 *
 * Uses O(n²) segment-segment intersection sweep.
 * Ignores adjacent segments (they share endpoints).
 */
export function guardNoSelfIntersect(path: Path): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const n = path.segs.length;

  // O(n²) pairwise check
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip first-last pair if closed (they're adjacent)
      if (path.closed && i === 0 && j === n - 1) continue;

      if (segmentsIntersectInterior(path.segs[i], path.segs[j], i, j)) {
        issues.push({
          code: 'SELF_INTERSECT',
          severity: 'BLOCK',
          detail: `Self-intersection detected between segments ${i} and ${j}`,
          fingerprint: `self-intersect:${i}-${j}`,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Winding Guard
// ============================================================================

/**
 * Calculate signed area of a path (approximation for paths with arcs).
 *
 * Positive area = CCW winding
 * Negative area = CW winding
 */
function calculateSignedArea(path: Path): number {
  let area = 0;

  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      const line = seg as SegLine;
      // Shoelace formula contribution
      area += (line.b.x - line.a.x) * (line.b.y + line.a.y);
    } else if (seg.kind === 'ARC') {
      // Approximate arc with chord + circular segment area
      const arc = seg as SegArc;
      const start = pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
      const end = pointAtAngleDeg(arc.c, arc.r, arc.endDeg);

      // Chord contribution
      area += (end.x - start.x) * (end.y + start.y);

      // Circular segment contribution (approximate)
      const sweepRad = degToRad(arcSweepDeg(arc));
      const segmentArea = 0.5 * arc.r * arc.r * (sweepRad - Math.sin(sweepRad));

      // Sign depends on arc direction
      if (arc.cw) {
        area -= segmentArea;
      } else {
        area += segmentArea;
      }
    }
  }

  return area / 2;
}

/**
 * Check that path winding matches expected direction.
 *
 * @param path - Path to check
 * @param expectedCCW - True if CCW winding expected, false for CW
 */
export function guardWindingConsistent(path: Path, expectedCCW: boolean): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  if (!path.closed) {
    // Open paths don't have winding
    return issues;
  }

  const area = calculateSignedArea(path);
  const isCCW = area > 0;

  if (isCCW !== expectedCCW) {
    issues.push({
      code: 'WINDING_MISMATCH',
      severity: 'BLOCK',
      detail: `Path winding is ${isCCW ? 'CCW' : 'CW'} but expected ${expectedCCW ? 'CCW' : 'CW'}`,
      fingerprint: `winding:${isCCW ? 'ccw' : 'cw'}-expected-${expectedCCW ? 'ccw' : 'cw'}`,
    });
  }

  return issues;
}

// ============================================================================
// Degenerate Segment Guard
// ============================================================================

/**
 * Check for degenerate (zero-length) segments.
 */
export function guardNoDegenerateSegments(path: Path): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i];
    const start = segmentStartPoint(seg);
    const end = segmentEndPoint(seg);

    if (dist(start, end) < EPS_POS * 10) {
      issues.push({
        code: 'DEGENERATE_SEGMENT',
        severity: 'WARN',
        detail: `Segment ${i} has zero length`,
        fingerprint: `degenerate:${i}`,
      });
    }

    // Check for degenerate arcs (zero radius)
    if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      if (arc.r < EPS_POS * 10) {
        issues.push({
          code: 'DEGENERATE_ARC',
          severity: 'BLOCK',
          detail: `Arc ${i} has zero radius`,
          fingerprint: `degenerate-arc:${i}`,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Gap Guard (Discontinuous Path)
// ============================================================================

/**
 * Check for gaps between consecutive segments.
 */
export function guardNoGaps(path: Path, maxGap = EPS_POS * 100): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const n = path.segs.length;

  for (let i = 0; i < n - 1; i++) {
    const end = segmentEndPoint(path.segs[i]);
    const start = segmentStartPoint(path.segs[i + 1]);
    const gap = dist(end, start);

    if (gap > maxGap) {
      issues.push({
        code: 'GAP_DETECTED',
        severity: 'WARN',
        detail: `Gap of ${gap.toFixed(4)}mm between segments ${i} and ${i + 1}`,
        fingerprint: `gap:${i}-${i + 1}`,
      });
    }
  }

  // Check closure gap for closed paths
  if (path.closed && n > 0) {
    const lastEnd = segmentEndPoint(path.segs[n - 1]);
    const firstStart = segmentStartPoint(path.segs[0]);
    const closureGap = dist(lastEnd, firstStart);

    if (closureGap > maxGap) {
      issues.push({
        code: 'CLOSURE_GAP',
        severity: 'WARN',
        detail: `Closure gap of ${closureGap.toFixed(4)}mm`,
        fingerprint: `closure-gap`,
      });
    }
  }

  return issues;
}

// ============================================================================
// Combined Guard
// ============================================================================

/**
 * Run all guards on a path.
 *
 * @param path - Path to validate
 * @param expectedCCW - Expected winding (true = CCW, false = CW)
 * @returns Combined guard result
 */
export function validatePathGeometry(path: Path, expectedCCW: boolean = true): GuardResult {
  const allIssues: PreflightIssue[] = [];

  // Run all guards
  allIssues.push(...guardNoDegenerateSegments(path));
  allIssues.push(...guardNoGaps(path));
  allIssues.push(...guardNoSelfIntersect(path));

  if (path.closed) {
    allIssues.push(...guardWindingConsistent(path, expectedCCW));
  }

  // Path is valid if no BLOCK issues
  const hasBlockIssue = allIssues.some((i) => i.severity === 'BLOCK');

  return {
    valid: !hasBlockIssue,
    issues: allIssues,
  };
}

/**
 * Quick validation - just check for BLOCK issues.
 */
export function isPathValid(path: Path): boolean {
  const result = validatePathGeometry(path);
  return result.valid;
}
