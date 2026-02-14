/**
 * Arc-Aware Path Offset
 *
 * Step 10.5.5: Offset paths (LINE + ARC) preserving arc geometry.
 *
 * Unlike offsetLinePath.ts which only handles line-only paths,
 * this module:
 * - Offsets LINE segments by parallel shift
 * - Offsets ARC segments by adjusting radius (r ± d)
 * - Joins segments deterministically (snap or connector line)
 *
 * Result: Finishing passes on curved geometry produce smooth G2/G3 arcs.
 */

import type { Path, Pt, SegLine, SegArc, Segment } from './planTypes.js';

// ============================================================================
// Constants
// ============================================================================

const EPS = 1e-6;

// ============================================================================
// Vector Helpers
// ============================================================================

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function len(v: Pt): number {
  return Math.hypot(v.x, v.y);
}

function unit(x: number, y: number): Pt {
  const L = Math.hypot(x, y) || 1;
  return { x: x / L, y: y / L };
}

function perpLeft(v: Pt): Pt {
  return { x: -v.y, y: v.x };
}

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(v: Pt, s: number): Pt {
  return { x: v.x * s, y: v.y * s };
}

function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Pt, b: Pt): number {
  return a.x * b.y - a.y * b.x;
}

// ============================================================================
// Arc Helpers
// ============================================================================

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function arcSweep(startRad: number, endRad: number, cw: boolean): number {
  let s = endRad - startRad;
  if (cw && s > 0) s -= 2 * Math.PI;
  if (!cw && s < 0) s += 2 * Math.PI;
  return s;
}

function arcPoint(c: Pt, r: number, ang: number): Pt {
  return {
    x: c.x + Math.cos(ang) * r,
    y: c.y + Math.sin(ang) * r,
  };
}

// ============================================================================
// Interior Normal Calculation
// ============================================================================

/**
 * Calculate interior-facing normal for a LINE segment.
 * Interior is left for CCW winding, right for CW winding.
 */
function interiorNormalForLine(
  a: Pt,
  b: Pt,
  winding: 'CW' | 'CCW'
): Pt {
  const d = unit(b.x - a.x, b.y - a.y);
  const left = perpLeft(d);
  return winding === 'CCW' ? left : mul(left, -1);
}

/**
 * Calculate interior-facing normal at midpoint of an ARC segment.
 */
function interiorNormalForArcMid(
  arc: SegArc,
  winding: 'CW' | 'CCW'
): { midPt: Pt; normal: Pt } {
  const st = degToRad(arc.startDeg);
  const en = degToRad(arc.endDeg);
  const sw = arcSweep(st, en, arc.cw);
  const midAng = st + sw * 0.5;

  const midPt = arcPoint(arc.c, arc.r, midAng);

  // Tangent direction at mid
  const rx = midPt.x - arc.c.x;
  const ry = midPt.y - arc.c.y;
  const tan = arc.cw
    ? unit(ry, -rx)   // CW: tangent is 90° CW from radius
    : unit(-ry, rx);  // CCW: tangent is 90° CCW from radius

  const left = perpLeft(tan);
  const interior = winding === 'CCW' ? left : mul(left, -1);

  return { midPt, normal: interior };
}

// ============================================================================
// Line-Line Intersection
// ============================================================================

/**
 * Intersect two infinite lines defined by point + direction.
 * Returns null if parallel.
 */
function lineLineIntersect(
  p1: Pt,
  d1: Pt,
  p2: Pt,
  d2: Pt
): Pt | null {
  const det = cross(d1, d2);
  if (Math.abs(det) < EPS) {
    return null; // Parallel
  }

  const diff = sub(p2, p1);
  const t = cross(diff, d2) / det;

  return {
    x: p1.x + d1.x * t,
    y: p1.y + d1.y * t,
  };
}

// ============================================================================
// Offset Types
// ============================================================================

export type OffsetMode = 'INSET' | 'OUTSET';

