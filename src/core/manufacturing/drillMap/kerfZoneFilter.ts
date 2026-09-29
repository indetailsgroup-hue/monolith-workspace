/**
 * Kerf Zone Filter  —  Phase 4  Curved Panel System
 *
 * Post-processes a DrillMap to mark drill points that fall inside any active
 * KerfZone (+ safety margin) as ERROR with issue `G12_FITTING_IN_KERF_ZONE`.
 *
 * This prevents hardware fittings (minifix, dowels, shelf pins, hinges, etc.)
 * from being placed inside the bend zone where material is weakened by kerf cuts.
 *
 * ## Coordinate model
 *
 * Panel-local 2D space is defined as (u, v) where:
 *   - `u` runs along the panel's finish **width** dimension
 *   - `v` runs along the panel's finish **height** dimension
 *
 * Both are measured from the lower-left corner of the panel face.
 *
 * KerfZone.edge / axis mapping:
 *   - 'TOP':    v ∈ [height − depth, height],  u ∈ [start, end]
 *   - 'BOTTOM': v ∈ [0, depth],                u ∈ [start, end]
 *   - 'LEFT':   u ∈ [0, depth],                v ∈ [start, end]
 *   - 'RIGHT':  u ∈ [width − depth, width],    v ∈ [start, end]
 *
 * With margin, the depth band is expanded inward by `marginMm` and the span
 * band is expanded outward by `marginMm` on both sides.
 *
 * @module core/manufacturing/drillMap/kerfZoneFilter
 */

import type { DrillMap, DrillMapPanel, DrillMapPoint, Vec3Tuple } from './types';
import type { KerfZone } from '../curve/curveProfile';
import type { PanelEdge } from '../../types/Cabinet';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/** Map from panelId → KerfZones that apply to it */
export type KerfZonesByPanelId = Map<string, KerfZone[]>;

export interface KerfZoneFilterOptions {
  /** Safety margin in mm added around each KerfZone AABB (default: 5 mm) */
  marginMm: number;
}

export const DEFAULT_KERF_ZONE_FILTER_OPTIONS: KerfZoneFilterOptions = {
  marginMm: 5,
};

/** Per-panel summary of how many points were excluded */
export interface KerfFilterPanelSummary {
  panelId: string;
  excludedCount: number;
  skippedCount: number;   // points whose panel frame could not be resolved
}

export interface KerfFilterResult {
  /** Updated DrillMap (deep-cloned panels/points, original unchanged) */
  drillMap: DrillMap;
  /** Per-panel exclusion summary */
  panelSummaries: KerfFilterPanelSummary[];
  /** Total number of points marked as excluded across all panels */
  totalExcluded: number;
}

// ---------------------------------------------------------------------------
// Internal axis helpers (mirrors fromDrillMap.ts / gateG11_types pattern)
// ---------------------------------------------------------------------------

type WorldAxis = 0 | 1 | 2;

/**
 * Which world axes carry the panel's finish width (u) and height (v),
 * given the axis its thickness runs along.
 */
function facePlaneAxes(thicknessAxis: WorldAxis): { uAxis: WorldAxis; vAxis: WorldAxis } {
  switch (thicknessAxis) {
    case 0: return { uAxis: 2, vAxis: 1 }; // SIDE:       W along Z, H along Y
    case 1: return { uAxis: 0, vAxis: 2 }; // HORIZONTAL: W along X, H along Z
    default: return { uAxis: 0, vAxis: 1 }; // BACK:       W along X, H along Y
  }
}

/**
 * Infer which world axis carries the panel's thickness from its role string.
 * Returns `undefined` for unknown roles (callers must handle gracefully).
 */
function thicknessAxisFromRole(role: string): WorldAxis | undefined {
  switch (role) {
    case 'TOP':
    case 'BOTTOM':
    case 'SHELF':
    case 'WORKTOP':
      return 1;
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
    case 'SIDE':
    case 'DIVIDER':
      return 0;
    case 'BACK':
    case 'KICKBOARD':
    case 'DRAWER_FRONT':
      return 2;
    default:
      return undefined;
  }
}

/**
 * Panel-local coordinate of a world position along one axis.
 * Origin is the lower-left corner of the panel face.
 *
 * @param worldValue  World coordinate of the point along the axis
 * @param panelCenter World coordinate of the panel centre along the axis
 * @param span        Panel dimension along the axis (mm)
 */
function localCoord(worldValue: number, panelCenter: number, span: number): number {
  return worldValue - (panelCenter - span / 2);
}

// ---------------------------------------------------------------------------
// KerfZone AABB helper
// ---------------------------------------------------------------------------

