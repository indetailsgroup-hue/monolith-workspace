/**
 * OpGraph to DXF Mapping
 *
 * Step 10.4: Convert OperationGraph operations to DXF geometry
 *
 * Standard Layer Mapping (human-readable):
 * - OUTLINE: Panel perimeter (ROUTE_PROFILE or default outline)
 * - GROOVE:  Dado/rabbet grooves (POCKET_GROOVE)
 * - REVEAL:  Reveal routing (ROUTE_REVEAL)
 * - DRILL:   Holes with crosshairs + depth annotations (DRILL, DRILL_HOLE)
 * - TEXT:    Labels, part IDs, drill annotations
 * - KERF:    Kerf cuts for bending (KERF_BEND)
 * - EDGE:    Edge banding markers (EDGE_BAND)
 *
 * CAM-Friendly Toolpath Layers (machine-readable):
 * - TP_OUT_CUT_Z{depth}_T{tool}: Profile/outline cuts
 * - TP_GROOVE_Z{depth}_T{tool}:  Groove/dado operations
 * - TP_POCKET_Z{depth}_T{tool}:  Pocket clearing
 * - TP_DRILL_D{dia}_Z{depth}:    Drilling operations
 * - TP_KERF_Z{depth}_T{tool}:    Kerf bending cuts
 * - META_TEXT:                   Human-readable labels
 *
 * Step 10.4 Features:
 * - Tabs/bridges on profile cuts (hold-down)
 * - Optional text annotations for CAM
 *
 * Each panel becomes a "PartBlueprint" with all its operations
 * converted to DXF entities at local coordinates (origin at bottom-left).
 */

import type { DxfEntity, DxfPoint, DxfLayer } from './dxfTypes.js';
import { DXF_COLORS } from './dxfTypes.js';
import { rectLines, circle, text, line, slotCapsule } from './dxfGeom.js';
import {
  tpProfileLayer,
  tpGrooveLayer,
  tpDrillLayer,
  tpKerfLayer,
  META_TEXT,
  SAFE_GUIDES,
} from './toolLayers.js';
import {
  outlineWithTabsRect,
  DEFAULT_TAB_SPEC,
  type TabSpec,
} from './tabs.js';

// ============================================================================
// Types
// ============================================================================

/** Panel dimensions for geometry generation */
export interface PanelDimensions {
  width: number;   // mm
  height: number;  // mm
  thickness: number; // mm
}

/** Simplified OpNode for server-side processing */
export interface OpNode {
  id: string;
  kind: 'ROUTE_PROFILE' | 'POCKET_GROOVE' | 'ROUTE_REVEAL' | 'DRILL' | 'DRILL_HOLE' | 'EDGE_BAND' | 'KERF_BEND';
  panelId: string;
  target: {
    kind: 'EDGE' | 'FACE' | 'PANEL';
    id: string;
    edgeIndex?: number;
    face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
  };
  params: Record<string, number | string>;
}

/**
 * DRILL operation params:
 * - xMm: X position from panel origin (mm)
 * - yMm: Y position from panel origin (mm)
 * - diameterMm: Hole diameter (mm)
 * - depthMm: Drilling depth (mm)
 * - ref?: Reference string (e.g., "CONFIRMAT", "DOWEL_8")
 */

/** Complete part blueprint ready for nesting */
export interface PartBlueprint {
  id: string;
  panelId: string;
  label: string;
  width: number;   // mm
  height: number;  // mm
  thickness?: number; // mm (for toolpath plan)
  entities: DxfEntity[];
  /** Tab positions for toolpath plan metadata */
  tabPositions?: Array<{ x: number; y: number; edgeIndex: number }>;
}

// ============================================================================
// Layer Definitions
// ============================================================================

export const OPGRAPH_LAYERS: DxfLayer[] = [
  { name: 'OUTLINE', color: DXF_COLORS.RED },
  { name: 'GROOVE', color: DXF_COLORS.CYAN },
  { name: 'REVEAL', color: DXF_COLORS.MAGENTA },
  { name: 'DRILL', color: DXF_COLORS.GREEN },
  { name: 'TEXT', color: DXF_COLORS.WHITE },
  { name: 'KERF', color: DXF_COLORS.YELLOW },
  { name: 'EDGE', color: DXF_COLORS.BLUE, lineType: 'DASHED' },
];

