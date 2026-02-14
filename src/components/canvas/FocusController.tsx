/**
 * FocusController - Camera Animation Controller (Ported from Indetails Smart)
 *
 * Provides smooth camera transitions to focus on selected parts/cabinets.
 * Features:
 * - Animated camera movement with easing
 * - FIT mode: Auto-zoom to fit object in view
 * - CENTER mode: Move camera target, maintain distance
 *
 * v1.0: Initial port from Indetails Smart with iimos-workspace adaptations
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ============================================
// TYPES
// ============================================

export interface FocusRequest {
  /** Target part/cabinet ID */
  partKey: string;
  /** Focus mode */
  mode?: 'FIT' | 'CENTER';
  /** Padding multiplier (default: 1.4) */
  padding?: number;
  /** Animation duration in ms (default: 800) */
  durationMs?: number;
  /** Optional explicit target position (mm) */
  targetPosition?: [number, number, number];
  /** Optional explicit target size (mm) */
  targetSize?: [number, number, number];
}

interface FocusControllerProps {
  /** Reference to OrbitControls */
  controlsRef: React.RefObject<OrbitControlsImpl>;
  /** Focus request (null = no focus) */
  request?: FocusRequest | null;
  /** Callback when animation completes */
  onConsumed?: () => void;
}

// ============================================
// EASING FUNCTIONS
// ============================================

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Recursively find object by userData.partKey or name
 */
function findPartObject(root: THREE.Object3D, partKey: string): THREE.Object3D | undefined {
  // Check userData tag (preferred)
  let found: THREE.Object3D | undefined;

  root.traverse((child) => {
    if (!found && (child.userData?.partKey === partKey || child.name === partKey)) {
      found = child;
    }
  });

  return found;
}

// ============================================
// COMPONENT
// ============================================

export function FocusController({
  controlsRef,
  request,
  onConsumed,
}: FocusControllerProps) {
  const { camera, scene, size } = useThree();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!request) return;
    if (!controlsRef.current) return;

    // Wait a tick to ensure scene graph is updated
    const timeout = setTimeout(() => {
      let center: THREE.Vector3;
      let boxSize: THREE.Vector3;

      // If explicit target position/size provided, use those
      if (request.targetPosition && request.targetSize) {
        center = new THREE.Vector3(
          request.targetPosition[0],
          request.targetPosition[1],
          request.targetPosition[2]
        );
        boxSize = new THREE.Vector3(
          request.targetSize[0],
          request.targetSize[1],
          request.targetSize[2]
        );
      } else {
        // Find object by partKey
        const object = findPartObject(scene, request.partKey);

        if (!object) {
          console.warn(`[FocusController] Object not found: ${request.partKey}`);
          onConsumed?.();
          return;
        }

        // Compute bounds
        const box = new THREE.Box3().setFromObject(object);

        // Handle empty box
        if (box.isEmpty()) {
          box.setFromCenterAndSize(
            object.position,
            new THREE.Vector3(500, 500, 500) // Default 500mm cube
          );
        }

        center = new THREE.Vector3();
        boxSize = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(boxSize);
      }

      const padding = request.padding ?? 1.4;
      const duration = request.durationMs ?? 800;
      const mode = request.mode ?? 'FIT';

      // Target
      const controls = controlsRef.current!;
      const startTarget = controls.target.clone();
      const endTarget = center.clone();

      // Camera position solving
      const startPos = camera.position.clone();
      let endPos = startPos.clone();

      if (mode === 'CENTER') {
        // Maintain current distance, only retarget + slight pan
        const dist = startPos.distanceTo(startTarget);
        const dir = startPos.clone().sub(startTarget).normalize();
        endPos = endTarget.clone().add(dir.multiplyScalar(dist));
      } else {
        // FIT: compute distance needed based on FOV and object size
        const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
        const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
        const aspect = size.width / size.height;

        // Conservative fit for vertical fov:
        // distance = (size / 2) / tan(fov / 2)
        const fitHeightDist = (maxDim * padding / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));

        // Check horizontal fit
        const fitWidthDist = fitHeightDist / aspect;

        const dist = Math.max(fitHeightDist, fitWidthDist);

        // Keep viewing direction from current camera to current target
        const dir = startPos.clone().sub(startTarget).normalize();

        // Prevent camera from getting stuck inside if it was too close
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);

        endPos = endTarget.clone().add(dir.multiplyScalar(dist));
      }

      // Animate
      const t0 = performance.now();

      const tick = () => {
        const now = performance.now();
        const t = Math.min(1, (now - t0) / duration);
        const e = easeInOutCubic(t);

        // Lerp camera and target
        camera.position.lerpVectors(startPos, endPos, e);
        controls.target.lerpVectors(startTarget, endTarget, e);

        controls.update();

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          onConsumed?.();
        }
      };

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }, 50); // Small delay for mount

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [request, controlsRef, camera, scene, size, onConsumed]);

  return null;
}

export default FocusController;
