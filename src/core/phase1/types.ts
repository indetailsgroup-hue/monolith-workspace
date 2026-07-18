/**
 * Phase 1 Feature Types - Designer + Factory Core
 *
 * NORTH STAR: Spec → OperationGraph → Validation/Gate → Export
 * "UI is not truth - Manufacturing data is truth"
 *
 * Features:
 * - A1: Smart Edit (parametric spec editing)
 * - A2: Drag & Drop Placement (context-aware)
 * - B1: Factory Truth Mode (X-Ray / CNC overlay)
 * - B2: Edge Rule Engine (auto edge banding)
 *
 * @version 1.0.0 - Phase 1
 */

import type { PanelRole, GrainDirection, CabinetPanel } from '../types/Cabinet';

// ============================================
// SHARED CONTRACTS
// ============================================

/**
 * Gate severity levels
 */
export type GateSeverity = 'INFO' | 'WARN' | 'FAIL';

/**
 * Entity types that can have gate issues
 */
export type GateEntityType = 'CABINET' | 'PANEL' | 'FITTING' | 'EDGE' | 'OP' | 'PLACEMENT';

/**
 * Panel face identifier (A = front/top, B = back/bottom)
 */
export type PanelFace = 'A' | 'B';

/**
 * Edge side on a rectangular panel
 */
export type EdgeSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

/**
 * Gate issue - a single validation problem
 */
export interface GateIssue {
  /** Issue code (e.g., MONO_EDGE_MISSING_POLICY) */
  code: string;
  /** Severity level */
  severity: GateSeverity;
  /** Entity type this issue relates to */
  entityType: GateEntityType;
  /** Entity ID (panel/fitting/op ID) */
  entityId: string;
  /** Human-readable message */
  message: string;
  /** Thai message for UI */
  messageTH?: string;
  /** Hint for resolution */
  hint?: string;
  /** Optional face specification */
  face?: PanelFace;
  /** Optional operation ID */
  opId?: string;
}

/**
 * Gate snapshot - current validation state
 */
export interface GateSnapshot {
  /** Has gate been run? */
  hasRun: boolean;
  /** All issues found */
  issues: GateIssue[];
  /** Can export (no FAIL issues) */
  canExport: boolean;
  /** Can release (stricter: no FAIL + policy conditions met) */
  canRelease: boolean;
  /** Issue counts by severity */
  counts: {
    info: number;
    warn: number;
    fail: number;
  };
  /** Timestamp of last run */
  timestamp: number;
}

/**
 * Edit change description
 */
export interface EditChange {
  /** Change type */
  type: string;
  /** Human-readable description */
  description: string;
}

/**
 * Base result type for all edit operations
 */
export interface EditResult {
  /** Whether edit was successful */
  success: boolean;
  /** Changes made */
  changes: EditChange[];
  /** Warning messages */
  warnings?: string[];
  /** Error message if not successful */
  error?: string;
}

// ============================================
// A1: SMART EDIT TYPES
// ============================================

/**
 * Cabinet spec patch - partial updates to cabinet dimensions/structure
 */
export interface CabinetSpecPatch {
  /** Width in mm */
  width?: number;
  /** Height in mm */
  height?: number;
  /** Depth in mm */
  depth?: number;
  /** Number of shelves (excluding top/bottom) */
  shelfCount?: number;
  /** Number of vertical dividers */
  dividerCount?: number;
  /** Whether to include back panel */
  hasBackPanel?: boolean;
  /** Default core material ID */
  defaultCoreMaterialId?: string;
}

/**
 * Panel spec patch - partial updates to a single panel
 */
export interface PanelSpecPatch {
  /** Core material ID */
  coreMaterialId?: string;
  /** Grain direction */
  grainDirection?: GrainDirection;
  /** Edge policy mode */
  edgePolicyMode?: 'AUTO' | 'MANUAL';
  /** Visibility (for 3D preview) */
  visible?: boolean;
  /** Position overrides */
  positionOverrides?: {
    frontSetback?: number;
    backSetback?: number;
    gapFromBelow?: number | null;
  };
}

/**
 * Smart Edit API input for cabinet
 */
export interface EditCabinetSpecInput {
  cabinetId: string;
  patch: CabinetSpecPatch;
}

/**
 * Smart Edit API input for panel
 */
export interface EditPanelSpecInput {
  panelId: string;
  patch: PanelSpecPatch;
}

// ============================================
// A2: DRAG & DROP PLACEMENT TYPES
// ============================================

/**
 * Asset kinds that can be placed
 */
export type AssetKind = 'MODULE' | 'PANEL_PART' | 'FITTING' | 'SHELF' | 'DIVIDER';

/**
 * Placement target - where to place the asset
 */
export interface PlacementTarget {
  /** Target cabinet ID */
  cabinetId: string;
  /** Target panel ID (for placing on panel face) */
  panelId?: string;
  /** Target face (A or B) */
  face?: PanelFace;
  /** Normalized U coordinate on face (0-1) */
  u?: number;
  /** Normalized V coordinate on face (0-1) */
  v?: number;
  /** Target compartment index (for shelf/divider placement) */
  compartmentIndex?: number;
}

