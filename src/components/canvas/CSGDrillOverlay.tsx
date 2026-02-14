/**
 * CSGDrillOverlay - v2.1 (Cylinder Implementation)
 *
 * Renders drill holes as visual cutout cylinders on panels.
 * Uses simple cylinder geometry with dark material to simulate holes.
 *
 * Features:
 * - Renders cylinders at drill positions to visualize holes
 * - Handles different face orientations (A, B, TOP, BOTTOM, LEFT, RIGHT)
 * - Supports different drill purposes with color coding
 * - Cylinders positioned to extend into the material surface
 *
 * Note: For true CSG Boolean operations, @react-three/csg can be used,
 * but this cylinder approach is more performant and visually effective.
 */

import React, { useMemo } from 'react';
import { Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import type {
  DrillMap,
  DrillMapPoint,
  DrillMapPanel,
  DrillPurpose,
} from '../../core/manufacturing/drillMap/types';

// ============================================
// CONSTANTS
// ============================================

/** Dark color for drill hole cylinders */
const HOLE_COLOR = '#1a1a1a';

/** Slightly lighter color for through holes */
const THROUGH_HOLE_COLOR = '#2d2d2d';

/** Purpose-based colors for optional color coding */
const DRILL_PURPOSE_COLORS: Record<DrillPurpose, string> = {
  CAM_LOCK: '#3d2a1a',     // Dark amber
  BOLT: '#1a2a3d',         // Dark blue
  DOWEL: '#2a1a3d',        // Dark purple
  SHELF_PIN: '#1a3d2a',    // Dark green
  HINGE: '#3d1a1a',        // Dark red
  MINIFIX: '#3d2a1a',      // Dark amber (same as CAM_LOCK)
  DRAWER_SLIDE: '#1a3d3d', // Dark cyan - drawer slide mounting hole
  OTHER: '#2d2d2d',        // Dark gray
};

/** Cylinder segment count for smooth appearance */
const CYLINDER_SEGMENTS = 24;

// ============================================
// TYPES
// ============================================

interface CSGDrillOverlayProps {
  drillMap: DrillMap | null;
  visible: boolean;
  /** Use purpose-based colors instead of uniform dark color */
  colorByPurpose?: boolean;
  /** Opacity for hole material (0-1) */
  opacity?: number;
}

interface DrillHoleCylinderProps {
  point: DrillMapPoint;
  colorByPurpose: boolean;
  opacity: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate rotation euler angles to align cylinder with drill normal.
 * Cylinder default axis is Y (up), we rotate to match the drill direction.
 */
function calculateCylinderRotation(normal: [number, number, number]): THREE.Euler {
  const up = new THREE.Vector3(0, 1, 0);
  const normalVec = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normalVec);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

/**
 * Calculate cylinder position offset so it starts at surface and extends into material.
 * Cylinder is centered by default, so we offset by half depth along normal direction.
 *
 * The cylinder should start at `position` (surface entry point) and extend INTO
 * the material (in the direction of the normal). Since the cylinder is centered,
 * we offset by halfDepth IN THE NORMAL DIRECTION (using +, not -).
 *
 * Example for LEFT panel:
 * - position = inner face (x = 16)
 * - normal = [-1, 0, 0] (drilling left into material)
 * - cylinderCenter.x = 16 + (-1) * halfDepth = 16 - halfDepth
 * - This correctly positions hole INSIDE the panel
 */
function calculateCylinderPosition(
  position: [number, number, number],
  normal: [number, number, number],
  depth: number
): [number, number, number] {
  const halfDepth = depth / 2;
  return [
    position[0] + normal[0] * halfDepth,
    position[1] + normal[1] * halfDepth,
    position[2] + normal[2] * halfDepth,
  ];
}

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Single drill hole cylinder mesh.
 * Renders a dark cylinder at the drill point position, oriented along the drill normal.
 */
function DrillHoleCylinder({ point, colorByPurpose, opacity }: DrillHoleCylinderProps) {
  const radius = point.diameter / 2;
  const depth = point.depth;

  // Calculate rotation to align with drill normal
  const rotation = useMemo(() => {
    return calculateCylinderRotation(point.normal);
  }, [point.normal]);

  // Calculate position offset into material
  const position = useMemo(() => {
    return calculateCylinderPosition(point.position, point.normal, depth);
  }, [point.position, point.normal, depth]);

  // Determine color
  const color = useMemo(() => {
    if (colorByPurpose) {
      return DRILL_PURPOSE_COLORS[point.purpose] || HOLE_COLOR;
    }
    return point.throughHole ? THROUGH_HOLE_COLOR : HOLE_COLOR;
  }, [colorByPurpose, point.purpose, point.throughHole]);

  return (
    <Cylinder
      args={[radius, radius, depth, CYLINDER_SEGMENTS]}
      position={position}
      rotation={rotation}
    >
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
        roughness={0.9}
        metalness={0.1}
      />
    </Cylinder>
  );
}

/**
 * Group of drill holes for a single panel.
 */
interface DrillPanelHolesProps {
  panel: DrillMapPanel;
  colorByPurpose: boolean;
  opacity: number;
}

function DrillPanelHoles({ panel, colorByPurpose, opacity }: DrillPanelHolesProps) {
  if (!panel.points || panel.points.length === 0) {
    return null;
  }

  return (
    <group name={`csg-holes-${panel.panelId}`}>
      {panel.points.map((point) => (
        <DrillHoleCylinder
          key={point.id}
          point={point}
          colorByPurpose={colorByPurpose}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CSGDrillOverlay renders drill holes as dark cylinders to simulate cutouts.
 *
 * Usage:
 * ```tsx
 * <CSGDrillOverlay
 *   drillMap={drillMapData}
 *   visible={showDrillHoles}
 *   colorByPurpose={false}
 *   opacity={0.95}
 * />
 * ```
 */
export function CSGDrillOverlay({
  drillMap,
  visible,
  colorByPurpose = false,
  opacity = 0.95,
}: CSGDrillOverlayProps) {
  // Early return for null/invisible state
  if (!visible || !drillMap) {
    return null;
  }

  // Filter out panels with no drill points
  const panelsWithHoles = useMemo(() => {
    return drillMap.panels.filter((panel) => panel.points && panel.points.length > 0);
  }, [drillMap.panels]);

  // Don't render if no panels have holes
  if (panelsWithHoles.length === 0) {
    return null;
  }

  return (
    <group name="csg-drill-overlay-v2.1">
      {panelsWithHoles.map((panel) => (
        <DrillPanelHoles
          key={panel.panelId}
          panel={panel}
          colorByPurpose={colorByPurpose}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

export default CSGDrillOverlay;
