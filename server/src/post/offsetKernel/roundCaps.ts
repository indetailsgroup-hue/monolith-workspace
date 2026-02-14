/**
 * True Round Caps for Open Paths
 *
 * Step 10.5.7: Two modes for round caps:
 *
 * Mode A (Open Centerline): Tool follows centerline, lifts/rapids across gaps
 * - makeOpenRoundCapArc(): 180° arc at endpoint, starts and ends at same point E
 * - Creates smooth entry/exit for tab subpaths
 * - Arc center offset from E by |d| in normal direction
 *
 * Mode B (Stroke Outline): Full stroke outline with semicircle ends (legacy)
 * - offsetOpenPathTrueRoundCaps(): Creates closed stroke boundary
 * - Left offset + right offset + two semicircle caps
 */

import type { Path, Segment, SegLine, SegArc } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  add,
  sub,
  mul,
  len,
  norm,
  dot,
  perpLeft,
  angleOfPointDeg,
  pointAtAngleDeg,
  degToRad,
} from './mathCore.js';
import {
  segmentStartPoint,
  segmentEndPoint,
  segmentTangentAtStart,
  segmentTangentAtEnd,
} from './constraints.js';

// ============================================================================
// Types
// ============================================================================

export interface RoundCapResult {
  /** Whether cap creation was successful */
  success: boolean;
  /** The generated closed stroke outline path */
  path?: Path;
  /** Any warnings during generation */
  warnings: string[];
  /** Error message if unsuccessful */
  error?: string;
}

/**
 * Hint metadata for segments - controls emit behavior and role tracking.
 */
export interface SegHint {
  /** Whether to emit this segment in G-code */
  emit: boolean;
  /** Role of the segment for audit/debugging */
  role?: 'ROUND_CAP' | 'OFFSET_CORE' | 'JOIN_FILLET' | 'CONNECTOR';
}

/**
 * Extended segment with hint metadata.
 */
export interface SegEx {
  seg: Segment;
  hint?: SegHint;
}

// ============================================================================
// Mode A: Open Centerline Round Caps (180° loop at endpoint)
// ============================================================================

/**
 * Create a 180° round cap arc for OPEN CENTERLINE mode.
 *
 * This cap starts and ends at the same endpoint E, creating a smooth
 * loop for entry/exit. The arc center is offset from E by |d| in the
 * normal direction.
 *
 * Geometry:
 * - center = E + nOff * |d|  (where nOff is offset normal direction)
 * - radius = |d|
 * - start point = E
 * - end point = E (returns to same point after 180° sweep)
 * - tangent at E is continuous with path tangent
 *
 * @param endpoint - Path endpoint (E)
 * @param tangentUnit - Unit tangent along path travel direction at endpoint
 * @param offsetD - Offset distance (sign determines offset side)
 * @param isEndCap - true = end of path, false = start of path
 * @returns 180° arc segment, or null if |offsetD| is too small
 */
export function makeOpenRoundCapArc(
  endpoint: Vec2,
  tangentUnit: Vec2,
  offsetD: number,
  isEndCap: boolean
): SegArc | null {
  const r = Math.abs(offsetD);
  if (r < EPS_POS) return null;

  const t = norm(tangentUnit);
  const n = perpLeft(t);
  const sign = offsetD >= 0 ? 1 : -1;
  const nOff = mul(n, sign);

  // Center is offset to the "outside" of offset side
  const c = add(endpoint, mul(nOff, r));

  // Start angle: from center to endpoint
  const a0 = angleOfPointDeg(c, endpoint);

  // 180° sweep: direction is deterministic based on offset sign and cap position
  // - offsetD >= 0:
  //   - end cap => CCW 180° (outward bulge)
  //   - start cap => CW 180° (outward bulge)
  // - offsetD < 0:
  //   - end cap => CW 180°
  //   - start cap => CCW 180°
  const cw = offsetD >= 0 ? !isEndCap : isEndCap;

  // End angle after 180° sweep
  const a1 = cw
    ? ((a0 - 180 + 360) % 360)
    : ((a0 + 180) % 360);

  // Calculate actual end point (should be same as endpoint for 180° sweep)
  const endPt = pointAtAngleDeg(c, r, a1);

  return {
    kind: 'ARC',
    c,
    r,
    startDeg: a0,
    endDeg: a1,
    cw,
    start: endpoint,
    end: endPt,
  };
}

