// src/core/manufacturing/toolpath/tabs/pathParam.ts
/**
 * Path Parameterization for Tab Placement.
 *
 * Computes arc-length parameterization and provides utilities
 * to split LINE/ARC segments at arbitrary arc-length positions.
 *
 * Key features:
 * - Exact arc-length calculation for LINE and ARC segments
 * - Deterministic segment splitting (preserves ARC geometry)
 * - Lookup table for O(log n) s → segment mapping
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

import { PathSegment, LineSegment, ArcSegment } from "./tabTypes";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const EPS = 1e-9;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Path structure for parameterization.
 */
export interface Path {
  id?: string;
  segs: PathSegment[];
  closed?: boolean;
}

/**
 * Segment parameterization entry.
 */
export interface SegParam {
  /** Segment index in path.segs */
  segIndex: number;

  /** Arc-length at segment start */
  sStart: number;

  /** Arc-length at segment end */
  sEnd: number;

  /** Segment kind */
  kind: "LINE" | "ARC";

  /** Segment length */
  length: number;
}

/**
 * Complete path parameterization.
 */
export interface PathParam {
  /** Total path length (mm) */
  totalLen: number;

  /** Parameterization table (sorted by sStart) */
  table: SegParam[];
}

// =============================================================================
// SEGMENT LENGTH CALCULATION
// =============================================================================

/**
 * Calculate length of a line segment.
 */
export function lineSegLen(seg: LineSegment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  return Math.hypot(dx, dy);
}

/**
 * Calculate sweep angle magnitude for an arc (radians).
 *
 * Returns value in (0, 2π] based on direction (cw/ccw).
 */
export function arcSweepRad(seg: ArcSegment): number {
  const a0 = seg.startDeg * DEG_TO_RAD;
  const a1 = seg.endDeg * DEG_TO_RAD;

  let sweep: number;

  if (seg.cw) {
    // Clockwise: from a0 to a1 going CW (decreasing angle)
    sweep = a0 - a1;
    if (sweep <= 0) sweep += TWO_PI;
  } else {
    // Counter-clockwise: from a0 to a1 going CCW (increasing angle)
    sweep = a1 - a0;
    if (sweep <= 0) sweep += TWO_PI;
  }

  return sweep;
}

/**
 * Calculate length of an arc segment.
 *
 * Length = radius × sweep_angle (radians)
 */
export function arcSegLen(seg: ArcSegment): number {
  const sweepRad = arcSweepRad(seg);
  return Math.abs(seg.r) * sweepRad;
}

/**
 * Calculate length of any segment.
 */
export function segLen(seg: PathSegment): number {
  if (seg.kind === "LINE") {
    return lineSegLen(seg);
  }
  return arcSegLen(seg);
}

// =============================================================================
// PATH PARAMETERIZATION
// =============================================================================

/**
 * Build arc-length parameterization table for a path.
 *
 * @param path Path to parameterize
 * @returns Parameterization with total length and segment table
 */
export function buildParam(path: Path): PathParam {
  let s = 0;
  const table: SegParam[] = [];

  for (let i = 0; i < path.segs.length; i++) {
    const seg = path.segs[i];
    const len = segLen(seg);

    table.push({
      segIndex: i,
      sStart: s,
      sEnd: s + len,
      kind: seg.kind,
      length: len,
    });

    s += len;
  }

  return { totalLen: s, table };
}

/**
 * Find segment containing arc-length position s.
 *
 * @param param Path parameterization
 * @param s Arc-length position [0, totalLen]
 * @returns Segment param entry, or null if out of range
 */
export function findSegAtS(param: PathParam, s: number): SegParam | null {
  if (param.table.length === 0) return null;

  const sClamp = clamp(s, 0, param.totalLen);

  // Binary search for efficiency
  let lo = 0;
  let hi = param.table.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (param.table[mid].sEnd < sClamp) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const row = param.table[lo];
  if (sClamp >= row.sStart - EPS && sClamp <= row.sEnd + EPS) {
    return row;
  }

  return param.table[param.table.length - 1];
}

// =============================================================================
// SEGMENT SPLITTING
// =============================================================================

/**
 * Split a line segment at parameter t ∈ [0, 1].
 *
 * @param seg Line segment
 * @param t Split parameter (0 = start, 1 = end)
 * @returns [before, after] line segments
 */
export function splitLineAtT(
  seg: LineSegment,
  t: number
): [LineSegment, LineSegment] {
  const tc = clamp(t, 0, 1);
  const x = seg.x1 + tc * (seg.x2 - seg.x1);
  const y = seg.y1 + tc * (seg.y2 - seg.y1);

  const before: LineSegment = {
    kind: "LINE",
    x1: seg.x1,
    y1: seg.y1,
    x2: x,
    y2: y,
  };

  const after: LineSegment = {
    kind: "LINE",
    x1: x,
    y1: y,
    x2: seg.x2,
    y2: seg.y2,
  };

  return [before, after];
}

/**
 * Split an arc segment at angle thetaDeg.
 *
 * Preserves center, radius, and direction.
 *
 * @param seg Arc segment
 * @param thetaDeg Split angle (degrees)
 * @returns [before, after] arc segments
 */
export function splitArcAtTheta(
  seg: ArcSegment,
  thetaDeg: number
): [ArcSegment, ArcSegment] {
  const before: ArcSegment = {
    kind: "ARC",
    cx: seg.cx,
    cy: seg.cy,
    r: seg.r,
    startDeg: seg.startDeg,
    endDeg: thetaDeg,
    cw: seg.cw,
  };

  const after: ArcSegment = {
    kind: "ARC",
    cx: seg.cx,
    cy: seg.cy,
    r: seg.r,
    startDeg: thetaDeg,
    endDeg: seg.endDeg,
    cw: seg.cw,
  };

  return [before, after];
}

