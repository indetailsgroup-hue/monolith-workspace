/**
 * Production Types - Manufacturing Data Structures
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Define machine operations (CNC drilling, routing, sawing)
 * - Support Face A (inner/visible) and Face B (outer/back)
 * - Include mirror logic for Face B operations
 * 
 * LAYER NAMING CONVENTION:
 * - CUT_OUT: Panel outline
 * - DRILL_V_{diameter}_D{depth}: Vertical drilling
 * - DRILL_H_{diameter}_Z{z_center}_D{depth}: Horizontal drilling
 * - SAW_GROOVE_D{depth}: Routing/grooving
 * - POCKET_{depth}: Pocket milling
 */

// ============================================
// BASIC TYPES
// ============================================

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Face = 'A' | 'B'; // A=หน้าสวย (ในตู้/visible), B=หน้าหลัง (นอกตู้/hidden)
export type GrainDirection = 'vertical' | 'horizontal' | 'none';

// ============================================
// EDGE DETAIL
// ============================================

export interface EdgeDetail {
  thickness: number;      // mm (0.4, 0.5, 1.0, 2.0)
  materialCode: string;   // e.g., 'PVC-W-1.0', 'ABS-OAK-1.0'
  height?: number;        // mm (default 23mm for standard tape)
}

// ============================================
// MACHINE OPERATIONS
// ============================================

/**
 * Base operation interface
 */
interface BaseOperation {
  id: string;
  layerName?: string;      // Custom layer name override
  comment?: string;        // Human-readable description
}

/**
 * Vertical Drilling (เจาะแนวตั้ง)
 * - Drill perpendicular to panel face
 * - Used for: shelf pins, cam locks, dowels
 */
export interface DrillVerticalOp extends BaseOperation {
  type: 'drill_vertical';
  x: number;              // X position from panel origin (mm)
  y: number;              // Y position from panel origin (mm)
  diameter: number;       // Drill bit diameter (mm): 3, 5, 8, 10, 15, 35
  depth: number;          // Drilling depth (mm)
  isThrough: boolean;     // Does it go through the panel?
  face: Face;             // Which face to drill from
}

/**
 * Horizontal Drilling (เจาะแนวนอน)
 * - Drill into panel edge
 * - Used for: confirmat screws, shelf pins (edge mount), dowels
 */
export interface DrillHorizontalOp extends BaseOperation {
  type: 'drill_horizontal';
  side: Side;             // Which edge to drill into
  offset: number;         // Distance from edge corner (mm)
  z_center: number;       // Depth center from face A (mm) - typically thickness/2
  diameter: number;       // Drill bit diameter (mm)
  depth: number;          // Drilling depth (mm)
}

/**
 * Groove/Dado (เซาะร่อง)
 * - Linear routing for back panels, dividers
 * - Used for: back panel groove, shelf dados
 */
export interface GrooveOp extends BaseOperation {
  type: 'groove';
  face: Face;             // Which face to route from
  axis: 'x' | 'y';        // Groove direction
  position: number;       // Position perpendicular to axis (mm)
  start: number;          // Start position along axis (mm)
  length: number;         // Groove length (mm)
  width: number;          // Router bit width (mm): 3, 4, 6, 8
  depth: number;          // Groove depth (mm): typically 8-10
}

/**
 * Pocket Milling (กัดเป็นช่อง)
 * - Rectangular pocket for hardware mounting
 * - Used for: hinge cups, drawer slide mounts
 */
export interface PocketOp extends BaseOperation {
  type: 'pocket';
  face: Face;
  x: number;              // Center X (mm)
  y: number;              // Center Y (mm)
  width: number;          // Pocket width (mm)
  height: number;         // Pocket height (mm)
  depth: number;          // Pocket depth (mm)
  cornerRadius?: number;  // Corner radius (mm), default 0
}

/**
 * Contour Cut (ตัดตามเส้น)
 * - Profile cutting for shaped panels
 * - Used for: arched doors, curved shelves
 */
export interface ContourOp extends BaseOperation {
  type: 'contour';
  face: Face;
  points: Array<{ x: number; y: number }>;  // Path points
  depth: number;          // Cut depth (typically thickness + 1)
  toolDiameter: number;   // End mill diameter (mm)
}

/**
 * Hinge Cup (เจาะถ้วยบานพับ)
 * - Standard 35mm cup hole for concealed hinges
 */
export interface HingeCupOp extends BaseOperation {
  type: 'hinge_cup';
  face: Face;
  x: number;              // Center X (mm)
  y: number;              // Center Y (mm)
  diameter: number;       // Cup diameter (mm): typically 35
  depth: number;          // Cup depth (mm): typically 12-13
}

/**
 * Union type for all machine operations
 */
export type MachineOperation = 
  | DrillVerticalOp 
  | DrillHorizontalOp 
  | GrooveOp 
  | PocketOp 
  | ContourOp
  | HingeCupOp;

// ============================================
// PANEL DATA (Production Ready)
// ============================================

export interface PanelProductionData {
  // Identity
  id: string;
  name: string;
  partNumber?: string;    // e.g., 'BC-001-L' (Base Cabinet 001, Left Side)
  
