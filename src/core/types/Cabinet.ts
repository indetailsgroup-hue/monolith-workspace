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
  | 'KICKBOARD'      // Recessed plinth closing the toe-kick void (บังตีนตู้)
  | 'WORKTOP'        // Horizontal slab spanning a cabinet run
  | 'FRONT'
  | 'DRAWER_FRONT'
  | 'DRAWER_SIDE'
  | 'DRAWER_BACK'
  | 'DRAWER_BOTTOM'
  | 'DOOR'
  | 'DOOR_LEFT'
  | 'DOOR_RIGHT';

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
  realThickness: number;  // T_real = core + surfA + surfB (no glue in display)
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
// DRAWER CONFIGURATION
// ============================================

export type DrawerSlideType = 'undermount' | 'side_mount';

export type DrawerHandleType = 'pull' | 'knob' | 'j-pull' | 'none';

export type DrawerHandlePosition = 'center' | 'top' | 'bottom';

/**
 * Configuration for a single drawer row.
 * Multiple rows stack vertically from cabinet bottom.
 */
export interface DrawerRowConfig {
  /** Unique identifier for this drawer row */
  id: string;
  /** Front panel height (visible face) in mm - typically 80-300mm */
  frontHeight: number;
  /** Internal box height in mm - auto-calculated if not specified */
  boxHeight?: number;
  /** Gap between this drawer and the row below in mm - typically 3-5mm */
  gapAbove: number;
  /** Slide system ID (e.g., 'metropush', 'blum_tandem') */
  slideSystemId: string;
  /** Handle configuration */
  handleConfig?: {
    type: DrawerHandleType;
    position: DrawerHandlePosition;
    offsetY?: number;
  };
}

/**
 * Materials for drawer box construction.
 * Typically thinner than cabinet structure panels.
 */
export interface DrawerBoxMaterials {
  /** Side panel thickness (mm) - typically 12mm */
  sideThickness: number;
  /** Back panel thickness (mm) - typically 12mm */
  backThickness: number;
  /** Bottom panel thickness (mm) - typically 6-9mm */
  bottomThickness: number;
  /** Core material ID for side/back panels */
  sideCore: string;
  /** Core material ID for bottom panel */
  bottomCore: string;
}

/**
 * Main drawer configuration for a cabinet.
 * Supports multiple drawer rows with different heights.
 */
export interface DrawerConfig {
  /** Whether drawer system is enabled */
  hasDrawers: boolean;
  /** Array of drawer rows from bottom to top */
  rows: DrawerRowConfig[];
  /** Slide mounting type - affects clearances */
  slideType: DrawerSlideType;
  /** Materials for drawer box construction */
  boxMaterials: DrawerBoxMaterials;
  /** Front panel overlay beyond cabinet opening (mm) */
  frontOverlay?: number;
}

/**
 * Default drawer box materials.
 */
export const DEFAULT_DRAWER_BOX_MATERIALS: DrawerBoxMaterials = {
  sideThickness: 12,
  backThickness: 12,
  bottomThickness: 6,
  sideCore: 'core-ply-18',  // Using available plywood
  bottomCore: 'core-mdf-6',
};

/**
 * Default drawer configuration.
 */
export const DEFAULT_DRAWER_CONFIG: DrawerConfig = {
  hasDrawers: false,
  rows: [],
  slideType: 'undermount',
  boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
  frontOverlay: 18,
};

/**
 * Default drawer row configuration.
 */
export const DEFAULT_DRAWER_ROW: Omit<DrawerRowConfig, 'id'> = {
  frontHeight: 140,
  gapAbove: 3,
  slideSystemId: 'metropush',
  handleConfig: {
    type: 'pull',
    position: 'center',
  },
};

// ============================================
// DOOR CONFIGURATION
// ============================================

/** Door overlay type - how much door overlaps cabinet opening */
export type DoorOverlayType = 'full' | 'half' | 'inset';

/** Door opening direction */
export type DoorOpeningDirection = 'left' | 'right';

/** Door style profile (for CNC routing) */
export type DoorStyleType = 'slab' | 'shaker' | 'shaker_modern' | 'j_pull';

