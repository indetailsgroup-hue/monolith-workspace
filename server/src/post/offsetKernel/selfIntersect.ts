/**
 * Self-Intersection Detection
 *
 * Step 10.5.9: Deterministic self-intersection detection for offset paths.
 *
 * This module detects when offset paths intersect themselves, which would
 * cause tool collision issues in CNC machining. All intersections are
 * reported to the Gate system for BLOCK/WARN decisions.
 *
 * Intersection types:
 * - CROSS: True intersection in segment interiors (always BLOCK)
 * - OVERLAP: Segments share a common region (always BLOCK)
 * - TOUCH: Tangent touch at a point (BLOCK by default, ignore if shared endpoint)
 *
 * The detector uses O(n²) pairwise checks with deterministic ordering
 * and stable fingerprints for reproducible results.
 */

import type { SegLine, SegArc, Segment } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  add,
  sub,
  mul,
  dot,
  cross,
  len,
  dist,
  normDeg,
  degToRad,
  angleOfPointDeg,
  ccwDeltaDeg,
  cwDeltaDeg,
  pointAtAngleDeg,
} from './mathCore.js';

// ============================================================================
// Types
// ============================================================================

/** Type of intersection hit */
export type HitKind = 'CROSS' | 'TOUCH' | 'OVERLAP';

/**
 * A detected intersection between two segments.
 */
export interface IntersectionHit {
  /** Type of intersection */
  kind: HitKind;
  /** Intersection point (for CROSS/TOUCH) */
  p?: Vec2;
  /** Index of first segment */
  segI: number;
  /** Index of second segment */
  segJ: number;
  /** Parameter on segment I: line [0..1], arc sweep fraction [0..1] */
  tI?: number;
  /** Parameter on segment J */
  tJ?: number;
  /** Solver branch label for debugging */
  meta: string;
  /** Stable fingerprint for Gate deduplication */
  fingerprint: string;
}

/**
 * Path structure for intersection detection.
 */
