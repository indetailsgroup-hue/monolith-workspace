/**
 * SketchInputLayer.tsx - Canvas Mouse Input for Sketch Mode
 *
 * Handles mouse input when sketch mode is enabled:
 * - Raycast mouse to construction plane
 * - Apply snap (grid, points)
 * - Track cursor position for preview
 * - Handle clicks to add points
 *
 * @version 1.1.0
 */

import { useRef, useEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import {
  useSketchStore,
  useSketchEnabled,
  useSketchTool,
  useSketchTempPoints,
  useSketchCursorPos,
  useSketchSnapType,
  useSketchAxisLock,
  useSketchHudInput,
} from '../../core/sketch';
import { parseHud, applyHudToPoint, isHudChar } from '../../core/sketch/hudNumeric';
import { useCPlane } from '../../core/cplane';
import { useToolStore } from '../../core/store/useToolStore';
import {
  createThreePlane,
  worldToPlane2D,
  plane2DToWorld,
  raycastToPlane,
} from '../../core/sketch/threePlane';
import {
  applySnap,
  distance2D,
} from '../../core/sketch/projectionUtils';
import type { SketchPoint } from '../../core/sketch/types';

// ============================================================================
// Component
// ============================================================================

export function SketchInputLayer() {
  const { camera, gl } = useThree();
  const enabled = useSketchEnabled();
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const cursorPos = useSketchCursorPos();
  const snapType = useSketchSnapType();
  const axisLock = useSketchAxisLock();
  const cplane = useCPlane((s) => s.plane);
  const snapToGrid = useSketchStore((s) => s.snapToGrid);
  const snapToEndpoints = useSketchStore((s) => s.snapToEndpoints);
  const addPoint = useSketchStore((s) => s.addPoint);
  const setCursorPos = useSketchStore((s) => s.setCursorPos);
  const toggleAxisLock = useSketchStore((s) => s.toggleAxisLock);
  const setAxisLock = useSketchStore((s) => s.setAxisLock);
  const hudInput = useSketchHudInput();
  const appendHudInput = useSketchStore((s) => s.appendHudInput);
  const clearHudInput = useSketchStore((s) => s.clearHudInput);
  const backspaceHudInput = useSketchStore((s) => s.backspaceHudInput);
  const clearTempPoints = useSketchStore((s) => s.clearTempPoints);
  const gridSize = useToolStore((s) => s.options.snap.gridSize);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  // Use ref to track cursor position to avoid infinite re-render loop
  // (cursorPos state changes on every mouse move, which would recreate callbacks)
  const cursorPosRef = useRef<SketchPoint | null>(null);

  // Create THREE.Plane from CPlane
  const threePlane = useRef(createThreePlane(cplane));

  // Update plane when cplane changes
  useEffect(() => {
    threePlane.current = createThreePlane(cplane);
  }, [cplane]);

  // Handle mouse move - update cursor position
  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!enabled || tool === 'select') return;

      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();

      // Convert to NDC
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast to plane
      raycaster.current.setFromCamera(mouse.current, camera);
      const worldPos = raycastToPlane(raycaster.current.ray, threePlane.current);

      if (!worldPos) {
        setCursorPos(null, 'none');
        return;
      }

      // Convert to plane 2D coordinates
      const rawPoint = worldToPlane2D(worldPos, cplane);

      // Collect snap targets (existing temp points + entity endpoints)
      const snapTargets: SketchPoint[] = [...tempPoints];

      // Apply snap
      const snapResult = applySnap(rawPoint, {
        gridSize,
        snapToGrid,
        snapToPoints: snapToEndpoints,
        points: snapTargets,
        pointThreshold: 20, // 20mm snap threshold
        axisLock,
        axisOrigin: tempPoints.length > 0 ? tempPoints[tempPoints.length - 1] : undefined,
      });

      // Update both state (for rendering) and ref (for click handler)
      cursorPosRef.current = snapResult.point;
      setCursorPos(snapResult.point, snapResult.snapType);
    },
    [enabled, tool, gl, camera, cplane, gridSize, snapToGrid, snapToEndpoints, tempPoints, axisLock, setCursorPos]
  );

  // Handle click - add point
  // Use cursorPosRef instead of cursorPos state to avoid infinite re-render loop
  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      const currentCursorPos = cursorPosRef.current;
      if (!enabled || tool === 'select') return;
      if (event.button !== 0) return; // Only left click
      if (!currentCursorPos) return;

      addPoint(currentCursorPos);
    },
    [enabled, tool, addPoint]
  );

  // Handle keyboard for axis lock and HUD input
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || tool === 'select') return;

      const key = event.key;
      const keyUpper = key.toUpperCase();

      // Escape - clear temp points and HUD
      if (key === 'Escape') {
        clearTempPoints();
        clearHudInput();
        return;
      }

      // Backspace - delete last HUD character or last point
      if (key === 'Backspace') {
        if (hudInput.length > 0) {
          backspaceHudInput();
        }
        return;
      }

      // Enter - commit point with HUD values applied
      if (key === 'Enter') {
        const currentCursorPos = cursorPosRef.current;
        if (tempPoints.length > 0 && currentCursorPos) {
          // Apply HUD to cursor position
          const hudSpec = parseHud(hudInput);
          const lastPoint = tempPoints[tempPoints.length - 1];
          const finalPoint = applyHudToPoint(lastPoint, currentCursorPos, hudSpec);
          addPoint(finalPoint);
          clearHudInput();
        }
        return;
      }

      // HUD numeric input (0-9, ., @, -)
      if (isHudChar(key)) {
        appendHudInput(key);
        return;
      }

      // Axis lock (only if not typing HUD)
      if (hudInput.length === 0) {
        if (keyUpper === 'X') {
          toggleAxisLock('x');
          return;
        }
        if (keyUpper === 'Y') {
          toggleAxisLock('y');
          return;
        }
      }
    },
    [enabled, tool, toggleAxisLock, hudInput, tempPoints, addPoint, appendHudInput, clearHudInput, backspaceHudInput, clearTempPoints]
  );

  // Attach event listeners (use capture phase to intercept before OrbitControls)
  useEffect(() => {
    const canvas = gl.domElement;

    // Use capture phase to get events before OrbitControls
    canvas.addEventListener('pointermove', handlePointerMove, { capture: true });
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove, { capture: true });
      canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gl, handlePointerMove, handlePointerDown, handleKeyDown]);

  // Reset axis lock when points change
  useEffect(() => {
    if (tempPoints.length === 0) {
      setAxisLock('none');
    }
  }, [tempPoints.length, setAxisLock]);

  // Don't render anything if not enabled or no cursor position
  if (!enabled || tool === 'select' || !cursorPos) {
    return null;
  }

  // Render cursor indicator
  const cursorWorld = plane2DToWorld(cursorPos, cplane);

  // Color based on snap type
  const cursorColor =
    snapType === 'point'
      ? '#22c55e' // Green for point snap
      : snapType === 'axis'
      ? '#f59e0b' // Amber for axis lock
      : '#8b5cf6'; // Purple for grid/none

  return (
    <group name="sketch-input-layer">
      {/* Cursor indicator */}
      <mesh position={cursorWorld}>
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial color={cursorColor} depthTest={false} />
      </mesh>

      {/* Cursor crosshair */}
      <group position={cursorWorld}>
        {/* Horizontal line */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[1, 1, 30, 8]} />
          <meshBasicMaterial color={cursorColor} depthTest={false} />
        </mesh>
        {/* Vertical line */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1, 1, 30, 8]} />
          <meshBasicMaterial color={cursorColor} depthTest={false} />
        </mesh>
      </group>

      {/* Coordinates label */}
      <Html position={[cursorWorld.x + 30, cursorWorld.y + 20, cursorWorld.z]}>
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: cursorColor,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          [{cursorPos[0].toFixed(0)}, {cursorPos[1].toFixed(0)}]
          {axisLock !== 'none' && (
            <span style={{ marginLeft: 4, color: '#f59e0b' }}>
              {axisLock.toUpperCase()}-Lock
            </span>
          )}
        </div>
      </Html>

      {/* Distance indicator (when we have at least one point) */}
      {tempPoints.length > 0 && (
        <DistanceIndicator
          from={tempPoints[tempPoints.length - 1]}
          to={cursorPos}
          cplane={cplane}
        />
      )}
    </group>
  );
}

// ============================================================================
// Distance Indicator Sub-component
// ============================================================================

interface DistanceIndicatorProps {
  from: SketchPoint;
  to: SketchPoint;
  cplane: any;
}

function DistanceIndicator({ from, to, cplane }: DistanceIndicatorProps) {
  const dist = distance2D(from, to);
  const midpoint: SketchPoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const midWorld = plane2DToWorld(midpoint, cplane);

  return (
    <Html position={midWorld}>
      <div
        style={{
          backgroundColor: 'rgba(139, 92, 246, 0.9)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          transform: 'translate(-50%, -100%)',
        }}
      >
        {dist.toFixed(0)} mm
      </div>
    </Html>
  );
}

export default SketchInputLayer;
