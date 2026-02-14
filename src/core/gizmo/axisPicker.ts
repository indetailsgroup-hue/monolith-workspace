/**
 * axisPicker.ts - Screen-Space Axis Picking for Robust Handle Selection
 *
 * Instead of relying on mesh raycasting (which can miss small handles),
 * we project gizmo axes to screen space and measure distance to pointer.
 *
 * FEATURES:
 * - Pick axis by clicking anywhere near the axis line (not just arrow head)
 * - Configurable picking thickness in pixels
 * - Parallel axis penalty (harder to pick axes that face camera)
 * - Deterministic and consistent across all zoom levels
 */

import type { Vec3 } from '../types/SnapTypes';
import type { GizmoAxis, GizmoSpace } from './gizmoTypes';

// ============================================
// TYPES
// ============================================

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface AxisPickResult {
  /** Best axis, or null if none within threshold */
  axis: GizmoAxis;
  /** Distance to axis in pixels */
  distPx: number;
  /** Parallel penalty applied (0-1) */
  parallelPenalty: number;
  /** Final score (lower is better) */
  score: number;
}

export interface AxisPickerConfig {
  /** Picking threshold in pixels */
  thresholdPx: number;
  /** Axis length in world units (mm) for projection */
  axisLengthWorld: number;
  /** Penalty multiplier for parallel axes (0-1) */
  parallelPenalty: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

export const DEFAULT_PICKER_CONFIG: AxisPickerConfig = {
  thresholdPx: 12,
  axisLengthWorld: 500,
  parallelPenalty: 0.35,
};

// ============================================
// MATH UTILITIES
// ============================================

/**
 * Project a 3D world point to 2D screen coordinates
 *
 * @param worldPoint - Point in world space (mm)
 * @param projectFn - Function to project world to NDC (-1..1)
 * @param viewportW - Viewport width in pixels
 * @param viewportH - Viewport height in pixels
 * @returns Screen coordinates in pixels
 */
export function projectToScreen(
  worldPoint: Vec3,
  projectFn: (p: Vec3) => { x: number; y: number; z: number },
  viewportW: number,
  viewportH: number
): ScreenPoint {
  const ndc = projectFn(worldPoint);
  return {
    x: (ndc.x * 0.5 + 0.5) * viewportW,
    y: (-ndc.y * 0.5 + 0.5) * viewportH,
  };
}

/**
 * Calculate distance from a point to a line segment in 2D
 *
 * @param p - Test point
 * @param a - Segment start
 * @param b - Segment end
 * @returns Distance and t parameter (0..1 along segment)
 */
export function distPointToSegment(
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint
): { dist: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const ab2 = abx * abx + aby * aby;

  // Degenerate segment (a == b)
  if (ab2 <= 1e-9) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    return { dist: Math.sqrt(dx * dx + dy * dy), t: 0 };
  }

  // Project p onto segment, clamping to [0, 1]
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  // Find closest point on segment
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;

  // Distance to closest point
  const dx = p.x - cx;
  const dy = p.y - cy;

  return { dist: Math.sqrt(dx * dx + dy * dy), t };
}

/**
 * Calculate how parallel an axis is to view direction
 *
 * @param axisUnit - Axis unit vector
 * @param viewDir - View direction unit vector
 * @returns 0..1 (0 = perpendicular, 1 = parallel)
 */
export function axisParallelFactor(axisUnit: Vec3, viewDir: Vec3): number {
  // Absolute dot product: 0 = perpendicular, 1 = parallel
  return Math.abs(
    axisUnit.x * viewDir.x + axisUnit.y * viewDir.y + axisUnit.z * viewDir.z
  );
}

// ============================================
// AXIS PICKER
// ============================================

/**
 * Pick the best gizmo axis from pointer position
 *
 * Projects all three axes to screen space and finds the one closest
 * to the pointer, with penalty for parallel axes.
 *
 * @param args.pointerPx - Pointer position in screen pixels
 * @param args.gizmoOrigin - Gizmo origin in world space (mm)
 * @param args.axisUnits - Unit vectors for X, Y, Z axes
 * @param args.viewDir - View direction (camera to gizmo)
 * @param args.projectFn - Function to project world to NDC
 * @param args.viewportW - Viewport width
 * @param args.viewportH - Viewport height
 * @param args.config - Picker configuration
 * @returns Best axis and picking info
 */
