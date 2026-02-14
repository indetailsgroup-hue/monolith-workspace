/**
 * Topology Repair for Offset Paths
 *
 * Step 10.5.10: Auto-repair offset topology by splitting at intersections,
 * building a planar graph, extracting simple loops, and selecting based on policy.
 *
 * This module makes offset paths "always machinable" by resolving self-intersections:
 * 1. Split segments at intersection points (from Step 10.5.9)
 * 2. Build a planar graph (DCEL-lite) from split segments
 * 3. Extract simple loops using half-edge traversal
 * 4. Select loops based on CutIntent (OUTSIDE/INSIDE) and winding
 *
 * The repair process is deterministic and produces stable results.
 */

import type { SegLine, SegArc, Segment } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  add,
  sub,
  mul,
  len,
  dist,
  norm,
  cross,
  dot,
  angleDeg,
  normDeg,
  degToRad,
  ccwDeltaDeg,
  cwDeltaDeg,
  pointAtAngleDeg,
  angleOfPointDeg,
  comparePoints,
} from './mathCore.js';
import {
  type IntersectionHit,
  type PathForIntersect,
  detectSelfIntersections,
} from './selfIntersect.js';

// ============================================================================
// Types
// ============================================================================

/** Cut intent - determines which loops to keep */
export type CutIntent = 'OUTSIDE' | 'INSIDE';

/** Winding direction */
export type Winding = 'CW' | 'CCW';

/**
 * Repair policy configuration.
 */
export interface RepairPolicy {
  /** Which loops to keep based on cut intent */
  intent: CutIntent;
  /** Maximum number of loops to return (0 = unlimited) */
  maxLoops?: number;
  /** Whether to verify repaired paths have no self-intersections */
  verifyResult?: boolean;
  /** Tolerance for point comparisons */
  tolerance?: number;
}

/**
 * Split point on a segment.
 */
export interface SplitPoint {
  /** Parameter t in [0,1] along segment */
  t: number;
  /** Point at split */
  p: Vec2;
  /** Source hit index (for tracing) */
  hitIdx: number;
}

/**
 * Split plan for a single segment.
 */
export interface SegmentSplitPlan {
  /** Original segment index */
  segIdx: number;
  /** Split points sorted by parameter */
  splits: SplitPoint[];
}

/**
 * Complete split plan for entire path.
 */
export interface SplitPlan {
  /** Per-segment split plans */
  segments: SegmentSplitPlan[];
  /** Total number of splits */
  totalSplits: number;
}

/**
 * Half-edge in the planar graph.
 */
export interface HalfEdge {
  /** Unique edge ID */
  id: number;
  /** Start vertex index */
  from: number;
  /** End vertex index */
  to: number;
  /** Original segment (after splitting) */
  seg: Segment;
  /** Twin half-edge ID (opposite direction) */
  twin: number;
  /** Next half-edge in face */
  next: number;
  /** Previous half-edge in face */
  prev: number;
  /** Face ID this edge belongs to */
  face: number;
  /** Whether this edge has been visited in loop extraction */
  visited: boolean;
}

/**
 * Vertex in the planar graph.
 */
export interface Vertex {
  /** Vertex ID */
  id: number;
  /** Position */
  p: Vec2;
  /** Outgoing half-edge IDs sorted by angle */
  outgoing: number[];
}

/**
 * Planar graph (DCEL-lite).
 */
export interface PlanarGraph {
  /** All vertices */
  vertices: Vertex[];
  /** All half-edges */
  edges: HalfEdge[];
  /** Vertex position to ID map */
  vertexMap: Map<string, number>;
}

/**
 * Extracted simple loop.
 */
export interface Loop {
  /** Loop ID */
  id: number;
  /** Segments forming the loop */
  segs: Segment[];
  /** Computed winding */
  winding: Winding;
  /** Signed area (positive = CCW, negative = CW) */
  signedArea: number;
  /** Bounding box */
  bbox: { min: Vec2; max: Vec2 };
  /** Whether this is an outer boundary */
  isOuter: boolean;
}

/**
 * Report item for repair process.
 */
