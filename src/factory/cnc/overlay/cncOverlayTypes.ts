/**
 * cncOverlayTypes.ts - CNC Overlay Type Definitions
 *
 * Types for visual CNC overlay derived from OperationGraph.
 * This represents the "Factory Truth View" - points are derived from
 * the same OperationGraph + transforms + policy that generates G-code.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CRITICAL: This is CNC MANUFACTURING DOMAIN visualization
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Overlay points are derived EXCLUSIVELY from:
 * 1. OperationGraph (same as G-code)
 * 2. WorkpieceTransformContext (D4.1)
 * 3. DrillPolicy decision (D5)
 *
 * NOT from:
 * - DrillMapOverlay (assembly preview domain)
 * - MinifixConfigPanel preview (assembly preview domain)
 *
 * @version 1.0.0 - Phase D4.x
 */

import type { Position3D, OperationType } from '../../../cnc/operation/operationTypes';
import type { PanelFace } from '../../../cnc/transform/workpieceTypes';
import type { CycleType, HoleKind } from '../../../cnc/policy/drillPolicyTypes';

// ============================================================================
// OVERLAY POINT
// ============================================================================

/**
 * Single CNC overlay point for 3D visualization.
 *
 * Contains all information needed to render a drilling/boring point
 * in the 3D viewer with full traceability to source.
 */
export interface CncOverlayPoint {
  /** Unique point ID (matches operation ID) */
  readonly id: string;

  /** Operation type (DRILL, BORE, etc.) */
  readonly type: OperationType;

  /** Position in machine coordinates (mm) */
  readonly position: Position3D;

  /** Hole diameter in mm */
  readonly diameter: number;

  /** Hole depth in mm */
  readonly depth: number;

  /** Which panel face this operation targets */
  readonly face: PanelFace;

  /** Source panel ID */
  readonly panelId: string;

  /** G-code cycle that will be used (from policy) */
  readonly cycle: CycleType;

  /** Classified hole kind */
  readonly holeKind: HoleKind;

  /** Feed rate in mm/min */
  readonly feedRate: number;

  /** Spindle RPM */
  readonly rpm: number;

  /** Is this a through-hole? */
  readonly throughHole: boolean;

  /** Human-readable label for tooltips */
  readonly label: string;

  /** Source operation comment (if any) */
  readonly comment?: string;

  /** Peck depth for G83 cycle */
  readonly peckDepth?: number;

  /** Dwell time for G82 cycle (seconds) */
  readonly dwellTime?: number;
}

// ============================================================================
// OVERLAY FILTER
// ============================================================================

/**
 * Filter options for overlay visibility.
 */
export interface CncOverlayFilter {
  /** Show DRILL operations */
  showDrill: boolean;
  /** Show BORE operations */
  showBore: boolean;
  /** Show only through-holes */
  throughHolesOnly: boolean;
  /** Filter by panel face (null = show all) */
  faceFilter: PanelFace | null;
  /** Filter by hole kind (empty = show all) */
  holeKindFilter: HoleKind[];
  /** Filter by cycle type (empty = show all) */
  cycleFilter: CycleType[];
}

/**
 * Default filter (show all drilling operations).
 */
export const DEFAULT_OVERLAY_FILTER: CncOverlayFilter = {
  showDrill: true,
  showBore: true,
  throughHolesOnly: false,
  faceFilter: null,
  holeKindFilter: [],
  cycleFilter: [],
};

// ============================================================================
// OVERLAY STATS
// ============================================================================

/**
 * Statistics for overlay display.
 */
export interface CncOverlayStats {
  /** Total number of points */
  totalPoints: number;
  /** Points by operation type */
  byType: Record<'DRILL' | 'BORE', number>;
  /** Points by face */
  byFace: Record<PanelFace, number>;
  /** Points by hole kind */
  byHoleKind: Partial<Record<HoleKind, number>>;
  /** Points by cycle */
  byCycle: Partial<Record<CycleType, number>>;
  /** Number of through-holes */
  throughHoleCount: number;
  /** Total drilling depth (mm) */
  totalDepth: number;
  /** Estimated machine time contribution (seconds) */
  estimatedTimeSeconds: number;
}

// ============================================================================
// BUILD RESULT
// ============================================================================

/**
 * Result of building CNC overlay from OperationGraph.
 */