export function pickGizmoAxis(args: {
  pointerPx: ScreenPoint;
  gizmoOrigin: Vec3;
  axisUnits: { X: Vec3; Y: Vec3; Z: Vec3 };
  viewDir: Vec3;
  projectFn: (p: Vec3) => { x: number; y: number; z: number };
  viewportW: number;
  viewportH: number;
  config?: Partial<AxisPickerConfig>;
}): AxisPickResult {
  const config = { ...DEFAULT_PICKER_CONFIG, ...args.config };

  const axes: Array<{ axis: GizmoAxis; unit: Vec3 }> = [
    { axis: 'X', unit: args.axisUnits.X },
    { axis: 'Y', unit: args.axisUnits.Y },
    { axis: 'Z', unit: args.axisUnits.Z },
  ];

  // Project gizmo origin to screen
  const originScreen = projectToScreen(
    args.gizmoOrigin,
    args.projectFn,
    args.viewportW,
    args.viewportH
  );

  let bestAxis: GizmoAxis = null;
  let bestDist = Infinity;
  let bestPenalty = 0;
  let bestScore = Infinity;

  for (const { axis, unit } of axes) {
    // Calculate axis endpoint in world space
    const endWorld: Vec3 = {
      x: args.gizmoOrigin.x + unit.x * config.axisLengthWorld,
      y: args.gizmoOrigin.y + unit.y * config.axisLengthWorld,
      z: args.gizmoOrigin.z + unit.z * config.axisLengthWorld,
    };

    // Project endpoint to screen
    const endScreen = projectToScreen(
      endWorld,
      args.projectFn,
      args.viewportW,
      args.viewportH
    );

    // Distance from pointer to axis segment
    const { dist } = distPointToSegment(args.pointerPx, originScreen, endScreen);

    // Calculate parallel penalty
    const parallel = axisParallelFactor(unit, args.viewDir);
    const penalty = config.parallelPenalty * parallel * parallel;

    // Final score (lower is better)
    const score = dist * (1 + penalty);

    if (score < bestScore) {
      bestScore = score;
      bestDist = dist;
      bestPenalty = penalty;
      bestAxis = axis;
    }
  }

  // Only return axis if within threshold
  if (bestDist > config.thresholdPx) {
    return {
      axis: null,
      distPx: bestDist,
      parallelPenalty: bestPenalty,
      score: bestScore,
    };
  }

  return {
    axis: bestAxis,
    distPx: bestDist,
    parallelPenalty: bestPenalty,
    score: bestScore,
  };
}

/**
 * Calculate dynamic axis length based on camera distance
 *
 * Makes the picking region consistent on screen regardless of zoom.
 *
 * @param cameraDistance - Distance from camera to gizmo origin (mm)
 * @param fovDegrees - Camera vertical FOV in degrees
 * @param viewportH - Viewport height in pixels
 * @param targetPixels - Desired axis length on screen (default 140px)
 * @returns Axis length in world units (mm)
 */
export function calculateDynamicAxisLength(args: {
  cameraDistance: number;
  fovDegrees: number;
  viewportH: number;
  targetPixels?: number;
}): number {
  const { cameraDistance, fovDegrees, viewportH, targetPixels = 140 } = args;

  // Calculate visible height at gizmo distance
  const fovRad = (fovDegrees * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(fovRad / 2) * cameraDistance;

  // World units per pixel
  const worldPerPixel = visibleHeight / viewportH;

  return worldPerPixel * targetPixels;
}

// ============================================
// HOVER STATE MANAGEMENT
// ============================================

/**
 * State for tracking hover over gizmo axes
 */
export interface AxisHoverState {
  currentAxis: GizmoAxis;
  distPx: number;
  score: number;
}

/**
 * Update hover state from pointer move
 */
export function updateAxisHover(
  pointerPx: ScreenPoint,
  gizmoOrigin: Vec3 | null,
  axisUnits: { X: Vec3; Y: Vec3; Z: Vec3 } | null,
  viewDir: Vec3 | null,
  projectFn: ((p: Vec3) => { x: number; y: number; z: number }) | null,
  viewportW: number,
  viewportH: number,
  config?: Partial<AxisPickerConfig>
): AxisHoverState {
  // If any required data is missing, return no hover
  if (!gizmoOrigin || !axisUnits || !viewDir || !projectFn) {
    return { currentAxis: null, distPx: Infinity, score: Infinity };
  }

  const result = pickGizmoAxis({
    pointerPx,
    gizmoOrigin,
    axisUnits,
    viewDir,
    projectFn,
    viewportW,
    viewportH,
    config,
  });

  return {
    currentAxis: result.axis,
    distPx: result.distPx,
    score: result.score,
  };
}
