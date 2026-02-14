/**
 * FlatPart from Preview Converter
 *
 * Converts FlatPartPreview (ephemeral sketch preview) to FlatPart (final manufacturing data).
 * Handles winding normalization and validation.
 *
 * @version 1.0.0
 */

import type { FlatPartPreview, Poly2, Path2D } from './previewTypes';
import type { FlatPart, Contour, Toolpath, Point2D } from './flatpartTypes';
import {
  normalizeContourWinding,
  getWindingDirection,
} from './flatpartTypes';

// ============================================================================
// Types
// ============================================================================

export interface ConvertOptions {
  /** Part name */
  name?: string;
  /** Material thickness in mm */
  thickness?: number;
  /** Material ID */
  materialId?: string;
  /** Source cabinet reference */
  sourceRef?: {
    cabinetId: string;
    panelId?: string;
  };
  /** Auto-fix winding direction */
  autoFixWinding?: boolean;
}

export interface ConvertResult {
  /** Converted FlatPart (null if failed) */
  flatPart: FlatPart | null;
  /** Success status */
  success: boolean;
  /** Error/warning messages */
  messages: string[];
}

// ============================================================================
// Main Converter
// ============================================================================

/**
 * Convert a FlatPartPreview to a FlatPart.
 *
 * @param preview - The preview to convert
 * @param options - Conversion options
 * @returns ConvertResult with FlatPart or error messages
 */
