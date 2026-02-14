/**
 * Minifix Constraint Types
 *
 * Type definitions for Minifix connector validation gate.
 * Used by validateMinifixConnector.ts and drillMapToMinifixPair.ts.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type MinifixConstraintCode =
  | 'MONO_MINIFIX_NOT_COAXIAL'
  | 'MONO_MINIFIX_Y_MISMATCH'
  | 'MONO_MINIFIX_CAM_AXIS_NOT_NORMAL'
  | 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING'
  | 'MONO_MINIFIX_ARROW_NOT_FACING_BOLT'
  | 'MONO_MINIFIX_COLLISION_ON_ENTRY'
  | 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID'
  | 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND';

export type ConstraintSeverity = 'ERROR' | 'WARNING';

export interface MinifixGateFinding {
  severity: ConstraintSeverity;
  code: MinifixConstraintCode;
  entityIds: string[];
  message: string;
  measured?: Record<string, number>;
  tolerance?: Record<string, number>;
  suggestedFix?: {
    strategy: string;
    patch?: Array<{ op: string; path: string; value?: unknown }>;
  };
}

export interface MinifixGateResult {
  gate: string;
  status: 'PASS' | 'FAIL';
  summary: { errors: number; warnings: number };
  findings: MinifixGateFinding[];
}

export interface MinifixCamEntity {
  id: string;
  kind: 'cam_housing';
  mountPanel: string;
  frame: {
    origin: Vec3;
    axes: { x: Vec3; y: Vec3; z: Vec3 };
  };
  geometry: {
    housingDiameter: number;
    housingDepth: number;
    pocketCenter: Vec3;
  };
  params: {
    depth: number;
    arrowDirection: Vec3;
  };
}

export interface MinifixBoltEntity {
  id: string;
  kind: 'connecting_bolt';
  mountPanel: string;
  frame: {
    origin: Vec3;
    axis: Vec3;
  };
  geometry: {
    ballCenter: Vec3;
    ballDiameter: number;
  };
  params: {
    ballD: number;
    drillDiameter: number;
    drillDepth: number;
  };
}

export interface MinifixPanelEntity {
  id: string;
  thickness: number;
  plane: { normal: Vec3 };
}

export interface MinifixConnectorPair {
  cam: MinifixCamEntity;
  bolt: MinifixBoltEntity;
  panelHorizontal: MinifixPanelEntity;
  panelVertical?: MinifixPanelEntity;
}

/** Tolerances for Minifix validation (mm and degrees) */
export const MINIFIX_TOLERANCES = {
  COAXIAL_RADIAL_MM: 0.20,
  Y_MISMATCH_MM: 0.20,
  CAM_AXIS_NORMAL_DEG: 5.0,
  BOLT_AXIS_POINTING_DEG: 5.0,
  ARROW_DIRECTION_DEG: 15.0,
  CLEARANCE_MIN_MM: 0.5,
};

/** Constraint definitions */
export const MINIFIX_CONSTRAINTS = [
  {
    id: 'MONO-MINIFIX-COAX-001',
    failure: { message: 'Ball center is not coaxial with cam pocket center; connector will not engage.' },
    fix: { strategy: 'MOVE_BOLT_ALONG_PANEL' },
  },
  {
    id: 'MONO-MINIFIX-Y-001',
    failure: { message: 'Ball center Y does not match cam pocket center Y; height misalignment.' },
    fix: { strategy: 'SET_BOLT_Y_FROM_CAM' },
  },
  {
    id: 'MONO-MINIFIX-ORIENT-001',
    failure: { message: 'Cam arrow is not oriented toward bolt; tightening direction will be incorrect.' },
    fix: { strategy: 'ROTATE_CAM_ARROW' },
  },
  {
    id: 'MONO-MINIFIX-CLEARANCE-001',
    failure: { message: 'Bolt entry path collides with panel material.' },
    fix: { strategy: 'INCREASE_CLEARANCE' },
  },
  {
    id: 'MONO-MINIFIX-PAIR-001',
    failure: { message: 'Cam HOUSING is missing pairedHoleId.' },
    fix: { strategy: 'REGENERATE_DRILL_MAP' },
  },
  {
    id: 'MONO-MINIFIX-PAIR-002',
    failure: { message: 'pairedHoleId does not resolve to a bolt point.' },
    fix: { strategy: 'REGENERATE_DRILL_MAP' },
  },
];
