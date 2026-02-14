/**
 * FlatPart Types
 *
 * Core data structure for a flat panel part ready for CNC/DXF export.
 * Different from FlatPartPreview - this is the final, validated representation.
 *
 * @version 1.0.0
 */

// ============================================================================
// Basic Types
// ============================================================================

/** 2D point [x, y] in mm */
export type Point2D = [number, number];

/** Winding direction type */
export type WindingDirection = 'CCW' | 'CW';

/** Contour (closed polygon) with winding direction */
export interface Contour {
  /** Unique contour ID */
  id: string;
  /** Points forming the closed polygon (first != last, implicit close) */
  points: Point2D[];
  /** Winding direction: CCW for outer, CW for inner (holes) */
  winding: WindingDirection;
}

// ============================================================================
// FlatPart
// ============================================================================

/**
 * FlatPart - A single flat panel part ready for manufacturing.
 *
 * Represents a 2D shape with:
 * - One outer contour (CCW winding)
 * - Zero or more inner contours/holes (CW winding)
 * - Optional toolpaths (grooves, dados)
 */
export interface FlatPart {
  /** Unique part ID */
  id: string;

  /** Part name/label */
  name: string;

  /** Outer boundary contour (CCW winding) */
  outerContour: Contour;

  /** Inner cutouts/holes (CW winding each) */
  innerContours: Contour[];

  /** Open toolpaths (grooves, dados) - not closed polygons */
  toolpaths: Toolpath[];

  /** Material thickness in mm */
  thickness: number;

  /** Material ID reference */
  materialId?: string;

  /** Source cabinet/panel reference */
  sourceRef?: {
    cabinetId: string;
    panelId?: string;
  };

  /** Creation timestamp */
  createdAt: number;
}

/** Open toolpath (groove, dado, rabbet) */
export interface Toolpath {
  /** Unique toolpath ID */
  id: string;
  /** Type of toolpath */
  type: 'groove' | 'dado' | 'rabbet' | 'pocket';
  /** Path points */
  points: Point2D[];
  /** Tool width in mm */
  width: number;
  /** Cut depth in mm */
  depth: number;
}

// ============================================================================
// Sheet Layout
// ============================================================================

/** Standard sheet sizes in mm */
export const SHEET_SIZES = {
  /** Standard 8x4 sheet */
  STANDARD: { width: 2440, height: 1220 },
  /** Half sheet */
  HALF: { width: 1220, height: 1220 },
  /** Quarter sheet */
  QUARTER: { width: 1220, height: 610 },
} as const;

/** Sheet definition */
export interface Sheet {
  /** Sheet dimensions in mm */
  width: number;
  height: number;
}

/** Placed part on a sheet */
export interface PlacedPart {
  /** Reference to FlatPart */
  partId: string;
  /** Position offset [x, y] in mm */
  position: Point2D;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation: 0 | 90 | 180 | 270;
}

/** Sheet layout with multiple parts */
export interface SheetLayout {
  /** Sheet definition */
  sheet: Sheet;
  /** Placed parts on this sheet */
  parts: PlacedPart[];
  /** Layout efficiency (0-1) */
  efficiency: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an empty FlatPart with default values.
 */
export function createEmptyFlatPart(id: string, name: string = 'Untitled'): FlatPart {
  return {
    id,
    name,
    outerContour: {
      id: `${id}_outer`,
      points: [],
      winding: 'CCW',
    },
    innerContours: [],
    toolpaths: [],
    thickness: 18,
    createdAt: Date.now(),
  };
}

/**
 * Create a rectangular FlatPart.
 */
export function createRectFlatPart(
  id: string,
  name: string,
  width: number,
  height: number,
  thickness: number = 18
): FlatPart {
  return {
    id,
    name,
    outerContour: {
      id: `${id}_outer`,
      points: [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      winding: 'CCW',
    },
    innerContours: [],
    toolpaths: [],
    thickness,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Geometry Helpers
// ============================================================================

/**
 * Calculate area of a contour using shoelace formula.
 * Positive = CCW, Negative = CW
 */
export function getContourArea(contour: Contour): number {
  const pts = contour.points;
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
 * Determine winding direction of a contour.
 */
export function getWindingDirection(contour: Contour): 'CCW' | 'CW' {
  return getContourArea(contour) >= 0 ? 'CCW' : 'CW';
}

/**
 * Reverse contour points to flip winding direction.
 */
export function reverseContour(contour: Contour): Contour {
  return {
    ...contour,
    points: [...contour.points].reverse(),
    winding: contour.winding === 'CCW' ? 'CW' : 'CCW',
  };
}

/**
 * Ensure contour has correct winding (CCW for outer, CW for inner).
 */
export function normalizeContourWinding(
  contour: Contour,
  expectedWinding: 'CCW' | 'CW'
): Contour {
  const actualWinding = getWindingDirection(contour);
  if (actualWinding !== expectedWinding) {
    return reverseContour(contour);
  }
  return { ...contour, winding: expectedWinding };
}

/**
 * Get bounding box of a FlatPart.
 */
export function getFlatPartBounds(part: FlatPart): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const points = part.outerContour.points;
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const [x, y] of points) {
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
