/**
 * Gate G11 Types
 *
 * Types, constants, and helper functions for G11 Minifix/System32/Dowel validation.
 * Based on Häfele engineering standards and CANONICAL_SPEC.md.
 */

import type { Vec3Tuple, DrillMapPoint } from '../../core/manufacturing/drillMap/types';

// ============================================
// TYPES
// ============================================

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKER';

/** G11 Issue codes - string-based for extensibility */
export type G11IssueCode = string;

export interface G11Issue {
  id?: string;
  severity: Severity;
  code: G11IssueCode;
  message: string;
  pointId?: string;
  panelId?: string;
  drillPointIds?: string[];
  panelIds?: string[];
  corner?: string;
  measured?: Record<string, number>;
  tolerance?: Record<string, number>;
  context?: Record<string, unknown>;
}

export interface G11Policy {
  matingTolerance?: number;
  dimensionBTolerance?: number;
  depthTolerance?: number;
  allowAlternateDistanceB?: boolean;
  skipMatingCheck?: string[];
}

export interface G11Result {
  gate?: string;
  status: 'PASS' | 'FAIL';
  issues: G11Issue[];
  summary?: {
    blockers: number;
    warnings: number;
    info: number;
    pairsValidated?: number;
    pointsValidated?: number;
  };
}

export interface G11DrillPoint extends DrillMapPoint {
  connectedPanelRole?: string;
  edgeDistance?: number;
}

export interface G11Panel {
  id: string;
  role: string;
  thickness: number;
}

export interface G11Cabinet {
  id: string;
  panels: G11Panel[];
}

export interface G11MatingPair {
  sidePoint: G11DrillPoint;
  horizontalPoint: G11DrillPoint;
  corner: string;
  distance: number;
}

// ============================================
// CONSTANTS
// ============================================

export const G11_CONSTANTS = {
  MATING_TOLERANCE: 0.1,
  DIMENSION_B_STANDARD: 24,
  DIMENSION_B_ALTERNATE: 34,
  DIMENSION_B_TOLERANCE: 0.5,
  DEPTH_TOLERANCE: 0.5,
  DOWEL_DEPTH_SIDE_FACE: 12,
  DOWEL_DEPTH_HORIZ_EDGE: 18,
  CAM_DEPTH_18MM: 13.5,
  BOLT_PROTRUSION_TOTAL: 24,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getExpectedBoreType(role: string, _purpose?: string): 'FACE_BORE' | 'EDGE_BORE' {
  if (isSidePanel(role)) return 'FACE_BORE';
  return 'EDGE_BORE';
}

export function getExpectedDowelDepth(role: string): number {
  if (isSidePanel(role)) return G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE;
  return G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE;
}

export function isSidePanel(role: string | undefined): boolean {
  return role === 'LEFT_SIDE' || role === 'RIGHT_SIDE';
}

export function isHorizontalPanel(role: string | undefined): boolean {
  return role === 'TOP' || role === 'BOTTOM';
}

export function calculateDistance(p1: Vec3Tuple, p2: Vec3Tuple): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  const dz = p1[2] - p2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function issueId(...parts: string[]): string {
  return parts.join('-');
}

/**
 * Calculate bolt tip position from entry position and protrusion.
 * Overloaded: accepts (point) or (position, normal, protrusion).
 */
export function calculateBoltTipPosition(
  positionOrPoint: Vec3Tuple | G11DrillPoint,
  normal?: Vec3Tuple,
  protrusionTotal?: number
): Vec3Tuple {
  if (Array.isArray(positionOrPoint)) {
    const n = normal!;
    const p = protrusionTotal!;
    return [
      positionOrPoint[0] + n[0] * p,
      positionOrPoint[1] + n[1] * p,
      positionOrPoint[2] + n[2] * p,
    ];
  }
  const point = positionOrPoint;
  const pos = point.position;
  const norm = point.normal;
  const depth = point.depth ?? 0;
  return [
    pos[0] + norm[0] * depth,
    pos[1] + norm[1] * depth,
    pos[2] + norm[2] * depth,
  ];
}

/**
 * Calculate CAM pocket center from surface position and cam depth.
 * Overloaded: accepts (point, camDepth) or (position, normal, camDepth).
 */
export function calculateCamPocketCenter(
  positionOrPoint: Vec3Tuple | G11DrillPoint,
  normalOrCamDepth: Vec3Tuple | number,
  camDepthArg?: number
): Vec3Tuple {
  if (Array.isArray(positionOrPoint) && Array.isArray(normalOrCamDepth)) {
    const halfDepth = camDepthArg! / 2;
    return [
      positionOrPoint[0] + normalOrCamDepth[0] * halfDepth,
      positionOrPoint[1] + normalOrCamDepth[1] * halfDepth,
      positionOrPoint[2] + normalOrCamDepth[2] * halfDepth,
    ];
  }
  const point = positionOrPoint as G11DrillPoint;
  const camDepth = normalOrCamDepth as number;
  const pos = point.position;
  const norm = point.normal;
  const halfDepth = camDepth / 2;
  return [
    pos[0] + norm[0] * halfDepth,
    pos[1] + norm[1] * halfDepth,
    pos[2] + norm[2] * halfDepth,
  ];
}
