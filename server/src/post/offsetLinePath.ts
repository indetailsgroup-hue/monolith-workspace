/**
 * Line Path Offset
 *
 * Step 10.5.4: Offset for line-only closed paths (miter join)
 *
 * Used for finishing passes where the tool needs to cut
 * at an offset from the original profile.
 *
 * MVP Scope:
 * - Supports closed, line-only paths
 * - Uses miter join at corners
 * - Falls back gracefully for complex geometry
 */

import type { Path, Pt, SegLine } from './planTypes.js';
import { isLineOnlyPath } from './planTypes.js';

// ============================================================================
// Vector Operations
// ============================================================================

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

function mul(v: Pt, s: number): Pt {
  return { x: v.x * s, y: v.y * s };
}

function len(v: Pt): number {
  return Math.hypot(v.x, v.y);
}

function unit(v: Pt): Pt {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Perpendicular vector (90° CCW rotation).
 */
function perp(v: Pt): Pt {
  return { x: -v.y, y: v.x };
}

/**
 * Cross product (z-component of 3D cross).
 */
function cross(a: Pt, b: Pt): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Dot product.
 */
function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

// ============================================================================
// Line Intersection
// ============================================================================

/**
 * Intersect two lines defined by point + direction.
 * Returns null if lines are parallel.
 */
function lineIntersect(
  p1: Pt,
  d1: Pt,
  p2: Pt,
  d2: Pt
): Pt | null {
  const det = cross(d1, d2);
  if (Math.abs(det) < 1e-9) {
    // Parallel lines
    return null;
  }

  const diff = sub(p2, p1);
  const t = cross(diff, d2) / det;

  return {
    x: p1.x + d1.x * t,
    y: p1.y + d1.y * t,
  };
}

// ============================================================================
// Offset Results
// ============================================================================

export interface OffsetResult {
  /** Whether offset was successful */
  success: boolean;
  /** Offset path (if successful) */
  path?: Path;
  /** Reason for failure (if unsuccessful) */
  reason?: string;
}

// ============================================================================
// Line Path Offset (Miter Join)
// ============================================================================

/**
 * Offset a closed, line-only path using miter joins.
 *
 * @param path - Input path (must be closed and line-only)
 * @param d - Offset distance (positive = outward for CCW, inward for CW)
 * @returns Offset result
 */
export function offsetClosedLinePath(
  path: Path,
  d: number
): OffsetResult {
  // Validation
  if (!path.closed) {
    return { success: false, reason: 'Path must be closed' };
  }

  if (!isLineOnlyPath(path)) {
    return { success: false, reason: 'Path must be line-only' };
  }

  if (path.segs.length < 3) {
    return { success: false, reason: 'Path must have at least 3 segments' };
  }

  // Extract vertices (line path: segs[i].a are the vertices)
  const segs = path.segs as SegLine[];
  const vertices: Pt[] = segs.map(s => s.a);
  const n = vertices.length;

  // Determine offset sign based on winding
  // CCW: positive d = outward (left of travel)
  // CW: positive d = inward (right of travel)
  const sign = path.winding === 'CCW' ? 1 : -1;
  const offsetDist = d * sign;

  // Calculate offset vertices using miter join
  const offsetVertices: Pt[] = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    // Edge directions
    const d1 = unit(sub(curr, prev)); // Direction of incoming edge
    const d2 = unit(sub(next, curr)); // Direction of outgoing edge

    // Edge normals (perpendicular, pointing left of travel)
    const n1 = perp(d1);
    const n2 = perp(d2);

    // Offset lines
    const p1 = add(prev, mul(n1, offsetDist));
    const p2 = add(curr, mul(n2, offsetDist));

    // Find intersection (miter point)
    const miter = lineIntersect(p1, d1, p2, d2);

    if (miter) {
      // Check for degenerate miter (very sharp corners)
      const miterDist = len(sub(miter, curr));
      const maxMiter = Math.abs(offsetDist) * 10; // Limit miter to 10x offset

      if (miterDist > maxMiter) {
        // Fall back to average of offset points
        const avg = add(
          add(curr, mul(n1, offsetDist)),
          mul(sub(add(curr, mul(n2, offsetDist)), add(curr, mul(n1, offsetDist))), 0.5)
        );
        offsetVertices.push(avg);
      } else {
        offsetVertices.push(miter);
      }
    } else {
      // Parallel edges (very rare for closed path), use perpendicular offset
      offsetVertices.push(add(curr, mul(n1, offsetDist)));
    }
  }

  // Build offset path segments
  const offsetSegs: SegLine[] = [];
  for (let i = 0; i < n; i++) {
    offsetSegs.push({
      kind: 'LINE',
      a: offsetVertices[i],
      b: offsetVertices[(i + 1) % n],
    });
  }

  return {
    success: true,
    path: {
      closed: true,
      segs: offsetSegs,
      winding: path.winding,
    },
  };
}

