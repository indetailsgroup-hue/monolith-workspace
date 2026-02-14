/**
 * Snap System - Position Snapping (Stub)
 *
 * Provides snap-to-grid and snap-to-object functionality.
 */

import type { Vec3 } from '../types/SnapTypes';
import type { CabinetDimensions } from '../types/Cabinet';

// ============================================
// TYPES
// ============================================

export interface SnapTarget {
  id: string;
  position: Vec3 | number[];
  dimensions?: CabinetDimensions;
  rotation?: number;
  type?: 'grid' | 'edge' | 'face' | 'point';
  distance?: number;
}

export interface SnapOptions {
  gridSize?: number;
  enableVertexSnap?: boolean;
  enableEdgeSnap?: boolean;
  enableFaceSnap?: boolean;
  enableCenterSnap?: boolean;
  enableGridSnap?: boolean;
  enableWallSnap?: boolean;
}

export interface SnapResult {
  snapped: boolean;
  position: number[] & { x?: number; y?: number; z?: number };
  target: SnapTarget | null;
}

// ============================================
// SNAP CALCULATOR (STUB)
// ============================================

/**
 * Calculate snap for a position.
 * Stub: returns no-snap result.
 */
export function calculateSnap(
  _movingTarget: SnapTarget | Vec3,
  _targets?: SnapTarget[],
  _options?: SnapOptions
): SnapResult {
  // Extract position from moving target
  const pos = 'x' in _movingTarget && 'y' in _movingTarget && 'z' in _movingTarget
    ? [(_movingTarget as Vec3).x, (_movingTarget as Vec3).y, (_movingTarget as Vec3).z]
    : Array.isArray((_movingTarget as SnapTarget).position)
      ? (_movingTarget as SnapTarget).position as number[]
      : [0, 0, 0];

  return {
    snapped: false,
    position: pos as number[] & { x?: number; y?: number; z?: number },
    target: null,
  };
}
