/**
 * overlayPreviewTransform.ts - Preview-Only Transform for CNC Overlay Points
 *
 * Applies the same flip/rotation transform that Hardware3D uses,
 * but ONLY for visualization — manufacturing truth (op.position) is never mutated.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ PREVIEW-ONLY: This module must NEVER be imported by G-code/export modules
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Transform formula:
 *   P' = A + M * (P - A)
 *
 * Where:
 *   P  = original position (mm, machine coords — manufacturing truth)
 *   A  = anchor point (mm, typically targetPocketCenter)
 *   M  = preview matrix (flip + fine rotation, matches Hardware3D)
 *   P' = transformed position (mm, preview-only)
 *
 * @version 1.0.0 - Phase D4.2
 */

import * as THREE from 'three';
import type { Position3D } from '../../../cnc/operation/operationTypes';
import type { CncOverlayPoint, CncOverlayPreviewMeta } from './cncOverlayTypes';

// ============================================================================
// PREVIEW STATE INTERFACE
// ============================================================================

/**
 * Minimal preview state needed for transform.
 * Matches the preview-only fields from MinifixFullConfig.
 */
export interface OverlayPreviewState {
  flipVertical: boolean;
  flipHorizontal: boolean;
  rotationX: number; // degrees
  rotationY: number; // degrees
  rotationZ: number; // degrees
}

/** Default (no-op) preview state */
export const IDENTITY_PREVIEW: OverlayPreviewState = {
  flipVertical: false,
  flipHorizontal: false,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
};

// ============================================================================
// MATRIX BUILDER
// ============================================================================

const DEG_TO_RAD = Math.PI / 180;

// Reusable temp objects (avoid GC pressure in render loops)
const _matS = /* @__PURE__ */ new THREE.Matrix4();
const _matRx = /* @__PURE__ */ new THREE.Matrix4();
const _matRy = /* @__PURE__ */ new THREE.Matrix4();
const _matRz = /* @__PURE__ */ new THREE.Matrix4();
const _tempP = /* @__PURE__ */ new THREE.Vector3();
const _tempA = /* @__PURE__ */ new THREE.Vector3();

/**
 * Build a 4×4 preview transform matrix matching Hardware3D behavior.
 *
 * Hardware3D applies transforms in this order (Three.js <group> semantics):
 *   1. Scale (flipH → scaleX=-1, flipV → scaleY=-1)
 *   2. Rotation (rotX, rotY, rotZ in Euler XYZ order)
 *
 * NOTE: Hardware3D uses negative scale for flips (not 180° rotation).
 * We replicate this exactly so overlay matches hardware 1:1.
 */
export function buildPreviewMatrix(
  preview: OverlayPreviewState
): THREE.Matrix4 {
  const scaleX = preview.flipHorizontal ? -1 : 1;
  const scaleY = preview.flipVertical ? -1 : 1;

  const rotX = preview.rotationX * DEG_TO_RAD;
  const rotY = preview.rotationY * DEG_TO_RAD;
  const rotZ = preview.rotationZ * DEG_TO_RAD;

  // Build combined matrix: M = Rz * Ry * Rx * S
  // This matches Three.js default Euler XYZ application order with scale
  _matS.makeScale(scaleX, scaleY, 1);
  _matRx.makeRotationX(rotX);
  _matRy.makeRotationY(rotY);
  _matRz.makeRotationZ(rotZ);

  // Compose: result = Rz * Ry * Rx * S
  const result = new THREE.Matrix4();
  result.copy(_matRz).multiply(_matRy).multiply(_matRx).multiply(_matS);

  return result;
}

// ============================================================================
// POSITION TRANSFORM
// ============================================================================

/**
 * Apply preview transform to a single overlay point position.
 *
 * Works in mm-space (before mm→m conversion and Y/Z swap).
 * Returns a NEW position — never mutates the input.
 *
 * If no preview metadata or no preview state, returns position unchanged.
 *
 * @param point - CNC overlay point with optional preview metadata
 * @param previewState - Current flip/rotation state (from MinifixFullConfig)
 * @returns Transformed position in mm (machine coord space, preview-only)
 */
export function applyOverlayPreviewTransform(
  point: CncOverlayPoint,
  previewState?: OverlayPreviewState | null
): Position3D {
  // No preview metadata or no preview state → return truth position
  if (!point.preview || !previewState) {
    return point.position;
  }

  // Identity check — skip matrix math if no actual transform
  if (
    !previewState.flipVertical &&
    !previewState.flipHorizontal &&
    previewState.rotationX === 0 &&
    previewState.rotationY === 0 &&
    previewState.rotationZ === 0
  ) {
    return point.position;
  }

  const M = buildPreviewMatrix(previewState);
  return applyTransformAroundAnchor(point.position, point.preview.anchor, M);
}

/**
 * Apply P' = A + M * (P - A)
 *
 * Transform position P around anchor A using matrix M.
 */
export function applyTransformAroundAnchor(
  position: Position3D,
  anchor: Position3D,
  matrix: THREE.Matrix4
): Position3D {
  _tempP.set(
    position.x - anchor.x,
    position.y - anchor.y,
    position.z - anchor.z
  );

  _tempP.applyMatrix4(matrix);

  return {
    x: _tempP.x + anchor.x,
    y: _tempP.y + anchor.y,
    z: _tempP.z + anchor.z,
  };
}

/**
 * Transform a normal/direction vector (rotation only, no translation).
 *
 * Used for transforming drill axis directions in preview.
 */
export function applyPreviewNormalTransform(
  normal: Position3D,
  previewState: OverlayPreviewState
): Position3D {
  if (
    !previewState.flipVertical &&
    !previewState.flipHorizontal &&
    previewState.rotationX === 0 &&
    previewState.rotationY === 0 &&
    previewState.rotationZ === 0
  ) {
    return normal;
  }

  const M = buildPreviewMatrix(previewState);
  const normalMatrix = new THREE.Matrix3().setFromMatrix4(M);

  _tempP.set(normal.x, normal.y, normal.z);
  _tempP.applyMatrix3(normalMatrix).normalize();

  return { x: _tempP.x, y: _tempP.y, z: _tempP.z };
}

// ============================================================================
// CONVENIENCE: Convert preview position to Three.js coords
// ============================================================================

const MM_TO_M = 0.001;

/**
 * Apply preview transform + convert to Three.js coordinate system.
 *
 * Pipeline:
 *   1. Apply P' = A + M(P-A) in mm-space
 *   2. Convert mm → meters
 *   3. Swap Y/Z for Three.js convention: [x, z, -y]
 *
 * @param point - Overlay point
 * @param previewState - Current flip/rotation state
 * @param heightOffset - Vertical offset for cylinder center (meters)
 * @returns [x, y, z] in Three.js coordinate system (meters)
 */
export function overlayPointToThreePosition(
  point: CncOverlayPoint,
  previewState: OverlayPreviewState | null | undefined,
  heightOffset: number = 0
): [number, number, number] {
  const pos = applyOverlayPreviewTransform(point, previewState);

  const x = pos.x * MM_TO_M;
  const y = pos.y * MM_TO_M;
  const z = pos.z * MM_TO_M - heightOffset;

  // Swap Y/Z for Three.js coordinate system
  return [x, z, -y];
}