/**
 * Calculate angle at arc-length distance along an arc.
 *
 * Maps arc-length s to angle (degrees) accounting for direction.
 *
 * @param seg Arc segment
 * @param sAlongArc Distance along arc from start
 * @returns Angle in degrees
 */
export function arcThetaAtS(seg: ArcSegment, sAlongArc: number): number {
  const arcLen = arcSegLen(seg);
  if (arcLen < EPS) return seg.startDeg;

  const t = clamp(sAlongArc / arcLen, 0, 1);
  const sweepRad = arcSweepRad(seg);
  const deltaRad = t * sweepRad;

  const a0 = seg.startDeg * DEG_TO_RAD;
  let theta: number;

  if (seg.cw) {
    // CW: angle decreases
    theta = a0 - deltaRad;
  } else {
    // CCW: angle increases
    theta = a0 + deltaRad;
  }

  // Normalize to [0, 360)
  let thetaDeg = theta * RAD_TO_DEG;
  while (thetaDeg < 0) thetaDeg += 360;
  while (thetaDeg >= 360) thetaDeg -= 360;

  return thetaDeg;
}

/**
 * Split any segment at arc-length distance from segment start.
 *
 * @param seg Segment to split
 * @param sAlongSeg Distance along segment
 * @returns [before, after] segments
 */
export function splitSegAtS(
  seg: PathSegment,
  sAlongSeg: number
): [PathSegment, PathSegment] {
  const len = segLen(seg);

  if (seg.kind === "LINE") {
    const t = len > EPS ? sAlongSeg / len : 0;
    return splitLineAtT(seg, t);
  }

  const thetaDeg = arcThetaAtS(seg, sAlongSeg);
  return splitArcAtTheta(seg, thetaDeg);
}

// =============================================================================
// PATH SPLITTING
// =============================================================================

/**
 * Split a path at absolute arc-length position s.
 *
 * Inserts a new vertex at position s by splitting the containing segment.
 * Returns a new path with the split applied.
 *
 * @param path Path to split
 * @param param Path parameterization
 * @param sAbs Absolute arc-length position
 * @returns New path with split vertex
 */
export function splitPathAtS(path: Path, param: PathParam, sAbs: number): Path {
  const L = param.totalLen;
  const s = clamp(sAbs, 0, L);

  // Find containing segment
  const row = findSegAtS(param, s);
  if (!row) return path;

  const i = row.segIndex;
  const seg = path.segs[i];

  // Distance within this segment
  const segS = s - row.sStart;
  const segL = row.length;

  // Skip if at segment boundary (within tolerance)
  if (segS <= EPS || segS >= segL - EPS) {
    return path;
  }

  // Split the segment
  const [before, after] = splitSegAtS(seg, segS);

  // Build new segments array
  const newSegs: PathSegment[] = [
    ...path.segs.slice(0, i),
    before,
    after,
    ...path.segs.slice(i + 1),
  ];

  return {
    ...path,
    segs: newSegs,
  };
}

/**
 * Split path at multiple arc-length positions.
 *
 * Positions are sorted and applied sequentially, adjusting
 * for previous splits.
 *
 * @param path Path to split
 * @param positions Array of arc-length positions
 * @returns New path with all splits applied
 */
export function splitPathAtMultipleS(path: Path, positions: number[]): Path {
  // Sort and deduplicate positions
  const sorted = [...new Set(positions)].sort((a, b) => a - b);

  let result = path;

  for (const s of sorted) {
    const param = buildParam(result);
    result = splitPathAtS(result, param, s);
  }

  return result;
}

// =============================================================================
// POINT EXTRACTION
// =============================================================================

/**
 * Get start point of a segment.
 */
export function segStartPoint(seg: PathSegment): { x: number; y: number } {
  if (seg.kind === "LINE") {
    return { x: seg.x1, y: seg.y1 };
  }
  const a = seg.startDeg * DEG_TO_RAD;
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
  };
}

/**
 * Get end point of a segment.
 */
export function segEndPoint(seg: PathSegment): { x: number; y: number } {
  if (seg.kind === "LINE") {
    return { x: seg.x2, y: seg.y2 };
  }
  const a = seg.endDeg * DEG_TO_RAD;
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
  };
}

/**
 * Get point at arc-length position on path.
 *
 * @param path Path
 * @param param Path parameterization
 * @param s Arc-length position
 * @returns Point coordinates
 */
export function pointAtS(
  path: Path,
  param: PathParam,
  s: number
): { x: number; y: number } {
  const row = findSegAtS(param, s);
  if (!row) {
    return path.segs.length > 0
      ? segStartPoint(path.segs[0])
      : { x: 0, y: 0 };
  }

  const seg = path.segs[row.segIndex];
  const segS = s - row.sStart;
  const segL = row.length;

  if (seg.kind === "LINE") {
    const t = segL > EPS ? segS / segL : 0;
    return {
      x: seg.x1 + t * (seg.x2 - seg.x1),
      y: seg.y1 + t * (seg.y2 - seg.y1),
    };
  }

  // Arc: calculate angle at s
  const thetaDeg = arcThetaAtS(seg, segS);
  const thetaRad = thetaDeg * DEG_TO_RAD;
  return {
    x: seg.cx + seg.r * Math.cos(thetaRad),
    y: seg.cy + seg.r * Math.sin(thetaRad),
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Clamp value to range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if two values are approximately equal.
 */
export function approxEqual(a: number, b: number, eps: number = EPS): boolean {
  return Math.abs(a - b) <= eps;
}
