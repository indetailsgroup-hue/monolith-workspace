/**
 * cabinetToDxf.ts - Convert Cabinet Panels to DXF Production Data
 *
 * ARCHITECTURE (North Star v4.0):
 * - Converts CabinetPanel from store to PanelProductionData for DXF export
 * - Auto-generates drilling patterns based on panel role
 * - Supports edge banding layer generation
 *
 * DRILLING PATTERNS:
 * - LEFT_SIDE/RIGHT_SIDE: System 32 shelf pins, back panel groove
 * - TOP/BOTTOM: Confirmat holes for side panels
 * - SHELF: None (adjustable)
 * - DRAWER_FRONT: Hinge cups (35mm)
 * - FRONT: Hinge mounting holes
 *
 * @version 1.0.0
 */

import type { CabinetPanel, Cabinet, GrainDirection as CabinetGrain } from '../types/Cabinet';
import type {
  PanelProductionData,
  MachineOperation,
  EdgeDetail,
  GrainDirection,
  DrillVerticalOp,
  DrillHorizontalOp,
  GrooveOp,
  HingeCupOp,
} from '../types/Production';
import {
  SYSTEM_32,
  CONFIRMAT,
  HINGE_PARAMS,
} from '../types/Production';
import { generatePanelDXF, downloadDXF, DXFGeneratorOptions } from './DXFGenerator';
import {
  type MinifixHousingType,
  type ConnectingBoltType,
  MINIFIX_HOUSINGS,
  generateMinifixArrayPattern,
  getRecommendedMinifixConfig,
} from '../catalog/MinifixHardware';

// ============================================
// TYPES
// ============================================

export interface CabinetDxfOptions extends DXFGeneratorOptions {
  /** Generate System 32 drilling for side panels */
  includeSystem32?: boolean;
  /** Generate back panel groove for side panels */
  includeBackGroove?: boolean;
  /** Generate hinge cups for doors */
  includeHingeCups?: boolean;
  /** Generate confirmat holes for structural panels */
  includeConfirmat?: boolean;
  /** Generate Minifix connector holes instead of confirmat (for knockdown furniture) */
  includeMinifix?: boolean;
  /** Minifix housing type (auto-detected if not specified) */
  minifixHousing?: MinifixHousingType;
  /** Minifix bolt type (auto-detected if not specified) */
  minifixBolt?: ConnectingBoltType;
  /** Connection type for Minifix selection */
  connectionType?: 'standard' | 'heavy-duty' | 'knockdown';
  /** Include dowels with Minifix connections */
  includeMinifixDowels?: boolean;
  /** Panel thickness for Z calculations */
  coreThickness?: number;
  /** Target machine profile (for size validation) */
  machineProfile?: { id: string; name: string; maxWidth: number; maxHeight: number };
  /** Selected panel IDs to export (if undefined, export all) */
  selectedPanelIds?: string[];
  /** Progress callback for per-panel tracking */
  onPanelProgress?: (panelId: string, panelName: string, index: number, total: number) => void;
}

const DEFAULT_OPTIONS: CabinetDxfOptions = {
  includeSystem32: true,
  includeBackGroove: true,
  includeHingeCups: true,
  includeConfirmat: true,
  includeMinifix: false,       // Minifix disabled by default (use confirmat)
  includeMinifixDowels: true,  // Include dowels when Minifix is enabled
  connectionType: 'standard',
  coreThickness: 18,
  includeDimensions: true,
  includePartInfo: true,
  includeEdgeBanding: true,    // Edge banding indicators enabled by default
  origin: 'bottom_left',
};

// ============================================
// GRAIN DIRECTION CONVERTER
// ============================================

function convertGrainDirection(grain: CabinetGrain): GrainDirection {
  switch (grain) {
    case 'HORIZONTAL': return 'horizontal';
    case 'VERTICAL': return 'vertical';
    default: return 'none';
  }
}

// ============================================
// EDGE CONVERTER
// ============================================

function convertEdge(edgeMaterialId: string | null, edgeThickness: number = 1.0): EdgeDetail | undefined {
  if (!edgeMaterialId) return undefined;

  return {
    thickness: edgeThickness,
    materialCode: edgeMaterialId,
    height: 23, // Standard edge tape height
  };
}

// ============================================
// DRILLING PATTERN GENERATORS
// ============================================

/**
 * Generate System 32 drilling pattern for side panels
 * Two columns of 5mm holes for adjustable shelves
 */
