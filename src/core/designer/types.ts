/**
 * Designer Module Types - Intent-to-Factory Translation
 *
 * This module defines the "Designer Brain" that translates user intent
 * into manufacturable cabinet specifications.
 *
 * Pipeline: DesignerIntent → [Validate] → [Hardware] → [Drill] → [Assemble] → DesignerOutput
 *
 * v1.0: Initial type definitions
 */

import type {
  CabinetType,
  JointType,
  DoorOverlayType,
  DoorOpeningDirection,
  DoorStyleType,
  DoorHandleType,
  DrawerSlideType,
  DrawerHandleType,
  BackPanelConstruction,
} from '../types/Cabinet';

// ============================================
// DESIGNER INTENT (Input)
// ============================================

/**
 * Shelf intent from designer.
 */
export interface ShelfIntent {
  /** Unique identifier */
  id: string;
  /** Fixed or adjustable */
  type: 'fixed' | 'adjustable';
  /** Shelf thickness in mm (14-25) */
  thickness: number;
  /** Position from cabinet bottom in mm */
  positionY: number;
  /** Depth as ratio of cabinet depth (0.5-1.0), default 1.0 */
  depthRatio?: number;
  /** Load capacity requirement */
  loadCapacity?: 'light' | 'medium' | 'heavy';
}

/**
 * Divider intent from designer.
 */
export interface DividerIntent {
  /** Unique identifier */
  id: string;
  /** Position from left in mm */
  positionX: number;
  /** Full height or partial */
  fullHeight: boolean;
  /** Has back panel section */
  hasBack: boolean;
}

/**
 * Door intent from designer.
 */
export interface DoorIntent {
  /** Enable doors */
  enabled: boolean;
  /** Number of doors (1 or 2) */
  count: 1 | 2;
  /** Opening type */
  openingType: 'swing' | 'bifold' | 'lift' | 'flap';
  /** Hinge type */
  hingeType: 'cup' | 'butt' | 'piano';
  /** Overlay type */
  overlayType: DoorOverlayType;
  /** Door style */
  style?: DoorStyleType;
  /** Handle configuration */
  handleConfig?: {
    type: DoorHandleType;
    height: number;
    offset?: number;
  };
}

/**
 * Drawer row intent from designer.
 */
export interface DrawerRowIntent {
  /** Front panel height in mm (80-300) */
  frontHeight: number;
  /** Gap above drawer in mm (3-20) */
  gapAbove: number;
  /** Load capacity requirement */
  loadCapacity?: 'light' | 'medium' | 'heavy';
}

/**
 * Drawer intent from designer.
 */
export interface DrawerIntent {
  /** Enable drawers */
  enabled: boolean;
  /** Drawer rows from bottom to top */
  rows: DrawerRowIntent[];
  /** Slide type */
  slideType: DrawerSlideType;
  /** Handle configuration */
  handleConfig?: {
    type: DrawerHandleType;
    position: 'center' | 'top' | 'bottom';
  };
}

/**
 * Connector intent from designer.
 */
export interface ConnectorIntent {
  /** Primary joint method */
  primaryJoint: 'minifix' | 'dowel' | 'confirmat' | 'domino';
  /** Reinforcement method */
  reinforcement?: 'dowel' | 'biscuit' | 'none';
  /** Back panel attachment */
  backPanelAttachment: 'groove' | 'rabbet' | 'clips' | 'screws';
}

/**
 * Material preferences from designer.
 */
export interface MaterialPreferences {
  /** Carcass (cabinet body) material ID */
  carcassMaterial: string;
  /** Carcass thickness in mm */
  carcassThickness: number;
  /** Door material ID (if different) */
  doorMaterial?: string;
  /** Door thickness in mm */
  doorThickness?: number;
  /** Back panel material ID */
  backMaterial?: string;
  /** Back panel thickness in mm */
  backThickness?: number;
  /** Edge banding type */
  edgeBanding: 'none' | 'pvc' | 'veneer' | 'solid';
}

/**
 * Main Designer Intent - User's design requirements.
 * This is what the designer "wants" - the brain translates to "what the factory needs".
 */
export interface DesignerIntent {
  /** Schema version */
  intentVersion: '1.0';

  // Cabinet basics
  /** Cabinet type (BASE, WALL, TALL, etc.) */
  cabinetType: CabinetType;
  /** Joint type for carcass */
  jointType: JointType;

  // Dimensions (mm)
  dimensions: {
    /** Overall width (200-2400mm) */
    width: number;
    /** Overall height (200-2400mm) */
    height: number;
    /** Overall depth (200-800mm) */
    depth: number;
    /** Toe kick height for base cabinets (0-200mm) */
    toeKickHeight?: number;
  };

  // Back panel
  backPanel: {
    /** Enable back panel */
    enabled: boolean;
    /** Construction method */
    construction: BackPanelConstruction | 'none';
    /** Thickness in mm */
    thickness: number;
  };

  // Internal structure
  /** Shelves (fixed and adjustable) */
  shelves: ShelfIntent[];
  /** Vertical dividers */
  dividers: DividerIntent[];

  // Closures
  /** Door configuration */
  doors?: DoorIntent;
  /** Drawer configuration */
  drawers?: DrawerIntent;

  // Joints
  /** Connector/fastener configuration */
  connectors: ConnectorIntent;

  // Materials
  /** Material preferences */
  materials: MaterialPreferences;
}