// ============================================================================
// OpGraph to DXF Conversion
// ============================================================================

/**
 * Build a PartBlueprint from panel dimensions and operations.
 * All entities are in local coordinates (origin at bottom-left).
 */
export function buildPartBlueprint(
  panelId: string,
  label: string,
  dims: PanelDimensions,
  operations: OpNode[]
): PartBlueprint {
  const entities: DxfEntity[] = [];
  const origin: DxfPoint = { x: 0, y: 0 };

  // 1. Always add outline (4 lines forming rectangle)
  entities.push(...rectLines({
    layer: 'OUTLINE',
    origin,
    width: dims.width,
    height: dims.height,
  }));

  // 2. Process each operation
  for (const op of operations) {
    if (op.panelId !== panelId) continue;

    const opEntities = convertOperation(op, dims, origin);
    entities.push(...opEntities);
  }

  // 3. Add label text (bottom-left, inside panel)
  entities.push(text({
    layer: 'TEXT',
    position: { x: 5, y: 5 },
    height: 8,
    text: label,
  }));

  // 4. Add dimensions text (top-right corner)
  entities.push(text({
    layer: 'TEXT',
    position: { x: dims.width - 5, y: dims.height - 12 },
    height: 6,
    text: `${dims.width}x${dims.height}`,
    hAlign: 'RIGHT',
  }));

  return {
    id: `part_${panelId}`,
    panelId,
    label,
    width: dims.width,
    height: dims.height,
    entities,
  };
}

// ============================================================================
// CAM-Friendly Export (Step 10.3)
// ============================================================================

/**
 * Options for CAM-friendly part blueprint generation.
 */
export interface CAMOptions {
  /** Default profile cut depth (panel thickness + clearance). If not set, uses thickness + 1 */
  profileDepthMm?: number;
  /** Default profile tool diameter (mm). Default: 6 */
  profileToolMm?: number;
  /** Default groove tool diameter (mm). Default: 6 */
  grooveToolMm?: number;
  /** Include human-readable text annotations. Default: true */
  includeTextAnnotations?: boolean;
  /** Tab/bridge configuration for hold-down during profile cuts */
  tabs?: TabSpec;
}

/**
 * Build a CAM-friendly PartBlueprint with toolpath layers.
 *
 * Key differences from standard buildPartBlueprint:
 * - Outline uses closed POLYLINE instead of 4 LINEs
 * - Layers encode tool/depth info (TP_OUT_CUT_Z190_T60)
 * - Grooves use slot boundary (ARCs + LINEs) instead of single line
 * - Drills on layer with diameter/depth encoded
 * - Text annotations are optional (CAM doesn't need them)
 */
export function buildPartBlueprintCAM(
  panelId: string,
  label: string,
  dims: PanelDimensions,
  operations: OpNode[],
  options: CAMOptions = {}
): PartBlueprint {
  const {
    profileDepthMm = dims.thickness + 1,
    profileToolMm = 6,
    grooveToolMm = 6,
    includeTextAnnotations = true,
    tabs = DEFAULT_TAB_SPEC,
  } = options;

  const entities: DxfEntity[] = [];
  const origin: DxfPoint = { x: 0, y: 0 };

  // 1. Profile outline with tabs on toolpath layer
  const profileLayer = tpProfileLayer(profileDepthMm, profileToolMm);

  // Use tabs for hold-down during CNC cutting
  const { cut: outlineCut, safe: tabMarkers, tabPositions } = outlineWithTabsRect({
    layerCut: profileLayer,
    layerSafe: SAFE_GUIDES,
    W: dims.width,
    H: dims.height,
    tab: tabs,
    origin,
  });

  entities.push(...outlineCut);
  entities.push(...tabMarkers);

  // 2. Process each operation with CAM-friendly converters
  for (const op of operations) {
    if (op.panelId !== panelId) continue;

    const opEntities = convertOperationCAM(op, dims, origin, {
      grooveToolMm,
      profileDepthMm,
    });
    entities.push(...opEntities);
  }

  // 3. Add label text (optional for CAM)
  if (includeTextAnnotations) {
    entities.push(text({
      layer: META_TEXT,
      position: { x: 5, y: 5 },
      height: 8,
      text: label,
    }));

    entities.push(text({
      layer: META_TEXT,
      position: { x: dims.width - 5, y: dims.height - 12 },
      height: 6,
      text: `${dims.width}x${dims.height}`,
      hAlign: 'RIGHT',
    }));
  }

  return {
    id: `part_${panelId}`,
    panelId,
    label,
    width: dims.width,
    height: dims.height,
    thickness: dims.thickness,
    entities,
    tabPositions,
  };
}