export interface PathForIntersect {
  segs: Segment[];
  closed: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const EPS_COL = 1e-9; // Collinearity tolerance
const EPS_ANG = 1e-7; // Angle tolerance

// ============================================================================
// Segment Parameterization
// ============================================================================

/**
 * Get parameter t in [0,1] for a point on a line segment.
 */
function lineParam01(seg: SegLine, p: Vec2): number {
  const v = sub(seg.b, seg.a);
  const vv = dot(v, v);
  if (vv < 1e-18) return 0;
  return dot(sub(p, seg.a), v) / vv;
}

/**
 * Check if point is on line segment and return parameter.
 */
function pointOnLineSegment(
  seg: SegLine,
  p: Vec2,
  eps = 1e-5
): { ok: boolean; t: number } {
  const v = sub(seg.b, seg.a);
  const w = sub(p, seg.a);
  const L = len(v);

  if (L < EPS_POS) {
    return { ok: len(w) <= eps, t: 0 };
  }

  // Check perpendicular distance from line
  const perpDist = Math.abs(cross(v, w)) / L;
  if (perpDist > eps) {
    return { ok: false, t: 0 };
  }

  const t = lineParam01(seg, p);
  return { ok: t >= -1e-6 && t <= 1 + 1e-6, t };
}

/**
 * Get total arc sweep in degrees.
 */
function arcSweepTotalDeg(arc: SegArc): number {
  const s = normDeg(arc.startDeg);
  const e = normDeg(arc.endDeg);
  return arc.cw ? cwDeltaDeg(s, e) : ccwDeltaDeg(s, e);
}

/**
 * Get parameter t in [0,1] for a point on an arc (sweep fraction).
 */
function arcParam01(arc: SegArc, p: Vec2): number {
  const ang = angleOfPointDeg(arc.c, p);
  const s = normDeg(arc.startDeg);
  const tot = arcSweepTotalDeg(arc);

  if (tot <= EPS_ANG) return 0;

  const at = arc.cw ? cwDeltaDeg(s, ang) : ccwDeltaDeg(s, ang);
  return at / tot;
}

/**
 * Check if angle is on arc sweep.
 */
function angleOnArcSweepDeg(
  a: number,
  s: number,
  e: number,
  cw: boolean,
  eps = EPS_ANG
): boolean {
  a = normDeg(a);
  s = normDeg(s);
  e = normDeg(e);

  if (!cw) {
    const tot = ccwDeltaDeg(s, e);
    const at = ccwDeltaDeg(s, a);
    return at <= tot + eps;
  } else {
    const tot = cwDeltaDeg(s, e);
    const at = cwDeltaDeg(s, a);
    return at <= tot + eps;
  }
}

/**
 * Check if point is on arc sweep (on circle and within sweep angle).
 */
function pointOnArcSweepLocal(arc: SegArc, p: Vec2, epsPos = 1e-5): boolean {
  const d = dist(p, arc.c);
  if (Math.abs(d - arc.r) > epsPos) return false;

  const ang = angleOfPointDeg(arc.c, p);
  return angleOnArcSweepDeg(ang, arc.startDeg, arc.endDeg, arc.cw);
}

// ============================================================================
// Segment Endpoints
// ============================================================================

/**
 * Get start point of a segment.
 */
function segStartPoint(s: Segment): Vec2 {
  if (s.kind === 'LINE') {
    return (s as SegLine).a;
  }
  const arc = s as SegArc;
  return pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
}

/**
 * Get end point of a segment.
 */
function segEndPoint(s: Segment): Vec2 {
  if (s.kind === 'LINE') {
    return (s as SegLine).b;
  }
  const arc = s as SegArc;
  return pointAtAngleDeg(arc.c, arc.r, arc.endDeg);
}

/**
 * Check if two points are the same within tolerance.
 */
function samePoint(a: Vec2, b: Vec2, eps = EPS_POS): boolean {
  return dist(a, b) <= eps;
}

// ============================================================================
// Adjacency and Shared Endpoint Detection
// ============================================================================

/**
 * Check if two segment indices are adjacent in the path.
 */
function areAdjacent(i: number, j: number, n: number, closed: boolean): boolean {
  if (j === i + 1) return true;
  if (closed && i === 0 && j === n - 1) return true;
  return false;
}

/**
 * Check if a hit point is at a shared endpoint between two segments.
 */
function isSharedEndpointHit(p: Vec2, si: Segment, sj: Segment, eps = EPS_POS): boolean {
  const ptsI = [segStartPoint(si), segEndPoint(si)];
  const ptsJ = [segStartPoint(sj), segEndPoint(sj)];

  for (const a of ptsI) {
    for (const b of ptsJ) {
      if (samePoint(a, b, eps) && samePoint(p, a, eps)) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// LINE-LINE Intersection
// ============================================================================

type LLHit =
  | { kind: 'NONE' }
  | { kind: 'POINT'; p: Vec2; t1: number; t2: number; proper: boolean }
  | { kind: 'OVERLAP' };

/**
 * Intersect two line segments, detecting overlap and point intersections.
 */
function intersectLineLineSegment(l1: SegLine, l2: SegLine, eps = EPS_POS): LLHit {
  const p = l1.a;
  const r = sub(l1.b, l1.a);
  const q = l2.a;
  const s = sub(l2.b, l2.a);

  const rxs = cross(r, s);
  const q_p = sub(q, p);
  const qpxr = cross(q_p, r);

  // Collinear case
  if (Math.abs(rxs) <= EPS_COL && Math.abs(qpxr) <= EPS_COL) {
    const rr = dot(r, r);

    if (rr < 1e-18) {
      // l1 is a degenerate point
      const on2 = pointOnLineSegment(l2, l1.a, eps);
      return on2.ok
        ? { kind: 'POINT', p: l1.a, t1: 0, t2: on2.t, proper: false }
        : { kind: 'NONE' };
    }

    const t0 = dot(sub(q, p), r) / rr;
    const t1 = t0 + dot(s, r) / rr;

    const a = Math.min(t0, t1);
    const b = Math.max(t0, t1);

    // Check overlap with [0,1]
    const lo = Math.max(0, a);
    const hi = Math.min(1, b);

    if (hi < lo - 1e-12) return { kind: 'NONE' };

    // If overlap length is ~0, it's a touch at a point
    if (hi - lo <= 1e-9) {
      const pt = add(p, mul(r, lo));
      const t2 = lineParam01(l2, pt);
      return { kind: 'POINT', p: pt, t1: lo, t2, proper: false };
    }

    return { kind: 'OVERLAP' };
  }

  // Parallel but not collinear
  if (Math.abs(rxs) <= EPS_COL && Math.abs(qpxr) > EPS_COL) {
    return { kind: 'NONE' };
  }

  // General intersection
  const t = cross(q_p, s) / rxs;
  const u = cross(q_p, r) / rxs;

  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) {
    return { kind: 'NONE' };
  }

  const pt = add(p, mul(r, t));

  // Proper intersection if strictly interior for both
  const proper = t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;

  return { kind: 'POINT', p: pt, t1: t, t2: u, proper };
}

// ============================================================================
// LINE-CIRCLE Intersection (Infinite)
// ============================================================================

/**
 * Stable lexicographic sort for points.
 */
function stableLex(ps: Vec2[]): Vec2[] {
  return ps.slice().sort((p, q) => (p.x !== q.x ? p.x - q.x : p.y - q.y));
}

/**
 * Intersect infinite line with circle.
 */
function intersectLineCircleInfinite(line: SegLine, c: Vec2, r: number): Vec2[] {
  const a = line.a;
  const d = sub(line.b, line.a);
  const f = sub(a, c);

  const A = dot(d, d);
  if (A < 1e-18) return [];

  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;

  const disc = B * B - 4 * A * C;

  if (disc < -1e-12) return [];

  if (Math.abs(disc) <= 1e-12) {
    const t = -B / (2 * A);
    return [add(a, mul(d, t))];
  }

  const s = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - s) / (2 * A);
  const t2 = (-B + s) / (2 * A);

  return stableLex([add(a, mul(d, t1)), add(a, mul(d, t2))]);
}

// ============================================================================
// LINE-ARC Intersection
// ============================================================================

type LAHit = {
  p: Vec2;
  tLine: number;
  tArc: number;
  proper: boolean;
  meta: string;
};

/**
 * Intersect line segment with arc segment.
 */
function intersectLineArcSegment(line: SegLine, arc: SegArc): LAHit[] {
  const ps = intersectLineCircleInfinite(line, arc.c, arc.r);
  const out: LAHit[] = [];

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];

    // Check if on line segment
    const onL = pointOnLineSegment(line, p, 1e-5);
    if (!onL.ok) continue;

    // Check if on arc sweep
    if (!pointOnArcSweepLocal(arc, p, 1e-5)) continue;

    const tA = arcParam01(arc, p);
    const proper = onL.t > 1e-6 && onL.t < 1 - 1e-6 && tA > 1e-6 && tA < 1 - 1e-6;

    out.push({ p, tLine: onL.t, tArc: tA, proper, meta: `LA#${i}` });
  }