/** Handle type for doors */
export type DoorHandleType = 'pull' | 'knob' | 'j_pull' | 'push_latch' | 'none';

/**
 * Configuration for a single door panel.
 */
export interface DoorPanelConfig {
  /** Unique identifier */
  id: string;
  /** Opening direction (hinge side) */
  openingDirection: DoorOpeningDirection;
  /** Door style profile */
  style: DoorStyleType;
  /** Overlay type */
  overlayType: DoorOverlayType;
  /** Handle configuration */
  handleConfig?: {
    type: DoorHandleType;
    height: number; // mm from bottom
    offset?: number; // mm from edge
  };
  /** Hinge ID from HingeCatalog */
  hingeId: string;
  /** Number of hinges (auto-calculated based on height) */
  hingeCount?: number;
  /** Custom hinge positions (overrides auto-calculation) */
  hingePositions?: number[];
}

/**
 * Main door configuration for a cabinet.
 */
export interface DoorConfig {
  /** Whether cabinet has doors */
  hasDoors: boolean;
  /** Number of door panels (1 = single door, 2 = double doors) */
  doorCount: 1 | 2;
  /** Configuration for each door panel */
  doors: DoorPanelConfig[];
  /** Door panel thickness (typically same as cabinet panels) */
  doorThickness: number;
  /** Overlay amount in mm (how much door overlaps opening) */
  overlayAmount: number;
  /** Gap between double doors (mm) */
  doorGap: number;
  /** Reveal gap around door perimeter (mm) */
  revealGap: number;
}

/**
 * Default door panel configuration.
 */
export const DEFAULT_DOOR_PANEL: Omit<DoorPanelConfig, 'id'> = {
  openingDirection: 'left',
  style: 'slab',
  overlayType: 'full',
  hingeId: 'blum-clip-top-full',
  handleConfig: {
    type: 'pull',
    height: 1000,
    offset: 40,
  },
};

/**
 * Default door configuration.
 */
export const DEFAULT_DOOR_CONFIG: DoorConfig = {
  hasDoors: false,
  doorCount: 1,
  doors: [],
  doorThickness: 18,
  overlayAmount: 18,
  doorGap: 3,
  revealGap: 2,
};

// ============================================
// CABINET STRUCTURE
// ============================================

export interface CabinetDimensions {
  width: number;          // W - Overall width (mm)
  height: number;         // H - Overall height (mm)
  depth: number;          // D - Overall depth (mm)
  toeKickHeight: number;  // Leg height for base cabinets (mm)
}

// ============================================
// SHELF CONNECTOR CONFIGURATION
// ============================================

/**
 * Connection type for how a shelf attaches to side panels.
 * - 'shelf-pins': Adjustable System 32 shelf pins (default)
 * - 'minifix': Fixed Minifix bolt+cam connectors (structural)
 */
export type ShelfConnectionType = 'shelf-pins' | 'minifix';

/**
 * Per-side connector configuration for a shelf junction.
 */
export interface ShelfSideConnectorConfig {
  /** Whether this side has a connector enabled */
  enabled: boolean;
  /** Joint type for this shelf-side connection */
  jointType: JointType;  // 'INSET' | 'OVERLAY'
  /** System 32 Z positions where connectors are placed (mm from front) */
  sys32Positions: number[];  // e.g., [64, 128]
  /** Distance B from shelf edge to bolt center (mm) */
  distanceB: number;
  /** Include wooden dowels alongside Minifix */
  includeDowels: boolean;
}

/**
 * Complete connector configuration for one shelf.
 */
export interface ShelfConnectorConfig {
  /** Connection mode: shelf-pins (adjustable) or minifix (fixed) */
  connectionType: ShelfConnectionType;
  /** Left side connector config */
  left: ShelfSideConnectorConfig;
  /** Right side connector config */
  right: ShelfSideConnectorConfig;
}

export const DEFAULT_SHELF_SIDE_CONNECTOR: ShelfSideConnectorConfig = {
  enabled: true,
  jointType: 'INSET',    // Side covers shelf edge (standard)
  sys32Positions: [],     // Empty = auto-calculate from shelf depth (same algorithm as TOP/BOTTOM)
  distanceB: 24,          // Häfele standard Distance B
  includeDowels: true,
};