/**
 * Convert operation to CAM-friendly DXF entities.
 */
function convertOperationCAM(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint,
  options: { grooveToolMm: number; profileDepthMm: number }
): DxfEntity[] {
  switch (op.kind) {
    case 'POCKET_GROOVE':
      return convertGrooveCAM(op, dims, origin, options.grooveToolMm);

    case 'DRILL':
      return convertDrillCAM(op, dims, origin);

    case 'DRILL_HOLE':
      return convertDrillHoleCAM(op, dims, origin);

    case 'KERF_BEND':
      return convertKerfBendCAM(op, dims, origin);

    case 'ROUTE_REVEAL':
      return convertReveal(op, dims, origin);

    case 'EDGE_BAND':
      return convertEdgeBand(op, dims, origin);

    case 'ROUTE_PROFILE':
      // Profile is already handled by the outline polyline
      return [];

    default:
      return [];
  }
}

/**
 * Convert POCKET_GROOVE to CAM-friendly slot boundary (ARCs + LINEs).
 */
function convertGrooveCAM(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint,
  defaultToolMm: number
): DxfEntity[] {
  const { params, target } = op;

  const depth = Number(params.depth ?? params.depthMm ?? dims.thickness * 0.5);
  const width = Number(params.width ?? params.widthMm ?? 6);
  const offset = Number(params.offset ?? params.offsetMm ?? 10);
  const toolMm = Number(params.toolMm ?? Math.min(defaultToolMm, width));

  const layer = tpGrooveLayer(depth, toolMm);
  const r = width / 2; // Slot radius

  // Determine groove position based on target edge
  if (target.kind === 'EDGE') {
    const edgeIndex = target.edgeIndex ?? 0;

    switch (edgeIndex) {
      case 0: // Bottom edge - horizontal groove
        {
          const y = origin.y + offset + r;
          return slotCapsule(layer, origin.x + r, y, origin.x + dims.width - r, y, r);
        }
      case 1: // Right edge - vertical groove
        {
          const x = origin.x + dims.width - offset - r;
          return slotCapsule(layer, x, origin.y + r, x, origin.y + dims.height - r, r);
        }
      case 2: // Top edge - horizontal groove
        {
          const y = origin.y + dims.height - offset - r;
          return slotCapsule(layer, origin.x + r, y, origin.x + dims.width - r, y, r);
        }
      case 3: // Left edge - vertical groove
        {
          const x = origin.x + offset + r;
          return slotCapsule(layer, x, origin.y + r, x, origin.y + dims.height - r, r);
        }
    }
  } else if (target.kind === 'FACE') {
    const inset = Number(params.inset ?? 10);
    const direction = params.direction || 'horizontal';

    if (direction === 'horizontal') {
      const y = origin.y + offset + r;
      return slotCapsule(
        layer,
        origin.x + inset + r,
        y,
        origin.x + dims.width - inset - r,
        y,
        r
      );
    } else {
      const x = origin.x + offset + r;
      return slotCapsule(
        layer,
        x,
        origin.y + inset + r,
        x,
        origin.y + dims.height - inset - r,
        r
      );
    }
  }

  return [];
}

/**
 * Convert DRILL (v2) to CAM-friendly circle on toolpath layer.
 * Crosshair included for visual reference, annotation optional.
 */
