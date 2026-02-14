/**
 * Drill Map Index
 *
 * Index structure for efficient drill map point lookups during validation.
 * Provides flat access and panel-based grouping for gate validation.
 */

import type { DrillMapPoint, DrillMap } from '../../../core/manufacturing/drillMap/types';

/** Indexed view of a drill map for fast lookups */
export interface DrillMapIndex {
  pointsById: Map<string, DrillMapPoint>;
  pointsByPanelId: Map<string, DrillMapPoint[]>;
  pointsByPairId: Map<string, DrillMapPoint[]>;
  panelIdToIndex: Map<string, number>;
  pointToPath: Map<string, string>;
}

/** Validation context with flattened points and index */
export interface ValidationContext {
  pointsFlat: DrillMapPoint[];
  index: DrillMapIndex;
  drillMap: DrillMap;
}

/** Build an index from a drill map for fast lookups */
export function buildDrillMapIndex(drillMap: DrillMap): DrillMapIndex {
  const pointsById = new Map<string, DrillMapPoint>();
  const pointsByPanelId = new Map<string, DrillMapPoint[]>();
  const pointsByPairId = new Map<string, DrillMapPoint[]>();
  const panelIdToIndex = new Map<string, number>();
  const pointToPath = new Map<string, string>();

  for (let pi = 0; pi < drillMap.panels.length; pi++) {
    const panel = drillMap.panels[pi];
    panelIdToIndex.set(panel.panelId, pi);

    const panelPoints: DrillMapPoint[] = [];
    for (let pti = 0; pti < panel.points.length; pti++) {
      const point = panel.points[pti];
      pointsById.set(point.id, point);
      panelPoints.push(point);
      pointToPath.set(point.id, `/useDrillMapStore/drillMap/panels/${pi}/points/${pti}`);

      if (point.pairId) {
        const existing = pointsByPairId.get(point.pairId) || [];
        existing.push(point);
        pointsByPairId.set(point.pairId, existing);
      }
    }
    pointsByPanelId.set(panel.panelId, panelPoints);
  }

  return { pointsById, pointsByPanelId, pointsByPairId, panelIdToIndex, pointToPath };
}

/** Build a validation context from a drill map, returns null if empty */
export function buildValidationContext(drillMap: DrillMap): ValidationContext | null {
  if (!drillMap.panels || drillMap.panels.length === 0) return null;
  const pointsFlat = flattenDrillMapPoints(drillMap);
  if (pointsFlat.length === 0) return null;
  const index = buildDrillMapIndex(drillMap);
  return { pointsFlat, index, drillMap };
}

/** Flatten all drill map points into a single array */
export function flattenDrillMapPoints(drillMap: DrillMap): DrillMapPoint[] {
  const points: DrillMapPoint[] = [];
  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      points.push(point);
    }
  }
  return points;
}

/** Get JSON Patch path for a bolt point's Y position */
export function patchPathForBoltY(index: DrillMapIndex, boltId: string): string | null {
  const path = index.pointToPath.get(boltId);
  if (!path) return null;
  return `${path}/position/1`;
}

/** Get JSON Patch path for a bolt point's full position */
export function patchPathForBoltPosition(index: DrillMapIndex, boltId: string): string | null {
  const path = index.pointToPath.get(boltId);
  if (!path) return null;
  return `${path}/position`;
}
