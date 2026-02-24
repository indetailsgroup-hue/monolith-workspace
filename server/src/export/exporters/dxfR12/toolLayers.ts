/**
 * Toolpath Layer Naming
 *
 * Step 10.3: Deterministic layer naming for CAM post-processors
 *
 * Layer naming scheme encodes tooling parameters directly in layer name:
 * - TP_OUT_CUT_Z{depth}_T{tool}  → Profile cut (perimeter)
 * - TP_POCKET_Z{depth}_T{tool}   → Pocket clearing
 * - TP_GROOVE_Z{depth}_T{tool}   → Groove/dado/slot
 * - TP_DRILL_D{dia}_Z{depth}     → Drilling operation
 *
 * Numbers are mm * 10 (integer) to avoid decimals in layer names.
 * Example: depth 12.5mm → Z125, tool 6mm → T60
 *
 * This allows CAM software / post-processors to:
 * 1. Parse layer names deterministically
 * 2. Select correct tool from tool library
 * 3. Set depth without relying on TEXT entities
 */

// ============================================================================
// Number Encoding
// ============================================================================

/**
 * Convert mm to integer representation (mm * 10).
 * Avoids decimals in layer names for better compatibility.
 *
 * Examples:
 * - 6mm    → 60
 * - 12.5mm → 125
 * - 0.8mm  → 8
 */
export function mm10(n: number): number {
  return Math.round(n * 10);
}

/**
 * Parse mm10 value back to mm.
 */
export function fromMm10(n: number): number {
  return n / 10;
}

// ============================================================================
// Toolpath Layer Generators
// ============================================================================

/**
 * Generate layer name for groove/slot operations.
 *
 * @param depthMm - Cutting depth in mm
 * @param toolMm - Tool diameter in mm
 * @returns Layer name like "TP_GROOVE_Z60_T30" (6mm deep, 3mm tool)
 */
export function tpGrooveLayer(depthMm: number, toolMm: number): string {
  return `TP_GROOVE_Z${mm10(depthMm)}_T${mm10(toolMm)}`;
}

/**
 * Generate layer name for pocket clearing operations.
 *
 * @param depthMm - Cutting depth in mm
 * @param toolMm - Tool diameter in mm
 * @returns Layer name like "TP_POCKET_Z100_T60" (10mm deep, 6mm tool)
 */
export function tpPocketLayer(depthMm: number, toolMm: number): string {
  return `TP_POCKET_Z${mm10(depthMm)}_T${mm10(toolMm)}`;
}

/**
 * Generate layer name for profile/outline cuts.
 *
 * @param depthMm - Cutting depth in mm (typically panel thickness + 1)
 * @param toolMm - Tool diameter in mm
 * @returns Layer name like "TP_OUT_CUT_Z190_T60" (19mm deep, 6mm tool)
 */
export function tpProfileLayer(depthMm: number, toolMm: number): string {
  return `TP_OUT_CUT_Z${mm10(depthMm)}_T${mm10(toolMm)}`;
}

/**
 * Generate layer name for drilling operations.
 *
 * @param diaMm - Hole diameter in mm
 * @param depthMm - Drilling depth in mm
 * @returns Layer name like "TP_DRILL_D50_Z100" (5mm dia, 10mm deep)
 */
export function tpDrillLayer(diaMm: number, depthMm: number): string {
  return `TP_DRILL_D${mm10(diaMm)}_Z${mm10(depthMm)}`;
}

/**
 * Generate layer name for edge banding markers.
 * These are typically visual guides, not actual toolpaths.
 *
 * @param thicknessMm - Edge band thickness in mm
 * @returns Layer name like "EDGE_BAND_T10" (1mm edge band)
 */
export function edgeBandLayer(thicknessMm: number): string {
  return `EDGE_BAND_T${mm10(thicknessMm)}`;
}

/**
 * Generate layer name for kerf bending cuts.
 *
 * @param depthMm - Kerf cut depth in mm
 * @param toolMm - Tool (saw blade) thickness in mm
 * @returns Layer name like "TP_KERF_Z160_T30" (16mm deep, 3mm saw)
 */
