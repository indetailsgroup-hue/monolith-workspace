/**
 * Multi-Sheet DXF Exporter
 *
 * Step 10.3: Generate multiple DXF files from packing results
 *
 * Features:
 * - One DXF file per sheet
 * - Sheet border and labels
 * - Part placement with rotation
 * - Summary JSON for audit/debug
 * - Dynamic layer collection for CAM-friendly toolpath layers
 *
 * Output files:
 * - {jobName}_sheet_01.dxf
 * - {jobName}_sheet_02.dxf
 * - ...
 * - {jobName}_sheet_pack.json (summary)
 */

import type { DxfDocument, DxfEntity, DxfLayer } from './dxfTypes.js';
import { DXF_COLORS } from './dxfTypes.js';
import { writeDxfR12 } from './dxfWriter.js';
import { transformEntities, type Rotation } from './transform.js';
import { rectLines, text } from './dxfGeom.js';
import type { PartBlueprint } from './opgraphToDxf.js';
import { sha256Hex } from '../../../storage/cas.js';
import { collectLayers, META_TEXT, SHEET_BORDER, SAFE_GUIDES } from './toolLayers.js';
import type { KeepoutRect } from './keepout.js';
import { drawKeepouts } from './keepout.js';
import type { TabSpec } from './tabs.js';
import {
  ToolpathPlanBuilder,
  profileOp,
  grooveOp,
  drillOp,
  kerfOp,
  type ToolpathPlan,
  type PartToolpath,
} from './toolpathPlan.js';

// ============================================================================
// Types
// ============================================================================

export interface Placement {
  id: string;
  x: number;
  y: number;
  rot: Rotation;
  sheetIndex: number;
}

export interface MultiSheetInput {
  jobName: string;
  bundleId?: string;
  sheetW: number;
  sheetH: number;
  placements: Placement[];
  parts: PartBlueprint[];
  /** Keepout zones to avoid and visualize */
  keepouts?: KeepoutRect[];
  /** CAM defaults for toolpath plan */
  defaults?: {
    profileDepthMm?: number;
    profileToolMm?: number;
    grooveToolMm?: number;
    drillDepthMm?: number;
    tabSpec?: TabSpec;
  };
}

export interface MultiSheetOutput {
  path: string;
  filename: string;
  content: string;
  mime: string;
  sha256: string;
  sizeBytes: number;
}

// ============================================================================
// Layer Definitions
// ============================================================================

/**
 * Base layers that are always included (non-toolpath).
 * Toolpath layers (TP_*) are collected dynamically from entities.
 */
const BASE_LAYER_NAMES = [
  SHEET_BORDER,   // Sheet boundary
  META_TEXT,      // Text annotations
  SAFE_GUIDES,    // Safe zones
  'OUTLINE',      // Legacy outline (for non-CAM mode)
  'GROOVE',       // Legacy groove
  'REVEAL',       // Legacy reveal
  'DRILL',        // Legacy drill
  'TEXT',         // Legacy text
  'KERF',         // Legacy kerf
  'EDGE',         // Legacy edge band
];

/**
 * Color mapping for known layer prefixes.
 * Toolpath layers get colors based on operation type.
 */
function getLayerColor(layerName: string): number {
  // Exact matches
  if (layerName === SHEET_BORDER || layerName === 'SHEET') return DXF_COLORS.GRAY;
  if (layerName === META_TEXT || layerName === 'TEXT') return DXF_COLORS.WHITE;
  if (layerName === SAFE_GUIDES || layerName === 'SAFE') return DXF_COLORS.LIGHT_GRAY;
  if (layerName === 'OUTLINE') return DXF_COLORS.RED;
  if (layerName === 'GROOVE') return DXF_COLORS.CYAN;
  if (layerName === 'REVEAL') return DXF_COLORS.MAGENTA;
  if (layerName === 'DRILL') return DXF_COLORS.GREEN;
  if (layerName === 'KERF') return DXF_COLORS.YELLOW;
  if (layerName === 'EDGE') return DXF_COLORS.BLUE;

  // Toolpath layer prefixes (CAM mode)
  if (layerName.startsWith('TP_OUT_CUT')) return DXF_COLORS.RED;
  if (layerName.startsWith('TP_GROOVE')) return DXF_COLORS.CYAN;
  if (layerName.startsWith('TP_POCKET')) return DXF_COLORS.MAGENTA;
  if (layerName.startsWith('TP_DRILL')) return DXF_COLORS.GREEN;
  if (layerName.startsWith('TP_KERF')) return DXF_COLORS.YELLOW;
  if (layerName.startsWith('EDGE_BAND')) return DXF_COLORS.BLUE;

  // Default
  return DXF_COLORS.WHITE;
}

