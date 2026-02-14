/**
 * Bolt Orientation Utilities
 *
 * Computes bolt quaternions, panel normals, and drilling axes
 * for hardware placement in Cabinet3D visualization.
 */

import * as THREE from 'three';

// ============================================
// TYPES
// ============================================

export type MountType = 'INSET' | 'OVERLAY';
export type Corner = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

interface BoltConfig {
  corner?: Corner;
  mountType: MountType;
  panelNormal?: THREE.Vector3;
  boltDirWorld?: THREE.Vector3;
  boltPanelNormalWorld?: THREE.Vector3;
  twist?: number;
}

interface BoltResult {
  boltQuat: THREE.Quaternion;
}

// ============================================
// NORMAL VECTORS PER CORNER
// ============================================

const CORNER_NORMALS: Record<Corner, THREE.Vector3> = {
  TOP_LEFT: new THREE.Vector3(0, 1, 0),
  TOP_RIGHT: new THREE.Vector3(0, 1, 0),
  BOTTOM_LEFT: new THREE.Vector3(0, -1, 0),
  BOTTOM_RIGHT: new THREE.Vector3(0, -1, 0),
};

const DRILL_AXES: Record<Corner, Record<MountType, THREE.Vector3>> = {
  TOP_LEFT: { INSET: new THREE.Vector3(0, -1, 0), OVERLAY: new THREE.Vector3(0, 0, -1) },
  TOP_RIGHT: { INSET: new THREE.Vector3(0, -1, 0), OVERLAY: new THREE.Vector3(0, 0, -1) },
  BOTTOM_LEFT: { INSET: new THREE.Vector3(0, 1, 0), OVERLAY: new THREE.Vector3(0, 0, -1) },
  BOTTOM_RIGHT: { INSET: new THREE.Vector3(0, 1, 0), OVERLAY: new THREE.Vector3(0, 0, -1) },
};

// ============================================
// FUNCTIONS
// ============================================

/**
 * Compute bolt quaternion with optional twist.
 */
export function computeBoltQuatWithTwist(config: BoltConfig): BoltResult {
  const normal = config.boltPanelNormalWorld ?? config.panelNormal ?? (config.corner ? selectBoltPanelNormalWorld(config.corner) : new THREE.Vector3(0, 1, 0));
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());

  if (config.twist) {
    const twistQuat = new THREE.Quaternion();
    twistQuat.setFromAxisAngle(normal.clone().normalize(), config.twist);
    quat.premultiply(twistQuat);
  }

  return { boltQuat: quat };
}

/**
 * Select the panel normal direction for a bolt at a given corner.
 */
export function selectBoltPanelNormalWorld(corner: Corner): THREE.Vector3 {
  return CORNER_NORMALS[corner]?.clone() ?? new THREE.Vector3(0, 1, 0);
}

/**
 * Get the drilling axis direction for a given corner and mount type.
 */
export function getDrillingAxis(corner: Corner, mountType: MountType): THREE.Vector3 {
  return DRILL_AXES[corner]?.[mountType]?.clone() ?? new THREE.Vector3(0, -1, 0);
}

/**
 * Format a Vector3 for display.
 */
export function formatVec(v: THREE.Vector3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

/**
 * Assert orientation matches expected values (development utility).
 */
export function assertOrientation(
  _result: BoltResult,
  _expected: { normal?: THREE.Vector3; axis?: THREE.Vector3 }
): void {
  // Development assertion - noop in production
}