function convertDrillCAM(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params } = op;

  const x = Number(params.xMm ?? params.x ?? 0);
  const y = Number(params.yMm ?? params.y ?? 0);
  const diameter = Number(params.diameterMm ?? params.diameter ?? 5);
  const depth = Number(params.depthMm ?? params.depth ?? 10);

  const radius = diameter / 2;
  const centerX = origin.x + x;
  const centerY = origin.y + y;

  // Toolpath layer encodes diameter and depth
  const layer = tpDrillLayer(diameter, depth);

  // Circle on toolpath layer
  entities.push(circle({
    layer,
    center: { x: centerX, y: centerY },
    radius,
  }));

  // Crosshair for visual center marking (same layer)
  const crossSize = Math.max(2, Math.min(6, radius));
  entities.push(line({
    layer,
    p1: { x: centerX - crossSize, y: centerY },
    p2: { x: centerX + crossSize, y: centerY },
  }));
  entities.push(line({
    layer,
    p1: { x: centerX, y: centerY - crossSize },
    p2: { x: centerX, y: centerY + crossSize },
  }));

  return entities;
}

/**
 * Convert DRILL_HOLE patterns to CAM-friendly circles.
 */
function convertDrillHoleCAM(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params, target } = op;

  const diameter = Number(params.diameter ?? 5);
  const radius = diameter / 2;
  const depth = Number(params.depth ?? dims.thickness);
  const layer = tpDrillLayer(diameter, depth);

  // Single hole
  if (params.x !== undefined && params.y !== undefined) {
    const centerX = origin.x + Number(params.x);
    const centerY = origin.y + Number(params.y);

    entities.push(circle({ layer, center: { x: centerX, y: centerY }, radius }));

    // Crosshair
    const crossSize = Math.max(2, Math.min(6, radius));
    entities.push(line({
      layer,
      p1: { x: centerX - crossSize, y: centerY },
      p2: { x: centerX + crossSize, y: centerY },
    }));
    entities.push(line({
      layer,
      p1: { x: centerX, y: centerY - crossSize },
      p2: { x: centerX, y: centerY + crossSize },
    }));

    return entities;
  }

  // System32 pattern
  if (params.pattern === 'system32' || params.pattern === 'shelf_pin') {
    const spacing = 32;
    const edgeOffset = Number(params.edgeOffset ?? 37);
    const startOffset = Number(params.startOffset ?? 37);
    const endOffset = Number(params.endOffset ?? 37);

    if (target.kind === 'EDGE') {
      const edgeIndex = target.edgeIndex ?? 0;

      const addHole = (cx: number, cy: number) => {
        entities.push(circle({ layer, center: { x: cx, y: cy }, radius }));
        const crossSize = Math.max(2, Math.min(6, radius));
        entities.push(line({ layer, p1: { x: cx - crossSize, y: cy }, p2: { x: cx + crossSize, y: cy } }));
        entities.push(line({ layer, p1: { x: cx, y: cy - crossSize }, p2: { x: cx, y: cy + crossSize } }));
      };

      switch (edgeIndex) {
        case 0: // Bottom
        case 2: // Top
          {
            const yPos = edgeIndex === 0 ? origin.y + edgeOffset : origin.y + dims.height - edgeOffset;
            const usableWidth = dims.width - startOffset - endOffset;
            const count = Math.floor(usableWidth / spacing) + 1;
            for (let i = 0; i < count; i++) {
              addHole(origin.x + startOffset + i * spacing, yPos);
            }
          }
          break;
        case 1: // Right
        case 3: // Left
          {
            const xPos = edgeIndex === 1 ? origin.x + dims.width - edgeOffset : origin.x + edgeOffset;
            const usableHeight = dims.height - startOffset - endOffset;
            const count = Math.floor(usableHeight / spacing) + 1;
            for (let i = 0; i < count; i++) {
              addHole(xPos, origin.y + startOffset + i * spacing);
            }
          }
          break;
      }
    }
  }

  return entities;
}

/**
 * Convert KERF_BEND to CAM-friendly kerf cuts on toolpath layer.
 */
