/**
 * Sketch Types
 *
 * Defines sketch entities and tools for 2D drawing on construction planes.
 *
 * @version 1.0.0
 */

// ============================================================================
// Sketch Tools
// ============================================================================

export type SketchTool = 'select' | 'line' | 'rect' | 'arc' | 'circle' | 'polyline';

export interface SketchToolInfo {
  id: SketchTool;
  name: string;
  hotkey: string;
  icon: string;
  description: string;
}

export const SKETCH_TOOLS: Record<SketchTool, SketchToolInfo> = {
  select: {
    id: 'select',
    name: 'Select',
    hotkey: 'Esc',
    icon: '↖',
    description: 'Select sketch entities',
  },
  line: {
    id: 'line',
    name: 'Line',
    hotkey: 'L',
    icon: '─',
    description: 'Draw line segments',
  },
  rect: {
    id: 'rect',
    name: 'Rectangle',
    hotkey: 'T',
    icon: '▭',
    description: 'Draw rectangles',
  },
  arc: {
    id: 'arc',
    name: 'Arc',
    hotkey: 'A',
    icon: '◠',
    description: 'Draw arcs (3-point)',
  },
  circle: {
    id: 'circle',
    name: 'Circle',
    hotkey: 'C',
    icon: '○',
    description: 'Draw circles',
  },
  polyline: {
    id: 'polyline',
    name: 'Polyline',
    hotkey: 'P',
    icon: '⌇',
    description: 'Draw connected line segments',
  },
};

// ============================================================================
// Sketch Entities
// ============================================================================

/** Base sketch entity */
export interface SketchEntityBase {
  id: string;
  type: string;
  /** Is entity selected */
  selected: boolean;
  /** Is entity construction (reference only) */
  construction: boolean;
}

/** Point on the plane [u, v] */
export type SketchPoint = [number, number];

/** Line entity */
export interface SketchLine extends SketchEntityBase {
  type: 'line';
  start: SketchPoint;
  end: SketchPoint;
}

/** Rectangle entity */
export interface SketchRect extends SketchEntityBase {
  type: 'rect';
  corner1: SketchPoint;
  corner2: SketchPoint;
}

/** Arc entity (3-point arc) */
export interface SketchArc extends SketchEntityBase {
  type: 'arc';
  start: SketchPoint;
  mid: SketchPoint;
  end: SketchPoint;
}

/** Circle entity */
export interface SketchCircle extends SketchEntityBase {
  type: 'circle';
  center: SketchPoint;
  radius: number;
}

/** Polyline entity */
export interface SketchPolyline extends SketchEntityBase {
  type: 'polyline';
  points: SketchPoint[];
  closed: boolean;
}

/** Union of all sketch entities */
export type SketchEntity =
  | SketchLine
  | SketchRect
  | SketchArc
  | SketchCircle
  | SketchPolyline;

// ============================================================================
// Helpers
// ============================================================================

/** Generate unique ID */
export function generateSketchId(): string {
  return `sketch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Calculate line length */
export function lineLength(line: SketchLine): number {
  const dx = line.end[0] - line.start[0];
  const dy = line.end[1] - line.start[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Calculate rectangle dimensions */
export function rectDimensions(rect: SketchRect): { width: number; height: number } {
  return {
    width: Math.abs(rect.corner2[0] - rect.corner1[0]),
    height: Math.abs(rect.corner2[1] - rect.corner1[1]),
  };
}
