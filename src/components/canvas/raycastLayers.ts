/**
 * raycastLayers.ts - v1.0
 *
 * Three.js layer constants for raycast filtering.
 * Used to control which objects are interactive in different view modes.
 *
 * Layer System:
 * - HARDWARE (10): Always interactive, highest priority (Minifix, hinges, etc.)
 * - PANEL_EDGE (11): Panel outline/wireframe - clickable for panel selection
 * - PANEL_FACE (12): Panel faces - disabled in X-Ray mode
 * - DEFAULT (0): Standard three.js layer for general objects
 */

import * as THREE from 'three';

export const RAY_LAYERS = {
  DEFAULT: 0,        // Standard three.js default layer
  HARDWARE: 10,      // Minifix, hinges, etc. - always interactive
  PANEL_EDGE: 11,    // Panel edges/outlines - interactive in X-Ray
  PANEL_FACE: 12,    // Panel faces - NOT interactive in X-Ray
} as const;

export type RayLayerKey = keyof typeof RAY_LAYERS;

/**
 * Set object (and all children) to a specific layer
 */
export function setObjectLayer(object: THREE.Object3D, layer: number): void {
  object.traverse((o) => {
    o.layers.set(layer);
  });
}

/**
 * Enable multiple layers on an object (object visible to raycaster on any of these layers)
 */
export function enableObjectLayers(object: THREE.Object3D, layers: number[]): void {
  object.traverse((o) => {
    o.layers.disableAll();
    layers.forEach((layer) => o.layers.enable(layer));
  });
}

/**
 * Add object to a layer without removing from others
 */
export function addObjectToLayer(object: THREE.Object3D, layer: number): void {
  object.traverse((o) => {
    o.layers.enable(layer);
  });
}
