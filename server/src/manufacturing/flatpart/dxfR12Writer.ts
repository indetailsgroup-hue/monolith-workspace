/**
 * dxfR12Writer.ts - Deterministic DXF R12 Writer
 *
 * Generates DXF R12 format using POLYLINE + VERTEX + SEQEND pattern
 * for maximum CNC compatibility.
 *
 * Features:
 * - POLYLINE+VERTEX+SEQEND for closed contours (R12-safe)
 * - CIRCLE for drill holes
 * - Deterministic output (same input = same output)
 * - Layer naming convention for CNC operations
 *
 * @version P14A.4
 */

import type { FlatPart, DrillFeature, PocketFeature, GrooveFeature } from './flatPartTypes.js';

// ============================================================================
// Configuration
// ============================================================================

export interface DxfWriterConfig {
  /** Decimal precision for coordinates */
  precision: number;
  /** Include annotation text */
  includeAnnotation: boolean;
  /** Annotation text height (mm) */
  annotationHeight: number;
  /** Annotation layer color */
  annotationColor: number;
  /** Default layer color for cut contour */
  cutoutColor: number;
}

const DEFAULT_CONFIG: DxfWriterConfig = {
  precision: 3,
  includeAnnotation: true,
  annotationHeight: 5,
  annotationColor: 2, // Yellow
  cutoutColor: 7, // White
};

// ============================================================================
// Number Formatting
// ============================================================================

function fmt(value: number, precision: number): string {
  return value.toFixed(precision);
}

// ============================================================================
// Layer Name Generators
// ============================================================================

function drillLayerName(drill: DrillFeature): string {
  if (drill.layer) return drill.layer;
  const typeStr = drill.isThrough ? 'THROUGH' : 'BLIND';
  return `DRILL_V_D${drill.diameter}_${typeStr}_Z${drill.depth}`;
}

function pocketLayerName(pocket: PocketFeature): string {
  if (pocket.layer) return pocket.layer;
  return `POCKET_D${pocket.depth}`;
}

function grooveLayerName(groove: GrooveFeature): string {
  if (groove.layer) return groove.layer;
  return `SAW_GROOVE_W${groove.width}_D${groove.depth}`;
}

// ============================================================================
// Layer Collection
// ============================================================================

interface LayerInfo {
  name: string;
  color: number;
}

function collectLayers(part: FlatPart, config: DxfWriterConfig): LayerInfo[] {
  const layerMap = new Map<string, number>();

  // Fixed layers
  layerMap.set('CUT_OUT', config.cutoutColor);
  if (config.includeAnnotation) {
    layerMap.set('ANNOTATION', config.annotationColor);
  }

  // Drill layers (red)
  for (const drill of part.drills) {
    const name = drillLayerName(drill);
    if (!layerMap.has(name)) {
      layerMap.set(name, 1); // Red
    }
  }

  // Pocket layers (cyan)
  for (const pocket of part.pockets) {
    const name = pocketLayerName(pocket);
    if (!layerMap.has(name)) {
      layerMap.set(name, 4); // Cyan
    }
  }

  // Groove layers (green)
  for (const groove of part.grooves) {
    const name = grooveLayerName(groove);
    if (!layerMap.has(name)) {
      layerMap.set(name, 3); // Green
    }
  }

  // Sort for determinism
  const sorted = Array.from(layerMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, color]) => ({ name, color }));

  return sorted;
}

// ============================================================================
// DXF Entity Writers
// ============================================================================

/**
 * Write POLYLINE entity header
 */
function writePolylineHeader(layer: string): string {
  return [
    '0',
    'POLYLINE',
    '8',
    layer,
    '66', // Vertices follow flag
    '1',
    '70', // Polyline flags: 1 = closed
    '1',
  ].join('\n');
}

/**
 * Write VERTEX entity
 */
function writeVertex(x: number, y: number, layer: string, precision: number): string {
  return [
    '0',
    'VERTEX',
    '8',
    layer,
    '10',
    fmt(x, precision),
    '20',
    fmt(y, precision),
  ].join('\n');
}

/**
 * Write SEQEND to close polyline
 */
function writeSeqend(layer: string): string {
  return ['0', 'SEQEND', '8', layer].join('\n');
}

/**
 * Write a closed rectangular polyline using POLYLINE+VERTEX+SEQEND
 */
function writeClosedRectPolyline(
  x: number,
  y: number,
  width: number,
  height: number,
  layer: string,
  precision: number
): string {
  const parts: string[] = [];

  // Polyline header
  parts.push(writePolylineHeader(layer));

  // 4 vertices (counter-clockwise from bottom-left)
  parts.push(writeVertex(x, y, layer, precision)); // Bottom-left
  parts.push(writeVertex(x + width, y, layer, precision)); // Bottom-right
  parts.push(writeVertex(x + width, y + height, layer, precision)); // Top-right
  parts.push(writeVertex(x, y + height, layer, precision)); // Top-left

  // Close polyline
  parts.push(writeSeqend(layer));

  return parts.join('\n');
}

/**
 * Write CIRCLE entity
 */
function writeCircle(
  x: number,
  y: number,
  radius: number,
  layer: string,
  precision: number
): string {
  return [
    '0',
    'CIRCLE',
    '8',
    layer,
    '10',
    fmt(x, precision),
    '20',
    fmt(y, precision),
    '40',
    fmt(radius, precision),
  ].join('\n');
}

/**
 * Write TEXT entity
 */
function writeText(
  x: number,
  y: number,
  height: number,
  text: string,
  layer: string,
  precision: number
): string {
  return [
    '0',
    'TEXT',
    '8',
    layer,
    '10',
    fmt(x, precision),
    '20',
    fmt(y, precision),
    '40',
    fmt(height, precision),
    '1',
    text,
  ].join('\n');
}

