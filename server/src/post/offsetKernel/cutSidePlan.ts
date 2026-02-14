/**
 * Inside/Outside Cut Logic
 *
 * Step 10.6.3: Automatic detection and selection of machinable loops.
 *
 * This module determines which loops from offset paths are:
 * - Perimeters (outer boundaries to cut around)
 * - Holes (inner boundaries to cut as pockets)
 * - Discarded (invalid or too small)
 *
 * The selection is based on:
 * - Containment relationships (which loops contain others)
 * - Nesting depth parity (even=perimeter, odd=hole)
 * - Cut intent (OUTSIDE for contours, INSIDE for pockets)
 *
 * All algorithms are deterministic with stable fingerprints for Gate reporting.
 */

import type { Path, Segment, SegLine, SegArc } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  add,
  sub,
  mul,
  len,
  dist,
  norm,
  degToRad,
  normDeg,
  ccwDeltaDeg,
  cwDeltaDeg,
  pointAtAngleDeg,
} from './mathCore.js';

// ============================================================================
// Types
// ============================================================================

/** Cut intent - determines selection strategy */
export type CutIntent = 'OUTSIDE' | 'INSIDE';

/** Role of a loop in the cut plan */
export type LoopRole = 'PERIMETER' | 'HOLE' | 'DISCARDED';

/** Winding direction */
export type Winding = 'CW' | 'CCW';

/**
 * Characterized loop with computed properties.
 */
export interface LoopInfo {
  /** Unique loop ID */
  id: string;
  /** Original path */
  path: Path;
  /** Absolute area (always positive) */
  areaAbs: number;
  /** Signed area (positive=CCW, negative=CW) */
  signedArea: number;
  /** Computed winding direction */
  winding: Winding;
  /** Bounding box */
  bbox: { min: Vec2; max: Vec2 };
  /** Sample point guaranteed inside the loop */
  samplePoint: Vec2;
  /** Nesting depth (0=top-level) */
  depth: number;
  /** Assigned role */
  role: LoopRole;
}

/**
 * Containment relationship between loops.
 */
export interface ContainmentEdge {
  /** Outer (containing) loop ID */
  outerId: string;
  /** Inner (contained) loop ID */
  innerId: string;
}

/**
 * Report item for cut side plan.
 */
export interface CutSideReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint for Gate deduplication */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Complete cut side plan.
 */
export interface CutSidePlan {
  /** Perimeter loops (outer boundaries) */
  perimeter: LoopInfo[];
  /** Hole loops (inner boundaries) */
  holes: LoopInfo[];
  /** Discarded loops (invalid or too small) */
  discarded: LoopInfo[];
  /** Containment relationships */
  containment: ContainmentEdge[];
  /** Processing report */
  report: CutSideReportItem[];
  /** Whether plan is valid for machining */
  valid: boolean;
}

/**
 * Configuration for cut side plan building.
 */
export interface CutSidePlanConfig {
  /** Cut intent (OUTSIDE/INSIDE) */
  intent: CutIntent;
  /** Minimum area threshold (below = discarded) */
  minAreaMm2?: number;
  /** Maximum nesting depth allowed */
  maxDepth?: number;
  /** Arc sampling step in degrees */
  arcStepDeg?: number;
  /** Desired winding for perimeters */
  perimeterWinding?: Winding;
  /** Desired winding for holes */
  holeWinding?: Winding;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MIN_AREA = 1.0; // 1 mm²
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_ARC_STEP_DEG = 10;

// ============================================================================
// Geometry Utilities
// ============================================================================

/**
 * Get arc sweep total in degrees.
 */
function arcSweepTotalDeg(arc: SegArc): number {
  const s = normDeg(arc.startDeg);
  const e = normDeg(arc.endDeg);
  return arc.cw ? cwDeltaDeg(s, e) : ccwDeltaDeg(s, e);
}

/**
 * Get angle at parameter t on arc (sweep fraction).
 */
function angleAtArcT(arc: SegArc, t: number): number {
  const sweep = arcSweepTotalDeg(arc);
  const s = normDeg(arc.startDeg);
  return arc.cw ? normDeg(s - sweep * t) : normDeg(s + sweep * t);
}

/**
 * Sample points along a segment for polygon approximation.
 */
function sampleSegmentPoints(seg: Segment, arcStepDeg: number): Vec2[] {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return [line.a, line.b];
  }

