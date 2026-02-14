/**
 * trustReportTypes.ts - Trust Report Types for Factory Traceability
 *
 * ARCHITECTURE:
 * - TrustReport: comprehensive validation snapshot
 * - Includes gate results, collision summary, timestamps
 * - Includes SpecStatus (DRAFT/FROZEN/RELEASED) - signed for factory trust
 * - Used for factory audit trail and export enforcement
 *
 * DETERMINISTIC:
 * - Same inputs produce same report structure
 * - Hashing ensures tamper detection
 */

import type { GateBundleResult } from '../gate/gateBundleTypes';
import type { SpecStatus } from '../spec/specState';

// ============================================
// COLLISION SUMMARY
// ============================================

/**
 * Collision summary for trust report
 */
export interface TrustCollisionSummary {
  /** Whether any collisions blocked commit */
  blocked: boolean;
  /** Number of collision pairs detected */
  pairCount: number;
  /** Worst penetration depth in mm (undefined if no overlaps) */
  worstPenetrationMm?: number;
  /** Worst (smallest) gap in mm (undefined if no gaps) */
  worstGapMm?: number;
  /** Number of internal collisions (within selection) */
  internalCount?: number;
  /** Number of external collisions (with non-selected) */
  externalCount?: number;
}

// ============================================
// TRUST REPORT
// ============================================

/**
 * Trust report version
 */
export type TrustReportVersion = '1.0';

/**
 * Trust report for factory traceability
 */
export interface TrustReport {
  /** Report version */
  version: TrustReportVersion;
  /** Job/project identifier */
  jobId: string;
  /** ISO timestamp when report was generated */
  timestampIso: string;

  // ---- Selection context ----
  /** IDs of selected cabinets */
  selectionIds: string[];
  /** Active cabinet ID (pivot) */
  activeId: string | null;

  // ---- Spec state (DRAFT/FROZEN/RELEASED) ----
  /** Spec status - signed for factory trust */
  spec: SpecStatus;

  // ---- Validation results ----
  /** Gate bundle result */
  gate: GateBundleResult;
  /** Collision summary */
  collision: TrustCollisionSummary;

  // ---- Snapshot Hash Lock ----
  /**
   * SHA-256 hash of normalized JobSnapshot
   *
   * FACTORY HASH LOCK:
   * - Computed at preflight/release time
   * - Signed as part of TrustReport
   * - Used to detect changes after preflight
   * - Factory can verify exported data matches this hash
   */
  snapshotHashHex?: string;

  // ---- Optional: hashes for integrity ----
  /** Hash of input parameters (optional) */
  inputsHash?: string;
  /** Hash of scene state (optional) */
  sceneHash?: string;
}

// ============================================
// CREATION HELPERS
// ============================================

/**
 * Create empty collision summary
 */
export function createEmptyCollisionSummary(): TrustCollisionSummary {
  return {
    blocked: false,
    pairCount: 0,
  };
}

/**
 * Create empty trust report
 */
export function createEmptyTrustReport(jobId: string): TrustReport {
  return {
    version: '1.0',
    jobId,
    timestampIso: new Date().toISOString(),
    selectionIds: [],
    activeId: null,
    spec: { state: 'DRAFT' },
    gate: {
      ok: true,
      perCabinet: [],
      globalIssues: [],
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
    },
    collision: createEmptyCollisionSummary(),
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if trust report is valid (passes all checks)
 */
export function isTrustReportValid(report: TrustReport): boolean {
  return report.gate.ok && !report.collision.blocked;
}

/**
 * Get validation status string
 */
export function getTrustReportStatus(report: TrustReport): 'VALID' | 'INVALID' {
  return isTrustReportValid(report) ? 'VALID' : 'INVALID';
}

/**
 * Get summary string for UI display
 */
export function formatTrustReportSummary(report: TrustReport): string {
  const status = getTrustReportStatus(report);
  const gateStr = report.gate.ok ? 'Gate OK' : `Gate BLOCKED (${report.gate.errorCount} errors)`;
  const collStr = report.collision.blocked
    ? `Collision BLOCKED (${report.collision.pairCount} pairs)`
    : 'Collision OK';

  return `[${status}] ${gateStr} | ${collStr}`;
}
