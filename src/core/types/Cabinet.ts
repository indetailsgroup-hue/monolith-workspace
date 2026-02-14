/**
 * Cabinet Types - Core Type Definitions for Parametric Cabinet System
 * 
 * ARCHITECTURE (North Star v4.0):
 * - This is the TRUTH LAYER - defines manufacturing reality
 * - All dimensions in millimeters (mm) - NO EXCEPTIONS
 * - Strict Types required - NO 'any' in Core Logic
 * 
 * LAYER SEPARATION:
 * - Truth: This file + OperationGraph (CAM data)
 * - Magic: 3D Visual rendering (Cabinet3D.tsx)
 */

// ============================================
// ENUMS & CONSTANTS
// ============================================

export type CabinetType = 'BASE' | 'WALL' | 'TALL' | 'DRAWER' | 'CORNER';

export type JointType = 'INSET' | 'OVERLAY';

export type PanelRole = 
  | 'LEFT_SIDE' 
  | 'RIGHT_SIDE' 
  | 'TOP' 
  | 'BOTTOM' 
  | 'BACK' 
  | 'SHELF' 
  | 'DIVIDER'
  | 'FRONT'
  | 'DRAWER_FRONT'
  | 'DRAWER_SIDE'
  | 'DRAWER_BACK'
  | 'DRAWER_BOTTOM';

export type GrainDirection = 'HORIZONTAL' | 'VERTICAL';

export type BackPanelConstruction = 'inset' | 'overlay';

// ============================================
// MATERIAL TYPES
// ============================================

export interface CoreMaterial {
  id: string;
  name: string;
  thickness: number;      // mm
  costPerSqm: number;     // THB
  co2PerSqm: number;      // kg CO2
}

export interface SurfaceMaterial {
  id: string;
  name: string;
  thickness: number;      // mm (HPL: 0.7-1.0, Veneer: 0.3-3.0)
  costPerSqm: number;
  co2PerSqm: number;
  color: string;          // Hex color for 3D preview
  textureUrl?: string;    // Base64 data URL or file path
}

export interface EdgeMaterial {
  id: string;
  name: string;
  code: string;           // e.g., 'PVC-W-1.0'
  thickness: number;      // mm (0.5 - 2.0)
  height: number;         // mm (tape height)
  costPerMeter: number;
  color: string;
}

// ============================================
// PANEL POSITION OVERRIDES (Per-Panel Config)
// ============================================

export interface PanelPositionOverrides {
  frontSetback: number;       // 0-50mm - distance from cabinet front
  backSetback: number;        // 0-100mm - distance from cabinet back (LED space)
  gapFromBelow: number | null; // null = auto-calculated, number = manual Y position offset
}

export const DEFAULT_POSITION_OVERRIDES: PanelPositionOverrides = {
  frontSetback: 20,
  backSetback: 28,
  gapFromBelow: null,
};

// ============================================
// PANEL TYPES
// ============================================

export interface PanelEdges {
  top: string | null;     // Edge material ID or null
  bottom: string | null;
  left: string | null;
  right: string | null;
}

export interface PanelFaces {
  faceA: string | null;   // Surface material ID (front/top)
  faceB: string | null;   // Surface material ID (back/bottom)
}

export interface PanelComputed {
  realThickness: number;  // T_real = core + surfA + surfB + glue
  cutWidth: number;       // Cut size = Finish - edges + preMill
  cutHeight: number;
  surfaceArea: number;    // m²
  edgeLength: number;     // meters
  cost: number;           // THB
  co2: number;            // kg CO2
}

export interface CabinetPanel {
  id: string;
  role: PanelRole;
  name: string;

  // Finish dimensions (after edge banding)
  finishWidth: number;    // mm
  finishHeight: number;   // mm

  // Material assignments
  coreMaterialId: string;
  faces: PanelFaces;
  edges: PanelEdges;
  grainDirection: GrainDirection;

