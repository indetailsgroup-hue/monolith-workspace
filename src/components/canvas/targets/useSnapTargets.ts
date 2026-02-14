/**
 * useSnapTargets.ts - Hook to generate snap targets from scene cabinets
 *
 * Creates snap target points (corners, edges, centers) from other cabinets
 * for use with the snap system during cabinet manipulation.
 *
 * Features:
 * - Uses SceneRegistry for accurate world bounding boxes when available
 * - Falls back to dimension-based calculation with Y rotation support
 *
 * @version 1.1.0
 */

import { useMemo } from 'react';
import { useCabinetStore } from '../../../core/store/useCabinetStore';
import { useSceneRegistry, type WorldBoundingBox } from '../scene/SceneRegistry';
import type { Vec3 } from '../../../core/types/SnapTypes';

// ============================================
// TYPES
// ============================================

export type SnapPointType = 'corner' | 'edge-mid' | 'center' | 'face-center';

export interface SnapPoint {
  id: string;
  position: Vec3;
  type: SnapPointType;
  cabinetId: string;
  face?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
}

export interface SnapTargetSet {
  cabinetId: string;
  points: SnapPoint[];
  boundingBox: {
    min: Vec3;
    max: Vec3;
    center: Vec3;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Rotate a point around Y axis (for cabinet rotation)
 */
function rotateY(point: Vec3, angle: number, pivot: Vec3): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  return {
    x: pivot.x + dx * cos - dz * sin,
    y: point.y,
    z: pivot.z + dx * sin + dz * cos,
  };
}

/**
 * Generate snap points for a cabinet
 */
function generateSnapPoints(
  cabinetId: string,
  position: [number, number, number],
  dimensions: { width: number; height: number; depth: number },
  rotationY: number = 0
): SnapPoint[] {
  const [px, py, pz] = position;
  const { width, height, depth } = dimensions;
  const pivot: Vec3 = { x: px + width / 2, y: py, z: pz + depth / 2 };

  const points: SnapPoint[] = [];
  let pointIndex = 0;

  // Corner points (8 corners of the bounding box)
  const corners: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    // Bottom corners
    { pos: { x: px, y: py, z: pz }, face: 'front' },
    { pos: { x: px + width, y: py, z: pz }, face: 'front' },
    { pos: { x: px, y: py, z: pz + depth }, face: 'back' },
    { pos: { x: px + width, y: py, z: pz + depth }, face: 'back' },
    // Top corners
    { pos: { x: px, y: py + height, z: pz }, face: 'top' },
    { pos: { x: px + width, y: py + height, z: pz }, face: 'top' },
    { pos: { x: px, y: py + height, z: pz + depth }, face: 'top' },
    { pos: { x: px + width, y: py + height, z: pz + depth }, face: 'top' },
  ];

  for (const corner of corners) {
    const rotated = rotationY !== 0 ? rotateY(corner.pos, rotationY, pivot) : corner.pos;
    points.push({
      id: `${cabinetId}-corner-${pointIndex++}`,
      position: rotated,
      type: 'corner',
      cabinetId,
      face: corner.face,
    });
  }

  // Edge midpoints (horizontal edges at bottom, for side-by-side snapping)
  const edgeMids: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    // Front edge
    { pos: { x: px + width / 2, y: py, z: pz }, face: 'front' },
    // Back edge
    { pos: { x: px + width / 2, y: py, z: pz + depth }, face: 'back' },
    // Left edge
    { pos: { x: px, y: py, z: pz + depth / 2 }, face: 'left' },
    // Right edge
    { pos: { x: px + width, y: py, z: pz + depth / 2 }, face: 'right' },
  ];

  for (const edge of edgeMids) {
    const rotated = rotationY !== 0 ? rotateY(edge.pos, rotationY, pivot) : edge.pos;
    points.push({
      id: `${cabinetId}-edge-${pointIndex++}`,
      position: rotated,
      type: 'edge-mid',
      cabinetId,
      face: edge.face,
    });
  }

  // Face centers (for face-to-face alignment)
  const faceCenters: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    // Front face center
    { pos: { x: px + width / 2, y: py + height / 2, z: pz }, face: 'front' },
    // Back face center
    { pos: { x: px + width / 2, y: py + height / 2, z: pz + depth }, face: 'back' },
    // Left face center
    { pos: { x: px, y: py + height / 2, z: pz + depth / 2 }, face: 'left' },
    // Right face center
    { pos: { x: px + width, y: py + height / 2, z: pz + depth / 2 }, face: 'right' },
  ];

  for (const faceCenter of faceCenters) {
    const rotated = rotationY !== 0 ? rotateY(faceCenter.pos, rotationY, pivot) : faceCenter.pos;
    points.push({
      id: `${cabinetId}-face-${pointIndex++}`,
      position: rotated,
      type: 'face-center',
      cabinetId,
      face: faceCenter.face,
    });
  }

  // Cabinet center (for center-to-center alignment)
  const center: Vec3 = {
    x: px + width / 2,
    y: py + height / 2,
    z: pz + depth / 2,
  };
  points.push({
    id: `${cabinetId}-center`,
    position: center, // Center doesn't need rotation
    type: 'center',
    cabinetId,
  });

  return points;
}

/**
 * Generate snap points from a world bounding box (from SceneRegistry)
 */