/**
 * Get line type for a layer.
 */
function getLayerLineType(layerName: string): string | undefined {
  if (layerName === SAFE_GUIDES || layerName === 'SAFE') return 'DASHED';
  if (layerName === 'EDGE' || layerName.startsWith('EDGE_BAND')) return 'DASHED';
  return undefined;
}

/**
 * Build DxfLayer array from layer names.
 */
function buildLayerTable(layerNames: string[]): DxfLayer[] {
  return layerNames.map(name => ({
    name,
    color: getLayerColor(name),
    lineType: getLayerLineType(name),
  }));
}

// ============================================================================
// Multi-Sheet Export
// ============================================================================

/**
 * Export placements to multiple DXF files (one per sheet).
 */
export function exportMultiSheetDxfs(input: MultiSheetInput): MultiSheetOutput[] {
  const { jobName, bundleId, sheetW, sheetH, placements, parts, keepouts, defaults } = input;

  // Create part lookup map
  const partMap = new Map<string, PartBlueprint>();
  for (const part of parts) {
    partMap.set(part.id, part);
  }

  // Group placements by sheet
  const bySheet = new Map<number, Placement[]>();
  for (const p of placements) {
    const arr = bySheet.get(p.sheetIndex) ?? [];
    arr.push(p);
    bySheet.set(p.sheetIndex, arr);
  }

  const outputs: MultiSheetOutput[] = [];
  const sheetIndices = Array.from(bySheet.keys()).sort((a, b) => a - b);
  const totalSheets = sheetIndices.length;

  // Generate DXF for each sheet
  for (let i = 0; i < sheetIndices.length; i++) {
    const sheetIdx = sheetIndices[i];
    const sheetPlacements = bySheet.get(sheetIdx) ?? [];
    const tag = String(i + 1).padStart(2, '0');

    const entities = buildSheetEntities(
      sheetPlacements,
      partMap,
      sheetW,
      sheetH,
      jobName,
      i + 1,
      totalSheets,
      keepouts
    );

    // Collect all layers from entities (including dynamic toolpath layers)
    const allLayerNames = collectLayers(BASE_LAYER_NAMES, entities);
    const layers = buildLayerTable(allLayerNames);

    const doc: DxfDocument = {
      units: 'MM',
      layers,
      entities,
      extents: {
        min: { x: 0, y: 0 },
        max: { x: sheetW, y: sheetH },
      },
    };

    const content = writeDxfR12(doc);
    const filename = `${jobName}_sheet_${tag}.dxf`;

    outputs.push({
      path: `exports/${filename}`,
      filename,
      content,
      mime: 'application/dxf',
      sha256: sha256Hex(content),
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    });
  }

  // Generate summary JSON
  const summary = buildPackingSummary(input, sheetIndices.length);
  const summaryContent = JSON.stringify(summary, null, 2);
  const summaryFilename = `${jobName}_sheet_pack.json`;

  outputs.push({
    path: `exports/${summaryFilename}`,
    filename: summaryFilename,
    content: summaryContent,
    mime: 'application/json',
    sha256: sha256Hex(summaryContent),
    sizeBytes: Buffer.byteLength(summaryContent, 'utf-8'),
  });

  // Generate toolpath plan JSON (machine-readable sidecar)
  const toolpathPlan = buildToolpathPlan(input, bySheet, partMap, sheetIndices.length);
  const toolpathContent = JSON.stringify(toolpathPlan, null, 2);
  const toolpathFilename = `${jobName}_toolpath_plan.json`;

  outputs.push({
    path: `exports/${toolpathFilename}`,
    filename: toolpathFilename,
    content: toolpathContent,
    mime: 'application/json',
    sha256: sha256Hex(toolpathContent),
    sizeBytes: Buffer.byteLength(toolpathContent, 'utf-8'),
  });

  return outputs;
}

// ============================================================================
// Sheet Entity Building
// ============================================================================

/**
 * Build all entities for a single sheet.
 */
