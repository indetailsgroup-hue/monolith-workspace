/**
 * dxfR12Writer.ts - P14A.3 Deterministic DXF R12 Writer
 *
 * Generates DXF files in AutoCAD R12 format for CNC compatibility.
 *
 * DETERMINISM GUARANTEES:
 * - Layer table order: alphabetical by name
 * - Entity order: OUTER → INNER → DRILLS → POCKETS → GROOVES → TEXT
 * - No timestamps in file
 * - Fixed numeric formatting (3 decimal places)
 * - Consistent handle generation
 *
 * LAYER NAMING:
 * - CUT_OUT: Outer contour
 * - DRILL_V_{diameter}_D{depth}: Vertical drills
 * - POCKET_D{depth}: Pockets
 * - SAW_GROOVE_D{depth}: Grooves
 * - ANNOTATION: Text annotations
 *
 * @version 0.14.3
 */

import type { FlatPart, DrillFeature, PocketFeature, GrooveFeature } from '../types/FlatPart';

// ============================================================================
// Configuration
// ============================================================================

export interface DxfWriterConfig {
  /** Decimal precision for coordinates */
  precision: number;
  /** Include part info as text annotation */
  includeAnnotation: boolean;
  /** Annotation text height (mm) */
  annotationHeight: number;
  /** Circle approximation segments for older CAM software */
  circleSegments: number;
}

export const DEFAULT_DXF_CONFIG: DxfWriterConfig = {
  precision: 3,
  includeAnnotation: true,
  annotationHeight: 5,
  circleSegments: 32,
};

// ============================================================================
// DXF Constants
// ============================================================================

const DXF_VERSION = 'AC1009'; // AutoCAD R12
const LAYER_OUTLINE = 'CUT_OUT';
const LAYER_ANNOTATION = 'ANNOTATION';

// Standard DXF colors
const COLOR_WHITE = 7;
const COLOR_RED = 1;
const COLOR_YELLOW = 2;
const COLOR_GREEN = 3;
const COLOR_CYAN = 4;
const COLOR_BLUE = 5;
const COLOR_MAGENTA = 6;

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Format a number with fixed precision (no trailing zeros beyond precision).
 */
function formatNum(value: number, precision: number): string {
  return value.toFixed(precision);
}

// ============================================================================
// Handle Generator
// ============================================================================

let handleCounter = 1;

function resetHandles(): void {
  handleCounter = 1;
}

function nextHandle(): string {
  return (handleCounter++).toString(16).toUpperCase();
}

// ============================================================================
// Layer Collector
// ============================================================================

interface LayerInfo {
  name: string;
  color: number;
}

function collectLayers(part: FlatPart): LayerInfo[] {
  const layerSet = new Map<string, number>();

  // Outline layer
  layerSet.set(LAYER_OUTLINE, COLOR_WHITE);

  // Drill layers
  for (const drill of part.drills) {
    const layerName = drill.layer || `DRILL_V_${drill.diameter}_D${drill.depth}`;
    layerSet.set(layerName, COLOR_RED);
  }

  // Pocket layers
  for (const pocket of part.pockets) {
    const layerName = pocket.layer || `POCKET_D${pocket.depth}`;
    layerSet.set(layerName, COLOR_CYAN);
  }

  // Groove layers
  for (const groove of part.grooves) {
    const layerName = groove.layer || `SAW_GROOVE_D${groove.depth}`;
    layerSet.set(layerName, COLOR_GREEN);
  }

  // Annotation layer
  layerSet.set(LAYER_ANNOTATION, COLOR_YELLOW);

  // Sort alphabetically for determinism
  const layers: LayerInfo[] = [];
  const sortedNames = Array.from(layerSet.keys()).sort();
  for (const name of sortedNames) {
    layers.push({ name, color: layerSet.get(name)! });
  }

  return layers;
}

// ============================================================================
// DXF Section Writers
// ============================================================================

function writeHeader(): string {
  return `0
SECTION
2
HEADER
9
$ACADVER
1
${DXF_VERSION}
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
10
0.0
20
0.0
9
$EXTMAX
10
1000.0
20
1000.0
0
ENDSEC
`;
}

function writeTables(layers: LayerInfo[]): string {
  let dxf = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${layers.length}
`;

  for (const layer of layers) {
    dxf += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
CONTINUOUS
`;
  }

  dxf += `0
ENDTAB
0
ENDSEC
`;

  return dxf;
}

function writeEntitiesStart(): string {
  return `0
SECTION
2
ENTITIES
`;
}