function convertKerfBendCAM(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params } = op;

  const kerfCount = Number(params.kerfCount ?? 10);
  const kerfSpacing = Number(params.kerfSpacing ?? 10);
  const kerfDepth = Number(params.kerfDepth ?? dims.thickness * 0.8);
  const kerfWidth = Number(params.kerfWidth ?? params.sawWidth ?? 3);
  const startOffset = Number(params.startOffset ?? 50);
  const direction = params.direction || 'horizontal';

  const layer = tpKerfLayer(kerfDepth, kerfWidth);

  if (direction === 'horizontal') {
    for (let i = 0; i < kerfCount; i++) {
      const y = origin.y + startOffset + i * kerfSpacing;
      if (y < origin.y + dims.height - startOffset) {
        entities.push(line({
          layer,
          p1: { x: origin.x, y },
          p2: { x: origin.x + dims.width, y },
        }));
      }
    }
  } else {
    for (let i = 0; i < kerfCount; i++) {
      const x = origin.x + startOffset + i * kerfSpacing;
      if (x < origin.x + dims.width - startOffset) {
        entities.push(line({
          layer,
          p1: { x, y: origin.y },
          p2: { x, y: origin.y + dims.height },
        }));
      }
    }
  }

  return entities;
}

/**
 * Convert a single operation to DXF entities.
 */
function convertOperation(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  switch (op.kind) {
    case 'POCKET_GROOVE':
      return convertGroove(op, dims, origin);

    case 'ROUTE_REVEAL':
      return convertReveal(op, dims, origin);

    case 'DRILL':
      return convertDrillV2(op, dims, origin);

    case 'DRILL_HOLE':
      return convertDrill(op, dims, origin);

    case 'EDGE_BAND':
      return convertEdgeBand(op, dims, origin);

    case 'KERF_BEND':
      return convertKerfBend(op, dims, origin);

    case 'ROUTE_PROFILE':
      // Profile routing is already covered by outline
      return [];

    default:
      return [];
  }
}

// ============================================================================
// Operation Converters
// ============================================================================

/**
 * Convert POCKET_GROOVE to groove lines.
 */
function convertGroove(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params, target } = op;

  const depth = Number(params.depth) || dims.thickness * 0.5;
  const width = Number(params.width) || 6;
  const offset = Number(params.offset) || 10;

  // Determine groove position based on target edge/face
  if (target.kind === 'EDGE') {
    const edgeIndex = target.edgeIndex ?? 0;

    switch (edgeIndex) {
      case 0: // Bottom edge
        entities.push(line({
          layer: 'GROOVE',
          p1: { x: origin.x, y: origin.y + offset },
          p2: { x: origin.x + dims.width, y: origin.y + offset },
        }));
        break;
      case 1: // Right edge
        entities.push(line({
          layer: 'GROOVE',
          p1: { x: origin.x + dims.width - offset, y: origin.y },
          p2: { x: origin.x + dims.width - offset, y: origin.y + dims.height },
        }));
        break;
      case 2: // Top edge
        entities.push(line({
          layer: 'GROOVE',
          p1: { x: origin.x, y: origin.y + dims.height - offset },
          p2: { x: origin.x + dims.width, y: origin.y + dims.height - offset },
        }));
        break;
      case 3: // Left edge
        entities.push(line({
          layer: 'GROOVE',
          p1: { x: origin.x + offset, y: origin.y },
          p2: { x: origin.x + offset, y: origin.y + dims.height },
        }));
        break;
    }
  } else if (target.kind === 'FACE') {
    // Face groove (e.g., for back panel)
    const inset = Number(params.inset) || 10;

    // Horizontal groove across panel
    if (params.direction === 'horizontal') {
      entities.push(line({
        layer: 'GROOVE',
        p1: { x: origin.x + inset, y: origin.y + offset },
        p2: { x: origin.x + dims.width - inset, y: origin.y + offset },
      }));
    } else {
      // Vertical groove
      entities.push(line({
        layer: 'GROOVE',
        p1: { x: origin.x + offset, y: origin.y + inset },
        p2: { x: origin.x + offset, y: origin.y + dims.height - inset },
      }));
    }
  }

  return entities;
}

