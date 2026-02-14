/**
 * trustReportTypes.ts - Trust Report Types
 *
 * The TrustReport is a cryptographically signed snapshot of the
 * design state at a point in time, including gate results and collision status.
 *
 * @version 1.0.0
 */

import type { SpecStatus } from '../spec/specState';
import type { GateBundleResult } from '../gate/gateBundleTypes';

// ============================================
// COLLISION SUMMARY
// ============================================

/**
 * Summary of collision detection results
 * (stored in trust report, derived from CollisionReport)
 */
export interface CollisionSummary {
  /** Whether collisions block placement */
  blocked: boolean;
  /** Number of collision pairs */
  pairCount: number;
  /** Worst penetration depth (mm) */
  worstPenetrationMm: number;
  /** Worst gap distance (mm) */
  worstGapMm: number;
}

/**
 * Create an empty collision summary (no collisions)
 */
export function createEmptyCollisionSummary(): CollisionSummary {
  return {
    blocked: false,
    pairCount: 0,
    worstPenetrationMm: 0,
    worstGapMm: 0,
  };
}

// ============================================
// TRUST REPORT
// ============================================

/**
 * Trust report - a signed snapshot of the design state
 *
 * Created on every geometry commit. Captures:
 * - Which cabinets were selected
 * - Gate validation results
 * - Collision detection results
 * - Current spec state
 */
export interface TrustReport {
  /** Report version */
  version: '1.0';
  /** Job ID */
  jobId: string;
  /** Timestamp */
  timestampIso: string;
  /** Selected cabinet IDs */
  selectionIds: string[];
  /** Active cabinet ID */
  activeId: string | null;
  /** Spec state at time of report */
  spec: SpecStatus;
  /** Gate validation result */
  gate: GateBundleResult;
  /** Collision summary */
  collision: CollisionSummary;
  /** Hash of snapshot inputs (for deduplication) */
  inputsHash?: string;
  /** Hash of design state snapshot */
  snapshotHashHex?: string;
}

// ============================================
// SIGNED TRUST REPORT
// ============================================

/**
 * Signed trust report with cryptographic proof
 */
export interface SignedTrustReport {
  /** The trust report data */
  trust: TrustReport;
  /** Signature hex */
  signatureHex: string;
  /** Key ID used for signing */
  keyId: string;
  /** Signing timestamp */
  timestampIso: string;
}