/**
 * Placement alignment options
 */
export type PlacementAlign = 'FACE_NORMAL' | 'WORLD_UP' | 'WORLD_FRONT';

/**
 * Seam alignment for grain matching
 */
export type SeamAlign = 'AUTO' | 'X' | 'Y';

/**
 * Placement options
 */
export interface PlacementOptions {
  /** Alignment mode */
  align?: PlacementAlign;
  /** Seam alignment for grain */
  seam?: SeamAlign;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation?: 0 | 90 | 180 | 270;
  /** Offset from target in mm */
  offsetMm?: { x: number; y: number; z: number };
  /** Whether to create paired holes for fittings (default: true) */
  createPairedHoles?: boolean;
  /** Snap to system 32 grid */
  snapToSystem32?: boolean;
}

/**
 * Place asset request
 */
export interface PlaceAssetRequest {
  /** Asset ID from library */
  assetId: string;
  /** Asset kind */
  assetKind: AssetKind;
  /** Placement target */
  target: PlacementTarget;
  /** Placement options */
  options?: PlacementOptions;
}

/**
 * Resolved placement information
 */
export interface PlacementResolution {
  /** Resolved target face normal */
  targetFaceNormal: [number, number, number];
  /** Applied rotation */
  appliedRotation: 0 | 90 | 180 | 270;
  /** Whether snapping was applied */
  snapped: boolean;
  /** Final position in cabinet space */
  position: [number, number, number];
}

/**
 * Created entity from placement
 */
export interface CreatedEntity {
  /** Entity type */
  entityType: 'PANEL' | 'FITTING' | 'HOLE';
  /** Entity ID */
  id: string;
  /** For fittings: paired hole ID */
  pairedHoleId?: string;
}

/**
 * Place asset result
 */
export interface PlaceAssetResult extends EditResult {
  /** Entities created by placement */
  created: CreatedEntity[];
  /** Resolution details */
  resolved: PlacementResolution;
}

/**
 * Placement error for failed placements
 */
export interface PlacementError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================
// B1: FACTORY TRUTH MODE TYPES
// ============================================

/**
 * Operation kinds for factory truth overlay
 */
export type OverlayOpKind = 'DRILL' | 'BORE' | 'POCKET' | 'CUT' | 'ROUTE' | 'EDGE_BAND';

/**
 * Factory truth point - a single operation visualization point
 */
export interface FactoryTruthPoint {
  /** Point ID */
  id: string;
  /** Source operation ID */
  opId: string;
  /** Operation kind */
  kind: OverlayOpKind;
  /** Panel this operation is on */
  panelId: string;
  /** Face (A or B) */
  face: PanelFace;
  /** Position in panel local coordinates */
  position: [number, number, number];
  /** Diameter for holes (mm) */
  diameter?: number;
  /** Depth for holes (mm) */
  depth?: number;
  /** Tool ID */
  toolId?: string;
  /** Policy ID (e.g., minifix preset) */
  policyId?: string;
  /** Purpose (minifix/cam/dowel/shelf_pin) */
  purpose?: string;
  /** Risk level (for highlighting) */
  risk?: 'NONE' | 'WARN' | 'FAIL';
}

/**
 * Factory truth filters
 */
export interface FactoryTruthFilters {
  /** Filter by operation kinds */
  kinds?: OverlayOpKind[];
  /** Filter by face */
  faces?: PanelFace[];
  /** Filter by panel IDs */
  panelIds?: string[];
  /** Show only risk items */
  riskOnly?: boolean;
  /** Show only items with specific purposes */
  purposes?: string[];
}

/**
 * Factory truth statistics
 */
export interface FactoryTruthStats {
  /** Total points */
  total: number;
  /** Points by kind */
  byKind: Record<OverlayOpKind, number>;
  /** Points by face */
  byFace: Record<PanelFace, number>;
  /** Points by risk level */
  byRisk: {
    none: number;
    warn: number;
    fail: number;
  };
}

/**
 * Factory truth snapshot - complete overlay data
 */
export interface FactoryTruthSnapshot {
  /** Gate snapshot */
  gate: GateSnapshot;
  /** All overlay points */
  points: FactoryTruthPoint[];
  /** Statistics */
  stats: FactoryTruthStats;
  /** Timestamp */
  timestamp: number;
}

// ============================================
// B2: EDGE RULE ENGINE TYPES
// ============================================

/**
 * Edge policy - how to handle an edge
 */
export interface EdgePolicy {
  /** Edge material SKU */
  sku: string;
  /** Edge thickness in mm */
  thicknessMm: number;
  /** Machining allowance in mm */
  allowanceMm?: number;
  /** Trim tool ID */
  toolId?: string;
  /** Edge height in mm (for tape) */
  heightMm?: number;
}

/**
 * Edge policy mode
 */
export type EdgePolicyMode = 'AUTO' | 'MANUAL' | 'NONE';

/**
 * Panel edge state - current state of one edge
 */
