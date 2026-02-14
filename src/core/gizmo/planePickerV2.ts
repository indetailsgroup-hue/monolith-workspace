/**
 * planePickerV2.ts - DCC-Grade Screen-Space Plane Handle Picking
 *
 * FEATURES:
 * - Center square handle: free movement in plane (u + v)
 * - U edge strip: constrained to U axis within plane
 * - V edge strip: constrained to V axis within plane
 *
 * This allows users to drag constrained-axis without holding Shift:
 * - Click center square → free 2D movement
 * - Click U edge strip → movement only along U
 * - Click V edge strip → movement only along V
 *
 * ALGORITHM:
 * 1. Project gizmo origin to screen space
 * 2. Project U and V direction vectors to screen space
 * 3. Build AABB regions for center square and edge strips
 * 4. Test pointer against each region
 * 5. Return closest matching handle
 */

import * as THREE from 'three';
import type { Vec3 } from '../types/SnapTypes';
import type { GizmoPlane, GizmoSpace, GizmoHandle } from './gizmoTypes';
import type { LocalAxes } from './gizmoAxis';
import { getPlaneBasis, getPlaneBasisLocal } from './translatePlaneDrag';

// ============================================
// TYPES
// ============================================

export interface PlanePickV2Result {
  /** Handle kind: PLANE_CENTER, PLANE_U, or PLANE_V */
  kind: 'PLANE_CENTER' | 'PLANE_U' | 'PLANE_V';
  /** Which plane */
  plane: GizmoPlane;
  /** Distance to handle in pixels */
  distPx: number;
}

export interface PlanePickV2Config {
  /** Center square size in pixels (default 18) */
  squarePx: number;
  /** Edge strip length in pixels (default 28) */
  edgeLongPx: number;
  /** Edge strip thickness in pixels (default 8) */
  edgeThickPx: number;
  /** Hit threshold in pixels (default 6) */
  thresholdPx: number;
  /** Offset from center for edge strips (default equals squarePx/2) */
  edgeOffsetPx?: number;
}

export const DEFAULT_PLANE_PICK_V2_CONFIG: PlanePickV2Config = {
  squarePx: 18,
  edgeLongPx: 28,
  edgeThickPx: 8,
  thresholdPx: 6,
};

// ============================================
// HELPERS
// ============================================

interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Project world position to screen pixels
 */
function projectToScreenPx(args: {
  world: THREE.Vector3;
  camera: THREE.Camera;
  viewportW: number;
  viewportH: number;
}): ScreenPoint {
  const { world, camera, viewportW, viewportH } = args;
  const projected = world.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * viewportW,
    y: (-projected.y * 0.5 + 0.5) * viewportH,
  };
}

/**
 * Calculate distance from point to axis-aligned bounding box
 */
function distToAABB(
  p: ScreenPoint,
  minX: number, minY: number,
  maxX: number, maxY: number
): number {
  let dx = 0;
  if (p.x < minX) dx = minX - p.x;
  else if (p.x > maxX) dx = p.x - maxX;

  let dy = 0;
  if (p.y < minY) dy = minY - p.y;
  else if (p.y > maxY) dy = p.y - maxY;

  return Math.hypot(dx, dy);
}

/**
 * Calculate distance from point to oriented rectangle
 * Uses a simplified approach: project point onto rectangle's local space
 */
function distToOrientedRect(
  p: ScreenPoint,
  center: ScreenPoint,
  halfWidth: number,
  halfHeight: number,
  dirX: number,
  dirY: number
): number {
  // Direction perpendicular to (dirX, dirY)
  const perpX = -dirY;
  const perpY = dirX;

  // Vector from center to point
  const toP = { x: p.x - center.x, y: p.y - center.y };

  // Project onto local axes
  const localX = toP.x * dirX + toP.y * dirY;     // Along main direction
  const localY = toP.x * perpX + toP.y * perpY;   // Perpendicular

  // Distance to rectangle in local space
  let dx = 0;
  if (localX < -halfWidth) dx = -halfWidth - localX;
  else if (localX > halfWidth) dx = localX - halfWidth;

  let dy = 0;
  if (localY < -halfHeight) dy = -halfHeight - localY;
  else if (localY > halfHeight) dy = localY - halfHeight;

  return Math.hypot(dx, dy);
}

// ============================================
// MAIN PICKING FUNCTION
// ============================================

/**
 * Pick plane handle from screen position
 *
 * @param args.pointerPx - Pointer position in screen pixels
 * @param args.viewportW - Viewport width
 * @param args.viewportH - Viewport height
 * @param args.camera - Three.js camera
 * @param args.originWorld - Gizmo origin in world space (mm)
 * @param args.localAxes - Object's local axes (for LOCAL space)
 * @param args.space - Current gizmo space (WORLD or LOCAL)
 * @param args.planes - Which planes to test (default: all three)
 * @param args.config - Picking configuration
 * @returns Best matching plane handle, or null if none within threshold
 */
