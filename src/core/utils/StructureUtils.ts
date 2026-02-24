/**
 * Structure Utils - Calculation Engine
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Panel dimension calculations
 * - System 32 hole generation
 * - Shelf positioning with setbacks
 * - Edge banding deductions
 * 
 * FORMULAS:
 * - Cut = Finish - Edge Thicknesses
 * - Shelf Depth = Cabinet Depth - Front Setback - Back Setback
 * - Real Thickness = Core + (Surface × 2) + (Glue × 2)
 */

import { 
  EdgeDetail, 
  MachineOperation, 
  DrillVerticalOp,
  DrillHorizontalOp,
  GrooveOp,
  SYSTEM_32,
  CONFIRMAT,
  DOWEL,
  getVerticalDrillLayer,
  getHorizontalDrillLayer,
  getGrooveLayer,
} from '../types/Production';

// ============================================
// DIMENSION CALCULATIONS
// ============================================

/**
 * Calculate cut dimensions from finish dimensions
 * Cut size = Finish size - Edge thicknesses
 */
export const calculateCutDim = (
  finishW: number,
  finishH: number,
  finishT: number,
  edges: {
    top?: EdgeDetail;
    bottom?: EdgeDetail;
    left?: EdgeDetail;
    right?: EdgeDetail;
  }
): { w: number; h: number; t: number } => {
  const t_left = edges.left?.thickness || 0;
  const t_right = edges.right?.thickness || 0;
  const t_top = edges.top?.thickness || 0;
  const t_btm = edges.bottom?.thickness || 0;

  return {
    w: finishW - t_left - t_right,
    h: finishH - t_top - t_btm,
    t: finishT,
  };
};

/**
 * Calculate finish dimensions from cut dimensions
 * Finish size = Cut size + Edge thicknesses
 */
export const calculateFinishDim = (
  cutW: number,
  cutH: number,
  cutT: number,
  edges: {
    top?: EdgeDetail;
    bottom?: EdgeDetail;
    left?: EdgeDetail;
    right?: EdgeDetail;
  }
): { w: number; h: number; t: number } => {
  const t_left = edges.left?.thickness || 0;
  const t_right = edges.right?.thickness || 0;
  const t_top = edges.top?.thickness || 0;
  const t_btm = edges.bottom?.thickness || 0;

  return {
    w: cutW + t_left + t_right,
    h: cutH + t_top + t_btm,
    t: cutT,
  };
};

/**
 * Calculate real panel thickness
 * Real = Core + (Surface A × 1) + (Surface B × 1) + (Glue × 2)
 */
export const calculateRealThickness = (
  coreThickness: number,
  surfaceAThickness: number = 0,
  surfaceBThickness: number = 0,
  glueThickness: number = 0.1
): number => {
  return coreThickness + surfaceAThickness + surfaceBThickness + (glueThickness * 2);
};

// ============================================
// SHELF CALCULATIONS
// ============================================

/**
 * Calculate shelf dimensions with setbacks
 */
export const calculateShelfSize = (
  cabinetInnerDepth: number,
  cabinetInnerWidth: number,
  setbacks: {
    front: number;      // Front setback (door clearance)
    back: number;       // Back setback (LED strip, ventilation)
    sideGap: number;    // Gap from each side
  }
): { w: number; d: number } => {
  return {
    w: cabinetInnerWidth - (setbacks.sideGap * 2),
    d: cabinetInnerDepth - setbacks.front - setbacks.back,
  };
};

/**
 * Calculate shelf depth with back panel consideration
 */
export const calculateShelfDepthWithBack = (
  cabinetDepth: number,
  panelThickness: number,
  backPanelConfig: {
    type: 'inset' | 'overlay';
    thickness: number;
    grooveDepth?: number;   // For inset back
    voidBehind?: number;    // Space behind back panel
  },
  setbacks: {
    front: number;
    back: number;           // Additional back setback
  }
): number => {
  let effectiveDepth = cabinetDepth;
  
  if (backPanelConfig.type === 'inset') {
    // Inset back: shelf goes into groove area
    effectiveDepth = cabinetDepth - (backPanelConfig.voidBehind || 0);
  } else {
    // Overlay back: shelf stops at back panel
    effectiveDepth = cabinetDepth - backPanelConfig.thickness;
  }
  
  return effectiveDepth - setbacks.front - setbacks.back;
};