function generateSystem32Drilling(
  panelWidth: number,
  panelHeight: number,
  _coreThickness: number,
  bottomOffset: number = 100 // Toe kick height
): DrillVerticalOp[] {
  const operations: DrillVerticalOp[] = [];
  const startY = bottomOffset + SYSTEM_32.START_HEIGHT;
  const endY = panelHeight - 64; // Leave 64mm at top

  // Front row
  const frontX = SYSTEM_32.EDGE_OFFSET_FRONT;
  // Back row (from back edge)
  const backX = panelWidth - SYSTEM_32.EDGE_OFFSET_BACK;

  let y = startY;
  let holeIndex = 0;

  while (y <= endY) {
    // Front row hole
    operations.push({
      id: `sys32-front-${holeIndex}`,
      type: 'drill_vertical',
      x: frontX,
      y: y,
      diameter: SYSTEM_32.HOLE_DIAMETER,
      depth: SYSTEM_32.HOLE_DEPTH,
      isThrough: false,
      face: 'A',
    });

    // Back row hole
    operations.push({
      id: `sys32-back-${holeIndex}`,
      type: 'drill_vertical',
      x: backX,
      y: y,
      diameter: SYSTEM_32.HOLE_DIAMETER,
      depth: SYSTEM_32.HOLE_DEPTH,
      isThrough: false,
      face: 'A',
    });

    y += SYSTEM_32.HOLE_SPACING;
    holeIndex++;
  }

  return operations;
}

/**
 * Generate back panel groove for side panels
 * Vertical groove near back edge for inset back panel
 */
function generateBackPanelGroove(
  panelWidth: number,
  panelHeight: number,
  groovePosition: number = 20, // Distance from back edge
  grooveWidth: number = 6,
  grooveDepth: number = 8
): GrooveOp {
  return {
    id: 'back-groove',
    type: 'groove',
    face: 'A',
    axis: 'y', // Vertical groove
    position: panelWidth - groovePosition, // From back edge
    start: 0,
    length: panelHeight,
    width: grooveWidth,
    depth: grooveDepth,
  };
}

/**
 * Generate confirmat screw holes for top/bottom panels
 * Horizontal holes from edges for joining to side panels
 */
function generateConfirmatHoles(
  _panelWidth: number,
  panelHeight: number,
  coreThickness: number,
  _isTop: boolean
): DrillHorizontalOp[] {
  const operations: DrillHorizontalOp[] = [];
  const zCenter = coreThickness / 2;

  // Holes on left edge
  operations.push({
    id: 'confirmat-left-1',
    type: 'drill_horizontal',
    side: 'left',
    offset: CONFIRMAT.EDGE_OFFSET,
    z_center: zCenter,
    diameter: CONFIRMAT.PILOT_DIAMETER,
    depth: CONFIRMAT.EDGE_DEPTH,
  });

  operations.push({
    id: 'confirmat-left-2',
    type: 'drill_horizontal',
    side: 'left',
    offset: panelHeight - CONFIRMAT.EDGE_OFFSET,
    z_center: zCenter,
    diameter: CONFIRMAT.PILOT_DIAMETER,
    depth: CONFIRMAT.EDGE_DEPTH,
  });

  // Holes on right edge
  operations.push({
    id: 'confirmat-right-1',
    type: 'drill_horizontal',
    side: 'right',
    offset: CONFIRMAT.EDGE_OFFSET,
    z_center: zCenter,
    diameter: CONFIRMAT.PILOT_DIAMETER,
    depth: CONFIRMAT.EDGE_DEPTH,
  });

  operations.push({
    id: 'confirmat-right-2',
    type: 'drill_horizontal',
    side: 'right',
    offset: panelHeight - CONFIRMAT.EDGE_OFFSET,
    z_center: zCenter,
    diameter: CONFIRMAT.PILOT_DIAMETER,
    depth: CONFIRMAT.EDGE_DEPTH,
  });

  return operations;
}

/**
 * Generate hinge cup holes for door panels
 * Standard 35mm Blum/Salice hinge cups
 */
