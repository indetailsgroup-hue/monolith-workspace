/**
 * FlatPart.ts - P14A.1 Flat Part Schema for DXF Export
 *
 * Represents a 2D manufacturing view of a panel:
 * - Outer contour (rectangle from CutW × CutH)
 * - Inner contours (cutouts)
 * - Drills (vertical holes)
 * - Pockets (rectangular depressions)
 * - Edge banding flags
 * - Composite material stack
 *
 * This is the "artifact of truth" for factory DXF generation.
 *
 * COORDINATE SYSTEM:
 * - Origin: Bottom-left corner of panel
 * - X: Width direction (left to right)
 * - Y: Height direction (bottom to top)
 * - All dimensions in millimeters (mm)
 *
 * @version 0.14.1
 */

// ============================================================================
// Schema Version
// ============================================================================

export const FLAT_PART_VERSION = 'MONOLITH_FLATPART_V1' as const;

export type FlatPartVersion = typeof FLAT_PART_VERSION;

// ============================================================================
// Geometry Primitives
// ============================================================================

/** 2D Point */
export interface Point2D {
  x: number;
  y: number;
}

/** 2D Rectangle (axis-aligned) */
export interface Rect2D {
  x: number;      // Bottom-left X
  y: number;      // Bottom-left Y
  width: number;
  height: number;
}

/** Closed polyline (for contours) */
export interface Polyline2D {
  points: Point2D[];
  closed: boolean;
}

// ============================================================================
// Contour Types
// ============================================================================

/** Outer contour - the panel boundary (always a rectangle for standard panels) */
export interface OuterContour {
  type: 'rectangle';
  width: number;   // Cut width (mm)
  height: number;  // Cut height (mm)
}

/** Inner contour - cutouts within the panel */
export interface InnerContour {
  id: string;
  type: 'rectangle' | 'circle' | 'polyline';
  /** Rectangle cutout */
  rect?: Rect2D;
  /** Circle cutout (center + radius) */
  circle?: { cx: number; cy: number; radius: number };
  /** Arbitrary polyline cutout */
  polyline?: Polyline2D;
  /** Purpose of the cutout */
  purpose?: 'cable_hole' | 'vent' | 'handle' | 'custom';
}

// ============================================================================
// Feature Types
// ============================================================================

/** Vertical drill hole (perpendicular to panel face) */
export interface DrillFeature {
  id: string;
  x: number;          // Center X (mm)
  y: number;          // Center Y (mm)
  diameter: number;   // Hole diameter (mm)
  depth: number;      // Drill depth (mm)
  isThrough: boolean; // Does it penetrate the full thickness?
  face: 'A' | 'B';    // Which face to drill from
  /** Layer name for DXF grouping */
  layer?: string;
  /** Purpose for documentation */
  purpose?: 'shelf_pin' | 'dowel' | 'confirmat' | 'hinge_cup' | 'system32' | 'custom';
}

/** Pocket (rectangular depression) */
export interface PocketFeature {
  id: string;
  x: number;          // Center X (mm)
  y: number;          // Center Y (mm)
  width: number;      // Pocket width (mm)
  height: number;     // Pocket height (mm)
  depth: number;      // Pocket depth (mm)
  cornerRadius: number; // Corner radius (mm), 0 for sharp
  face: 'A' | 'B';
  layer?: string;
  purpose?: 'hinge_mount' | 'slide_mount' | 'hardware' | 'custom';
}

/** Groove/Dado (linear routing) */
export interface GrooveFeature {
  id: string;
  axis: 'x' | 'y';    // Groove direction
  position: number;   // Position perpendicular to axis (mm)
  start: number;      // Start position along axis (mm)
  length: number;     // Groove length (mm)
  width: number;      // Groove width (mm)
  depth: number;      // Groove depth (mm)
  face: 'A' | 'B';
  layer?: string;
  purpose?: 'back_panel' | 'divider' | 'drawer_bottom' | 'custom';
}

// ============================================================================
// Edge Banding
// ============================================================================

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeBand {
  side: EdgeSide;
  materialId: string;
  materialCode: string;  // e.g., 'PVC-WHITE-1.0'
  thickness: number;     // mm (0.4, 0.5, 1.0, 2.0)
  height: number;        // Tape height (mm)
}

// ============================================================================
// Material Stack (Composite)
// ============================================================================

export interface MaterialLayer {
  type: 'core' | 'surface_a' | 'surface_b';
  materialId: string;
  materialName: string;
  thickness: number;   // mm
}

export interface CompositeStack {
  /** Total thickness = sum of all layers */
  totalThickness: number;
  /** Core material (main board) */
  core: MaterialLayer;
  /** Face A surface (inner/visible) - optional */
  surfaceA?: MaterialLayer;
  /** Face B surface (outer/back) - optional */
  surfaceB?: MaterialLayer;
}