  // Stable sort by point then meta
  out.sort((A, B) =>
    A.p.x !== B.p.x
      ? A.p.x - B.p.x
      : A.p.y !== B.p.y
        ? A.p.y - B.p.y
        : A.meta < B.meta
          ? -1
          : 1
  );

  return out;
}

// ============================================================================
// CIRCLE-CIRCLE Intersection
// ============================================================================

/**
 * Intersect two circles.
 */
function intersectCircleCircle(
  c0: Vec2,
  r0: number,
  c1: Vec2,
  r1: number
): Vec2[] {
  const d = dist(c0, c1);

  // Concentric or identical => ambiguous
  if (d < 1e-12) return [];

  // Too far apart
  if (d > r0 + r1 + 1e-9) return [];

  // One inside the other
  if (d < Math.abs(r0 - r1) - 1e-9) return [];

  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;

  if (h2 < -1e-9) return [];

  const h = Math.sqrt(Math.max(0, h2));
  const v = mul(sub(c1, c0), 1 / d);
  const p2 = add(c0, mul(v, a));
  const perp = { x: -v.y, y: v.x };

  if (h < 1e-9) return [p2];

  return stableLex([add(p2, mul(perp, h)), sub(p2, mul(perp, h))]);
}

// ============================================================================
// ARC-ARC Intersection
// ============================================================================

type AAHit = {
  p: Vec2;
  t0: number;
  t1: number;
  proper: boolean;
  meta: string;
};

/**
 * Check if two arcs are coincident or overlapping (same circle, overlapping sweeps).
 */
function arcsCoincidentOrOverlapping(a0: SegArc, a1: SegArc): boolean {
  // Must be same circle
  if (dist(a0.c, a1.c) > 1e-6) return false;
  if (Math.abs(a0.r - a1.r) > 1e-6) return false;

  // Check if sweeps overlap - test a0's start, end, and midpoint against a1's sweep
  const midDeg = a0.cw
    ? normDeg(a0.startDeg - arcSweepTotalDeg(a0) / 2)
    : normDeg(a0.startDeg + arcSweepTotalDeg(a0) / 2);

  const testAngles = [normDeg(a0.startDeg), normDeg(a0.endDeg), midDeg];

  return testAngles.some((ang) =>
    angleOnArcSweepDeg(ang, a1.startDeg, a1.endDeg, a1.cw)
  );
}

/**
 * Intersect two arc segments.
 */