/**
 * Convert ROUTE_REVEAL to reveal lines.
 */
function convertReveal(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params, target } = op;

  const depth = Number(params.depth) || 2;
  const width = Number(params.width) || 3;
  const offset = Number(params.offset) || 37; // Standard reveal offset

  // Reveal is typically at a fixed offset from edge
  if (target.kind === 'EDGE') {
    const edgeIndex = target.edgeIndex ?? 0;

    switch (edgeIndex) {
      case 0: // Bottom
        entities.push(line({
          layer: 'REVEAL',
          p1: { x: origin.x, y: origin.y + offset },
          p2: { x: origin.x + dims.width, y: origin.y + offset },
        }));
        break;
      case 1: // Right
        entities.push(line({
          layer: 'REVEAL',
          p1: { x: origin.x + dims.width - offset, y: origin.y },
          p2: { x: origin.x + dims.width - offset, y: origin.y + dims.height },
        }));
        break;
      case 2: // Top
        entities.push(line({
          layer: 'REVEAL',
          p1: { x: origin.x, y: origin.y + dims.height - offset },
          p2: { x: origin.x + dims.width, y: origin.y + dims.height - offset },
        }));
        break;
      case 3: // Left
        entities.push(line({
          layer: 'REVEAL',
          p1: { x: origin.x + offset, y: origin.y },
          p2: { x: origin.x + offset, y: origin.y + dims.height },
        }));
        break;
    }
  }

  return entities;
}

/**
 * Convert DRILL_HOLE to circles.
 */
function convertDrill(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params, target } = op;

  const diameter = Number(params.diameter) || 5;
  const radius = diameter / 2;
  const depth = Number(params.depth) || dims.thickness;

  // Single hole
  if (params.x !== undefined && params.y !== undefined) {
    entities.push(circle({
      layer: 'DRILL',
      center: {
        x: origin.x + Number(params.x),
        y: origin.y + Number(params.y),
      },
      radius,
    }));
    return entities;
  }

  // System32 pattern (32mm spacing)
  if (params.pattern === 'system32' || params.pattern === 'shelf_pin') {
    const spacing = 32;
    const edgeOffset = Number(params.edgeOffset) || 37;
    const startOffset = Number(params.startOffset) || 37;
    const endOffset = Number(params.endOffset) || 37;

    if (target.kind === 'EDGE') {
      const edgeIndex = target.edgeIndex ?? 0;

      // Determine hole positions
      switch (edgeIndex) {
        case 0: // Bottom edge - horizontal row
        case 2: // Top edge - horizontal row
          {
            const y = edgeIndex === 0
              ? origin.y + edgeOffset
              : origin.y + dims.height - edgeOffset;
            const usableWidth = dims.width - startOffset - endOffset;
            const count = Math.floor(usableWidth / spacing) + 1;

            for (let i = 0; i < count; i++) {
              entities.push(circle({
                layer: 'DRILL',
                center: { x: origin.x + startOffset + i * spacing, y },
                radius,
              }));
            }
          }
          break;
        case 1: // Right edge - vertical row
        case 3: // Left edge - vertical row
          {
            const x = edgeIndex === 1
              ? origin.x + dims.width - edgeOffset
              : origin.x + edgeOffset;
            const usableHeight = dims.height - startOffset - endOffset;
            const count = Math.floor(usableHeight / spacing) + 1;

            for (let i = 0; i < count; i++) {
              entities.push(circle({
                layer: 'DRILL',
                center: { x, y: origin.y + startOffset + i * spacing },
                radius,
              }));
            }
          }
          break;
      }
    }
  }

  // Hinge holes (cup holes)
  if (params.pattern === 'hinge') {
    const cupDiameter = Number(params.cupDiameter) || 35;
    const cupRadius = cupDiameter / 2;
    const edgeOffset = Number(params.edgeOffset) || 21.5; // Standard 35mm hinge

    // Add cup hole
    entities.push(circle({
      layer: 'DRILL',
      center: {
        x: origin.x + Number(params.x ?? edgeOffset),
        y: origin.y + Number(params.y ?? dims.height / 2),
      },
      radius: cupRadius,
    }));

    // Add mounting holes
    const mountingOffset = 45; // Distance from cup center to mounting holes
    const mountingRadius = 2;

    entities.push(circle({
      layer: 'DRILL',
      center: {
        x: origin.x + Number(params.x ?? edgeOffset) + mountingOffset,
        y: origin.y + Number(params.y ?? dims.height / 2),
      },
      radius: mountingRadius,
    }));
  }

  return entities;
}

