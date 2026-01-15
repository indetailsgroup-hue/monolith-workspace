/**
 * Tool Gizmo - 3D Manipulation Handles
 *
 * Plasticity-style interactive handles on geometry:
 * - Depth handle (vertical arrow)
 * - Offset handle (horizontal arrow)
 * - Visual feedback during drag
 *
 * v1.0: Initial tool gizmo
 */

import { useRef, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, Cone, Html } from '@react-three/drei';
import * as THREE from 'three';

interface ToolGizmoProps {
  /** World position of the gizmo */
  position: [number, number, number];
  /** Current depth value (mm) */
  depth: number;
  /** Current offset value (mm) */
  offset: number;
  /** Callback when depth changes */
  onDepthChange: (value: number, isDragging: boolean) => void;
  /** Callback when offset changes */
  onOffsetChange: (value: number, isDragging: boolean) => void;
  /** Scale factor (for visibility) */
  scale?: number;
  /** Show depth handle */
  showDepthHandle?: boolean;
  /** Show offset handle */
  showOffsetHandle?: boolean;
  /** Minimum depth */
  minDepth?: number;
  /** Maximum depth */
  maxDepth?: number;
  /** Minimum offset */
  minOffset?: number;
  /** Maximum offset */
  maxOffset?: number;
}

export function ToolGizmo({
  position,
  depth,
  offset,
  onDepthChange,
  onOffsetChange,
  scale = 1,
  showDepthHandle = true,
  showOffsetHandle = true,
  minDepth = 0,
  maxDepth = 50,
  minOffset = 0,
  maxOffset = 100,
}: ToolGizmoProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Dragging state
  const [draggingAxis, setDraggingAxis] = useState<'depth' | 'offset' | null>(null);
  const [hoverAxis, setHoverAxis] = useState<'depth' | 'offset' | null>(null);
  const dragStartRef = useRef<{ screenY: number; screenX: number; value: number }>({
    screenY: 0,
    screenX: 0,
    value: 0,
  });

  // Handle size based on camera distance
  const handleLength = 0.05 * scale; // 50mm in meters
  const handleRadius = 0.008 * scale;
  const coneSize = 0.012 * scale;

  // Colors
  const depthColor = hoverAxis === 'depth' || draggingAxis === 'depth' ? '#22c55e' : '#16a34a';
  const offsetColor = hoverAxis === 'offset' || draggingAxis === 'offset' ? '#f59e0b' : '#d97706';

  // Drag handlers
  const handlePointerDown = useCallback(
    (axis: 'depth' | 'offset', e: { stopPropagation: () => void; clientX?: number; clientY?: number; nativeEvent?: PointerEvent }) => {
      e.stopPropagation();
      const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      setDraggingAxis(axis);
      dragStartRef.current = {
        screenY: clientY,
        screenX: clientX,
        value: axis === 'depth' ? depth : offset,
      };
      gl.domElement.style.cursor = axis === 'depth' ? 'ns-resize' : 'ew-resize';
    },
    [depth, offset, gl]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingAxis) return;

      const sensitivity = 200; // pixels per unit (adjust as needed)
      const start = dragStartRef.current;

      if (draggingAxis === 'depth') {
        const deltaY = start.screenY - e.clientY; // Up = increase
        const newValue = Math.max(minDepth, Math.min(maxDepth, start.value + (deltaY / sensitivity) * maxDepth));
        onDepthChange(newValue, true);
      } else {
        const deltaX = e.clientX - start.screenX; // Right = increase
        const newValue = Math.max(minOffset, Math.min(maxOffset, start.value + (deltaX / sensitivity) * maxOffset));
        onOffsetChange(newValue, true);
      }
    },
    [draggingAxis, minDepth, maxDepth, minOffset, maxOffset, onDepthChange, onOffsetChange]
  );

  const handlePointerUp = useCallback(() => {
    if (draggingAxis === 'depth') {
      onDepthChange(depth, false);
    } else if (draggingAxis === 'offset') {
      onOffsetChange(offset, false);
    }
    setDraggingAxis(null);
    gl.domElement.style.cursor = '';
  }, [draggingAxis, depth, offset, onDepthChange, onOffsetChange, gl]);

  // Add/remove global listeners
  useFrame(() => {
    if (draggingAxis) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Depth Handle (Y-axis, green) */}
      {showDepthHandle && (
        <group>
          {/* Line */}
          <Line
            points={[
              [0, 0, 0],
              [0, handleLength, 0],
            ]}
            color={depthColor}
            lineWidth={draggingAxis === 'depth' ? 3 : 2}
          />
          {/* Arrow head */}
          <Cone
            args={[coneSize, coneSize * 2, 8]}
            position={[0, handleLength + coneSize, 0]}
            rotation={[0, 0, 0]}
            onPointerDown={(e) => handlePointerDown('depth', e)}
            onPointerEnter={() => setHoverAxis('depth')}
            onPointerLeave={() => setHoverAxis(null)}
          >
            <meshBasicMaterial color={depthColor} />
          </Cone>
          {/* Value label */}
          {(hoverAxis === 'depth' || draggingAxis === 'depth') && (
            <Html position={[0.02, handleLength / 2, 0]} center>
              <div
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  borderRadius: 4,
                  color: depthColor,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                Depth: {depth.toFixed(1)}mm
              </div>
            </Html>
          )}
        </group>
      )}

      {/* Offset Handle (X-axis, amber) */}
      {showOffsetHandle && (
        <group>
          {/* Line */}
          <Line
            points={[
              [0, 0, 0],
              [handleLength, 0, 0],
            ]}
            color={offsetColor}
            lineWidth={draggingAxis === 'offset' ? 3 : 2}
          />
          {/* Arrow head */}
          <Cone
            args={[coneSize, coneSize * 2, 8]}
            position={[handleLength + coneSize, 0, 0]}
            rotation={[0, 0, -Math.PI / 2]}
            onPointerDown={(e) => handlePointerDown('offset', e)}
            onPointerEnter={() => setHoverAxis('offset')}
            onPointerLeave={() => setHoverAxis(null)}
          >
            <meshBasicMaterial color={offsetColor} />
          </Cone>
          {/* Value label */}
          {(hoverAxis === 'offset' || draggingAxis === 'offset') && (
            <Html position={[handleLength / 2, 0.02, 0]} center>
              <div
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  borderRadius: 4,
                  color: offsetColor,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                Offset: {offset.toFixed(1)}mm
              </div>
            </Html>
          )}
        </group>
      )}

      {/* Center point */}
      <mesh>
        <sphereGeometry args={[handleRadius, 16, 16]} />
        <meshBasicMaterial color="#fff" opacity={0.8} transparent />
      </mesh>
    </group>
  );
}

