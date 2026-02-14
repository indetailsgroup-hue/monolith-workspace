/**
 * Drill Map Types - v4.0
 *
 * Types for CNC drill map generation and visualization.
 * Aligned with generateDrillMap.ts v4.0 Side-covers-Top construction.
 */

/** 3D position tuple [x, y, z] in mm */
export type Vec3Tuple = [number, number, number];

/** Corner position on a cabinet joint */
export type CornerType = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

/** Drill hole purpose */
export type DrillPurpose =
  | 'CAM_LOCK'
  | 'BOLT'
  | 'DOWEL'
  | 'SHELF_PIN'
  | 'HINGE'
  | 'MINIFIX'
  | 'OTHER';

/** Rotation override for a drill point */
export interface RotationOverride {
  rotX: number;
  rotY: number;
  rotZ: number;
}

/** Single drill point on a panel */
export interface DrillMapPoint {
  id: string;
  panelId: string;
  operationId?: string;
  position: Vec3Tuple;
  positionBase?: Vec3Tuple;
  normal: Vec3Tuple;
  diameter: number;
  depth: number;
  purpose: DrillPurpose;
  componentType: 'HOUSING' | 'BOLT' | 'DOWEL' | 'PIN' | 'OTHER';
  status: 'VALID' | 'INVALID' | 'WARNING';
  pairId?: string;
  pairedHoleId?: string;
  edgeDistance?: number;
  depthPosition?: number;
  cornerType?: CornerType;
  cornerAngleDeg?: number;
  connectedPanelRole?: string;
  boltDirection?: Vec3Tuple;
  targetPocketCenter?: Vec3Tuple;
  boltTwistDeg?: number;
  face?: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  throughHole?: boolean;
  rotation?: RotationOverride;
}

/** Drill map for a single panel */
export interface DrillMapPanel {
  panelId: string;
  role: string;
  dimensions?: { width: number; height: number; thickness: number };
  worldPosition?: Vec3Tuple;
  worldRotation?: Vec3Tuple;
  points: DrillMapPoint[];
  grooves?: unknown[];
}

/** Complete drill map for a cabinet */
export interface DrillMap {
  cabinetId?: string;
  version: string | number;
  generatedAt?: number;
  panels: DrillMapPanel[];
  stats?: {
    totalDrills: number;
    totalBores: number;
    byPurpose: Record<string, number>;
  };
  jobId?: string;
  createdAt?: string;
  summary?: {
    totalDrills: number;
    totalBores: number;
    totalGrooves: number;
    toolChanges: number;
    estimatedTime: number;
    byPurpose: Record<string, number>;
    byDiameter: Record<string, number>;
  };
  tools?: unknown[];
  warnings?: unknown[];
}

/** Bounding box for drill map computation */
export interface DrillMapBounds {
  width: number;
  height: number;
  depth: number;
}

/** Full Minifix S200 connector configuration */
export interface MinifixConfig {
  minifixType: string;
  drillingDistanceB: number;
  woodThickness: number;
  ballHeadDia: number;
  ballHeadOffset: number;
  neckShaftDia: number;
  neckShaftLength: number;
  neckShaftOffset: number;
  sleeveDia: number;
  sleeveLength: number;
  sleeveOffset: number;
  shaftDia: number;
  shaftLength: number;
  shaftOffset: number;
  camDia: number;
  camDepth: number;
  camHeight: number;
  camRimDia: number;
  camRimHeight: number;
  camOffset: number;
  includeDowel: boolean;
  dowelDia: number;
  dowelLength: number;
  dowelOffset: number;
  dowelDepthSideFace?: number;
  dowelDepthHorizEdge?: number;
  dowelDepthEdge?: number;
  dowelDepthFace?: number;
}

/** Drilling parameters for System 32 spacing */
export interface DrillingParams {
  firstHoleZ: number;
  [key: string]: unknown;
}

/** Default drilling parameters */
export const DEFAULT_DRILLING_PARAMS: DrillingParams = {
  firstHoleZ: 37,
};
