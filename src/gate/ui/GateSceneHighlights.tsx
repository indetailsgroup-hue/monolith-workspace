/**
 * GateSceneHighlights
 *
 * R3F component that renders visual markers at selected entity positions.
 * Shows pulsing spheres at DrillMapPoint locations when Gate findings are selected.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { useGateStore } from './gateStore';
import { getEntityPositions } from './selectionResolvers';
import { useSelectedFinding } from './gateStore';
import { SEVERITY_COLORS } from './gateTypes';

// ============================================
// CONSTANTS
// ============================================

/** Default highlight color (blue) */
const DEFAULT_COLOR = '#3b82f6';

/** Scale from mm to Three.js units (meters) */
const MM_TO_METERS = 0.001;

/** Base size of highlight marker in meters */
const MARKER_BASE_SIZE = 0.015; // 15mm

/** Pulse animation speed */
const PULSE_SPEED = 2;

/** Pulse amplitude (scale multiplier) */
const PULSE_AMPLITUDE = 0.3;

// ============================================
// MARKER COMPONENT
// ============================================

interface HighlightMarkerProps {
  position: [number, number, number];
  color: string;
  index: number;
}

function HighlightMarker({ position, color, index }: HighlightMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Animation: pulsing scale
  useFrame((state) => {
    if (!meshRef.current) return;

    // Offset phase by index for visual interest
    const phase = state.clock.elapsedTime * PULSE_SPEED + index * 0.5;
    const pulse = 1 + Math.sin(phase) * PULSE_AMPLITUDE;

    meshRef.current.scale.setScalar(pulse);
  });

  // Convert mm position to meters
  const pos: [number, number, number] = [
    position[0] * MM_TO_METERS,
    position[1] * MM_TO_METERS,
    position[2] * MM_TO_METERS,
  ];

  return (
    <group position={pos}>
      {/* Outer ring (wireframe) */}
      <mesh ref={meshRef}>
        <ringGeometry args={[MARKER_BASE_SIZE * 0.8, MARKER_BASE_SIZE, 32]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner sphere */}
      <mesh>
        <sphereGeometry args={[MARKER_BASE_SIZE * 0.3, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Glow effect */}
      <mesh>
        <sphereGeometry args={[MARKER_BASE_SIZE * 1.2, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
        />
      </mesh>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GateSceneHighlights() {
  const drillMap = useDrillMapStore(s => s.drillMap);
  const selectedEntityIds = useGateStore(s => s.selectedEntityIds);
  const selectedFinding = useSelectedFinding();

  // Get color from finding severity
  const color = selectedFinding
    ? SEVERITY_COLORS[selectedFinding.severity]
    : DEFAULT_COLOR;

  // Get positions for selected entities
  const positions = React.useMemo(() => {
    if (selectedEntityIds.length === 0) return [];
    return Array.from(getEntityPositions(drillMap, selectedEntityIds).values());
  }, [drillMap, selectedEntityIds]);

  // Don't render if no entities selected
  if (positions.length === 0) {
    return null;
  }

  return (
    <group name="gate-scene-highlights">
      {positions.map((pos, index) => (
        <HighlightMarker
          key={`${selectedEntityIds[index] || index}`}
          position={pos}
          color={color}
          index={index}
        />
      ))}
    </group>
  );
}

export default GateSceneHighlights;
