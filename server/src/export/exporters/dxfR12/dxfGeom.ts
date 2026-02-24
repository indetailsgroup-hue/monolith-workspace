/**
 * DXF Geometry Helpers
 *
 * Step 10.3: Primitive geometry helpers for DXF entity generation
 *
 * Provides simple, deterministic helpers for creating DXF entities:
 * - rectLines: Create 4 lines forming a rectangle
 * - text: Create a text entity
 * - circle: Create a circle entity
 * - line: Create a line entity
 * - arc: Create an arc entity
 * - polyline: Create a closed/open polyline
 * - slotCapsule: Create CAM-friendly slot boundary (2 arcs + 2 lines)
 */

import type { DxfLine, DxfCircle, DxfArc, DxfText, DxfPoint, DxfPolyline, DxfEntity } from './dxfTypes.js';

// ============================================================================
// Point/Vector Helpers
// ============================================================================

/**
 * Create a point at offset from origin.
 */
export function offsetPoint(origin: DxfPoint, dx: number, dy: number): DxfPoint {
  return {
    x: origin.x + dx,
    y: origin.y + dy,
    z: origin.z,
  };
}

/**
 * Translate a point by dx, dy.
 */
export function translatePoint(p: DxfPoint, dx: number, dy: number): DxfPoint {
  return offsetPoint(p, dx, dy);
}

// ============================================================================
// Rectangle
// ============================================================================

export interface RectLinesOptions {
  layer: string;
  origin: DxfPoint;
  width: number;
  height: number;
}

/**
 * Create 4 lines forming a rectangle.
 * Origin is bottom-left corner.
 * Lines go: bottom, right, top, left (CCW from bottom-left)
 */
export function rectLines(opts: RectLinesOptions): DxfLine[] {
  const { layer, origin, width, height } = opts;

  const p0 = origin;                                    // bottom-left
  const p1 = offsetPoint(origin, width, 0);             // bottom-right
  const p2 = offsetPoint(origin, width, height);        // top-right
  const p3 = offsetPoint(origin, 0, height);            // top-left

  return [
    { type: 'LINE', layer, p1: p0, p2: p1 }, // bottom
    { type: 'LINE', layer, p1: p1, p2: p2 }, // right
    { type: 'LINE', layer, p1: p2, p2: p3 }, // top
    { type: 'LINE', layer, p1: p3, p2: p0 }, // left
  ];
}

// ============================================================================
// Line
// ============================================================================

export interface LineOptions {
  layer: string;
  p1: DxfPoint;
  p2: DxfPoint;
}

/**
 * Create a single line entity.
 */
export function line(opts: LineOptions): DxfLine {
  return {
    type: 'LINE',
    layer: opts.layer,
    p1: opts.p1,
    p2: opts.p2,
  };
}

// ============================================================================
// Circle
// ============================================================================

export interface CircleOptions {
  layer: string;
  center: DxfPoint;
  radius: number;
}

/**
 * Create a circle entity.
 */
export function circle(opts: CircleOptions): DxfCircle {
  return {
    type: 'CIRCLE',
    layer: opts.layer,
    center: opts.center,
    radius: opts.radius,
  };
}

// ============================================================================
// Arc
// ============================================================================

export interface ArcOptions {
  layer: string;
  center: DxfPoint;
  radius: number;
  startAngle: number; // degrees
  endAngle: number;   // degrees
}

/**
 * Create an arc entity.
 */
export function arc(opts: ArcOptions): DxfArc {
  return {
    type: 'ARC',
    layer: opts.layer,
    center: opts.center,
    radius: opts.radius,
    startAngle: opts.startAngle,
    endAngle: opts.endAngle,
  };
}

// ============================================================================
// Text
// ============================================================================

export interface TextOptions {
  layer: string;
  position: DxfPoint;
  height: number;
  text: string;
  rotation?: number;
  hAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
  vAlign?: 'BASELINE' | 'BOTTOM' | 'MIDDLE' | 'TOP';
}

/**
 * Create a text entity.
 */
export function text(opts: TextOptions): DxfText {
  return {
    type: 'TEXT',
    layer: opts.layer,
    position: opts.position,
    height: opts.height,
    text: opts.text,
    rotation: opts.rotation,
    hAlign: opts.hAlign,
    vAlign: opts.vAlign,
  };
}

// ============================================================================
// Pattern Helpers
// ============================================================================

/**
 * Create a row of equally spaced circles (e.g., system32 holes).
 */
export function circleRow(opts: {
  layer: string;
  startX: number;
  y: number;
  count: number;
  spacing: number;
  radius: number;
}): DxfCircle[] {
  const circles: DxfCircle[] = [];

  for (let i = 0; i < opts.count; i++) {
    circles.push({
      type: 'CIRCLE',
      layer: opts.layer,
      center: {
        x: opts.startX + i * opts.spacing,
        y: opts.y,
      },
      radius: opts.radius,
    });
  }

  return circles;
}

/**
 * Create a grid of circles (e.g., shelf pin holes).
 */
export function circleGrid(opts: {
  layer: string;
  origin: DxfPoint;
  cols: number;
  rows: number;
  colSpacing: number;
  rowSpacing: number;
  radius: number;
}): DxfCircle[] {
  const circles: DxfCircle[] = [];

  for (let row = 0; row < opts.rows; row++) {
    for (let col = 0; col < opts.cols; col++) {
      circles.push({
        type: 'CIRCLE',
        layer: opts.layer,
        center: {
          x: opts.origin.x + col * opts.colSpacing,
          y: opts.origin.y + row * opts.rowSpacing,
        },
        radius: opts.radius,
      });
    }
  }

  return circles;
}