  const arc = seg as SegArc;
  const pts: Vec2[] = [];
  const total = arcSweepTotalDeg(arc);
  const steps = Math.max(2, Math.ceil(total / arcStepDeg));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = angleAtArcT(arc, t);
    const rad = degToRad(ang);
    pts.push({
      x: arc.c.x + arc.r * Math.cos(rad),
      y: arc.c.y + arc.r * Math.sin(rad),
    });
  }

  return pts;
}

/**
 * Flatten path to polygon points (for area/containment calculations).
 */
export function flattenPathToPolygon(path: Path, arcStepDeg: number = DEFAULT_ARC_STEP_DEG): Vec2[] {
  const pts: Vec2[] = [];

  for (const seg of path.segs) {
    const sp = sampleSegmentPoints(seg, arcStepDeg);

    if (pts.length === 0) {
      pts.push(sp[0]);
    }

    // Append excluding first to avoid duplicates
    for (let i = 1; i < sp.length; i++) {
      pts.push(sp[i]);
    }
  }

  // Ensure closed
  if (pts.length > 0 && dist(pts[0], pts[pts.length - 1]) > EPS_POS) {
    pts.push(pts[0]);
  }

  return pts;
}

/**
 * Compute bounding box of points.
 */
export function computeBoundingBox(pts: Vec2[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Compute signed area of polygon (Shoelace formula).
 * Positive = CCW, Negative = CW.
 */
export function computePolygonArea(pts: Vec2[]): number {
  let area = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    area += p.x * q.y - q.x * p.y;
  }

  return area / 2;
}

/**
 * Determine winding from signed area.
 */
export function windingFromArea(signedArea: number): Winding {
  return signedArea >= 0 ? 'CCW' : 'CW';
}

/**
 * Compute polygon centroid.
 */
export function computePolygonCentroid(pts: Vec2[]): Vec2 {
  let A = 0,
    cx = 0,
    cy = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const cross2 = p.x * q.y - q.x * p.y;
    A += cross2;
    cx += (p.x + q.x) * cross2;
    cy += (p.y + q.y) * cross2;
  }

  A *= 0.5;

  if (Math.abs(A) < 1e-12) {
    // Degenerate polygon - return first point
    return pts[0];
  }

  cx /= 6 * A;
  cy /= 6 * A;

  return { x: cx, y: cy };
}

// ============================================================================
// Point-in-Polygon (Ray Casting)
// ============================================================================

/**
 * Check if point is inside polygon using ray casting.
 * Deterministic algorithm with stable results.
 */
export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;

  for (let i = 0, j = poly.length - 2; i < poly.length - 1; j = i++) {
    const a = poly[i];
    const b = poly[j];

    const intersect =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y + 1e-18) + a.x;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Pick a sample point guaranteed to be inside the polygon.
 * Uses centroid with deterministic fallbacks for concave shapes.
 */
export function pickInteriorSamplePoint(
  poly: Vec2[],
  bbox: { min: Vec2; max: Vec2 }
): Vec2 {
  // Try centroid first
  const centroid = computePolygonCentroid(poly);
  if (pointInPolygon(centroid, poly)) {
    return centroid;
  }

  // Bbox center with deterministic nudges
  const mid = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
  };

  // Deterministic nudge pattern
  const nudges = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
    { x: 2, y: 1 },
    { x: -2, y: 1 },
    { x: 2, y: -1 },
    { x: -2, y: -1 },
  ];

  const dx = (bbox.max.x - bbox.min.x) * 1e-4 + 1e-6;
  const dy = (bbox.max.y - bbox.min.y) * 1e-4 + 1e-6;

  for (const n of nudges) {
    const p = { x: mid.x + n.x * dx, y: mid.y + n.y * dy };
    if (pointInPolygon(p, poly)) {
      return p;
    }
  }

  // Worst-case fallback: first vertex (may be on boundary but deterministic)
  return poly[0];
}

