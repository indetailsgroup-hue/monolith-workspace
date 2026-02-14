/**
 * SnapGuides.tsx - Visual feedback for cabinet snapping
 *
 * Features:
 * - Dashed lines when snapping to edges
 * - Different colors for edge vs grid snap
 * - Box3 edge visualization for all cabinets
 * - Wall snap indicators at X=0 and Z=0
 * - Plasticity-style snap point glyphs (vertex/mid/center)
 *
 * @version 3.0.0 - Added Plasticity-style snap point glyphs
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSceneRegistry } from './scene';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useToolStore } from '../../core/store/useToolStore';
import { useSnapStore } from '../../core/store/useSnapStore';
import type { SnapGuide } from '../../core/utils/snapSystem';

// ============================================
// CONSTANTS
// ============================================

const GUIDE_COLORS = {
  edge: '#22c55e',    // Green for edge-to-edge
  center: '#3b82f6',  // Blue for center alignment
  grid: '#6b7280',    // Gray for grid snap
  wall: '#ef4444',    // Red for wall snap
  box3: '#8b5cf6',    // Purple for Box3 edges
  vertex: '#f59e0b',  // Amber for vertex snap
  midpoint: '#06b6d4', // Cyan for midpoint snap
};

// Glyph sizes in mm - larger for visibility
const GLYPH_SIZES = {
  vertex: 50,    // Diamond at corners (3D octahedron)
  midpoint: 30,  // Triangle at edge midpoints
  center: 50,    // Crosshair at center
};

// ============================================
// SINGLE GUIDE LINE (using cylinder geometry)
// ============================================

interface GuideLineProps {
  guide: SnapGuide;
}

function GuideLine({ guide }: GuideLineProps) {
  const color = GUIDE_COLORS[guide.type];

  // Scene uses mm units directly
  const startMm: [number, number, number] = [
    guide.start[0],
    guide.start[1],
    guide.start[2],
  ];

  const endMm: [number, number, number] = [
    guide.end[0],
    guide.end[1],
    guide.end[2],
  ];

  // Calculate midpoint and direction
  const midpoint: [number, number, number] = [
    (startMm[0] + endMm[0]) / 2,
    (startMm[1] + endMm[1]) / 2,
    (startMm[2] + endMm[2]) / 2,
  ];

  const dx = endMm[0] - startMm[0];
  const dy = endMm[1] - startMm[1];
  const dz = endMm[2] - startMm[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Calculate rotation to align cylinder with line direction
  let rotationX = 0;
  let rotationZ = 0;

  if (length > 0.1) {
    rotationZ = Math.atan2(dx, dy);
    const horizontalLength = Math.sqrt(dx * dx + dy * dy);
    rotationX = Math.atan2(dz, horizontalLength);
  }

  // Line thickness (mm)
  const thickness = 2;

  return (
    <mesh position={midpoint} rotation={[-rotationX, 0, -rotationZ]} renderOrder={999}>
      <cylinderGeometry args={[thickness, thickness, length, 8]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={0.8} />
    </mesh>
  );
}

// ============================================
// SNAP INDICATOR (Sphere at snap point)
// ============================================

interface SnapIndicatorProps {
  position: [number, number, number];  // mm
  type: SnapGuide['type'];
}

function SnapIndicator({ position, type }: SnapIndicatorProps) {
  const color = GUIDE_COLORS[type];

  // Lift Y slightly to avoid z-fighting
  const yOffset = 5;
  const posMm: [number, number, number] = [
    position[0],
    position[1] + yOffset,
    position[2],
  ];

  return (
    <mesh position={posMm} renderOrder={1000}>
      <sphereGeometry args={[10, 16, 16]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

// ============================================
// PLASTICITY-STYLE SNAP POINT GLYPHS
// ============================================

/**
 * Vertex Glyph - Diamond shape at cabinet corners
 */
interface VertexGlyphProps {
  position: [number, number, number];
  active?: boolean;
}