// ============================================
// DESIGNER ISSUE (Validation)
// ============================================

/**
 * Issue severity levels.
 * - blocker: Cannot proceed, must fix
 * - warning: Can proceed but may have problems
 * - info: Informational, suggestion for improvement
 */
export type DesignerIssueSeverity = 'blocker' | 'warning' | 'info';

/**
 * A validation issue found in the design.
 * Follows the Gate pattern.
 */
export interface DesignerIssue {
  /** Unique error code (e.g., 'SHELF_TOO_THIN') */
  code: string;
  /** Severity level */
  severity: DesignerIssueSeverity;
  /** Human-readable message */
  message: string;
  /** Path to problematic field (e.g., 'shelves.0.thickness') */
  field?: string;
  /** Suggestion for fixing */
  suggestion?: string;
}

// ============================================
// DESIGNER OUTPUT (Result)
// ============================================

/**
 * 3D vector for positions.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Hardware placement specification.
 */
export interface HardwarePlacement {
  /** Panel ID to mount on */
  panelId: string;
  /** Position on panel (mm) */
  position: Vec3;
  /** Rotation (radians) */
  rotation?: Vec3;
  /** Face of panel ('A' = front, 'B' = back, 'edge') */
  face?: 'A' | 'B' | 'edge';
}

/**
 * Selected hardware item.
 */
export interface HardwareSelection {
  /** Hardware type */
  type: 'hinge' | 'minifix' | 'dowel' | 'confirmat' | 'shelf_pin' | 'slide' | 'handle';
  /** Catalog ID from HardwareLibrary */
  catalogId: string;
  /** Display name */
  name: string;
  /** Quantity needed */
  quantity: number;
  /** Placement positions */
  placements: HardwarePlacement[];
}

/**
 * Single assembly step.
 */
export interface AssemblyStep {
  /** Step order (1-based) */
  order: number;
  /** Action to perform */
  action: 'place' | 'attach' | 'insert' | 'flip' | 'clamp' | 'wait';
  /** Panel being worked on */
  panelId: string;
  /** Panel label for display */
  panelLabel: string;
  /** Target panel (for attach/insert) */
  targetPanelId?: string;
  /** Target panel label */
  targetPanelLabel?: string;
  /** Hardware used in this step */
  hardware?: string[];
  /** Additional notes */
  notes?: string;
  /** Estimated time in minutes */
  timeMinutes?: number;
}

/**
 * Complete assembly sequence.
 */
export interface AssemblySequence {
  /** Ordered steps */
  steps: AssemblyStep[];
  /** Total estimated time in minutes */
  totalTimeMinutes: number;
}

/**
 * Bill of materials item.
 */
export interface BOMItem {
  /** Item type */
  type: 'panel' | 'hardware' | 'edge' | 'accessory';
  /** Item ID */
  id: string;
  /** Display name */
  name: string;
  /** Quantity */
  quantity: number;
  /** Unit */
  unit: 'pcs' | 'mm' | 'm' | 'm²';
  /** Dimensions (for panels) */
  dimensions?: {
    length: number;
    width: number;
    thickness: number;
  };
  /** Unit cost */
  unitCost?: number;
  /** Total cost */
  totalCost?: number;
}

/**
 * Output metrics.
 */
export interface DesignerMetrics {
  /** Number of panels */
  panelCount: number;
  /** Number of hardware items */
  hardwareCount: number;
  /** Number of drill operations */
  drillCount: number;
  /** Estimated assembly time in minutes */
  estimatedAssemblyMinutes: number;
  /** Total material cost (if available) */
  totalCost?: number;
  /** Total surface area in m² */
  totalSurfaceArea?: number;
  /** Total edge length in meters */
  totalEdgeLength?: number;
}

/**
 * Validation result.
 */
export interface DesignerValidation {
  /** Overall validation passed (no blockers) */
  ok: boolean;
  /** Blocking issues (must fix) */
  blockers: DesignerIssue[];
  /** Warning issues (should consider) */
  warnings: DesignerIssue[];
  /** Informational issues (nice to know) */
  info: DesignerIssue[];
}

/**
 * Main Designer Output - Factory-ready specifications.
 * This is what the factory "needs" to manufacture the cabinet.
 */
export interface DesignerOutput {
  /** Validation results */
  validation: DesignerValidation;

  /** Selected hardware (empty if validation failed) */
  hardware: HardwareSelection[];

  /** Drill map reference (panel ID -> drill points) */
  drillMapRef?: string;

  /** Assembly sequence */
  assembly: AssemblySequence;

  /** Bill of materials */
  bom: BOMItem[];

  /** Output metrics */
  metrics: DesignerMetrics;

  /** Timestamp of generation */
  generatedAt: string;
}

// ============================================
// RULE TYPES
// ============================================

/**
 * A validation rule function.
 * Takes intent, returns array of issues (empty if no issues).
 */
export type DesignerRule = {
  /** Rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Check function */
  check: (intent: DesignerIntent) => DesignerIssue[];
};

/**
 * Rule category for grouping.
 */
export type RuleCategory =
  | 'structural'
  | 'door'
  | 'shelf'
  | 'drawer'
  | 'connector'
  | 'material';

/**
 * Rule registry entry.
 */
export interface RuleRegistryEntry {
  rule: DesignerRule;
  category: RuleCategory;
  enabled: boolean;
}
