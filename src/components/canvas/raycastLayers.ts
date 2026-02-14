/**
 * Raycast Layers (Stub)
 *
 * Layer constants for selective raycasting in Three.js.
 */

import type { Object3D } from 'three';

/** Raycast layer assignments */
export const RAY_LAYERS = {
  DEFAULT: 0,
  HARDWARE: 1,
  PANEL_FACE: 2,
  PANEL_EDGE: 3,
  GIZMO: 4,
  FLOOR: 5,
} as const;

/**
 * Set the raycast layer for a Three.js object.
 * Stub: noop.
 */
export function setObjectLayer(_object: Object3D, _layer: number): void {
  // Stub — layer management not yet implemented
}