function generateHingeCups(
  _panelWidth: number,
  panelHeight: number,
  hingeCount: number = 2
): HingeCupOp[] {
  const operations: HingeCupOp[] = [];

  // Cup X position (from hinge edge - typically left for left-hung door)
  const cupX = HINGE_PARAMS.EDGE_OFFSET + HINGE_PARAMS.CUP_DIAMETER / 2;

  // Calculate Y positions based on door height
  // Top hinge: 100mm from top
  // Bottom hinge: 100mm from bottom
  // Middle hinge(s): evenly spaced
  const topY = panelHeight - 100;
  const bottomY = 100;

  if (hingeCount === 2) {
    operations.push({
      id: 'hinge-cup-top',
      type: 'hinge_cup',
      face: 'B', // Cups drilled from back of door
      x: cupX,
      y: topY,
      diameter: HINGE_PARAMS.CUP_DIAMETER,
      depth: HINGE_PARAMS.CUP_DEPTH,
    });

    operations.push({
      id: 'hinge-cup-bottom',
      type: 'hinge_cup',
      face: 'B',
      x: cupX,
      y: bottomY,
      diameter: HINGE_PARAMS.CUP_DIAMETER,
      depth: HINGE_PARAMS.CUP_DEPTH,
    });
  } else if (hingeCount >= 3) {
    // Three or more hinges
    operations.push({
      id: 'hinge-cup-top',
      type: 'hinge_cup',
      face: 'B',
      x: cupX,
      y: topY,
      diameter: HINGE_PARAMS.CUP_DIAMETER,
      depth: HINGE_PARAMS.CUP_DEPTH,
    });

    operations.push({
      id: 'hinge-cup-bottom',
      type: 'hinge_cup',
      face: 'B',
      x: cupX,
      y: bottomY,
      diameter: HINGE_PARAMS.CUP_DIAMETER,
      depth: HINGE_PARAMS.CUP_DEPTH,
    });

    // Middle hinge
    const middleY = (topY + bottomY) / 2;
    operations.push({
      id: 'hinge-cup-middle',
      type: 'hinge_cup',
      face: 'B',
      x: cupX,
      y: middleY,
      diameter: HINGE_PARAMS.CUP_DIAMETER,
      depth: HINGE_PARAMS.CUP_DEPTH,
    });
  }

  return operations;
}

/**
 * Generate hinge mounting holes for side panels (where hinges attach)
 * 5mm holes for hinge base plate
 * @internal Reserved for future use when cabinet has doors
 */
function _generateHingeMountingHoles(
  _panelWidth: number,
  panelHeight: number,
  _coreThickness: number,
  bottomOffset: number = 100, // Toe kick height
  _doorHeight?: number
): DrillVerticalOp[] {
  const operations: DrillVerticalOp[] = [];

  const mountX = HINGE_PARAMS.MOUNTING_PLATE.EDGE_OFFSET;
  void _doorHeight; // Reserved for variable hinge positioning

  // Top hinge position
  const topY = panelHeight - 100;
  // Bottom hinge position
  const bottomY = bottomOffset + 100;

  // Each hinge plate has 2 mounting holes, 32mm apart
  const holeSpacing = HINGE_PARAMS.MOUNTING_PLATE.HOLE_SPACING;

  // Top hinge mounting holes
  operations.push({
    id: 'hinge-mount-top-1',
    type: 'drill_vertical',
    x: mountX,
    y: topY - holeSpacing / 2,
    diameter: HINGE_PARAMS.MOUNTING_PLATE.HOLE_DIAMETER,
    depth: 13,
    isThrough: false,
    face: 'A',
  });

  operations.push({
    id: 'hinge-mount-top-2',
    type: 'drill_vertical',
    x: mountX,
    y: topY + holeSpacing / 2,
    diameter: HINGE_PARAMS.MOUNTING_PLATE.HOLE_DIAMETER,
    depth: 13,
    isThrough: false,
    face: 'A',
  });

  // Bottom hinge mounting holes
  operations.push({
    id: 'hinge-mount-bottom-1',
    type: 'drill_vertical',
    x: mountX,
    y: bottomY - holeSpacing / 2,
    diameter: HINGE_PARAMS.MOUNTING_PLATE.HOLE_DIAMETER,
    depth: 13,
    isThrough: false,
    face: 'A',
  });

  operations.push({
    id: 'hinge-mount-bottom-2',
    type: 'drill_vertical',
    x: mountX,
    y: bottomY + holeSpacing / 2,
    diameter: HINGE_PARAMS.MOUNTING_PLATE.HOLE_DIAMETER,
    depth: 13,
    isThrough: false,
    face: 'A',
  });

  return operations;
}