/**
 * Calculate vertical shelf positions
 * Distributes shelves evenly or at specific heights
 */
export const calculateShelfPositions = (
  cabinetInnerHeight: number,
  shelfCount: number,
  options?: {
    bottomClearance?: number;   // Min distance from bottom
    topClearance?: number;      // Min distance from top
    equalSpacing?: boolean;     // Distribute evenly
    customPositions?: number[]; // Override with specific positions
  }
): number[] => {
  if (options?.customPositions) {
    return options.customPositions;
  }
  
  const bottomClear = options?.bottomClearance || 100;
  const topClear = options?.topClearance || 100;
  
  if (shelfCount === 0) return [];
  if (shelfCount === 1) {
    return [cabinetInnerHeight / 2];
  }
  
  const availableHeight = cabinetInnerHeight - bottomClear - topClear;
  const spacing = availableHeight / (shelfCount + 1);
  
  const positions: number[] = [];
  for (let i = 1; i <= shelfCount; i++) {
    positions.push(bottomClear + (spacing * i));
  }
  
  return positions;
};

// ============================================
// SYSTEM 32 HOLE GENERATION
// ============================================

/**
 * Generate System 32 shelf pin holes for a side panel
 */
export const generateSystem32Holes = (
  panelHeight: number,
  panelDepth: number,
  options?: {
    startY?: number;        // First hole Y position
    endY?: number;          // Last hole Y position
    frontX?: number;        // Front row X position
    backX?: number;         // Back row X position
    holeDiameter?: number;
    holeDepth?: number;
    face?: 'A' | 'B';
  }
): DrillVerticalOp[] => {
  const startY = options?.startY || SYSTEM_32.START_HEIGHT;
  const endY = options?.endY || (panelHeight - SYSTEM_32.START_HEIGHT);
  const frontX = options?.frontX || SYSTEM_32.EDGE_OFFSET_FRONT;
  const backX = options?.backX || (panelDepth - SYSTEM_32.EDGE_OFFSET_BACK);
  const diameter = options?.holeDiameter || SYSTEM_32.HOLE_DIAMETER;
  const depth = options?.holeDepth || SYSTEM_32.HOLE_DEPTH;
  const face = options?.face || 'A';
  
  const holes: DrillVerticalOp[] = [];
  let holeIndex = 0;
  
  for (let y = startY; y <= endY; y += SYSTEM_32.HOLE_SPACING) {
    // Front hole
    holes.push({
      id: `sys32_f_${holeIndex}`,
      type: 'drill_vertical',
      x: frontX,
      y: y,
      diameter: diameter,
      depth: depth,
      isThrough: false,
      face: face,
      layerName: getVerticalDrillLayer(diameter, depth, false),
    });
    
    // Back hole
    holes.push({
      id: `sys32_b_${holeIndex}`,
      type: 'drill_vertical',
      x: backX,
      y: y,
      diameter: diameter,
      depth: depth,
      isThrough: false,
      face: face,
      layerName: getVerticalDrillLayer(diameter, depth, false),
    });
    
    holeIndex++;
  }
  
  return holes;
};

/**
 * Generate shelf pin holes at specific Y positions only
 */