// ============================================================================
// Containment Detection
// ============================================================================

/**
 * Check if outer bbox contains inner bbox.
 */
function bboxContains(
  outer: { min: Vec2; max: Vec2 },
  inner: { min: Vec2; max: Vec2 }
): boolean {
  return (
    outer.min.x <= inner.min.x + EPS_POS &&
    outer.min.y <= inner.min.y + EPS_POS &&
    outer.max.x >= inner.max.x - EPS_POS &&
    outer.max.y >= inner.max.y - EPS_POS
  );
}

/**
 * Check if outer loop contains inner loop.
 */
function loopContainsLoop(
  outer: LoopInfo,
  inner: LoopInfo,
  outerPoly: Vec2[]
): boolean {
  // Quick reject with bbox
  if (!bboxContains(outer.bbox, inner.bbox)) {
    return false;
  }

  // Containment check using sample point
  return pointInPolygon(inner.samplePoint, outerPoly);
}

// ============================================================================
// Depth Calculation
// ============================================================================

/**
 * Compute nesting depth for a loop based on containment graph.
 */
function computeNestingDepth(
  loopId: string,
  parents: Map<string, string[]>
): number {
  let depth = 0;
  let cur = loopId;
  const seen = new Set<string>();

  while (true) {
    const ps = parents.get(cur) ?? [];
    if (ps.length === 0) break;

    // Deterministic: sort and take first
    ps.sort();
    const p = ps[0];

    if (seen.has(p)) break; // Avoid cycles
    seen.add(p);

    depth++;
    cur = p;
  }

  return depth;
}

// ============================================================================
// Path Reversal
// ============================================================================

/**
 * Reverse a path (flip direction).
 */
export function reversePath(path: Path): Path {
  const segs: Segment[] = path.segs.slice().reverse().map((seg) => {
    if (seg.kind === 'LINE') {
      const line = seg as SegLine;
      return { kind: 'LINE', a: line.b, b: line.a } as SegLine;
    }

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
    } as SegArc;
  });

  return { segs, closed: path.closed, winding: path.winding === 'CW' ? 'CCW' : 'CW' };
}

/**
 * Normalize loop winding to desired direction.
 */
export function normalizeLoopWinding(
  loop: LoopInfo,
  desired: Winding,
  arcStepDeg: number = DEFAULT_ARC_STEP_DEG
): LoopInfo {
  if (loop.winding === desired) {
    return loop;
  }

  // Reverse the path
  const rp = reversePath(loop.path);

  // Recompute properties
  const poly = flattenPathToPolygon(rp, arcStepDeg);
  const signedArea = computePolygonArea(poly);
  const bbox = computeBoundingBox(poly);
  const samplePoint = pickInteriorSamplePoint(poly, bbox);

  return {
    ...loop,
    path: rp,
    signedArea,
    areaAbs: Math.abs(signedArea),
    winding: windingFromArea(signedArea),
    bbox,
    samplePoint,
  };
}

// ============================================================================
// Loop Characterization
// ============================================================================

/**
 * Characterize a single loop path.
 */
export function characterizeLoop(
  path: Path,
  id: string,
  arcStepDeg: number = DEFAULT_ARC_STEP_DEG
): LoopInfo {
  const poly = flattenPathToPolygon(path, arcStepDeg);
  const signedArea = computePolygonArea(poly);
  const bbox = computeBoundingBox(poly);
  const samplePoint = pickInteriorSamplePoint(poly, bbox);

  return {
    id,
    path,
    areaAbs: Math.abs(signedArea),
    signedArea,
    winding: windingFromArea(signedArea),
    bbox,
    samplePoint,
    depth: 0, // Will be computed later
    role: 'PERIMETER', // Will be assigned later
  };
}

