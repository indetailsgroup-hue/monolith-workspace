/**
 * ConstructionPlane.tsx - 3D Construction Plane Visualization
 *
 * Renders the active construction plane with grid and axes.
 * Used for sketching reference in 3D space.
 *
 * Features:
 * - Grid lines with major/minor divisions
 * - Origin marker
 * - U/V axis indicators
 * - Plane kind indicator
 *
 * @version 1.0.0
 */

import React, { useMemo } from 'react';
import { useCPlane } from '../../core/cplane';
import * as THREE from 'three';
import { Line, Html } from '@react-three/drei';

// ============================================================================
// Constants
// ============================================================================

const COLORS = {
  gridMinor: '#333333',
  gridMajor: '#555555',
  axisU: '#ef4444',    // Red for U (X-like)
  axisV: '#22c55e',    // Green for V (Y-like)
  axisNormal: '#3b82f6', // Blue for Normal
  origin: '#f59e0b',   // Amber for origin
  plane: 'rgba(139, 92, 246, 0.05)', // Faint purple
};

// ============================================================================
// Grid Lines Component
// ============================================================================

interface GridLinesProps {
  gridSize: number;
  gridExtent: number;
}

function GridLines({ gridSize, gridExtent }: GridLinesProps) {
  const lines = useMemo(() => {
    const result: Array<{ points: [number, number, number][]; color: string }> = [];

    // Number of lines on each side
    const count = Math.floor(gridExtent / gridSize);

    // Generate U-direction lines (along V axis)
    for (let i = -count; i <= count; i++) {
      const u = i * gridSize;
      const isMajor = i % 10 === 0;
      result.push({
        points: [
          [u, 0, -gridExtent],
          [u, 0, gridExtent],
        ],
        color: isMajor ? COLORS.gridMajor : COLORS.gridMinor,
      });
    }

    // Generate V-direction lines (along U axis)
    for (let i = -count; i <= count; i++) {
      const v = i * gridSize;
      const isMajor = i % 10 === 0;
      result.push({
        points: [
          [-gridExtent, 0, v],
          [gridExtent, 0, v],
        ],
        color: isMajor ? COLORS.gridMajor : COLORS.gridMinor,
      });
    }

    return result;
  }, [gridSize, gridExtent]);

  return (
    <group name="cplane-grid">
      {lines.map((line, idx) => (
        <Line
          key={idx}
          points={line.points}
          color={line.color}
          lineWidth={1}
          transparent
          opacity={0.5}
        />
      ))}
    </group>
  );
}

// ============================================================================
// Axes Component
// ============================================================================

interface AxesProps {
  length: number;
}

function Axes({ length }: AxesProps) {
  return (
    <group name="cplane-axes">
      {/* U axis (Red) */}
      <Line
        points={[
          [0, 0, 0],
          [length, 0, 0],
        ]}
        color={COLORS.axisU}
        lineWidth={2}
      />
      <mesh position={[length + 50, 0, 0]}>
        <coneGeometry args={[20, 60, 8]} />
        <meshBasicMaterial color={COLORS.axisU} />
      </mesh>

      {/* V axis (Green) - maps to Z in XZ plane */}
      <Line
        points={[
          [0, 0, 0],
          [0, 0, length],
        ]}
        color={COLORS.axisV}
        lineWidth={2}
      />
      <mesh position={[0, 0, length + 50]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[20, 60, 8]} />
        <meshBasicMaterial color={COLORS.axisV} />
      </mesh>

      {/* Origin marker */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[15, 16, 16]} />
        <meshBasicMaterial color={COLORS.origin} />
      </mesh>
    </group>
  );
}

// ============================================================================
// Plane Label
// ============================================================================

interface PlaneLabelProps {
  kind: string;
  origin: [number, number, number];
}

function PlaneLabel({ kind, origin }: PlaneLabelProps) {
  return (
    <Html
      position={[origin[0] - 200, origin[1] + 50, origin[2] - 200]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: '#8b5cf6',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}
      >
        CPlane: {kind}
      </div>
    </Html>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ConstructionPlane() {
  const plane = useCPlane((s) => s.plane);
  const visible = useCPlane((s) => s.visible);

  // Calculate rotation based on plane normal
  const rotation = useMemo((): [number, number, number] => {
    switch (plane.kind) {
      case 'XZ':
        return [0, 0, 0]; // Floor plane (default)
      case 'XY':
        return [-Math.PI / 2, 0, 0]; // Front wall
      case 'YZ':
        return [0, 0, Math.PI / 2]; // Side wall
      default:
        return [0, 0, 0];
    }
  }, [plane.kind]);

  if (!visible) return null;

  return (
    <group
      name="construction-plane"
      position={plane.origin}
      rotation={rotation}
    >
      {/* Semi-transparent plane surface */}
      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[plane.gridExtent * 2, plane.gridExtent * 2]} />
        <meshBasicMaterial
          color="#8b5cf6"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Grid */}
      {plane.showGrid && (
        <GridLines gridSize={plane.gridSize} gridExtent={plane.gridExtent} />
      )}

      {/* Axes */}
      {plane.showAxes && <Axes length={500} />}

      {/* Label */}
      <PlaneLabel kind={plane.kind} origin={plane.origin} />
    </group>
  );
}

export default ConstructionPlane;