function VertexGlyph({ position, active = false }: VertexGlyphProps) {
  const size = GLYPH_SIZES.vertex;
  const color = active ? '#ffffff' : GUIDE_COLORS.vertex;
  const opacity = active ? 1.0 : 0.8;

  // Offset the glyph slightly outward from the corner to prevent z-fighting
  const offset = 5; // mm offset
  const offsetPos: [number, number, number] = [
    position[0],
    position[1] + offset,  // Lift above surface
    position[2],
  ];

  return (
    <group position={offsetPos}>
      {/* Diamond shape using octahedron for 3D visibility from any angle */}
      <mesh renderOrder={1001}>
        <octahedronGeometry args={[size / 2, 0]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={opacity}
        />
      </mesh>
      {/* Wireframe outline for better visibility */}
      <mesh renderOrder={1002}>
        <octahedronGeometry args={[size / 2, 0]} />
        <meshBasicMaterial
          color="#000000"
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.3}
          wireframe
        />
      </mesh>
    </group>
  );
}

/**
 * Midpoint Glyph - Small triangle at edge midpoints
 */
interface MidpointGlyphProps {
  position: [number, number, number];
  active?: boolean;
}

function MidpointGlyph({ position, active = false }: MidpointGlyphProps) {
  const size = GLYPH_SIZES.midpoint;
  const color = active ? '#ffffff' : GUIDE_COLORS.midpoint;
  const opacity = active ? 1.0 : 0.6;

  // Create triangle shape
  const triangleShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, size / 2);
    shape.lineTo(size / 2, -size / 2);
    shape.lineTo(-size / 2, -size / 2);
    shape.closePath();
    return shape;
  }, [size]);

  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} renderOrder={1001}>
      <shapeGeometry args={[triangleShape]} />
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Center Glyph - Crosshair at cabinet center
 */
interface CenterGlyphProps {
  position: [number, number, number];
  active?: boolean;
}

