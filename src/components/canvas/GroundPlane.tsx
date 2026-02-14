/**
 * GroundPlane.tsx - Ground plane with grid for 3D scene
 *
 * Features:
 * - Infinite-feeling grid floor
 * - Major/minor grid lines (100mm / 1000mm)
 * - Shadow receiving plane
 * - Wall reference lines at X=0 and Z=0
 *
 * @version 1.0.0
 */

import { useMemo } from 'react';
import { DoubleSide } from 'three';

// ============================================
// TYPES
// ============================================

export interface GroundPlaneProps {
  /**
   * Size of the ground plane in mm
   */
  size?: number;

  /**
   * Minor grid cell size in mm
   */
  cellSize?: number;

  /**
   * Major grid section size in mm
   */
  sectionSize?: number;

  /**
   * Show wall reference lines at X=0 and Z=0
   */
  showWallLines?: boolean;

  /**
   * Ground plane color
   */
  groundColor?: string;

  /**
   * Minor grid line color
   */
  cellColor?: string;

  /**
   * Major grid line color
   */
  sectionColor?: string;

  /**
   * Wall reference line color
   */
  wallColor?: string;
}

// ============================================
// GRID LINE COMPONENT
// ============================================

interface GridLinesProps {
  size: number;
  spacing: number;
  color: string;
  thickness: number;
  yOffset: number;
}

function GridLines({ size, spacing, color, thickness, yOffset }: GridLinesProps) {
  const lines = useMemo(() => {
    const result: Array<{ start: [number, number, number]; end: [number, number, number] }> = [];
    const halfSize = size / 2;
    const count = Math.floor(size / spacing);

    // Lines along X axis (parallel to X)
    for (let i = -count / 2; i <= count / 2; i++) {
      const z = i * spacing;
      result.push({
        start: [-halfSize, yOffset, z],
        end: [halfSize, yOffset, z],
      });
    }

    // Lines along Z axis (parallel to Z)
    for (let i = -count / 2; i <= count / 2; i++) {
      const x = i * spacing;
      result.push({
        start: [x, yOffset, -halfSize],
        end: [x, yOffset, halfSize],
      });
    }

    return result;
  }, [size, spacing, yOffset]);

  return (
    <group name={`grid-lines-${spacing}`}>
      {lines.map((line, idx) => {
        const midX = (line.start[0] + line.end[0]) / 2;
        const midZ = (line.start[2] + line.end[2]) / 2;
        const isXLine = line.start[2] === line.end[2];
        const length = isXLine
          ? Math.abs(line.end[0] - line.start[0])
          : Math.abs(line.end[2] - line.start[2]);

        return (
          <mesh
            key={idx}
            position={[midX, yOffset, midZ]}
            rotation={isXLine ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[thickness, thickness, length, 4]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================
// WALL REFERENCE LINES
// ============================================

interface WallLinesProps {
  size: number;
  color: string;
  thickness: number;
}

function WallLines({ size, color, thickness }: WallLinesProps) {
  const halfSize = size / 2;
  const yOffset = 1; // Slightly above ground

  return (
    <group name="wall-reference-lines">
      {/* X=0 wall line (along Z axis) */}
      <mesh position={[0, yOffset, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[thickness * 2, thickness * 2, size, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>

      {/* Z=0 wall line (along X axis) */}
      <mesh position={[0, yOffset, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[thickness * 2, thickness * 2, size, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>

      {/* Origin marker */}
      <mesh position={[0, yOffset + 5, 0]}>
        <sphereGeometry args={[thickness * 5, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GroundPlane({
  size = 10000,           // 10m in mm
  cellSize = 100,         // 100mm minor grid
  sectionSize = 1000,     // 1000mm (1m) major grid
  showWallLines = true,
  groundColor = '#1a1a1a',
  cellColor = '#333333',
  sectionColor = '#444444',
  wallColor = '#ef4444',  // Red for wall lines
}: GroundPlaneProps) {
  const halfSize = size / 2;
  const lineThickness = 1; // 1mm thick lines

  return (
    <group name="ground-plane">
      {/* Ground plane (shadow receiver) */}
      <mesh
        position={[0, -1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color={groundColor}
          side={DoubleSide}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Minor grid lines (100mm) */}
      <GridLines
        size={size}
        spacing={cellSize}
        color={cellColor}
        thickness={lineThickness * 0.5}
        yOffset={0}
      />

      {/* Major grid lines (1000mm) */}
      <GridLines
        size={size}
        spacing={sectionSize}
        color={sectionColor}
        thickness={lineThickness}
        yOffset={0.5}
      />

      {/* Wall reference lines */}
      {showWallLines && (
        <WallLines
          size={size}
          color={wallColor}
          thickness={lineThickness * 2}
        />
      )}
    </group>
  );
}

export default GroundPlane;
