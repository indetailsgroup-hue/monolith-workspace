/**
 * SceneRegistry.tsx - Context for managing Object3D references in the scene
 *
 * Provides a registry for storing and retrieving Three.js Object3D references
 * by ID, enabling accurate world-space bounding box calculations for snap targets.
 *
 * @version 1.0.0
 */

import React, { createContext, useContext, useRef, useCallback, useMemo } from 'react';
import { Object3D, Box3, Vector3 } from 'three';

// ============================================
// TYPES
// ============================================

export interface SceneObjectEntry {
  id: string;
  object: Object3D;
  registeredAt: number;
}

export interface WorldBoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
}

export interface SceneRegistryContextType {
  /**
   * Register an Object3D with the given ID
   */
  register: (id: string, object: Object3D) => void;

  /**
   * Unregister an Object3D by ID
   */
  unregister: (id: string) => void;

  /**
   * Get an Object3D by ID
   */
  getObject: (id: string) => Object3D | null;

  /**
   * Get the world-space bounding box for an object
   */
  getWorldBox: (id: string) => WorldBoundingBox | null;

  /**
   * Get all registered object IDs
   */
  getRegisteredIds: () => string[];

  /**
   * Check if an object is registered
   */
  isRegistered: (id: string) => boolean;
}

// ============================================
// CONTEXT
// ============================================

const SceneRegistryContext = createContext<SceneRegistryContextType | null>(null);

// ============================================
// PROVIDER
// ============================================

interface SceneRegistryProviderProps {
  children: React.ReactNode;
}

export function SceneRegistryProvider({ children }: SceneRegistryProviderProps) {
  // Use ref to store objects (avoids re-renders on registration)
  const registryRef = useRef<Map<string, SceneObjectEntry>>(new Map());

  // Reusable Box3 and Vector3 for calculations (avoid allocations)
  const tempBox = useMemo(() => new Box3(), []);
  const tempCenter = useMemo(() => new Vector3(), []);
  const tempSize = useMemo(() => new Vector3(), []);

  const register = useCallback((id: string, object: Object3D) => {
    registryRef.current.set(id, {
      id,
      object,
      registeredAt: Date.now(),
    });
  }, []);

  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id);
  }, []);

  const getObject = useCallback((id: string): Object3D | null => {
    return registryRef.current.get(id)?.object ?? null;
  }, []);

  const getWorldBox = useCallback((id: string): WorldBoundingBox | null => {
    const entry = registryRef.current.get(id);
    if (!entry) return null;

    const object = entry.object;

    // Ensure world matrix is up to date
    object.updateMatrixWorld(true);

    // Calculate world bounding box
    tempBox.setFromObject(object);

    // Handle empty/invalid boxes
    if (tempBox.isEmpty()) {
      console.warn('[SceneRegistry] Empty bounding box for:', id);
      return null;
    }

    tempBox.getCenter(tempCenter);
    tempBox.getSize(tempSize);

    return {
      min: { x: tempBox.min.x, y: tempBox.min.y, z: tempBox.min.z },
      max: { x: tempBox.max.x, y: tempBox.max.y, z: tempBox.max.z },
      center: { x: tempCenter.x, y: tempCenter.y, z: tempCenter.z },
      size: { x: tempSize.x, y: tempSize.y, z: tempSize.z },
    };
  }, [tempBox, tempCenter, tempSize]);

  const getRegisteredIds = useCallback((): string[] => {
    return Array.from(registryRef.current.keys());
  }, []);

  const isRegistered = useCallback((id: string): boolean => {
    return registryRef.current.has(id);
  }, []);

  const value = useMemo<SceneRegistryContextType>(
    () => ({
      register,
      unregister,
      getObject,
      getWorldBox,
      getRegisteredIds,
      isRegistered,
    }),
    [register, unregister, getObject, getWorldBox, getRegisteredIds, isRegistered]
  );

  return (
    <SceneRegistryContext.Provider value={value}>
      {children}
    </SceneRegistryContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

/**
 * Hook to access the scene registry
 */
export function useSceneRegistry(): SceneRegistryContextType {
  const context = useContext(SceneRegistryContext);
  if (!context) {
    // Return a no-op implementation if used outside provider
    // This allows components to work without the provider (with fallback behavior)
    return {
      register: () => {},
      unregister: () => {},
      getObject: () => null,
      getWorldBox: () => null,
      getRegisteredIds: () => [],
      isRegistered: () => false,
    };
  }
  return context;
}

/**
 * Hook to check if scene registry is available
 */
export function useHasSceneRegistry(): boolean {
  const context = useContext(SceneRegistryContext);
  return context !== null;
}

export default SceneRegistryProvider;
