/**
 * Sheet Exporter V2
 *
 * Step 10.2: Integrated sheet export with rotation packing + multi-sheet
 *
 * Features:
 * - Deterministic 0°/90° rotation packing
 * - Multi-sheet output when parts don't fit
 * - DRILL operations with crosshairs + depth annotations
 * - Summary JSON for audit/debug
 *
 * Flow:
 * 1. Build PartBlueprints from panel data + operations
 * 2. Run rotation-aware nesting algorithm
 * 3. Generate multiple DXF files (one per sheet)
 * 4. Return outputs with hashes for CAS storage
 */

import { buildPartBlueprint, buildPartBlueprintCAM, type OpNode, type CAMOptions } from './opgraphToDxf.js';
import { packIntoSheetsRotate, formatPackingSummary, type NestParams } from './nestRotate.js';
import { exportMultiSheetDxfs, exportPackingFailure, type MultiSheetOutput } from './multiSheet.js';
import type { KeepoutRect } from './keepout.js';
import { cornerClamps } from './keepout.js';
import type { TabSpec } from './tabs.js';
import { DEFAULT_TAB_SPEC } from './tabs.js';

// ============================================================================
// Types
// ============================================================================

export interface SheetExportV2Options {
  /** Job name for file naming */
  jobName: string;
  /** Bundle ID for traceability */
  bundleId?: string;
  /** Sheet width in mm (default: 2440 for 8'x4') */
  sheetW?: number;
  /** Sheet height in mm (default: 1220 for 8'x4') */
  sheetH?: number;
  /** Margin from sheet edges in mm (default: 15) */
  sheetMarginMm?: number;
  /** Gap between parts in mm (default: 8 for saw kerf) */
  partGapMm?: number;
  /** Use CAM-friendly export with toolpath layers (default: true) */
  camMode?: boolean;
  /** Keepout zones (clamp/vacuum areas). Default: corner clamps */
  keepouts?: KeepoutRect[];
  /** Tab configuration for profile cuts */
  tabs?: TabSpec;
  /** CAM parameters */
  camOptions?: CAMOptions;
}

export interface PanelInput {
  panelId: string;
  label: string;
  width: number;
  height: number;
  thickness: number;
  operations?: Array<{
    kind: string;
    params: Record<string, number | string>;
    target?: {
      kind: 'EDGE' | 'FACE' | 'PANEL';
      edgeIndex?: number;
      face?: string;
    };
  }>;
}