function buildSheetEntities(
  placements: Placement[],
  partMap: Map<string, PartBlueprint>,
  sheetW: number,
  sheetH: number,
  jobName: string,
  sheetNum: number,
  totalSheets: number,
  keepouts?: KeepoutRect[]
): DxfEntity[] {
  const entities: DxfEntity[] = [];

  // Sheet border
  entities.push(...rectLines({
    layer: 'SHEET',
    origin: { x: 0, y: 0 },
    width: sheetW,
    height: sheetH,
  }));

  // Draw keepout zones (clamp/vacuum areas)
  if (keepouts && keepouts.length > 0) {
    entities.push(...drawKeepouts(keepouts, SAFE_GUIDES));
  }

  // Sheet header labels
  entities.push(text({
    layer: 'TEXT',
    position: { x: 20, y: sheetH - 20 },
    height: 8,
    text: `SHEET ${sheetNum}/${totalSheets} — ${jobName}`,
  }));

  entities.push(text({
    layer: 'TEXT',
    position: { x: 20, y: sheetH - 35 },
    height: 5,
    text: `${sheetW} × ${sheetH} mm | ${placements.length} parts`,
  }));

  // Sort placements by ID for deterministic output
  const sortedPlacements = [...placements].sort((a, b) => a.id.localeCompare(b.id));

  // Place each part
  for (const pl of sortedPlacements) {
    const part = partMap.get(pl.id);
    if (!part) {
      console.warn(`[MultiSheet] Part not found: ${pl.id}`);
      continue;
    }

    // Transform part entities (rotate + translate)
    const transformedEntities = transformEntities(
      part.entities,
      pl.rot,
      part.width,
      part.height,
      pl.x,
      pl.y
    );

    entities.push(...transformedEntities);

    // Add part ID label (inside the part)
    const labelX = pl.x + 5;
    const labelY = pl.y + (pl.rot === 0 ? part.height : part.width) - 10;

    entities.push(text({
      layer: 'TEXT',
      position: { x: labelX, y: labelY },
      height: 4,
      text: `#${pl.id}${pl.rot === 90 ? ' R90' : ''}`,
    }));
  }

  return entities;
}

// ============================================================================
// Summary Generation
// ============================================================================

interface PackingSummary {
  version: string;
  createdAt: string;
  jobName: string;
  sheetW: number;
  sheetH: number;
  totalSheets: number;
  totalParts: number;
  placements: Array<{
    partId: string;
    sheetIndex: number;
    x: number;
    y: number;
    rotation: number;
  }>;
  sheetStats: Array<{
    sheetIndex: number;
    partCount: number;
    rotatedCount: number;
  }>;
}

/**
 * Build summary JSON for audit/debug.
 */
function buildPackingSummary(input: MultiSheetInput, sheetsUsed: number): PackingSummary {
  const { jobName, sheetW, sheetH, placements } = input;

  // Calculate per-sheet stats
  const sheetStats: PackingSummary['sheetStats'] = [];
  for (let i = 0; i < sheetsUsed; i++) {
    const sheetPlacements = placements.filter(p => p.sheetIndex === i);
    sheetStats.push({
      sheetIndex: i,
      partCount: sheetPlacements.length,
      rotatedCount: sheetPlacements.filter(p => p.rot === 90).length,
    });
  }

  return {
    version: 'sheet-pack-summary.v2',
    createdAt: new Date().toISOString(),
    jobName,
    sheetW,
    sheetH,
    totalSheets: sheetsUsed,
    totalParts: placements.length,
    placements: placements.map(p => ({
      partId: p.id,
      sheetIndex: p.sheetIndex,
      x: p.x,
      y: p.y,
      rotation: p.rot,
    })),
    sheetStats,
  };
}

// ============================================================================
// Toolpath Plan Generation
// ============================================================================

/**
 * Build toolpath plan JSON for automation/post-processors.
 */
function buildToolpathPlan(
  input: MultiSheetInput,
  bySheet: Map<number, Placement[]>,
  partMap: Map<string, PartBlueprint>,
  sheetsUsed: number
): ToolpathPlan {
  const { jobName, bundleId, sheetW, sheetH, keepouts, defaults } = input;

  const builder = new ToolpathPlanBuilder({
    jobName,
    bundleId,
    format: 'DXF_SHEET_V2',
    defaults: {
      profileDepthMm: defaults?.profileDepthMm,
      profileToolMm: defaults?.profileToolMm,
      grooveToolMm: defaults?.grooveToolMm,
      drillDepthMm: defaults?.drillDepthMm,
      tabSpec: defaults?.tabSpec,
    },
  });

  // Build each sheet
  for (let sheetIdx = 0; sheetIdx < sheetsUsed; sheetIdx++) {
    const sheetPlacements = bySheet.get(sheetIdx) ?? [];
    const partToolpaths: PartToolpath[] = [];

    for (const pl of sheetPlacements) {
      const part = partMap.get(pl.id);
      if (!part) continue;

      // Build operations from part metadata
      const ops = buildPartOperations(part, defaults);

      partToolpaths.push({
        partId: part.panelId,
        label: part.label,
        widthMm: part.width,
        heightMm: part.height,
        thicknessMm: part.thickness ?? 18,
        x: pl.x,
        y: pl.y,
        rot: pl.rot,
        ops,
      });
    }

    builder.addSheet({
      sheetIndex: sheetIdx,
      sheetW,
      sheetH,
      keepouts: keepouts ?? [],
      parts: partToolpaths,
    });
  }

  return builder.build();
}

