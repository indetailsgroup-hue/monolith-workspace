/**
 * T027: Cut Optimization Algorithm — Optimizer (Orchestrator)
 *
 * Converts CutListRow[] into NestingSheet[] by:
 * 1. Expanding qty into individual NestingPart entries
 * 2. Extracting grain direction from CutListRow
 * 3. Grouping parts by materialId
 * 4. Looking up sheet sizes from material catalog
 * 5. Running FFDH per material group
 * 6. Mapping results to NestingSheet[] (existing export type)
 *
 * @version 2.0.0 - Phase 2: Grain direction support
 * @module
 */

import type { CutListRow, NestingSheet } from '../core/export/monolith/monolithExportContext';
import type { NestingPart, NestingConfig, NestingResult, GrainDirection } from './types';
import { DEFAULT_NESTING_CONFIG } from './types';
import { ffdhMultiSheet } from './ffdh';
import { CORE_MATERIALS_CATALOG } from '../core/materials/PanelMaterialSystem';

// ============================================
// GRAIN DIRECTION HELPERS
// ============================================

/**
 * Map CutListRow grain value to internal GrainDirection type.
 * Defaults to 'NONE' when not specified (free rotation).
 */
function resolveGrain(grain?: 'HORIZONTAL' | 'VERTICAL' | 'NONE'): GrainDirection {
  return grain ?? 'NONE';
}

/**
 * Determine if a part with a given grain direction can be rotated.
 *
 * Rules:
 * - `NONE`: always rotatable (MDF, plywood, etc.)
 * - `HORIZONTAL` or `VERTICAL`: NOT rotatable by default.
 *   Rotating a grained part 90° would change the grain direction
 *   relative to the sheet, causing visual inconsistency.
 *
 * Note: In future phases, we could allow rotation if ALL grained parts
 * in a material group agree on the same rotated direction. For Phase 2
 * we enforce the simpler rule: grained parts keep their original orientation.
 */
function canRotateWithGrain(grain: GrainDirection): boolean {
  return grain === 'NONE';
}

// ============================================
// PART EXTRACTION
// ============================================

/**
 * Extract NestingPart[] from CutListRow[], expanding qty into individual parts.
 *
 * e.g., CutListRow { partId: "SIDE_L", qty: 2 } becomes:
 *   NestingPart { id: "SIDE_L#1" } and NestingPart { id: "SIDE_L#2" }
 *
 * Parts with qty=1 keep their original ID (no "#1" suffix).
 *
 * Grain direction from CutListRow controls rotation:
 * - grain='NONE' or undefined → canRotate=true (free rotation)
 * - grain='HORIZONTAL'|'VERTICAL' → canRotate=false (locked orientation)
 */
export function extractNestingParts(rows: CutListRow[]): NestingPart[] {
  const parts: NestingPart[] = [];

  for (const row of rows) {
    const qty = row.qty ?? 1;
    const grainDirection = resolveGrain(row.grain);
    const canRotate = canRotateWithGrain(grainDirection);

    for (let i = 0; i < qty; i++) {
      const id = qty === 1 ? row.partId : `${row.partId}#${i + 1}`;

      parts.push({
        id,
        sourcePartId: row.partId,
        cabinetId: row.cabinetId,
        width: row.cutW,
        height: row.cutH,
        materialId: row.materialId,
        canRotate,
        grainDirection,
      });
    }
  }

  return parts;
}

// ============================================
// MATERIAL GROUPING
// ============================================

/**
 * Group NestingParts by materialId.
 * Parts of different materials must be nested onto separate sheets.
 */
export function groupByMaterial(
  parts: NestingPart[],
): Map<string, NestingPart[]> {
  const groups = new Map<string, NestingPart[]>();

  for (const part of parts) {
    const existing = groups.get(part.materialId);
    if (existing) {
      existing.push(part);
    } else {
      groups.set(part.materialId, [part]);
    }
  }

  return groups;
}

// ============================================
// SHEET CONFIG RESOLUTION
// ============================================

/**
 * Resolve sheet dimensions from material catalog.
 * Falls back to DEFAULT_NESTING_CONFIG if material not found.
 */