export interface ArcOffsetResult {
  /** Whether offset was successful */
  success: boolean;
  /** Offset path (if successful) */
  path?: Path;
  /** Reason for failure (if unsuccessful) */
  reason?: string;
  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

// ============================================================================
// Segment Offset
// ============================================================================

interface OffsetSegment {
  seg: Segment;
  /** Original start/end for trimming reference */
  rawStart: Pt;
  rawEnd: Pt;
  /** Direction vector (for lines) */
  dir?: Pt;
}

/**
 * Offset a LINE segment by shifting perpendicular to travel direction.
 */
function offsetLine(
  line: SegLine,
  d: number,
  winding: 'CW' | 'CCW'
): OffsetSegment {
  const n = interiorNormalForLine(line.a, line.b, winding);
  const off = mul(n, d);

  const a = add(line.a, off);
  const b = add(line.b, off);

  return {
    seg: { kind: 'LINE', a, b } as SegLine,
    rawStart: a,
    rawEnd: b,
    dir: unit(b.x - a.x, b.y - a.y),
  };
}

/**
 * Offset an ARC segment by adjusting radius.
 * Returns null if offset would collapse the arc (r <= 0).
 */
function offsetArc(
  arc: SegArc,
  d: number,
  winding: 'CW' | 'CCW'
): OffsetSegment | null {
  const { midPt, normal } = interiorNormalForArcMid(arc, winding);

  // Calculate where offset midpoint would be
  const pOff = add(midPt, mul(normal, d));

  // New radius is distance from center to offset point
  const r2 = dist(arc.c, pOff);

  if (r2 < EPS) {
    return null; // Arc collapsed
  }

  // Recompute endpoints at new radius
  const st = degToRad(arc.startDeg);
  const en = degToRad(arc.endDeg);
  const start = arcPoint(arc.c, r2, st);
  const end = arcPoint(arc.c, r2, en);

  return {
    seg: {
      kind: 'ARC',
      c: arc.c,
      r: r2,
      startDeg: arc.startDeg,
      endDeg: arc.endDeg,
      cw: arc.cw,
      start,
      end,
    } as SegArc,
    rawStart: start,
    rawEnd: end,
  };
}

// ============================================================================
// Segment Joining
// ============================================================================

/**
 * Get start point of a segment.
 */
function segStart(seg: Segment): Pt {
  return seg.kind === 'LINE' ? (seg as SegLine).a : (seg as SegArc).start;
}

/**
 * Get end point of a segment.
 */
function segEnd(seg: Segment): Pt {
  return seg.kind === 'LINE' ? (seg as SegLine).b : (seg as SegArc).end;
}

/**
 * Set start point of a segment (mutates).
 */
function setSegStart(seg: Segment, pt: Pt): void {
  if (seg.kind === 'LINE') {
    (seg as SegLine).a = pt;
  } else {
    (seg as SegArc).start = pt;
  }
}

/**
 * Set end point of a segment (mutates).
 */
function setSegEnd(seg: Segment, pt: Pt): void {
  if (seg.kind === 'LINE') {
    (seg as SegLine).b = pt;
  } else {
    (seg as SegArc).end = pt;
  }
}

/**
 * Try to join two consecutive offset segments.
 * Strategy: Try intersection first, then fall back to connector line.
 *
 * @returns Connector segment if needed, null otherwise
 */
function joinSegments(
  cur: OffsetSegment,
  nxt: OffsetSegment,
  winding: 'CW' | 'CCW'
): SegLine | null {
  const curEnd = segEnd(cur.seg);
  const nxtStart = segStart(nxt.seg);

  // Already continuous?
  if (dist(curEnd, nxtStart) < 1e-3) {
    return null;
  }

  // Try LINE-LINE intersection
  if (cur.seg.kind === 'LINE' && nxt.seg.kind === 'LINE') {
    const curLine = cur.seg as SegLine;
    const nxtLine = nxt.seg as SegLine;

    const d1 = unit(curLine.b.x - curLine.a.x, curLine.b.y - curLine.a.y);
    const d2 = unit(nxtLine.b.x - nxtLine.a.x, nxtLine.b.y - nxtLine.a.y);

    const inter = lineLineIntersect(curLine.a, d1, nxtLine.a, d2);
    if (inter) {
      // Check if intersection is reasonable (not too far from original)
      const distFromCurEnd = dist(inter, curEnd);
      const distFromNxtStart = dist(inter, nxtStart);

      if (distFromCurEnd < 50 && distFromNxtStart < 50) {
        // Use intersection point
        setSegEnd(cur.seg, inter);
        setSegStart(nxt.seg, inter);
        return null;
      }
    }
  }

  // Fallback: deterministic snap (next start to current end)
  // This ensures continuity even if geometry is complex
  setSegStart(nxt.seg, curEnd);
  return null;
}

// ============================================================================
// Main Offset Function
// ============================================================================

/**
 * Offset a closed path (LINE + ARC) by distance d toward interior (INSET) or exterior (OUTSET).
 *
 * @param path - Closed path to offset
 * @param d - Offset distance (positive)
 * @param mode - INSET (toward interior) or OUTSET (toward exterior)
 * @returns Offset result with new path or error
 */
export function offsetClosedPathArcAware(
  path: Path,
  d: number,
  mode: OffsetMode
): ArcOffsetResult {
  if (!path.closed) {
    return { success: false, reason: 'Path must be closed' };
  }

  if (path.segs.length < 2) {
    return { success: false, reason: 'Path must have at least 2 segments' };
  }

  if (Math.abs(d) < EPS) {
    return { success: true, path };
  }

  const warnings: string[] = [];

  // Sign: positive for INSET (toward interior), negative for OUTSET
  const sign = mode === 'INSET' ? 1 : -1;
  const dd = Math.abs(d) * sign;

  // 1) Offset each segment independently
  const offsets: OffsetSegment[] = [];

  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i];

