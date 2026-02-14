/**
 * panelBasis.ts
 *
 * AABB-based panel coordinate system for drill map generation.
 * Computes world-space positions from panel-local coordinates.
 *
 * Used by generateDrillMap.ts v4.0 Side-covers-Top construction.
 */

import type { CabinetPanel } from '../../types/Cabinet';
import type { Vec3Tuple, CornerType } from './types';

/** Axis-Aligned Bounding Box */
export interface Box3Like {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/** Panel coordinate basis in world space */
export interface PanelWorldBasis {
  origin: Vec3Tuple;
  uAxis: Vec3Tuple;
  vAxis: Vec3Tuple;
  wAxis: Vec3Tuple;
  faceWidth: number;
  faceHeight: number;
}

/** System 32 auto-calculation parameters */
export interface System32AutoParams {
  firstHole: number;
  pitch: number;
  endOffset: number;
  maxConnectors?: number;
}

/** Calculate AABB from panel position and dimensions */
export function calculatePanelAABB(panel: CabinetPanel): Box3Like {
  const [px, py, pz] = panel.position;
  const w = panel.finishWidth;
  const h = panel.finishHeight;
  const t = panel.computed.realThickness;

  const role = panel.role;
  if (role === 'LEFT_SIDE' || role === 'RIGHT_SIDE') {
    return {
      min: [px - t / 2, py, pz] as Vec3Tuple,
      max: [px + t / 2, py + h, pz + w] as Vec3Tuple,
    };
  }
  // TOP, BOTTOM, SHELF, etc.
  return {
    min: [px, py - t / 2, pz] as Vec3Tuple,
    max: [px + w, py + t / 2, pz + h] as Vec3Tuple,
  };
}

/** Get panel basis vectors from AABB for coordinate transforms */
export function getPanelBasisFromAABB(panel: CabinetPanel, aabb: Box3Like): PanelWorldBasis {
  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, maxZ] = aabb.max;

  const role = panel.role;

  if (role === 'TOP') {
    return {
      origin: [minX, maxY, minZ],
      uAxis: [0, -1, 0],
      vAxis: [1, 0, 0],
      wAxis: [0, 0, 1],
      faceWidth: maxX - minX,
      faceHeight: maxZ - minZ,
    };
  }
  if (role === 'BOTTOM') {
    return {
      origin: [minX, minY, minZ],
      uAxis: [0, 1, 0],
      vAxis: [1, 0, 0],
      wAxis: [0, 0, 1],
      faceWidth: maxX - minX,
      faceHeight: maxZ - minZ,
    };
  }
  if (role === 'LEFT_SIDE') {
    return {
      origin: [maxX, minY, minZ],
      uAxis: [-1, 0, 0],
      vAxis: [0, 0, 1],
      wAxis: [0, 1, 0],
      faceWidth: maxZ - minZ,
      faceHeight: maxY - minY,
    };
  }
  if (role === 'RIGHT_SIDE') {
    return {
      origin: [minX, minY, minZ],
      uAxis: [1, 0, 0],
      vAxis: [0, 0, 1],
      wAxis: [0, 1, 0],
      faceWidth: maxZ - minZ,
      faceHeight: maxY - minY,
    };
  }

  // Default: horizontal panel
  return {
    origin: [minX, minY, minZ],
    uAxis: [0, 1, 0],
    vAxis: [1, 0, 0],
    wAxis: [0, 0, 1],
    faceWidth: maxX - minX,
    faceHeight: maxZ - minZ,
  };
}

/** Convert panel-local (x, y) to world position */
export function panelLocalToWorld(basis: PanelWorldBasis, localX: number, localY: number): Vec3Tuple {
  return [
    basis.origin[0] + basis.vAxis[0] * localX + basis.wAxis[0] * localY,
    basis.origin[1] + basis.vAxis[1] * localX + basis.wAxis[1] * localY,
    basis.origin[2] + basis.vAxis[2] * localX + basis.wAxis[2] * localY,
  ];
}

/** Build dowel X positions along panel width */
export function buildDowelXPositions(panelWidth: number, offset: number, endOffset: number): number[] {
  const positions: number[] = [];
  let pos = endOffset;
  while (pos <= panelWidth - endOffset) {
    positions.push(pos);
    pos += offset;
  }
  return positions;
}

/** Calculate System 32 positions automatically based on run length */
export function buildSystem32PositionsAuto(runLength: number, params: System32AutoParams): number[] {
  const positions: number[] = [];
  let pos = params.firstHole;
  const endLimit = runLength - params.endOffset;

  while (pos <= endLimit) {
    positions.push(pos);
    pos += params.pitch;
    if (params.maxConnectors && positions.length >= params.maxConnectors) break;
  }

  return positions.length >= 2 ? positions : [params.firstHole, params.firstHole + params.pitch];
}

// ============================================
// VECTOR MATH
// ============================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function vecMul(v: Vec3Tuple, scalar: number): Vec3Tuple {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

export function vecAdd(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vecLen(v: Vec3Tuple): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

// ============================================
// BOLT POSITION CALCULATORS
// ============================================

/** v3.x legacy: Bolt edge drilling on SIDE panel */
export function boltEdgePointFromSideAABB(
  corner: CornerType,
  aabb: Box3Like,
  sys32Z: number
): { position: Vec3Tuple; normal: Vec3Tuple } {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, ] = aabb.max;

  const midX = (minX + maxX) / 2;
  const y = isTop ? maxY : minY;
  const z = minZ + sys32Z;
  const normalY: Vec3Tuple = isTop ? [0, 1, 0] : [0, -1, 0];

  return { position: [midX, y, z], normal: normalY };
}

/** v4.0: Bolt face drilling on SIDE panel inner face */
export function boltFacePointFromSideAABB_v4(
  corner: CornerType,
  aabb: Box3Like,
  sys32Z: number,
  camCenterOffsetY: number
): { position: Vec3Tuple; normal: Vec3Tuple } {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, ] = aabb.max;

  // X: inner face of SIDE panel
  const x = isLeft ? maxX : minX;
  // Y: aligned with CAM pocket center (camCenterOffset from mating edge)
  const y = isTop ? (maxY - camCenterOffsetY) : (minY + camCenterOffsetY);
  // Z: System 32 position from front
  const z = minZ + sys32Z;

  // Normal: pointing inward (toward cabinet interior)
  const normal: Vec3Tuple = isLeft ? [-1, 0, 0] : [1, 0, 0];

  return { position: [x, y, z], normal };
}

/** v4.0: Bolt entry edge bore on horizontal panel */
export function boltEntryEdgePointFromHorizAABB(
  corner: CornerType,
  aabb: Box3Like,
  sys32Z: number
): { position: Vec3Tuple; normal: Vec3Tuple } {
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  const [minX, minY, minZ] = aabb.min;
  const [maxX, maxY, ] = aabb.max;

  const x = isLeft ? minX : maxX;
  const y = (minY + maxY) / 2;
  const z = minZ + sys32Z;

  const normal: Vec3Tuple = isLeft ? [-1, 0, 0] : [1, 0, 0];

  return { position: [x, y, z], normal };
}
