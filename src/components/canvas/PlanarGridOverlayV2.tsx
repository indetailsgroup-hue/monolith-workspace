/**
 * PlanarGridOverlayV2.tsx - DCC-Grade Grid with Fade + Major/Minor Lines
 *
 * FEATURES:
 * - 3-layer grid: minor (faint), major (stronger), axes (brightest)
 * - Ring-based fade: lines further from origin are more transparent
 * - Major lines every N steps (configurable)
 * - 0-lines (axes) highlighted for orientation
 *
 * USAGE:
 * Render when: gizmo is dragging plane, stepMm is set (not continuous)
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

export interface PlanarGridOverlayV2Props {
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
  /** Major line every N steps (e.g., 10 = major every 10 steps) */
  majorEvery?: number;
  /** Number of fade rings (more = smoother fade) */
  ringCount?: number;
  /** Minor line color */
  minorColor?: string;
  /** Major line color */
  majorColor?: string;
  /** Axis line color (0-lines) */
  axisColor?: string;
  /** Base opacity for minor lines */
  minorOpacity?: number;
  /** Opacity boost for major lines */
  majorOpacityBoost?: number;
  /** Opacity for axis lines */
  axisOpacity?: number;
  /** Offset from plane to prevent z-fighting */
  offsetMm?: number;
}

// ============================================
// HELPERS
// ============================================

function toThreeVector(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

interface GridGeometryData {
  /** Minor line geometries per ring (for fade) */
  minor: THREE.BufferGeometry[];
  /** Major line geometries per ring (for fade) */
  major: THREE.BufferGeometry[];
  /** Axis line geometries (0-lines) */
  axes: THREE.BufferGeometry[];
  /** Number of rings */
  rings: number;
}

function buildGridGeometry(args: {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
  step: number;
  half: number;
  majorEvery: number;
  ringCount: number;
  offsetMm: number;
}): GridGeometryData {
  const { origin, u, v, normal, step, half, majorEvery, ringCount, offsetMm } = args;

  const rings = Math.max(1, ringCount);
  const ringSize = half / rings;
  const N = Math.floor(half / step);

  // Offset origin slightly along normal to prevent z-fighting
  const offsetOrigin = origin.clone().add(normal.clone().multiplyScalar(offsetMm));

  // Helper to pick ring index by distance from origin
  const ringIndex = (dist: number) =>
    Math.min(rings - 1, Math.max(0, Math.floor(Math.abs(dist) / ringSize)));

  // Positions per ring for minor/major
  const minorPos: number[][] = Array.from({ length: rings }, () => []);
  const majorPos: number[][] = Array.from({ length: rings }, () => []);
  const axesPos: number[] = [];

  for (let i = -N; i <= N; i++) {
    const off = i * step;
    const r = ringIndex(off);

    const isAxis = i === 0;
    const isMajor = majorEvery > 0 && i !== 0 && (i % majorEvery === 0);

    // Line parallel to U at V-offset
    {
      const a = offsetOrigin.clone()
        .add(v.clone().multiplyScalar(off))
        .add(u.clone().multiplyScalar(-half));
      const b = offsetOrigin.clone()
        .add(v.clone().multiplyScalar(off))
        .add(u.clone().multiplyScalar(+half));

      if (isAxis) {
        axesPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      } else if (isMajor) {
        majorPos[r].push(a.x, a.y, a.z, b.x, b.y, b.z);
      } else {
        minorPos[r].push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    // Line parallel to V at U-offset
    {
      const a = offsetOrigin.clone()
        .add(u.clone().multiplyScalar(off))
        .add(v.clone().multiplyScalar(-half));
      const b = offsetOrigin.clone()
        .add(u.clone().multiplyScalar(off))
        .add(v.clone().multiplyScalar(+half));

      if (isAxis) {
        axesPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      } else if (isMajor) {
        majorPos[r].push(a.x, a.y, a.z, b.x, b.y, b.z);
      } else {
        minorPos[r].push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }

  // Build geometries
  const minor: THREE.BufferGeometry[] = [];
  const major: THREE.BufferGeometry[] = [];

  for (let r = 0; r < rings; r++) {
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(minorPos[r], 3));
    minor.push(g1);

    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(majorPos[r], 3));
    major.push(g2);
  }

  const gAxes = new THREE.BufferGeometry();
  gAxes.setAttribute('position', new THREE.Float32BufferAttribute(axesPos, 3));

  return { minor, major, axes: [gAxes], rings };
}

// ============================================
// COMPONENT
// ============================================

export function PlanarGridOverlayV2({
  visible,
  originWorld,
  u,
  v,
  normal,
  stepMm,
  extentMm = 1000,
  majorEvery = 10,
  ringCount = 4,
  minorColor = '#ffffff',
  majorColor = '#88ccff',
  axisColor = '#88ff88',
  minorOpacity = 0.12,
  majorOpacityBoost = 0.18,
  axisOpacity = 0.7,
  offsetMm = 0.5,
}: PlanarGridOverlayV2Props) {
  // Generate grid geometry
  const data = useMemo(() => {
    const origin = toThreeVector(originWorld);
    const uDir = toThreeVector(u).normalize();
    const vDir = toThreeVector(v).normalize();
    const nDir = toThreeVector(normal).normalize();

    const step = Math.max(1e-6, stepMm);
    const half = Math.min(extentMm, step * 100); // Limit to 100 lines each side max

    return buildGridGeometry({
      origin,
      u: uDir,
      v: vDir,
      normal: nDir,
      step,
      half,
      majorEvery: Math.max(0, majorEvery),
      ringCount: Math.max(1, ringCount),
      offsetMm,
    });
  }, [originWorld, u, v, normal, stepMm, extentMm, majorEvery, ringCount, offsetMm]);

  // Calculate ring opacity with fade
  const ringOpacity = (r: number, baseOpacity: number): number => {
    if (data.rings <= 1) return baseOpacity;
    const t = r / (data.rings - 1); // 0..1
    // Ease-out fade: inner rings stronger
    const fadeFactor = 1 - t * 0.6; // Reduce to 40% at outermost ring
    return baseOpacity * fadeFactor;
  };

  if (!visible) return null;

  return (
    <group>
      {/* Minor grid lines (faintest, per ring) */}
      {data.minor.map((geom, ringIdx) => (
        <lineSegments key={`minor-${ringIdx}`} geometry={geom}>
          <lineBasicMaterial
            color={minorColor}
            transparent
            opacity={ringOpacity(ringIdx, minorOpacity)}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      ))}

      {/* Major grid lines (stronger, per ring) */}
      {data.major.map((geom, ringIdx) => (
        <lineSegments key={`major-${ringIdx}`} geometry={geom}>
          <lineBasicMaterial
            color={majorColor}
            transparent
            opacity={ringOpacity(ringIdx, minorOpacity + majorOpacityBoost)}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      ))}

      {/* Axis lines (0-lines, brightest) */}
      {data.axes.map((geom, idx) => (
        <lineSegments key={`axis-${idx}`} geometry={geom}>
          <lineBasicMaterial
            color={axisColor}
            transparent
            opacity={axisOpacity}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

export default PlanarGridOverlayV2;