function intersectArcArcSegment(
  a0: SegArc,
  a1: SegArc
): { kind: 'POINTS'; hits: AAHit[] } | { kind: 'OVERLAP' } | { kind: 'NONE' } {
  // Detect coincident circle overlap
  if (arcsCoincidentOrOverlapping(a0, a1)) {
    return { kind: 'OVERLAP' };
  }

  const ps = intersectCircleCircle(a0.c, a0.r, a1.c, a1.r);
  const hits: AAHit[] = [];

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];

    if (!pointOnArcSweepLocal(a0, p, 1e-5)) continue;
    if (!pointOnArcSweepLocal(a1, p, 1e-5)) continue;

    const t0 = arcParam01(a0, p);
    const t1 = arcParam01(a1, p);
    const proper = t0 > 1e-6 && t0 < 1 - 1e-6 && t1 > 1e-6 && t1 < 1 - 1e-6;

    hits.push({ p, t0, t1, proper, meta: `AA#${i}` });
  }

  // Stable sort
  hits.sort((A, B) =>
    A.p.x !== B.p.x
      ? A.p.x - B.p.x
      : A.p.y !== B.p.y
        ? A.p.y - B.p.y
        : A.meta < B.meta
          ? -1
          : 1
  );

  if (hits.length === 0) return { kind: 'NONE' };
  return { kind: 'POINTS', hits };
}

// ============================================================================
// Fingerprint Generation
// ============================================================================

/**
 * Generate stable fingerprint for a hit (quantized to 1 micron grid).
 */
function generateFingerprint(hit: Omit<IntersectionHit, 'fingerprint'>): string {
  const q = (v: number) => Math.round(v * 1e6); // 1 micron grid
  const px = hit.p ? q(hit.p.x) : 0;
  const py = hit.p ? q(hit.p.y) : 0;
  const tI = hit.tI !== undefined ? q(hit.tI) : 0;
  const tJ = hit.tJ !== undefined ? q(hit.tJ) : 0;
  return `${hit.kind}|${hit.segI}|${hit.segJ}|${px}|${py}|${tI}|${tJ}|${hit.meta}`;
}

// ============================================================================
// Main Self-Intersection Detector
// ============================================================================

/**
 * Detect all self-intersections in a path.
 *
 * Uses O(n²) pairwise segment checks with deterministic ordering.
 * Adjacent segments are skipped (they share endpoints by design).
 * Shared endpoint touches are ignored.
 *
 * @param path - Path to check for self-intersections
 * @returns Array of intersection hits, sorted deterministically
 */
