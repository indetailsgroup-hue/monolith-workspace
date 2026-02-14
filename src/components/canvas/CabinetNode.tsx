/**
 * CabinetNode.tsx - Wrapper component for cabinet in 3D scene
 *
 * Provides:
 * - Auto-registration with SceneRegistry for world bounding box calculations
 * - Transform controls (move/rotate) when active
 * - Click handling for selection
 *
 * @version 1.0.0
 */

import { useRef, useEffect, useState } from 'react';
import { Group, Object3D } from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { SceneObjectRef } from './scene';
import { useToolStore } from '../../core/store/useToolStore';

// ============================================
// TYPES
// ============================================

export interface CabinetNodeProps {
  /**
   * Unique cabinet ID - used for SceneRegistry registration
   */
  id: string;

  /**
   * World position [x, y, z] in mm
   */
  position: [number, number, number];

  /**
   * Euler rotation [x, y, z] in radians
   */
  rotation?: [number, number, number];

  /**
   * Whether this cabinet is currently active/selected
   */
  isActive?: boolean;

  /**
   * Children to render (cabinet meshes, labels, etc.)
   */
  children: React.ReactNode;

  /**
   * Called when cabinet is clicked (for selection)
   */
  onSelect?: () => void;

  /**
   * Called when position changes from transform controls
   */
  onPositionChange?: (position: [number, number, number]) => void;

  /**
   * Called when rotation changes from transform controls
   */
  onRotationChange?: (rotation: [number, number, number]) => void;

  /**
   * Optional ref callback when the group is ready
   */
  onRefReady?: (group: Group) => void;
}

// ============================================
// COMPONENT
// ============================================

/**
 * CabinetNode - Wrapper for cabinet objects in the 3D scene
 *
 * Usage:
 * ```tsx
 * <CabinetNode
 *   id={cabinet.id}
 *   position={cabinet.scenePosition}
 *   rotation={cabinet.sceneRotation}
 *   isActive={cabinet.id === activeCabinetId}
 *   onSelect={() => selectCabinet(cabinet.id)}
 *   onPositionChange={(pos) => updatePosition(cabinet.id, pos)}
 * >
 *   <CabinetMeshes cabinet={cabinet} />
 * </CabinetNode>
 * ```
 */
export function CabinetNode({
  id,
  position,
  rotation = [0, 0, 0],
  isActive = false,
  children,
  onSelect,
  onPositionChange,
  onRotationChange,
  onRefReady,
}: CabinetNodeProps) {
  const groupRef = useRef<Group>(null);
  const [isReady, setIsReady] = useState(false);
  const activeTool = useToolStore((s) => s.activeTool);

  // Signal when group is ready
  useEffect(() => {
    if (groupRef.current) {
      setIsReady(true);
      onRefReady?.(groupRef.current);
    }
  }, [onRefReady]);

  // Update position when prop changes (unless being dragged)
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(position[0], position[1], position[2]);
    }
  }, [position]);

  // Update rotation when prop changes
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
    }
  }, [rotation]);

  // Handle click for selection
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    // In glue mode, let clicks pass through to face planes
    if (activeTool === 'glue') {
      return;
    }
    e.stopPropagation();
    onSelect?.();
  };

  // Handle pointer events for cursor feedback
  const handlePointerOver = () => {
    if (activeTool === 'select' || activeTool === 'move') {
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
  };

  return (
    <SceneObjectRef
      id={id}
      onRefReady={(group: Group) => {
        // SceneObjectRef creates a wrapper group
        // We need to get our inner group for transforms
        if (onRefReady && groupRef.current) {
          onRefReady(groupRef.current);
        }
      }}
    >
      <group
        ref={groupRef}
        name={`cabinet-node-${id}`}
        position={position}
        rotation={rotation}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Selection outline for active cabinet */}
        {isActive && (
          <group name="selection-indicator">
            {/* Visual indicator rendered by children or parent */}
          </group>
        )}

        {/* Cabinet content */}
        {children}
      </group>
    </SceneObjectRef>
  );
}

/**
 * Hook to get a ref from CabinetNode for external use
 */
export function useCabinetNodeRef() {
  const ref = useRef<Group>(null);
  const setRef = (group: Group) => {
    (ref as any).current = group;
  };
  return [ref, setRef] as const;
}

export default CabinetNode;
