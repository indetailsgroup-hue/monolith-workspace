/**
 * flatPartTypes.ts - FlatPart v1 Server Types
 *
 * Server-side FlatPart schema for DXF export pipeline.
 * Independent from client-side types to avoid runtime dependencies.
 *
 * @version P14A.1
 */

// ============================================================================
// Edge Side
// ============================================================================

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

// ============================================================================
// Outer Contour
// ============================================================================

export interface OuterContour {
  /** Contour type - rect for MVP */
  type: 'rect';
  /** Width (X-axis) in mm */
  width: number;
  /** Height (Y-axis) in mm */
  height: number;
  /** Corner radius (0 for sharp corners) */
  cornerRadius?: number;
}

// ============================================================================
// Drill Feature
// ============================================================================

export interface DrillFeature {
  /** Unique feature ID */
  id: string;
  /** Center X position in mm */
  x: number;
  /** Center Y position in mm */
  y: number;
  /** Drill diameter in mm */
  diameter: number;
  /** Drill depth in mm (ignored if isThrough) */
  depth: number;
  /** Through hole flag */
  isThrough: boolean;
  /** DXF layer override */
  layer?: string;
  /** Face: 'top' or 'bottom' */
  face?: 'top' | 'bottom';
}

// ============================================================================
// Pocket Feature
// ============================================================================

export interface PocketFeature {
  /** Unique feature ID */
  id: string;
  /** Center X position in mm */
  x: number;
  /** Center Y position in mm */
  y: number;
  /** Pocket width in mm */
  width: number;
  /** Pocket height in mm */
  height: number;
  /** Pocket depth in mm */
  depth: number;
  /** DXF layer override */
  layer?: string;
  /** Corner radius for pocket corners */
  cornerRadius?: number;
}

// ============================================================================
// Groove Feature
// ============================================================================

export interface GrooveFeature {
  /** Unique feature ID */
  id: string;
  /** Groove axis: 'x' (horizontal) or 'y' (vertical) */
  axis: 'x' | 'y';
  /** Position along perpendicular axis in mm */
  position: number;
  /** Start position along groove axis in mm */
  start: number;
  /** Groove length in mm */
  length: number;
  /** Groove width in mm */
  width: number;
  /** Groove depth in mm */
  depth: number;
  /** DXF layer override */
  layer?: string;
}

// ============================================================================
// Edge Band
// ============================================================================

export interface EdgeBand {
  /** Edge side */
  side: EdgeSide;
  /** Material code (e.g., 'EB_ABS_2') */
  materialCode: string;
  /** Band thickness in mm */
  thickness: number;
}

// ============================================================================
// Composite Stack
// ============================================================================

export interface CompositeStack {
  /** Total thickness including all layers */
  totalThickness: number;
  /** Core material info */
  core: {
    materialName: string;
    thickness: number;
    materialCode?: string;
  };
  /** Top surface (optional) */
  topSurface?: {
    materialName: string;
    thickness: number;
    materialCode?: string;
  };
  /** Bottom surface (optional) */
  bottomSurface?: {
    materialName: string;
    thickness: number;
    materialCode?: string;
  };
}

// ============================================================================
// FlatPart v1
// ============================================================================

/**
 * FlatPart v1 - 2D manufacturing representation
 *
 * Coordinate system:
 * - Origin at bottom-left corner
 * - X axis: width (horizontal)
 * - Y axis: height (vertical)
 * - All dimensions in mm
 */
export interface FlatPart {
  /** Schema version */
  version: 'FLATPART_V1';

  /** Unique part ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Part number for labeling */
  partNumber?: string;

  /** Source cabinet ID */
  cabinetId?: string;

  /** Source panel ID */
  panelId?: string;

  // ============================================================================
  // Dimensions (Cut Size)
  // ============================================================================

  /** Cut width (after edge band deduction) in mm */
  cutWidth: number;

  /** Cut height (after edge band deduction) in mm */
  cutHeight: number;

  /** Finish width (before edge band) in mm */
  finishWidth?: number;

  /** Finish height (before edge band) in mm */
  finishHeight?: number;

  // ============================================================================
  // Geometry
  // ============================================================================

  /** Outer contour */
  outer: OuterContour;

  /** Drill holes */
  drills: DrillFeature[];

  /** Pockets */
  pockets: PocketFeature[];

  /** Grooves */
  grooves: GrooveFeature[];

  // ============================================================================
  // Material
  // ============================================================================

  /** Edge bands */
  edges: EdgeBand[];

  /** Composite material stack */
  composite: CompositeStack;

  /** Grain direction: 0 = along width, 90 = along height */
  grainAngle?: 0 | 90;

  // ============================================================================
  // Metadata
  // ============================================================================

  /** Creation timestamp */
  createdAt?: string;

  /** Builder version */
  builderVersion?: string;
}

// ============================================================================
// Gate Result
// ============================================================================

export type GateSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface GateIssue {
  /** Rule code (e.g., 'GATE_CUT_SIZE_MIN') */
  code: string;
  /** Severity level */
  severity: GateSeverity;
  /** Human-readable message */
  message: string;
  /** Feature/location ID for highlighting */
  location?: string;
  /** Suggested fix command ID */
  suggestedFix?: string;
}

export interface GateResult {
  /** Overall pass/fail */
  ok: boolean;
  /** List of issues found */
  issues: GateIssue[];
  /** Can proceed with export */
  canExport: boolean;
  /** Gate version used */
  gateVersion: string;
  /** Validation timestamp */
  validatedAt: string;
}

// ============================================================================
// Packet Types (for flatPartFromPacket)
// ============================================================================

export interface PacketPanel {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness: number;
  material?: {
    code?: string;
    name?: string;
  };
  edges?: {
    top?: { thickness: number; code?: string };
    bottom?: { thickness: number; code?: string };
    left?: { thickness: number; code?: string };
    right?: { thickness: number; code?: string };
  };
  drills?: Array<{
    id?: string;
    x: number;
    y: number;
    diameter: number;
    depth: number;
    through?: boolean;
  }>;
  pockets?: Array<{
    id?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
  }>;
  grooves?: Array<{
    id?: string;
    axis: 'x' | 'y';
    position: number;
    start: number;
    length: number;
    width: number;
    depth: number;
  }>;
}

export interface PacketCabinet {
  id: string;
  name: string;
  panels: PacketPanel[];
}

export interface ManufacturingPacket {
  version: string;
  jobId: string;
  cabinets: PacketCabinet[];
}