// ============================================================================
// Manufacturing Metadata
// ============================================================================

export interface ManufacturingMeta {
  /** Pre-milling allowance per edge (mm) */
  preMill: number;
  /** Grain direction for nesting optimization */
  grainDirection: 'horizontal' | 'vertical' | 'none';
  /** Quantity to cut */
  quantity: number;
  /** Notes for operator */
  notes?: string;
  /** CNC program reference (if applicable) */
  programId?: string;
}

// ============================================================================
// Main FlatPart Type
// ============================================================================

/**
 * FlatPart - Complete 2D manufacturing representation
 *
 * This is the atomic unit for DXF export and gate validation.
 */
export interface FlatPart {
  /** Schema version for forward compatibility */
  version: FlatPartVersion;

  // Identity
  id: string;
  name: string;
  partNumber?: string;    // e.g., 'BC-001-LS' (Base Cabinet 001, Left Side)

  // Source reference
  sourceType: 'cabinet_panel' | 'drawer_part' | 'door' | 'accessory';
  sourceCabinetId?: string;
  sourcePanelId?: string;
  sourcePanelRole?: string;

  // Dimensions
  /** Finish dimensions (after edge banding) */
  finishWidth: number;
  finishHeight: number;
  /** Cut dimensions (before edge banding, what the CNC cuts) */
  cutWidth: number;
  cutHeight: number;

  // Geometry
  /** Outer contour (panel boundary) */
  outer: OuterContour;
  /** Inner contours (cutouts) - optional */
  inners: InnerContour[];

  // Features
  drills: DrillFeature[];
  pockets: PocketFeature[];
  grooves: GrooveFeature[];

  // Materials
  composite: CompositeStack;
  edges: EdgeBand[];

  // Manufacturing
  manufacturing: ManufacturingMeta;

  // Computed (for validation)
  computed: {
    /** Total surface area (m²) */
    surfaceArea: number;
    /** Total edge length requiring banding (m) */
    bandedEdgeLength: number;
    /** Number of drill operations */
    drillCount: number;
    /** Estimated CNC time (seconds) - optional */
    estimatedCncTime?: number;
  };

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Builder Input Types
// ============================================================================

export interface FlatPartFromPanelInput {
  panel: {
    id: string;
    role: string;
    name: string;
    finishWidth: number;
    finishHeight: number;
    coreMaterialId: string;
    coreMaterialName: string;
    coreThickness: number;
    grainDirection: 'horizontal' | 'vertical' | 'none';
    edges: {
      top?: { materialId: string; code: string; thickness: number; height: number };
      bottom?: { materialId: string; code: string; thickness: number; height: number };
      left?: { materialId: string; code: string; thickness: number; height: number };
      right?: { materialId: string; code: string; thickness: number; height: number };
    };
    surfaceA?: { materialId: string; name: string; thickness: number };
    surfaceB?: { materialId: string; name: string; thickness: number };
  };
  cabinetId: string;
  preMill: number;
  quantity?: number;
  notes?: string;
  /** Existing operations to convert */
  operations?: Array<{
    type: string;
    x?: number;
    y?: number;
    diameter?: number;
    depth?: number;
    isThrough?: boolean;
    face?: 'A' | 'B';
    width?: number;
    height?: number;
    cornerRadius?: number;
    axis?: 'x' | 'y';
    position?: number;
    start?: number;
    length?: number;
  }>;
}

// ============================================================================
// Validation Result Types
// ============================================================================

export type FlatPartIssueCode =
  | 'DXF_OUTER_NOT_CLOSED'
  | 'CUT_SIZE_INVALID'
  | 'HOLE_TOO_DEEP_FOR_CORE'
  | 'HOLE_TOO_CLOSE_TO_EDGE_BAND'
  | 'POCKET_EXCEEDS_THICKNESS'
  | 'GROOVE_EXCEEDS_THICKNESS'
  | 'EDGE_BAND_MISSING'
  | 'MATERIAL_NOT_FOUND'
  | 'DIMENSION_OUT_OF_RANGE'
  | 'FEATURE_OUTSIDE_BOUNDARY';

export type FlatPartIssueSeverity = 'ERROR' | 'WARN' | 'INFO';

export interface FlatPartIssue {
  code: FlatPartIssueCode;
  severity: FlatPartIssueSeverity;
  message: string;
  /** Location of the issue (feature ID, edge side, etc.) */
  location?: string;
  /** Suggested fix command ID (for P14B) */
  suggestedFix?: string;
}

export interface FlatPartValidationResult {
  ok: boolean;
  issues: FlatPartIssue[];
  /** Blocks export if false */
  canExport: boolean;
  /** Blocks spec freeze if false */
  canFreeze: boolean;
}
