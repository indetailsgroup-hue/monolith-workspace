/**
 * FlatPart Preview Types
 *
 * Types for 2D preview of sketch → flat part conversion.
 * Used for visualization before committing to actual FlatPart.
 *
 * @version 1.0.0
 */

// ============================================================================
// Basic Types
// ============================================================================

/** 2D point [x, y] in mm on the CPlane */
export type Point2D = [number, number];

/** 2D polygon (closed path) */
export interface Poly2 {
  /** Unique polygon ID */
  id: string;
  /** Array of points forming the polygon */
  points: Point2D[];
  /** Whether the polygon is closed (last point connects to first) */
  closed: boolean;
}

/** 2D path (open or closed) */
export interface Path2D {
  /** Unique path ID */
  id: string;
  /** Array of points forming the path */
  points: Point2D[];
  /** Whether the path is closed */
  closed: boolean;
}

// ============================================================================
// Preview Types
// ============================================================================

/** Type of preview feature */
export type PreviewFeatureType = 'outline' | 'cutout_rect' | 'cutout_path' | 'cutout_circle';

/** Preview feature metadata */
export interface PreviewFeature {
  /** Feature ID (matches sketch entity ID) */
  id: string;
  /** Feature type */
  type: PreviewFeatureType;
  /** Source sketch entity ID */
  sourceEntityId: string;
}

/**
 * FlatPart Preview
 *
 * Represents a 2D preview of a flat part created from sketch entities.
 * Contains an optional outline polygon and multiple cutout features.
 */
export interface FlatPartPreview {
  /** Outer boundary polygon (panel outline) */
  outline: Poly2 | null;

  /** Interior cutouts (holes, pockets) */
  cutouts: Poly2[];

  /** Open paths (grooves, slots) */
  paths: Path2D[];

  /** Feature metadata */
  features: PreviewFeature[];

  /** Timestamp of last modification */
  timestamp: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an empty FlatPart preview.
 */
export function createEmptyPreview(): FlatPartPreview {
  return {
    outline: null,
    cutouts: [],
    paths: [],
    features: [],
    timestamp: Date.now(),
  };
}

/**
 * Create a Poly2 from points.
 */
export function createPoly2(id: string, points: Point2D[], closed = true): Poly2 {
  return { id, points, closed };
}

/**
 * Create a Path2D from points.
 */
export function createPath2D(id: string, points: Point2D[], closed = false): Path2D {
  return { id, points, closed };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a polygon is valid (has at least 3 points for closed, 2 for open).
 */
export function isValidPoly(poly: Poly2): boolean {
  if (!poly || !poly.points) return false;
  const minPoints = poly.closed ? 3 : 2;
  return poly.points.length >= minPoints;
}

/**
 * Check if a preview has any content.
 */
export function hasPreviewContent(preview: FlatPartPreview): boolean {
  return (
    preview.outline !== null ||
    preview.cutouts.length > 0 ||
    preview.paths.length > 0
  );
}

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Calculate bounding box of a polygon.
 */
export function getPolyBounds(poly: Poly2): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (!poly.points.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const [x, y] of poly.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate area of a polygon using shoelace formula.
 * Positive = counter-clockwise, Negative = clockwise
 */
export function getPolyArea(poly: Poly2): number {
  const pts = poly.points;
  if (pts.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }

  return area / 2;
}

/**
 * Check if polygon is clockwise (negative area).
 */
export function isClockwise(poly: Poly2): boolean {
  return getPolyArea(poly) < 0;
}