export function tpKerfLayer(depthMm: number, toolMm: number): string {
  return `TP_KERF_Z${mm10(depthMm)}_T${mm10(toolMm)}`;
}

// ============================================================================
// Standard Layers (Non-Toolpath)
// ============================================================================

/** Human-readable text annotations */
export const META_TEXT = 'META_TEXT';

/** Sheet boundary markers */
export const SHEET_BORDER = 'SHEET_BORDER';

/** Safe/keepout zones (clamps, fixtures) */
export const SAFE_GUIDES = 'SAFE_GUIDES';

/** Part labels and IDs */
export const PART_LABEL = 'PART_LABEL';

/** Dimension lines (reference only) */
export const DIMENSION = 'DIMENSION';

// ============================================================================
// Layer Parsing (for CAM/post-processor)
// ============================================================================

export interface ParsedToolpathLayer {
  type: 'PROFILE' | 'POCKET' | 'GROOVE' | 'DRILL' | 'KERF' | 'UNKNOWN';
  depthMm?: number;
  toolMm?: number;
  diameterMm?: number;
}

/**
 * Parse a toolpath layer name to extract parameters.
 * Useful for post-processors or CAM import scripts.
 *
 * @param layerName - Layer name to parse
 * @returns Parsed parameters or UNKNOWN type
 */
export function parseToolpathLayer(layerName: string): ParsedToolpathLayer {
  // TP_OUT_CUT_Z{depth}_T{tool}
  const profileMatch = layerName.match(/^TP_OUT_CUT_Z(\d+)_T(\d+)$/);
  if (profileMatch) {
    return {
      type: 'PROFILE',
      depthMm: fromMm10(parseInt(profileMatch[1], 10)),
      toolMm: fromMm10(parseInt(profileMatch[2], 10)),
    };
  }

  // TP_POCKET_Z{depth}_T{tool}
  const pocketMatch = layerName.match(/^TP_POCKET_Z(\d+)_T(\d+)$/);
  if (pocketMatch) {
    return {
      type: 'POCKET',
      depthMm: fromMm10(parseInt(pocketMatch[1], 10)),
      toolMm: fromMm10(parseInt(pocketMatch[2], 10)),
    };
  }

  // TP_GROOVE_Z{depth}_T{tool}
  const grooveMatch = layerName.match(/^TP_GROOVE_Z(\d+)_T(\d+)$/);
  if (grooveMatch) {
    return {
      type: 'GROOVE',
      depthMm: fromMm10(parseInt(grooveMatch[1], 10)),
      toolMm: fromMm10(parseInt(grooveMatch[2], 10)),
    };
  }

  // TP_DRILL_D{dia}_Z{depth}
  const drillMatch = layerName.match(/^TP_DRILL_D(\d+)_Z(\d+)$/);
  if (drillMatch) {
    return {
      type: 'DRILL',
      diameterMm: fromMm10(parseInt(drillMatch[1], 10)),
      depthMm: fromMm10(parseInt(drillMatch[2], 10)),
    };
  }

  // TP_KERF_Z{depth}_T{tool}
  const kerfMatch = layerName.match(/^TP_KERF_Z(\d+)_T(\d+)$/);
  if (kerfMatch) {
    return {
      type: 'KERF',
      depthMm: fromMm10(parseInt(kerfMatch[1], 10)),
      toolMm: fromMm10(parseInt(kerfMatch[2], 10)),
    };
  }

  return { type: 'UNKNOWN' };
}

// ============================================================================
// Layer Collection Helper
// ============================================================================

import type { DxfEntity } from './dxfTypes.js';

/**
 * Collect all unique layer names from entities.
 * Merges with base layers for complete layer table.
 *
 * @param baseLayers - Standard layers to always include
 * @param entities - Entities to extract layers from
 * @returns Deduplicated array of layer names
 */
export function collectLayers(baseLayers: string[], entities: DxfEntity[]): string[] {
  const set = new Set(baseLayers);

  for (const e of entities) {
    if ('layer' in e && typeof e.layer === 'string') {
      set.add(e.layer);
    }
  }

  return Array.from(set).sort();
}