/**
 * Convert DRILL (v2) to circle + crosshair + depth annotation.
 *
 * Step 10.2: Enhanced drill visualization
 * - Circle shows hole outline
 * - Crosshair (2 short lines) marks center
 * - Text annotation shows diameter, depth, and reference
 */
function convertDrillV2(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params } = op;

  // Get drill parameters
  const x = Number(params.xMm ?? params.x ?? 0);
  const y = Number(params.yMm ?? params.y ?? 0);
  const diameter = Number(params.diameterMm ?? params.diameter ?? 5);
  const depth = params.depthMm !== undefined ? Number(params.depthMm) : undefined;
  const ref = params.ref ? String(params.ref) : '';

  const radius = diameter / 2;
  const centerX = origin.x + x;
  const centerY = origin.y + y;

  // 1. Circle for hole outline
  entities.push(circle({
    layer: 'DRILL',
    center: { x: centerX, y: centerY },
    radius,
  }));

  // 2. Crosshair (2 short lines through center)
  // Crosshair size: clamped between 2mm and 6mm, or radius if smaller
  const crossSize = Math.max(2, Math.min(6, radius));

  // Horizontal crosshair
  entities.push(line({
    layer: 'DRILL',
    p1: { x: centerX - crossSize, y: centerY },
    p2: { x: centerX + crossSize, y: centerY },
  }));

  // Vertical crosshair
  entities.push(line({
    layer: 'DRILL',
    p1: { x: centerX, y: centerY - crossSize },
    p2: { x: centerX, y: centerY + crossSize },
  }));

  // 3. Depth annotation text
  let annotation = `Ø${diameter}`;
  if (depth !== undefined) {
    annotation += ` Z${depth}`;
  }
  if (ref) {
    annotation += ` ${ref}`;
  }

  entities.push(text({
    layer: 'TEXT',
    position: { x: centerX + radius + 2, y: centerY + radius + 2 },
    height: 2.5,
    text: annotation,
  }));

  return entities;
}

/**
 * Convert EDGE_BAND to dashed lines indicating banding.
 */
function convertEdgeBand(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { target } = op;

  // Small offset inward to show edge band
  const bandOffset = 1;

  if (target.kind === 'EDGE') {
    const edgeIndex = target.edgeIndex ?? 0;

    switch (edgeIndex) {
      case 0: // Bottom
        entities.push(line({
          layer: 'EDGE',
          p1: { x: origin.x, y: origin.y + bandOffset },
          p2: { x: origin.x + dims.width, y: origin.y + bandOffset },
        }));
        break;
      case 1: // Right
        entities.push(line({
          layer: 'EDGE',
          p1: { x: origin.x + dims.width - bandOffset, y: origin.y },
          p2: { x: origin.x + dims.width - bandOffset, y: origin.y + dims.height },
        }));
        break;
      case 2: // Top
        entities.push(line({
          layer: 'EDGE',
          p1: { x: origin.x, y: origin.y + dims.height - bandOffset },
          p2: { x: origin.x + dims.width, y: origin.y + dims.height - bandOffset },
        }));
        break;
      case 3: // Left
        entities.push(line({
          layer: 'EDGE',
          p1: { x: origin.x + bandOffset, y: origin.y },
          p2: { x: origin.x + bandOffset, y: origin.y + dims.height },
        }));
        break;
    }
  }

  return entities;
}

/**
 * Convert KERF_BEND to kerf cut lines.
 */
