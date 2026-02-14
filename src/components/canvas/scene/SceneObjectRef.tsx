/**
 * SceneObjectRef.tsx - Component to auto-register Object3D in SceneRegistry
 *
 * Wraps children and registers the group's Object3D reference with the scene
 * registry on mount, and unregisters on unmount.
 *
 * @version 1.0.0
 */

import React, { useRef, useEffect } from 'react';
import { Group } from 'three';
import { useSceneRegistry } from './SceneRegistry';

// ============================================
// TYPES
// ============================================

interface SceneObjectRefProps {
  /**
   * Unique identifier for this object in the registry
   */
  id: string;

  /**
   * Children to render inside the registered group
   */
  children: React.ReactNode;

  /**
   * Optional callback when the ref is ready
   */
  onRefReady?: (group: Group) => void;
}

// ============================================
// COMPONENT
// ============================================

/**
 * Wrapper component that registers its group with the SceneRegistry
 *
 * Usage:
 * ```tsx
 * <SceneObjectRef id={cabinet.id}>
 *   <group position={[x, y, z]} rotation={[rx, ry, rz]}>
 *     <CabinetMesh />
 *   </group>
 * </SceneObjectRef>
 * ```
 */
export function SceneObjectRef({ id, children, onRefReady }: SceneObjectRefProps) {
  const groupRef = useRef<Group>(null);
  const { register, unregister } = useSceneRegistry();

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    // Register the group
    register(id, group);

    // Notify parent if callback provided
    if (onRefReady) {
      onRefReady(group);
    }

    // Unregister on unmount or id change
    return () => {
      unregister(id);
    };
  }, [id, register, unregister, onRefReady]);

  return <group ref={groupRef}>{children}</group>;
}

// ============================================
// HIGHER-ORDER COMPONENT (Alternative)
// ============================================

/**
 * HOC to wrap any component with SceneObjectRef
 *
 * Usage:
 * ```tsx
 * const RegisteredCabinet = withSceneObjectRef(CabinetMesh);
 * <RegisteredCabinet sceneObjectId={cabinet.id} {...props} />
 * ```
 */
export function withSceneObjectRef<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithSceneObjectRef(
    props: P & { sceneObjectId: string }
  ) {
    const { sceneObjectId, ...rest } = props;
    return (
      <SceneObjectRef id={sceneObjectId}>
        <WrappedComponent {...(rest as P)} />
      </SceneObjectRef>
    );
  };
}

export default SceneObjectRef;