export interface RepairReportItem {
  /** Step name */
  step: string;
  /** Status */
  status: 'OK' | 'WARN' | 'ERROR';
  /** Details */
  detail: string;
}

/**
 * Result of topology repair.
 */
export interface RepairResult {
  /** Whether repair was successful */
  success: boolean;
  /** Repaired loops (if successful) */
  loops: Loop[];
  /** Selected loop indices based on policy */
  selected: number[];
  /** Final repaired paths */
  paths: PathForIntersect[];
  /** Processing report */
  report: RepairReportItem[];
  /** Error message (if unsuccessful) */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TOLERANCE = 1e-6;

// ============================================================================
// Split Plan Builder
// ============================================================================

/**
 * Build split plan from intersection hits.
 * Groups splits by segment and sorts by parameter.
 */
export function buildSplitPlanFromHits(
  hits: IntersectionHit[],
  numSegments: number
): SplitPlan {
  // Initialize per-segment split lists
  const segments: SegmentSplitPlan[] = [];
  for (let i = 0; i < numSegments; i++) {
    segments.push({ segIdx: i, splits: [] });
  }

  // Collect split points from hits
  for (let h = 0; h < hits.length; h++) {
    const hit = hits[h];

    // Add split to segment I
    if (hit.p !== undefined && hit.tI !== undefined) {
      segments[hit.segI].splits.push({
        t: hit.tI,
        p: hit.p,
        hitIdx: h,
      });
    }

    // Add split to segment J
    if (hit.p !== undefined && hit.tJ !== undefined) {
      segments[hit.segJ].splits.push({
        t: hit.tJ,
        p: hit.p,
        hitIdx: h,
      });
    }
  }

  // Sort splits by parameter and deduplicate
  let totalSplits = 0;
  for (const plan of segments) {
    // Sort by t
    plan.splits.sort((a, b) => a.t - b.t);

    // Deduplicate (points very close in parameter)
    const deduped: SplitPoint[] = [];
    for (const sp of plan.splits) {
      if (deduped.length === 0 || sp.t - deduped[deduped.length - 1].t > 1e-9) {
        deduped.push(sp);
      }
    }
    plan.splits = deduped;
    totalSplits += plan.splits.length;
  }

  return { segments, totalSplits };
}

// ============================================================================
// Segment Splitting
// ============================================================================

/**
 * Get point on line segment at parameter t.
 */
function linePointAt(seg: SegLine, t: number): Vec2 {
  return add(seg.a, mul(sub(seg.b, seg.a), t));
}

/**
 * Get point on arc at parameter t (sweep fraction).
 */
function arcPointAt(arc: SegArc, t: number): Vec2 {
  const sweepTotal = arc.cw
    ? cwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg))
    : ccwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg));

  const angDeg = arc.cw
    ? normDeg(arc.startDeg) - sweepTotal * t
    : normDeg(arc.startDeg) + sweepTotal * t;

  return pointAtAngleDeg(arc.c, arc.r, angDeg);
}

/**
 * Split a LINE segment at given parameters.
 * Returns array of LINE segments.
 */
export function splitLine(seg: SegLine, splits: SplitPoint[]): SegLine[] {
  if (splits.length === 0) {
    return [seg];
  }

  const result: SegLine[] = [];
  let prevPt = seg.a;
  let prevT = 0;

  for (const sp of splits) {
    // Skip degenerate splits at endpoints
    if (sp.t <= prevT + 1e-9 || sp.t >= 1 - 1e-9) {
      continue;
    }

    result.push({
      kind: 'LINE',
      a: prevPt,
      b: sp.p,
    });

    prevPt = sp.p;
    prevT = sp.t;
  }

  // Final segment to end
  result.push({
    kind: 'LINE',
    a: prevPt,
    b: seg.b,
  });

  return result;
}

/**
 * Split an ARC segment at given parameters.
 * Returns array of ARC segments.
 */