function convertKerfBend(
  op: OpNode,
  dims: PanelDimensions,
  origin: DxfPoint
): DxfEntity[] {
  const entities: DxfEntity[] = [];
  const { params } = op;

  const kerfCount = Number(params.kerfCount) || 10;
  const kerfSpacing = Number(params.kerfSpacing) || 10;
  const kerfDepth = Number(params.kerfDepth) || dims.thickness * 0.8;
  const startOffset = Number(params.startOffset) || 50;
  const direction = params.direction || 'horizontal';

  if (direction === 'horizontal') {
    // Horizontal kerf cuts (for vertical bending)
    for (let i = 0; i < kerfCount; i++) {
      const y = origin.y + startOffset + i * kerfSpacing;
      if (y < origin.y + dims.height - startOffset) {
        entities.push(line({
          layer: 'KERF',
          p1: { x: origin.x, y },
          p2: { x: origin.x + dims.width, y },
        }));
      }
    }
  } else {
    // Vertical kerf cuts (for horizontal bending)
    for (let i = 0; i < kerfCount; i++) {
      const x = origin.x + startOffset + i * kerfSpacing;
      if (x < origin.x + dims.width - startOffset) {
        entities.push(line({
          layer: 'KERF',
          p1: { x, y: origin.y },
          p2: { x, y: origin.y + dims.height },
        }));
      }
    }
  }

  return entities;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Translate all entities by dx, dy.
 * Used when placing parts on sheets.
 */
export function translateEntities(
  entities: DxfEntity[],
  dx: number,
  dy: number
): DxfEntity[] {
  return entities.map(entity => translateEntity(entity, dx, dy));
}

function translateEntity(entity: DxfEntity, dx: number, dy: number): DxfEntity {
  switch (entity.type) {
    case 'LINE':
      return {
        ...entity,
        p1: { x: entity.p1.x + dx, y: entity.p1.y + dy, z: entity.p1.z },
        p2: { x: entity.p2.x + dx, y: entity.p2.y + dy, z: entity.p2.z },
      };

    case 'CIRCLE':
      return {
        ...entity,
        center: { x: entity.center.x + dx, y: entity.center.y + dy, z: entity.center.z },
      };

    case 'ARC':
      return {
        ...entity,
        center: { x: entity.center.x + dx, y: entity.center.y + dy, z: entity.center.z },
      };

    case 'TEXT':
      return {
        ...entity,
        position: { x: entity.position.x + dx, y: entity.position.y + dy, z: entity.position.z },
      };

    case 'POINT':
      return {
        ...entity,
        position: { x: entity.position.x + dx, y: entity.position.y + dy, z: entity.position.z },
      };

    case 'POLYLINE':
      return {
        ...entity,
        points: entity.points.map(p => ({
          x: p.x + dx,
          y: p.y + dy,
          z: p.z,
        })),
      };

    default:
      return entity;
  }
}

/**
 * Rotate entities 90 degrees around origin.
 * Used when rotating parts to fit on sheets.
 */
export function rotateEntities90(entities: DxfEntity[]): DxfEntity[] {
  return entities.map(entity => rotateEntity90(entity));
}

function rotateEntity90(entity: DxfEntity): DxfEntity {
  const rotate = (p: DxfPoint): DxfPoint => ({
    x: -p.y,
    y: p.x,
    z: p.z,
  });

  switch (entity.type) {
    case 'LINE':
      return {
        ...entity,
        p1: rotate(entity.p1),
        p2: rotate(entity.p2),
      };

    case 'CIRCLE':
      return {
        ...entity,
        center: rotate(entity.center),
      };

    case 'ARC':
      return {
        ...entity,
        center: rotate(entity.center),
        startAngle: (entity.startAngle + 90) % 360,
        endAngle: (entity.endAngle + 90) % 360,
      };

    case 'TEXT':
      return {
        ...entity,
        position: rotate(entity.position),
        rotation: ((entity.rotation ?? 0) + 90) % 360,
      };

    case 'POINT':
      return {
        ...entity,
        position: rotate(entity.position),
      };

    case 'POLYLINE':
      return {
        ...entity,
        points: entity.points.map(rotate),
      };

    default:
      return entity;
  }
}