export function resolveSheetConfig(
  materialId: string,
  overrides?: Partial<NestingConfig>,
): NestingConfig {
  const material = CORE_MATERIALS_CATALOG[materialId];

  const base: NestingConfig = {
    ...DEFAULT_NESTING_CONFIG,
    // Material catalog: sheetWidth=1220 (short), sheetHeight=2440 (long)
    sheetWidth: material?.sheetWidth ?? DEFAULT_NESTING_CONFIG.sheetWidth,
    sheetHeight: material?.sheetHeight ?? DEFAULT_NESTING_CONFIG.sheetHeight,
    sheetThickness: material?.thickness ?? DEFAULT_NESTING_CONFIG.sheetThickness,
  };

  if (!overrides) return base;

  return {
    ...base,
    ...overrides,
  };
}

// ============================================
// MAIN OPTIMIZER
// ============================================

/**
 * Run full nesting optimization.
 *
 * Takes CutListRow[] (from export context or cabinet store), groups by material,
 * runs FFDH per group, and returns NestingSheet[] compatible with the existing
 * export pipeline (consumed by buildDxfSheets, buildCutListCsv, etc.).
 *
 * IMPORTANT — `sheets` is a PARTIAL layout whenever `unplacedParts` is
 * non-empty. `NestingSheet[]` contains only parts that were actually placed;
 * a part too large for the board (a full-length worktop, a machine-max panel,
 * or any grained part wider than the usable sheet width) is simply absent from
 * it. A part missing from the layout is a part that never gets cut and never
 * gets quoted, so `unplacedParts` is returned at the SAME level as `sheets`:
 * any caller that consumes `sheets` must check it and refuse to export, or
 * surface it, when it is non-empty. Do not treat `sheets` as complete without
 * looking.
 *
 * @param cutListRows - Parts with calculated cut dimensions
 * @param configOverrides - User-adjustable parameters (kerf, edge clearance)
 * @returns sheets: NestingSheet[] for export pipeline (PARTIAL if unplacedParts
 *          is non-empty), unplacedParts: every part that fit no sheet in any
 *          allowed orientation, results: detailed per-material results
 */
export function runNesting(
  cutListRows: CutListRow[],
  configOverrides?: Partial<NestingConfig>,
): {
  sheets: NestingSheet[];
  unplacedParts: NestingPart[];
  results: Map<string, NestingResult>;
} {
  if (cutListRows.length === 0) {
    return { sheets: [], unplacedParts: [], results: new Map() };
  }

  const parts = extractNestingParts(cutListRows);
  const groups = groupByMaterial(parts);

  const allSheets: NestingSheet[] = [];
  const allUnplaced: NestingPart[] = [];
  const allResults = new Map<string, NestingResult>();
  let globalSheetIndex = 1;

  // Deterministic iteration: sort material IDs
  const sortedMaterialIds = [...groups.keys()].sort();

  for (const materialId of sortedMaterialIds) {
    const materialParts = groups.get(materialId)!;
    const config = resolveSheetConfig(materialId, configOverrides);

    const startTime = performance.now();
    const { sheets: sheetResults, unplacedParts } = ffdhMultiSheet(
      materialParts,
      config,
    );
    const computeTimeMs = performance.now() - startTime;

    // Surface unplaceable parts at the top level, alongside `sheets`, so a
    // caller cannot consume a silently-truncated layout without seeing them.
    allUnplaced.push(...unplacedParts);

    // Map SheetResult[] → NestingSheet[]
    for (const sr of sheetResults) {
      allSheets.push({
        index1: globalSheetIndex,
        label: `NEST_${String(globalSheetIndex).padStart(2, '0')}`,
        materialId,
        sheetW: config.sheetWidth,
        sheetH: config.sheetHeight,
        sheetThickness: config.sheetThickness,
        placements: sr.placements.map((p) => ({
          partId: p.partId,
          x: p.x,
          y: p.y,
          rotation: p.rotation as 0 | 90 | 180 | 270,
          cutW: p.cutW,
          cutH: p.cutH,
        })),
        utilization: sr.utilization,
      });
      globalSheetIndex++;
    }

    // Calculate aggregate stats
    const totalUsable = sheetResults.reduce((s, r) => s + r.usableArea, 0);
    const totalUsed = sheetResults.reduce((s, r) => s + r.usedArea, 0);
    const overallUtilization =
      totalUsable > 0
        ? Math.round((totalUsed / totalUsable) * 1000) / 10
        : 0;

    allResults.set(materialId, {
      materialId,
      sheetsUsed: sheetResults.length,
      sheets: sheetResults,
      overallUtilization,
      totalWaste: totalUsable - totalUsed,
      computeTimeMs: Math.round(computeTimeMs * 100) / 100,
      unplacedParts,
    });
  }

  return { sheets: allSheets, unplacedParts: allUnplaced, results: allResults };
}
