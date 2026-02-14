/**
 * Monolith Minifix Connector Constraint Types
 *
 * Production-ready validation types for Minifix® Cam Lock system.
 * Enforces the critical rule: "Ball head must be at cam pocket center and axes must be coaxial"
 *
 * Based on: Monolith Parametric Constraint Schema v1.0
 * Reference: Häfele Minifix 15 Technical Specifications
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 * - Cabinets sit on XZ plane (floor)
 * - Y is vertical (height)
 *
 * v1.0: Initial implementation
 * v1.1: Rebranded to Monolith naming convention
 */

// ============================================
// SEVERITY & STATUS
// ============================================

export type ConstraintSeverity = 'INFO' | 'WARNING' | 'ERROR';

export type GateFindingStatus = 'PASS' | 'FAIL';

// ============================================
// 3D GEOMETRY TYPES
// ============================================

export type Vec3 = { x: number; y: number; z: number };

export type Axis3D = { x: number; y: number; z: number }; // Unit vector

export type Frame3D = {
  origin: Vec3;
  axes: {
    x: Axis3D;
    y: Axis3D;
    z: Axis3D;
  };
};

// ============================================
// MINIFIX ENTITY TYPES
// ============================================

export interface MinifixCamEntity {
  id: string;
  kind: 'cam_housing';
  mountPanel: string;  // Panel ID where cam is mounted
  frame: Frame3D;
  geometry: {
    housingDiameter: number;  // Typically 15mm
    housingDepth: number;     // Cam drilling depth (e.g., 12.5mm)
    pocketCenter: Vec3;       // Center of cam pocket
  };
  params: {
    depth: number;            // Same as housingDepth
    arrowDirection: Vec3;     // Direction cam arrow faces
  };
}

export interface MinifixBoltEntity {
  id: string;
  kind: 'connecting_bolt';
  mountPanel: string;  // Panel ID where bolt is mounted
  frame: {
    origin: Vec3;      // Bolt axis reference point
    axis: Axis3D;      // Bolt axis direction (points toward cam)
  };
  geometry: {
    ballCenter: Vec3;  // Center of ball head
    ballDiameter: number;  // Typically 7.0-7.5mm
  };
  params: {
    ballD: number;
    drillDiameter: number;  // Bolt hole diameter (typically 10mm)
    drillDepth: number;     // Bolt hole depth
  };
}

export interface MinifixPanelEntity {
  id: string;
  thickness: number;
  plane: {
    normal: Vec3;
  };
}

export interface MinifixConnectorPair {
  cam: MinifixCamEntity;
  bolt: MinifixBoltEntity;
  panelHorizontal: MinifixPanelEntity;
  panelVertical: MinifixPanelEntity;
}

// ============================================
// CONSTRAINT CODES (Stable Error Codes - Monolith Namespace)
// ============================================

export type MinifixConstraintCode =
  | 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID'
  | 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND'
  | 'MONO_MINIFIX_CAM_AXIS_NOT_NORMAL'
  | 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING'
  | 'MONO_MINIFIX_NOT_COAXIAL'
  | 'MONO_MINIFIX_Y_MISMATCH'
  | 'MONO_MINIFIX_ARROW_NOT_FACING_BOLT'
  | 'MONO_MINIFIX_COLLISION_ON_ENTRY';

// ============================================
// CONSTRAINT DEFINITIONS
// ============================================

export interface MinifixConstraint {
  id: string;
  name: string;
  type: 'required_field' | 'reference_exists' | 'axis_alignment' | 'axis_pointing' | 'coaxial' | 'equal_scalar' | 'direction_match' | 'clearance_check';
  severity: ConstraintSeverity;
  tolerance?: Record<string, number>;
  field?: string;
  refField?: string;
  targetSet?: string;
  failure: {
    code: MinifixConstraintCode;
    message: string;
  };
  fix?: {
    strategy: string;
    suggestion: string;
  };
}

// ============================================
// GATE FINDING (Validation Result Item)
// ============================================

export interface MinifixGateFinding {
  severity: ConstraintSeverity;
  code: MinifixConstraintCode;
  entityIds: string[];
  message: string;
  measured?: Record<string, number>;
  tolerance?: Record<string, number>;
  suggestedFix?: {
    strategy: string;
    patch?: Array<{
      op: 'replace' | 'add' | 'remove';
      path: string;
      value?: unknown;
    }>;
  };
}

// ============================================
// GATE RESULT
// ============================================

export interface MinifixGateResult {
  gate: 'HARDWARE_CONNECTOR_VALIDATION';
  status: GateFindingStatus;
  summary: {
    errors: number;
    warnings: number;
  };
  findings: MinifixGateFinding[];
}

// ============================================
// CONSTRAINT TOLERANCES (Factory Standards)
// ============================================

export const MINIFIX_TOLERANCES = {
  // Axis alignment tolerance (degrees)
  CAM_AXIS_NORMAL_DEG: 1.0,
  BOLT_AXIS_POINTING_DEG: 3.0,
  ARROW_DIRECTION_DEG: 10.0,

  // Position tolerances (mm) - Y-up coordinate system
  COAXIAL_RADIAL_MM: 0.20,
  Y_MISMATCH_MM: 0.20,  // Height match tolerance (Y-up)
  CLEARANCE_MIN_MM: 0.10,
} as const;

// ============================================
// CONSTRAINT RULE DEFINITIONS
// ============================================