/**
 * Create a horizontal groove line.
 */
export function grooveLine(opts: {
  layer: string;
  origin: DxfPoint;
  length: number;
  offsetY?: number;
}): DxfLine {
  const startY = opts.origin.y + (opts.offsetY ?? 0);
  return {
    type: 'LINE',
    layer: opts.layer,
    p1: { x: opts.origin.x, y: startY },
    p2: { x: opts.origin.x + opts.length, y: startY },
  };
}

/**
 * Create a vertical groove line.
 */
export function verticalGrooveLine(opts: {
  layer: string;
  origin: DxfPoint;
  length: number;
  offsetX?: number;
}): DxfLine {
  const startX = opts.origin.x + (opts.offsetX ?? 0);
  return {
    type: 'LINE',
    layer: opts.layer,
    p1: { x: startX, y: opts.origin.y },
    p2: { x: startX, y: opts.origin.y + opts.length },
  };
}

// ============================================================================
// Polyline
// ============================================================================

export interface PolylineOptions {
  layer: string;
  points: DxfPoint[];
  closed: boolean;
}

/**
 * Create a polyline entity (R12 POLYLINE/VERTEX/SEQEND).
 * More CAM-friendly than individual lines for profile cuts.
 */
export function polyline(opts: PolylineOptions): DxfPolyline {
  return {
    type: 'POLYLINE',
    layer: opts.layer,
    points: opts.points,
    closed: opts.closed,
  };
}

/**
 * Create a closed rectangle as a single polyline.
 * More CAM-friendly than 4 separate lines.
 */
export function rectPolyline(opts: {
  layer: string;
  origin: DxfPoint;
  width: number;
  height: number;
}): DxfPolyline {
  const { layer, origin, width, height } = opts;

  return {
    type: 'POLYLINE',
    layer,
    closed: true,
    points: [
      { x: origin.x, y: origin.y },                     // bottom-left
      { x: origin.x + width, y: origin.y },             // bottom-right
      { x: origin.x + width, y: origin.y + height },    // top-right
      { x: origin.x, y: origin.y + height },            // top-left
    ],
  };
}

// ============================================================================
// Slot / Capsule (CAM-Friendly)
// ============================================================================

/**
 * Create a slot boundary (capsule shape): two semicircle arcs + 2 lines.
 *
 * CAM-friendly representation of a slot/groove:
 * - Centerline from (x1,y1) to (x2,y2)
 * - Radius r (half the slot width)
 *
 * Only supports horizontal or vertical slots (deterministic).
 * For diagonal slots, falls back to circles + centerline.
 */
export function slotCapsule(
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number
): DxfEntity[] {
  const eps = 1e-9;
  const isH = Math.abs(y1 - y2) < eps;
  const isV = Math.abs(x1 - x2) < eps;

  // Fallback for diagonal: circles at endpoints + centerline
  if (!isH && !isV) {
    return [
      { type: 'CIRCLE', layer, center: { x: x1, y: y1 }, radius: r },
      { type: 'CIRCLE', layer, center: { x: x2, y: y2 }, radius: r },
      { type: 'LINE', layer, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } },
    ];
  }

  // Horizontal slot
  if (isH) {
    const leftX = Math.min(x1, x2);
    const rightX = Math.max(x1, x2);
    const topY = y1 + r;
    const botY = y1 - r;

    return [
      // Left semicircle (90° to 270°)
      {
        type: 'ARC',
        layer,
        center: { x: leftX, y: y1 },
        radius: r,
        startAngle: 90,
        endAngle: 270,
      },
      // Right semicircle (270° to 90°)
      {
        type: 'ARC',
        layer,
        center: { x: rightX, y: y1 },
        radius: r,
        startAngle: 270,
        endAngle: 90,
      },
      // Top line
      { type: 'LINE', layer, p1: { x: leftX, y: topY }, p2: { x: rightX, y: topY } },
      // Bottom line
      { type: 'LINE', layer, p1: { x: rightX, y: botY }, p2: { x: leftX, y: botY } },
    ];
  }

  // Vertical slot
  const botY = Math.min(y1, y2);
  const topY = Math.max(y1, y2);
  const leftX = x1 - r;
  const rightX = x1 + r;

  return [
    // Bottom semicircle (180° to 0°)
    {
      type: 'ARC',
      layer,
      center: { x: x1, y: botY },
      radius: r,
      startAngle: 180,
      endAngle: 0,
    },
    // Top semicircle (0° to 180°)
    {
      type: 'ARC',
      layer,
      center: { x: x1, y: topY },
      radius: r,
      startAngle: 0,
      endAngle: 180,
    },
    // Left line
    { type: 'LINE', layer, p1: { x: leftX, y: botY }, p2: { x: leftX, y: topY } },
    // Right line
    { type: 'LINE', layer, p1: { x: rightX, y: topY }, p2: { x: rightX, y: botY } },
  ];
}

/**
 * Create slot centerline (alternative to boundary for some CAM systems).
 * Returns a single line representing the tool path center.
 */
export function slotCenterline(
  layer: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): DxfLine {
  return {
    type: 'LINE',
    layer,
    p1: { x: x1, y: y1 },
    p2: { x: x2, y: y2 },
  };
}

// ============================================================================
// Bounding Box
// ============================================================================

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Calculate bounding box of a set of points.
 */
export function boundingBox(points: DxfPoint[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
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
