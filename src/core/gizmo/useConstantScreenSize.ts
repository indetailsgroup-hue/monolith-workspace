/**
 * useConstantScreenSize.ts - Screen-Size Constant Gizmo Scaling
 *
 * FEATURES:
 * - Gizmo maintains constant screen size regardless of zoom/distance
 * - Works with both Perspective and Orthographic cameras
 * - Optional billboard mode (always face camera)
 * - Optional lerp smoothing for scale transitions
 *
 * MATH:
 * - Perspective: scale = distance * tan(fov/2) * 2 / viewportHeight * targetPx
 * - Ortho: scale = camera.top * 2 / viewportHeight * targetPx
 *
 * USAGE:
 * const { scale, worldUnitsPerPx } = useConstantScreenSize({
 *   targetRef: gizmoRef,
 *   targetSizePx: 150,
 * });
 */

import { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// TYPES
// ============================================

export interface UseConstantScreenSizeOptions {
  /** Target size in screen pixels (default: 150) */
  targetSizePx?: number;
  /** World position of the object (if not using ref) */
  worldPosition?: THREE.Vector3 | [number, number, number];
  /** Enable lerp smoothing (default: false) */
  enableLerp?: boolean;
  /** Lerp factor (0-1, higher = faster, default: 0.15) */
  lerpAlpha?: number;
  /** Minimum scale (default: 0.1) */
  minScale?: number;
  /** Maximum scale (default: 10) */
  maxScale?: number;
}

export interface ConstantScreenSizeResult {
  /** Current scale factor to apply */
  scale: number;
  /** World units per pixel at object depth */
  worldUnitsPerPx: number;
  /** Distance from camera to object */
  distance: number;
}

// ============================================
// HELPERS
// ============================================

/**
 * Calculate world units per pixel at a given distance for Perspective camera
 */
function calcWorldUnitsPerPxPerspective(
  camera: THREE.PerspectiveCamera,
  distance: number,
  viewportHeight: number
): number {
  // FOV is vertical in Three.js (in degrees)
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const halfFovTan = Math.tan(fovRad / 2);

  // Height of visible area at distance
  const visibleHeight = 2 * distance * halfFovTan;

  // World units per pixel
  return visibleHeight / viewportHeight;
}

/**
 * Calculate world units per pixel for Orthographic camera
 */
function calcWorldUnitsPerPxOrtho(
  camera: THREE.OrthographicCamera,
  viewportHeight: number
): number {
  // Ortho camera: top-bottom defines visible height
  const visibleHeight = camera.top - camera.bottom;

  return visibleHeight / viewportHeight;
}

/**
 * Get world units per pixel based on camera type
 */
function getWorldUnitsPerPx(
  camera: THREE.Camera,
  distance: number,
  viewportHeight: number
): number {
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    return calcWorldUnitsPerPxPerspective(
      camera as THREE.PerspectiveCamera,
      distance,
      viewportHeight
    );
  } else if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    return calcWorldUnitsPerPxOrtho(
      camera as THREE.OrthographicCamera,
      viewportHeight
    );
  }

  // Fallback: assume some default
  return 0.01;
}

// ============================================
// HOOK
// ============================================

/**
 * Hook to maintain constant screen size for gizmos
 *
 * @example
 * function MyGizmo({ position }) {
 *   const groupRef = useRef<THREE.Group>(null);
 *   const { scale } = useConstantScreenSize({
 *     targetRef: groupRef,
 *     targetSizePx: 150,
 *   });
 *
 *   return (
 *     <group ref={groupRef} position={position} scale={scale}>
 *       ...
 *     </group>
 *   );
 * }
 */