function writeEntitiesEnd(): string {
  return `0
ENDSEC
0
EOF
`;
}

// ============================================================================
// Entity Writers
// ============================================================================

/**
 * Write a LINE entity.
 */
function writeLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer: string,
  precision: number
): string {
  return `0
LINE
8
${layer}
10
${formatNum(x1, precision)}
20
${formatNum(y1, precision)}
11
${formatNum(x2, precision)}
21
${formatNum(y2, precision)}
`;
}

/**
 * Write a CIRCLE entity.
 */
function writeCircle(
  cx: number,
  cy: number,
  radius: number,
  layer: string,
  precision: number
): string {
  return `0
CIRCLE
8
${layer}
10
${formatNum(cx, precision)}
20
${formatNum(cy, precision)}
40
${formatNum(radius, precision)}
`;
}

/**
 * Write a POLYLINE entity (closed rectangle).
 */
function writeRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  layer: string,
  precision: number
): string {
  // Use LWPOLYLINE for R12 compatibility
  // Note: R12 doesn't have LWPOLYLINE, so we use 4 LINEs instead
  let dxf = '';

  // Bottom
  dxf += writeLine(x, y, x + width, y, layer, precision);
  // Right
  dxf += writeLine(x + width, y, x + width, y + height, layer, precision);
  // Top
  dxf += writeLine(x + width, y + height, x, y + height, layer, precision);
  // Left
  dxf += writeLine(x, y + height, x, y, layer, precision);

  return dxf;
}

/**
 * Write a closed polyline contour as LINE segments.
 * Used for arbitrary cutout shapes (triangles, pentagons, etc.).
 *
 * Note: R12 doesn't have LWPOLYLINE, so we use LINE segments instead.
 *
 * @param points - Array of points forming the closed contour
 * @param layer - DXF layer name
 * @param precision - Decimal places for coordinates
 * @returns DXF LINE entities forming a closed polygon
 */
function writePolylineContour(
  points: Array<{ x: number; y: number }>,
  layer: string,
  precision: number
): string {
  if (points.length < 3) return '';

  let dxf = '';

  // Connect each consecutive pair of points
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length]; // Wrap to first point for closure
    dxf += writeLine(p1.x, p1.y, p2.x, p2.y, layer, precision);
  }

  return dxf;
}

/**
 * Write a TEXT entity.
 */
function writeText(
  x: number,
  y: number,
  height: number,
  text: string,
  layer: string,
  precision: number
): string {
  return `0
TEXT
8
${layer}
10
${formatNum(x, precision)}
20
${formatNum(y, precision)}
40
${formatNum(height, precision)}
1
${text}
`;
}

// ============================================================================
// FlatPart to DXF
// ============================================================================

/**
 * Write outer contour (rectangle).
 */
function writeOuterContour(part: FlatPart, config: DxfWriterConfig): string {
  return writeRectangle(
    0,
    0,
    part.outer.width,
    part.outer.height,
    LAYER_OUTLINE,
    config.precision
  );
}

/**
 * Write inner contours (cutouts).
 */
function writeInnerContours(part: FlatPart, config: DxfWriterConfig): string {
  let dxf = '';

  for (const inner of part.inners) {
    if (inner.type === 'rectangle' && inner.rect) {
      dxf += writeRectangle(
        inner.rect.x,
        inner.rect.y,
        inner.rect.width,
        inner.rect.height,
        LAYER_OUTLINE, // Inner cutouts are also on CUT_OUT layer
        config.precision
      );
    } else if (inner.type === 'circle' && inner.circle) {
      dxf += writeCircle(
        inner.circle.cx,
        inner.circle.cy,
        inner.circle.radius,
        LAYER_OUTLINE,
        config.precision
      );
    } else if (inner.type === 'polyline' && inner.polyline) {
      // Polyline cutouts (triangles, pentagons, arbitrary shapes)
      dxf += writePolylineContour(
        inner.polyline.points,
        LAYER_OUTLINE,
        config.precision
      );
    }
  }

  return dxf;
}

/**
 * Write drill holes.
 */