interface ZoneAABB {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

/**
 * Compute the axis-aligned bounding box of a KerfZone in panel-local (u, v)
 * space, expanded by `marginMm` on all sides.
 *
 * Panel finish dimensions are needed to compute the RIGHT / TOP edge offsets.
 */
function zoneAABB(
  zone: KerfZone,
  panelWidth: number,
  panelHeight: number,
  marginMm: number,
): ZoneAABB {
  const { edge, start, end, depth } = zone;
  const m = marginMm;

  switch (edge as PanelEdge) {
    case 'TOP':
      return {
        uMin: start - m,
        uMax: end + m,
        vMin: panelHeight - depth - m,
        vMax: panelHeight,        // flush to edge — no expansion beyond panel boundary
      };
    case 'BOTTOM':
      return {
        uMin: start - m,
        uMax: end + m,
        vMin: 0,                  // flush to edge
        vMax: depth + m,
      };
    case 'LEFT':
      return {
        uMin: 0,                  // flush to edge
        uMax: depth + m,
        vMin: start - m,
        vMax: end + m,
      };
    case 'RIGHT':
      return {
        uMin: panelWidth - depth - m,
        uMax: panelWidth,         // flush to edge
        vMin: start - m,
        vMax: end + m,
      };
  }
}

/** Returns true if local (u, v) is strictly inside the AABB */
function insideAABB(u: number, v: number, aabb: ZoneAABB): boolean {
  return u >= aabb.uMin && u <= aabb.uMax &&
         v >= aabb.vMin && v <= aabb.vMax;
}

// ---------------------------------------------------------------------------
// Per-point filtering
// ---------------------------------------------------------------------------

function filterPoint(
  point: DrillMapPoint,
  zones: KerfZone[],
  panel: DrillMapPanel,
  uAxis: WorldAxis,
  vAxis: WorldAxis,
  marginMm: number,
): DrillMapPoint {
  const { width, height } = panel.dimensions;
  const center = panel.worldPosition;

  const u = localCoord(point.position[uAxis], center[uAxis], width);
  const v = localCoord(point.position[vAxis], center[vAxis], height);

  const hit = zones.some(zone => {
    const aabb = zoneAABB(zone, width, height, marginMm);
    return insideAABB(u, v, aabb);
  });

  if (!hit) return point;

  // Clone and mark excluded
  const existingIssues = point.issues ?? [];
  return {
    ...point,
    status: 'ERROR',
    statusMessage: 'Drill point falls inside a kerf bending zone',
    issues: existingIssues.includes('G12_FITTING_IN_KERF_ZONE')
      ? existingIssues
      : [...existingIssues, 'G12_FITTING_IN_KERF_ZONE'],
  };
}

// ---------------------------------------------------------------------------
// Per-panel filtering
// ---------------------------------------------------------------------------

function filterPanel(
  panel: DrillMapPanel,
  zones: KerfZone[],
  marginMm: number,
): { panel: DrillMapPanel; excludedCount: number; skippedCount: number } {
  const tAxis = thicknessAxisFromRole(panel.role);

  // Unknown role — cannot determine orientation; skip all points on this panel
  if (tAxis === undefined) {
    return { panel, excludedCount: 0, skippedCount: panel.points.length };
  }

  const { uAxis, vAxis } = facePlaneAxes(tAxis);

  let excludedCount = 0;
  const filteredPoints = panel.points.map(pt => {
    const out = filterPoint(pt, zones, panel, uAxis, vAxis, marginMm);
    if (out !== pt) excludedCount++;
    return out;
  });

  return {
    panel: { ...panel, points: filteredPoints },
    excludedCount,
    skippedCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Filter a DrillMap by excluding drill points that fall inside any KerfZone
 * (plus safety margin) for their respective panel.
 *
 * @param drillMap        Source DrillMap (not mutated)
 * @param zonesByPanelId  Map of panelId → KerfZone[] (panels without kerf zones are untouched)
 * @param options         Filter options (default: marginMm=5)
 * @returns               KerfFilterResult with updated DrillMap and summary
 */
export function filterDrillMapForKerfZones(
  drillMap: DrillMap,
  zonesByPanelId: KerfZonesByPanelId,
  options?: Partial<KerfZoneFilterOptions>,
): KerfFilterResult {
  const { marginMm } = { ...DEFAULT_KERF_ZONE_FILTER_OPTIONS, ...options };

  const panelSummaries: KerfFilterPanelSummary[] = [];
  let totalExcluded = 0;

  const filteredPanels = drillMap.panels.map(panel => {
    const zones = zonesByPanelId.get(panel.panelId);

    // No kerf zones registered for this panel — pass through unchanged
    if (!zones || zones.length === 0) {
      panelSummaries.push({ panelId: panel.panelId, excludedCount: 0, skippedCount: 0 });
      return panel;
    }

    const { panel: filtered, excludedCount, skippedCount } = filterPanel(panel, zones, marginMm);
    panelSummaries.push({ panelId: panel.panelId, excludedCount, skippedCount });
    totalExcluded += excludedCount;
    return filtered;
  });

  return {
    drillMap: { ...drillMap, panels: filteredPanels },
    panelSummaries,
    totalExcluded,
  };
}