export const DEFAULT_SHELF_CONNECTOR_CONFIG: ShelfConnectorConfig = {
  connectionType: 'shelf-pins',  // Default: adjustable
  left: { ...DEFAULT_SHELF_SIDE_CONNECTOR },
  right: { ...DEFAULT_SHELF_SIDE_CONNECTOR },
};

/**
 * Back panel connector configuration for Minifix + Dowel joints.
 * Connects back panel (overlay) to side panels along Y axis (height).
 */
export interface BackPanelConnectorConfig {
  /** Master enable for back panel connectors */
  enabled: boolean;
  /** Left side (back panel ↔ LEFT_SIDE) */
  left: { enabled: boolean; includeDowels: boolean };
  /** Right side (back panel ↔ RIGHT_SIDE) */
  right: { enabled: boolean; includeDowels: boolean };
}

export const DEFAULT_BACK_PANEL_CONNECTOR_CONFIG: BackPanelConnectorConfig = {
  enabled: true,
  left: { enabled: true, includeDowels: true },
  right: { enabled: true, includeDowels: true },
};

/**
 * Connection type for structural panels (TOP, BOTTOM).
 * - 'none': No Minifix connectors (panel held by other means: screws, glue, etc.)
 * - 'minifix': Minifix S200 cam+bolt connectors (standard for cabinet construction)
 */
export type StructuralConnectionType = 'none' | 'minifix';

/**
 * Connector configuration for structural panels (TOP/BOTTOM).
 * Controls whether Minifix drill points are generated at corner junctions.
 */
export interface StructuralConnectorConfig {
  connectionType: StructuralConnectionType;
  /** Left side (panel ↔ LEFT_SIDE) */
  left: { enabled: boolean; includeDowels: boolean };
  /** Right side (panel ↔ RIGHT_SIDE) */
  right: { enabled: boolean; includeDowels: boolean };
}

export const DEFAULT_STRUCTURAL_CONNECTOR_CONFIG: StructuralConnectorConfig = {
  connectionType: 'minifix',
  left: { enabled: true, includeDowels: true },
  right: { enabled: true, includeDowels: true },
};

export interface CabinetStructure {
  topJoint: JointType;
  bottomJoint: JointType;
  hasBackPanel: boolean;
  backPanelConstruction: 'inset' | 'overlay'; // inset = เซาะร่อง, overlay = วางทับ
  backPanelInset: number; // Distance from back edge (mm)
  shelfCount: number;
  dividerCount: number;
  /** Drawer system configuration (optional) */
  drawerConfig?: DrawerConfig;
  /** Door system configuration (optional) */
  doorConfig?: DoorConfig;

  /**
   * Per-shelf connector configuration.
   * Key = shelf index (0-based), e.g., "0" for first shelf.
   * When a shelf's connectionType is 'minifix', Minifix drill points
   * are generated at the shelf-to-side-panel junctions.
   */
  shelfConnectors?: Record<string, ShelfConnectorConfig>;

  /**
   * Top panel connector configuration (Minifix vs None).
   * Controls Minifix generation at TOP_LEFT and TOP_RIGHT corners.
   */
  topConnectors?: StructuralConnectorConfig;

  /**
   * Bottom panel connector configuration (Minifix vs None).
   * Controls Minifix generation at BOTTOM_LEFT and BOTTOM_RIGHT corners.
   */
  bottomConnectors?: StructuralConnectorConfig;

  /**
   * Back panel connector configuration (Minifix + Dowel).
   * Only applies when backPanelConstruction is 'overlay'.
   * Connects back panel to LEFT_SIDE and RIGHT_SIDE panels.
   */
  backPanelConnectors?: BackPanelConnectorConfig;

