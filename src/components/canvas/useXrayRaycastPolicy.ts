/**
 * useXrayRaycastPolicy.ts - v1.0
 *
 * Hook to configure raycaster layer filtering based on view mode.
 *
 * In X-Ray mode:
 * - Panel faces are NOT raycastable (don't block hardware)
 * - Panel edges remain raycastable (for intentional selection)
 * - Hardware is ALWAYS raycastable with highest priority
 *
 * In Default mode:
 * - All objects are raycastable as usual
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { RAY_LAYERS } from './raycastLayers';

export type ViewMode = 'DEFAULT' | 'X_RAY' | string;

/**
 * Configure raycaster layers based on view mode
 * Must be called inside a Canvas component
 */
export function useXrayRaycastPolicy(xRayMode: boolean): void {
  const { raycaster, camera } = useThree();

  useEffect(() => {
    // Clear all layers first (raycaster uses a Layers bitmask)
    raycaster.layers.disableAll();

    // Always allow default layer (for general scene objects)
    raycaster.layers.enable(RAY_LAYERS.DEFAULT);

    // Always allow hardware - highest priority
    raycaster.layers.enable(RAY_LAYERS.HARDWARE);

    if (xRayMode) {
      // X-RAY MODE:
      // - Edges selectable (for intentional panel selection)
      // - Faces NOT selectable (don't block hardware behind them)
      raycaster.layers.enable(RAY_LAYERS.PANEL_EDGE);
      // DO NOT enable PANEL_FACE - this is the key!
    } else {
      // NORMAL MODE:
      // - Everything selectable as usual
      raycaster.layers.enable(RAY_LAYERS.PANEL_EDGE);
      raycaster.layers.enable(RAY_LAYERS.PANEL_FACE);
    }

    // Camera should see all objects regardless of raycast filtering
    // (visibility is separate from interactivity)
    camera.layers.enableAll();
  }, [xRayMode, raycaster, camera]);
}

export default useXrayRaycastPolicy;
