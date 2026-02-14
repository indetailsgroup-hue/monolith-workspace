/**
 * PlanarGridOverlay.tsx - Visual Grid for Plane Drag with Step Snap
 *
 * FEATURES:
 * - Shows grid lines on the active drag plane
 * - Only visible when stepMm is set (not continuous)
 * - Grid aligned to plane basis (u/v axes)
 * - Fade effect at edges for cleaner look
 * - Highlight origin lines (0-line)
 *
 * USAGE:
 * Render when: gizmo is dragging, handle is PLANE, stepMm is set
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';

// ============================================
// TYPES
// ============================================

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlanarGridOverlayProps {
  /** Whether to show the grid */
  visible: boolean;
  /** Grid origin in world space (mm) */
  originWorld: Vec3;
  /** First basis vector (U axis) */
  u: Vec3;
  /** Second basis vector (V axis) */
  v: Vec3;
  /** Plane normal (for offset) */
  normal: Vec3;
  /** Grid step size in mm */
  stepMm: number;
  /** Extent of grid in mm (half-width) */
  extentMm?: number;
  /** Number of grid lines each side of origin */
  linesEachSide?: number;
  /** Grid line color */
  color?: string;
  /** Origin line color (0-lines) */
  originColor?: string;
  /** Grid line opacity */
  opacity?: number;
  /** Offset from plane to prevent z-fighting */
  offsetMm?: number;
}

// ============================================
// HELPERS
// ============================================

function toThreeVector(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

// ============================================
// COMPONENT
// ============================================

export function PlanarGridOverlay({
  visible,
  originWorld,
  u,
  v,
  normal,
  stepMm,
  extentMm = 1000,
  linesEachSide = 12,
  color = '#ffffff',
  originColor = '#88ff88',
  opacity = 0.15,
  offsetMm = 0.5,
}: PlanarGridOverlayProps) {
  // Generate grid geometry
  const { gridGeom, originGeom } = useMemo(() => {
    const gridPositions: number[] = [];
    const originPositions: number[] = [];

    // Convert to Three.js vectors
    const origin = toThreeVector(originWorld);
    const uDir = toThreeVector(u).normalize();
    const vDir = toThreeVector(v).normalize();
    const nDir = toThreeVector(normal).normalize();

    // Offset origin slightly along normal to prevent z-fighting
    const offsetOrigin = origin.clone().add(nDir.multiplyScalar(offsetMm));

    const step = Math.max(1e-6, stepMm);
    const halfExtent = Math.min(extentMm, step * linesEachSide);
    const N = Math.floor(halfExtent / step);

    for (let i = -N; i <= N; i++) {
      const offset = i * step;

      // Line parallel to U at V-offset
      const a1 = offsetOrigin.clone()
        .add(vDir.clone().multiplyScalar(offset))
        .add(uDir.clone().multiplyScalar(-halfExtent));
      const b1 = offsetOrigin.clone()
        .add(vDir.clone().multiplyScalar(offset))
        .add(uDir.clone().multiplyScalar(+halfExtent));

      // Line parallel to V at U-offset
      const a2 = offsetOrigin.clone()
        .add(uDir.clone().multiplyScalar(offset))
        .add(vDir.clone().multiplyScalar(-halfExtent));
      const b2 = offsetOrigin.clone()
        .add(uDir.clone().multiplyScalar(offset))
        .add(vDir.clone().multiplyScalar(+halfExtent));

      // Origin lines (i === 0) go to separate geometry for different color
      if (i === 0) {
        originPositions.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
        originPositions.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
      } else {
        gridPositions.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
        gridPositions.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
      }
    }

    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));

    const originGeom = new THREE.BufferGeometry();
    originGeom.setAttribute('position', new THREE.Float32BufferAttribute(originPositions, 3));

    return { gridGeom, originGeom };
  }, [originWorld, u, v, normal, stepMm, extentMm, linesEachSide, offsetMm]);

  if (!visible) return null;

  return (
    <group>
      {/* Regular grid lines */}
      <lineSegments geometry={gridGeom}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthTest={true}
          depthWrite={false}
        />
      </lineSegments>

      {/* Origin lines (highlighted) */}
      <lineSegments geometry={originGeom}>
        <lineBasicMaterial
          color={originColor}
          transparent
          opacity={opacity * 2}
          depthTest={true}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

export default PlanarGridOverlay;