  /**
   * Corner angles for angled cabinet joints (optional).
   * Values in degrees (30-150). Default is 90° for all corners.
   *
   * Use cases:
   * - Corner cabinets with 45° angles
   * - Trapezoid cabinets
   * - Angled wall installations
   */
  cornerAngles?: {
    topLeft?: number;      // degrees (30-150), default 90
    topRight?: number;     // degrees (30-150), default 90
    bottomLeft?: number;   // degrees (30-150), default 90
    bottomRight?: number;  // degrees (30-150), default 90
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
// CABINET HARDWARE CONFIGURATION
// ============================================

export interface CabinetHardware {
  /** Selected Minifix preset ID (from saved presets) */
  minifixPresetId?: string;
  /** Inline Minifix config (if not using preset) */
  minifixConfig?: {
    camDia: number;
    camDepth: number;
    camOffset: number;
    sleeveDia: number;
    sleeveLength: number;
    sleeveOffset: number;
    shaftDia: number;
    shaftLength: number;
    shaftOffset: number;
    ballHeadDia: number;
    ballHeadOffset: number;
    dowelDia: number;
    dowelLength: number;
    dowelOffset: number;
    woodThickness: number;
  };
  /** Selected hinge preset ID */
  hingePresetId?: string;
  /** Hinge configuration overrides */
  hingeConfig?: {
    cupDia: number;
    cupDepth: number;
    openingAngle: number;
    softClose: boolean;
  };
  /** Drawer slide preset ID */
  drawerSlidePresetId?: string;
  /** Shelf pin configuration */
  shelfPinConfig?: {
    diameter: number;
    depth: number;
    rowCount: number;
    columnCount: number;
  };
}

export const DEFAULT_HARDWARE: CabinetHardware = {
  minifixPresetId: undefined,
  minifixConfig: undefined,
  hingePresetId: undefined,
  hingeConfig: undefined,
  drawerSlidePresetId: undefined,
  shelfPinConfig: {
    diameter: 5,
    depth: 12,
    rowCount: 4,
    columnCount: 2,
  },
};

// ============================================
// HARDWARE POINT OVERRIDES (Per-Connector Config)
// ============================================

/**
 * Rotation override for hardware visualization.
 * Values in radians.
 */
export interface HardwareRotationOverride {
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * Position offset for hardware visualization.
 * Values in mm.
 */
export interface HardwarePositionOverride {
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Preview-only transform state for hardware visualization.
 * Used for per-connector flip/rotation (preview-only, does NOT affect manufacturing).
 *
 * Field names match MinifixFullConfig for merge simplicity.
 * See docs/architecture/HARDWARE_PREVIEW_KEYS.md for canonical keying contract.
 */
export interface HardwarePreviewState {
  flipVertical?: boolean;
  flipHorizontal?: boolean;
  rotationX?: number;   // degrees
  rotationY?: number;   // degrees
  rotationZ?: number;   // degrees
}

/**
 * Per-point hardware override settings.
 * Keyed by drillMap pointId (e.g., "cam_lock-TOP_LEFT-0") for fine-tune,
 * or by pairId (e.g., "pair-TOP_LEFT-0") for per-connector preview state.
 *
 * Resolution order (see HARDWARE_PREVIEW_KEYS.md):
 *   1. overrides[pairId]?.previewState   (per-connector)
 *   2. cabinet.hardware.minifixConfig     (global)
 *   3. identity / no-op
 */
export interface HardwarePointOverride {
  rotation?: HardwareRotationOverride;
  position?: HardwarePositionOverride;
  previewState?: HardwarePreviewState;
}

/**
 * All hardware point overrides for a cabinet.
 * Map: pointId or pairId → override settings
 */
export type HardwarePointOverrides = Record<string, HardwarePointOverride>;

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
  hardware?: CabinetHardware;

  // Hardware point overrides (persisted rotation/position per connector)
  hardwareOverrides?: HardwarePointOverrides;

  // Generated panels
  panels: CabinetPanel[];

  // Computed totals
  computed: CabinetComputed;

  // NOTE: Outer dimensions (outerWidth, outerHeight) were removed as dead code.
  // Use getInnerWidth/getInnerHeight from intentToHardware.ts for derived dimensions,
  // or compute from dimensions + materials.carcassThickness if needed.

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
  backPanelConstruction: 'inset', // inset = เซาะร่อง (default), overlay = วางทับ
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
  _preMillPerSide: number = 0.5  // Kept for API compatibility but not used
): number {
  // Cut Size = Finish Size - Edge Thicknesses
  // This is the panel size AFTER pre-milling, ready for edge banding
  // Pre-milling is a machine operation, not added to cut dimensions
  return finishSize - (edge1 + edge2);
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