  // Material
  materialId: string;     // Reference to core material
  surfaceIdA?: string;    // Face A surface material
  surfaceIdB?: string;    // Face B surface material
  grain: GrainDirection;
  
  // Dimensions
  finishDim: {
    w: number;            // Finish width (mm)
    h: number;            // Finish height (mm)
    t: number;            // Total thickness including surfaces (mm)
  };
  
  cutDim: {
    w: number;            // Cut width (after edge deduction) (mm)
    h: number;            // Cut height (after edge deduction) (mm)
    t: number;            // Core thickness (mm)
  };
  
  // Edge Banding
  edges: {
    top?: EdgeDetail;
    bottom?: EdgeDetail;
    left?: EdgeDetail;
    right?: EdgeDetail;
  };
  
  // Machine Operations
  operations: MachineOperation[];
  
  // Metadata
  quantity: number;
  notes?: string;
  cabinetId?: string;     // Parent cabinet reference
}

// ============================================
// LAYER CONFIGURATION
// ============================================

export const LAYER_CONFIG = {
  // Cutting
  OUTLINE: 'CUT_OUT',
  CONTOUR: 'CUT_CONTOUR',

  // Vertical Drilling (prefix + diameter + depth)
  DRILL_V_PREFIX: 'DRILL_V_',

  // Horizontal Drilling (prefix + diameter + z_center + depth)
  DRILL_H_PREFIX: 'DRILL_H_',

  // Grooving/Routing
  SAW_GROOVE: 'SAW_GROOVE',
  POCKET: 'POCKET',

  // Special
  HINGE_CUP: 'HINGE_CUP_35',

  // Edge Banding (non-cutting, indicates where edge tape is applied)
  EDGE_BAND: 'EDGE_BAND',

  // Annotations (non-cutting)
  ANNOTATION: 'ANNOTATION',
  DIMENSION: 'DIMENSION',
};

// ============================================
// STANDARD OPERATIONS LIBRARY
// ============================================

/**
 * Create layer name for vertical drill
 */
export const getVerticalDrillLayer = (diameter: number, depth: number, isThrough: boolean): string => {
  const actualDepth = isThrough ? depth + 1 : depth;
  return `${LAYER_CONFIG.DRILL_V_PREFIX}${diameter}_D${actualDepth}`;
};

/**
 * Create layer name for horizontal drill
 */
export const getHorizontalDrillLayer = (diameter: number, zCenter: number, depth: number): string => {
  return `${LAYER_CONFIG.DRILL_H_PREFIX}${diameter}_Z${zCenter}_D${depth}`;
};

/**
 * Create layer name for groove
 */
export const getGrooveLayer = (depth: number): string => {
  return `${LAYER_CONFIG.SAW_GROOVE}_D${depth}`;
};

// ============================================
// COMMON DRILLING PATTERNS
// ============================================

/**
 * System 32 drilling pattern
 * Standard hole spacing for adjustable shelves
 */
export const SYSTEM_32 = {
  HOLE_SPACING: 32,       // mm between holes
  HOLE_DIAMETER: 5,       // mm
  HOLE_DEPTH: 13,         // mm
  EDGE_OFFSET_FRONT: 50,  // mm from front edge
  EDGE_OFFSET_BACK: 50,   // mm from back edge
  START_HEIGHT: 64,       // mm from bottom (2 × 32)
};

/**
 * Confirmat screw pattern
 */
export const CONFIRMAT = {
  PILOT_DIAMETER: 5,      // mm (edge hole)
  CLEARANCE_DIAMETER: 8,  // mm (face hole)
  EDGE_DEPTH: 50,         // mm
  FACE_DEPTH: 13,         // mm (countersink)
  EDGE_OFFSET: 37,        // mm from edge
};

/**
 * Dowel pattern
 */
export const DOWEL = {
  DIAMETER: 8,            // mm
  DEPTH: 12,              // mm
  SPACING: 64,            // mm (2 × System 32)
};

// ============================================
// HINGE PARAMETERS (Salice/Blum compatible)
// ============================================

export const HINGE_PARAMS = {
  CUP_DIAMETER: 35,       // mm
  CUP_DEPTH: 13,          // mm
  EDGE_OFFSET: 3,         // mm from door edge to cup edge (K value)
  MOUNTING_PLATE: {
    HOLE_SPACING: 32,     // mm between mounting holes
    HOLE_DIAMETER: 5,     // mm
    EDGE_OFFSET: 37,      // mm from panel edge
  },
};

// ============================================
// DRAWER SLIDE PARAMETERS
// ============================================

export const DRAWER_SLIDE = {
  UNDERMOUNT: {
    SIDE_GAP: 20.5,       // mm per side (41mm total deduction)
    SLIDE_OFFSET_Y: 37,   // mm from bottom of cabinet
    MOUNTING_HOLES: {
      DIAMETER: 5,
      DEPTH: 13,
    },
  },
  SIDE_MOUNT: {
    SIDE_GAP: 12.5,       // mm per side (25mm total)
    SLIDE_HEIGHT: 45,     // mm standard height
  },
};