// ============================================================================
// Main Plan Builder
// ============================================================================

/**
 * Build inside/outside cut plan from loops.
 *
 * Process:
 * 1. Characterize all loops (area, bbox, sample point)
 * 2. Build containment graph
 * 3. Compute nesting depth for each loop
 * 4. Classify by depth parity (even=perimeter, odd=hole for OUTSIDE intent)
 * 5. Discard too-small loops
 * 6. Validate and report issues
 *
 * @param loopPaths - Paths from topology repair (10.5.10)
 * @param config - Configuration for plan building
 * @returns Complete cut side plan
 */
export function buildCutSidePlan(
  loopPaths: Path[],
  config: CutSidePlanConfig
): CutSidePlan {
  const report: CutSideReportItem[] = [];
  const arcStepDeg = config.arcStepDeg ?? DEFAULT_ARC_STEP_DEG;
  const minArea = config.minAreaMm2 ?? DEFAULT_MIN_AREA;
  const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
  const perimeterWinding = config.perimeterWinding ?? 'CW';
  const holeWinding = config.holeWinding ?? 'CCW';

  // Step 1: Characterize all loops
  const loops: LoopInfo[] = loopPaths.map((p, idx) =>
    characterizeLoop(p, `L${idx}`, arcStepDeg)
  );

  report.push({
    code: 'LOOPS_CHARACTERIZED',
    detail: `Characterized ${loops.length} loop(s)`,
    fingerprint: `10.6.3:CHAR:${loops.length}`,
    severity: 'INFO',
  });

  // Step 2: Build containment graph
  const containment: ContainmentEdge[] = [];
  const parents = new Map<string, string[]>();

  // Precompute polygons
  const polys = new Map<string, Vec2[]>();
  for (const L of loops) {
    polys.set(L.id, flattenPathToPolygon(L.path, arcStepDeg));
  }

  // Check all pairs for containment
  for (let i = 0; i < loops.length; i++) {
    for (let j = 0; j < loops.length; j++) {
      if (i === j) continue;

      const outer = loops[i];
      const inner = loops[j];

      // Outer must be larger (deterministic heuristic)
      if (outer.areaAbs <= inner.areaAbs) continue;

      if (loopContainsLoop(outer, inner, polys.get(outer.id)!)) {
        containment.push({ outerId: outer.id, innerId: inner.id });

        const arr = parents.get(inner.id) ?? [];
        arr.push(outer.id);
        parents.set(inner.id, arr);
      }
    }
  }

  report.push({
    code: 'CONTAINMENT_BUILT',
    detail: `Found ${containment.length} containment relationship(s)`,
    fingerprint: `10.6.3:CONTAIN:${containment.length}`,
    severity: 'INFO',
  });

  // Step 3: Compute nesting depth for each loop
  for (const loop of loops) {
    loop.depth = computeNestingDepth(loop.id, parents);
  }

  // Check for excessive depth
  const maxFoundDepth = Math.max(...loops.map((l) => l.depth), 0);
  if (maxFoundDepth > maxDepth) {
    report.push({
      code: 'NESTING_DEPTH_TOO_HIGH',
      detail: `Maximum nesting depth ${maxFoundDepth} exceeds limit ${maxDepth}`,
      fingerprint: `10.6.3:DEPTH:${maxFoundDepth}`,
      severity: 'WARN',
    });
  }

  // Step 4: Classify by depth parity and intent
  const perimeter: LoopInfo[] = [];
  const holes: LoopInfo[] = [];
  const discarded: LoopInfo[] = [];

  for (const loop of loops) {
    // Check minimum area
    if (loop.areaAbs < minArea) {
      loop.role = 'DISCARDED';
      discarded.push(loop);

      report.push({
        code: 'AREA_TOO_SMALL',
        detail: `Loop ${loop.id} area ${loop.areaAbs.toFixed(2)}mm² < ${minArea}mm²`,
        fingerprint: `10.6.3:SMALL:${loop.id}`,
        severity: 'WARN',
      });

      continue;
    }

    const parity = loop.depth % 2;

    if (config.intent === 'OUTSIDE') {
      // OUTSIDE: even depth = perimeter, odd depth = hole
      if (parity === 0) {
        loop.role = 'PERIMETER';
        perimeter.push(loop);
      } else {
        loop.role = 'HOLE';
        holes.push(loop);
      }
    } else {
      // INSIDE: odd depth = target (hole/pocket), even depth = boundary context
      if (parity === 1) {
        loop.role = 'HOLE';
        holes.push(loop);
      } else {
        loop.role = 'PERIMETER';
        perimeter.push(loop);
      }
    }
  }

  // Step 5: Sort for deterministic ordering
  // Perimeters: largest first
  perimeter.sort((a, b) => b.areaAbs - a.areaAbs || (a.id < b.id ? -1 : 1));
  // Holes: smallest first (cut smallest pockets first)
  holes.sort((a, b) => a.areaAbs - b.areaAbs || (a.id < b.id ? -1 : 1));

  // Step 6: Normalize winding
  for (let i = 0; i < perimeter.length; i++) {
    perimeter[i] = normalizeLoopWinding(perimeter[i], perimeterWinding, arcStepDeg);
  }
  for (let i = 0; i < holes.length; i++) {
    holes[i] = normalizeLoopWinding(holes[i], holeWinding, arcStepDeg);
  }

  // Step 7: Validate and report
  let valid = true;

  if (perimeter.length === 0) {
    report.push({
      code: 'NO_PERIMETER',
      detail: 'No top-level perimeter loop found after classification',
      fingerprint: '10.6.3:NO_PERIMETER',
      severity: 'BLOCK',
    });
    valid = false;
  }

  // Check for holes outside any perimeter
  for (const hole of holes) {
    const hasParent = containment.some((c) => c.innerId === hole.id);
    if (!hasParent && perimeter.length > 0) {
      report.push({
        code: 'HOLE_OUTSIDE_PERIMETER',
        detail: `Hole ${hole.id} is not contained by any perimeter`,
        fingerprint: `10.6.3:ORPHAN:${hole.id}`,
        severity: 'WARN',
      });
    }
  }

  report.push({
    code: 'PLAN_COMPLETE',
    detail: `Plan: ${perimeter.length} perimeter(s), ${holes.length} hole(s), ${discarded.length} discarded`,
    fingerprint: `10.6.3:PLAN:${perimeter.length}:${holes.length}:${discarded.length}`,
    severity: 'INFO',
  });

  return {
    perimeter,
    holes,
    discarded,
    containment,
    report,
    valid,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Build cut plan for outside cut (profile/contour).
 */
export function buildOutsideCutPlan(loopPaths: Path[]): CutSidePlan {
  return buildCutSidePlan(loopPaths, {
    intent: 'OUTSIDE',
    perimeterWinding: 'CW',
    holeWinding: 'CCW',
  });
}

/**
 * Build cut plan for inside cut (pocket/hole).
 */
export function buildInsideCutPlan(loopPaths: Path[]): CutSidePlan {
  return buildCutSidePlan(loopPaths, {
    intent: 'INSIDE',
    perimeterWinding: 'CW',
    holeWinding: 'CCW',
  });
}

/**
 * Get all blocking issues from a cut side plan.
 */
export function getBlockingIssues(plan: CutSidePlan): CutSideReportItem[] {
  return plan.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if plan is valid for machining.
 */
export function isPlanValid(plan: CutSidePlan): boolean {
  return plan.valid && getBlockingIssues(plan).length === 0;
}

/**
 * Get fingerprints of all issues for Gate reporting.
 */
export function getPlanFingerprints(plan: CutSidePlan): string[] {
  return plan.report.map((r) => r.fingerprint);
}
