/**
 * planePicker.ts - Screen-Space Plane Handle Picking
 *
 * Picks plane handles (XY, XZ, YZ squares) based on pointer position.
 * Uses screen-space projection for robust, zoom-independent picking.
 *
 * FEATURES:
 * - Pick plane by clicking on the center square region
 * - Configurable picking region size
 * - View angle weighting (harder to pick planes parallel to view)
 * - Deterministic and consistent across all zoom levels
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoPlane } from './gizmoTypes';
import type { ScreenPoint, AxisPickerConfig } from './axisPicker';
import { projectToScreen, distPointToSegment, axisParallelFactor, pickGizmoAxis } from './axisPicker';
import { dot, cross, normalize, len, scale, add } from '../math/vec3Utils';
import { getPlaneNormal, getPlaneBasis, getPlaneBasisLocal } from './translatePlaneDrag';

// ============================================
// TYPES
// ============================================

export interface PlanePickResult {
  /** Best plane, or null if none within threshold */
  plane: GizmoPlane | null;
  /** Distance to plane center in pixels */
  distPx: number;
  /** View angle penalty applied (0-1) */
  viewPenalty: number;
  /** Final score (lower is better) */
  score: number;
}

export interface PlanePickerConfig {
  /** Size of plane handle as fraction of axis length (default 0.3 = 30%) */
  handleSizeFraction: number;
  /** Picking threshold in pixels */
  thresholdPx: number;
  /** Penalty multiplier for parallel planes (0-1) */
  viewPenalty: number;
  /** Offset from origin as fraction of axis length (default 0.15) */
  handleOffsetFraction: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_PLANE_PICKER_CONFIG: PlanePickerConfig = {
  handleSizeFraction: 0.25,
  thresholdPx: 20,
  viewPenalty: 0.5,
  handleOffsetFraction: 0.15,
};

// ============================================
// PLANE HANDLE GEOMETRY
// ============================================

/**
 * Get the 4 corners of a plane handle in world space
 * The handle is a small square offset from the origin along both axes
 */
export function getPlaneHandleCorners(
  origin: Vec3,
  basisU: Vec3,
  basisV: Vec3,
  axisLength: number,
  config: PlanePickerConfig
): [Vec3, Vec3, Vec3, Vec3] {
  const offset = axisLength * config.handleOffsetFraction;
  const size = axisLength * config.handleSizeFraction;

  // Handle center is offset from origin along both axes
  const centerU = offset + size / 2;
  const centerV = offset + size / 2;

  // Half size for corner calculation
  const halfSize = size / 2;

  // Calculate 4 corners
  const c1 = add(
    add(origin, scale(basisU, centerU - halfSize)),
    scale(basisV, centerV - halfSize)
  );
  const c2 = add(
    add(origin, scale(basisU, centerU + halfSize)),
    scale(basisV, centerV - halfSize)
  );
  const c3 = add(
    add(origin, scale(basisU, centerU + halfSize)),
    scale(basisV, centerV + halfSize)
  );
  const c4 = add(
    add(origin, scale(basisU, centerU - halfSize)),
    scale(basisV, centerV + halfSize)
  );

  return [c1, c2, c3, c4];
}

/**
 * Get the center of a plane handle in world space
 */
export function getPlaneHandleCenter(
  origin: Vec3,
  basisU: Vec3,
  basisV: Vec3,
  axisLength: number,
  config: PlanePickerConfig
): Vec3 {
  const offset = axisLength * config.handleOffsetFraction;
  const size = axisLength * config.handleSizeFraction;
  const center = offset + size / 2;

  return add(
    add(origin, scale(basisU, center)),
    scale(basisV, center)
  );
}

// ============================================
// POINT-IN-QUAD TEST
// ============================================

/**
 * Check if a 2D point is inside a convex quad (4 corners in screen space)
 * Uses cross product sign test
 */
function pointInQuad(
  p: ScreenPoint,
  c1: ScreenPoint,
  c2: ScreenPoint,
  c3: ScreenPoint,
  c4: ScreenPoint
): boolean {
  // Cross product z-component for 2D: (b-a) × (p-a)
  const cross2D = (a: ScreenPoint, b: ScreenPoint, pt: ScreenPoint): number =>
    (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);

  // Point is inside if all cross products have same sign
  const s1 = cross2D(c1, c2, p);
  const s2 = cross2D(c2, c3, p);
  const s3 = cross2D(c3, c4, p);
  const s4 = cross2D(c4, c1, p);

  // All positive or all negative
  const allPositive = s1 >= 0 && s2 >= 0 && s3 >= 0 && s4 >= 0;
  const allNegative = s1 <= 0 && s2 <= 0 && s3 <= 0 && s4 <= 0;

  return allPositive || allNegative;
}

/**
 * Calculate distance from point to quad (0 if inside)
 */
function distanceToQuad(
  p: ScreenPoint,
  c1: ScreenPoint,
  c2: ScreenPoint,
  c3: ScreenPoint,
  c4: ScreenPoint
): number {
  // If inside, distance is 0
  if (pointInQuad(p, c1, c2, c3, c4)) {
    return 0;
  }

  // Otherwise, distance to closest edge
  const d1 = distPointToSegment(p, c1, c2).dist;
  const d2 = distPointToSegment(p, c2, c3).dist;
  const d3 = distPointToSegment(p, c3, c4).dist;
  const d4 = distPointToSegment(p, c4, c1).dist;

  return Math.min(d1, d2, d3, d4);
}

// ============================================
// PLANE PICKER
// ============================================

/**
 * Pick the best plane handle from pointer position
 *
 * @param args.pointerPx - Pointer position in screen pixels
 * @param args.gizmoOrigin - Gizmo origin in world space (mm)
 * @param args.viewDir - View direction (camera to gizmo)
 * @param args.projectFn - Function to project world to NDC
 * @param args.viewportW - Viewport width
 * @param args.viewportH - Viewport height
 * @param args.axisLength - Axis length in world units for handle sizing
 * @param args.localAxes - Optional local axes for LOCAL space mode
 * @param args.config - Picker configuration
 * @returns Best plane and picking info
 */
export function pickGizmoPlane(args: {
  pointerPx: ScreenPoint;
  gizmoOrigin: Vec3;
  viewDir: Vec3;
  projectFn: (p: Vec3) => { x: number; y: number; z: number };
  viewportW: number;
  viewportH: number;
  axisLength: number;
  localAxes?: { X: Vec3; Y: Vec3; Z: Vec3 };
  config?: Partial<PlanePickerConfig>;
}): PlanePickResult {
  const config = { ...DEFAULT_PLANE_PICKER_CONFIG, ...args.config };

  const planes: GizmoPlane[] = ['XY', 'XZ', 'YZ'];

  let bestPlane: GizmoPlane | null = null;
  let bestDist = Infinity;
  let bestPenalty = 0;
  let bestScore = Infinity;

  for (const plane of planes) {
    // Get basis vectors for this plane
    let basisU: Vec3, basisV: Vec3, planeNormal: Vec3;

    if (args.localAxes) {
      const local = getPlaneBasisLocal(plane, args.localAxes);
      basisU = local.u;
      basisV = local.v;
      planeNormal = local.normal;
    } else {
      const basis = getPlaneBasis(plane);
      basisU = basis.u;
      basisV = basis.v;
      planeNormal = getPlaneNormal(plane);
    }

    // Get handle corners in world space
    const corners = getPlaneHandleCorners(
      args.gizmoOrigin,
      basisU,
      basisV,
      args.axisLength,
      config
    );

    // Project corners to screen space
    const screenCorners = corners.map((c) =>
      projectToScreen(c, args.projectFn, args.viewportW, args.viewportH)
    ) as [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];

    // Distance from pointer to quad
    const dist = distanceToQuad(
      args.pointerPx,
      screenCorners[0],
      screenCorners[1],
      screenCorners[2],
      screenCorners[3]
    );

    // View penalty: harder to pick planes facing the camera
    const viewDot = Math.abs(dot(planeNormal, args.viewDir));
    const penalty = config.viewPenalty * viewDot * viewDot;

    // Final score (lower is better)
    // For inside-quad hits (dist=0), use a small base score
    const effectiveDist = dist === 0 ? 1 : dist;
    const score = effectiveDist * (1 + penalty);

    if (score < bestScore && dist <= config.thresholdPx) {
      bestScore = score;
      bestDist = dist;
      bestPenalty = penalty;
      bestPlane = plane;
    }
  }

  return {
    plane: bestPlane,
    distPx: bestDist,
    viewPenalty: bestPenalty,
    score: bestScore,
  };
}

// ============================================
// UNIFIED PICKING (AXIS vs PLANE)
// ============================================

export interface UnifiedPickResult {
  /** Picked handle type */
  type: 'axis' | 'plane' | null;
  /** Axis if type is 'axis' */
  axis: 'X' | 'Y' | 'Z' | null;
  /** Plane if type is 'plane' */
  plane: GizmoPlane | null;
  /** Distance in pixels */
  distPx: number;
  /** Score (lower is better) */
  score: number;
}

/**
 * Pick either axis or plane handle, with planes having priority when inside
 *
 * Priority logic:
 * 1. If pointer is inside a plane handle, pick that plane
 * 2. Otherwise, pick the closest axis or plane by score
 */
export function pickGizmoHandle(args: {
  pointerPx: ScreenPoint;
  gizmoOrigin: Vec3;
  axisUnits: { X: Vec3; Y: Vec3; Z: Vec3 };
  viewDir: Vec3;
  projectFn: (p: Vec3) => { x: number; y: number; z: number };
  viewportW: number;
  viewportH: number;
  axisLength: number;
  axisConfig?: Partial<AxisPickerConfig>;
  planeConfig?: Partial<PlanePickerConfig>;
}): UnifiedPickResult {
  // Pick plane
  const planeResult = pickGizmoPlane({
    pointerPx: args.pointerPx,
    gizmoOrigin: args.gizmoOrigin,
    viewDir: args.viewDir,
    projectFn: args.projectFn,
    viewportW: args.viewportW,
    viewportH: args.viewportH,
    axisLength: args.axisLength,
    localAxes: args.axisUnits,
    config: args.planeConfig,
  });

  // Pick axis
  const axisResult = pickGizmoAxis({
    pointerPx: args.pointerPx,
    gizmoOrigin: args.gizmoOrigin,
    axisUnits: args.axisUnits,
    viewDir: args.viewDir,
    projectFn: args.projectFn,
    viewportW: args.viewportW,
    viewportH: args.viewportH,
    config: args.axisConfig,
  });

  // Priority: if inside plane handle (dist=0), pick plane
  if (planeResult.plane && planeResult.distPx === 0) {
    return {
      type: 'plane',
      axis: null,
      plane: planeResult.plane,
      distPx: planeResult.distPx,
      score: planeResult.score,
    };
  }

  // Otherwise, pick by score (lower is better)
  if (axisResult.axis && planeResult.plane) {
    if (axisResult.score < planeResult.score) {
      return {
        type: 'axis',
        axis: axisResult.axis,
        plane: null,
        distPx: axisResult.distPx,
        score: axisResult.score,
      };
    } else {
      return {
        type: 'plane',
        axis: null,
        plane: planeResult.plane,
        distPx: planeResult.distPx,
        score: planeResult.score,
      };
    }
  }

  // Only axis
  if (axisResult.axis) {
    return {
      type: 'axis',
      axis: axisResult.axis,
      plane: null,
      distPx: axisResult.distPx,
      score: axisResult.score,
    };
  }

  // Only plane
  if (planeResult.plane) {
    return {
      type: 'plane',
      axis: null,
      plane: planeResult.plane,
      distPx: planeResult.distPx,
      score: planeResult.score,
    };
  }

  // Nothing picked
  return {
    type: null,
    axis: null,
    plane: null,
    distPx: Infinity,
    score: Infinity,
  };
}

// ============================================
// HOVER STATE
// ============================================

export interface PlaneHoverState {
  currentPlane: GizmoPlane | null;
  distPx: number;
  score: number;
}

/**
 * Update plane hover state from pointer move
 */
export function updatePlaneHover(
  pointerPx: ScreenPoint,
  gizmoOrigin: Vec3 | null,
  viewDir: Vec3 | null,
  projectFn: ((p: Vec3) => { x: number; y: number; z: number }) | null,
  viewportW: number,
  viewportH: number,
  axisLength: number,
  localAxes?: { X: Vec3; Y: Vec3; Z: Vec3 } | null,
  config?: Partial<PlanePickerConfig>
): PlaneHoverState {
  if (!gizmoOrigin || !viewDir || !projectFn) {
    return { currentPlane: null, distPx: Infinity, score: Infinity };
  }

  const result = pickGizmoPlane({
    pointerPx,
    gizmoOrigin,
    viewDir,
    projectFn,
    viewportW,
    viewportH,
    axisLength,
    localAxes: localAxes || undefined,
    config,
  });

  return {
    currentPlane: result.plane,
    distPx: result.distPx,
    score: result.score,
  };
}
