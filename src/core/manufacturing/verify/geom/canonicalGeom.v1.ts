// src/core/manufacturing/verify/geom/canonicalGeom.v1.ts
/**
 * Canonical Geometry Contracts.
 *
 * Normalized geometry representation for DXF/Flatten models.
 * Used as ground truth for consistency verification.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

// =============================================================================
// PRIMITIVES
// =============================================================================

/**
 * 2D point.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Bounding box.
 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// =============================================================================
// SEGMENTS
// =============================================================================

/**
 * Line segment.
 */
export interface LineSeg {
  kind: "LINE";
  a: Point2D;
  b: Point2D;
}

/**
 * Arc segment.
 *
 * Defined by center, radius, start/end angles.
 */
export interface ArcSeg {
  kind: "ARC";
  c: Point2D;
  r: number;
  a0: number; // Start angle (radians)
  a1: number; // End angle (radians)
  cw: boolean; // Clockwise direction
}

/**
 * Segment (line or arc).
 */
export type Seg = LineSeg | ArcSeg;

// =============================================================================
// PATHS
// =============================================================================

/**
 * Canonical path.
 *
 * Ordered sequence of segments forming a contour.
 */
export interface CanonPath {
  /** Path identifier */
  pathId: string;

  /** Is path closed (loop) */
  closed: boolean;

  /** Ordered segments */
  segs: Seg[];

  /** Bounding box */
  bbox: BBox;

  /** Total path length (mm) */
  lengthMm: number;

  /** Winding direction (for closed paths) */
  winding?: "CW" | "CCW";

  /** Start point */
  startPoint?: Point2D;

  /** End point */
  endPoint?: Point2D;
}

// =============================================================================
// FEATURES
// =============================================================================

/**
 * Feature kind.
 */
export type FeatureKind = "DRILL" | "SLOT" | "POCKET" | "GROOVE" | "COUNTERBORE";

/**
 * Drill feature.
 */
export interface DrillFeature {
  featureId: string;
  kind: "DRILL";
  center: Point2D;
  diameterMm: number;
  depthMm?: number;
  throughHole?: boolean;
}

/**
 * Slot/groove feature.
 */
export interface SlotFeature {
  featureId: string;
  kind: "SLOT" | "GROOVE";
  path: CanonPath;
  widthMm: number;
  depthMm: number;
}

/**
 * Pocket feature.
 */
export interface PocketFeature {
  featureId: string;
  kind: "POCKET";
  boundary: CanonPath;
  depthMm: number;
  islands?: CanonPath[];
}

/**
 * Counterbore feature.
 */
export interface CounterboreFeature {
  featureId: string;
  kind: "COUNTERBORE";
  center: Point2D;
  boreDiameterMm: number;
  boreDepthMm: number;
  holeDiameterMm: number;
  holeDepthMm?: number;
}

/**
 * Any feature type.
 */
export type Feature =
  | DrillFeature
  | SlotFeature
  | PocketFeature
  | CounterboreFeature;

// =============================================================================
// PARTS
// =============================================================================

/**
 * Canonical part.
 *
 * Complete part geometry with outer boundary, inner cutouts, and features.
 */
export interface CanonPart {
  /** Part identifier */
  partId: string;

  /** Part name */
  name?: string;

  /** Outer boundary (profile) */
  outer: CanonPath;

  /** Inner cutouts (holes, pockets that go through) */
  inners: CanonPath[];

  /** Manufacturing features */
  features: Feature[];

  /** Part bounding box */
  bbox: BBox;

  /** Material thickness (mm) */
  thicknessMm?: number;

  /** Part area (mm²) */
  areaMm2?: number;
}

// =============================================================================
// MODEL
// =============================================================================

/**
 * Canonical model.
 *
 * Complete sheet/job geometry for verification.
 */
export interface CanonModel {
  /** Model version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** All parts on sheet */
  parts: CanonPart[];

  /** Sheet dimensions */
  sheetSize?: {
    widthMm: number;
    heightMm: number;
  };

  /** Audit fingerprint (SHA-256 of model) */
  auditFp: string;

  /** Generation timestamp */
  generatedAt?: string;