// ============================================
// MINIFIX DRILLING PATTERNS
// ============================================

/**
 * Generate Minifix housing holes for horizontal panels (top/bottom/shelf)
 * These are the panels that receive the Minifix housing (cam lock)
 *
 * @param panelWidth - Panel width in mm
 * @param panelHeight - Panel height (depth into cabinet) in mm
 * @param coreThickness - Panel core thickness in mm
 * @param options - DXF export options with Minifix settings
 */
function generateMinifixHousingDrilling(
  panelWidth: number,
  panelHeight: number,
  coreThickness: number,
  options: CabinetDxfOptions
): DrillVerticalOp[] {
  const operations: DrillVerticalOp[] = [];

  // Get Minifix configuration
  const config = options.minifixHousing && options.minifixBolt
    ? { housing: options.minifixHousing, bolt: options.minifixBolt }
    : getRecommendedMinifixConfig(coreThickness, options.connectionType || 'standard');

  const housing = MINIFIX_HOUSINGS[config.housing];

  // Generate pattern for left and right edges
  const pattern = generateMinifixArrayPattern(
    panelHeight,        // Panel depth = edge length
    coreThickness,
    coreThickness,      // Assume side panels are same thickness
    config.housing,
    config.bolt,
    256,                // Standard 256mm (32mm × 8) spacing
    options.includeMinifixDowels ?? true
  );

  // Left edge housing holes (near Y=0)
  for (const hole of pattern.panelA.holes) {
    operations.push({
      id: `minifix-left-${hole.label || hole.purpose}`,
      type: 'drill_vertical',
      x: housing.edgeDistance,           // From left edge
      y: hole.x,                         // Position along depth
      diameter: hole.diameter,
      depth: hole.depth,
      isThrough: false,
      face: 'A',
    });
  }

  // Right edge housing holes (near Y=panelWidth)
  for (const hole of pattern.panelA.holes) {
    operations.push({
      id: `minifix-right-${hole.label || hole.purpose}`,
      type: 'drill_vertical',
      x: panelWidth - housing.edgeDistance,  // From right edge
      y: hole.x,                             // Position along depth
      diameter: hole.diameter,
      depth: hole.depth,
      isThrough: false,
      face: 'A',
    });
  }

  return operations;
}

/**
 * Generate Minifix bolt holes for vertical panels (side panels)
 * These are horizontal drilling operations on the panel edge
 *
 * @param panelWidth - Panel width (depth into cabinet) in mm
 * @param panelHeight - Panel height in mm
 * @param coreThickness - Panel core thickness in mm
 * @param options - DXF export options with Minifix settings
 * @param side - Which edge to drill ('top' or 'bottom' of side panel)
 */
function generateMinifixBoltDrilling(
  panelWidth: number,
  _panelHeight: number,
  coreThickness: number,
  options: CabinetDxfOptions,
  side: 'top' | 'bottom'
): DrillHorizontalOp[] {
  const operations: DrillHorizontalOp[] = [];

  // Get Minifix configuration
  const config = options.minifixHousing && options.minifixBolt
    ? { housing: options.minifixHousing, bolt: options.minifixBolt }
    : getRecommendedMinifixConfig(coreThickness, options.connectionType || 'standard');

  const housing = MINIFIX_HOUSINGS[config.housing];

  // Generate pattern
  const pattern = generateMinifixArrayPattern(
    panelWidth,         // Panel width = edge length
    coreThickness,
    coreThickness,
    config.housing,
    config.bolt,
    256,
    options.includeMinifixDowels ?? true
  );

  // Convert panel B holes (bolt holes) to horizontal drilling operations
  const edgeSide = side === 'top' ? 'top' : 'bottom';

  for (const hole of pattern.panelB.holes) {
    operations.push({
      id: `minifix-bolt-${edgeSide}-${hole.label || hole.purpose}`,
      type: 'drill_horizontal',
      side: edgeSide as 'top' | 'bottom' | 'left' | 'right',
      offset: hole.x,                           // Position along edge
      z_center: coreThickness / 2,              // Center of panel thickness
      diameter: hole.diameter,
      depth: hole.depth,
    });
  }

  // Log pattern info for debugging
  if (pattern.warnings.length > 0) {
    console.warn(`[Minifix] ${side} edge:`, pattern.warnings);
  }

  void housing; // Used for reference

  return operations;
}