function CenterGlyph({ position, active = false }: CenterGlyphProps) {
  const size = GLYPH_SIZES.center;
  const color = active ? '#ffffff' : GUIDE_COLORS.center;
  const thickness = 2;

  return (
    <group position={position}>
      {/* Horizontal line */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1001}>
        <planeGeometry args={[size, thickness]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={active ? 1.0 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Vertical line */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1001}>
        <planeGeometry args={[thickness, size]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={active ? 1.0 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Center marker - using sphere for consistent visibility from all angles */}
      {/* Spheres render correctly from any camera angle (no edge-on line artifacts) */}
      <mesh renderOrder={1000}>
        <sphereGeometry args={[size * 0.15, 12, 8]} />
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={active ? 0.8 : 0.5}
        />
      </mesh>
    </group>
  );
}

/**
 * Snap Type Label - Shows snap type during drag
 */
interface SnapTypeLabelProps {
  position: [number, number, number];
  snapType: 'edge' | 'center' | 'grid' | 'wall' | 'vertex' | 'midpoint';
  distance?: number;
}

function SnapTypeLabel({ position, snapType, distance }: SnapTypeLabelProps) {
  const labelPos: [number, number, number] = [
    position[0],
    position[1] + 80,
    position[2],
  ];

  const labels: Record<string, string> = {
    edge: 'EDGE',
    center: 'CENTER',
    grid: 'GRID',
    wall: 'WALL',
    vertex: 'VERTEX',
    midpoint: 'MIDPOINT',
  };

  const colors: Record<string, string> = {
    edge: 'text-green-400 border-green-500/50',
    center: 'text-blue-400 border-blue-500/50',
    grid: 'text-gray-400 border-gray-500/50',
    wall: 'text-red-400 border-red-500/50',
    vertex: 'text-amber-400 border-amber-500/50',
    midpoint: 'text-cyan-400 border-cyan-500/50',
  };

  return (
    <Html position={labelPos} center style={{ pointerEvents: 'none' }}>
      <div className={`px-2 py-1 bg-black/90 text-xs font-bold rounded border ${colors[snapType]} flex items-center gap-2`}>
        <span>{labels[snapType]}</span>
        {distance !== undefined && (
          <span className="font-mono text-white/70">{Math.round(distance)}mm</span>
        )}
      </div>
    </Html>
  );
}

/**
 * Cabinet Snap Points - Shows vertex/mid/center glyphs for a cabinet
 */
interface CabinetSnapPointsProps {
  cabinetId: string;
  showVertex?: boolean;
  showMidpoint?: boolean;
  showCenter?: boolean;
  activePoint?: { type: 'vertex' | 'midpoint' | 'center'; index: number } | null;
}

function CabinetSnapPoints({
  cabinetId,
  showVertex = true,
  showMidpoint = true,
  showCenter = true,
  activePoint = null,
}: CabinetSnapPointsProps) {
  const cabinet = useCabinetStore((s) => s.cabinets.find(c => c.id === cabinetId));
  const { getWorldBox, isRegistered } = useSceneRegistry();

  const snapPoints = useMemo(() => {
    if (!cabinet) return { vertices: [], midpoints: [], center: null };

    // Get bounding box
    let min: { x: number; y: number; z: number };
    let max: { x: number; y: number; z: number };

    if (isRegistered(cabinetId)) {
      const worldBox = getWorldBox(cabinetId);
      if (worldBox) {
        min = worldBox.min;
        max = worldBox.max;
      } else {
        const pos = (cabinet as any).scenePosition || [0, 0, 0];
        const { width, height, depth } = cabinet.dimensions;
        min = { x: pos[0], y: pos[1], z: pos[2] };
        max = { x: pos[0] + width, y: pos[1] + height, z: pos[2] + depth };
      }
    } else {
      const pos = (cabinet as any).scenePosition || [0, 0, 0];
      const { width, height, depth } = cabinet.dimensions;
      min = { x: pos[0], y: pos[1], z: pos[2] };
      max = { x: pos[0] + width, y: pos[1] + height, z: pos[2] + depth };
    }

    // 8 corner vertices
    const vertices: [number, number, number][] = [
      [min.x, min.y, min.z],
      [max.x, min.y, min.z],
      [max.x, min.y, max.z],
      [min.x, min.y, max.z],
      [min.x, max.y, min.z],
      [max.x, max.y, min.z],
      [max.x, max.y, max.z],
      [min.x, max.y, max.z],
    ];

    // 12 edge midpoints
    const midpoints: [number, number, number][] = [
      // Bottom edges
      [(min.x + max.x) / 2, min.y, min.z],
      [max.x, min.y, (min.z + max.z) / 2],
      [(min.x + max.x) / 2, min.y, max.z],
      [min.x, min.y, (min.z + max.z) / 2],
      // Top edges
      [(min.x + max.x) / 2, max.y, min.z],
      [max.x, max.y, (min.z + max.z) / 2],
      [(min.x + max.x) / 2, max.y, max.z],
      [min.x, max.y, (min.z + max.z) / 2],
      // Vertical edges
      [min.x, (min.y + max.y) / 2, min.z],
      [max.x, (min.y + max.y) / 2, min.z],
      [max.x, (min.y + max.y) / 2, max.z],
      [min.x, (min.y + max.y) / 2, max.z],
    ];

    // Center point
    const center: [number, number, number] = [
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    ];

    return { vertices, midpoints, center };
  }, [cabinet, cabinetId, isRegistered, getWorldBox]);

  if (!cabinet) return null;

  return (
    <group name={`snap-points-${cabinetId}`}>
      {/* Vertex glyphs */}
      {showVertex && snapPoints.vertices.map((pos, idx) => (
        <VertexGlyph
          key={`v-${idx}`}
          position={pos}
          active={activePoint?.type === 'vertex' && activePoint?.index === idx}
        />
      ))}

      {/* Midpoint glyphs */}
      {showMidpoint && snapPoints.midpoints.map((pos, idx) => (
        <MidpointGlyph
          key={`m-${idx}`}
          position={pos}
          active={activePoint?.type === 'midpoint' && activePoint?.index === idx}
        />
      ))}

      {/* Center glyph */}
      {showCenter && snapPoints.center && (
        <CenterGlyph
          position={snapPoints.center}
          active={activePoint?.type === 'center'}
        />
      )}
    </group>
  );
}

// ============================================
// BOX3 EDGE VISUALIZATION
// ============================================

interface Box3EdgesProps {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  color?: string;
  opacity?: number;
}

function Box3Edges({ min, max, color = GUIDE_COLORS.box3, opacity = 0.4 }: Box3EdgesProps) {
  // Generate 12 edges of the box
  const edges = useMemo(() => {
    const result: Array<{ start: [number, number, number]; end: [number, number, number] }> = [];

    // Bottom face (Y = min.y)
    result.push({ start: [min.x, min.y, min.z], end: [max.x, min.y, min.z] });
    result.push({ start: [max.x, min.y, min.z], end: [max.x, min.y, max.z] });
    result.push({ start: [max.x, min.y, max.z], end: [min.x, min.y, max.z] });
    result.push({ start: [min.x, min.y, max.z], end: [min.x, min.y, min.z] });

    // Top face (Y = max.y)
    result.push({ start: [min.x, max.y, min.z], end: [max.x, max.y, min.z] });
    result.push({ start: [max.x, max.y, min.z], end: [max.x, max.y, max.z] });
    result.push({ start: [max.x, max.y, max.z], end: [min.x, max.y, max.z] });
    result.push({ start: [min.x, max.y, max.z], end: [min.x, max.y, min.z] });

    // Vertical edges
    result.push({ start: [min.x, min.y, min.z], end: [min.x, max.y, min.z] });
    result.push({ start: [max.x, min.y, min.z], end: [max.x, max.y, min.z] });
    result.push({ start: [max.x, min.y, max.z], end: [max.x, max.y, max.z] });
    result.push({ start: [min.x, min.y, max.z], end: [min.x, max.y, max.z] });

    return result;
  }, [min, max]);

  const thickness = 1.5; // mm

  return (
    <group name="box3-edges">
      {edges.map((edge, idx) => {
        const midpoint: [number, number, number] = [
          (edge.start[0] + edge.end[0]) / 2,
          (edge.start[1] + edge.end[1]) / 2,
          (edge.start[2] + edge.end[2]) / 2,
        ];

        const dx = edge.end[0] - edge.start[0];
        const dy = edge.end[1] - edge.start[1];
        const dz = edge.end[2] - edge.start[2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Calculate rotation
        let rotationX = 0;
        let rotationZ = 0;
        if (length > 0.1) {
          rotationZ = Math.atan2(dx, dy);
          const horizontalLength = Math.sqrt(dx * dx + dy * dy);
          rotationX = Math.atan2(dz, horizontalLength);
        }

        return (
          <mesh
            key={idx}
            position={midpoint}
            rotation={[-rotationX, 0, -rotationZ]}
          >
            <cylinderGeometry args={[thickness, thickness, length, 4]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================
// ALL CABINET BOX3 EDGES
// ============================================

interface CabinetBox3EdgesProps {
  excludeCabinetId?: string | null;
  showOnlyActive?: boolean;
  maxDistance?: number;  // Only show boxes within this distance from active cabinet
}

function CabinetBox3Edges({ excludeCabinetId, showOnlyActive = false, maxDistance }: CabinetBox3EdgesProps) {
  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const { getWorldBox, isRegistered } = useSceneRegistry();

  // Get active cabinet position for distance filtering
  const activePosition = useMemo(() => {
    if (!activeCabinetId || !maxDistance) return null;
    const activeCab = cabinets.find(c => c.id === activeCabinetId);
    if (!activeCab) return null;
    const pos = (activeCab as any).scenePosition || [0, 0, 0];
    return { x: pos[0], z: pos[2] };
  }, [activeCabinetId, cabinets, maxDistance]);

  const boxes = useMemo(() => {
    return cabinets
      .filter(c => {
        // Exclude dragging cabinet
        if (excludeCabinetId && c.id === excludeCabinetId) return false;
        // If showOnlyActive, only show for non-active cabinets
        if (showOnlyActive && c.id === activeCabinetId) return false;
        return true;
      })
      .map(cabinet => {
        // Try to get world box from registry
        if (isRegistered(cabinet.id)) {
          const worldBox = getWorldBox(cabinet.id);
          if (worldBox) {
            // Check distance if maxDistance is set
            if (maxDistance && activePosition) {
              const cabCenter = worldBox.center;
              const dist = Math.sqrt(
                Math.pow(cabCenter.x - activePosition.x, 2) +
                Math.pow(cabCenter.z - activePosition.z, 2)
              );
              if (dist > maxDistance) return null;
            }
            return {
              id: cabinet.id,
              min: worldBox.min,
              max: worldBox.max,
            };
          }
        }

        // Fallback: calculate from dimensions
        const pos = (cabinet as any).scenePosition || [0, 0, 0];
        const { width, height, depth } = cabinet.dimensions;

        // Check distance if maxDistance is set
        if (maxDistance && activePosition) {
          const centerX = pos[0] + width / 2;
          const centerZ = pos[2] + depth / 2;
          const dist = Math.sqrt(
            Math.pow(centerX - activePosition.x, 2) +
            Math.pow(centerZ - activePosition.z, 2)
          );
          if (dist > maxDistance) return null;
        }

        return {
          id: cabinet.id,
          min: { x: pos[0], y: pos[1], z: pos[2] },
          max: { x: pos[0] + width, y: pos[1] + height, z: pos[2] + depth },
        };
      })
      .filter(Boolean) as Array<{ id: string; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }>;
  }, [cabinets, excludeCabinetId, activeCabinetId, showOnlyActive, isRegistered, getWorldBox, maxDistance, activePosition]);

  return (
    <group name="cabinet-box3-edges">
      {boxes.map(box => (
        <Box3Edges
          key={box.id}
          min={box.min}
          max={box.max}
          color={box.id === activeCabinetId ? '#22c55e' : GUIDE_COLORS.box3}
          opacity={box.id === activeCabinetId ? 0.6 : 0.3}
        />
      ))}
    </group>
  );
}

// ============================================
// WALL SNAP INDICATORS
// ============================================

interface WallSnapIndicatorsProps {
  cabinetPosition: [number, number, number] | null;
  threshold?: number;  // mm
}

function WallSnapIndicators({ cabinetPosition, threshold = 50 }: WallSnapIndicatorsProps) {
  if (!cabinetPosition) return null;

  const nearXWall = Math.abs(cabinetPosition[0]) < threshold;
  const nearZWall = Math.abs(cabinetPosition[2]) < threshold;

  if (!nearXWall && !nearZWall) return null;

  return (
    <group name="wall-snap-indicators">
      {/* X=0 wall indicator */}
      {nearXWall && (
        <mesh position={[0, cabinetPosition[1] + 360, cabinetPosition[2]]}>
          <boxGeometry args={[5, 720, 100]} />
          <meshBasicMaterial color={GUIDE_COLORS.wall} transparent opacity={0.5} />
        </mesh>
      )}

      {/* Z=0 wall indicator */}
      {nearZWall && (
        <mesh position={[cabinetPosition[0], cabinetPosition[1] + 360, 0]}>
          <boxGeometry args={[100, 720, 5]} />
          <meshBasicMaterial color={GUIDE_COLORS.wall} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface SnapGuidesProps {
  guides?: SnapGuide[];
  showIndicators?: boolean;
  showWallSnap?: boolean;
}

export function SnapGuides({
  guides = [],
  showIndicators = true,
  showWallSnap = true,
}: SnapGuidesProps) {
  const activeTool = useToolStore((s) => s.activeTool);
  const draggingCabinetId = useToolStore((s) => s.draggingCabinetId);
  const showBoxes = useToolStore((s) => s.showBoxes);
  const boxDrawDistance = useToolStore((s) => s.boxDrawDistance);
  const showSnapPoints = useToolStore((s) => s.showSnapPoints ?? false);
  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const isSnapping = useSnapStore((s) => s.isSnapping);

  // Get dragging cabinet position
  const draggingPosition = useMemo(() => {
    if (!draggingCabinetId) return null;
    const cab = cabinets.find(c => c.id === draggingCabinetId);
    if (!cab) return null;
    return (cab as any).scenePosition || [0, 0, 0];
  }, [draggingCabinetId, cabinets]);

  // Determine active snap type from guides
  const activeSnapType = useMemo(() => {
    if (guides.length === 0) return null;
    // Return the first guide's type
    return guides[0].type as 'edge' | 'center' | 'grid' | 'wall';
  }, [guides]);

  // Only show guides when in move mode
  const isMoving = activeTool === 'move';

  // Get nearby cabinet IDs for snap points display (within range)
  const nearbyCabinetIds = useMemo(() => {
    if (!isMoving || !showSnapPoints || !activeCabinetId) return [];

    const activeCab = cabinets.find(c => c.id === activeCabinetId);
    if (!activeCab) return [];

    const activePos = (activeCab as any).scenePosition || [0, 0, 0];
    const range = boxDrawDistance === 0 ? Infinity : boxDrawDistance;

    return cabinets
      .filter(c => {
        if (c.id === activeCabinetId) return false;
        const pos = (c as any).scenePosition || [0, 0, 0];
        const dist = Math.sqrt(
          Math.pow(pos[0] - activePos[0], 2) +
          Math.pow(pos[2] - activePos[2], 2)
        );
        return dist <= range;
      })
      .map(c => c.id);
  }, [isMoving, showSnapPoints, activeCabinetId, cabinets, boxDrawDistance]);

  return (
    <group name="snap-guides">
      {/* Active snap guide lines */}
      {guides.length > 0 && guides.map((guide, index) => (
        <GuideLine key={`guide-${index}-${guide.axis}-${guide.position}`} guide={guide} />
      ))}

      {/* Snap point indicators */}
      {showIndicators && guides
        .filter(g => g.type === 'edge')
        .map((guide, index) => {
          const midpoint: [number, number, number] = [
            (guide.start[0] + guide.end[0]) / 2,
            (guide.start[1] + guide.end[1]) / 2,
            (guide.start[2] + guide.end[2]) / 2,
          ];
          return (
            <SnapIndicator
              key={`indicator-${index}-${guide.axis}`}
              position={midpoint}
              type={guide.type}
            />
          );
        })
      }

      {/* Snap type label when actively snapping */}
      {isSnapping && activeSnapType && draggingPosition && (
        <SnapTypeLabel
          position={draggingPosition}
          snapType={activeSnapType}
        />
      )}

      {/* Plasticity-style snap point glyphs for nearby cabinets */}
      {showSnapPoints && isMoving && nearbyCabinetIds.map(cabId => (
        <CabinetSnapPoints
          key={`snap-pts-${cabId}`}
          cabinetId={cabId}
          showVertex={true}
          showMidpoint={false}  // Show only vertices by default for cleaner UI
          showCenter={true}
        />
      ))}

      {/* Box3 edges for all cabinets (when moving and enabled) */}
      {showBoxes && isMoving && (
        <CabinetBox3Edges
          excludeCabinetId={draggingCabinetId}
          maxDistance={boxDrawDistance === 0 ? undefined : boxDrawDistance}
        />
      )}

      {/* Wall snap indicators */}
      {showWallSnap && isMoving && draggingPosition && (
        <WallSnapIndicators
          cabinetPosition={draggingPosition}
        />
      )}
    </group>
  );
}

// ============================================
// DISTANCE LABEL
// ============================================

interface DistanceLabelProps {
  position: [number, number, number];  // mm
  distance: number;  // mm
}

export function DistanceLabel({ position, distance }: DistanceLabelProps) {
  // Add offset above position
  const labelPos: [number, number, number] = [
    position[0],
    position[1] + 50,
    position[2],
  ];

  return (
    <Html position={labelPos} center style={{ pointerEvents: 'none' }}>
      <div className="px-2 py-0.5 bg-black/80 text-green-400 text-xs font-mono rounded border border-green-500/30">
        {Math.round(distance)}mm
      </div>
    </Html>
  );
}

export default SnapGuides;
