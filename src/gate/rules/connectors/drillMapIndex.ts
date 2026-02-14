/**
 * DrillMap Index Resolver
 *
 * Provides deterministic index lookup for DrillMapPoint entities.
 * Used to generate correct patch paths for Gate validation fixes.
 *
 * Pattern: Build index once, lookup O(1) per point.
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 * - Y is vertical (height)
 * - Cabinets sit on XZ plane (floor)
 *
 * v1.0: Initial implementation
 * v1.1: Added AXIS constant, duplicate ID detection, patchPathForBoltAxis()
 */

import type { DrillMap, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

// ============================================
// AXIS CONSTANTS (Y-up Coordinate System)
// ============================================

/**
 * Axis indices for Vec3Tuple [x, y, z] in Y-up coordinate system.
 * R3F/Three.js standard: Y is vertical (height), cabinets sit on XZ plane.
 */
export const AXIS = {
  X: 0,
  Y: 1,  // Height (vertical) in Y-up system
  Z: 2,
} as const;

export type AxisIndex = typeof AXIS[keyof typeof AXIS];

// ============================================
// INDEX TYPES
// ============================================

export interface DrillMapPointLocation {
  panelIdx: number;
  pointIdx: number;
  panelId: string;
}

export type DrillMapIndex = Map<string, DrillMapPointLocation>;

/**
 * Result from building the index, includes duplicate detection.
 */
export interface DrillMapIndexResult {
  index: DrillMapIndex;
  duplicates: Array<{
    pointId: string;
    locations: DrillMapPointLocation[];
  }>;
}

// ============================================
// INDEX BUILDER
// ============================================

/**
 * Build a lookup index from DrillMap structure.
 * Maps point.id → { panelIdx, pointIdx, panelId }
 *
 * @param drillMap - The nested DrillMap from useDrillMapStore
 * @returns Index map for O(1) lookups
 */
export function buildDrillMapIndex(drillMap: DrillMap | null): DrillMapIndex {
  const result = buildDrillMapIndexWithDuplicateCheck(drillMap);
  return result.index;
}

/**
 * Build index with duplicate ID detection for production safety.
 * Duplicate IDs indicate a bug in drill map generation and should be caught early.
 *
 * @param drillMap - The nested DrillMap from useDrillMapStore
 * @returns Index and list of any duplicate point IDs found
 */
export function buildDrillMapIndexWithDuplicateCheck(drillMap: DrillMap | null): DrillMapIndexResult {
  const index: DrillMapIndex = new Map();
  const duplicateMap = new Map<string, DrillMapPointLocation[]>();

  if (!drillMap?.panels) {
    return { index, duplicates: [] };
  }

  drillMap.panels.forEach((panel, panelIdx) => {
    panel.points.forEach((point, pointIdx) => {
      if (point?.id) {
        const location: DrillMapPointLocation = {
          panelIdx,
          pointIdx,
          panelId: panel.panelId,
        };

        // Check for duplicate
        if (index.has(point.id)) {
          const existingLocation = index.get(point.id)!;

          // Track duplicate
          if (!duplicateMap.has(point.id)) {
            duplicateMap.set(point.id, [existingLocation]);
          }
          duplicateMap.get(point.id)!.push(location);

          // Warn in development
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[DrillMapIndex] Duplicate point ID detected: "${point.id}" ` +
              `at panel[${panelIdx}].points[${pointIdx}] (panelId: ${panel.panelId}). ` +
              `First occurrence was at panel[${existingLocation.panelIdx}].points[${existingLocation.pointIdx}].`
            );
          }
        }

        // Always store the FIRST occurrence (deterministic behavior)
        if (!index.has(point.id)) {
          index.set(point.id, location);
        }
      }
    });
  });

  // Convert duplicate map to array
  const duplicates: DrillMapIndexResult['duplicates'] = [];
  duplicateMap.forEach((locations, pointId) => {
    duplicates.push({ pointId, locations });
  });

  return { index, duplicates };
}

// ============================================
// PATH GENERATORS
// ============================================

/**
 * Generate JSON Patch path for a DrillMapPoint property.
 *
 * @param index - The DrillMapIndex
 * @param pointId - The point ID to look up
 * @param propPath - Property path within the point (e.g., "position/1" for Y)
 * @returns Full patch path or null if point not found
 *
 * @example
 * patchPathForPoint(index, "bolt-001", "position/1")
 * // => "/useDrillMapStore/drillMap/panels/0/points/3/position/1"
 */
export function patchPathForPoint(
  index: DrillMapIndex,
  pointId: string,
  propPath: string
): string | null {
  const location = index.get(pointId);
  if (!location) return null;

  const { panelIdx, pointIdx } = location;
  return `/useDrillMapStore/drillMap/panels/${panelIdx}/points/${pointIdx}/${propPath}`;
}

/**
 * Generate patch path for bolt position Y (height in Y-up system).
 * Y is the vertical axis in R3F/Three.js coordinate system.
 */
export function patchPathForBoltY(index: DrillMapIndex, boltId: string): string | null {
  // position is Vec3Tuple [x, y, z], Y is index 1 (height in Y-up system)
  return patchPathForPoint(index, boltId, `position/${AXIS.Y}`);
}

/**
 * Generate patch path for any axis of bolt position.
 * @param axis - Use AXIS.X, AXIS.Y, or AXIS.Z
 */
export function patchPathForBoltAxis(
  index: DrillMapIndex,
  boltId: string,
  axis: AxisIndex
): string | null {
  return patchPathForPoint(index, boltId, `position/${axis}`);
}

/**
 * Generate patch path for bolt position (all axes).
 */
export function patchPathForBoltPosition(index: DrillMapIndex, boltId: string): string | null {
  return patchPathForPoint(index, boltId, 'position');
}

// ============================================
// VALIDATION CONTEXT
// ============================================

/**
 * Context object passed to validation functions.
 * Contains the index for generating deterministic patch paths.
 */
export interface ValidationContext {
  /** The original nested DrillMap */
  drillMap: DrillMap;
  /** Pre-flattened points for iteration */
  pointsFlat: DrillMapPoint[];
  /** Index for O(1) lookups */
  index: DrillMapIndex;
}

/**
 * Build a validation context from a DrillMap.
 */
export function buildValidationContext(drillMap: DrillMap | null): ValidationContext | null {
  if (!drillMap) return null;

  const pointsFlat: DrillMapPoint[] = [];
  for (const panel of drillMap.panels) {
    pointsFlat.push(...panel.points);
  }

  return {
    drillMap,
    pointsFlat,
    index: buildDrillMapIndex(drillMap),
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Flatten DrillMap panels into a single array of points.
 */
export function flattenDrillMapPoints(drillMap: DrillMap | null): DrillMapPoint[] {
  if (!drillMap?.panels) return [];

  const points: DrillMapPoint[] = [];
  for (const panel of drillMap.panels) {
    points.push(...panel.points);
  }
  return points;
}

/**
 * Get point location info for debugging/logging.
 */
export function getPointLocationInfo(
  index: DrillMapIndex,
  pointId: string
): string {
  const location = index.get(pointId);
  if (!location) return `point "${pointId}" not found in index`;

  return `panel[${location.panelIdx}].points[${location.pointIdx}] (panelId: ${location.panelId})`;
}
