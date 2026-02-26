/**
 * MinifixDrillMarkersLocal.tsx — Flip-aware drill markers for Minifix preview
 *
 * Renders drill point indicators (crosshair + circle + Ø label) as children
 * of the hardware preview group so they inherit the same transform (including
 * Vertical/Horizontal Flip).
 *
 * This is a lightweight overlay that renders ONLY the points sharing a
 * pairKeyV2 root with the current Minifix connector — it does NOT replace
 * CADDrillIndicators which remains the cabinet-wide overlay.
 *
 * Positions are converted to LOCAL space relative to the parent group's
 * pivot (= groupPosition in Hardware3DOverlay) so the parent group's
 * rotation/flip propagates automatically.
 *
 * @version 1.0.0
 */

import React, { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillPurpose,
  Vec3Tuple,
} from '../../core/manufacturing/drillMap/types';

// ============================================
// CONSTANTS (match CADDrillIndicators)
// ============================================

const CAD_COLORS: Record<DrillPurpose, string> = {
  CAM_LOCK: '#fbbf24',
  BOLT: '#60a5fa',
  BOLT_ENTRY: '#06b6d4',
  BOLT_THREAD: '#c4b5fd',
  DOWEL: '#a78bfa',
  SHELF_PIN: '#4ade80',
  HINGE: '#f87171',
  MINIFIX: '#fbbf24',
  DRAWER_SLIDE: '#22d3ee',
  OTHER: '#9ca3af',
};

const CROSSHAIR_RATIO = 0.7;
const CIRCLE_SEGMENTS = 32;
const SURFACE_OFFSET = 0; // flush — group handles the positioning

// ============================================
// HELPERS
// ============================================

/** Rotation to align Z-up indicator plane with the drill normal */
function orientationFromNormal(normal: Vec3Tuple): THREE.Euler {
  const up = new THREE.Vector3(0, 0, 1);
  const n = new THREE.Vector3(...normal).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(up, n);
  return new THREE.Euler().setFromQuaternion(q);
}

/** Offset position slightly away from material along -normal */
function offsetPosition(pos: Vec3Tuple, normal: Vec3Tuple, offset: number): Vec3Tuple {
  return [
    pos[0] - normal[0] * offset,
    pos[1] - normal[1] * offset,
    pos[2] - normal[2] * offset,
  ];
}

// ============================================
// PURPOSES TO RENDER
// ============================================

/** Only render markers for Minifix-related drill purposes */
const MINIFIX_PURPOSES = new Set<string>([
  'CAM_LOCK', 'MINIFIX', 'BOLT', 'BOLT_ENTRY', 'BOLT_THREAD', 'DOWEL',
]);

// ============================================
// SINGLE MARKER
// ============================================

interface LocalMarkerProps {
  point: DrillMapPoint;
  localPosition: Vec3Tuple;
  lineWidth: number;
}

function LocalMarker({ point, localPosition, lineWidth }: LocalMarkerProps) {
  const color = CAD_COLORS[point.purpose] || CAD_COLORS.OTHER;
  const rotation = useMemo(() => orientationFromNormal(point.normal), [point.normal]);

  const radius = point.diameter / 2;
  const arm = radius * CROSSHAIR_RATIO;

  const circlePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    return pts;
  }, [radius]);

  return (
    <group position={localPosition} rotation={rotation}>
      {/* Circle outline */}
      <Line points={circlePoints} color={color} lineWidth={lineWidth} transparent opacity={0.8} />

      {/* Crosshair */}
      <Line
        points={[new THREE.Vector3(-arm, 0, 0), new THREE.Vector3(arm, 0, 0)]}
        color={color} lineWidth={lineWidth * 0.8} transparent opacity={0.7}
      />
      <Line
        points={[new THREE.Vector3(0, -arm, 0), new THREE.Vector3(0, arm, 0)]}
        color={color} lineWidth={lineWidth * 0.8} transparent opacity={0.7}
      />

      {/* Ø label */}
      <Html position={[radius + 3, radius + 3, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.75)',
          color,
          fontSize: '10px',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          padding: '2px 4px',
          borderRadius: '2px',
          border: `1px solid ${color}`,
          whiteSpace: 'nowrap',
        }}>
          Ø{point.diameter}
        </div>
      </Html>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export interface MinifixDrillMarkersLocalProps {
  drillMap: DrillMap | null;
  pairKeyV2: string | undefined;
  pivotWorld: Vec3Tuple;
  lineWidth?: number;
}

/**
 * Flip-aware drill markers for a single Minifix connector.
 *
 * Must be rendered as a CHILD of the hardware preview group so that
 * the parent group's rotation (including Vertical/Horizontal Flip)
 * propagates to all markers automatically.
 */
export function MinifixDrillMarkersLocal({
  drillMap,
  pairKeyV2,
  pivotWorld,
  lineWidth = 2,
}: MinifixDrillMarkersLocalProps) {
  const markers = useMemo(() => {
    if (!drillMap?.panels || !pairKeyV2) return [];

    // Collect all points from all panels
    const allPoints: DrillMapPoint[] = [];
    for (const panel of drillMap.panels) {
      if (panel.points) allPoints.push(...panel.points);
    }

    // pairKeyV2 root matching: A-run points share the root key
    // BOLT/CAM_LOCK/BOLT_ENTRY/BOLT_THREAD use exact pairKeyV2
    // DOWEL uses pairKeyV2 + suffix (-dowel-side, -dowel-horiz)
    const matched = allPoints.filter(
      (p) => p.pairKeyV2?.startsWith(pairKeyV2) && MINIFIX_PURPOSES.has(p.purpose)
    );

    return matched.map((p) => {
      const posW = offsetPosition(p.position, p.normal, SURFACE_OFFSET);
      // Convert world → local by subtracting parent group pivot
      const localPos: Vec3Tuple = [
        posW[0] - pivotWorld[0],
        posW[1] - pivotWorld[1],
        posW[2] - pivotWorld[2],
      ];
      return { point: p, localPos };
    });
  }, [drillMap, pairKeyV2, pivotWorld]);

  if (markers.length === 0) return null;

  return (
    <group name="minifix-drill-markers-local">
      {markers.map(({ point, localPos }) => (
        <LocalMarker
          key={point.id}
          point={point}
          localPosition={localPos}
          lineWidth={lineWidth}
        />
      ))}
    </group>
  );
}
