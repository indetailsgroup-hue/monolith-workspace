// src/core/manufacturing/verify/geom/distanceToSeg.ts
/**
 * Point-to-Segment Distance Calculations.
 *
 * Robust distance calculations for LINE and ARC segments.
 * Used for geometry comparison sampling.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

import { Point2D, Seg, LineSeg, ArcSeg, isAngleInSweep } from "./canonicalGeom.v1";
import { CutTraceSeg } from "./irExtract.v1";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Distance result.
 */
export interface DistanceResult {
  /** Distance to segment (mm) */
  d: number;

  /** Nearest point on segment */
  q: Point2D;

  /** Parameter along segment (0-1) */
  t: number;

  /** For arcs: whether point projects onto sweep */
  onSweep?: boolean;
}

// =============================================================================
// LINE SEGMENT
// =============================================================================

/**
 * Calculate distance from point to line segment.
 *
 * @param p Query point
 * @param a Segment start
 * @param b Segment end
 * @returns Distance result
 */
export function distPointToLineSeg(
  p: Point2D,
  a: Point2D,
  b: Point2D
): DistanceResult {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) {
    // Degenerate segment (point)
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    return { d, q: { ...a }, t: 0 };
  }

  // Project p onto line
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;

  // Clamp to segment
  t = Math.max(0, Math.min(1, t));

  // Nearest point
  const q: Point2D = {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };

  const d = Math.hypot(p.x - q.x, p.y - q.y);

  return { d, q, t };
}

// =============================================================================
// ARC SEGMENT
// =============================================================================

/**
 * Calculate distance from point to arc segment.
 *
 * @param p Query point
 * @param c Arc center
 * @param r Arc radius
 * @param a0 Start angle (radians)
 * @param a1 End angle (radians)
 * @param cw Clockwise direction
 * @returns Distance result
 */
export function distPointToArcSeg(
  p: Point2D,
  c: Point2D,
  r: number,
  a0: number,
  a1: number,
  cw: boolean
): DistanceResult {
  // Vector from center to point
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dist = Math.hypot(dx, dy);

  // Angle to point from center
  const angleP = Math.atan2(dy, dx);

  // Check if angle is within sweep
  const onSweep = isAngleInSweep(angleP, a0, a1, cw);

  if (onSweep) {
    // Point projects onto arc - nearest point is on circle at angleP
    const q: Point2D = {
      x: c.x + r * Math.cos(angleP),
      y: c.y + r * Math.sin(angleP),
    };
    const d = Math.abs(dist - r);

    // Calculate t (parameter along arc)
    const t = calculateArcT(angleP, a0, a1, cw);

    return { d, q, t, onSweep: true };
  } else {
    // Point doesn't project onto arc - check endpoints
    const p0: Point2D = {
      x: c.x + r * Math.cos(a0),
      y: c.y + r * Math.sin(a0),
    };
    const p1: Point2D = {
      x: c.x + r * Math.cos(a1),
      y: c.y + r * Math.sin(a1),
    };

    const d0 = Math.hypot(p.x - p0.x, p.y - p0.y);
    const d1 = Math.hypot(p.x - p1.x, p.y - p1.y);

    if (d0 <= d1) {
      return { d: d0, q: p0, t: 0, onSweep: false };
    } else {
      return { d: d1, q: p1, t: 1, onSweep: false };
    }
  }
}

/**
 * Calculate parameter t for angle on arc.
 */
function calculateArcT(
  angle: number,
  a0: number,
  a1: number,
  cw: boolean
): number {
  const TWO_PI = Math.PI * 2;
  const normalize = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

  const na = normalize(angle);
  const n0 = normalize(a0);
  const n1 = normalize(a1);

  let sweep: number;
  let fromStart: number;

  if (cw) {
    // Clockwise
    sweep = n0 >= n1 ? n0 - n1 : n0 + TWO_PI - n1;
    fromStart = n0 >= na ? n0 - na : n0 + TWO_PI - na;
  } else {
    // Counter-clockwise
    sweep = n1 >= n0 ? n1 - n0 : n1 + TWO_PI - n0;
    fromStart = na >= n0 ? na - n0 : na + TWO_PI - n0;
  }

  if (sweep < 1e-9) return 0;
  return Math.max(0, Math.min(1, fromStart / sweep));
}

// =============================================================================
// GENERIC SEGMENT
// =============================================================================

/**
 * Calculate distance from point to canonical segment.
 */
export function distPointToSeg(p: Point2D, seg: Seg): DistanceResult {
  if (seg.kind === "LINE") {
    return distPointToLineSeg(p, seg.a, seg.b);
  } else {
    return distPointToArcSeg(p, seg.c, seg.r, seg.a0, seg.a1, seg.cw);
  }
}

/**
 * Calculate distance from point to cut trace segment.
 */
