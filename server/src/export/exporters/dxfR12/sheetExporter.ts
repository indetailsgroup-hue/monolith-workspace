/**
 * Sheet DXF Exporter
 *
 * Step 10.1: Multi-part sheet DXF export with nesting
 *
 * Combines:
 * - PartBlueprints (from OpGraph conversion)
 * - Nesting algorithm (row-shelf packing)
 * - DXF R12 output
 *
 * Output is a factory-ready sheet layout with:
 * - All parts nested on sheets
 * - Each part with full CNC operations
 * - Sheet border and labels
 * - Deterministic layout (same input = same output)
 */

import type { DxfDocument, DxfEntity, DxfLayer } from './dxfTypes.js';
import { DXF_COLORS } from './dxfTypes.js';
import { writeDxfR12 } from './dxfWriter.js';
import { nestRowShelf, type NestResult, type NestPart, type NestSheet } from './nest.js';
import { type PartBlueprint, OPGRAPH_LAYERS, translateEntities, rotateEntities90 } from './opgraphToDxf.js';
import { rectLines, text } from './dxfGeom.js';
import { sha256Hex } from '../../../storage/cas.js';

// ============================================================================
// Types
// ============================================================================

export interface SheetExportOptions {
  /** Sheet width in mm (default: 2440 for standard 8'x4' sheet) */
  sheetWidth?: number;
  /** Sheet height in mm (default: 1220 for standard 8'x4' sheet) */
  sheetHeight?: number;
  /** Gap between parts in mm (default: 5 for saw kerf) */
  gap?: number;
  /** Allow part rotation for better fit (default: true) */
  allowRotation?: boolean;
  /** Maximum sheets to generate (default: 100) */
  maxSheets?: number;
  /** Add sheet border (default: true) */
  addSheetBorder?: boolean;
  /** Add sheet labels (default: true) */
  addSheetLabels?: boolean;
  /** Job name for labeling */
  jobName?: string;
}

export interface SheetExportResult {
  /** Array of DXF content strings (one per sheet) */
  dxfContents: string[];
  /** Filenames for each sheet */
  filenames: string[];
  /** SHA-256 hashes for each sheet */
  hashes: string[];
  /** MIME type */
  mime: string;
  /** Nesting statistics */
  stats: {
    totalSheets: number;
    totalParts: number;
    unplacedParts: number;
    averageUtilization: number;
  };
  /** Summary for logging */
  summary: string;
}

// ============================================================================
// Sheet Layer Definitions
// ============================================================================

const SHEET_LAYERS: DxfLayer[] = [
  { name: 'SHEET_BORDER', color: DXF_COLORS.GRAY },
  { name: 'SHEET_LABEL', color: DXF_COLORS.WHITE },
  ...OPGRAPH_LAYERS,
];

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export multiple parts to sheet DXF files.
 *
 * @param parts - Array of PartBlueprints to nest and export
 * @param options - Sheet dimensions and export options
 * @returns Export result with DXF content, hashes, and statistics
 */
export function exportSheetDxf(
  parts: PartBlueprint[],
  options: SheetExportOptions = {}
): SheetExportResult {
  const {
    sheetWidth = 2440,
    sheetHeight = 1220,
    gap = 5,
    allowRotation = true,
    maxSheets = 100,
    addSheetBorder = true,
    addSheetLabels = true,
    jobName = 'export',
  } = options;

  // 1. Convert PartBlueprints to NestParts
  const nestParts: NestPart[] = parts.map(p => ({
    id: p.id,
    width: p.width,
    height: p.height,
  }));

  // Create lookup map for part entities
  const partMap = new Map<string, PartBlueprint>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // 2. Run nesting algorithm
  const nestResult = nestRowShelf(nestParts, {
    sheetWidth,
    sheetHeight,
    gap,
    allowRotation,
    maxSheets,
  });

  // 3. Generate DXF for each sheet
  const dxfContents: string[] = [];
  const filenames: string[] = [];
  const hashes: string[] = [];

  for (let sheetIndex = 0; sheetIndex < nestResult.sheets.length; sheetIndex++) {
    const sheet = nestResult.sheets[sheetIndex];
    const sheetNum = sheetIndex + 1;

    const doc = buildSheetDocument(
      sheet,
      partMap,
      sheetNum,
      {
        addSheetBorder,
        addSheetLabels,
        jobName,
      }
    );

    const dxfContent = writeDxfR12(doc);
    const hash = sha256Hex(dxfContent);
    const filename = `${jobName}_sheet${sheetNum.toString().padStart(2, '0')}.dxf`;

    dxfContents.push(dxfContent);
    filenames.push(filename);
    hashes.push(hash);
  }

  // 4. Calculate statistics
  let totalPartArea = 0;
  let totalSheetArea = 0;

  for (const sheet of nestResult.sheets) {
    totalSheetArea += sheet.sheetWidth * sheet.sheetHeight;
    for (const p of sheet.placements) {
      totalPartArea += p.width * p.height;
    }
  }

  const stats = {
    totalSheets: nestResult.sheets.length,
    totalParts: parts.length - nestResult.unplaced.length,
    unplacedParts: nestResult.unplaced.length,
    averageUtilization: totalSheetArea > 0 ? totalPartArea / totalSheetArea : 0,
  };

  // 5. Build summary
  const summary = buildSummary(nestResult, stats, jobName);

  return {
    dxfContents,
    filenames,
    hashes,
    mime: 'application/dxf',
    stats,
    summary,
  };
}

