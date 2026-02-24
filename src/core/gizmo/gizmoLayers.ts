/**
 * gizmoLayers.ts - Render Layers and Flags for Gizmo System
 *
 * LAYERING STRATEGY:
 * Three.js render layers allow selective rendering. We use:
 * - Layer 0 (default): Regular scene objects (cabinets, room, etc.)
 * - Layer 1: Gizmo overlay (renders on top without depth test)
 * - Layer 2: Selection outlines
 * - Layer 3: Snap guides/helpers
 *
 * RENDER ORDER:
 * Objects with higher renderOrder draw later (on top).
 * Combined with depthTest=false, this creates overlay effect.
 *
 * USAGE:
 * // On gizmo meshes
 * <mesh layers={GIZMO_LAYERS.OVERLAY} renderOrder={RENDER_ORDER.GIZMO}>
 *   <meshBasicMaterial depthTest={false} depthWrite={false} />
 * </mesh>
 */

import * as THREE from 'three';

// ============================================
// LAYER INDICES
// ============================================

/**
 * Three.js layer indices for different object types
 * Objects can be on multiple layers (bit mask)
 */
export const GIZMO_LAYERS = {
  /** Default layer - all regular objects */
  DEFAULT: 0,
  /** Gizmo overlay layer - renders on top */
  OVERLAY: 1,
  /** Selection outline layer */
  SELECTION: 2,
  /** Snap guides and helpers */
  SNAP_GUIDES: 3,
  /** Grid overlay */
  GRID: 4,
  /** Debug visualization */
  DEBUG: 31,
} as const;

export type GizmoLayerKey = keyof typeof GIZMO_LAYERS;
export type GizmoLayerValue = typeof GIZMO_LAYERS[GizmoLayerKey];

// ============================================
// RENDER ORDER
// ============================================

/**
 * Render order values for overlay stacking
 * Higher values render later (on top)
 */
export const RENDER_ORDER = {
  /** Default scene objects */
  DEFAULT: 0,
  /** Grid overlay (below gizmo) */
  GRID: 100,
  /** Snap guides (below gizmo) */
  SNAP_GUIDES: 200,
  /** Selection outline */
  SELECTION: 300,
  /** Gizmo handles */
  GIZMO: 400,
  /** Gizmo active handle (on top of other handles) */
  GIZMO_ACTIVE: 450,
  /** Tooltips and HUD elements */
  HUD: 500,
} as const;

export type RenderOrderKey = keyof typeof RENDER_ORDER;
export type RenderOrderValue = typeof RENDER_ORDER[RenderOrderKey];

// ============================================
// MATERIAL FLAGS
// ============================================

/**
 * Common material configurations for gizmo elements
 */
export interface GizmoMaterialFlags {
  depthTest: boolean;
  depthWrite: boolean;
  transparent: boolean;
  renderOrder: number;
}

export const GIZMO_MATERIAL_FLAGS = {
  /** Standard gizmo handle (visible through objects) */
  OVERLAY: {
    depthTest: false,
    depthWrite: false,
    transparent: true,
    renderOrder: RENDER_ORDER.GIZMO,
  } satisfies GizmoMaterialFlags,

  /** Active/selected gizmo handle */
  OVERLAY_ACTIVE: {
    depthTest: false,
    depthWrite: false,
    transparent: true,
    renderOrder: RENDER_ORDER.GIZMO_ACTIVE,
  } satisfies GizmoMaterialFlags,

  /** Grid overlay */
  GRID: {
    depthTest: true,
    depthWrite: false,
    transparent: true,
    renderOrder: RENDER_ORDER.GRID,
  } satisfies GizmoMaterialFlags,

  /** Snap guide lines */
  SNAP_GUIDE: {
    depthTest: false,
    depthWrite: false,
    transparent: true,
    renderOrder: RENDER_ORDER.SNAP_GUIDES,
  } satisfies GizmoMaterialFlags,

  /** Selection outline */
  SELECTION: {
    depthTest: false,
    depthWrite: false,
    transparent: true,
    renderOrder: RENDER_ORDER.SELECTION,
  } satisfies GizmoMaterialFlags,
} as const;

// ============================================
// LAYER MASK HELPERS
// ============================================

/**
 * Create a layer mask from layer indices
 */
export function createLayerMask(...layers: number[]): number {
  let mask = 0;
  for (const layer of layers) {
    mask |= (1 << layer);
  }
  return mask;
}

/**
 * Set object to specific layers (replaces existing)
 */
export function setObjectLayers(object: THREE.Object3D, ...layers: number[]): void {
  object.layers.disableAll();
  for (const layer of layers) {
    object.layers.enable(layer);
  }
}

/**
 * Add object to additional layers (keeps existing)
 */
export function addObjectToLayers(object: THREE.Object3D, ...layers: number[]): void {
  for (const layer of layers) {
    object.layers.enable(layer);
  }
}

/**
 * Check if object is on a specific layer
 */
export function isObjectOnLayer(object: THREE.Object3D, layer: number): boolean {
  return object.layers.isEnabled(layer);
}

// ============================================
// CAMERA LAYER SETUP
// ============================================

/**
 * Configure camera to see specific layers
 */
export function setupCameraLayers(
  camera: THREE.Camera,
  includeLayers: number[] = [GIZMO_LAYERS.DEFAULT, GIZMO_LAYERS.OVERLAY]
): void {
  camera.layers.disableAll();
  for (const layer of includeLayers) {
    camera.layers.enable(layer);
  }
}

/**
 * Standard camera setup for gizmo scene
 */
export function setupGizmoCamera(camera: THREE.Camera): void {
  setupCameraLayers(camera, [
    GIZMO_LAYERS.DEFAULT,
    GIZMO_LAYERS.OVERLAY,
    GIZMO_LAYERS.SELECTION,
    GIZMO_LAYERS.SNAP_GUIDES,
    GIZMO_LAYERS.GRID,
  ]);
}

// ============================================
// APPLY FLAGS TO MATERIAL
// ============================================

/**
 * Apply gizmo material flags to a Three.js material
 */
export function applyGizmoFlags<T extends THREE.Material>(
  material: T,
  flags: GizmoMaterialFlags
): T {
  material.depthTest = flags.depthTest;
  material.depthWrite = flags.depthWrite;
  material.transparent = flags.transparent;
  // Note: renderOrder is on Object3D, not Material
  // This is returned for convenience
  return material;
}

/**
 * Create overlay material with gizmo flags pre-applied
 */
export function createOverlayMaterial(
  color: string | THREE.Color,
  opacity: number = 1,
  flags: GizmoMaterialFlags = GIZMO_MATERIAL_FLAGS.OVERLAY
): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: flags.transparent,
    opacity,
    depthTest: flags.depthTest,
    depthWrite: flags.depthWrite,
  });
  return material;
}

/**
 * Create line material with gizmo flags pre-applied
 */
export function createOverlayLineMaterial(
  color: string | THREE.Color,
  opacity: number = 1,
  flags: GizmoMaterialFlags = GIZMO_MATERIAL_FLAGS.OVERLAY
): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: flags.transparent,
    opacity,
    depthTest: flags.depthTest,
    depthWrite: flags.depthWrite,
  });
  return material;
}

export default {
  GIZMO_LAYERS,
  RENDER_ORDER,
  GIZMO_MATERIAL_FLAGS,
  createLayerMask,
  setObjectLayers,
  addObjectToLayers,
  isObjectOnLayer,
  setupCameraLayers,
  setupGizmoCamera,
  applyGizmoFlags,
  createOverlayMaterial,
  createOverlayLineMaterial,
};