    if (seg.kind === 'LINE') {
      offsets.push(offsetLine(seg as SegLine, dd, path.winding));
    } else {
      const result = offsetArc(seg as SegArc, dd, path.winding);
      if (!result) {
        warnings.push(`Arc ${i} collapsed during offset`);
        // Fallback: treat as LINE from start to end
        const arc = seg as SegArc;
        const line: SegLine = { kind: 'LINE', a: arc.start, b: arc.end };
        offsets.push(offsetLine(line, dd, path.winding));
      } else {
        offsets.push(result);
      }
    }
  }

  // 2) Join consecutive segments
  const connectors: (SegLine | null)[] = [];

  for (let i = 0; i < offsets.length; i++) {
    const cur = offsets[i];
    const nxt = offsets[(i + 1) % offsets.length];
    connectors.push(joinSegments(cur, nxt, path.winding));
  }

  // 3) Build final segment list
  const finalSegs: Segment[] = [];

  for (let i = 0; i < offsets.length; i++) {
    finalSegs.push(offsets[i].seg);

    const connector = connectors[i];
    if (connector) {
      finalSegs.push(connector);
    }
  }

  // 4) Ensure closure
  if (finalSegs.length > 0) {
    const firstStart = segStart(finalSegs[0]);
    const lastEnd = segEnd(finalSegs[finalSegs.length - 1]);

    if (dist(firstStart, lastEnd) > 1e-3) {
      // Add closing connector
      finalSegs.push({
        kind: 'LINE',
        a: lastEnd,
        b: firstStart,
      } as SegLine);
      warnings.push('Added closing connector line');
    }
  }

  return {
    success: true,
    path: {
      closed: true,
      segs: finalSegs,
      winding: path.winding,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Inset a path (shrink toward interior).
 */
export function insetPathArcAware(
  path: Path,
  distance: number
): ArcOffsetResult {
  return offsetClosedPathArcAware(path, distance, 'INSET');
}

/**
 * Outset a path (expand toward exterior).
 */
export function outsetPathArcAware(
  path: Path,
  distance: number
): ArcOffsetResult {
  return offsetClosedPathArcAware(path, distance, 'OUTSET');
}

/**
 * Calculate offset path for finishing pass.
 *
 * For outside profile cuts:
 * - Roughing: offset outward by finish allowance
 * - Finishing: cut at actual profile
 *
 * For inside profile cuts (pockets):
 * - Roughing: offset inward by finish allowance
 * - Finishing: cut at actual profile
 *
 * @param path - Original profile path
 * @param finishAllowance - Material to leave for finishing (mm)
 * @param outsideCut - Whether cutting on outside of profile
 */
export function finishingOffsetArcAware(
  path: Path,
  finishAllowance: number,
  outsideCut: boolean = true
): ArcOffsetResult {
  if (!path.closed) {
    return {
      success: false,
      reason: 'Finishing offset requires closed path',
    };
  }

  // For outside cuts: rough path is outset (larger)
  // For inside cuts: rough path is inset (smaller)
  const mode: OffsetMode = outsideCut ? 'OUTSET' : 'INSET';

  return offsetClosedPathArcAware(path, finishAllowance, mode);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a path can be offset with arc awareness.
 */
export function canOffsetPathArcAware(path: Path): boolean {
  return path.closed && path.segs.length >= 2;
}

/**
 * Estimate minimum safe inset distance.
 * Beyond this, arcs may collapse or path may self-intersect.
 */
export function estimateMinSafeInsetArcAware(path: Path): number {
  if (!path.closed) return 0;

  let minRadius = Infinity;

  // Find minimum arc radius
  for (const seg of path.segs) {
    if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      minRadius = Math.min(minRadius, arc.r);
    }
  }

  // Also consider line segment widths (distance between parallel lines)
  // This is a simplified check - full medial axis would be more accurate

  // Safe inset is approximately half the minimum feature size
  return minRadius === Infinity ? 0 : minRadius * 0.9;
}