  // Computed values (calculated from materials)
  computed: PanelComputed;

  // 3D positioning (Visual Layer only)
  position: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
  selected: boolean;

  // Per-panel position overrides (for shelves/dividers)
  positionOverrides?: PanelPositionOverrides;
  useCustomPosition?: boolean;
}

// ============================================
// CABINET STRUCTURE
// ============================================

export interface CabinetDimensions {
  width: number;          // W - Overall width (mm)
  height: number;         // H - Overall height (mm)
  depth: number;          // D - Overall depth (mm)
  toeKickHeight: number;  // Leg height for base cabinets (mm)
}

export interface CabinetStructure {
  topJoint: JointType;
  bottomJoint: JointType;
  hasBackPanel: boolean;
  backPanelInset: number; // Distance from back edge (mm)
  shelfCount: number;
  dividerCount: number;
  cornerAngles?: {
    topLeft?: number;
    topRight?: number;
    bottomLeft?: number;
    bottomRight?: number;
  };
}

export interface CabinetManufacturing {
  glueThickness: number;        // T_glue: 0.1 - 0.2 mm
  preMilling: number;           // P_mill: 0.5 - 1.0 mm per side
  grooveDepth: number;          // G_depth: 8 - 10 mm
  clearance: number;            // C: 1 - 2 mm
  shelfSetbackFront: number;    // F_setback: ~20 mm
  backPanelConstruction: BackPanelConstruction;
  backVoid: number;             // Back_void: 19-20 mm
  backThickness: number;        // Back_thk: 6 or 9 mm
  safetyGap: number;            // Gap_safety: 1-2 mm
}

export interface CabinetMaterials {
  defaultCore: string;
  defaultSurface: string;
  defaultEdge: string;
  overrides: Map<string, string>;  // Panel ID -> Material ID
}

export interface CabinetComputed {
  totalCost: number;
  totalCO2: number;
  panelCount: number;
  totalSurfaceArea: number;
  totalEdgeLength: number;
}

// ============================================
// MAIN CABINET TYPE
// ============================================

export interface Cabinet {
  id: string;
  name: string;
  type: CabinetType;
  
  // Configuration
  dimensions: CabinetDimensions;
  structure: CabinetStructure;
  materials: CabinetMaterials;
  manufacturing: CabinetManufacturing;
  
  // Generated panels
  panels: CabinetPanel[];
  
  // Computed totals
  computed: CabinetComputed;

  // Hardware configuration
  hardware?: {
    minifixConfig?: Record<string, unknown>;
    [key: string]: unknown;
  };

  // Metadata
  createdAt: number;
  updatedAt: number;
}

// ============================================
// DEFAULTS
// ============================================

export const DEFAULT_DIMENSIONS: CabinetDimensions = {
  width: 600,
  height: 720,
  depth: 560,
  toeKickHeight: 100,
};

export const DEFAULT_STRUCTURE: CabinetStructure = {
  topJoint: 'INSET',
  bottomJoint: 'INSET',
  hasBackPanel: true,
  backPanelInset: 6,
  shelfCount: 1,
  dividerCount: 0,
};

export const DEFAULT_MANUFACTURING: CabinetManufacturing = {
  glueThickness: 0.1,
  preMilling: 0.5,
  grooveDepth: 8,
  clearance: 2,
  shelfSetbackFront: 20,
  backPanelConstruction: 'inset',
  backVoid: 20,
  backThickness: 6,
  safetyGap: 2,
};

// ============================================
// CALCULATION FUNCTIONS (Truth Layer)
// ============================================

