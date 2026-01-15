/**
 * Coordinate Transform Utilities
 *
 * Step 10.5: Part-local to sheet-global coordinate conversion
 *
 * When parts are placed on sheets, their local operations (drills, grooves)
 * need to be transformed to sheet coordinates for G-code generation.
 *
 * Transformations:
 * - Translation (part origin on sheet)
 * - Rotation (0° or 90° for rotation packing)
 * - Z-axis remains in part-local (surface is Z=0)
 */

// ============================================================================
// Types
// ============================================================================

export type Rotation = 0 | 90;

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface PartPlacement {
  /** Part origin X on sheet (mm) */
  x: number;
  /** Part origin Y on sheet (mm) */
  y: number;
  /** Part width after rotation (mm) */
  w: number;
  /** Part height after rotation (mm) */
  h: number;
  /** Rotation applied (0 or 90 degrees) */
  rot: Rotation;
  /** Original part width before rotation (mm) */
  originalW: number;
  /** Original part height before rotation (mm) */
  originalH: number;
}

export interface TransformContext {
  placement: PartPlacement;
  /** Material thickness for Z calculations (mm) */
  thickness: number;
}

// ============================================================================
// Core Transform Functions
// ============================================================================

/**
 * Transform a point from part-local to sheet-global coordinates.
 *
 * Part-local origin is bottom-left corner of part (as placed on sheet).
 * Rotation pivots around part center, then translates to sheet position.
 *
 * @param local - Point in part-local coordinates
 * @param ctx - Transform context with placement info
 * @returns Point in sheet-global coordinates
 */
export function partLocalToSheet(local: Point2D, ctx: TransformContext): Point2D {
  const { placement } = ctx;
  const { x: px, y: py, rot, originalW, originalH } = placement;

  let sheetX: number;
  let sheetY: number;

  if (rot === 0) {
    // No rotation - direct translation
    sheetX = px + local.x;
    sheetY = py + local.y;
  } else {
    // 90° rotation (CCW): (x, y) -> (-y, x) relative to center
    // Then shift to new bounding box
    // For CCW: new_x = original_h - local_y, new_y = local_x
    sheetX = px + (originalH - local.y);
    sheetY = py + local.x;
  }

  return { x: sheetX, y: sheetY };
}

/**
 * Transform a 3D point (includes Z for depth operations).
 *
 * Z coordinate is in part-local (surface = 0, positive into material).
 * Sheet Z is relative to spoilboard (surface = thickness).
 *
 * @param local - Point in part-local 3D coordinates
 * @param ctx - Transform context
 * @returns Point in sheet-global 3D coordinates
 */
export function partLocalToSheet3D(local: Point3D, ctx: TransformContext): Point3D {
  const xy = partLocalToSheet({ x: local.x, y: local.y }, ctx);

  // Z transform: part surface is at Z = thickness above spoilboard
  // A hole going 10mm deep from surface: sheet Z = thickness - 10
  // For through cuts: sheet Z goes negative (into spoilboard)
  const sheetZ = ctx.thickness - local.z;

  return {
    x: xy.x,
    y: xy.y,
    z: sheetZ,
  };
}

/**
 * Transform a drill operation to sheet coordinates.
 *
 * @param drill - Drill position in part-local coords
 * @param depth - Drill depth (positive = into material)
 * @param ctx - Transform context
 * @returns Drill in sheet coordinates with actual Z values
 */
export function transformDrill(
  drill: Point2D,
  depth: number,
  ctx: TransformContext
): { x: number; y: number; zSurface: number; zBottom: number } {
  const xy = partLocalToSheet(drill, ctx);
  const zSurface = ctx.thickness;  // Top surface of material
  const zBottom = ctx.thickness - depth;  // Bottom of hole

  return {
    x: xy.x,
    y: xy.y,
    zSurface,
    zBottom,
  };
}

/**
 * Transform a line segment from part-local to sheet coordinates.
 *
 * @param start - Start point in part-local
 * @param end - End point in part-local
 * @param ctx - Transform context
 * @returns Transformed line segment
 */
export function transformLine(
  start: Point2D,
  end: Point2D,
  ctx: TransformContext
): { start: Point2D; end: Point2D } {
  return {
    start: partLocalToSheet(start, ctx),
    end: partLocalToSheet(end, ctx),
  };
}

/**
 * Transform a polyline (array of points) to sheet coordinates.
 *
 * @param points - Points in part-local coordinates
 * @param ctx - Transform context
 * @returns Transformed points
 */
export function transformPolyline(points: Point2D[], ctx: TransformContext): Point2D[] {
  return points.map(p => partLocalToSheet(p, ctx));
}

// ============================================================================
// Rotation Helpers
// ============================================================================

/**
 * Get dimensions after rotation.
 */
export function rotatedDimensions(
  w: number,
  h: number,
  rot: Rotation
): { w: number; h: number } {
  return rot === 0 ? { w, h } : { w: h, h: w };
}

/**
 * Create transform context from placement data.
 */
export function createTransformContext(
  x: number,
  y: number,
  originalW: number,
  originalH: number,
  rot: Rotation,
  thickness: number
): TransformContext {
  const { w, h } = rotatedDimensions(originalW, originalH, rot);

  return {
    placement: { x, y, w, h, rot, originalW, originalH },
    thickness,
  };
}

// ============================================================================
// Bounding Box Utilities
// ============================================================================

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculate bounding box for a set of points.
 */
export function boundingBox(points: Point2D[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Get bounding box of part on sheet.
 */
export function partBoundingBox(placement: PartPlacement): BoundingBox {
  return {
    minX: placement.x,
    minY: placement.y,
    maxX: placement.x + placement.w,
    maxY: placement.y + placement.h,
  };
}

// ============================================================================
// Path Optimization
// ============================================================================

/**
 * Sort drill points to minimize travel distance (simple nearest-neighbor).
 */
export function optimizeDrillOrder(drills: Point2D[]): Point2D[] {
  if (drills.length <= 1) return [...drills];

  const result: Point2D[] = [];
  const remaining = [...drills];

  // Start from origin
  let current: Point2D = { x: 0, y: 0 };

  while (remaining.length > 0) {
    // Find nearest point
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = distance(current, remaining[i]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    current = remaining[nearestIdx];
    result.push(current);
    remaining.splice(nearestIdx, 1);
  }

  return result;
}

/**
 * Calculate distance between two points.
 */
function distance(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// Z-Level Utilities
// ============================================================================

/**
 * Calculate Z levels for multi-pass cutting.
 *
 * @param totalDepth - Total depth to cut (mm)
 * @param maxDepthPerPass - Maximum depth per pass (mm)
 * @param thickness - Material thickness (mm)
 * @returns Array of Z levels (descending from surface)
 */
export function calculateZLevels(
  totalDepth: number,
  maxDepthPerPass: number,
  thickness: number
): number[] {
  const levels: number[] = [];
  let remaining = totalDepth;
  let currentZ = thickness;

  while (remaining > 0) {
    const pass = Math.min(remaining, maxDepthPerPass);
    currentZ -= pass;
    levels.push(currentZ);
    remaining -= pass;
  }

  return levels;
}

/**
 * Determine if a cut is a through-cut (goes through material).
 */
export function isThroughCut(depth: number, thickness: number): boolean {
  return depth >= thickness;
}