export interface PanelEdgeState {
  /** Which edge */
  side: EdgeSide;
  /** Whether edge is exposed (visible) */
  exposed: boolean;
  /** Policy mode */
  policyMode: EdgePolicyMode;
  /** Applied policy (required if exposed && policyMode != NONE) */
  policy?: EdgePolicy;
}

/**
 * Edge adjacency state
 */
export type EdgeAdjacency = 'EXPOSED' | 'HIDDEN' | 'MATED';

/**
 * Edge rule context - inputs for determining edge policy
 */
export interface EdgeRuleContext {
  /** Panel ID */
  panelId: string;
  /** Panel role */
  role: PanelRole;
  /** Whether panel faces front of cabinet */
  isFrontFacing: boolean;
  /** Adjacency state for each edge */
  adjacency: Record<EdgeSide, EdgeAdjacency>;
  /** Material ID */
  materialId: string;
  /** Cabinet type */
  cabinetType?: string;
}

/**
 * Apply edge rules input
 */
export interface ApplyEdgeRulesInput {
  /** Cabinet ID */
  cabinetId: string;
  /** Optional: only apply to specific panels */
  panelIds?: string[];
  /** Default edge SKU for exposed edges */
  defaultEdgeSku?: string;
}

/**
 * Apply edge rules result
 */
export interface ApplyEdgeRulesResult extends EditResult {
  /** Panels that were updated */
  updatedPanels: string[];
  /** Edge policies that were applied */
  appliedPolicies: Array<{
    panelId: string;
    side: EdgeSide;
    policy: EdgePolicy;
  }>;
}

/**
 * Set panel edge policy input
 */
export interface SetPanelEdgePolicyInput {
  /** Panel ID */
  panelId: string;
  /** Which edge */
  side: EdgeSide;
  /** Policy mode */
  mode: EdgePolicyMode;
  /** Policy (required if mode = MANUAL) */
  policy?: EdgePolicy;
}

// ============================================
// GATE ISSUE CODES (Phase 1)
// ============================================

/**
 * Phase 1 Gate Issue Codes
 */
export const GATE_ISSUE_CODES = {
  // Edge issues
  MONO_EDGE_MISSING_POLICY: 'MONO_EDGE_MISSING_POLICY',
  MONO_EDGE_POLICY_INVALID: 'MONO_EDGE_POLICY_INVALID',
  MONO_EDGE_OVERLAP: 'MONO_EDGE_OVERLAP',
  /** Banded edge whose tape is shorter than the panel is thick. */
  MONO_EDGE_TAPE_TOO_NARROW: 'MONO_EDGE_TAPE_TOO_NARROW',

  // Hole/Fitting issues
  MONO_ORPHAN_HOLE: 'MONO_ORPHAN_HOLE',
  MONO_MINIFIX_MISSING_PAIR: 'MONO_MINIFIX_MISSING_PAIR',
  MONO_HOLE_TOO_CLOSE: 'MONO_HOLE_TOO_CLOSE',

  // Material/Grain issues
  MONO_GRAIN_FORBIDDEN: 'MONO_GRAIN_FORBIDDEN',
  MONO_MATERIAL_NOT_FOUND: 'MONO_MATERIAL_NOT_FOUND',

  // Dimension issues
  MONO_DIM_MIN_VIOLATION: 'MONO_DIM_MIN_VIOLATION',
  MONO_DIM_MAX_VIOLATION: 'MONO_DIM_MAX_VIOLATION',
  MONO_SPAN_TOO_WIDE: 'MONO_SPAN_TOO_WIDE',

  // Tool issues
  MONO_TOOL_DIAMETER_VIOLATION: 'MONO_TOOL_DIAMETER_VIOLATION',
  MONO_TOOL_NOT_FOUND: 'MONO_TOOL_NOT_FOUND',

  // Placement issues
  MONO_PLACE_INVALID_TARGET: 'MONO_PLACE_INVALID_TARGET',
  MONO_PLACE_COLLISION: 'MONO_PLACE_COLLISION',
  MONO_PLACE_OUT_OF_BOUNDS: 'MONO_PLACE_OUT_OF_BOUNDS',

  // Back panel issues
  MONO_BACK_PANEL_COLLISION: 'MONO_BACK_PANEL_COLLISION',
} as const;

export type GateIssueCode = typeof GATE_ISSUE_CODES[keyof typeof GATE_ISSUE_CODES];

// ============================================
// DEFAULT VALUES
// ============================================

/**
 * Default edge policy for exposed edges
 */
export const DEFAULT_EDGE_POLICY: EdgePolicy = {
  sku: 'ABS_1MM_WHITE',
  thicknessMm: 1.0,
  allowanceMm: 0.5,
  heightMm: 22,
};

/**
 * Empty gate snapshot
 */
export const EMPTY_GATE_SNAPSHOT: GateSnapshot = {
  hasRun: false,
  issues: [],
  canExport: false,
  canRelease: false,
  counts: { info: 0, warn: 0, fail: 0 },
  timestamp: 0,
};
