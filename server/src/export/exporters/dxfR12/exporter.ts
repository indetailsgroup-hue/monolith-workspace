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
// Multi-Panel Sheet Export with Nesting
// ============================================================================

/**
 * Nesting configuration
 */
export interface NestingConfig {
  /** Gap between panels (mm) */
  panelGap: number;
  /** Margin from sheet edges (mm) */
  sheetMargin: number;
  /** Allow 90-degree rotation for better fit */
  allowRotation: boolean;
}

const DEFAULT_NESTING_CONFIG: NestingConfig = {
  panelGap: 5,
  sheetMargin: 10,
  allowRotation: true,
};

/**
 * Represents a placed panel in the nesting layout
 */
interface PlacedPanel {
  panel: PanelData;
  x: number;
  y: number;
  rotated: boolean;  // true if rotated 90 degrees
  width: number;     // actual width after rotation
  height: number;    // actual height after rotation
}

/**
 * Bottom-Left Fill (BLF) nesting algorithm
 * Places panels from bottom-left, scanning for first available position
 *
 * This is a simple but effective algorithm for rectangular bin packing.
 * For production use with complex shapes, consider:
 * - NFP (No-Fit Polygon) based algorithms
 * - Genetic algorithm optimization
 * - Commercial nesting libraries
 */
