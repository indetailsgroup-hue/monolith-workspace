/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix Joint Contracts - TypeScript type definitions
 *
 * Core principle: CAM on horizontal panel FACE, BOLT on vertical panel EDGE
 */

// ─────────────────────────────────────────────────────────────────────────────
// Basic Types
// ─────────────────────────────────────────────────────────────────────────────

export type JointStyle = "INSET" | "OVERLAY";
export type JointPosition = "TOP" | "BOTTOM";
export type PanelRole = "TOP" | "BOTTOM" | "LEFT_SIDE" | "RIGHT_SIDE";
export type Vec3 = [number, number, number];

// ─────────────────────────────────────────────────────────────────────────────
// Face and Edge References
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reference to a panel face for CAM placement
 * The CAM housing is always drilled into a horizontal panel's FACE
 */
export interface FaceRef {
  kind: "FACE_REF";
  panelId: string;
  /** Face identifier: "TOP" | "BOTTOM" (relative to panel local coords) */
  face: "TOP" | "BOTTOM";
  /** Normal vector pointing outward from face */
  normal: Vec3;
  /** Center point of the face in world coordinates */
  center: Vec3;
}

/**
 * Reference to a panel edge for BOLT placement (DEPRECATED - use EdgeFaceRef)
 * The BOLT is always drilled into a vertical panel's EDGE
 */
export interface EdgeRef {
  kind: "EDGE_REF";
  panelId: string;
  /** Edge identifier relative to panel */
  edge: "TOP" | "BOTTOM" | "FRONT" | "BACK";
  /** Direction vector along the edge */
  direction: Vec3;
  /** Start point of edge in world coordinates */
  start: Vec3;
  /** End point of edge in world coordinates */
  end: Vec3;
}

/**
 * Reference to an edge-FACE for BOLT placement
 * This is the correct representation - edge as a 2D face, not a 1D line
 *
 * CRITICAL: BOLT must be drilled into the edge-FACE that faces the CAM
 * - normal: outward normal of the edge face
 * - center: center point of the edge face
 * - The bolt axis = -normal (drilling INTO the face)
 */
export interface EdgeFaceRef {
  kind: "EDGE_FACE_REF";
  panelId: string;
  /** Which edge of the panel */
  edge: "TOP" | "BOTTOM" | "FRONT" | "BACK";
  /** Outward normal of the edge face (perpendicular to face, pointing OUT) */
  normal: Vec3;
  /** Center point of the edge face in world coordinates */
  center: Vec3;
  /** Bounds of the edge face for position interpolation */
  bounds: {
    /** Start corner of edge face (for interpolation along depth) */
    depthStart: Vec3;
    /** End corner of edge face (for interpolation along depth) */
    depthEnd: Vec3;
    /** Length along depth direction */
    depthLength: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Minifix Specification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minifix hardware specification (dimensions in mm)
 */
export interface MinifixSpec {
  /** CAM housing diameter (typically 15mm) */
  camDiameter: number;
  /** CAM housing depth */
  camDepth: number;
  /** Bolt hole diameter (typically 5mm for M5) */
  boltDiameter: number;
  /** Bolt hole depth */
  boltDepth: number;
  /** Distance from panel edge to CAM center */
  edgeOffset: number;
  /** Setback from panel end */
  endSetback: number;
}

/**
 * Default Minifix spec for standard 15mm CAM
 */
export const DEFAULT_MINIFIX_SPEC: MinifixSpec = {
  camDiameter: 15,
  camDepth: 13.5,     // 13.5mm for 18mm wood per Häfele FF 3.10
  boltDiameter: 10,   // 10mm sleeve diameter (S200)
  boltDepth: 17.5,    // 17.5mm sleeve length per Häfele spec
  edgeOffset: 24,     // 24mm Distance B per CAD spec
  endSetback: 37,     // System 32 first hole position
};

// ─────────────────────────────────────────────────────────────────────────────
// Minifix Placement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete Minifix placement specification
 * Describes where to place CAM and BOLT to join two panels
 */
export interface MinifixPlacement {
  kind: "MINIFIX_PLACEMENT";
  /** Joint style: INSET or OVERLAY */
  style: JointStyle;
  /** Joint position: TOP or BOTTOM */
  position: JointPosition;
  /** CAM placement (on horizontal panel face) */
  cam: {
    /** Which horizontal panel: TOP or BOTTOM */
    panelRole: "TOP" | "BOTTOM";
    /** Face reference for drilling */
    face: FaceRef;
    /** Drill axis (always perpendicular to face, into panel) */
    axis: Vec3;
    /** Drill origin point in world coordinates */
    origin: Vec3;
    /** CAM rotation in degrees (for alignment slot) */
    rotationDeg: number;
    /** Hardware specification */
    spec: MinifixSpec;
  };
  /** BOLT placement (on vertical panel edge-FACE) */
  bolt: {
    /** Which side panel: LEFT_SIDE or RIGHT_SIDE */
    panelRole: "LEFT_SIDE" | "RIGHT_SIDE";
    /** Edge-FACE reference for drilling (the face of the edge, not the line) */
    edgeFace: EdgeFaceRef;
    /** Legacy edge reference (for backwards compatibility) */
    edge?: EdgeRef;
    /** Drill axis (always = -edgeFace.normal, drilling INTO the face) */
    axis: Vec3;
    /** Drill origin point in world coordinates (projected from CAM onto edge-face plane) */
    origin: Vec3;
    /** Hardware specification */
    spec: MinifixSpec;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  location?: {
    panelId?: string;
    placement?: MinifixPlacement;
  };
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Joint Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single Minifix joint
 */
export interface MinifixJointConfig {
  /** Unique identifier for this joint */
  id: string;
  /** Joint style */
  style: JointStyle;
  /** Joint position */
  position: JointPosition;
  /** Horizontal panel ID (TOP or BOTTOM panel) */
  horizontalPanelId: string;
  /** Vertical panel ID (LEFT or RIGHT side panel) */
  verticalPanelId: string;
  /** Which side: left or right */
  side: "left" | "right";
  /** Custom spec override (optional) */
  spec?: Partial<MinifixSpec>;
  /** Number of Minifix units along this joint */
  count?: number;
}

/**
 * Result of joint resolution
 */
export interface MinifixJointResolution {
  config: MinifixJointConfig;
  placements: MinifixPlacement[];
  validation: ValidationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// CNC Operation Types
// ─────────────────────────────────────────────────────────────────────────────

export type DrillOpType = "CAM_HOUSING" | "BOLT_HOLE" | "PILOT_HOLE";

/**
 * CNC drill operation for Minifix hardware
 */
export interface MinifixDrillOp {
  kind: "MINIFIX_DRILL_OP";
  /** Operation type */
  type: DrillOpType;
  /** Target panel ID */
  panelId: string;
  /** Drill origin in panel local coordinates */
  origin: Vec3;
  /** Drill axis in panel local coordinates */
  axis: Vec3;
  /** Drill diameter */
  diameter: number;
  /** Drill depth */
  depth: number;
  /** Optional rotation for CAM slot alignment */
  rotationDeg?: number;
  /** Reference to source placement */
  sourcePlacement?: MinifixPlacement;
}

/**
 * Collection of drill operations for a panel
 */
export interface PanelDrillOps {
  panelId: string;
  operations: MinifixDrillOp[];
}