// ============================================================================
// Inset/Outset Helpers
// ============================================================================

/**
 * Inset a path (shrink toward interior).
 */
export function insetPath(path: Path, distance: number): OffsetResult {
  // Inset = negative outset for CCW, positive for CW
  const d = path.winding === 'CCW' ? -distance : distance;
  return offsetClosedLinePath(path, d);
}

/**
 * Outset a path (expand toward exterior).
 */
export function outsetPath(path: Path, distance: number): OffsetResult {
  // Outset = positive for CCW, negative for CW
  const d = path.winding === 'CCW' ? distance : -distance;
  return offsetClosedLinePath(path, d);
}

// ============================================================================
// Finishing Pass Offset
// ============================================================================

/**
 * Calculate offset path for finishing pass.
 *
 * For outside cuts (typical profile): tool center is outside the part
 * For inside cuts (pockets): tool center is inside the cut
 *
 * @param path - Original profile path
 * @param finishAllowance - Material to leave for finishing (mm)
 * @param outsideCut - Whether cutting on outside of profile
 * @returns Offset result
 */
export function finishingOffset(
  path: Path,
  finishAllowance: number,
  outsideCut: boolean = true
): OffsetResult {
  if (!path.closed || !isLineOnlyPath(path)) {
    // Can't offset non-line or open paths in MVP
    return {
      success: false,
      reason: 'Finishing offset requires closed line-only path',
    };
  }

  // For outside cuts on CCW path: roughing cuts further out
  // Finishing cuts at final dimension
  // So roughing path = original path + finish allowance (outward)
  const roughingOffset = outsideCut ? finishAllowance : -finishAllowance;

  return offsetClosedLinePath(path, roughingOffset);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a path can be offset.
 */
export function canOffsetPath(path: Path): boolean {
  return path.closed && isLineOnlyPath(path) && path.segs.length >= 3;
}

/**
 * Calculate the minimum safe offset distance for a path.
 * (Beyond this, the path may self-intersect)
 */
export function minSafeInset(path: Path): number {
  if (!path.closed || !isLineOnlyPath(path)) {
    return 0;
  }

  // Find minimum "inscribed circle" radius approximation
  // This is a simplified check - proper algorithm would compute medial axis
  const segs = path.segs as SegLine[];
  const vertices = segs.map(s => s.a);
  const n = vertices.length;

  let minDist = Infinity;

  // Check distance from each vertex to opposite edges
  for (let i = 0; i < n; i++) {
    const v = vertices[i];

    for (let j = 0; j < n; j++) {
      if (j === i || j === (i - 1 + n) % n || j === (i + 1) % n) {
        continue; // Skip adjacent edges
      }

      const a = vertices[j];
      const b = vertices[(j + 1) % n];

      // Distance from vertex to edge
      const edge = sub(b, a);
      const edgeLen = len(edge);
      if (edgeLen < 1e-6) continue;

      const toVertex = sub(v, a);
      const t = dot(toVertex, edge) / (edgeLen * edgeLen);

      if (t >= 0 && t <= 1) {
        const closest = add(a, mul(edge, t));
        const dist = len(sub(v, closest));
        minDist = Math.min(minDist, dist);
      }
    }
  }

  return minDist / 2;
}
