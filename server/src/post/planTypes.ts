/**
 * Toolpath Plan Types
 *
 * Step 10.5.4: General polyline boundary toolpath support
 *
 * These types define the canonical geometry format for toolpath plans.
 * The geometry is stored in toolpath_plan.json and used directly for
 * G-code generation without DXF parsing.
 */

// ============================================================================
// Point Types
// ============================================================================

export type Pt = { x: number; y: number };

// ============================================================================
// Segment Types
// ============================================================================

/**
 * Line segment from point A to point B.
 */
export type SegLine = {
  kind: 'LINE';
  a: Pt;
  b: Pt;
};

/**
 * Arc segment with center, radius, angles, and direction.
 *
 * - cw: true => G2 (clockwise), false => G3 (counter-clockwise)
 * - start/end: explicit endpoints to avoid recomputation drift
 */
export type SegArc = {
  kind: 'ARC';
  c: Pt;              // Center point
  r: number;          // Radius
  startDeg: number;   // Start angle in degrees
  endDeg: number;     // End angle in degrees
  cw: boolean;        // true => G2, false => G3
  start: Pt;          // Explicit start point
  end: Pt;            // Explicit end point
};

export type Segment = SegLine | SegArc;

// ============================================================================
// Path Types
// ============================================================================

/**
 * A continuous path of connected segments.
 *
 * - Segments must connect end-to-start within epsilon
 * - winding: "CCW" means boundary interior is left side of travel
 */
export type Path = {
  closed: boolean;
  segs: Segment[];
  winding: 'CW' | 'CCW';
};

// ============================================================================
// Geometry Container
// ============================================================================

/**
 * Part geometry registry for toolpath operations.
 */
export interface PartGeometry {
  /** Outer boundary of part in part-local coordinates */
  outer?: Path;
  /** Optional inner cutouts (holes, windows, etc.) */
  inners?: Path[];
}

// ============================================================================
// Tab Configuration
// ============================================================================

export interface TabConfig {
  enabled: boolean;
  count: number;
  lengthMm: number;
  insetMm: number;
  strategy: 'UNIFORM' | 'MID_EDGES';
}

// ============================================================================
// Operation Types (Extended)
// ============================================================================

export interface ProfileOp {
  kind: 'PROFILE';
  depthMm: number;
  toolMm: number;
  layer: string;
  tabs: TabConfig;
}

export interface GrooveOp {
  kind: 'GROOVE';
  depthMm: number;
  toolMm: number;
  layer: string;
  axis: 'X' | 'Y';
  offsetMm: number;
  widthMm: number;
  lengthMm?: number;
}

export interface DrillOp {
  kind: 'DRILL';
  depthMm: number;
  diaMm: number;
  layer: string;
  xMm: number;
  yMm: number;
  ref?: string;
}

export type PartOp = ProfileOp | GrooveOp | DrillOp;

// ============================================================================
// Part Definition
// ============================================================================

export interface ToolpathPart {
  partId: string;
  x: number;
  y: number;
  rot: 0 | 90;
  w: number;
  h: number;
  /** Material tag for tooling policy */
  materialTag?: string;
  /** Per-part geometry registry */
  geometry: PartGeometry;
  /** Operations to perform */
  ops: PartOp[];
}

// ============================================================================
// Sheet Definition
// ============================================================================

export interface ToolpathSheet {
  sheetIndex: number;
  parts: ToolpathPart[];
}

// ============================================================================
// Complete Toolpath Plan
// ============================================================================

export interface ToolpathPlanV2 {
  version: 'toolpath-plan.v2';
  jobName: string;
  sheetW: number;
  sheetH: number;
  materialTags?: string[];
  sheets: ToolpathSheet[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the start point of a segment.
 */
export function segmentStart(seg: Segment): Pt {
  return seg.kind === 'LINE' ? seg.a : seg.start;
}

/**
 * Get the end point of a segment.
 */
export function segmentEnd(seg: Segment): Pt {
  return seg.kind === 'LINE' ? seg.b : seg.end;
}

/**
 * Get the start point of a path.
 */
export function pathStart(path: Path): Pt {
  if (path.segs.length === 0) return { x: 0, y: 0 };
  return segmentStart(path.segs[0]);
}

/**
 * Get the end point of a path.
 */
export function pathEnd(path: Path): Pt {
  if (path.segs.length === 0) return { x: 0, y: 0 };
  return segmentEnd(path.segs[path.segs.length - 1]);
}

/**
 * Check if path is line-only (no arcs).
 */
export function isLineOnlyPath(path: Path): boolean {
  return path.segs.every(s => s.kind === 'LINE');
}