/**
 * Add round caps to an open path's segments (Mode A: centerline).
 *
 * Creates 180° cap arcs at both ends of the path. The emit flag
 * controls whether these caps are included in G-code output.
 *
 * @param segs - Path segments with hints
 * @param startTangent - Tangent at path start
 * @param endTangent - Tangent at path end
 * @param offsetD - Offset distance
 * @param emitCaps - Whether to emit cap arcs in G-code (policy from MachineProfile)
 * @returns Segments with caps added
 */
export function addOpenCapsCenterline(
  segs: SegEx[],
  startTangent: Vec2,
  endTangent: Vec2,
  offsetD: number,
  emitCaps: boolean
): SegEx[] {
  if (segs.length === 0) return segs;

  const startPt = segmentStartPoint(segs[0].seg);
  const endPt = segmentEndPoint(segs[segs.length - 1].seg);

  const capStart = makeOpenRoundCapArc(startPt, startTangent, offsetD, false);
  const capEnd = makeOpenRoundCapArc(endPt, endTangent, offsetD, true);

  const out: SegEx[] = [];

  // Prepend start cap
  if (capStart) {
    out.push({ seg: capStart, hint: { emit: emitCaps, role: 'ROUND_CAP' } });
  }

  // Add core segments
  out.push(...segs);

  // Append end cap
  if (capEnd) {
    out.push({ seg: capEnd, hint: { emit: emitCaps, role: 'ROUND_CAP' } });
  }

  return out;
}

// ============================================================================
// Cap Arc Generation
// ============================================================================

/**
 * Create a semicircle arc cap.
 *
 * @param center - Cap center (original path endpoint)
 * @param from - Start point of arc (one offset side)
 * @param to - End point of arc (other offset side)
 * @param cw - Arc direction (chosen for outer bulge)
 */
export function makeRoundCapArc(
  center: Vec2,
  from: Vec2,
  to: Vec2,
  cw: boolean
): SegArc {
  const r = len(sub(from, center));
  const a0 = angleOfPointDeg(center, from);
  const a1 = angleOfPointDeg(center, to);

  return {
    kind: 'ARC',
    c: center,
    r,
    startDeg: a0,
    endDeg: a1,
    cw,
    start: from,
    end: to,
  };
}

/**
 * Choose CW direction so that cap bulges outward relative to path tangent.
 *
 * Deterministic heuristic:
 * - For start cap: cap should bulge opposite to tangent direction
 * - For end cap: cap should bulge in tangent direction
 *
 * @param center - Cap center
 * @param from - Arc start point
 * @param to - Arc end point
 * @param tangent - Path tangent at endpoint (unit vector)
 * @param isStart - True if this is the start cap
 */
export function chooseCapCW(
  center: Vec2,
  from: Vec2,
  to: Vec2,
  tangent: Vec2,
  isStart: boolean
): boolean {
  const nL = perpLeft(norm(tangent));
  const r = len(sub(from, center));

  // Calculate midpoint angles for both directions
  const a0 = degToRad(angleOfPointDeg(center, from));
  const a1 = degToRad(angleOfPointDeg(center, to));

  // Compute midpoints for CW and CCW arcs
  const midCCW = arcMidPoint(center, r, a0, a1, false);
  const midCW = arcMidPoint(center, r, a0, a1, true);

  // Score by displacement along normal
  const sCCW = dot(sub(midCCW, center), nL);
  const sCW = dot(sub(midCW, center), nL);

  // Start cap: prefer outward opposite to tangent (more negative along nL)
  // End cap: prefer outward along tangent (more positive along nL)
  if (isStart) {
    return sCW < sCCW;
  }
  return sCW > sCCW;
}

/**
 * Compute arc midpoint given direction.
 */
