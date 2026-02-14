/**
 * Three.js Plane Utilities
 *
 * Helpers for working with THREE.Plane and raycasting to the construction plane.
 *
 * @version 1.0.0
 */

import * as THREE from 'three';
import type { CPlane } from '../cplane/types';
import type { SketchPoint } from './types';

// ============================================================================
// Plane Creation
// ============================================================================

/**
 * Create a THREE.Plane from a CPlane definition.
 */
export function createThreePlane(cplane: CPlane): THREE.Plane {
  const normal = new THREE.Vector3(...cplane.normal);
  const origin = new THREE.Vector3(...cplane.origin);

  // Plane equation: normal · (point - origin) = 0
  // => normal · point = normal · origin
  const constant = -normal.dot(origin);

  return new THREE.Plane(normal, constant);
}

/**
 * Create a THREE.Plane from kind shorthand.
 */
export function createThreePlaneFromKind(
  kind: 'XZ' | 'XY' | 'YZ',
  origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): THREE.Plane {
  let normal: THREE.Vector3;

  switch (kind) {
    case 'XZ':
      normal = new THREE.Vector3(0, 1, 0); // Y-up
      break;
    case 'XY':
      normal = new THREE.Vector3(0, 0, 1); // Z-forward
      break;
    case 'YZ':
      normal = new THREE.Vector3(1, 0, 0); // X-right
      break;
  }

  const constant = -normal.dot(origin);
  return new THREE.Plane(normal, constant);
}

// ============================================================================
// Raycasting
// ============================================================================

/**
 * Intersect a ray with the construction plane.
 * Returns the world position of intersection, or null if parallel.
 */
export function raycastToPlane(
  ray: THREE.Ray,
  plane: THREE.Plane
): THREE.Vector3 | null {
  const target = new THREE.Vector3();
  const result = ray.intersectPlane(plane, target);
  return result;
}

/**
 * Convert a screen position to a ray using the camera.
 * @param screenPos - Normalized device coordinates (-1 to 1)
 * @param camera - The camera
 */
export function screenToRay(
  screenPos: { x: number; y: number },
  camera: THREE.Camera
): THREE.Ray {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(screenPos.x, screenPos.y), camera);
  return raycaster.ray;
}

// ============================================================================
// Coordinate Conversion
// ============================================================================

/**
 * Convert a world position to CPlane 2D coordinates [u, v].
 */
export function worldToPlane2D(
  worldPos: THREE.Vector3,
  cplane: CPlane
): SketchPoint {
  // Vector from origin to world position
  const dx = worldPos.x - cplane.origin[0];
  const dy = worldPos.y - cplane.origin[1];
  const dz = worldPos.z - cplane.origin[2];

  // Project onto U and V axes
  const u =
    dx * cplane.uAxis[0] + dy * cplane.uAxis[1] + dz * cplane.uAxis[2];
  const v =
    dx * cplane.vAxis[0] + dy * cplane.vAxis[1] + dz * cplane.vAxis[2];

  return [u, v];
}

/**
 * Convert CPlane 2D coordinates [u, v] to world position.
 */
export function plane2DToWorld(
  planePos: SketchPoint,
  cplane: CPlane
): THREE.Vector3 {
  const [u, v] = planePos;

  return new THREE.Vector3(
    cplane.origin[0] + u * cplane.uAxis[0] + v * cplane.vAxis[0],
    cplane.origin[1] + u * cplane.uAxis[1] + v * cplane.vAxis[1],
    cplane.origin[2] + u * cplane.uAxis[2] + v * cplane.vAxis[2]
  );
}

/**
 * Convert an array of CPlane 2D points to world positions.
 */
export function plane2DArrayToWorld(
  points: SketchPoint[],
  cplane: CPlane
): THREE.Vector3[] {
  return points.map((p) => plane2DToWorld(p, cplane));
}

// ============================================================================
// Mouse Event Helpers
// ============================================================================

/**
 * Get normalized device coordinates from a mouse event and canvas bounds.
 */
export function getNDC(
  event: { clientX: number; clientY: number },
  bounds: DOMRect
): { x: number; y: number } {
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    y: -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  };
}

/**
 * Full pipeline: mouse event → world position on CPlane → 2D coordinates.
 * Returns null if ray doesn't intersect plane.
 */
export function mouseToPlane2D(
  event: { clientX: number; clientY: number },
  bounds: DOMRect,
  camera: THREE.Camera,
  cplane: CPlane
): SketchPoint | null {
  const ndc = getNDC(event, bounds);
  const ray = screenToRay(ndc, camera);
  const threePlane = createThreePlane(cplane);
  const worldPos = raycastToPlane(ray, threePlane);

  if (!worldPos) return null;

  return worldToPlane2D(worldPos, cplane);
}
