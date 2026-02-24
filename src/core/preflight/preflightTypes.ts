/**
 * preflightTypes.ts - Release Preflight Report Types
 *
 * PREFLIGHT REPORT:
 * - Summary of job state before release
 * - Blocking issues, waived issues, receipts per station
 * - Gate status, export bundle status
 * - Readiness indicators for re-export and release
 *
 * GUIDED FLOW:
 * 1. Fix Plan: Close/waive all blocking issues
 * 2. Preflight: Gate OK + no blocking + exports exist + no REJECTED stations
 * 3. Generate Re-Export Package (if needed)
 * 4. Request Release
 */

import type { IssueItem } from '../issues/issueTypes';

// ============================================
// STATION RECEIPT SUMMARY
// ============================================

/**
 * Summary of receipts from a single factory station
 */
export interface StationReceiptSummary {
  /** Station ID */
  stationId: string;

  /** Last verdict from this station */
  lastVerdict: 'ACCEPTED' | 'REJECTED';

  /** Hash of the last receipt */
  lastReceiptHashHex: string;

  /** Head manifest hash at time of receipt */
  lastHeadManifestHashHex?: string;

  /** Inspector who signed */
  inspector?: string;

  /** Timestamp of last receipt */
  timestampIso?: string;
}

// ============================================
// EXPORT SUMMARY
// ============================================

/**
 * Summary of export bundles
 */
export interface ExportSummary {
  /** Total export count */
  count: number;

  /** Last export ID (from ExportRecord, if available) */
  lastExportId?: string;

  /** Last export hash (bundle proof hash or content hash) */
  lastExportHash?: string;

  /** Last export timestamp */
  lastCreatedIso?: string;

  /** Spec state at last export */
  lastSpecStateAtExport?: 'DRAFT' | 'FROZEN' | 'RELEASED';

  /** Artifact count in last export */
  lastArtifactCount?: number;
}

// ============================================
// PREFLIGHT REPORT
// ============================================

/**
 * Preflight report for release readiness
 */
export interface PreflightReport {
  /** Job ID */
  jobId: string;

  /** Current HEAD hash */
  headHashHex: string;

  /** Current spec state */
  specState: 'DRAFT' | 'FROZEN' | 'RELEASED';

  /** Issues categorized */
  issues: {
    /** Blocking issues (ERROR + OPEN/IN_PROGRESS) */
    blocking: IssueItem[];

    /** Waived issues */
    waived: IssueItem[];

    /** Resolved or info issues */
    resolvedOrInfo: IssueItem[];
  };

  /** Receipts summary per station */
  receipts: {
    /** Per-station summaries */
    stations: StationReceiptSummary[];

    /** Last overall verdict (most recent receipt) */
    lastVerdict?: 'ACCEPTED' | 'REJECTED';
  };

  /** Export summary */
  exports: ExportSummary;

  /** Gate status */
  gate: {
    ok: boolean;
  };

  /** Readiness indicators */
  ready: {
    /** Can generate re-export package */
    canReExport: boolean;

    /** Can request release */
    canRequestRelease: boolean;

    /** Reasons why not ready (if any) */
    reasons: string[];
  };
}
