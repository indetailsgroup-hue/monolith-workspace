/**
 * Tabs Split - Keep Arcs
 *
 * Step 10.5.5: Split paths by tabs while preserving LINE/ARC segment types.
 *
 * Unlike tabsGeneral.ts which samples arcs to polylines, this module:
 * - Slices LINE segments into LINE sub-segments
 * - Slices ARC segments into ARC sub-segments (preserving G2/G3 output)
 * - Maintains geometric continuity at segment boundaries
 *
 * Result: Tabs on curves remain as gaps on actual arcs, not jagged polylines.
 */

import type { Path, Pt, SegLine, SegArc, Segment, TabConfig } from './planTypes.js';
import { buildSegMeta, totalLengthFromMeta, type SegMeta } from './pathParam.js';

// ============================================================================
// Constants
// ============================================================================

const EPS = 1e-6;

// ============================================================================
// Helpers
// ============================================================================

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function near(a: Pt, b: Pt, eps: number = 1e-4): boolean {
  return dist(a, b) < eps;
}

// ============================================================================
// LINE Slicing
// ============================================================================

/**
 * Slice a LINE segment from parameter t0 to t1.
 * @param seg - Original LINE segment
 * @param t0 - Start parameter [0..1]
 * @param t1 - End parameter [0..1]
 */
function lineSlice(seg: SegLine, t0: number, t1: number): SegLine {
  const ax = seg.a.x + (seg.b.x - seg.a.x) * t0;
  const ay = seg.a.y + (seg.b.y - seg.a.y) * t0;
  const bx = seg.a.x + (seg.b.x - seg.a.x) * t1;
  const by = seg.a.y + (seg.b.y - seg.a.y) * t1;
  return {
    kind: 'LINE',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
  };
}

// ============================================================================
// ARC Slicing
// ============================================================================

/**
 * Calculate signed sweep angle from start to end following CW/CCW direction.
 */
function arcSweepRad(startRad: number, endRad: number, cw: boolean): number {
  let s = endRad - startRad;
  if (cw && s > 0) s -= 2 * Math.PI;
  if (!cw && s < 0) s += 2 * Math.PI;
  return s;
}

/**
 * Calculate point on arc at given angle.
 */
function arcPoint(c: Pt, r: number, ang: number): Pt {
  return {
    x: c.x + Math.cos(ang) * r,
    y: c.y + Math.sin(ang) * r,
  };
}

/**
 * Slice an ARC segment from parameter u0 to u1.
 * @param seg - Original ARC segment
 * @param u0 - Start parameter [0..1] along arc travel direction
 * @param u1 - End parameter [0..1] along arc travel direction
 */
function arcSlice(seg: SegArc, u0: number, u1: number): SegArc {
  const startRad = (seg.startDeg * Math.PI) / 180;
  const endRad = (seg.endDeg * Math.PI) / 180;
  const sweep = arcSweepRad(startRad, endRad, seg.cw);

  const a0 = startRad + sweep * u0;
  const a1 = startRad + sweep * u1;

  const p0 = arcPoint(seg.c, seg.r, a0);
  const p1 = arcPoint(seg.c, seg.r, a1);

  return {
    kind: 'ARC',
    c: seg.c,
    r: seg.r,
    startDeg: (a0 * 180) / Math.PI,
    endDeg: (a1 * 180) / Math.PI,
    cw: seg.cw,
    start: p0,
    end: p1,
  };
}

// ============================================================================
// Tab Position Calculation
// ============================================================================

/**
 * Calculate tab center positions uniformly along path.
 */
function calculateTabCentersUniform(
  totalLength: number,
  count: number,
  inset: number
): number[] {
  if (count <= 0) return [];

  const centers: number[] = [];
  const effectiveLen = totalLength - 2 * inset;

  if (effectiveLen <= 0) {
    // Path too short, place single tab at center
    return [totalLength / 2];
  }

  const spacing = effectiveLen / count;
  for (let i = 0; i < count; i++) {
    const center = inset + spacing * (i + 0.5);
    centers.push(clamp(center, inset, totalLength - inset));
  }

  return centers;
}

// ============================================================================
// Blocked Interval Calculation
// ============================================================================

interface Interval {
  a: number;
  b: number;
}

/**
 * Create blocked intervals from tab centers.
 */
function createBlockedIntervals(
  centers: number[],
  tabLength: number,
  totalLength: number
): Interval[] {
  const halfLen = tabLength / 2;
  return centers
    .map((c) => ({
      a: clamp(c - halfLen, 0, totalLength),
      b: clamp(c + halfLen, 0, totalLength),
    }))
    .sort((x, y) => x.a - y.a);
}

/**
 * Merge overlapping intervals.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals;

  const merged: Interval[] = [];
  for (const it of intervals) {
    const last = merged[merged.length - 1];
    if (!last || it.a > last.b + EPS) {
      merged.push({ ...it });
    } else {
      last.b = Math.max(last.b, it.b);
    }
  }
  return merged;
}

/**
 * Calculate keep intervals (areas to cut) from blocked intervals.
 */
function calculateKeepIntervals(
  blocked: Interval[],
  totalLength: number
): Interval[] {
  const keeps: Interval[] = [];
  let t0 = 0;

  for (const bl of blocked) {
    if (bl.a > t0 + EPS) {
      keeps.push({ a: t0, b: bl.a });
    }
    t0 = bl.b;
  }

  if (totalLength > t0 + EPS) {
    keeps.push({ a: t0, b: totalLength });
  }

  return keeps;
}

