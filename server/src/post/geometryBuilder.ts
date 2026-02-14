/**
 * Geometry Builder
 *
 * Step 10.5.4: Build Path objects from segment lists
 *
 * Features:
 * - Continuity checking with epsilon tolerance
 * - Automatic snap for small gaps
 * - Winding direction detection and normalization
 * - Path reversal for winding correction
 */

import type { Path, Pt, Segment, SegLine, SegArc } from './planTypes.js';
import { segmentStart, segmentEnd } from './planTypes.js';

// ============================================================================
// Constants
// ============================================================================

/** Epsilon for point equality checks (mm) */
const EPS = 1e-6;

// ============================================================================
// Point Utilities
// ============================================================================

/**
 * Check if two points are nearly equal within epsilon.
 */
export function near(a: Pt, b: Pt, eps: number = EPS): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/**
 * Calculate distance between two points.
 */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// ============================================================================
// Winding Detection
// ============================================================================

/**
 * Calculate signed area of a polygon (Shoelace formula).
 * Positive = CCW, Negative = CW
 */
function signedArea(points: Pt[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/**
 * Detect winding direction from path vertices.
 * Uses sampled points from line segments.
 */
function detectWinding(segs: Segment[]): 'CW' | 'CCW' {
  // Sample points from line segments
  const pts: Pt[] = [];
  for (const s of segs) {
    if (s.kind === 'LINE') {
      pts.push(s.a);
    } else {
      // Sample start point of arc
      pts.push(s.start);
    }
  }

  // Need at least 3 points to determine winding
  if (pts.length < 3) return 'CCW';

  const area = signedArea(pts);
  return area >= 0 ? 'CCW' : 'CW';
}

// ============================================================================
// Path Reversal
// ============================================================================

/**
 * Reverse a single segment.
 */
function reverseSegment(seg: Segment): Segment {
  if (seg.kind === 'LINE') {
    return {
      kind: 'LINE',
      a: seg.b,
      b: seg.a,
    };
  }
  // Arc: swap start/end, flip cw
  return {
    kind: 'ARC',
    c: seg.c,
    r: seg.r,
    startDeg: seg.endDeg,
    endDeg: seg.startDeg,
    cw: !seg.cw,
    start: seg.end,
    end: seg.start,
  };
}

/**
 * Reverse a path (flip travel direction).
 */
export function reversePath(path: Path): Path {
  const reversedSegs = [...path.segs].reverse().map(reverseSegment);
  return {
    closed: path.closed,
    segs: reversedSegs,
    winding: path.winding === 'CCW' ? 'CW' : 'CCW',
  };
}

// ============================================================================
// Continuity Enforcement
// ============================================================================

/**
 * Snap segment endpoints to ensure continuity.
 * Modifies segments in place.
 */
function enforceChainContinuity(segs: Segment[], snapThreshold: number = 0.1): void {
  for (let i = 0; i < segs.length - 1; i++) {
    const currentEnd = segmentEnd(segs[i]);
    const nextStart = segmentStart(segs[i + 1]);

    if (!near(currentEnd, nextStart, snapThreshold)) {
      // Snap next segment's start to current segment's end
      if (segs[i + 1].kind === 'LINE') {
        (segs[i + 1] as SegLine).a = { ...currentEnd };
      } else {
        (segs[i + 1] as SegArc).start = { ...currentEnd };
      }
    }
  }
}

/**
 * Snap path closure (last end to first start).
 */
function enforceClosureContinuity(segs: Segment[], snapThreshold: number = 0.1): void {
  if (segs.length === 0) return;

  const firstStart = segmentStart(segs[0]);
  const lastEnd = segmentEnd(segs[segs.length - 1]);

  if (!near(firstStart, lastEnd, snapThreshold)) {
    // Snap last segment's end to first segment's start
    const lastSeg = segs[segs.length - 1];
    if (lastSeg.kind === 'LINE') {
      (lastSeg as SegLine).b = { ...firstStart };
    } else {
      (lastSeg as SegArc).end = { ...firstStart };
    }
  }
}

// ============================================================================
// Path Building
// ============================================================================

export interface BuildPathOptions {
  /** Whether path forms a closed loop */
  closed: boolean;
  /** Expected winding direction (will reverse if needed) */
  expectedWinding?: 'CW' | 'CCW';
  /** Snap threshold for continuity (mm) */
  snapThreshold?: number;
}

/**
 * Build a Path from a list of segments.
 *
 * - Ensures segment chain continuity
 * - Detects and optionally normalizes winding direction
 * - Handles both open and closed paths
 *
 * @param segs - Array of LINE or ARC segments
 * @param options - Build options
 * @returns Validated and normalized Path
 */
export function buildPathFromSegments(
  segs: Segment[],
  options: BuildPathOptions
): Path {
  const { closed, expectedWinding, snapThreshold = 0.1 } = options;

  if (segs.length === 0) {
    return { closed, segs: [], winding: 'CCW' };
  }

  // Make a copy to avoid mutating input
  const segments = segs.map(s => ({ ...s })) as Segment[];

  // Enforce chain continuity
  enforceChainContinuity(segments, snapThreshold);

  // Enforce closure if closed path
  if (closed) {
    enforceClosureContinuity(segments, snapThreshold);
  }

  // Detect winding
  const winding = detectWinding(segments);

  let path: Path = { closed, segs: segments, winding };

  // Reverse if winding doesn't match expected
  if (expectedWinding && path.winding !== expectedWinding) {
    path = reversePath(path);
  }

  return path;
}

// ============================================================================
// Path Validation
// ============================================================================

export interface PathValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a path for G-code generation.
 */
export function validatePath(path: Path): PathValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (path.segs.length === 0) {
    errors.push('Path has no segments');
    return { valid: false, errors, warnings };
  }

  // Check segment continuity
  for (let i = 0; i < path.segs.length - 1; i++) {
    const currentEnd = segmentEnd(path.segs[i]);
    const nextStart = segmentStart(path.segs[i + 1]);
    const gap = dist(currentEnd, nextStart);

    if (gap > 0.1) {
      errors.push(`Gap of ${gap.toFixed(3)}mm between segments ${i} and ${i + 1}`);
    } else if (gap > EPS) {
      warnings.push(`Small gap of ${gap.toFixed(6)}mm at segment ${i}`);
    }
  }

  // Check closure for closed paths
  if (path.closed && path.segs.length > 0) {
    const firstStart = segmentStart(path.segs[0]);
    const lastEnd = segmentEnd(path.segs[path.segs.length - 1]);
    const closureGap = dist(firstStart, lastEnd);

    if (closureGap > 0.1) {
      errors.push(`Closure gap of ${closureGap.toFixed(3)}mm`);
    } else if (closureGap > EPS) {
      warnings.push(`Small closure gap of ${closureGap.toFixed(6)}mm`);
    }
  }

  // Validate arc segments
  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i];
    if (seg.kind === 'ARC') {
      if (seg.r <= 0) {
        errors.push(`Arc segment ${i} has invalid radius: ${seg.r}`);
      }
      // Check if start/end points lie on arc
      const startDist = dist(seg.start, seg.c);
      const endDist = dist(seg.end, seg.c);
      if (Math.abs(startDist - seg.r) > 0.1) {
        warnings.push(`Arc segment ${i} start point off-radius by ${Math.abs(startDist - seg.r).toFixed(3)}mm`);
      }
      if (Math.abs(endDist - seg.r) > 0.1) {
        warnings.push(`Arc segment ${i} end point off-radius by ${Math.abs(endDist - seg.r).toFixed(3)}mm`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Path Creation Helpers
// ============================================================================

/**
 * Create a rectangular path (closed, CCW winding).
 */
export function createRectPath(
  x: number,
  y: number,
  w: number,
  h: number
): Path {
  const segs: SegLine[] = [
    { kind: 'LINE', a: { x, y }, b: { x: x + w, y } },
    { kind: 'LINE', a: { x: x + w, y }, b: { x: x + w, y: y + h } },
    { kind: 'LINE', a: { x: x + w, y: y + h }, b: { x, y: y + h } },
    { kind: 'LINE', a: { x, y: y + h }, b: { x, y } },
  ];

  return {
    closed: true,
    segs,
    winding: 'CCW',
  };
}

/**
 * Create a rounded rectangle path (closed, CCW winding).
 */
export function createRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): Path {
  // Clamp radius to half of smallest dimension
  const maxR = Math.min(w, h) / 2;
  const radius = Math.min(r, maxR);

  if (radius < 0.1) {
    return createRectPath(x, y, w, h);
  }

  const segs: Segment[] = [];

  // Bottom edge (left to right, excluding corners)
  segs.push({
    kind: 'LINE',
    a: { x: x + radius, y },
    b: { x: x + w - radius, y },
  });

  // Bottom-right corner arc
  segs.push({
    kind: 'ARC',
    c: { x: x + w - radius, y: y + radius },
    r: radius,
    startDeg: 270,
    endDeg: 360,
    cw: false,
    start: { x: x + w - radius, y },
    end: { x: x + w, y: y + radius },
  });

  // Right edge
  segs.push({
    kind: 'LINE',
    a: { x: x + w, y: y + radius },
    b: { x: x + w, y: y + h - radius },
  });

  // Top-right corner arc
  segs.push({
    kind: 'ARC',
    c: { x: x + w - radius, y: y + h - radius },
    r: radius,
    startDeg: 0,
    endDeg: 90,
    cw: false,
    start: { x: x + w, y: y + h - radius },
    end: { x: x + w - radius, y: y + h },
  });

  // Top edge (right to left)
  segs.push({
    kind: 'LINE',
    a: { x: x + w - radius, y: y + h },
    b: { x: x + radius, y: y + h },
  });

  // Top-left corner arc
  segs.push({
    kind: 'ARC',
    c: { x: x + radius, y: y + h - radius },
    r: radius,
    startDeg: 90,
    endDeg: 180,
    cw: false,
    start: { x: x + radius, y: y + h },
    end: { x, y: y + h - radius },
  });

  // Left edge
  segs.push({
    kind: 'LINE',
    a: { x, y: y + h - radius },
    b: { x, y: y + radius },
  });

  // Bottom-left corner arc
  segs.push({
    kind: 'ARC',
    c: { x: x + radius, y: y + radius },
    r: radius,
    startDeg: 180,
    endDeg: 270,
    cw: false,
    start: { x, y: y + radius },
    end: { x: x + radius, y },
  });

  return {
    closed: true,
    segs,
    winding: 'CCW',
  };
}