export function distPointToCutSeg(p: Point2D, seg: CutTraceSeg): DistanceResult {
  if (seg.kind === "LINE") {
    return distPointToLineSeg(p, seg.a, seg.b);
  } else if (seg.c && seg.r !== undefined) {
    // For arc, we need to calculate a0/a1 from endpoints
    const a0 = Math.atan2(seg.a.y - seg.c.y, seg.a.x - seg.c.x);
    const a1 = Math.atan2(seg.b.y - seg.c.y, seg.b.x - seg.c.x);
    return distPointToArcSeg(p, seg.c, seg.r, a0, a1, seg.cw ?? false);
  } else {
    // Treat as line if arc data incomplete
    return distPointToLineSeg(p, seg.a, seg.b);
  }
}

// =============================================================================
// PATH DISTANCE
// =============================================================================

/**
 * Calculate distance from point to path (minimum distance to any segment).
 */
export function distPointToPath(
  p: Point2D,
  segs: Seg[]
): DistanceResult {
  if (segs.length === 0) {
    return { d: Infinity, q: p, t: 0 };
  }

  let minResult: DistanceResult = { d: Infinity, q: p, t: 0 };

  for (const seg of segs) {
    const result = distPointToSeg(p, seg);
    if (result.d < minResult.d) {
      minResult = result;
    }
  }

  return minResult;
}

/**
 * Calculate distance from point to executed path.
 */
export function distPointToExecutedPath(
  p: Point2D,
  segs: CutTraceSeg[]
): DistanceResult {
  if (segs.length === 0) {
    return { d: Infinity, q: p, t: 0 };
  }

  let minResult: DistanceResult = { d: Infinity, q: p, t: 0 };

  for (const seg of segs) {
    const result = distPointToCutSeg(p, seg);
    if (result.d < minResult.d) {
      minResult = result;
    }
  }

  return minResult;
}

// =============================================================================
// SAMPLING
// =============================================================================

/**
 * Sample points along a line segment.
 */
export function sampleLineSeg(
  a: Point2D,
  b: Point2D,
  stepMm: number
): Point2D[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return [{ ...a }];

  const samples: Point2D[] = [];
  const count = Math.max(1, Math.ceil(len / stepMm));

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    samples.push({
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
    });
  }

  return samples;
}

/**
 * Sample points along an arc segment.
 */
export function sampleArcSeg(
  c: Point2D,
  r: number,
  a0: number,
  a1: number,
  cw: boolean,
  stepMm: number
): Point2D[] {
  // Calculate arc length
  let sweep = a1 - a0;
  if (cw) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  sweep = Math.abs(sweep);

  const arcLen = r * sweep;
  if (arcLen < 1e-9) {
    return [{ x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }];
  }

  const samples: Point2D[] = [];
  const count = Math.max(1, Math.ceil(arcLen / stepMm));
  const dTheta = sweep / count;

  for (let i = 0; i <= count; i++) {
    const angle = cw ? a0 - i * dTheta : a0 + i * dTheta;
    samples.push({
      x: c.x + r * Math.cos(angle),
      y: c.y + r * Math.sin(angle),
    });
  }

  return samples;
}

/**
 * Sample points along a canonical segment.
 */
export function sampleSeg(seg: Seg, stepMm: number): Point2D[] {
  if (seg.kind === "LINE") {
    return sampleLineSeg(seg.a, seg.b, stepMm);
  } else {
    return sampleArcSeg(seg.c, seg.r, seg.a0, seg.a1, seg.cw, stepMm);
  }
}

/**
 * Sample points along a canonical path.
 */
export function samplePath(segs: Seg[], stepMm: number): Point2D[] {
  const allSamples: Point2D[] = [];

  for (let i = 0; i < segs.length; i++) {
    const samples = sampleSeg(segs[i], stepMm);
    // Skip first point if not first segment (avoid duplicates)
    const startIdx = i === 0 ? 0 : 1;
    for (let j = startIdx; j < samples.length; j++) {
      allSamples.push(samples[j]);
    }
  }

  return allSamples;
}

/**
 * Sample points along a cut trace path.
 */
export function sampleCutPath(segs: CutTraceSeg[], stepMm: number): Point2D[] {
  const allSamples: Point2D[] = [];

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    let samples: Point2D[];

    if (seg.kind === "LINE") {
      samples = sampleLineSeg(seg.a, seg.b, stepMm);
    } else if (seg.c && seg.r !== undefined) {
      const a0 = Math.atan2(seg.a.y - seg.c.y, seg.a.x - seg.c.x);
      const a1 = Math.atan2(seg.b.y - seg.c.y, seg.b.x - seg.c.x);
      samples = sampleArcSeg(seg.c, seg.r, a0, a1, seg.cw ?? false, stepMm);
    } else {
      samples = sampleLineSeg(seg.a, seg.b, stepMm);
    }

    const startIdx = i === 0 ? 0 : 1;
    for (let j = startIdx; j < samples.length; j++) {
      allSamples.push(samples[j]);
    }
  }

  return allSamples;
}