// ============================================
// MAIN CONVERTER
// ============================================

/**
 * Convert CabinetPanel to PanelProductionData
 * Auto-generates drilling patterns based on panel role
 */
export function cabinetPanelToProduction(
  panel: CabinetPanel,
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): PanelProductionData {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const coreThickness = opts.coreThickness || 18;

  // Convert edges
  const edges: PanelProductionData['edges'] = {
    top: convertEdge(panel.edges.top),
    bottom: convertEdge(panel.edges.bottom),
    left: convertEdge(panel.edges.left),
    right: convertEdge(panel.edges.right),
  };

  // Start with empty operations
  const operations: MachineOperation[] = [];

  // Generate drilling patterns based on role
  switch (panel.role) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE': {
      // System 32 shelf pin holes
      if (opts.includeSystem32) {
        const sys32Ops = generateSystem32Drilling(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          cabinet.dimensions.toeKickHeight
        );
        operations.push(...sys32Ops);
      }

      // Back panel groove
      if (opts.includeBackGroove && cabinet.structure.hasBackPanel) {
        const grooveOp = generateBackPanelGroove(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          cabinet.manufacturing.backVoid,
          cabinet.manufacturing.backThickness,
          cabinet.manufacturing.grooveDepth
        );
        operations.push(grooveOp);
      }

      // Minifix bolt holes on top and bottom edges (for knockdown connection)
      if (opts.includeMinifix) {
        // Top edge - connects to top panel
        const topMinifixOps = generateMinifixBoltDrilling(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          opts,
          'top'
        );
        operations.push(...topMinifixOps);

        // Bottom edge - connects to bottom panel
        const bottomMinifixOps = generateMinifixBoltDrilling(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          opts,
          'bottom'
        );
        operations.push(...bottomMinifixOps);
      }

      // Hinge mounting holes (if cabinet has doors)
      // Cabinet.hardware?.hingeConfig would indicate door configuration when available.
      // For now, check if there's a FRONT panel in the cabinet (indicates doors present)
      // Future: Add Cabinet.compartments[] with door/drawer assignments per compartment
      if (opts.includeHingeCups) {
        const hasDoorPanel = cabinet.panels.some(p => p.role === 'FRONT' || p.role === 'DRAWER_FRONT');
        if (hasDoorPanel) {
          const hingeMountOps = _generateHingeMountingHoles(
            panel.computed.cutWidth,
            panel.computed.cutHeight,
            coreThickness,
            cabinet.dimensions.toeKickHeight
          );
          operations.push(...hingeMountOps);
        }
      }
      break;
    }

    case 'TOP':
    case 'BOTTOM': {
      // Minifix housing holes OR Confirmat holes (Minifix takes priority)
      if (opts.includeMinifix) {
        // Minifix housing holes on face for connecting to side panels
        const minifixHousingOps = generateMinifixHousingDrilling(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          opts
        );
        operations.push(...minifixHousingOps);
      } else if (opts.includeConfirmat) {
        // Traditional confirmat holes for joining to sides
        const isTop = panel.role === 'TOP';
        const confirmatOps = generateConfirmatHoles(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          isTop
        );
        operations.push(...confirmatOps);
      }

      // Back panel groove (for bottom panel)
      if (opts.includeBackGroove && cabinet.structure.hasBackPanel && panel.role === 'BOTTOM') {
        const grooveOp = generateBackPanelGroove(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          cabinet.manufacturing.backVoid,
          cabinet.manufacturing.backThickness,
          cabinet.manufacturing.grooveDepth
        );
        operations.push(grooveOp);
      }
      break;
    }

    case 'FRONT':
    case 'DRAWER_FRONT': {
      // Hinge cups for doors
      if (opts.includeHingeCups) {
        // Calculate hinge count based on door height
        // Rule: 1 hinge per 762mm (30") of door height, minimum 2
        const hingeCount = Math.max(2, Math.ceil(panel.finishHeight / 762));
        const hingeCupOps = generateHingeCups(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          hingeCount
        );
        operations.push(...hingeCupOps);
      }
      break;
    }

    case 'SHELF': {
      // Shelves typically have no drilling (adjustable)
      // Could add edge banding notches if needed
      break;
    }

    case 'BACK': {
      // Back panels usually have no drilling
      // Could add ventilation holes if needed
      break;
    }

    case 'DIVIDER': {
      // Dividers may need System 32 on both sides
      if (opts.includeSystem32) {
        const sys32Ops = generateSystem32Drilling(
          panel.computed.cutWidth,
          panel.computed.cutHeight,
          coreThickness,
          cabinet.dimensions.toeKickHeight
        );
        operations.push(...sys32Ops);
      }
      break;
    }

    default:
      // No drilling for unknown panel types
      break;
  }

  // Build production data
  const productionData: PanelProductionData = {
    id: panel.id,
    name: panel.name,
    partNumber: `${cabinet.name.substring(0, 4).toUpperCase()}-${panel.role}`,

    materialId: panel.coreMaterialId,
    surfaceIdA: panel.faces.faceA || undefined,
    surfaceIdB: panel.faces.faceB || undefined,
    grain: convertGrainDirection(panel.grainDirection),

    finishDim: {
      w: panel.finishWidth,
      h: panel.finishHeight,
      t: panel.computed.realThickness,
    },

    cutDim: {
      w: panel.computed.cutWidth,
      h: panel.computed.cutHeight,
      t: coreThickness,
    },

    edges,
    operations,
    quantity: 1,
    cabinetId: cabinet.id,
  };

  return productionData;
}

