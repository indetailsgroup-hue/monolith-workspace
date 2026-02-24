/**
 * DXF R12 Types
 *
 * Step 10: Type definitions for DXF entities and documents
 *
 * Supports:
 * - LINE, CIRCLE, ARC, TEXT entities
 * - Layer definitions with colors
 * - Units (MM/IN)
 */

// ============================================================================
// Geometry Types
// ============================================================================

export interface DxfPoint {
  x: number;
  y: number;
  z?: number;
}

// ============================================================================
// Entity Types
// ============================================================================

export interface DxfLine {
  type: 'LINE';
  layer: string;
  p1: DxfPoint;
  p2: DxfPoint;
}

export interface DxfCircle {
  type: 'CIRCLE';
  layer: string;
  center: DxfPoint;
  radius: number;
}

export interface DxfArc {
  type: 'ARC';
  layer: string;
  center: DxfPoint;
  radius: number;
  startAngle: number; // degrees
  endAngle: number;   // degrees
}

export interface DxfText {
  type: 'TEXT';
  layer: string;
  position: DxfPoint;
  height: number;
  text: string;
  rotation?: number;  // degrees
  hAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
  vAlign?: 'BASELINE' | 'BOTTOM' | 'MIDDLE' | 'TOP';
}

export interface DxfPoint3D {
  type: 'POINT';
  layer: string;
  position: DxfPoint;
}

export interface DxfPolyline {
  type: 'POLYLINE';
  layer: string;
  points: DxfPoint[];
  closed: boolean;
}

export type DxfEntity = DxfLine | DxfCircle | DxfArc | DxfText | DxfPoint3D | DxfPolyline;

// ============================================================================
// Layer Types
// ============================================================================

export interface DxfLayer {
  name: string;
  color: number;  // AutoCAD color index (1-255)
  lineType?: string;
}

// Standard AutoCAD colors
export const DXF_COLORS = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  CYAN: 4,
  BLUE: 5,
  MAGENTA: 6,
  WHITE: 7,
  GRAY: 8,
  LIGHT_GRAY: 9,
} as const;

// ============================================================================
// Document Types
// ============================================================================

export type DxfUnits = 'MM' | 'IN';

export interface DxfDocument {
  units: DxfUnits;
  layers: DxfLayer[];
  entities: DxfEntity[];
  extents?: {
    min: DxfPoint;
    max: DxfPoint;
  };
}

// ============================================================================
// Standard Layers
// ============================================================================

export const STANDARD_LAYERS: DxfLayer[] = [
  { name: 'CUT', color: DXF_COLORS.RED },
  { name: 'DRILL', color: DXF_COLORS.GREEN },
  { name: 'POCKET', color: DXF_COLORS.CYAN },
  { name: 'EDGE', color: DXF_COLORS.YELLOW },
  { name: 'TEXT', color: DXF_COLORS.WHITE },
  { name: 'DIMENSION', color: DXF_COLORS.MAGENTA },
  { name: 'GUIDE', color: DXF_COLORS.GRAY, lineType: 'DASHED' },
];