// ============================================================================
// DXF Section Writers
// ============================================================================

function writeHeader(width: number, height: number, precision: number): string {
  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1009', // AutoCAD R12
    '9',
    '$INSBASE',
    '10',
    '0.0',
    '20',
    '0.0',
    '30',
    '0.0',
    '9',
    '$EXTMIN',
    '10',
    '0.0',
    '20',
    '0.0',
    '9',
    '$EXTMAX',
    '10',
    fmt(width, precision),
    '20',
    fmt(height, precision),
    '0',
    'ENDSEC',
  ].join('\n');
}

function writeTables(layers: LayerInfo[]): string {
  const parts: string[] = [];

  parts.push('0');
  parts.push('SECTION');
  parts.push('2');
  parts.push('TABLES');
  parts.push('0');
  parts.push('TABLE');
  parts.push('2');
  parts.push('LAYER');
  parts.push('70');
  parts.push(layers.length.toString());

  for (const layer of layers) {
    parts.push('0');
    parts.push('LAYER');
    parts.push('2');
    parts.push(layer.name);
    parts.push('70');
    parts.push('0');
    parts.push('62');
    parts.push(layer.color.toString());
    parts.push('6');
    parts.push('CONTINUOUS');
  }

  parts.push('0');
  parts.push('ENDTAB');
  parts.push('0');
  parts.push('ENDSEC');

  return parts.join('\n');
}

// ============================================================================
// Main Writer Function
// ============================================================================

/**
 * Generate DXF R12 for a FlatPart
 *
 * Uses POLYLINE+VERTEX+SEQEND for closed contours (R12-safe pattern)
 *
 * @param part - FlatPart to convert
 * @param config - Writer configuration
 * @returns DXF content as string
 */
export function generateDxfR12(
  part: FlatPart,
  config: Partial<DxfWriterConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { precision, includeAnnotation, annotationHeight } = cfg;

  // Collect layers
  const layers = collectLayers(part, cfg);

  // Build DXF content
  const parts: string[] = [];

  // Header section
  parts.push(writeHeader(part.cutWidth, part.cutHeight, precision));

  // Tables section (layers)
  parts.push(writeTables(layers));

  // Entities section
  parts.push('0');
  parts.push('SECTION');
  parts.push('2');
  parts.push('ENTITIES');

  // Outer contour (POLYLINE)
  parts.push(
    writeClosedRectPolyline(0, 0, part.cutWidth, part.cutHeight, 'CUT_OUT', precision)
  );

  // Drills (sorted for determinism)
  const sortedDrills = [...part.drills].sort((a, b) => {
    const la = drillLayerName(a);
    const lb = drillLayerName(b);
    if (la !== lb) return la.localeCompare(lb);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const drill of sortedDrills) {
    const layer = drillLayerName(drill);
    const radius = drill.diameter / 2;
    parts.push(writeCircle(drill.x, drill.y, radius, layer, precision));
  }

  // Pockets (sorted for determinism) - as closed polylines
  const sortedPockets = [...part.pockets].sort((a, b) => {
    const la = pocketLayerName(a);
    const lb = pocketLayerName(b);
    if (la !== lb) return la.localeCompare(lb);
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  for (const pocket of sortedPockets) {
    const layer = pocketLayerName(pocket);
    const x = pocket.x - pocket.width / 2;
    const y = pocket.y - pocket.height / 2;
    parts.push(writeClosedRectPolyline(x, y, pocket.width, pocket.height, layer, precision));
  }

  // Grooves (sorted for determinism) - as closed polylines
  const sortedGrooves = [...part.grooves].sort((a, b) => {
    const la = grooveLayerName(a);
    const lb = grooveLayerName(b);
    if (la !== lb) return la.localeCompare(lb);
    if (a.position !== b.position) return a.position - b.position;
    return a.start - b.start;
  });

  for (const groove of sortedGrooves) {
    const layer = grooveLayerName(groove);
    let x: number, y: number, gw: number, gh: number;

    if (groove.axis === 'x') {
      // Horizontal groove
      x = groove.start;
      y = groove.position - groove.width / 2;
      gw = groove.length;
      gh = groove.width;
    } else {
      // Vertical groove
      x = groove.position - groove.width / 2;
      y = groove.start;
      gw = groove.width;
      gh = groove.length;
    }

    parts.push(writeClosedRectPolyline(x, y, gw, gh, layer, precision));
  }

  // Annotation (optional)
  if (includeAnnotation) {
    const textY = part.cutHeight + 10;
    const partLabel = part.partNumber || part.name;
    const sizeLabel = `${part.cutWidth}x${part.cutHeight}mm`;

    parts.push(writeText(5, textY, annotationHeight, partLabel, 'ANNOTATION', precision));
    parts.push(writeText(5, textY + annotationHeight + 2, annotationHeight, sizeLabel, 'ANNOTATION', precision));
  }

  // End entities section
  parts.push('0');
  parts.push('ENDSEC');

  // EOF
  parts.push('0');
  parts.push('EOF');

  return parts.join('\n');
}

/**
 * Generate DXF with deterministic output for hashing
 *
 * Ensures same input always produces identical output.
 */
export function generateDxfR12Deterministic(
  part: FlatPart,
  config: Partial<DxfWriterConfig> = {}
): string {
  // DXF writer is already deterministic due to:
  // 1. Sorted layers
  // 2. Sorted entities
  // 3. No timestamps
  // 4. Fixed precision formatting
  return generateDxfR12(part, config);
}