export const generateShelfPinHolesAtPositions = (
  positions: number[],
  panelDepth: number,
  face: 'A' | 'B' = 'A'
): DrillVerticalOp[] => {
  const frontX = SYSTEM_32.EDGE_OFFSET_FRONT;
  const backX = panelDepth - SYSTEM_32.EDGE_OFFSET_BACK;
  const holes: DrillVerticalOp[] = [];
  
  positions.forEach((y, index) => {
    holes.push({
      id: `pin_f_${index}`,
      type: 'drill_vertical',
      x: frontX,
      y: y,
      diameter: SYSTEM_32.HOLE_DIAMETER,
      depth: SYSTEM_32.HOLE_DEPTH,
      isThrough: false,
      face: face,
      layerName: getVerticalDrillLayer(SYSTEM_32.HOLE_DIAMETER, SYSTEM_32.HOLE_DEPTH, false),
    });
    
    holes.push({
      id: `pin_b_${index}`,
      type: 'drill_vertical',
      x: backX,
      y: y,
      diameter: SYSTEM_32.HOLE_DIAMETER,
      depth: SYSTEM_32.HOLE_DEPTH,
      isThrough: false,
      face: face,
      layerName: getVerticalDrillLayer(SYSTEM_32.HOLE_DIAMETER, SYSTEM_32.HOLE_DEPTH, false),
    });
  });
  
  return holes;
};

// ============================================
// CONFIRMAT SCREW HOLES
// ============================================

/**
 * Generate confirmat holes for panel-to-panel connection
 */
export const generateConfirmatHoles = (
  panelHeight: number,
  panelThickness: number,
  connectionType: 'face_to_edge' | 'edge_to_face',
  face: 'A' | 'B' = 'A'
): MachineOperation[] => {
  const operations: MachineOperation[] = [];
  
  // Determine hole positions based on panel height
  let positions: number[];
  if (panelHeight < 300) {
    positions = [panelHeight * 0.25, panelHeight * 0.75];
  } else if (panelHeight < 800) {
    positions = [50, panelHeight - 50];
  } else {
    positions = [50, panelHeight / 2, panelHeight - 50];
  }
  
  positions.forEach((y, index) => {
    if (connectionType === 'face_to_edge') {
      // Through hole on face (8mm clearance)
      operations.push({
        id: `conf_face_${index}`,
        type: 'drill_vertical',
        x: CONFIRMAT.EDGE_OFFSET,
        y: y,
        diameter: CONFIRMAT.CLEARANCE_DIAMETER,
        depth: panelThickness + 1,
        isThrough: true,
        face: face,
        layerName: getVerticalDrillLayer(CONFIRMAT.CLEARANCE_DIAMETER, panelThickness + 1, true),
      });
    } else {
      // Pilot hole on edge (5mm)
      operations.push({
        id: `conf_edge_${index}`,
        type: 'drill_horizontal',
        side: 'left',  // Will be adjusted based on actual connection
        offset: y,
        z_center: panelThickness / 2,
        diameter: CONFIRMAT.PILOT_DIAMETER,
        depth: CONFIRMAT.EDGE_DEPTH,
        layerName: getHorizontalDrillLayer(CONFIRMAT.PILOT_DIAMETER, panelThickness / 2, CONFIRMAT.EDGE_DEPTH),
      });
    }
  });
  
  return operations;
};

// ============================================
// BACK PANEL GROOVE
// ============================================

/**
 * Generate groove for inset back panel
 */
export const generateBackPanelGroove = (
  panelWidth: number,
  panelHeight: number,
  grooveConfig: {
    width: number;        // Groove width (matches back panel thickness)
    depth: number;        // Groove depth
    offset: number;       // Distance from back edge
  },
  face: 'A' | 'B' = 'B'
): GrooveOp => {
  return {
    id: 'back_groove',
    type: 'groove',
    face: face,
    axis: 'y',            // Vertical groove
    position: grooveConfig.offset,  // X position from edge
    start: 0,
    length: panelHeight,
    width: grooveConfig.width,
    depth: grooveConfig.depth,
    layerName: getGrooveLayer(grooveConfig.depth),
  };
};

/**
 * Generate grooves on all 4 panels for back panel
 * Returns operations for Left, Right, Top, Bottom panels
 */