export function splitArc(arc: SegArc, splits: SplitPoint[]): SegArc[] {
  if (splits.length === 0) {
    return [arc];
  }

  const result: SegArc[] = [];
  const sweepTotal = arc.cw
    ? cwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg))
    : ccwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg));

  let prevStartDeg = arc.startDeg;
  let prevT = 0;

  for (const sp of splits) {
    // Skip degenerate splits at endpoints
    if (sp.t <= prevT + 1e-9 || sp.t >= 1 - 1e-9) {
      continue;
    }

    // Calculate end angle for this sub-arc
    const endDeg = arc.cw
      ? normDeg(arc.startDeg - sweepTotal * sp.t)
      : normDeg(arc.startDeg + sweepTotal * sp.t);

    result.push({
      kind: 'ARC',
      c: arc.c,
      r: arc.r,
      startDeg: prevStartDeg,
      endDeg: endDeg,
      cw: arc.cw,
      start: pointAtAngleDeg(arc.c, arc.r, prevStartDeg),
      end: sp.p,
    });

    prevStartDeg = endDeg;
    prevT = sp.t;
  }

  // Final sub-arc to end
  result.push({
    kind: 'ARC',
    c: arc.c,
    r: arc.r,
    startDeg: prevStartDeg,
    endDeg: arc.endDeg,
    cw: arc.cw,
    start: pointAtAngleDeg(arc.c, arc.r, prevStartDeg),
    end: pointAtAngleDeg(arc.c, arc.r, arc.endDeg),
  });

  return result;
}

/**
 * Split all segments in a path according to split plan.
 */
export function splitPathSegments(
  segs: Segment[],
  plan: SplitPlan
): Segment[] {
  const result: Segment[] = [];

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const splitPlan = plan.segments[i];

    if (seg.kind === 'LINE') {
      result.push(...splitLine(seg as SegLine, splitPlan.splits));
    } else if (seg.kind === 'ARC') {
      result.push(...splitArc(seg as SegArc, splitPlan.splits));
    } else {
      // Pass through other segment types unchanged
      result.push(seg);
    }
  }

  return result;
}

// ============================================================================
// Planar Graph Builder (DCEL-lite)
// ============================================================================

/**
 * Generate vertex key for position.
 */
function vertexKey(p: Vec2, tol: number = DEFAULT_TOLERANCE): string {
  const q = (v: number) => Math.round(v / tol) * tol;
  return `${q(p.x).toFixed(9)},${q(p.y).toFixed(9)}`;
}

/**
 * Get segment start point.
 */
function segStart(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).a;
  }
  const arc = seg as SegArc;
  return arc.start || pointAtAngleDeg(arc.c, arc.r, arc.startDeg);
}

/**
 * Get segment end point.
 */
function segEnd(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    return (seg as SegLine).b;
  }
  const arc = seg as SegArc;
  return arc.end || pointAtAngleDeg(arc.c, arc.r, arc.endDeg);
}

/**
 * Get outgoing direction from segment start.
 */
function segDirAtStart(seg: Segment): Vec2 {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return norm(sub(line.b, line.a));
  }
  // Arc: tangent at start
  const arc = seg as SegArc;
  const startPt = segStart(seg);
  const radial = norm(sub(startPt, arc.c));
  // Tangent is perpendicular to radial
  return arc.cw ? { x: radial.y, y: -radial.x } : { x: -radial.y, y: radial.x };
}

/**
 * Create reversed segment.
 */
function reverseSegment(seg: Segment): Segment {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return { kind: 'LINE', a: line.b, b: line.a };
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
  };
}

/**
 * Build planar graph from split segments.
 */