function generateSnapPointsFromWorldBox(
  cabinetId: string,
  worldBox: WorldBoundingBox
): SnapPoint[] {
  const { min, max, center } = worldBox;
  const points: SnapPoint[] = [];
  let pointIndex = 0;

  // Corner points (8 corners) - already in world space
  const corners: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    // Bottom corners (Y = min.y)
    { pos: { x: min.x, y: min.y, z: min.z }, face: 'front' },
    { pos: { x: max.x, y: min.y, z: min.z }, face: 'front' },
    { pos: { x: min.x, y: min.y, z: max.z }, face: 'back' },
    { pos: { x: max.x, y: min.y, z: max.z }, face: 'back' },
    // Top corners (Y = max.y)
    { pos: { x: min.x, y: max.y, z: min.z }, face: 'top' },
    { pos: { x: max.x, y: max.y, z: min.z }, face: 'top' },
    { pos: { x: min.x, y: max.y, z: max.z }, face: 'top' },
    { pos: { x: max.x, y: max.y, z: max.z }, face: 'top' },
  ];

  for (const corner of corners) {
    points.push({
      id: `${cabinetId}-corner-${pointIndex++}`,
      position: corner.pos,
      type: 'corner',
      cabinetId,
      face: corner.face,
    });
  }

  // Edge midpoints (bottom horizontal edges)
  const edgeMids: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    { pos: { x: center.x, y: min.y, z: min.z }, face: 'front' },
    { pos: { x: center.x, y: min.y, z: max.z }, face: 'back' },
    { pos: { x: min.x, y: min.y, z: center.z }, face: 'left' },
    { pos: { x: max.x, y: min.y, z: center.z }, face: 'right' },
  ];

  for (const edge of edgeMids) {
    points.push({
      id: `${cabinetId}-edge-${pointIndex++}`,
      position: edge.pos,
      type: 'edge-mid',
      cabinetId,
      face: edge.face,
    });
  }

  // Face centers
  const faceCenters: Array<{ pos: Vec3; face: SnapPoint['face'] }> = [
    { pos: { x: center.x, y: center.y, z: min.z }, face: 'front' },
    { pos: { x: center.x, y: center.y, z: max.z }, face: 'back' },
    { pos: { x: min.x, y: center.y, z: center.z }, face: 'left' },
    { pos: { x: max.x, y: center.y, z: center.z }, face: 'right' },
  ];

  for (const faceCenter of faceCenters) {
    points.push({
      id: `${cabinetId}-face-${pointIndex++}`,
      position: faceCenter.pos,
      type: 'face-center',
      cabinetId,
      face: faceCenter.face,
    });
  }

  // Cabinet center
  points.push({
    id: `${cabinetId}-center`,
    position: center,
    type: 'center',
    cabinetId,
  });

  return points;
}

// ============================================
// HOOK
// ============================================

/**
 * Hook to get snap targets from all other cabinets in the scene
 *
 * Uses SceneRegistry for accurate world bounding boxes when available,
 * falls back to dimension-based calculation with Y rotation support.
 *
 * @param excludeCabinetId - Cabinet ID to exclude (the one being moved)
 * @returns Array of snap target sets, one per cabinet
 */
export function useSnapTargets(excludeCabinetId: string): SnapTargetSet[] {
  const cabinets = useCabinetStore((s) => s.cabinets);
  const { getWorldBox, isRegistered } = useSceneRegistry();

  return useMemo(() => {
    return cabinets
      .filter((c) => c.id !== excludeCabinetId)
      .map((cabinet) => {
        // Try to get world box from registry first (most accurate)
        const worldBox = isRegistered(cabinet.id) ? getWorldBox(cabinet.id) : null;

        if (worldBox) {
          // Use accurate world bounding box from SceneRegistry
          const points = generateSnapPointsFromWorldBox(cabinet.id, worldBox);
          return {
            cabinetId: cabinet.id,
            points,
            boundingBox: {
              min: worldBox.min,
              max: worldBox.max,
              center: worldBox.center,
            },
          };
        }

        // Fallback: Calculate from dimensions + position + rotation
        const position = (cabinet as any).scenePosition || [0, 0, 0];
        const rotationY = (cabinet as any).sceneRotation?.[1] || 0;
        const { width, height, depth } = cabinet.dimensions;

        const points = generateSnapPoints(
          cabinet.id,
          position,
          { width, height, depth },
          rotationY
        );

        // Calculate bounding box
        const min: Vec3 = { x: position[0], y: position[1], z: position[2] };
        const max: Vec3 = {
          x: position[0] + width,
          y: position[1] + height,
          z: position[2] + depth,
        };
        const center: Vec3 = {
          x: (min.x + max.x) / 2,
          y: (min.y + max.y) / 2,
          z: (min.z + max.z) / 2,
        };

        return {
          cabinetId: cabinet.id,
          points,
          boundingBox: { min, max, center },
        };
      });
  }, [cabinets, excludeCabinetId, getWorldBox, isRegistered]);
}

/**
 * Get all snap points flattened from all target sets
 */
export function useAllSnapPoints(excludeCabinetId: string): SnapPoint[] {
  const targetSets = useSnapTargets(excludeCabinetId);
  return useMemo(() => {
    return targetSets.flatMap((set) => set.points);
  }, [targetSets]);
}

/**
 * Find the closest snap point to a given position
 */
export function findClosestSnapPoint(
  position: Vec3,
  points: SnapPoint[],
  maxDistance: number = 100 // mm
): SnapPoint | null {
  let closest: SnapPoint | null = null;
  let minDist = maxDistance;

  for (const point of points) {
    const dx = position.x - point.position.x;
    const dy = position.y - point.position.y;
    const dz = position.z - point.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < minDist) {
      minDist = dist;
      closest = point;
    }
  }

  return closest;
}

export default useSnapTargets;
