/**
 * cabinetBounds.ts - v1.0
 *
 * Utilities for computing cabinet world-space AABB and clamping
 * hardware position overrides to stay within cabinet bounds.
 *
 * Key concepts:
 * - Cabinet AABB is computed from PANEL MESHES ONLY (not hardware/helpers)
 * - Position overrides are clamped per-axis in world space
 * - Margin can be applied for safety clearance
 */

import * as THREE from 'three';
import type { Vec3Tuple, DrillMap } from './types';

// ============================================
// TYPES
// ============================================

/** World-space bounding box */
export interface Bounds3World {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/** Per-axis clamp ranges (relative to base position) */
export interface ClampRanges {
  x: [number, number];  // [minOffset, maxOffset] in mm
  y: [number, number];
  z: [number, number];
}

/** Result of clamping operation */
export interface ClampResult {
  clamped: Vec3Tuple;
  didClamp: boolean;
  clampedAxes: { x: boolean; y: boolean; z: boolean };
  ranges: ClampRanges;
}

// ============================================
// CONSTANTS
// ============================================

/** Default margin from cabinet edges (mm) */
export const DEFAULT_BOUNDS_MARGIN_MM = 0;

/** Fallback bounds when cabinet is not available */
export const FALLBACK_BOUNDS: Bounds3World = {
  min: [-1000, -1000, -1000],
  max: [1000, 1000, 1000],
};

// ============================================
// CABINET BOUNDS COMPUTATION
// ============================================

/**
 * Compute world-space AABB from a Three.js object (cabinet panels group).
 *
 * IMPORTANT: Pass only the panels group, NOT the entire cabinet with hardware/helpers,
 * to avoid bounds expanding incorrectly.
 *
 * @param panelsRoot - Three.js object containing panel meshes
 * @returns World-space bounding box
 */
export function computeCabinetBoundsWorld(panelsRoot: THREE.Object3D | null): Bounds3World {
  if (!panelsRoot) {
    console.warn('[cabinetBounds] No panels root provided, using fallback bounds');
    return FALLBACK_BOUNDS;
  }

  const box = new THREE.Box3();

  // Use setFromObject to compute world-space bounds including all children
  box.setFromObject(panelsRoot);

  // Check for invalid/empty bounds
  if (box.isEmpty()) {
    console.warn('[cabinetBounds] Empty bounds computed, using fallback');
    return FALLBACK_BOUNDS;
  }

  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * Compute bounds from cabinet dimensions (fallback when no 3D ref available).
 * Uses CENTER-BASED coordinate system to match drill map positions.
 *
 * @param width - Cabinet width (mm)
 * @param height - Cabinet height (mm)
 * @param depth - Cabinet depth (mm)
 * @returns Estimated world-space bounding box (center-based)
 */
export function computeBoundsFromDimensions(
  width: number,
  height: number,
  depth: number
): Bounds3World {
  // Cabinet coordinate system: FULLY CENTER-BASED (matches drill map generation)
  // X: -width/2 to +width/2
  // Y: -height/2 to +height/2 (center at 0)
  // Z: -depth/2 to +depth/2 (front is negative Z)
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;

  return {
    min: [-halfWidth, -halfHeight, -halfDepth],
    max: [halfWidth, halfHeight, halfDepth],
  };
}

/**
 * Compute bounds from actual drill map panel positions.
 * This is the MOST ACCURATE method as it uses the same coordinate system.
 *
 * @param drillMap - The drill map with panel world positions
 * @param margin - Extra margin around panels (mm)
 * @returns Bounding box that encompasses all panels
 */
export function computeBoundsFromDrillMap(
  drillMap: DrillMap,
  margin: number = 50
): Bounds3World {
  if (!drillMap || drillMap.panels.length === 0) {
    console.warn('[cabinetBounds] No panels in drill map, using fallback');
    return FALLBACK_BOUNDS;
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  // Iterate through all panels and their points to find actual bounds
  for (const panel of drillMap.panels) {
    // Use panel world position
    const [px, py, pz] = panel.worldPosition;
    const halfW = panel.dimensions.width / 2;
    const halfH = panel.dimensions.height / 2;
    const halfT = panel.dimensions.thickness / 2;

    // Expand bounds based on panel position and size
    // (simplified: assume panels can be in any orientation)
    const panelExtent = Math.max(halfW, halfH, halfT);

    minX = Math.min(minX, px - panelExtent);
    maxX = Math.max(maxX, px + panelExtent);
    minY = Math.min(minY, py - panelExtent);
    maxY = Math.max(maxY, py + panelExtent);
    minZ = Math.min(minZ, pz - panelExtent);
    maxZ = Math.max(maxZ, pz + panelExtent);

    // Also check all drill points (they should be within panel bounds)
    for (const point of panel.points) {
      const [x, y, z] = point.position;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  // Add margin
  const bounds: Bounds3World = {
    min: [minX - margin, minY - margin, minZ - margin],
    max: [maxX + margin, maxY + margin, maxZ + margin],
  };

  return bounds;
}

// ============================================
// POSITION CLAMPING
// ============================================

/**
 * Compute the allowed range for position override on each axis.
 *
 * The range ensures that: baseWorld + override stays within boundsWorld.
 *
 * @param baseWorld - Hardware base position in world space (no override applied)
 * @param boundsWorld - Cabinet world-space AABB
 * @param marginMm - Safety margin from edges (default 0)
 * @returns Per-axis clamp ranges
 */
export function computeClampRanges(
  baseWorld: Vec3Tuple,
  boundsWorld: Bounds3World,
  marginMm: number = DEFAULT_BOUNDS_MARGIN_MM
): ClampRanges {
  const [bx, by, bz] = baseWorld;
  const [minX, minY, minZ] = boundsWorld.min;
  const [maxX, maxY, maxZ] = boundsWorld.max;

  return {
    x: [(minX + marginMm) - bx, (maxX - marginMm) - bx],
    y: [(minY + marginMm) - by, (maxY - marginMm) - by],
    z: [(minZ + marginMm) - bz, (maxZ - marginMm) - bz],
  };
}

/**
 * Clamp a single value to a range.
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clamp position override to stay within cabinet bounds.
 *
 * @param baseWorld - Hardware base position in world space
 * @param desiredOverride - Desired position offset [dx, dy, dz] in mm
 * @param boundsWorld - Cabinet world-space AABB
 * @param marginMm - Safety margin from edges
 * @returns Clamped override and metadata
 */
export function clampOverrideToCabinetBounds(
  baseWorld: Vec3Tuple,
  desiredOverride: Vec3Tuple,
  boundsWorld: Bounds3World,
  marginMm: number = DEFAULT_BOUNDS_MARGIN_MM
): ClampResult {
  const ranges = computeClampRanges(baseWorld, boundsWorld, marginMm);

  const [dx, dy, dz] = desiredOverride;

  const clampedX = clampValue(dx, ranges.x[0], ranges.x[1]);
  const clampedY = clampValue(dy, ranges.y[0], ranges.y[1]);
  const clampedZ = clampValue(dz, ranges.z[0], ranges.z[1]);

  const clampedAxes = {
    x: clampedX !== dx,
    y: clampedY !== dy,
    z: clampedZ !== dz,
  };

  return {
    clamped: [clampedX, clampedY, clampedZ],
    didClamp: clampedAxes.x || clampedAxes.y || clampedAxes.z,
    clampedAxes,
    ranges,
  };
}

/**
 * Convert PositionOverride object to Vec3Tuple for clamping.
 */
export function positionOverrideToVec3(override: { dx: number; dy: number; dz: number }): Vec3Tuple {
  return [override.dx, override.dy, override.dz];
}

/**
 * Convert Vec3Tuple back to PositionOverride object.
 */
export function vec3ToPositionOverride(vec: Vec3Tuple): { dx: number; dy: number; dz: number } {
  return { dx: vec[0], dy: vec[1], dz: vec[2] };
}

// ============================================
// FORMATTING UTILITIES
// ============================================

/**
 * Format clamp range for display in UI.
 * Example: "[-15.5, +23.2]"
 */
export function formatRange(range: [number, number], decimals: number = 1): string {
  const [min, max] = range;
  const minStr = min >= 0 ? `+${min.toFixed(decimals)}` : min.toFixed(decimals);
  const maxStr = max >= 0 ? `+${max.toFixed(decimals)}` : max.toFixed(decimals);
  return `[${minStr}, ${maxStr}]`;
}

/**
 * Format bounds for debug display.
 */
export function formatBounds(bounds: Bounds3World): string {
  const { min, max } = bounds;
  return `X:[${min[0].toFixed(1)}, ${max[0].toFixed(1)}] Y:[${min[1].toFixed(1)}, ${max[1].toFixed(1)}] Z:[${min[2].toFixed(1)}, ${max[2].toFixed(1)}]`;
}
