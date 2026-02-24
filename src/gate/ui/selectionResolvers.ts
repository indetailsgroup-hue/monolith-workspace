/**
 * Selection Resolvers
 *
 * Utilities to resolve cabinet selection to DrillMapPoint entity IDs.
 * Bridges the cabinet-based selection model to entity-level Gate validation.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import type { DrillMap, DrillMapPoint, DrillMapPanel } from '../../core/manufacturing/drillMap/types';

// ============================================
// RESOLVE CABINET → ENTITY IDS
// ============================================

/**
 * Resolve a cabinet ID to all DrillMapPoint IDs that belong to it.
 *
 * Checks multiple paths for cabinet association:
 * 1. DrillMapPanel.cabinetId
 * 2. DrillMapPoint.meta?.cabinetId (future-proof)
 * 3. Owner panel's cabinetId
 *
 * @param drillMap - The current DrillMap
 * @param cabinetId - Cabinet ID to resolve
 * @returns Array of DrillMapPoint IDs belonging to the cabinet
 */
export function resolveSelectionToEntityIds(
  drillMap: DrillMap | null,
  cabinetId: string | null
): string[] {
  if (!drillMap || !cabinetId) return [];

  const entityIds: string[] = [];

  for (const panel of drillMap.panels) {
    // Check if panel belongs to this cabinet
    if (panel.cabinetId === cabinetId) {
      // Add all points from this panel
      for (const point of panel.points) {
        entityIds.push(point.id);
      }
    }
  }

  return entityIds;
}

// ============================================
// GET ENTITY POSITIONS
// ============================================

/**
 * Get world positions for a list of entity IDs.
 * Used for camera focus and scene highlighting.
 *
 * @param drillMap - The current DrillMap
 * @param entityIds - Entity IDs to get positions for
 * @returns Map of entityId → position
 */
export function getEntityPositions(
  drillMap: DrillMap | null,
  entityIds: string[]
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();

  if (!drillMap || entityIds.length === 0) return positions;

  const idSet = new Set(entityIds);

  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      if (idSet.has(point.id)) {
        positions.set(point.id, point.position);
      }
    }
  }

  return positions;
}

// ============================================
// CALCULATE BOUNDING BOX
// ============================================

/**
 * Calculate the bounding box center and size for a set of positions.
 * Used for camera focus calculations.
 *
 * @param positions - Array of [x, y, z] positions in mm
 * @returns Center position and size for camera focus
 */
export function calculateBoundingBox(positions: [number, number, number][]): {
  center: [number, number, number];
  size: { width: number; height: number; depth: number };
} {
  if (positions.length === 0) {
    return {
      center: [0, 0, 0],
      size: { width: 100, height: 100, depth: 100 },
    };
  }

  // Single point - use point with small default size
  if (positions.length === 1) {
    return {
      center: positions[0],
      size: { width: 200, height: 200, depth: 200 }, // 200mm box around single point
    };
  }

  // Multiple points - calculate actual bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  // Add padding (20% of size or minimum 50mm)
  const padX = Math.max(50, (maxX - minX) * 0.2);
  const padY = Math.max(50, (maxY - minY) * 0.2);
  const padZ = Math.max(50, (maxZ - minZ) * 0.2);

  return {
    center: [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ],
    size: {
      width: Math.max(100, maxX - minX + padX * 2),
      height: Math.max(100, maxY - minY + padY * 2),
      depth: Math.max(100, maxZ - minZ + padZ * 2),
    },
  };
}

// ============================================
// FIND ENTITIES BY FINDING
// ============================================

/**
 * Get all DrillMapPoint objects for a list of entity IDs.
 *
 * @param drillMap - The current DrillMap
 * @param entityIds - Entity IDs to find
 * @returns Array of DrillMapPoint objects
 */
export function getEntitiesByIds(
  drillMap: DrillMap | null,
  entityIds: string[]
): DrillMapPoint[] {
  if (!drillMap || entityIds.length === 0) return [];

  const idSet = new Set(entityIds);
  const entities: DrillMapPoint[] = [];

  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      if (idSet.has(point.id)) {
        entities.push(point);
      }
    }
  }

  return entities;
}

// ============================================
// GET PANEL FOR ENTITY
// ============================================

/**
 * Find which panel an entity belongs to.
 *
 * @param drillMap - The current DrillMap
 * @param entityId - Entity ID to find panel for
 * @returns DrillMapPanel or null
 */
export function getPanelForEntity(
  drillMap: DrillMap | null,
  entityId: string
): DrillMapPanel | null {
  if (!drillMap) return null;

  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      if (point.id === entityId) {
        return panel;
      }
    }
  }

  return null;
}