/**
 * Build operations list from part blueprint.
 * Extracts operation metadata from entities or uses defaults.
 */
function buildPartOperations(
  part: PartBlueprint,
  defaults?: MultiSheetInput['defaults']
): PartToolpath['ops'] {
  const ops: PartToolpath['ops'] = [];
  const thickness = part.thickness ?? 18;

  // Profile operation (always present)
  const profileDepth = defaults?.profileDepthMm ?? thickness + 1;
  const profileTool = defaults?.profileToolMm ?? 6;
  const tabSpec = defaults?.tabSpec ?? { enabled: true, count: 4, lengthMm: 12, insetMm: 25, strategy: 'MID_EDGES' as const };

  ops.push(profileOp(
    `TP_OUT_CUT_Z${profileDepth}_T${profileTool * 10}`,
    profileDepth,
    profileTool,
    tabSpec,
    part.tabPositions
  ));

  // Scan entities for groove/drill operations
  for (const entity of part.entities) {
    const layer = entity.layer;

    // Groove operations
    if (layer.startsWith('TP_GROOVE_')) {
      const match = layer.match(/TP_GROOVE_Z(\d+)_T(\d+)/);
      if (match) {
        const depth = parseInt(match[1], 10);
        const tool = parseInt(match[2], 10) / 10;
        // Extract groove geometry from entity
        if (entity.type === 'LINE') {
          const dx = Math.abs(entity.p2.x - entity.p1.x);
          const dy = Math.abs(entity.p2.y - entity.p1.y);
          const axis = dx > dy ? 'X' : 'Y';
          const length = Math.max(dx, dy);
          const offset = axis === 'X' ? entity.p1.y : entity.p1.x;
          ops.push(grooveOp(layer, depth, tool, axis, offset, tool, length));
        }
      }
    }

    // Drill operations
    if (layer.startsWith('TP_DRILL_')) {
      const match = layer.match(/TP_DRILL_D(\d+)_Z(\d+)/);
      if (match && entity.type === 'CIRCLE') {
        const dia = parseInt(match[1], 10) / 10;
        const depth = parseInt(match[2], 10);
        ops.push(drillOp(layer, depth, dia, entity.center.x, entity.center.y));
      }
    }

    // Kerf operations
    if (layer.startsWith('TP_KERF_')) {
      const match = layer.match(/TP_KERF_Z(\d+)_T(\d+)/);
      if (match && entity.type === 'LINE') {
        const depth = parseInt(match[1], 10);
        const tool = parseInt(match[2], 10) / 10;
        const dx = Math.abs(entity.p2.x - entity.p1.x);
        const dy = Math.abs(entity.p2.y - entity.p1.y);
        const direction = dx > dy ? 'horizontal' : 'vertical';
        // Note: kerfOp expects count/spacing which we can't fully determine from single line
        // This is a simplified version - full implementation would track all kerf lines
        ops.push(kerfOp(layer, depth, tool, 1, 0, direction));
      }
    }
  }

  return ops;
}

// ============================================================================
// Failure Output
// ============================================================================

/**
 * Generate failure output when packing fails.
 */
export function exportPackingFailure(
  jobName: string,
  reason: string,
  partialPlacements: Placement[]
): MultiSheetOutput[] {
  const failContent = JSON.stringify({
    ok: false,
    version: 'sheet-pack-fail.v1',
    createdAt: new Date().toISOString(),
    jobName,
    reason,
    partialPlacements: partialPlacements.map(p => ({
      partId: p.id,
      sheetIndex: p.sheetIndex,
      x: p.x,
      y: p.y,
      rotation: p.rot,
    })),
  }, null, 2);

  const filename = `${jobName}_nest_FAIL.json`;

  return [{
    path: `exports/${filename}`,
    filename,
    content: failContent,
    mime: 'application/json',
    sha256: sha256Hex(failContent),
    sizeBytes: Buffer.byteLength(failContent, 'utf-8'),
  }];
}
