/**
 * DXF R12 (AC1009) Writer
 *
 * Generates minimal DXF R12 format for CNC compatibility.
 * R12 is the most widely supported DXF version by CNC machines.
 *
 * Features:
 * - HEADER section with minimal required fields
 * - TABLES section (empty but required)
 * - ENTITIES section with POLYLINE/VERTEX/SEQEND
 * - Layer support: OUTLINE, CUTOUT, SHEET, PATH
 *
 * @version 1.0.0
 */

import type { FlatPart, Contour, Toolpath, Point2D } from '../../flatpart/flatpartTypes';
import { SHEET_SIZES } from '../../flatpart/flatpartTypes';

// ============================================================================
// Types
// ============================================================================

export interface DxfExportOptions {
  /** Include sheet boundary rectangle */
  includeSheet?: boolean;
  /** Sheet dimensions (defaults to STANDARD 2440x1220) */
  sheetSize?: { width: number; height: number };
  /** Decimal precision for coordinates */
  precision?: number;
  /** Layer names */
  layers?: {
    outline?: string;
    cutout?: string;
    sheet?: string;
    path?: string;
  };
}

/** Internal resolved options with all required fields */
interface ResolvedDxfOptions {
  includeSheet: boolean;
  sheetSize: { width: number; height: number };
  precision: number;
  layers: {
    outline: string;
    cutout: string;
    sheet: string;
    path: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: ResolvedDxfOptions = {
  includeSheet: true,
  sheetSize: SHEET_SIZES.STANDARD,
  precision: 4,
  layers: {
    outline: 'OUTLINE',
    cutout: 'CUTOUT',
    sheet: 'SHEET',
    path: 'PATH',
  },
};

// DXF R12 version string
const DXF_VERSION = 'AC1009';

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Convert a FlatPart to DXF R12 string.
 *
 * @param part - FlatPart to export
 * @param options - Export options
 * @returns DXF file content as string
 */
export function flatPartToDxfR12(
  part: FlatPart,
  options: DxfExportOptions = {}
): string {
  const opts: ResolvedDxfOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    layers: {
      ...DEFAULT_OPTIONS.layers,
      ...options.layers,
    },
  };
  const lines: string[] = [];

  // HEADER section
  lines.push(...generateHeader(opts));

  // TABLES section (minimal, required for R12)
  lines.push(...generateTables(opts));

  // BLOCKS section (empty but included for compatibility)
  lines.push(...generateBlocks());

  // ENTITIES section
  lines.push(...generateEntities(part, opts));

  // End of file
  lines.push('0', 'EOF');

  return lines.join('\n');
}

/**
 * Export multiple FlatParts to a single DXF.
 */
export function flatPartsToDxfR12(
  parts: FlatPart[],
  options: DxfExportOptions = {}
): string {
  const opts: ResolvedDxfOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    layers: {
      ...DEFAULT_OPTIONS.layers,
      ...options.layers,
    },
  };
  const lines: string[] = [];

  // HEADER section
  lines.push(...generateHeader(opts));

  // TABLES section
  lines.push(...generateTables(opts));

  // BLOCKS section
  lines.push(...generateBlocks());

  // ENTITIES section (all parts)
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // Sheet boundary
  if (opts.includeSheet) {
    lines.push(...drawSheetBoundary(opts));
  }

  // Each part
  for (const part of parts) {
    lines.push(...drawFlatPart(part, opts));
  }

  lines.push('0', 'ENDSEC');

  // End of file
  lines.push('0', 'EOF');

  return lines.join('\n');
}

// ============================================================================
// Section Generators
// ============================================================================

/**
 * Generate HEADER section.
 */
function generateHeader(opts: ResolvedDxfOptions): string[] {
  return [
    '0', 'SECTION',
    '2', 'HEADER',
    // DXF version
    '9', '$ACADVER',
    '1', DXF_VERSION,
    // Units (millimeters)
    '9', '$INSUNITS',
    '70', '4',
    // Decimal precision
    '9', '$LUPREC',
    '70', String(opts.precision),
    // Drawing limits (sheet size)
    '9', '$LIMMIN',
    '10', '0.0',
    '20', '0.0',
    '9', '$LIMMAX',
    '10', String(opts.sheetSize.width),
    '20', String(opts.sheetSize.height),
    '0', 'ENDSEC',
  ];
}

/**
 * Generate TABLES section with layer definitions.
 */