// ============================================
// BATCH CONVERSION
// ============================================

/**
 * Convert all panels from a cabinet to production data
 */
export function cabinetToProductionPanels(
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): PanelProductionData[] {
  return cabinet.panels.map(panel =>
    cabinetPanelToProduction(panel, cabinet, options)
  );
}

/**
 * Generate DXF for a single cabinet panel
 */
export function generateCabinetPanelDXF(
  panel: CabinetPanel,
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): string {
  const productionData = cabinetPanelToProduction(panel, cabinet, options);
  return generatePanelDXF(productionData, options);
}

/**
 * Generate all DXF files for a cabinet
 * Returns a Map of filename -> DXF content
 * Supports panel filtering via selectedPanelIds option
 */
export function generateCabinetDXFBundle(
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): Map<string, string> {
  const result = new Map<string, string>();

  // Filter panels if selectedPanelIds is provided
  let panelsToExport = cabinet.panels;
  if (options.selectedPanelIds && options.selectedPanelIds.length > 0) {
    const selectedSet = new Set(options.selectedPanelIds);
    panelsToExport = cabinet.panels.filter(p => selectedSet.has(p.id));
  }

  // Convert filtered panels to production data
  const productionPanels = panelsToExport.map(panel =>
    cabinetPanelToProduction(panel, cabinet, options)
  );

  productionPanels.forEach((panel, index) => {
    // Machine profile validation (optional)
    if (options.machineProfile) {
      const { maxWidth, maxHeight } = options.machineProfile;
      if (panel.cutDim.w > maxWidth || panel.cutDim.h > maxHeight) {
        console.warn(`[DXF] Panel ${panel.name} exceeds machine limits: ${panel.cutDim.w}x${panel.cutDim.h}mm > ${maxWidth}x${maxHeight}mm`);
      }
    }

    const dxfContent = generatePanelDXF(panel, options);
    const safeRole = panel.partNumber || `PANEL-${index}`;
    const filename = `${cabinet.name}_${safeRole}_${panel.cutDim.t}mm.dxf`;
    result.set(filename, dxfContent);

    // Progress callback
    if (options.onPanelProgress) {
      options.onPanelProgress(panel.id, panel.name, index, productionPanels.length);
    }
  });

  return result;
}

/**
 * Download all DXF files for a cabinet
 */
export function downloadCabinetDXF(
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): void {
  const dxfBundle = generateCabinetDXFBundle(cabinet, options);

  dxfBundle.forEach((content, filename) => {
    downloadDXF(content, filename);
  });
}

/**
 * Download all DXF files as a single ZIP
 * Requires JSZip library
 */
export async function downloadCabinetDXFZip(
  cabinet: Cabinet,
  options: CabinetDxfOptions = {}
): Promise<void> {
  // Dynamic import for JSZip (tree-shaking friendly)
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const dxfBundle = generateCabinetDXFBundle(cabinet, options);

  // Create folder for cabinet
  const folder = zip.folder(cabinet.name);
  if (!folder) {
    throw new Error('Failed to create ZIP folder');
  }

  // Add all DXF files
  dxfBundle.forEach((content, filename) => {
    folder.file(filename, content);
  });

  // Generate and download ZIP
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${cabinet.name}_DXF.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

