/**
 * DrillGuideLayer — Red drill guide lines visualization
 *
 * Shows red guide lines at joints when Drill Guide tool is active:
 * 1. Hotspot spheres at each joint corner (selectJoint mode)
 * 2. Red axis lines from entry → depth end (active mode)
 * 3. Circles at drill mouth perpendicular to drill axis
 * 4. Labels with Ø × depth + purpose
 *
 * Reads from useDrillGuideStore + useDrillMapStore.
 * v0.1 — initial implementation
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line, Html } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import { useDrillGuideStore } from '../../core/store/useDrillGuideStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import type { DrillMap, DrillMapPoint, Vec3Tuple } from '../../core/manufacturing/drillMap/types';

// ============================================
// CONSTANTS
// ============================================

const RED = '#ff0000';
const RED_DIM = '#ff4444';
const HOTSPOT_RADIUS = 8; // mm
const CIRCLE_SEGMENTS = 32;
const LINE_WIDTH = 3;
const CIRCLE_LINE_WIDTH = 2;

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

// ============================================
// HELPER: Build circle points perpendicular to axis
// ============================================

function buildCirclePoints(
  center: THREE.Vector3,
  axis: THREE.Vector3,
  radius: number,
  segments: number = CIRCLE_SEGMENTS
): THREE.Vector3[] {
  // Find two perpendicular vectors to axis
  const w = axis.clone().normalize();
  const a = Math.abs(w.dot(UP)) < 0.99 ? UP.clone() : RIGHT.clone();
  const u = new THREE.Vector3().crossVectors(a, w).normalize();
  const v = new THREE.Vector3().crossVectors(w, u);

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(
      center.clone()
        .add(u.clone().multiplyScalar(Math.cos(theta) * radius))
        .add(v.clone().multiplyScalar(Math.sin(theta) * radius))
    );
  }
  return points;
}

// ============================================
// HELPER: Format purpose for label
// ============================================

function formatPurpose(purpose: string): string {
  switch (purpose) {
    case 'CAM_LOCK':
    case 'MINIFIX':
      return 'CAM';
    case 'BOLT':
      return 'BOLT';
    case 'DOWEL':
      return 'DOWEL';
    default:
      return purpose;
  }
}

// ============================================
// SUB-COMPONENT: Single Drill Guide
// ============================================

interface DrillGuideProps {
  point: DrillMapPoint;
  opacity: number;
}

function DrillGuide({ point, opacity }: DrillGuideProps) {
  const { entry, end, axis, circlePoints } = useMemo(() => {
    const e = new THREE.Vector3(...point.position);
    const a = new THREE.Vector3(...point.normal).normalize();
    const en = e.clone().add(a.clone().multiplyScalar(point.depth));
    const cp = buildCirclePoints(e, a, point.diameter / 2);
    return { entry: e, end: en, axis: a, circlePoints: cp };
  }, [point.position, point.normal, point.depth, point.diameter]);

  const label = `Ø${point.diameter} × ${point.depth}  ${formatPurpose(point.purpose)}`;

  // Label offset: slightly above and to the side of entry
  const labelOffset = useMemo(() => {
    const offset = new THREE.Vector3(0, 12, 0); // 12mm above
    return [
      entry.x + offset.x,
      entry.y + offset.y,
      entry.z + offset.z,
    ] as [number, number, number];
  }, [entry]);

  return (
    <group>
      {/* Red axis line: entry → end */}
      <Line
        points={[entry, end]}
        color={RED}
        lineWidth={LINE_WIDTH}
        transparent
        opacity={opacity}
        depthTest={false}
        renderOrder={999}
      />

      {/* Circle at entry (drill mouth) */}
      <Line
        points={circlePoints}
        color={RED}
        lineWidth={CIRCLE_LINE_WIDTH}
        transparent
        opacity={opacity}
        depthTest={false}
        renderOrder={999}
      />

      {/* Label */}
      {opacity > 0.5 && (
        <Html
          position={labelOffset}
          center
          distanceFactor={400}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: '#1a1a2e',
              border: `1px solid ${RED}`,
              borderRadius: '4px',
              padding: '2px 6px',
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// SUB-COMPONENT: Joint Hotspot Sphere
// ============================================

interface HotspotSphereProps {
  jointKey: string;
  position: Vec3Tuple;
  label: string;
  isSelected: boolean;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
}

function HotspotSphere({
  jointKey,
  position,
  label,
  isSelected,
  isHovered,
  onHover,
  onClick,
}: HotspotSphereProps) {
  const geometry = useMemo(() => new THREE.SphereGeometry(HOTSPOT_RADIUS, 16, 16), []);

  const opacity = isSelected ? 0.95 : isHovered ? 0.8 : 0.5;
  const scale = isSelected ? 1.3 : isHovered ? 1.15 : 1.0;

  return (
    <group position={position}>
      <mesh
        geometry={geometry}
        scale={scale}
        renderOrder={998}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = 'default';
        }}
      >
        <meshBasicMaterial
          color={RED}
          transparent
          opacity={opacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Joint label on hover/select */}
      {(isHovered || isSelected) && (
        <Html
          position={[0, HOTSPOT_RADIUS + 8, 0]}
          center
          distanceFactor={400}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: isSelected ? RED : '#1a1a2e',
              border: `1px solid ${RED}`,
              borderRadius: '4px',
              padding: '2px 8px',
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              fontWeight: isSelected ? 600 : 400,
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DrillGuideLayer() {
  const mode = useDrillGuideStore((s) => s.mode);
  const hoveredJointKey = useDrillGuideStore((s) => s.hoveredJointKey);
  const selectedJointKey = useDrillGuideStore((s) => s.selectedJointKey);
  const jointMap = useDrillGuideStore((s) => s.jointMap);
  const hotspots = useDrillGuideStore((s) => s.hotspots);
  const setHovered = useDrillGuideStore((s) => s.setHovered);
  const selectJoint = useDrillGuideStore((s) => s.selectJoint);

  // Rebuild jointMap when drillMap changes (e.g. cabinet resize)
  const drillMap = useDrillMapStore((s) => s.drillMap) as DrillMap | null;
  const rebuildFromDrillMap = useDrillGuideStore((s) => s.rebuildFromDrillMap);

  useEffect(() => {
    if (drillMap && mode !== 'idle') {
      rebuildFromDrillMap(drillMap);
    }
  }, [drillMap, mode, rebuildFromDrillMap]);

  // Don't render anything if not in drill guide mode
  if (mode === 'idle') return null;

  // Get points for selected joint
  const selectedPoints = selectedJointKey ? jointMap.get(selectedJointKey) ?? [] : [];

  // Get points for hovered joint (preview)
  const hoveredPoints =
    hoveredJointKey && hoveredJointKey !== selectedJointKey
      ? jointMap.get(hoveredJointKey) ?? []
      : [];

  return (
    <group name="drill-guide-layer">
      {/* Hotspot spheres for all joints */}
      {hotspots.map((hotspot) => (
        <HotspotSphere
          key={hotspot.jointKey}
          jointKey={hotspot.jointKey}
          position={hotspot.worldPos}
          label={hotspot.label}
          isSelected={selectedJointKey === hotspot.jointKey}
          isHovered={hoveredJointKey === hotspot.jointKey}
          onHover={(hovered) => setHovered(hovered ? hotspot.jointKey : null)}
          onClick={() => selectJoint(hotspot.jointKey)}
        />
      ))}

      {/* Full guide lines for selected joint */}
      {selectedPoints.map((point) => (
        <DrillGuide
          key={point.id}
          point={point}
          opacity={1.0}
        />
      ))}

      {/* Ghost preview for hovered joint */}
      {hoveredPoints.map((point) => (
        <DrillGuide
          key={`hover-${point.id}`}
          point={point}
          opacity={0.4}
        />
      ))}
    </group>
  );
}
