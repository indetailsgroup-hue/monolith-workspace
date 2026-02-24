/**
 * collisionReport.ts - Collision Report Contract for Multi-Select
 *
 * ARCHITECTURE:
 * - CollisionReport: summary of all collision checks for a selection
 * - CollisionPair: individual collision between two objects
 * - Used for both preview (UI feedback) and gate (commit blocking)
 *
 * DETERMINISTIC:
 * - Same input always produces same output
 * - No randomness, no time-dependent logic
 */

// ============================================
// TYPES
// ============================================

/**
 * Severity of collision issue
 * - ERROR: blocks commit (overlap, minGap violation)
 * - WARNING: allows commit but shows warning (close proximity)
 */
export type CollisionSeverity = 'ERROR' | 'WARNING';

/**
 * Reason for collision detection
 * - OVERLAP: penetration > 0 (objects intersect)
 * - MIN_GAP_VIOLATION: gap < minGap (too close)
 */
export type CollisionReason = 'OVERLAP' | 'MIN_GAP_VIOLATION';

/**
 * Source of collision (for diagnostics)
 * - INTERNAL: within selection (cab A vs cab B, both selected)
 * - EXTERNAL: selection vs non-selected (cab vs environment/other cabs)
 */
export type CollisionSource = 'INTERNAL' | 'EXTERNAL';

/**
 * Single collision pair
 */
export interface CollisionPair {
  /** ID of first object */
  aId: string;
  /** ID of second object */
  bId: string;
  /** Penetration depth in mm (> 0 means overlap) */
  penetrationMm: number;
  /** Gap distance in mm (>= 0 means separation) */
  gapMm: number;
  /** Severity of this collision */
  severity: CollisionSeverity;
  /** Reason for flagging */
  reason: CollisionReason;
  /** Source: internal or external */
  source: CollisionSource;
}

/**
 * Full collision report for a selection
 */
export interface CollisionReport {
  /** Whether any ERROR severity issues exist */
  blocked: boolean;
  /** All collision pairs detected */
  pairs: CollisionPair[];
  /** Number of pairs checked (for diagnostics) */
  checkedPairs: number;
  /** Check duration in ms (optional) */
  durationMs?: number;
}

// ============================================
// HELPERS
// ============================================

/**
 * Create an empty collision report (no collisions)
 */
export function createEmptyCollisionReport(): CollisionReport {
  return {
    blocked: false,
    pairs: [],
    checkedPairs: 0,
  };
}

/**
 * Check if report is blocked (has ERROR severity)
 */
export function isCollisionBlocked(report: CollisionReport | null): boolean {
  if (!report) return false;
  return report.blocked;
}

/**
 * Get worst penetration from report
 */
export function getWorstPenetration(report: CollisionReport): number {
  if (report.pairs.length === 0) return 0;
  return Math.max(...report.pairs.map(p => p.penetrationMm));
}

/**
 * Get worst (smallest) gap from report
 */
export function getWorstGap(report: CollisionReport): number {
  if (report.pairs.length === 0) return Infinity;
  return Math.min(...report.pairs.map(p => p.gapMm));
}

/**
 * Get all IDs involved in collisions
 */
export function getCollidingIds(report: CollisionReport): Set<string> {
  const ids = new Set<string>();
  for (const p of report.pairs) {
    ids.add(p.aId);
    ids.add(p.bId);
  }
  return ids;
}

/**
 * Filter pairs by source
 */
export function filterBySource(
  report: CollisionReport,
  source: CollisionSource
): CollisionPair[] {
  return report.pairs.filter(p => p.source === source);
}

/**
 * Merge multiple collision reports
 */
export function mergeCollisionReports(reports: CollisionReport[]): CollisionReport {
  const pairs: CollisionPair[] = [];
  let checkedPairs = 0;

  for (const r of reports) {
    pairs.push(...r.pairs);
    checkedPairs += r.checkedPairs;
  }

  return {
    blocked: pairs.some(p => p.severity === 'ERROR'),
    pairs,
    checkedPairs,
  };
}

/**
 * Summary stats for UI display
 */
export interface CollisionSummary {
  blocked: boolean;
  totalPairs: number;
  internalPairs: number;
  externalPairs: number;
  worstPenetrationMm: number;
  worstGapMm: number;
}

export function summarizeCollisionReport(report: CollisionReport): CollisionSummary {
  const internal = filterBySource(report, 'INTERNAL');
  const external = filterBySource(report, 'EXTERNAL');

  return {
    blocked: report.blocked,
    totalPairs: report.pairs.length,
    internalPairs: internal.length,
    externalPairs: external.length,
    worstPenetrationMm: getWorstPenetration(report),
    worstGapMm: report.pairs.length > 0 ? getWorstGap(report) : 0,
  };
}