function nestPanelsBLF(
  panels: PanelData[],
  sheetWidth: number,
  sheetHeight: number,
  config: NestingConfig
): { placed: PlacedPanel[]; unplaced: PanelData[]; efficiency: number } {
  const { panelGap, sheetMargin, allowRotation } = config;

  // Usable area after margins
  const usableWidth = sheetWidth - 2 * sheetMargin;
  const usableHeight = sheetHeight - 2 * sheetMargin;

  // Sort panels by area (largest first) for better packing
  const sortedPanels = [...panels].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    return areaB - areaA;
  });

  const placed: PlacedPanel[] = [];
  const unplaced: PanelData[] = [];

  // Track occupied rectangles for collision detection
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];

  /**
   * Check if a rectangle can be placed at position without collision
   */
  function canPlace(x: number, y: number, w: number, h: number): boolean {
    // Check sheet boundaries
    if (x + w > usableWidth || y + h > usableHeight) {
      return false;
    }

    // Check collision with placed panels
    for (const rect of occupied) {
      const noOverlap =
        x + w + panelGap <= rect.x ||
        rect.x + rect.w + panelGap <= x ||
        y + h + panelGap <= rect.y ||
        rect.y + rect.h + panelGap <= y;

      if (!noOverlap) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find first available position using bottom-left scanning
   */
  function findPosition(w: number, h: number): { x: number; y: number } | null {
    // Scan Y positions (bottom to top)
    for (let y = 0; y <= usableHeight - h; y += 1) {
      // Scan X positions (left to right)
      for (let x = 0; x <= usableWidth - w; x += 1) {
        if (canPlace(x, y, w, h)) {
          return { x, y };
        }
      }
    }
    return null;
  }

  // Place each panel
  for (const panel of sortedPanels) {
    let position: { x: number; y: number } | null = null;
    let rotated = false;
    let finalWidth = panel.width;
    let finalHeight = panel.height;

    // Try original orientation
    position = findPosition(panel.width, panel.height);

    // Try rotated if allowed and original didn't fit
    if (!position && allowRotation && panel.width !== panel.height) {
      position = findPosition(panel.height, panel.width);
      if (position) {
        rotated = true;
        finalWidth = panel.height;
        finalHeight = panel.width;
      }
    }

    if (position) {
      placed.push({
        panel,
        x: position.x + sheetMargin,
        y: position.y + sheetMargin,
        rotated,
        width: finalWidth,
        height: finalHeight,
      });

      occupied.push({
        x: position.x,
        y: position.y,
        w: finalWidth,
        h: finalHeight,
      });
    } else {
      unplaced.push(panel);
    }
  }

  // Calculate nesting efficiency
  const totalPanelArea = placed.reduce((sum, p) => sum + p.width * p.height, 0);
  const sheetArea = usableWidth * usableHeight;
  const efficiency = sheetArea > 0 ? (totalPanelArea / sheetArea) * 100 : 0;

  return { placed, unplaced, efficiency };
}

/**
 * Export multiple panels on a sheet with nesting layout.
 * Uses Bottom-Left Fill algorithm to minimize waste.
 *
 * @param panels - Array of panels to nest
 * @param sheetWidth - Sheet width in mm
 * @param sheetHeight - Sheet height in mm
 * @param config - Optional nesting configuration
 * @returns DXF export result with nested panels
 */
export function exportSheetDxf(
  panels: PanelData[],
  sheetWidth: number,
  sheetHeight: number,
  config: NestingConfig = DEFAULT_NESTING_CONFIG
): DxfExportResult {
  if (panels.length === 0) {
    return exportPanelOutlineDxf({
      jobName: 'empty_sheet',
      width: sheetWidth,
      height: sheetHeight,
    });
  }

  // Run nesting algorithm
  const { placed, unplaced, efficiency } = nestPanelsBLF(
    panels,
    sheetWidth,
    sheetHeight,
    config
  );

  // Log nesting results
  console.log(
    `[DXF Nesting] Placed ${placed.length}/${panels.length} panels, ` +
    `efficiency: ${efficiency.toFixed(1)}%, ` +
    `unplaced: ${unplaced.length}`
  );

  // Build entities for all placed panels
  const entities: DxfEntity[] = [];

  // Sheet outline (for reference)
  entities.push(
    { type: 'LINE', layer: 'CUT', p1: { x: 0, y: 0 }, p2: { x: sheetWidth, y: 0 } },
    { type: 'LINE', layer: 'CUT', p1: { x: sheetWidth, y: 0 }, p2: { x: sheetWidth, y: sheetHeight } },
    { type: 'LINE', layer: 'CUT', p1: { x: sheetWidth, y: sheetHeight }, p2: { x: 0, y: sheetHeight } },
    { type: 'LINE', layer: 'CUT', p1: { x: 0, y: sheetHeight }, p2: { x: 0, y: 0 } }
  );

  // Add each placed panel
  for (const placedPanel of placed) {
    const { panel, x, y, width, height, rotated } = placedPanel;

    // Panel outline
    entities.push(
      { type: 'LINE', layer: 'CUT', p1: { x, y }, p2: { x: x + width, y } },
      { type: 'LINE', layer: 'CUT', p1: { x: x + width, y }, p2: { x: x + width, y: y + height } },
      { type: 'LINE', layer: 'CUT', p1: { x: x + width, y: y + height }, p2: { x, y: y + height } },
      { type: 'LINE', layer: 'CUT', p1: { x, y: y + height }, p2: { x, y } }
    );

    // Drill holes (if any) - adjust for rotation
    if (panel.drillHoles) {
      for (const hole of panel.drillHoles) {
        const holeX = rotated ? x + hole.y : x + hole.x;
        const holeY = rotated ? y + (width - hole.x) : y + hole.y;

        entities.push({
          type: 'CIRCLE',
          layer: 'DRILL',
          center: { x: holeX, y: holeY },
          radius: hole.diameter / 2,
        });
        entities.push({
          type: 'POINT',
          layer: 'DRILL',
          position: { x: holeX, y: holeY },
        });
      }
    }

    // Panel label
    const rotationNote = rotated ? ' [R]' : '';
    entities.push({
      type: 'TEXT',
      layer: 'TEXT',
      position: { x: x + 10, y: y + 10 },
      height: 5,
      text: `${panel.label} (${panel.width}x${panel.height})${rotationNote}`,
    });
  }

  // Add sheet info text
  entities.push({
    type: 'TEXT',
    layer: 'TEXT',
    position: { x: 10, y: sheetHeight - 10 },
    height: 8,
    text: `Sheet: ${sheetWidth}x${sheetHeight}mm | Panels: ${placed.length} | Efficiency: ${efficiency.toFixed(1)}%`,
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
    filename: `nested_sheet_${sheetWidth}x${sheetHeight}.dxf`,
    content,
    sha256,
    mime: 'application/dxf',
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}