export function detectSelfIntersections(path: PathForIntersect): IntersectionHit[] {
  const n = path.segs.length;
  const hits: IntersectionHit[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent segments
      if (areAdjacent(i, j, n, path.closed)) continue;

      const si = path.segs[i];
      const sj = path.segs[j];

      // LINE-LINE
      if (si.kind === 'LINE' && sj.kind === 'LINE') {
        const h = intersectLineLineSegment(si as SegLine, sj as SegLine, 1e-6);

        if (h.kind === 'OVERLAP') {
          const base: Omit<IntersectionHit, 'fingerprint'> = {
            kind: 'OVERLAP',
            segI: i,
            segJ: j,
            meta: 'LL_OVERLAP',
          };
          hits.push({ ...base, fingerprint: generateFingerprint(base) });
        } else if (h.kind === 'POINT') {
          const kind: HitKind = h.proper ? 'CROSS' : 'TOUCH';

          // Ignore shared-endpoint touches
          if (kind === 'TOUCH' && isSharedEndpointHit(h.p, si, sj)) continue;

          const base: Omit<IntersectionHit, 'fingerprint'> = {
            kind,
            p: h.p,
            segI: i,
            segJ: j,
            tI: h.t1,
            tJ: h.t2,
            meta: 'LL_POINT',
          };
          hits.push({ ...base, fingerprint: generateFingerprint(base) });
        }
      }

      // LINE-ARC
      else if (si.kind === 'LINE' && sj.kind === 'ARC') {
        const hs = intersectLineArcSegment(si as SegLine, sj as SegArc);

        for (const h of hs) {
          const kind: HitKind = h.proper ? 'CROSS' : 'TOUCH';

          if (kind === 'TOUCH' && isSharedEndpointHit(h.p, si, sj)) continue;

          const base: Omit<IntersectionHit, 'fingerprint'> = {
            kind,
            p: h.p,
            segI: i,
            segJ: j,
            tI: h.tLine,
            tJ: h.tArc,
            meta: h.meta,
          };
          hits.push({ ...base, fingerprint: generateFingerprint(base) });
        }
      }

      // ARC-LINE (swap order)
      else if (si.kind === 'ARC' && sj.kind === 'LINE') {
        const hs = intersectLineArcSegment(sj as SegLine, si as SegArc);

        for (const h of hs) {
          const kind: HitKind = h.proper ? 'CROSS' : 'TOUCH';

          if (kind === 'TOUCH' && isSharedEndpointHit(h.p, si, sj)) continue;

          const base: Omit<IntersectionHit, 'fingerprint'> = {
            kind,
            p: h.p,
            segI: i,
            segJ: j,
            tI: h.tArc,
            tJ: h.tLine,
            meta: `AL:${h.meta}`,
          };
          hits.push({ ...base, fingerprint: generateFingerprint(base) });
        }
      }

      // ARC-ARC
      else if (si.kind === 'ARC' && sj.kind === 'ARC') {
        const r = intersectArcArcSegment(si as SegArc, sj as SegArc);

        if (r.kind === 'OVERLAP') {
          const base: Omit<IntersectionHit, 'fingerprint'> = {
            kind: 'OVERLAP',
            segI: i,
            segJ: j,
            meta: 'AA_OVERLAP',
          };
          hits.push({ ...base, fingerprint: generateFingerprint(base) });
        } else if (r.kind === 'POINTS') {
          for (const h of r.hits) {
            const kind: HitKind = h.proper ? 'CROSS' : 'TOUCH';

            if (kind === 'TOUCH' && isSharedEndpointHit(h.p, si, sj)) continue;

            const base: Omit<IntersectionHit, 'fingerprint'> = {
              kind,
              p: h.p,
              segI: i,
              segJ: j,
              tI: h.t0,
              tJ: h.t1,
              meta: h.meta,
            };
            hits.push({ ...base, fingerprint: generateFingerprint(base) });
          }
        }
      }
    }
  }

  // Final stable sort
  hits.sort((A, B) =>
    A.segI !== B.segI
      ? A.segI - B.segI
      : A.segJ !== B.segJ
        ? A.segJ - B.segJ
        : A.kind < B.kind
          ? -1
          : A.kind > B.kind
            ? 1
            : A.fingerprint < B.fingerprint
              ? -1
              : A.fingerprint > B.fingerprint
                ? 1
                : 0
  );

  return hits;
}

// ============================================================================
// Gate Policy Helpers
// ============================================================================

/**
 * Result of self-intersection check for Gate.
 */
export interface SelfIntersectResult {
  /** Whether path passes (no blocking issues) */
  valid: boolean;
  /** Whether path has any self-intersections */
  hasIntersections: boolean;
  /** Count of each hit type */
  counts: {
    cross: number;
    touch: number;
    overlap: number;
  };
  /** All detected hits */
  hits: IntersectionHit[];
  /** Blocking issues for Gate */
  blockIssues: IntersectionHit[];
}

/**
 * Check path for self-intersections and apply Gate policy.
 *
 * Default policy (European factory standard):
 * - CROSS: Always BLOCK
 * - OVERLAP: Always BLOCK
 * - TOUCH (non-endpoint): BLOCK by default
 *
 * @param path - Path to check
 * @param allowNonEndpointTouch - If true, allow TOUCH hits that aren't at shared endpoints
 * @returns Result with validity, counts, and blocking issues
 */
export function checkSelfIntersections(
  path: PathForIntersect,
  allowNonEndpointTouch = false
): SelfIntersectResult {
  const hits = detectSelfIntersections(path);

  const counts = {
    cross: 0,
    touch: 0,
    overlap: 0,
  };

  const blockIssues: IntersectionHit[] = [];

  for (const hit of hits) {
    switch (hit.kind) {
      case 'CROSS':
        counts.cross++;
        blockIssues.push(hit);
        break;
      case 'OVERLAP':
        counts.overlap++;
        blockIssues.push(hit);
        break;
      case 'TOUCH':
        counts.touch++;
        if (!allowNonEndpointTouch) {
          blockIssues.push(hit);
        }
        break;
    }
  }

  return {
    valid: blockIssues.length === 0,
    hasIntersections: hits.length > 0,
    counts,
    hits,
    blockIssues,
  };
}

/**
 * Quick check if path has any blocking self-intersections.
 */
export function hasSelfIntersections(path: PathForIntersect): boolean {
  const result = checkSelfIntersections(path);
  return !result.valid;
}

/**
 * Get fingerprints of all blocking issues (for Gate reporting).
 */
export function getSelfIntersectFingerprints(path: PathForIntersect): string[] {
  const result = checkSelfIntersections(path);
  return result.blockIssues.map((h) => h.fingerprint);
}