function writeDrills(part: FlatPart, config: DxfWriterConfig): string {
  let dxf = '';

  // Sort drills by layer, then by position for determinism
  const sortedDrills = [...part.drills].sort((a, b) => {
    const layerA = a.layer || `DRILL_V_${a.diameter}_D${a.depth}`;
    const layerB = b.layer || `DRILL_V_${b.diameter}_D${b.depth}`;
    if (layerA !== layerB) return layerA.localeCompare(layerB);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const drill of sortedDrills) {
    const layer = drill.layer || `DRILL_V_${drill.diameter}_D${drill.depth}`;
    const radius = drill.diameter / 2;
    dxf += writeCircle(drill.x, drill.y, radius, layer, config.precision);
  }

  return dxf;
}

/**
 * Write pockets.
 */
function writePockets(part: FlatPart, config: DxfWriterConfig): string {
  let dxf = '';

  // Sort for determinism
  const sortedPockets = [...part.pockets].sort((a, b) => {
    const layerA = a.layer || `POCKET_D${a.depth}`;
    const layerB = b.layer || `POCKET_D${b.depth}`;
    if (layerA !== layerB) return layerA.localeCompare(layerB);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const pocket of sortedPockets) {
    const layer = pocket.layer || `POCKET_D${pocket.depth}`;
    const x = pocket.x - pocket.width / 2;
    const y = pocket.y - pocket.height / 2;
    dxf += writeRectangle(x, y, pocket.width, pocket.height, layer, config.precision);
  }

  return dxf;
}

/**
 * Write grooves.
 */
function writeGrooves(part: FlatPart, config: DxfWriterConfig): string {
  let dxf = '';

  // Sort for determinism
  const sortedGrooves = [...part.grooves].sort((a, b) => {
    const layerA = a.layer || `SAW_GROOVE_D${a.depth}`;
    const layerB = b.layer || `SAW_GROOVE_D${b.depth}`;
    if (layerA !== layerB) return layerA.localeCompare(layerB);
    if (a.position !== b.position) return a.position - b.position;
    return a.start - b.start;
  });

  for (const groove of sortedGrooves) {
    const layer = groove.layer || `SAW_GROOVE_D${groove.depth}`;

    // Groove is represented as a rectangle (width × length)
    let x: number, y: number, w: number, h: number;

    if (groove.axis === 'x') {
      // Horizontal groove
      x = groove.start;
      y = groove.position - groove.width / 2;
      w = groove.length;
      h = groove.width;
    } else {
      // Vertical groove
      x = groove.position - groove.width / 2;
      y = groove.start;
      w = groove.width;
      h = groove.length;
    }

    dxf += writeRectangle(x, y, w, h, layer, config.precision);
  }

  return dxf;
}

/**
 * Write annotation text.
 */
function writeAnnotation(part: FlatPart, config: DxfWriterConfig): string {
  if (!config.includeAnnotation) return '';

  const lines = [
    part.partNumber || part.name,
    `${part.cutWidth} x ${part.cutHeight} mm`,
    `Core: ${part.composite.core.materialName}`,
  ];

  let dxf = '';
  const startY = part.outer.height + 10;

  lines.forEach((line, index) => {
    dxf += writeText(
      5,
      startY + (lines.length - index - 1) * (config.annotationHeight + 2),
      config.annotationHeight,
      line,
      LAYER_ANNOTATION,
      config.precision
    );
  });

  return dxf;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Generate DXF R12 content for a FlatPart.
 *
 * @param part - The FlatPart to convert
 * @param config - Writer configuration
 * @returns DXF file content as string
 */
export function flatPartToDxfR12(
  part: FlatPart,
  config: DxfWriterConfig = DEFAULT_DXF_CONFIG
): string {
  resetHandles();

  // Collect layers
  const layers = collectLayers(part);

  // Build DXF content in deterministic order
  let dxf = '';

  // Header section
  dxf += writeHeader();

  // Tables section (layers)
  dxf += writeTables(layers);

  // Entities section
  dxf += writeEntitiesStart();

  // Entities in fixed order: OUTER → INNER → DRILLS → POCKETS → GROOVES → TEXT
  dxf += writeOuterContour(part, config);
  dxf += writeInnerContours(part, config);
  dxf += writeDrills(part, config);
  dxf += writePockets(part, config);
  dxf += writeGrooves(part, config);
  dxf += writeAnnotation(part, config);

  dxf += writeEntitiesEnd();

  return dxf;
}

/**
 * Generate DXF content and filename for a FlatPart.
 */
export function exportFlatPartToDxf(
  part: FlatPart,
  config?: DxfWriterConfig
): { filename: string; content: string } {
  const content = flatPartToDxfR12(part, config);
  const filename = `${part.partNumber || part.id}.dxf`;

  return { filename, content };
}

/**
 * Generate DXF files for multiple FlatParts.
 */
export function exportFlatPartsToDxf(
  parts: FlatPart[],
  config?: DxfWriterConfig
): Array<{ filename: string; content: string }> {
  return parts.map((part) => exportFlatPartToDxf(part, config));
}