export function pickPlaneHandleV2(args: {
  pointerPx: ScreenPoint;
  viewportW: number;
  viewportH: number;
  camera: THREE.Camera;
  originWorld: Vec3;
  localAxes: LocalAxes;
  space: GizmoSpace;
  planes?: GizmoPlane[];
  config?: Partial<PlanePickV2Config>;
}): PlanePickV2Result | null {
  const config = { ...DEFAULT_PLANE_PICK_V2_CONFIG, ...args.config };
  const planes = args.planes ?? ['XY', 'XZ', 'YZ'] as GizmoPlane[];
  const p = args.pointerPx;

  // Project gizmo origin to screen
  const origin = new THREE.Vector3(args.originWorld.x, args.originWorld.y, args.originWorld.z);
  const originScreen = projectToScreenPx({
    world: origin,
    camera: args.camera,
    viewportW: args.viewportW,
    viewportH: args.viewportH,
  });

  let best: PlanePickV2Result | null = null;

  for (const plane of planes) {
    // Get plane basis vectors
    let basisU: Vec3, basisV: Vec3;

    if (args.space === 'LOCAL') {
      const local = getPlaneBasisLocal(plane, {
        X: args.localAxes.axisX,
        Y: args.localAxes.axisY,
        Z: args.localAxes.axisZ,
      });
      basisU = local.u;
      basisV = local.v;
    } else {
      const basis = getPlaneBasis(plane);
      basisU = basis.u;
      basisV = basis.v;
    }

    // Project U and V directions to screen space (use a point offset from origin)
    const uWorld = origin.clone().add(new THREE.Vector3(basisU.x, basisU.y, basisU.z).multiplyScalar(200));
    const vWorld = origin.clone().add(new THREE.Vector3(basisV.x, basisV.y, basisV.z).multiplyScalar(200));

    const uScreen = projectToScreenPx({
      world: uWorld,
      camera: args.camera,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
    });
    const vScreen = projectToScreenPx({
      world: vWorld,
      camera: args.camera,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
    });

    // Calculate normalized screen directions
    let ux = uScreen.x - originScreen.x;
    let uy = uScreen.y - originScreen.y;
    let vx = vScreen.x - originScreen.x;
    let vy = vScreen.y - originScreen.y;

    const uLen = Math.max(1e-6, Math.hypot(ux, uy));
    const vLen = Math.max(1e-6, Math.hypot(vx, vy));
    ux /= uLen; uy /= uLen;
    vx /= vLen; vy /= vLen;

    // Handle sizing
    const halfSquare = config.squarePx * 0.5;
    const edgeOffset = config.edgeOffsetPx ?? halfSquare;
    const halfLong = config.edgeLongPx * 0.5;
    const halfThick = config.edgeThickPx * 0.5;
    const threshold = config.thresholdPx;

    // 1) Center square (AABB approximation - works well for small squares)
    const dCenter = distToAABB(
      p,
      originScreen.x - halfSquare, originScreen.y - halfSquare,
      originScreen.x + halfSquare, originScreen.y + halfSquare
    );

    // 2) U edge strip (oriented rectangle along U direction)
    const uStripCenter: ScreenPoint = {
      x: originScreen.x + ux * (edgeOffset + halfLong),
      y: originScreen.y + uy * (edgeOffset + halfLong),
    };
    const dU = distToOrientedRect(p, uStripCenter, halfLong, halfThick, ux, uy);

    // 3) V edge strip (oriented rectangle along V direction)
    const vStripCenter: ScreenPoint = {
      x: originScreen.x + vx * (edgeOffset + halfLong),
      y: originScreen.y + vy * (edgeOffset + halfLong),
    };
    const dV = distToOrientedRect(p, vStripCenter, halfLong, halfThick, vx, vy);

    // Collect candidates within threshold
    const candidates: PlanePickV2Result[] = [];

    if (dCenter <= threshold) {
      candidates.push({ kind: 'PLANE_CENTER', plane, distPx: dCenter });
    }
    if (dU <= threshold) {
      candidates.push({ kind: 'PLANE_U', plane, distPx: dU });
    }
    if (dV <= threshold) {
      candidates.push({ kind: 'PLANE_V', plane, distPx: dV });
    }

    // Pick best candidate (closest)
    for (const c of candidates) {
      if (!best || c.distPx < best.distPx) {
        best = c;
      }
    }
  }

  return best;
}

/**
 * Convert PlanePickV2Result to GizmoHandle
 */
export function planePickV2ToHandle(result: PlanePickV2Result): GizmoHandle {
  return {
    kind: result.kind,
    plane: result.plane,
  };
}

/**
 * Unified picking: try plane handles first, then fall back to axis handles
 */
export function pickHandleV2(args: {
  pointerPx: ScreenPoint;
  viewportW: number;
  viewportH: number;
  camera: THREE.Camera;
  originWorld: Vec3;
  localAxes: LocalAxes;
  space: GizmoSpace;
  planes?: GizmoPlane[];
  planeConfig?: Partial<PlanePickV2Config>;
  axisPickFn?: () => GizmoHandle | null; // Fallback to axis picker
}): GizmoHandle | null {
  // Try plane handles first
  const planeResult = pickPlaneHandleV2({
    pointerPx: args.pointerPx,
    viewportW: args.viewportW,
    viewportH: args.viewportH,
    camera: args.camera,
    originWorld: args.originWorld,
    localAxes: args.localAxes,
    space: args.space,
    planes: args.planes,
    config: args.planeConfig,
  });

  if (planeResult) {
    return planePickV2ToHandle(planeResult);
  }

  // Fall back to axis picker
  if (args.axisPickFn) {
    return args.axisPickFn();
  }

  return null;
}