export const generateBackPanelGrooves = (
  leftPanelHeight: number,
  rightPanelHeight: number,
  topPanelWidth: number,
  bottomPanelWidth: number,
  grooveConfig: {
    width: number;
    depth: number;
    offset: number;
  }
): {
  left: GrooveOp;
  right: GrooveOp;
  top: GrooveOp;
  bottom: GrooveOp;
} => {
  return {
    left: {
      id: 'back_groove_left',
      type: 'groove',
      face: 'B',
      axis: 'y',
      position: grooveConfig.offset,
      start: 0,
      length: leftPanelHeight,
      width: grooveConfig.width,
      depth: grooveConfig.depth,
      layerName: getGrooveLayer(grooveConfig.depth),
    },
    right: {
      id: 'back_groove_right',
      type: 'groove',
      face: 'B',
      axis: 'y',
      position: grooveConfig.offset,
      start: 0,
      length: rightPanelHeight,
      width: grooveConfig.width,
      depth: grooveConfig.depth,
      layerName: getGrooveLayer(grooveConfig.depth),
    },
    top: {
      id: 'back_groove_top',
      type: 'groove',
      face: 'B',
      axis: 'x',
      position: grooveConfig.offset,
      start: 0,
      length: topPanelWidth,
      width: grooveConfig.width,
      depth: grooveConfig.depth,
      layerName: getGrooveLayer(grooveConfig.depth),
    },
    bottom: {
      id: 'back_groove_bottom',
      type: 'groove',
      face: 'B',
      axis: 'x',
      position: grooveConfig.offset,
      start: 0,
      length: bottomPanelWidth,
      width: grooveConfig.width,
      depth: grooveConfig.depth,
      layerName: getGrooveLayer(grooveConfig.depth),
    },
  };
};

// ============================================
// DOWEL HOLES
// ============================================

/**
 * Generate dowel holes for panel connection
 */
export const generateDowelHoles = (
  panelHeight: number,
  panelThickness: number,
  connectionSide: 'left' | 'right' | 'top' | 'bottom',
  face: 'A' | 'B' = 'A'
): MachineOperation[] => {
  const operations: MachineOperation[] = [];
  
  // Standard dowel positions
  const positions = [DOWEL.SPACING, panelHeight - DOWEL.SPACING];
  
  // Add middle dowel for tall panels
  if (panelHeight > 600) {
    positions.splice(1, 0, panelHeight / 2);
  }
  
  positions.forEach((pos, index) => {
    // Face hole
    operations.push({
      id: `dowel_face_${index}`,
      type: 'drill_vertical',
      x: connectionSide === 'left' ? DOWEL.SPACING : (panelThickness - DOWEL.SPACING),
      y: pos,
      diameter: DOWEL.DIAMETER,
      depth: DOWEL.DEPTH,
      isThrough: false,
      face: face,
      layerName: getVerticalDrillLayer(DOWEL.DIAMETER, DOWEL.DEPTH, false),
    });
    
    // Edge hole (horizontal)
    operations.push({
      id: `dowel_edge_${index}`,
      type: 'drill_horizontal',
      side: connectionSide,
      offset: pos,
      z_center: panelThickness / 2,
      diameter: DOWEL.DIAMETER,
      depth: DOWEL.DEPTH,
      layerName: getHorizontalDrillLayer(DOWEL.DIAMETER, panelThickness / 2, DOWEL.DEPTH),
    });
  });
  
  return operations;
};

// ============================================
// DIVIDER CALCULATIONS
// ============================================

/**
 * Calculate divider positions (evenly distributed)
 */
export const calculateDividerPositions = (
  cabinetInnerWidth: number,
  dividerCount: number
): number[] => {
  if (dividerCount === 0) return [];
  
  const spacing = cabinetInnerWidth / (dividerCount + 1);
  const positions: number[] = [];
  
  for (let i = 1; i <= dividerCount; i++) {
    positions.push(spacing * i);
  }
  
  return positions;
};

/**
 * Calculate divider depth (same logic as shelf)
 */
export const calculateDividerDepth = (
  cabinetDepth: number,
  setbacks: {
    front: number;
    back: number;
  }
): number => {
  return cabinetDepth - setbacks.front - setbacks.back;
};