// ============================================================================
// Document Building
// ============================================================================

interface SheetDocOptions {
  addSheetBorder: boolean;
  addSheetLabels: boolean;
  jobName: string;
}

/**
 * Build DXF document for a single sheet.
 */
function buildSheetDocument(
  sheet: NestSheet,
  partMap: Map<string, PartBlueprint>,
  sheetNum: number,
  options: SheetDocOptions
): DxfDocument {
  const entities: DxfEntity[] = [];

  // 1. Add sheet border
  if (options.addSheetBorder) {
    entities.push(...rectLines({
      layer: 'SHEET_BORDER',
      origin: { x: 0, y: 0 },
      width: sheet.sheetWidth,
      height: sheet.sheetHeight,
    }));
  }

  // 2. Add sheet label (top-left corner)
  if (options.addSheetLabels) {
    entities.push(text({
      layer: 'SHEET_LABEL',
      position: { x: 10, y: sheet.sheetHeight - 20 },
      height: 10,
      text: `${options.jobName} - Sheet ${sheetNum}/${partMap.size > 0 ? '?' : '0'}`,
    }));

    // Add sheet dimensions
    entities.push(text({
      layer: 'SHEET_LABEL',
      position: { x: 10, y: sheet.sheetHeight - 35 },
      height: 6,
      text: `${sheet.sheetWidth}x${sheet.sheetHeight}mm | ${sheet.placements.length} parts`,
    }));
  }

  // 3. Place each part on the sheet
  for (const placement of sheet.placements) {
    const part = partMap.get(placement.id);
    if (!part) continue;

    // Get part entities
    let partEntities = [...part.entities];

    // Rotate if needed
    if (placement.rotated) {
      partEntities = rotateEntities90(partEntities);

      // After rotation, translate to correct position
      // Rotation is CCW around origin, so we need to adjust
      partEntities = translateEntities(
        partEntities,
        placement.x + placement.height, // Adjust for rotation
        placement.y
      );
    } else {
      // Just translate to placement position
      partEntities = translateEntities(
        partEntities,
        placement.x,
        placement.y
      );
    }

    entities.push(...partEntities);
  }

  // 4. Build document
  return {
    units: 'MM',
    layers: SHEET_LAYERS,
    entities,
    extents: {
      min: { x: 0, y: 0 },
      max: { x: sheet.sheetWidth, y: sheet.sheetHeight },
    },
  };
}

// ============================================================================
// Summary
// ============================================================================

function buildSummary(
  nestResult: NestResult,
  stats: SheetExportResult['stats'],
  jobName: string
): string {
  const lines: string[] = [];

  lines.push(`Sheet Export: ${jobName}`);
  lines.push(`==============================`);
  lines.push(`Sheets: ${stats.totalSheets}`);
  lines.push(`Parts placed: ${stats.totalParts}`);
  lines.push(`Parts unplaced: ${stats.unplacedParts}`);
  lines.push(`Average utilization: ${(stats.averageUtilization * 100).toFixed(1)}%`);
  lines.push(``);

  for (let i = 0; i < nestResult.sheets.length; i++) {
    const sheet = nestResult.sheets[i];
    lines.push(`Sheet ${i + 1}:`);
    lines.push(`  Size: ${sheet.sheetWidth}x${sheet.sheetHeight}mm`);
    lines.push(`  Parts: ${sheet.placements.length}`);
    lines.push(`  Utilization: ${(sheet.utilization * 100).toFixed(1)}%`);
  }

  if (nestResult.unplaced.length > 0) {
    lines.push(``);
    lines.push(`WARNING: ${nestResult.unplaced.length} parts could not be placed:`);
    for (const p of nestResult.unplaced) {
      lines.push(`  - ${p.id}: ${p.width}x${p.height}mm`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Single Part Export (for simpler use cases)
// ============================================================================

/**
 * Export a single part to DXF (no nesting).
 * Useful for individual panel exports.
 */
export function exportPartDxf(
  part: PartBlueprint,
  options: { jobName?: string } = {}
): {
  content: string;
  filename: string;
  hash: string;
  mime: string;
} {
  const { jobName = 'part' } = options;

  const doc: DxfDocument = {
    units: 'MM',
    layers: OPGRAPH_LAYERS,
    entities: part.entities,
    extents: {
      min: { x: 0, y: 0 },
      max: { x: part.width, y: part.height },
    },
  };

  const content = writeDxfR12(doc);
  const hash = sha256Hex(content);
  const filename = `${jobName}_${part.panelId}.dxf`;

  return {
    content,
    filename,
    hash,
    mime: 'application/dxf',
  };
}

