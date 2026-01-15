/**
 * DXF R12 Exporter
 *
 * Step 10: Panel geometry exporter for CNC/CAM
 *
 * Features:
 * - Panel outline on CUT layer
 * - Drill holes on DRILL layer
 * - Pocket outlines on POCKET layer
 * - Edge banding indicators on EDGE layer
 * - Part label on TEXT layer
 */

import { writeDxfR12 } from './dxfWriter.js';
import { sha256Hex } from '../../../storage/cas.js';
import type { DxfDocument, DxfEntity, DxfLayer, DxfPoint } from './dxfTypes.js';
import { STANDARD_LAYERS } from './dxfTypes.js';

// ============================================================================
// Panel Data Types
// ============================================================================

export interface PanelData {
  id: string;
  label: string;
  width: number;     // mm
  height: number;    // mm
  thickness: number; // mm
  drillHoles?: DrillHole[];
  pockets?: Pocket[];
  edgeBanding?: EdgeBanding;
  operations?: Operation[];
}

export interface DrillHole {
  x: number;
  y: number;
  diameter: number;
  depth: number;
  through?: boolean;
}

export interface Pocket {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

export interface EdgeBanding {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

export interface Operation {
  type: 'DRILL' | 'POCKET' | 'GROOVE';
  x: number;
  y: number;
  width?: number;
  height?: number;
  diameter?: number;
  depth: number;
}

// ============================================================================
// Export Result
// ============================================================================

export interface DxfExportResult {
  filename: string;
  content: string;
  sha256: string;
  mime: string;
  sizeBytes: number;
}

// ============================================================================
// Panel Outline Exporter (MVP)
// ============================================================================

export interface ExportPanelOutlineInput {
  jobName: string;
  width: number;      // mm
  height: number;     // mm
  origin?: DxfPoint;
  label?: string;
}

/**
 * Export a simple panel outline with label.
 * MVP version for Step 10.
 */
export function exportPanelOutlineDxf(input: ExportPanelOutlineInput): DxfExportResult {
  const ox = input.origin?.x ?? 0;
  const oy = input.origin?.y ?? 0;
  const W = input.width;
  const H = input.height;

  const entities: DxfEntity[] = [
    // Rectangle outline (4 lines)
    { type: 'LINE', layer: 'CUT', p1: { x: ox, y: oy }, p2: { x: ox + W, y: oy } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox + W, y: oy }, p2: { x: ox + W, y: oy + H } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox + W, y: oy + H }, p2: { x: ox, y: oy + H } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox, y: oy + H }, p2: { x: ox, y: oy } },

    // Label text
    {
      type: 'TEXT',
      layer: 'TEXT',
      position: { x: ox + 10, y: oy + 10 },
      height: 5,
      text: input.label || `${input.jobName} (${W}x${H})`,
    },
  ];

  const doc: DxfDocument = {
    units: 'MM',
    layers: STANDARD_LAYERS.filter(l => l.name === 'CUT' || l.name === 'TEXT'),
    entities,
  };

  const content = writeDxfR12(doc);
  const sha256 = sha256Hex(content);

  return {
    filename: `${input.jobName}.dxf`,
    content,
    sha256,
    mime: 'application/dxf',
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}

// ============================================================================
// Full Panel Exporter
// ============================================================================

/**
 * Export a full panel with drilling, pockets, and edge banding.
 */