// ============================================================================
// Path Slicing
// ============================================================================

/**
 * Extract a subpath from a path for a given keep interval.
 * Preserves segment types (LINE stays LINE, ARC stays ARC).
 */
function extractSubpath(
  path: Path,
  metas: SegMeta[],
  keepInterval: Interval
): Path {
  const segs: Segment[] = [];
  const { a: s, b: e } = keepInterval;

  // Find starting segment
  let idx = 0;
  let acc = 0;

  while (idx < metas.length && acc + metas[idx].len < s - EPS) {
    acc += metas[idx].len;
    idx++;
  }

  if (idx >= metas.length) {
    return { closed: false, segs: [], winding: path.winding };
  }

  // Extract segments within the interval
  let curS = s;
  while (curS < e - EPS && idx < metas.length) {
    const segLen = metas[idx].len;
    const segStartS = acc;
    const segEndS = acc + segLen;

    const aS = clamp(curS, segStartS, segEndS);
    const bS = clamp(e, segStartS, segEndS);

    // Parameter within segment [0..1]
    const u0 = segLen < EPS ? 0 : (aS - segStartS) / segLen;
    const u1 = segLen < EPS ? 1 : (bS - segStartS) / segLen;

    const src = path.segs[idx];

    if (u1 - u0 > 1e-5) {
      if (src.kind === 'LINE') {
        segs.push(lineSlice(src as SegLine, u0, u1));
      } else {
        segs.push(arcSlice(src as SegArc, u0, u1));
      }
    }

    curS = bS;
    if (bS >= segEndS - EPS) {
      acc += segLen;
      idx++;
    }
  }

  // Stitch continuity (snap endpoints to avoid tiny gaps)
  for (let i = 0; i < segs.length - 1; i++) {
    const curSeg = segs[i];
    const nxtSeg = segs[i + 1];

    const curEnd = curSeg.kind === 'LINE'
      ? (curSeg as SegLine).b
      : (curSeg as SegArc).end;
    const nxtStart = nxtSeg.kind === 'LINE'
      ? (nxtSeg as SegLine).a
      : (nxtSeg as SegArc).start;

    if (!near(curEnd, nxtStart)) {
      // Snap next start to current end
      if (nxtSeg.kind === 'LINE') {
        (nxtSeg as SegLine).a = curEnd;
      } else {
        (nxtSeg as SegArc).start = curEnd;
      }
    }
  }

  return {
    closed: false,
    segs,
    winding: path.winding,
  };
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Split a path by tabs while preserving LINE/ARC segment types.
 *
 * @param path - Path to split
 * @param tab - Tab configuration
 * @returns Array of sub-paths (open paths between tabs)
 */
export function splitPathByTabsKeepArcs(path: Path, tab: TabConfig): Path[] {
  if (!tab.enabled || tab.count <= 0) {
    return [path];
  }

  const metas = buildSegMeta(path);
  const L = totalLengthFromMeta(metas);

  if (L < EPS) {
    return [path];
  }

  const n = Math.max(1, Math.floor(tab.count));
  const len = Math.max(2, tab.lengthMm);
  const inset = Math.max(0, tab.insetMm);

  // Calculate tab centers (uniform distribution)
  const centers = calculateTabCentersUniform(L, n, inset);

  // Create and merge blocked intervals
  const blocks = createBlockedIntervals(centers, len, L);
  const merged = mergeIntervals(blocks);

  // Calculate keep intervals
  const keeps = calculateKeepIntervals(merged, L);

  // Build subpaths preserving segment types
  const out: Path[] = [];
  for (const k of keeps) {
    const subpath = extractSubpath(path, metas, k);
    if (subpath.segs.length > 0) {
      out.push(subpath);
    }
  }

  return out;
}

/**
 * Check if tabs should use arc-preserving split.
 * Returns true if path contains any ARC segments.
 */
export function hasArcSegments(path: Path): boolean {
  return path.segs.some((s) => s.kind === 'ARC');
}

/**
 * Get paths for cutting with arc preservation.
 * Automatically chooses arc-preserving or standard split.
 */
export function getPathsForCuttingKeepArcs(
  path: Path,
  tab?: TabConfig
): Path[] {
  if (!tab?.enabled || tab.count <= 0) {
    return [path];
  }

  return splitPathByTabsKeepArcs(path, tab);
}

// ============================================================================
// Tab Info for Visualization
// ============================================================================

export interface TabPositionInfo {
  center: number;
  start: number;
  end: number;
}

/**
 * Get tab positions for visualization/verification.
 */
export function getTabPositionsKeepArcs(
  path: Path,
  tab: TabConfig
): TabPositionInfo[] {
  if (!tab.enabled || tab.count <= 0) {
    return [];
  }

  const metas = buildSegMeta(path);
  const L = totalLengthFromMeta(metas);
  const n = Math.max(1, Math.floor(tab.count));
  const len = Math.max(2, tab.lengthMm);
  const inset = Math.max(0, tab.insetMm);

  const centers = calculateTabCentersUniform(L, n, inset);

  return centers.map((c) => ({
    center: c,
    start: clamp(c - len / 2, 0, L),
    end: clamp(c + len / 2, 0, L),
  }));
}