export function buildPlanarGraph(
  segs: Segment[],
  tolerance: number = DEFAULT_TOLERANCE
): PlanarGraph {
  const vertices: Vertex[] = [];
  const edges: HalfEdge[] = [];
  const vertexMap = new Map<string, number>();

  // Helper to get or create vertex
  function getOrCreateVertex(p: Vec2): number {
    const key = vertexKey(p, tolerance);
    let id = vertexMap.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertices.push({ id, p, outgoing: [] });
      vertexMap.set(key, id);
    }
    return id;
  }

  // Create half-edges for each segment (and its twin)
  for (const seg of segs) {
    const fromVtx = getOrCreateVertex(segStart(seg));
    const toVtx = getOrCreateVertex(segEnd(seg));

    // Skip degenerate segments
    if (fromVtx === toVtx) continue;

    const edgeId = edges.length;
    const twinId = edges.length + 1;

    // Forward edge
    edges.push({
      id: edgeId,
      from: fromVtx,
      to: toVtx,
      seg: seg,
      twin: twinId,
      next: -1,
      prev: -1,
      face: -1,
      visited: false,
    });

    // Twin edge (reversed)
    edges.push({
      id: twinId,
      from: toVtx,
      to: fromVtx,
      seg: reverseSegment(seg),
      twin: edgeId,
      next: -1,
      prev: -1,
      face: -1,
      visited: false,
    });

    // Add to vertex outgoing lists
    vertices[fromVtx].outgoing.push(edgeId);
    vertices[toVtx].outgoing.push(twinId);
  }

  // Sort outgoing edges by angle for each vertex
  for (const vtx of vertices) {
    vtx.outgoing.sort((a, b) => {
      const dirA = segDirAtStart(edges[a].seg);
      const dirB = segDirAtStart(edges[b].seg);
      const angA = angleDeg(dirA);
      const angB = angleDeg(dirB);
      return angA - angB;
    });
  }

  // Link next/prev pointers using CCW ordering
  for (const vtx of vertices) {
    const n = vtx.outgoing.length;
    if (n === 0) continue;

    for (let i = 0; i < n; i++) {
      const outEdge = vtx.outgoing[i];
      const inEdge = edges[outEdge].twin;

      // Next edge after inEdge is the CCW-next outgoing edge
      // CCW-next means index (i + 1) mod n in the sorted list
      const nextIdx = (i + 1) % n;
      const nextEdge = vtx.outgoing[nextIdx];

      edges[inEdge].next = nextEdge;
      edges[nextEdge].prev = inEdge;
    }
  }

  return { vertices, edges, vertexMap };
}

// ============================================================================
// Loop Extraction
// ============================================================================

/**
 * Compute signed area of a loop (Shoelace formula).
 * Positive = CCW, Negative = CW.
 */
function computeSignedArea(segs: Segment[]): number {
  let area = 0;

  for (const seg of segs) {
    if (seg.kind === 'LINE') {
      const line = seg as SegLine;
      area += (line.b.x - line.a.x) * (line.b.y + line.a.y);
    } else if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      // For arcs, use trapezoidal approximation with several points
      const steps = 16;
      const sweepTotal = arc.cw
        ? cwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg))
        : ccwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg));

      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;

        const ang0 = arc.cw
          ? normDeg(arc.startDeg - sweepTotal * t0)
          : normDeg(arc.startDeg + sweepTotal * t0);
        const ang1 = arc.cw
          ? normDeg(arc.startDeg - sweepTotal * t1)
          : normDeg(arc.startDeg + sweepTotal * t1);

        const p0 = pointAtAngleDeg(arc.c, arc.r, ang0);
        const p1 = pointAtAngleDeg(arc.c, arc.r, ang1);

        area += (p1.x - p0.x) * (p1.y + p0.y);
      }
    }
  }

  return area / 2;
}

/**
 * Compute bounding box of segments.
 */