export function exportPanelDxf(panel: PanelData, options?: { origin?: DxfPoint }): DxfExportResult {
  const ox = options?.origin?.x ?? 0;
  const oy = options?.origin?.y ?? 0;
  const W = panel.width;
  const H = panel.height;

  const entities: DxfEntity[] = [];

  // 1. Panel outline (CUT layer)
  entities.push(
    { type: 'LINE', layer: 'CUT', p1: { x: ox, y: oy }, p2: { x: ox + W, y: oy } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox + W, y: oy }, p2: { x: ox + W, y: oy + H } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox + W, y: oy + H }, p2: { x: ox, y: oy + H } },
    { type: 'LINE', layer: 'CUT', p1: { x: ox, y: oy + H }, p2: { x: ox, y: oy } }
  );

  // 2. Drill holes (DRILL layer)
  if (panel.drillHoles) {
    for (const hole of panel.drillHoles) {
      entities.push({
        type: 'CIRCLE',
        layer: 'DRILL',
        center: { x: ox + hole.x, y: oy + hole.y },
        radius: hole.diameter / 2,
      });
      // Add center point for CNC
      entities.push({
        type: 'POINT',
        layer: 'DRILL',
        position: { x: ox + hole.x, y: oy + hole.y },
      });
    }
  }

  // 3. Pockets (POCKET layer)
  if (panel.pockets) {
    for (const pocket of panel.pockets) {
      const px = ox + pocket.x;
      const py = oy + pocket.y;
      const pw = pocket.width;
      const ph = pocket.height;

      entities.push(
        { type: 'LINE', layer: 'POCKET', p1: { x: px, y: py }, p2: { x: px + pw, y: py } },
        { type: 'LINE', layer: 'POCKET', p1: { x: px + pw, y: py }, p2: { x: px + pw, y: py + ph } },
        { type: 'LINE', layer: 'POCKET', p1: { x: px + pw, y: py + ph }, p2: { x: px, y: py + ph } },
        { type: 'LINE', layer: 'POCKET', p1: { x: px, y: py + ph }, p2: { x: px, y: py } }
      );
    }
  }

  // 4. Edge banding indicators (EDGE layer)
  if (panel.edgeBanding) {
    const offset = 3; // 3mm offset from edge

    if (panel.edgeBanding.bottom) {
      entities.push({
        type: 'LINE',
        layer: 'EDGE',
        p1: { x: ox + offset, y: oy + offset },
        p2: { x: ox + W - offset, y: oy + offset },
      });
    }
    if (panel.edgeBanding.top) {
      entities.push({
        type: 'LINE',
        layer: 'EDGE',
        p1: { x: ox + offset, y: oy + H - offset },
        p2: { x: ox + W - offset, y: oy + H - offset },
      });
    }
    if (panel.edgeBanding.left) {
      entities.push({
        type: 'LINE',
        layer: 'EDGE',
        p1: { x: ox + offset, y: oy + offset },
        p2: { x: ox + offset, y: oy + H - offset },
      });
    }
    if (panel.edgeBanding.right) {
      entities.push({
        type: 'LINE',
        layer: 'EDGE',
        p1: { x: ox + W - offset, y: oy + offset },
        p2: { x: ox + W - offset, y: oy + H - offset },
      });
    }
  }

  // 5. Additional operations
  if (panel.operations) {
    for (const op of panel.operations) {
      if (op.type === 'DRILL') {
        entities.push({
          type: 'CIRCLE',
          layer: 'DRILL',
          center: { x: ox + op.x, y: oy + op.y },
          radius: (op.diameter ?? 5) / 2,
        });
      } else if (op.type === 'POCKET' && op.width && op.height) {
        const px = ox + op.x;
        const py = oy + op.y;
        entities.push(
          { type: 'LINE', layer: 'POCKET', p1: { x: px, y: py }, p2: { x: px + op.width, y: py } },
          { type: 'LINE', layer: 'POCKET', p1: { x: px + op.width, y: py }, p2: { x: px + op.width, y: py + op.height } },
          { type: 'LINE', layer: 'POCKET', p1: { x: px + op.width, y: py + op.height }, p2: { x: px, y: py + op.height } },
          { type: 'LINE', layer: 'POCKET', p1: { x: px, y: py + op.height }, p2: { x: px, y: py } }
        );
      }
    }
  }

  // 6. Label text
  entities.push({
    type: 'TEXT',
    layer: 'TEXT',
    position: { x: ox + 10, y: oy + H - 15 },
    height: 5,
    text: `${panel.label} (${W}x${H}x${panel.thickness})`,
  });

  // Build document
  const doc: DxfDocument = {
    units: 'MM',
    layers: STANDARD_LAYERS,
    entities,
  };

  const content = writeDxfR12(doc);
  const sha256 = sha256Hex(content);

  return {
    filename: `${panel.id}.dxf`,
    content,
    sha256,
    mime: 'application/dxf',
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}

// ============================================================================
// Multi-Panel Sheet Export (Future)
// ============================================================================

/**
 * Export multiple panels on a sheet (for nesting).
 * Placeholder for future implementation.
 */
export function exportSheetDxf(
  panels: PanelData[],
  sheetWidth: number,
  sheetHeight: number
): DxfExportResult {
  // TODO: Implement nesting layout
  // For now, just export the first panel
  if (panels.length === 0) {
    return exportPanelOutlineDxf({
      jobName: 'empty_sheet',
      width: sheetWidth,
      height: sheetHeight,
    });
  }

  return exportPanelDxf(panels[0]);
}