export function fromPreviewToFlatPart(
  preview: FlatPartPreview,
  options: ConvertOptions = {}
): ConvertResult {
  const messages: string[] = [];
  const {
    name = 'Sketch Part',
    thickness = 18,
    materialId,
    sourceRef,
    autoFixWinding = true,
  } = options;

  // Validate: must have outline
  if (!preview.outline) {
    return {
      flatPart: null,
      success: false,
      messages: ['No outline found in preview. Draw an outer boundary first.'],
    };
  }

  // Validate: outline must have at least 3 points
  if (preview.outline.points.length < 3) {
    return {
      flatPart: null,
      success: false,
      messages: ['Outline must have at least 3 points.'],
    };
  }

  // Generate unique ID
  const partId = `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // Convert outline to outer contour
  let outerContour = polyToContour(preview.outline, `${partId}_outer`);

  // Normalize coordinates to positive quadrant (shift so min is at origin)
  const offset = calculateBoundingBoxOffset(outerContour.points);
  if (offset.x !== 0 || offset.y !== 0) {
    outerContour.points = shiftPoints(outerContour.points, offset);
    messages.push(`Coordinates shifted by [${offset.x.toFixed(0)}, ${offset.y.toFixed(0)}] to positive quadrant.`);
  }

  // Check/fix winding for outer contour (should be CCW)
  const outerWinding = getWindingDirection(outerContour);
  if (outerWinding !== 'CCW') {
    if (autoFixWinding) {
      outerContour = normalizeContourWinding(outerContour, 'CCW');
      messages.push('Outer contour winding corrected to CCW.');
    } else {
      messages.push('Warning: Outer contour has CW winding (should be CCW).');
    }
  }

  // Convert cutouts to inner contours
  const innerContours: Contour[] = [];
  for (let i = 0; i < preview.cutouts.length; i++) {
    const cutout = preview.cutouts[i];

    if (cutout.points.length < 3) {
      messages.push(`Cutout ${i + 1} skipped: needs at least 3 points.`);
      continue;
    }

    let innerContour = polyToContour(cutout, `${partId}_inner_${i}`);

    // Apply same offset as outer contour
    if (offset.x !== 0 || offset.y !== 0) {
      innerContour.points = shiftPoints(innerContour.points, offset);
    }

    // Check/fix winding for inner contours (should be CW)
    const innerWinding = getWindingDirection(innerContour);
    if (innerWinding !== 'CW') {
      if (autoFixWinding) {
        innerContour = normalizeContourWinding(innerContour, 'CW');
        messages.push(`Cutout ${i + 1} winding corrected to CW.`);
      } else {
        messages.push(`Warning: Cutout ${i + 1} has CCW winding (should be CW).`);
      }
    }

    innerContours.push(innerContour);
  }

  // Convert paths to toolpaths
  const toolpaths: Toolpath[] = [];
  for (let i = 0; i < preview.paths.length; i++) {
    const path = preview.paths[i];

    if (path.points.length < 2) {
      messages.push(`Path ${i + 1} skipped: needs at least 2 points.`);
      continue;
    }

    const toolpath = pathToToolpath(path, `${partId}_path_${i}`);

    // Apply same offset as outer contour
    if (offset.x !== 0 || offset.y !== 0) {
      toolpath.points = shiftPoints(toolpath.points, offset);
    }

    toolpaths.push(toolpath);
  }

  // Build FlatPart
  const flatPart: FlatPart = {
    id: partId,
    name,
    outerContour,
    innerContours,
    toolpaths,
    thickness,
    materialId,
    sourceRef,
    createdAt: Date.now(),
  };

  // Summary message
  const summary = [
    `Created FlatPart "${name}"`,
    `- Outer: ${outerContour.points.length} points`,
    `- Cutouts: ${innerContours.length}`,
    `- Toolpaths: ${toolpaths.length}`,
  ].join('\n');
  messages.push(summary);

  return {
    flatPart,
    success: true,
    messages,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Poly2 to Contour.
 */
function polyToContour(poly: Poly2, id: string): Contour {
  return {
    id,
    points: poly.points.map((p) => [...p] as Point2D),
    winding: 'CCW', // Will be corrected by normalizeContourWinding
  };
}

/**
 * Convert Path2D to Toolpath.
 */
function pathToToolpath(path: Path2D, id: string): Toolpath {
  return {
    id,
    type: 'groove',
    points: path.points.map((p) => [...p] as Point2D),
    width: 6, // Default groove width
    depth: 9, // Default groove depth (half of 18mm)
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a FlatPart is valid for export.
 */
export function validateFlatPart(part: FlatPart): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check outer contour
  if (!part.outerContour || part.outerContour.points.length < 3) {
    errors.push('Outer contour must have at least 3 points.');
  }

  // Check for self-intersection (basic check)
  if (part.outerContour && hasSelfIntersection(part.outerContour.points)) {
    errors.push('Outer contour has self-intersection.');
  }

  // Check inner contours
  for (let i = 0; i < part.innerContours.length; i++) {
    const inner = part.innerContours[i];
    if (inner.points.length < 3) {
      errors.push(`Inner contour ${i + 1} must have at least 3 points.`);
    }
    if (hasSelfIntersection(inner.points)) {
      errors.push(`Inner contour ${i + 1} has self-intersection.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Basic self-intersection check (O(n^2) - for small polygons).
 */
function hasSelfIntersection(points: Point2D[]): boolean {
  const n = points.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges
      if (j === (i + n - 1) % n) continue;

      const b1 = points[j];
      const b2 = points[(j + 1) % n];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if two line segments intersect.
 */
function segmentsIntersect(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D
): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Cross product direction.
 */
function direction(p1: Point2D, p2: Point2D, p3: Point2D): number {
  return (p3[0] - p1[0]) * (p2[1] - p1[1]) - (p2[0] - p1[0]) * (p3[1] - p1[1]);
}

// ============================================================================
// Coordinate Normalization
// ============================================================================

interface BoundingBoxOffset {
  x: number;
  y: number;
}

/**
 * Calculate offset needed to shift points to positive quadrant.
 * Returns the offset to subtract from all points so min becomes (0,0).
 */
function calculateBoundingBoxOffset(points: Point2D[]): BoundingBoxOffset {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }

  return { x: minX, y: minY };
}

/**
 * Shift all points by negating the offset (move to positive quadrant).
 */
function shiftPoints(points: Point2D[], offset: BoundingBoxOffset): Point2D[] {
  return points.map(([x, y]) => [x - offset.x, y - offset.y] as Point2D);
}
