/**
 * buildJointMap — Group DrillMapPoints into joints using pairId
 *
 * Turns a flat DrillMap into a Map<jointKey, DrillMapPoint[]>
 * where jointKey is derived from the pairId corner prefix.
 *
 * Example: pairId "pair-TOP_LEFT-0" → jointKey "TOP_LEFT"
 *          pairId "pair-TOP_LEFT-0-dowel-side" → jointKey "TOP_LEFT"
 *
 * This is a pure function with zero side effects.
 * v0.1 — initial implementation
 */

import type {
  DrillMap,
  DrillMapPoint,
  Vec3Tuple,
} from '../manufacturing/drillMap/types';

// ============================================
// TYPES
// ============================================

export interface JointHotspot {
  /** Corner key, e.g. "TOP_LEFT", "BOTTOM_RIGHT" */
  jointKey: string;
  /** World position for the hotspot sphere (centroid or CAM position) */
  worldPos: Vec3Tuple;
  /** Human-readable label, e.g. "Top-Left × 3 holes" */
  label: string;
  /** Number of drill points in this joint group */
  pointCount: number;
}

export interface JointMapResult {
  /** Map from jointKey → array of DrillMapPoints belonging to that joint */
  jointMap: Map<string, DrillMapPoint[]>;
  /** Hotspot metadata for each joint (for rendering spheres) */
  hotspots: JointHotspot[];
}

// ============================================
// CONSTANTS
// ============================================

/** Regex to extract corner key from pairId.
 *  "pair-TOP_LEFT-0"           → "TOP_LEFT"
 *  "pair-BOTTOM_RIGHT-2"       → "BOTTOM_RIGHT"
 *  "pair-TOP_LEFT-0-dowel-side"→ "TOP_LEFT"
 */
const PAIR_CORNER_RE = /^pair-([A-Z_]+)-/;

/** DrillPurpose values that belong to connector joints */
const CONNECTOR_PURPOSES = new Set([
  'CAM_LOCK',
  'BOLT',
  'MINIFIX',
  'DOWEL',
]);

/** Human-readable labels for corner keys */
const CORNER_LABELS: Record<string, string> = {
  TOP_LEFT: 'Top-Left',
  TOP_RIGHT: 'Top-Right',
  BOTTOM_LEFT: 'Bottom-Left',
  BOTTOM_RIGHT: 'Bottom-Right',
};

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Build a joint map from DrillMap data.
 *
 * Groups DrillMapPoints by their pairId corner prefix to create
 * "joint surrogates" — logical groups of holes that belong to
 * the same panel-to-panel connection.
 *
 * @param drillMap - The current DrillMap (from useDrillMapStore)
 * @returns JointMapResult with jointMap and hotspots
 */
export function buildJointMap(drillMap: DrillMap): JointMapResult {
  const jointMap = new Map<string, DrillMapPoint[]>();

  // 1. Flatten all panels' points
  const allPoints: DrillMapPoint[] = [];
  for (const panel of drillMap.panels) {
    for (const point of panel.points) {
      allPoints.push(point);
    }
  }

  // 2. Filter to connector points with pairId and group by corner key
  for (const point of allPoints) {
    // Must have a pairId (CAM uses pairedHoleId, BOLT uses pairId)
    const rawPairId = point.pairId ?? point.pairedHoleId;
    if (!rawPairId) continue;

    // Must be a connector purpose
    if (!CONNECTOR_PURPOSES.has(point.purpose)) continue;

    // 3. Extract corner key
    const cornerKey = extractCornerKey(rawPairId);
    if (!cornerKey) continue;

    // 4. Group
    const existing = jointMap.get(cornerKey);
    if (existing) {
      existing.push(point);
    } else {
      jointMap.set(cornerKey, [point]);
    }
  }

  // 5. Build hotspots
  const hotspots: JointHotspot[] = [];
  for (const [jointKey, points] of jointMap) {
    const worldPos = computeHotspotPosition(points);
    const label = formatJointLabel(jointKey, points.length);
    hotspots.push({
      jointKey,
      worldPos,
      label,
      pointCount: points.length,
    });
  }

  // Sort hotspots for consistent ordering
  hotspots.sort((a, b) => a.jointKey.localeCompare(b.jointKey));

  return { jointMap, hotspots };
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract the corner key from a pairId string.
 *
 * @example
 * extractCornerKey("pair-TOP_LEFT-0") → "TOP_LEFT"
 * extractCornerKey("pair-BOTTOM_RIGHT-2-dowel-side") → "BOTTOM_RIGHT"
 * extractCornerKey("invalid") → null
 */
export function extractCornerKey(pairId: string): string | null {
  const match = pairId.match(PAIR_CORNER_RE);
  return match ? match[1] : null;
}

/**
 * Compute the hotspot world position for a joint group.
 *
 * Prefers the first CAM_LOCK/MINIFIX point (visible on panel face).
 * Falls back to centroid of all points.
 */
function computeHotspotPosition(points: DrillMapPoint[]): Vec3Tuple {
  // Prefer CAM point (it's on the panel face → most visible)
  const camPoint = points.find(
    (p) => p.purpose === 'CAM_LOCK' || p.purpose === 'MINIFIX'
  );
  if (camPoint) {
    return [...camPoint.position] as Vec3Tuple;
  }

  // Fallback: centroid of all point positions
  let sx = 0, sy = 0, sz = 0;
  for (const p of points) {
    sx += p.position[0];
    sy += p.position[1];
    sz += p.position[2];
  }
  const n = points.length;
  return [sx / n, sy / n, sz / n];
}

/**
 * Format a human-readable label for a joint hotspot.
 */
function formatJointLabel(jointKey: string, pointCount: number): string {
  const readable = CORNER_LABELS[jointKey] ?? jointKey.replace(/_/g, '-');
  return `${readable} × ${pointCount} holes`;
}