function arcMidPoint(center: Vec2, r: number, a0: number, a1: number, cw: boolean): Vec2 {
  const TWO_PI = 2 * Math.PI;

  // Compute directed sweep
  const d = cw
    ? ((a0 - a1 + TWO_PI) % TWO_PI)
    : ((a1 - a0 + TWO_PI) % TWO_PI);

  // Midpoint angle
  const am = cw ? a0 - d / 2 : a0 + d / 2;
  const ang = ((am % TWO_PI) + TWO_PI) % TWO_PI;

  return {
    x: center.x + r * Math.cos(ang),
    y: center.y + r * Math.sin(ang),
  };
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get start point of a path.
 */
export function pathStartPoint(path: Path): Vec2 {
  if (path.segs.length === 0) {
    throw new Error('Path has no segments');
  }
  return segmentStartPoint(path.segs[0]);
}

/**
 * Get end point of a path.
 */
export function pathEndPoint(path: Path): Vec2 {
  if (path.segs.length === 0) {
    throw new Error('Path has no segments');
  }
  return segmentEndPoint(path.segs[path.segs.length - 1]);
}

/**
 * Get tangent at path start.
 */
export function pathStartTangent(path: Path): Vec2 {
  if (path.segs.length === 0) {
    throw new Error('Path has no segments');
  }
  return segmentTangentAtStart(path.segs[0]);
}

/**
 * Get tangent at path end.
 */
export function pathEndTangent(path: Path): Vec2 {
  if (path.segs.length === 0) {
    throw new Error('Path has no segments');
  }
  return segmentTangentAtEnd(path.segs[path.segs.length - 1]);
}

/**
 * Reverse a segment.
 */
function reverseSegment(seg: Segment): Segment {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return {
      kind: 'LINE',
      a: line.b,
      b: line.a,
    };
  } else if (seg.kind === 'ARC') {
    const arc = seg as SegArc;
    return {
      kind: 'ARC',
      c: arc.c,
      r: arc.r,
      startDeg: arc.endDeg,
      endDeg: arc.startDeg,
      cw: !arc.cw,
      start: arc.end,
      end: arc.start,
    };
  }
  throw new Error(`Unknown segment kind: ${(seg as any).kind}`);
}

/**
 * Reverse a path (all segments in reverse order, each reversed).
 */
export function reversePath(path: Path): Path {
  return {
    segs: path.segs.map(reverseSegment).reverse(),
    closed: path.closed,
    winding: path.winding === 'CW' ? 'CCW' : 'CW',
  };
}

// ============================================================================
// Offset Open Path Segments (Simplified)
// ============================================================================

/**
 * Offset a line segment by distance d.
 * Positive d = left offset, negative d = right offset.
 */
function offsetLineSegment(seg: SegLine, d: number): SegLine {
  const dir = norm(sub(seg.b, seg.a));
  const normal = perpLeft(dir);
  const offset = mul(normal, d);

  return {
    kind: 'LINE',
    a: add(seg.a, offset),
    b: add(seg.b, offset),
  };
}

/**
 * Offset an arc segment by distance d.
 * Positive d = outward (expand), negative d = inward (shrink).
 *
 * For CCW arc: positive d expands radius
 * For CW arc: positive d contracts radius (interior is outside)
 */
function offsetArcSegment(arc: SegArc, d: number): SegArc | null {
  // Determine actual radius change based on winding
  const radiusChange = arc.cw ? -d : d;
  const newR = arc.r + radiusChange;

  if (newR < EPS_POS) {
    // Arc collapsed
    return null;
  }

  // Recalculate start/end points
  const newStart = pointAtAngleDeg(arc.c, newR, arc.startDeg);
  const newEnd = pointAtAngleDeg(arc.c, newR, arc.endDeg);

  return {
    kind: 'ARC',
    c: arc.c,
    r: newR,
    startDeg: arc.startDeg,
    endDeg: arc.endDeg,
    cw: arc.cw,
    start: newStart,
    end: newEnd,
  };
}

/**
 * Offset a segment by distance d.
 */
function offsetSegment(seg: Segment, d: number): Segment | null {
  if (seg.kind === 'LINE') {
    return offsetLineSegment(seg as SegLine, d);
  } else if (seg.kind === 'ARC') {
    return offsetArcSegment(seg as SegArc, d);
  }
  return null;
}

/**
 * Offset all segments in a path.
 * Returns only successfully offset segments.
 */
function offsetPathSegments(path: Path, d: number): Segment[] {
  const result: Segment[] = [];

  for (const seg of path.segs) {
    const offset = offsetSegment(seg, d);
    if (offset) {
      result.push(offset);
    } else {
      // Arc collapsed - create line fallback
      const start = segmentStartPoint(seg);
      const end = segmentEndPoint(seg);
      const dir = norm(sub(end, start));
      const normal = perpLeft(dir);
      const offsetVec = mul(normal, d);

      result.push({
        kind: 'LINE',
        a: add(start, offsetVec),
        b: add(end, offsetVec),
      });
    }
  }

  return result;
}

// ============================================================================
// Main Function: Offset Open Path with True Round Caps
// ============================================================================