export interface SheetExportV2Result {
  ok: boolean;
  outputs: MultiSheetOutput[];
  stats: {
    totalSheets: number;
    totalParts: number;
    utilization: number;
    rotatedParts: number;
  };
  summary: string;
  error?: string;
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export panels to multi-sheet DXFs with rotation packing.
 *
 * @param panels - Panel data with operations
 * @param options - Export options
 * @returns Export result with DXF outputs and statistics
 */
export function exportSheetsDxfV2(
  panels: PanelInput[],
  options: SheetExportV2Options
): SheetExportV2Result {
  const {
    jobName,
    bundleId,
    sheetW = 2440,
    sheetH = 1220,
    sheetMarginMm = 15,
    partGapMm = 8,
    camMode = true,
    keepouts = cornerClamps(sheetW, sheetH),
    tabs = DEFAULT_TAB_SPEC,
    camOptions,
  } = options;

  // 1. Build part blueprints from panel data
  const parts = panels.map(panel => {
    const ops = convertToOpNodes(panel);
    const dims = {
      width: panel.width,
      height: panel.height,
      thickness: panel.thickness,
    };

    // Use CAM-friendly export with tabs if enabled
    if (camMode) {
      return buildPartBlueprintCAM(
        panel.panelId,
        panel.label,
        dims,
        ops,
        {
          ...camOptions,
          tabs,
        }
      );
    }

    return buildPartBlueprint(panel.panelId, panel.label, dims, ops);
  });

  // 2. Prepare parts for nesting
  const partsForNest = parts.map(p => ({
    id: p.id,
    w: p.width,
    h: p.height,
  }));

  // 3. Run rotation-aware packing with keepout avoidance
  const nestParams: NestParams = {
    sheetW,
    sheetH,
    sheetMarginMm,
    partGapMm,
    keepouts,
  };

  const packResult = packIntoSheetsRotate(partsForNest, nestParams);

  // 4. Handle packing failure
  if (!packResult.ok) {
    const failOutputs = exportPackingFailure(
      jobName,
      packResult.reason ?? 'Unknown packing failure',
      packResult.placed.map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        rot: p.rot,
        sheetIndex: p.sheetIndex,
      }))
    );

    return {
      ok: false,
      outputs: failOutputs,
      stats: {
        totalSheets: 0,
        totalParts: 0,
        utilization: 0,
        rotatedParts: 0,
      },
      summary: `Packing failed: ${packResult.reason}`,
      error: packResult.reason,
    };
  }

  // 5. Generate multi-sheet DXFs
  const placements = packResult.placed.map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    rot: p.rot,
    sheetIndex: p.sheetIndex,
  }));

  const outputs = exportMultiSheetDxfs({
    jobName,
    bundleId,
    sheetW,
    sheetH,
    placements,
    parts,
    keepouts,
    defaults: {
      profileDepthMm: camOptions?.profileDepthMm,
      profileToolMm: camOptions?.profileToolMm,
      grooveToolMm: camOptions?.grooveToolMm,
      drillDepthMm: 10,
      tabSpec: tabs,
    },
  });

  // 6. Calculate statistics
  const rotatedParts = packResult.placed.filter(p => p.rot === 90).length;
  let totalPartArea = 0;
  const totalSheetArea = packResult.sheetsUsed * sheetW * sheetH;

  for (const p of packResult.placed) {
    totalPartArea += p.w * p.h;
  }

  const utilization = totalSheetArea > 0 ? totalPartArea / totalSheetArea : 0;

  // 7. Generate summary
  const summary = formatPackingSummary(packResult, nestParams);

  return {
    ok: true,
    outputs,
    stats: {
      totalSheets: packResult.sheetsUsed,
      totalParts: packResult.placed.length,
      utilization,
      rotatedParts,
    },
    summary,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert panel operations to OpNode format.
 */
function convertToOpNodes(panel: PanelInput): OpNode[] {
  if (!panel.operations || panel.operations.length === 0) {
    return [];
  }

  return panel.operations.map((op, idx) => ({
    id: `op_${panel.panelId}_${idx}`,
    kind: op.kind as OpNode['kind'],
    panelId: panel.panelId,
    target: {
      kind: op.target?.kind ?? 'PANEL',
      id: panel.panelId,
      edgeIndex: op.target?.edgeIndex,
      face: op.target?.face as OpNode['target']['face'],
    },
    params: op.params,
  }));
}

// ============================================================================
// Demo/Test Export
// ============================================================================

/**
 * Generate demo export with sample panels.
 * Useful for testing the export pipeline.
 */
export function exportDemoSheetsDxfV2(
  jobName: string,
  options?: Partial<SheetExportV2Options>
): SheetExportV2Result {
  // Demo panels representing a typical cabinet
  const demoPanels: PanelInput[] = [
    {
      panelId: 'side_left',
      label: 'Side L',
      width: 600,
      height: 720,
      thickness: 18,
      operations: [
        // System32 holes on left edge
        {
          kind: 'DRILL_HOLE',
          params: { pattern: 'system32', edgeOffset: 37, startOffset: 50, endOffset: 50, diameter: 5 },
          target: { kind: 'EDGE', edgeIndex: 3 },
        },
        // Confirmat holes
        {
          kind: 'DRILL',
          params: { xMm: 9, yMm: 50, diameterMm: 5, depthMm: 12, ref: 'CONFIRMAT' },
        },
        {
          kind: 'DRILL',
          params: { xMm: 9, yMm: 670, diameterMm: 5, depthMm: 12, ref: 'CONFIRMAT' },
        },
      ],
    },
    {
      panelId: 'side_right',
      label: 'Side R',
      width: 600,
      height: 720,
      thickness: 18,
      operations: [
        {
          kind: 'DRILL_HOLE',
          params: { pattern: 'system32', edgeOffset: 37, startOffset: 50, endOffset: 50, diameter: 5 },
          target: { kind: 'EDGE', edgeIndex: 1 },
        },
        {
          kind: 'DRILL',
          params: { xMm: 591, yMm: 50, diameterMm: 5, depthMm: 12, ref: 'CONFIRMAT' },
        },
        {
          kind: 'DRILL',
          params: { xMm: 591, yMm: 670, diameterMm: 5, depthMm: 12, ref: 'CONFIRMAT' },
        },
      ],
    },
    {
      panelId: 'top',
      label: 'Top',
      width: 564,
      height: 600,
      thickness: 18,
      operations: [
        {
          kind: 'DRILL',
          params: { xMm: 9, yMm: 9, diameterMm: 8, depthMm: 10, ref: 'DOWEL' },
        },
        {
          kind: 'DRILL',
          params: { xMm: 555, yMm: 9, diameterMm: 8, depthMm: 10, ref: 'DOWEL' },
        },
      ],
    },
    {
      panelId: 'bottom',
      label: 'Bottom',
      width: 564,
      height: 600,
      thickness: 18,
      operations: [
        {
          kind: 'DRILL',
          params: { xMm: 9, yMm: 9, diameterMm: 8, depthMm: 10, ref: 'DOWEL' },
        },
        {
          kind: 'DRILL',
          params: { xMm: 555, yMm: 9, diameterMm: 8, depthMm: 10, ref: 'DOWEL' },
        },
      ],
    },
    {
      panelId: 'back',
      label: 'Back',
      width: 564,
      height: 684,
      thickness: 6,
    },
    {
      panelId: 'shelf_1',
      label: 'Shelf 1',
      width: 560,
      height: 550,
      thickness: 18,
    },
    {
      panelId: 'shelf_2',
      label: 'Shelf 2',
      width: 560,
      height: 550,
      thickness: 18,
    },
  ];

  return exportSheetsDxfV2(demoPanels, {
    jobName,
    ...options,
  });
}