/**
 * Calculate real thickness including surface materials and glue
 * 
 * Formula: T_real = T_core + T_surfA + T_surfB + (T_glue × 2)
 * 
 * Note: Glue is applied on BOTH sides of core (surfA-core and core-surfB)
 * So we multiply glue thickness by 2
 * 
 * @param coreThickness - Core material thickness (mm)
 * @param surfaceA - Surface A thickness (mm) - typically front face
 * @param surfaceB - Surface B thickness (mm) - typically back face
 * @param glueThicknessPerLayer - Glue layer thickness PER SIDE (mm), default 0.1
 * @returns Real thickness in mm
 * 
 * @example
 * // HMR 18mm + HPL 0.8mm both sides + glue 0.1mm per layer
 * calculateRealThickness(18, 0.8, 0.8, 0.1)
 * // Returns: 18 + 0.8 + 0.8 + (0.1 × 2) = 19.8mm
 */
export function calculateRealThickness(
  coreThickness: number,
  surfaceA: number,
  surfaceB: number,
  glueThicknessPerLayer: number = 0.1
): number {
  // Glue on both interfaces: surfA↔core and core↔surfB
  const totalGlue = glueThicknessPerLayer * 2;
  return coreThickness + surfaceA + surfaceB + totalGlue;
}

/**
 * Calculate cut size from finish size
 * 
 * Formula: CutSize = FinishSize - (E1 + E2) + preMill_per_edged_side
 * 
 * Pre-milling is ONLY applied to sides that have edge banding!
 * This is because the edge bander needs material to trim before applying tape.
 * 
 * @param finishSize - Finish dimension after edge banding (mm)
 * @param edge1 - Edge thickness side 1 (mm), 0 if no edge
 * @param edge2 - Edge thickness side 2 (mm), 0 if no edge
 * @param preMillPerSide - Pre-milling allowance PER SIDE that has edge (mm), default 0.5
 * @returns Cut size in mm
 * 
 * @example
 * // Panel 600mm finish, 1mm edge both sides, 0.5mm preMill
 * calculateCutSize(600, 1, 1, 0.5)
 * // Returns: 600 - (1+1) + (0.5+0.5) = 599mm
 * 
 * @example
 * // Panel 600mm finish, 1mm edge LEFT only
 * calculateCutSize(600, 1, 0, 0.5)
 * // Returns: 600 - (1+0) + (0.5+0) = 599.5mm
 */
export function calculateCutSize(
  finishSize: number,
  edge1: number,
  edge2: number,
  preMillPerSide: number = 0.5
): number {
  // Subtract edge thicknesses
  let cutSize = finishSize - (edge1 + edge2);
  
  // Add pre-milling ONLY for sides that have edge banding
  if (edge1 > 0) cutSize += preMillPerSide;
  if (edge2 > 0) cutSize += preMillPerSide;
  
  return cutSize;
}

/**
 * Generate unique ID for panels
 */
export function createId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// SPEC STATE (Gate System)
// ============================================

export type SpecState = 'DRAFT' | 'VALIDATED' | 'APPROVED' | 'LOCKED';

export interface GateStatus {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate cabinet for export
 * RULE: Export is GATED - Block if specState == DRAFT or gate.ok != true
 */
export function validateForExport(cabinet: Cabinet): GateStatus {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check dimensions
  if (cabinet.dimensions.width <= 0) {
    errors.push('Width must be greater than 0');
  }
  if (cabinet.dimensions.height <= 0) {
    errors.push('Height must be greater than 0');
  }
  if (cabinet.dimensions.depth <= 0) {
    errors.push('Depth must be greater than 0');
  }
  
  // Check panels
  if (cabinet.panels.length === 0) {
    errors.push('Cabinet has no panels');
  }
  
  // Check for negative computed values
  for (const panel of cabinet.panels) {
    if (panel.computed.cutWidth <= 0) {
      errors.push(`Panel "${panel.name}" has invalid cut width`);
    }
    if (panel.computed.cutHeight <= 0) {
      errors.push(`Panel "${panel.name}" has invalid cut height`);
    }
  }
  
  // Warnings
  if (cabinet.structure.shelfCount > 5) {
    warnings.push('High shelf count may affect structural integrity');
  }
  
  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