function computeBBox(segs: Segment[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  const updatePt = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  for (const seg of segs) {
    updatePt(segStart(seg));
    updatePt(segEnd(seg));

    // For arcs, also check extreme points
    if (seg.kind === 'ARC') {
      const arc = seg as SegArc;
      // Check cardinal directions on the arc
      for (const cardinalDeg of [0, 90, 180, 270]) {
        const sweepTotal = arc.cw
          ? cwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg))
          : ccwDeltaDeg(normDeg(arc.startDeg), normDeg(arc.endDeg));

        const delta = arc.cw
          ? cwDeltaDeg(normDeg(arc.startDeg), cardinalDeg)
          : ccwDeltaDeg(normDeg(arc.startDeg), cardinalDeg);

        if (delta <= sweepTotal + 1e-9) {
          updatePt(pointAtAngleDeg(arc.c, arc.r, cardinalDeg));
        }
      }
    }
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Extract all simple loops from planar graph using half-edge traversal.
 */
export function extractLoops(graph: PlanarGraph): Loop[] {
  const loops: Loop[] = [];

  // Mark all edges as unvisited
  for (const edge of graph.edges) {
    edge.visited = false;
  }

  // Traverse each unvisited edge to find loops
  for (const startEdge of graph.edges) {
    if (startEdge.visited) continue;

    const loopSegs: Segment[] = [];
    let current = startEdge;
    let iterations = 0;
    const maxIter = graph.edges.length * 2;

    while (!current.visited && iterations < maxIter) {
      current.visited = true;
      loopSegs.push(current.seg);

      // Move to next edge in face
      if (current.next < 0 || current.next >= graph.edges.length) {
        break;
      }
      current = graph.edges[current.next];

      // Check if we've returned to start
      if (current.id === startEdge.id) {
        break;
      }

      iterations++;
    }

    // Valid loop must close and have at least 3 edges (typically)
    if (loopSegs.length >= 1) {
      const area = computeSignedArea(loopSegs);
      const winding: Winding = area >= 0 ? 'CCW' : 'CW';
      const bbox = computeBBox(loopSegs);

      loops.push({
        id: loops.length,
        segs: loopSegs,
        winding,
        signedArea: area,
        bbox,
        isOuter: area >= 0, // CCW = outer boundary convention
      });
    }
  }

  return loops;
}

// ============================================================================
// Loop Selection
// ============================================================================

/**
 * Check if bbox A contains bbox B.
 */
function bboxContains(
  outer: { min: Vec2; max: Vec2 },
  inner: { min: Vec2; max: Vec2 }
): boolean {
  return (
    outer.min.x <= inner.min.x &&
    outer.min.y <= inner.min.y &&
    outer.max.x >= inner.max.x &&
    outer.max.y >= inner.max.y
  );
}

/**
 * Select loops based on cut intent.
 *
 * For OUTSIDE cut:
 * - Select outermost CCW boundary (largest area)
 * - Exclude inner CW holes
 *
 * For INSIDE cut:
 * - Select innermost CW boundaries (holes)
 * - These represent the material to remove
 */
export function selectLoopsForIntent(
  loops: Loop[],
  intent: CutIntent
): number[] {
  if (loops.length === 0) return [];

  // Sort by absolute area (largest first)
  const sorted = loops
    .map((l, i) => ({ loop: l, idx: i }))
    .sort((a, b) => Math.abs(b.loop.signedArea) - Math.abs(a.loop.signedArea));

  const selected: number[] = [];

  if (intent === 'OUTSIDE') {
    // For outside cut, take the outermost CCW loop
    for (const item of sorted) {
      if (item.loop.winding === 'CCW' && item.loop.signedArea > 0) {
        selected.push(item.idx);
        break;
      }
    }

    // If no CCW found, take largest regardless
    if (selected.length === 0 && sorted.length > 0) {
      selected.push(sorted[0].idx);
    }
  } else {
    // For inside cut (pocket), take CW loops (holes)
    for (const item of sorted) {
      if (item.loop.winding === 'CW') {
        selected.push(item.idx);
      }
    }

    // If no CW loops, take CCW loops that are contained within larger CCW
    if (selected.length === 0) {
      const ccwLoops = sorted.filter((s) => s.loop.winding === 'CCW');
      if (ccwLoops.length >= 2) {
        // All except the outermost
        for (let i = 1; i < ccwLoops.length; i++) {
          selected.push(ccwLoops[i].idx);
        }
      }
    }
  }

  return selected;
}

// ============================================================================
// Main Repair Function
// ============================================================================

/**
 * Repair offset path topology by resolving self-intersections.
 *
 * Process:
 * 1. Detect self-intersections (Step 10.5.9)
 * 2. Build split plan from intersection hits
 * 3. Split segments at intersection points
 * 4. Build planar graph (DCEL-lite)
 * 5. Extract simple loops
 * 6. Select loops based on policy (OUTSIDE/INSIDE)
 * 7. Optionally verify result has no self-intersections
 *
 * @param path - Path to repair
 * @param policy - Repair policy configuration
 * @returns Repair result with selected loops
 */
export function repairOffsetTopology(
  path: PathForIntersect,
  policy: RepairPolicy
): RepairResult {
  const report: RepairReportItem[] = [];
  const tolerance = policy.tolerance ?? DEFAULT_TOLERANCE;

  // Step 1: Detect self-intersections
  const hits = detectSelfIntersections(path);

  if (hits.length === 0) {
    // No intersections - path is already clean
    report.push({
      step: 'detect',
      status: 'OK',
      detail: 'No self-intersections detected',
    });

    // Return original path as single loop
    const area = computeSignedArea(path.segs);
    const loop: Loop = {
      id: 0,
      segs: [...path.segs],
      winding: area >= 0 ? 'CCW' : 'CW',
      signedArea: area,
      bbox: computeBBox(path.segs),
      isOuter: area >= 0,
    };

    return {
      success: true,
      loops: [loop],
      selected: [0],
      paths: [{ segs: [...path.segs], closed: path.closed }],
      report,
    };
  }

  report.push({
    step: 'detect',
    status: 'WARN',
    detail: `Found ${hits.length} self-intersection(s)`,
  });

  // Step 2: Build split plan
  const splitPlan = buildSplitPlanFromHits(hits, path.segs.length);
  report.push({
    step: 'split-plan',
    status: 'OK',
    detail: `Created ${splitPlan.totalSplits} split point(s)`,
  });

  // Step 3: Split segments
  const splitSegs = splitPathSegments(path.segs, splitPlan);
  report.push({
    step: 'split-segments',
    status: 'OK',
    detail: `Split into ${splitSegs.length} segment(s)`,
  });

  // Step 4: Build planar graph
  const graph = buildPlanarGraph(splitSegs, tolerance);
  report.push({
    step: 'build-graph',
    status: 'OK',
    detail: `Graph has ${graph.vertices.length} vertices, ${graph.edges.length} half-edges`,
  });

  // Step 5: Extract loops
  const loops = extractLoops(graph);
  report.push({
    step: 'extract-loops',
    status: loops.length > 0 ? 'OK' : 'ERROR',
    detail: `Extracted ${loops.length} loop(s)`,
  });

  if (loops.length === 0) {
    return {
      success: false,
      loops: [],
      selected: [],
      paths: [],
      report,
      error: 'No loops extracted from planar graph',
    };
  }

  // Step 6: Select loops based on policy
  let selected = selectLoopsForIntent(loops, policy.intent);

  // Apply max loops limit
  if (policy.maxLoops && policy.maxLoops > 0 && selected.length > policy.maxLoops) {
    selected = selected.slice(0, policy.maxLoops);
  }

  report.push({
    step: 'select-loops',
    status: selected.length > 0 ? 'OK' : 'WARN',
    detail: `Selected ${selected.length} loop(s) for ${policy.intent} intent`,
  });

  // Build output paths
  const paths: PathForIntersect[] = selected.map((idx) => ({
    segs: loops[idx].segs,
    closed: true,
  }));

  // Step 7: Optionally verify result
  if (policy.verifyResult) {
    let allClean = true;
    for (let i = 0; i < paths.length; i++) {
      const verifyHits = detectSelfIntersections(paths[i]);
      if (verifyHits.length > 0) {
        allClean = false;
        report.push({
          step: 'verify',
          status: 'WARN',
          detail: `Loop ${selected[i]} still has ${verifyHits.length} self-intersection(s)`,
        });
      }
    }

    if (allClean) {
      report.push({
        step: 'verify',
        status: 'OK',
        detail: 'All selected loops verified clean',
      });
    }
  }

  return {
    success: true,
    loops,
    selected,
    paths,
    report,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick repair for outside cut (most common case).
 */
export function repairForOutsideCut(path: PathForIntersect): RepairResult {
  return repairOffsetTopology(path, {
    intent: 'OUTSIDE',
    maxLoops: 1,
    verifyResult: true,
  });
}

/**
 * Quick repair for inside cut (pocket).
 */
export function repairForInsideCut(path: PathForIntersect): RepairResult {
  return repairOffsetTopology(path, {
    intent: 'INSIDE',
    verifyResult: true,
  });
}

/**
 * Check if path needs repair (has self-intersections).
 */
export function needsRepair(path: PathForIntersect): boolean {
  const hits = detectSelfIntersections(path);
  return hits.length > 0;
}
