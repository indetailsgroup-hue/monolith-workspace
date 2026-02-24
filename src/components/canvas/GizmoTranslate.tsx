/**
 * GizmoTranslate.tsx - 3D Translate Gizmo Component
 *
 * FEATURES:
 * - Renders X/Y/Z axis handles (arrows)
 * - Handles mouse interaction for drag operations
 * - Supports World/Local space modes
 * - Visual feedback (highlight on hover/active)
 * - Integrates with GizmoStore for state management
 *
 * USAGE:
 * <GizmoTranslate
 *   position={[x, y, z]}          // Object position in mm
 *   rotation={[rx, ry, rz]}       // Object rotation in radians
 *   onDragStart={() => {...}}     // Called when drag starts
 *   onDrag={(pos) => {...}}       // Called during drag with new position
 *   onDragEnd={(pos) => {...}}    // Called when drag ends
 * />
 */

import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Vec3 } from '../../core/types/SnapTypes';
import type { GizmoAxis } from '../../core/gizmo/gizmoTypes';
import type { Ray } from '../../core/gizmo/translateAxisDrag';
import { useGizmoStore } from '../../core/store/useGizmoStore';
import { localAxesFromEuler, getAxisUnit } from '../../core/gizmo/gizmoAxis';
import { normalize, sub } from '../../core/math/vec3Utils';

// ============================================
// TYPES
// ============================================