export interface CncOverlayBuildResult {
  /** All overlay points */
  readonly points: readonly CncOverlayPoint[];
  /** Statistics */
  readonly stats: CncOverlayStats;
  /** Source job ID */
  readonly jobId: string;
  /** Source machine ID */
  readonly machineId: string;
  /** Build timestamp */
  readonly builtAt: string;
  /** Content hash for cache invalidation */
  readonly contentHash: string;
}

// ============================================================================
// MARKER STYLE
// ============================================================================

/**
 * Visual style for overlay markers.
 */
export interface CncOverlayMarkerStyle {
  /** Base color (hex) */
  color: string;
  /** Opacity (0-1) */
  opacity: number;
  /** Scale multiplier */
  scale: number;
  /** Show depth indicator */
  showDepthIndicator: boolean;
  /** Show label on hover */
  showLabel: boolean;
}

/**
 * Color scheme for different operation types.
 */
export const OVERLAY_COLORS: Record<'DRILL' | 'BORE' | 'THROUGH', string> = {
  DRILL: '#22c55e',   // Green
  BORE: '#8b5cf6',    // Purple
  THROUGH: '#f59e0b', // Amber (warning color for through-holes)
};

/**
 * Default marker style.
 */
export const DEFAULT_MARKER_STYLE: CncOverlayMarkerStyle = {
  color: OVERLAY_COLORS.DRILL,
  opacity: 0.8,
  scale: 1.0,
  showDepthIndicator: true,
  showLabel: true,
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isCncOverlayPoint(value: unknown): value is CncOverlayPoint {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    (obj.type === 'DRILL' || obj.type === 'BORE') &&
    typeof obj.position === 'object' &&
    typeof obj.diameter === 'number' &&
    typeof obj.depth === 'number'
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get color for an overlay point based on its properties.
 */
export function getOverlayPointColor(point: CncOverlayPoint): string {
  if (point.throughHole) {
    return OVERLAY_COLORS.THROUGH;
  }
  return point.type === 'BORE' ? OVERLAY_COLORS.BORE : OVERLAY_COLORS.DRILL;
}

/**
 * Filter points based on filter settings.
 */
export function filterOverlayPoints(
  points: readonly CncOverlayPoint[],
  filter: CncOverlayFilter
): CncOverlayPoint[] {
  return points.filter((point) => {
    // Type filter
    if (point.type === 'DRILL' && !filter.showDrill) return false;
    if (point.type === 'BORE' && !filter.showBore) return false;

    // Through-hole filter
    if (filter.throughHolesOnly && !point.throughHole) return false;

    // Face filter
    if (filter.faceFilter !== null && point.face !== filter.faceFilter) return false;

    // Hole kind filter
    if (filter.holeKindFilter.length > 0 && !filter.holeKindFilter.includes(point.holeKind)) {
      return false;
    }

    // Cycle filter
    if (filter.cycleFilter.length > 0 && !filter.cycleFilter.includes(point.cycle)) {
      return false;
    }

    return true;
  });
}

/**
 * Calculate stats from overlay points.
 */
export function calculateOverlayStats(points: readonly CncOverlayPoint[]): CncOverlayStats {
  const stats: CncOverlayStats = {
    totalPoints: points.length,
    byType: { DRILL: 0, BORE: 0 },
    byFace: { TOP: 0, BOTTOM: 0 },
    byHoleKind: {},
    byCycle: {},
    throughHoleCount: 0,
    totalDepth: 0,
    estimatedTimeSeconds: 0,
  };

  for (const point of points) {
    // By type
    if (point.type === 'DRILL' || point.type === 'BORE') {
      stats.byType[point.type]++;
    }

    // By face
    stats.byFace[point.face]++;

    // By hole kind
    stats.byHoleKind[point.holeKind] = (stats.byHoleKind[point.holeKind] || 0) + 1;

    // By cycle
    stats.byCycle[point.cycle] = (stats.byCycle[point.cycle] || 0) + 1;

    // Through-holes
    if (point.throughHole) {
      stats.throughHoleCount++;
    }

    // Total depth
    stats.totalDepth += point.depth;

    // Estimated time (rough: depth / feedRate * 60 + 1s per hole for positioning)
    if (point.feedRate > 0) {
      stats.estimatedTimeSeconds += (point.depth / point.feedRate) * 60 + 1;
    }
  }

  return stats;
}