export function useConstantScreenSize(
  options: UseConstantScreenSizeOptions = {}
): ConstantScreenSizeResult {
  const {
    targetSizePx = 150,
    worldPosition,
    enableLerp = false,
    lerpAlpha = 0.15,
    minScale = 0.1,
    maxScale = 10,
  } = options;

  const { camera, size } = useThree();

  // Store for lerped values
  const lerpedScaleRef = useRef<number>(1);
  const resultRef = useRef<ConstantScreenSizeResult>({
    scale: 1,
    worldUnitsPerPx: 0.01,
    distance: 1,
  });

  // Get world position vector
  const worldPosVec = useMemo(() => {
    if (!worldPosition) return null;

    if (Array.isArray(worldPosition)) {
      return new THREE.Vector3(worldPosition[0], worldPosition[1], worldPosition[2]);
    }
    return worldPosition.clone();
  }, [worldPosition]);

  // Update scale every frame
  useFrame(() => {
    if (!worldPosVec) return;

    // Calculate distance from camera to object
    const distance = camera.position.distanceTo(worldPosVec);

    // Get world units per pixel at object depth
    const worldUnitsPerPx = getWorldUnitsPerPx(camera, distance, size.height);

    // Calculate scale to achieve target screen size
    // Base size is 1 world unit, so scale by (targetPx * worldUnitsPerPx)
    let targetScale = targetSizePx * worldUnitsPerPx;

    // Clamp scale
    targetScale = Math.max(minScale, Math.min(maxScale, targetScale));

    // Apply lerp if enabled
    let finalScale: number;
    if (enableLerp) {
      lerpedScaleRef.current = THREE.MathUtils.lerp(
        lerpedScaleRef.current,
        targetScale,
        lerpAlpha
      );
      finalScale = lerpedScaleRef.current;
    } else {
      finalScale = targetScale;
    }

    // Update result ref
    resultRef.current = {
      scale: finalScale,
      worldUnitsPerPx,
      distance,
    };
  });

  return resultRef.current;
}

/**
 * Reactive version that triggers re-render
 * Use this when you need the scale value in React render
 */
export function useConstantScreenSizeReactive(
  options: UseConstantScreenSizeOptions = {}
): ConstantScreenSizeResult {
  const {
    targetSizePx = 150,
    worldPosition,
    enableLerp = false,
    lerpAlpha = 0.15,
    minScale = 0.1,
    maxScale = 10,
  } = options;

  const { camera, size } = useThree();

  // Use state for reactive updates
  const resultRef = useRef<ConstantScreenSizeResult>({
    scale: 1,
    worldUnitsPerPx: 0.01,
    distance: 1,
  });
  const lerpedScaleRef = useRef<number>(1);

  // Get world position vector
  const worldPosVec = useMemo(() => {
    if (!worldPosition) return null;

    if (Array.isArray(worldPosition)) {
      return new THREE.Vector3(worldPosition[0], worldPosition[1], worldPosition[2]);
    }
    return worldPosition.clone();
  }, [worldPosition]);

  useFrame(() => {
    if (!worldPosVec) return;

    const distance = camera.position.distanceTo(worldPosVec);
    const worldUnitsPerPx = getWorldUnitsPerPx(camera, distance, size.height);

    let targetScale = targetSizePx * worldUnitsPerPx;
    targetScale = Math.max(minScale, Math.min(maxScale, targetScale));

    let finalScale: number;
    if (enableLerp) {
      lerpedScaleRef.current = THREE.MathUtils.lerp(
        lerpedScaleRef.current,
        targetScale,
        lerpAlpha
      );
      finalScale = lerpedScaleRef.current;
    } else {
      finalScale = targetScale;
    }

    resultRef.current = {
      scale: finalScale,
      worldUnitsPerPx,
      distance,
    };
  });

  return resultRef.current;
}

/**
 * Calculate scale factor for a given position (non-hook version)
 * Useful for one-time calculations or outside React
 */
export function calculateConstantScale(args: {
  camera: THREE.Camera;
  worldPosition: THREE.Vector3;
  viewportHeight: number;
  targetSizePx: number;
  minScale?: number;
  maxScale?: number;
}): ConstantScreenSizeResult {
  const {
    camera,
    worldPosition,
    viewportHeight,
    targetSizePx,
    minScale = 0.1,
    maxScale = 10,
  } = args;

  const distance = camera.position.distanceTo(worldPosition);
  const worldUnitsPerPx = getWorldUnitsPerPx(camera, distance, viewportHeight);

  let scale = targetSizePx * worldUnitsPerPx;
  scale = Math.max(minScale, Math.min(maxScale, scale));

  return { scale, worldUnitsPerPx, distance };
}

export default useConstantScreenSize;