export const MINIFIX_CONSTRAINTS: MinifixConstraint[] = [
  // ---- Pair Integrity Constraints (DrillMap-based) ----
  {
    id: 'MONO-MINIFIX-PAIR-001',
    name: 'Cam housing must have pairedHoleId',
    type: 'required_field',
    severity: 'ERROR',
    field: 'camPoint.pairedHoleId',
    failure: {
      code: 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID',
      message: 'Cam HOUSING drill point is missing pairedHoleId; cannot form deterministic cam↔bolt pair.',
    },
  },
  {
    id: 'MONO-MINIFIX-PAIR-002',
    name: 'pairedHoleId must resolve to bolt point',
    type: 'reference_exists',
    severity: 'ERROR',
    refField: 'camPoint.pairedHoleId',
    targetSet: 'boltPoints.id',
    failure: {
      code: 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND',
      message: 'pairedHoleId does not match any bolt DrillMapPoint.id.',
    },
  },
  // ---- Geometric Constraints ----
  {
    id: 'MONO-MINIFIX-AXIS-001',
    name: 'Cam axis normal to horizontal panel',
    type: 'axis_alignment',
    severity: 'ERROR',
    tolerance: { angle_deg: MINIFIX_TOLERANCES.CAM_AXIS_NORMAL_DEG },
    failure: {
      code: 'MONO_MINIFIX_CAM_AXIS_NOT_NORMAL',
      message: 'Cam axis is not perpendicular to horizontal panel face.',
    },
  },
  {
    id: 'MONO-MINIFIX-AXIS-002',
    name: 'Bolt axis points to cam pocket (radial entry)',
    type: 'axis_pointing',
    severity: 'ERROR',
    tolerance: { angle_deg: MINIFIX_TOLERANCES.BOLT_AXIS_POINTING_DEG },
    failure: {
      code: 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING',
      message: 'Bolt axis does not point to cam pocket center; ball cannot enter pocket radially.',
    },
  },
  {
    id: 'MONO-MINIFIX-COAX-001',
    name: 'Ball center coaxial with cam pocket center',
    type: 'coaxial',
    severity: 'ERROR',
    tolerance: { radial_mm: MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM },
    failure: {
      code: 'MONO_MINIFIX_NOT_COAXIAL',
      message: 'Ball center is radially offset from cam pocket center beyond tolerance.',
    },
    fix: {
      strategy: 'MOVE_BOLT_ALONG_PANEL',
      suggestion: 'Align bolt drill axis so ball center becomes coaxial with cam pocket center.',
    },
  },
  {
    id: 'MONO-MINIFIX-Y-001',
    name: 'Ball center Y equals cam pocket center Y (shared height plane, Y-up)',
    type: 'equal_scalar',
    severity: 'ERROR',
    tolerance: { abs_mm: MINIFIX_TOLERANCES.Y_MISMATCH_MM },
    failure: {
      code: 'MONO_MINIFIX_Y_MISMATCH',
      message: 'Ball center Y is not on the same level as cam pocket center Y (Y-up coordinate system).',
    },
    fix: {
      strategy: 'SET_BOLT_Y_FROM_CAM',
      suggestion: 'Bind bolt ball center Y to cam center Y (shared height datum).',
    },
  },
  {
    id: 'MONO-MINIFIX-ORIENT-001',
    name: 'Cam arrow faces bolt direction',
    type: 'direction_match',
    severity: 'ERROR',
    tolerance: { angle_deg: MINIFIX_TOLERANCES.ARROW_DIRECTION_DEG },
    failure: {
      code: 'MONO_MINIFIX_ARROW_NOT_FACING_BOLT',
      message: 'Cam arrow is not oriented toward bolt; tightening direction will be incorrect.',
    },
  },
  {
    id: 'MONO-MINIFIX-CLEAR-001',
    name: 'Ball can enter cam pocket without collision',
    type: 'clearance_check',
    severity: 'ERROR',
    tolerance: { min_clearance_mm: MINIFIX_TOLERANCES.CLEARANCE_MIN_MM },
    failure: {
      code: 'MONO_MINIFIX_COLLISION_ON_ENTRY',
      message: 'Ball collides with cam pocket boundary; entry is blocked.',
    },
  },
];

// ============================================
// DERIVED RULES (For Automatic Computation)
// ============================================

export const MINIFIX_DERIVED_RULES = [
  {
    id: 'MONO-MINIFIX-DERIVE-001',
    name: 'Shared center plane rule (Y binding)',
    type: 'derive',
    targets: ['bolt.geometry.ball_center.y'],
    expression: 'cam.geometry.pocket_center.y',
    note: 'Monolith rule: cam and bolt must not compute Y (height) independently.',
  },
];

// ============================================
// GATE RULESET (For Gate Enforcement)
// ============================================

export const MINIFIX_GATE_RULESET = {
  schema: 'monolith.gate.ruleset@1.1',
  id: 'gate.ruleset.hardware.minifix',
  appliesTo: ['DrillMapPoint', 'AssemblyGraph', 'HardwarePlacement', 'OperationGraph'],
  when: ['DESIGNER_LIVE_DRC', 'EXPORT_PACKET', 'RELEASE', 'FACTORY_PACKET_BUILD'],
  blockingSeverity: ['ERROR'],
  pairing: {
    source: 'useDrillMapStore',
    entity: 'DrillMapPoint',
    deterministicKey: 'pairedHoleId',
    pairRule: 'camPoint.pairedHoleId === boltPoint.id',
  },
  ruleRefs: MINIFIX_CONSTRAINTS.map(c => `hardware.connector.minifix:${c.id}`),
};