/**
 * Edge Profile Gizmo - Shows depth handle on edge
 */
interface EdgeProfileGizmoProps {
  /** Edge start position */
  edgeStart: [number, number, number];
  /** Edge end position */
  edgeEnd: [number, number, number];
  /** Current depth */
  depth: number;
  /** Callback when depth changes */
  onDepthChange: (value: number, isDragging: boolean) => void;
  /** Maximum depth */
  maxDepth: number;
}

export function EdgeProfileGizmo({
  edgeStart,
  edgeEnd,
  depth,
  onDepthChange,
  maxDepth,
}: EdgeProfileGizmoProps) {
  // Calculate midpoint of edge
  const midpoint: [number, number, number] = [
    (edgeStart[0] + edgeEnd[0]) / 2,
    (edgeStart[1] + edgeEnd[1]) / 2,
    (edgeStart[2] + edgeEnd[2]) / 2,
  ];

  return (
    <ToolGizmo
      position={midpoint}
      depth={depth}
      offset={0}
      onDepthChange={onDepthChange}
      onOffsetChange={() => {}}
      showDepthHandle={true}
      showOffsetHandle={false}
      maxDepth={maxDepth}
    />
  );
}

/**
 * Groove Gizmo - Shows depth and offset handles
 */
interface GrooveGizmoProps {
  /** Groove center position */
  position: [number, number, number];
  /** Current depth */
  depth: number;
  /** Current offset */
  offset: number;
  /** Callback when depth changes */
  onDepthChange: (value: number, isDragging: boolean) => void;
  /** Callback when offset changes */
  onOffsetChange: (value: number, isDragging: boolean) => void;
  /** Maximum depth */
  maxDepth: number;
  /** Maximum offset */
  maxOffset: number;
}

export function GrooveGizmo({
  position,
  depth,
  offset,
  onDepthChange,
  onOffsetChange,
  maxDepth,
  maxOffset,
}: GrooveGizmoProps) {
  return (
    <ToolGizmo
      position={position}
      depth={depth}
      offset={offset}
      onDepthChange={onDepthChange}
      onOffsetChange={onOffsetChange}
      showDepthHandle={true}
      showOffsetHandle={true}
      maxDepth={maxDepth}
      maxOffset={maxOffset}
    />
  );
}

export default ToolGizmo;