function generateTables(opts: ResolvedDxfOptions): string[] {
  const layers = opts.layers;

  return [
    '0', 'SECTION',
    '2', 'TABLES',
    // Layer table
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '4', // Number of layers
    // OUTLINE layer (green)
    '0', 'LAYER',
    '2', layers.outline,
    '70', '0',
    '62', '3', // Color: green
    '6', 'CONTINUOUS',
    // CUTOUT layer (red)
    '0', 'LAYER',
    '2', layers.cutout,
    '70', '0',
    '62', '1', // Color: red
    '6', 'CONTINUOUS',
    // SHEET layer (white)
    '0', 'LAYER',
    '2', layers.sheet,
    '70', '0',
    '62', '7', // Color: white
    '6', 'CONTINUOUS',
    // PATH layer (yellow)
    '0', 'LAYER',
    '2', layers.path,
    '70', '0',
    '62', '2', // Color: yellow
    '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
  ];
}

/**
 * Generate BLOCKS section (empty but required).
 */
function generateBlocks(): string[] {
  return [
    '0', 'SECTION',
    '2', 'BLOCKS',
    '0', 'ENDSEC',
  ];
}

/**
 * Generate ENTITIES section.
 */
function generateEntities(
  part: FlatPart,
  opts: ResolvedDxfOptions
): string[] {
  const lines: string[] = [];

  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // Sheet boundary
  if (opts.includeSheet) {
    lines.push(...drawSheetBoundary(opts));
  }

  // Part geometry
  lines.push(...drawFlatPart(part, opts));

  lines.push('0', 'ENDSEC');

  return lines;
}

// ============================================================================
// Drawing Functions
// ============================================================================

/**
 * Draw sheet boundary rectangle.
 */
function drawSheetBoundary(opts: ResolvedDxfOptions): string[] {
  const { width, height } = opts.sheetSize;
  const layer = opts.layers.sheet;

  const points: Point2D[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  return drawPolyline(points, layer, true, opts.precision);
}

/**
 * Draw a complete FlatPart.
 */
function drawFlatPart(
  part: FlatPart,
  opts: ResolvedDxfOptions
): string[] {
  const lines: string[] = [];

  // Outer contour
  lines.push(
    ...drawPolyline(
      part.outerContour.points,
      opts.layers.outline,
      true,
      opts.precision
    )
  );

  // Inner contours (cutouts)
  for (const inner of part.innerContours) {
    lines.push(
      ...drawPolyline(
        inner.points,
        opts.layers.cutout,
        true,
        opts.precision
      )
    );
  }

  // Toolpaths
  for (const path of part.toolpaths) {
    lines.push(
      ...drawPolyline(
        path.points,
        opts.layers.path,
        false, // Open path
        opts.precision
      )
    );
  }

  return lines;
}

/**
 * Draw a POLYLINE entity (R12 format with VERTEX entities).
 */
function drawPolyline(
  points: Point2D[],
  layer: string,
  closed: boolean,
  precision: number
): string[] {
  if (points.length < 2) return [];

  const lines: string[] = [];

  // POLYLINE header
  lines.push(
    '0', 'POLYLINE',
    '8', layer,
    '66', '1', // Vertices follow
    '70', closed ? '1' : '0', // 1 = closed, 0 = open
  );

  // VERTEX entities for each point
  for (const [x, y] of points) {
    lines.push(
      '0', 'VERTEX',
      '8', layer,
      '10', x.toFixed(precision),
      '20', y.toFixed(precision),
      '30', '0.0', // Z = 0 for 2D
    );
  }

  // SEQEND to close the polyline
  lines.push(
    '0', 'SEQEND',
    '8', layer,
  );

  return lines;
}

// ============================================================================
// Alternative: LWPOLYLINE (AutoCAD 2000+)
// ============================================================================

/**
 * Draw using LWPOLYLINE (lighter weight, but less compatible).
 * Use this for AutoCAD 2000+ targets.
 */
export function drawLwPolyline(
  points: Point2D[],
  layer: string,
  closed: boolean,
  precision: number
): string[] {
  if (points.length < 2) return [];

  const lines: string[] = [];

  lines.push(
    '0', 'LWPOLYLINE',
    '8', layer,
    '90', String(points.length), // Number of vertices
    '70', closed ? '1' : '0',
  );

  for (const [x, y] of points) {
    lines.push(
      '10', x.toFixed(precision),
      '20', y.toFixed(precision),
    );
  }

  return lines;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a simple filename for the DXF.
 */
export function generateDxfFilename(part: FlatPart): string {
  const safeName = part.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 32);

  return `${safeName}_${part.id.slice(-6)}.dxf`;
}

/**
 * Get DXF content size in bytes.
 */
export function getDxfSize(content: string): number {
  return new Blob([content]).size;
}