  /** Generator version */
  generatorVersion?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate line segment length.
 */
export function lineSegLength(seg: LineSeg): number {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculate arc segment length.
 */
export function arcSegLength(seg: ArcSeg): number {
  let sweep = seg.a1 - seg.a0;
  if (seg.cw) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  return Math.abs(sweep) * seg.r;
}

/**
 * Calculate segment length.
 */
export function segLength(seg: Seg): number {
  return seg.kind === "LINE" ? lineSegLength(seg) : arcSegLength(seg);
}

/**
 * Calculate path length from segments.
 */
export function calculatePathLength(segs: Seg[]): number {
  return segs.reduce((sum, seg) => sum + segLength(seg), 0);
}

/**
 * Calculate bounding box from segments.
 */
export function calculatePathBBox(segs: Seg[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const seg of segs) {
    if (seg.kind === "LINE") {
      minX = Math.min(minX, seg.a.x, seg.b.x);
      minY = Math.min(minY, seg.a.y, seg.b.y);
      maxX = Math.max(maxX, seg.a.x, seg.b.x);
      maxY = Math.max(maxY, seg.a.y, seg.b.y);
    } else {
      // Arc: sample to find bounds (simplified)
      const { c, r, a0, a1, cw } = seg;
      // Include endpoints
      minX = Math.min(minX, c.x + r * Math.cos(a0), c.x + r * Math.cos(a1));
      minY = Math.min(minY, c.y + r * Math.sin(a0), c.y + r * Math.sin(a1));
      maxX = Math.max(maxX, c.x + r * Math.cos(a0), c.x + r * Math.cos(a1));
      maxY = Math.max(maxY, c.y + r * Math.sin(a0), c.y + r * Math.sin(a1));
      // Check cardinal points
      const cardinals = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const angle of cardinals) {
        if (isAngleInSweep(angle, a0, a1, cw)) {
          minX = Math.min(minX, c.x + r * Math.cos(angle));
          minY = Math.min(minY, c.y + r * Math.sin(angle));
          maxX = Math.max(maxX, c.x + r * Math.cos(angle));
          maxY = Math.max(maxY, c.y + r * Math.sin(angle));
        }
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if angle is within arc sweep.
 */
export function isAngleInSweep(
  angle: number,
  a0: number,
  a1: number,
  cw: boolean
): boolean {
  // Normalize angles to [0, 2π)
  const TWO_PI = Math.PI * 2;
  const normalize = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

  const na = normalize(angle);
  const n0 = normalize(a0);
  const n1 = normalize(a1);

  if (cw) {
    // Clockwise: from n0 going down to n1
    if (n0 >= n1) {
      return na <= n0 && na >= n1;
    } else {
      return na <= n0 || na >= n1;
    }
  } else {
    // Counter-clockwise: from n0 going up to n1
    if (n0 <= n1) {
      return na >= n0 && na <= n1;
    } else {
      return na >= n0 || na <= n1;
    }
  }
}

/**
 * Get segment start point.
 */
export function getSegStart(seg: Seg): Point2D {
  if (seg.kind === "LINE") {
    return seg.a;
  }
  return {
    x: seg.c.x + seg.r * Math.cos(seg.a0),
    y: seg.c.y + seg.r * Math.sin(seg.a0),
  };
}

/**
 * Get segment end point.
 */
export function getSegEnd(seg: Seg): Point2D {
  if (seg.kind === "LINE") {
    return seg.b;
  }
  return {
    x: seg.c.x + seg.r * Math.cos(seg.a1),
    y: seg.c.y + seg.r * Math.sin(seg.a1),
  };
}

/**
 * Check if path is closed (within tolerance).
 */
export function isPathClosed(segs: Seg[], tolerance: number = 0.01): boolean {
  if (segs.length === 0) return false;

  const start = getSegStart(segs[0]);
  const end = getSegEnd(segs[segs.length - 1]);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.hypot(dx, dy) <= tolerance;
}

/**
 * Calculate path winding direction.
 */
export function calculateWinding(segs: Seg[]): "CW" | "CCW" {
  // Shoelace formula on sampled points
  let area = 0;
  const points: Point2D[] = [];

  for (const seg of segs) {
    points.push(getSegStart(seg));
  }
  if (segs.length > 0) {
    points.push(getSegEnd(segs[segs.length - 1]));
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    area += (p1.x - p0.x) * (p1.y + p0.y);
  }

  return area >= 0 ? "CW" : "CCW";
}

/**
 * Create canonical path from segments.
 */
export function createCanonPath(
  pathId: string,
  segs: Seg[],
  closed?: boolean
): CanonPath {
  const bbox = calculatePathBBox(segs);
  const lengthMm = calculatePathLength(segs);
  const isClosed = closed ?? isPathClosed(segs);

  return {
    pathId,
    closed: isClosed,
    segs,
    bbox,
    lengthMm,
    winding: isClosed ? calculateWinding(segs) : undefined,
    startPoint: segs.length > 0 ? getSegStart(segs[0]) : undefined,
    endPoint: segs.length > 0 ? getSegEnd(segs[segs.length - 1]) : undefined,
  };
}