/**
 * Offset an open path with true round caps (semicircles).
 *
 * Creates a closed stroke outline:
 * - Left offset path
 * - End cap (semicircle)
 * - Right offset path (reversed)
 * - Start cap (semicircle)
 *
 * @param base - Open base path
 * @param d - Offset distance (positive)
 * @returns Closed stroke outline path
 */
export function offsetOpenPathTrueRoundCaps(base: Path, d: number): RoundCapResult {
  const warnings: string[] = [];

  if (base.closed) {
    return {
      success: false,
      warnings,
      error: 'Base path must be open (not closed)',
    };
  }

  if (base.segs.length === 0) {
    return {
      success: false,
      warnings,
      error: 'Base path has no segments',
    };
  }

  const absD = Math.abs(d);
  if (absD < EPS_POS) {
    // Zero offset - return original as-is (but closed)
    return {
      success: true,
      path: { segs: [...base.segs], closed: true, winding: base.winding },
      warnings: ['zero-offset-passthrough'],
    };
  }

  try {
    // 1) Compute left and right offset paths
    const leftSegs = offsetPathSegments(base, +absD);
    const rightSegsRaw = offsetPathSegments(base, -absD);

    // Reverse right side for continuous stroke
    const rightSegs = rightSegsRaw.map(reverseSegment).reverse();

    if (leftSegs.length === 0 || rightSegs.length === 0) {
      return {
        success: false,
        warnings,
        error: 'Failed to offset path segments',
      };
    }

    // 2) Get endpoints
    const P0 = pathStartPoint(base); // Original start
    const P1 = pathEndPoint(base);   // Original end

    const leftStart = segmentStartPoint(leftSegs[0]);
    const leftEnd = segmentEndPoint(leftSegs[leftSegs.length - 1]);

    const rightStart = segmentStartPoint(rightSegs[0]);
    const rightEnd = segmentEndPoint(rightSegs[rightSegs.length - 1]);

    // 3) Get tangents for cap direction calculation
    const t0 = pathStartTangent(base);
    const t1 = pathEndTangent(base);

    // 4) Create cap arcs
    // Start cap: connects rightEnd -> leftStart (closing the start)
    const startCapCw = chooseCapCW(P0, rightEnd, leftStart, t0, true);
    const startCap = makeRoundCapArc(P0, rightEnd, leftStart, startCapCw);

    // End cap: connects leftEnd -> rightStart (closing the end)
    const endCapCw = chooseCapCW(P1, leftEnd, rightStart, t1, false);
    const endCap = makeRoundCapArc(P1, leftEnd, rightStart, endCapCw);

    // 5) Assemble closed stroke outline
    // Order: left -> endCap -> right -> startCap
    const outSegs: Segment[] = [];
    outSegs.push(...leftSegs);
    outSegs.push(endCap);
    outSegs.push(...rightSegs);
    outSegs.push(startCap);

    return {
      success: true,
      path: {
        segs: outSegs,
        closed: true,
        winding: 'CCW', // Standard stroke winding
      },
      warnings,
    };
  } catch (err) {
    return {
      success: false,
      warnings,
      error: `Round cap generation failed: ${(err as Error).message}`,
    };
  }
}

// ============================================================================
// Alternative: Create Just the Cap Arcs (for centerline output)
// ============================================================================

/**
 * Create start cap arc for an open path offset.
 */
export function createStartCapArc(
  basePath: Path,
  offsetD: number
): SegArc | null {
  if (basePath.segs.length === 0) return null;

  const P0 = pathStartPoint(basePath);
  const t0 = pathStartTangent(basePath);
  const normal = perpLeft(t0);

  // Cap endpoints
  const leftPt = add(P0, mul(normal, offsetD));
  const rightPt = add(P0, mul(normal, -offsetD));

  // Choose direction for outer bulge
  const cw = chooseCapCW(P0, rightPt, leftPt, t0, true);

  return makeRoundCapArc(P0, rightPt, leftPt, cw);
}

/**
 * Create end cap arc for an open path offset.
 */
export function createEndCapArc(
  basePath: Path,
  offsetD: number
): SegArc | null {
  if (basePath.segs.length === 0) return null;

  const P1 = pathEndPoint(basePath);
  const t1 = pathEndTangent(basePath);
  const normal = perpLeft(t1);

  // Cap endpoints
  const leftPt = add(P1, mul(normal, offsetD));
  const rightPt = add(P1, mul(normal, -offsetD));

  // Choose direction for outer bulge
  const cw = chooseCapCW(P1, leftPt, rightPt, t1, false);

  return makeRoundCapArc(P1, leftPt, rightPt, cw);
}