interface GizmoTranslateProps {
  /** Object position in mm */
  position: [number, number, number];
  /** Object rotation in radians [x, y, z] */
  rotation?: [number, number, number];
  /** Scale factor for gizmo size */
  scale?: number;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called during drag with new position in mm */
  onDrag?: (position: Vec3) => void;
  /** Called when drag ends with final position in mm */
  onDragEnd?: (position: Vec3, delta: Vec3) => void;
  /** Whether gizmo is enabled */
  enabled?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const AXIS_COLORS = {
  X: { default: '#ff4444', hover: '#ff8888', active: '#ffaaaa' },
  Y: { default: '#44ff44', hover: '#88ff88', active: '#aaffaa' },
  Z: { default: '#4444ff', hover: '#8888ff', active: '#aaaaff' },
};

// NOTE: Scene uses mm units (camera, grid, cabinet all in mm)
// These constants are in mm to match scene scale
const HANDLE_LENGTH = 150; // mm
const HANDLE_RADIUS = 8; // mm
const CONE_LENGTH = 30; // mm
const CONE_RADIUS = 15; // mm
const HIT_RADIUS = 25; // mm - Larger hit area for easier clicking
const CENTER_SPHERE_RADIUS = 15; // mm
const TOOLTIP_OFFSET = 200; // mm - Offset for tooltip above gizmo

// ============================================
// AXIS HANDLE COMPONENT
// ============================================

interface AxisHandleProps {
  axis: 'X' | 'Y' | 'Z';
  direction: THREE.Vector3;
  onPointerDown: (axis: GizmoAxis, event: THREE.Event) => void;
  onPointerEnter: (axis: GizmoAxis) => void;
  onPointerLeave: () => void;
  isHovered: boolean;
  isActive: boolean;
}

function AxisHandle({
  axis,
  direction,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  isHovered,
  isActive,
}: AxisHandleProps) {
  const colors = AXIS_COLORS[axis];
  const color = isActive ? colors.active : isHovered ? colors.hover : colors.default;

  // Calculate rotation to point in direction
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    return q;
  }, [direction]);

  const euler = useMemo(() => {
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [quaternion]);

  // Position of the arrow (halfway along the axis)
  const lineEnd = useMemo(() => {
    return direction.clone().multiplyScalar(HANDLE_LENGTH);
  }, [direction]);

  const conePosition = useMemo(() => {
    return direction.clone().multiplyScalar(HANDLE_LENGTH + CONE_LENGTH / 2);
  }, [direction]);

  return (
    <group>
      {/* Invisible hit area (larger cylinder) */}
      <mesh
        position={lineEnd.clone().multiplyScalar(0.5).toArray()}
        rotation={euler}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(axis, e);
        }}
        onPointerEnter={(e) => {
          e.stopPropagation();
          onPointerEnter(axis);
        }}
        onPointerLeave={onPointerLeave}
      >
        <cylinderGeometry args={[HIT_RADIUS, HIT_RADIUS, HANDLE_LENGTH, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Visible line */}
      <mesh position={lineEnd.clone().multiplyScalar(0.5).toArray()} rotation={euler}>
        <cylinderGeometry args={[HANDLE_RADIUS, HANDLE_RADIUS, HANDLE_LENGTH, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Arrow cone */}
      <mesh position={conePosition.toArray()} rotation={euler}>
        <coneGeometry args={[CONE_RADIUS, CONE_LENGTH, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GizmoTranslate({
  position,
  rotation = [0, 0, 0],
  scale: gizmoScale = 1,
  onDragStart,
  onDrag,
  onDragEnd,
  enabled = true,
}: GizmoTranslateProps) {
  const { camera, gl, raycaster, controls: orbitControls } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Gizmo store
  const {
    session,
    hoveredAxis,
    space,
    setHoveredAxis,
    beginDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  } = useGizmoStore();

  const isDragging = session.phase === 'dragging';
  const activeAxis = session.activeAxis;

  // Disable OrbitControls while dragging to prevent camera movement
  useEffect(() => {
    if (orbitControls) {
      (orbitControls as any).enabled = !isDragging;
    }
  }, [isDragging, orbitControls]);

  // Compute local axes from rotation
  const localAxes = useMemo(() => localAxesFromEuler(rotation), [rotation]);

  // Get axis directions based on space mode
  const axisDirections = useMemo(() => {
    const xAxis = getAxisUnit('X', space, localAxes);
    const yAxis = getAxisUnit('Y', space, localAxes);
    const zAxis = getAxisUnit('Z', space, localAxes);

    return {
      X: new THREE.Vector3(xAxis?.x || 1, xAxis?.y || 0, xAxis?.z || 0),
      Y: new THREE.Vector3(yAxis?.x || 0, yAxis?.y || 1, yAxis?.z || 0),
      Z: new THREE.Vector3(zAxis?.x || 0, zAxis?.y || 0, zAxis?.z || 1),
    };
  }, [space, localAxes]);

  // Position in scene units (mm) - scene uses mm, not meters
  const positionMm = useMemo<[number, number, number]>(() => {
    return [position[0], position[1], position[2]];
  }, [position]);

  // Create ray from mouse position
  const createRayFromMouse = useCallback(
    (event: PointerEvent): Ray => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);

      const origin = raycaster.ray.origin;
      const dir = raycaster.ray.direction;

      // Scene is in mm, but raycaster origin is in scene units (also mm)
      return {
        origin: { x: origin.x, y: origin.y, z: origin.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
      };
    },
    [camera, gl, raycaster]
  );

  // Handle pointer down on axis
  const handlePointerDown = useCallback(
    (axis: GizmoAxis, event: THREE.Event) => {
      if (!enabled || axis === null) return;

      const nativeEvent = (event as any).nativeEvent as PointerEvent;
      const ray = createRayFromMouse(nativeEvent);

      // Get view direction from camera to gizmo (camera is in scene units = mm)
      const camPos = camera.position;
      const gizmoPos = { x: position[0], y: position[1], z: position[2] };
      const viewDir = normalize(sub(gizmoPos, { x: camPos.x, y: camPos.y, z: camPos.z }));

      beginDrag(axis, ray, {
        gizmoOrigin: gizmoPos,
        viewDirUnit: viewDir,
        localAxes,
      });

      onDragStart?.();

      // Capture pointer for drag tracking
      gl.domElement.setPointerCapture(nativeEvent.pointerId);
    },
    [enabled, camera, position, localAxes, beginDrag, onDragStart, gl, createRayFromMouse]
  );

  // Handle pointer move during drag
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const ray = createRayFromMouse(event);

      updateDrag({
        ray,
        isFine: event.shiftKey,
        isStep: event.ctrlKey,
        isAlt: event.altKey,
      });

      // Call onDrag callback with preview position
      const previewPos = useGizmoStore.getState().session.previewPosition;
      onDrag?.(previewPos);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const result = endDrag();
      if (result) {
        onDragEnd?.(result.finalPosition, result.delta);
      }

      gl.domElement.releasePointerCapture(event.pointerId);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancelDrag();
      }
    };

    gl.domElement.addEventListener('pointermove', handlePointerMove);
    gl.domElement.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      gl.domElement.removeEventListener('pointermove', handlePointerMove);
      gl.domElement.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, createRayFromMouse, updateDrag, endDrag, cancelDrag, onDrag, onDragEnd, gl]);

  // Scale gizmo based on camera distance
  const [dynamicScale, setDynamicScale] = useState(gizmoScale);

  useFrame(() => {
    if (!groupRef.current) return;

    // Calculate distance from camera to gizmo (both in mm)
    const gizmoWorldPos = new THREE.Vector3(...positionMm);
    const dist = camera.position.distanceTo(gizmoWorldPos);

    // Scale gizmo to maintain consistent screen size
    // dist is in mm, so we divide by ~2000 to get a reasonable scale factor
    const targetScale = Math.max(0.5, Math.min(3, dist / 2000)) * gizmoScale;
    setDynamicScale(targetScale);
  });

  if (!enabled) return null;

  // Get delta for tooltip
  const deltaDistance = Math.round(session.freeDeltaWorld.x + session.freeDeltaWorld.y + session.freeDeltaWorld.z);

  return (
    <group ref={groupRef} position={positionMm} scale={dynamicScale}>
      {/* X Axis (Red) */}
      <AxisHandle
        axis="X"
        direction={axisDirections.X}
        onPointerDown={handlePointerDown}
        onPointerEnter={setHoveredAxis}
        onPointerLeave={() => setHoveredAxis(null)}
        isHovered={hoveredAxis === 'X'}
        isActive={activeAxis === 'X'}
      />

      {/* Y Axis (Green) */}
      <AxisHandle
        axis="Y"
        direction={axisDirections.Y}
        onPointerDown={handlePointerDown}
        onPointerEnter={setHoveredAxis}
        onPointerLeave={() => setHoveredAxis(null)}
        isHovered={hoveredAxis === 'Y'}
        isActive={activeAxis === 'Y'}
      />

      {/* Z Axis (Blue) */}
      <AxisHandle
        axis="Z"
        direction={axisDirections.Z}
        onPointerDown={handlePointerDown}
        onPointerEnter={setHoveredAxis}
        onPointerLeave={() => setHoveredAxis(null)}
        isHovered={hoveredAxis === 'Z'}
        isActive={activeAxis === 'Z'}
      />

      {/* Center sphere */}
      <mesh>
        <sphereGeometry args={[CENTER_SPHERE_RADIUS, 16, 16]} />
        <meshBasicMaterial color="#888888" />
      </mesh>

      {/* Delta tooltip during drag */}
      {isDragging && activeAxis && (
        <Html position={[0, TOOLTIP_OFFSET, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="px-2 py-1 bg-black/90 text-white text-xs font-mono rounded border border-white/20 whitespace-nowrap">
            <span className="text-gray-400">Δ{activeAxis}:</span>{' '}
            <span
              className={
                activeAxis === 'X'
                  ? 'text-red-400'
                  : activeAxis === 'Y'
                  ? 'text-green-400'
                  : 'text-blue-400'
              }
            >
              {Math.round(useGizmoStore.getState().getDeltaDistance())} mm
            </span>
            <span className="text-gray-500 ml-2">
              [{space === 'LOCAL' ? 'L' : 'W'}]
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

export default GizmoTranslate;
