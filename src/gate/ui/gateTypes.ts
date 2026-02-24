/**
 * Gate UI Types
 *
 * Type definitions for the Safety Gate UI integration.
 * Connects Gate validation results to visual feedback.
 *
 * @version 1.0.0 - Phase A: Gate → UI Integration
 */

import type { GateIssue } from '../../spec/types';
import type { Severity } from '../../spec/types';

// Re-export Severity for consumers
export type { Severity } from '../../spec/types';

// ============================================
// GATE FINDING (UI-Friendly Issue)
// ============================================

/**
 * A single Gate finding with UI metadata.
 * Extends GateIssue with actionable patch data.
 */
export interface GateFinding {
  /** Unique finding key (e.g., "MINIFIX_PAIR_ALIGNMENT:bolt-123") */
  key: string;
  /** Rule code (e.g., "MINIFIX_PAIR_ALIGNMENT") */
  code: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: Severity;
  /** Affected entity IDs (DrillMapPoint IDs) */
  entityIds: string[];
  /** Optional JSON Patch for auto-fix */
  patch?: GatePatch[];
  /** Additional context */
  context?: Record<string, unknown>;
}

// ============================================
// GATE PATCH (JSON Patch Operation)
// ============================================

/**
 * JSON Patch operation for auto-fix.
 * Path must start with /useDrillMapStore/drillMap/ for security.
 */
export interface GatePatch {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

// ============================================
// GATE RESULT (Complete Validation Output)
// ============================================

/**
 * Complete Gate validation result.
 */
export interface GateResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Timestamp of validation run */
  runAt: string;
  /** Policy version used */
  policyVersion: string;
  /** All findings grouped by severity */
  findings: {
    blockers: GateFinding[];
    warnings: GateFinding[];
    info: GateFinding[];
  };
  /** Summary metrics */
  metrics?: Record<string, number | string>;
}

// ============================================
// GATE UI STATE
// ============================================

/**
 * Gate UI store state shape.
 */
export interface GateUIState {
  /** Latest Gate validation result */
  lastResult: GateResult | null;
  /** Is validation currently running */
  isRunning: boolean;
  /** Currently selected finding key */
  selectedFindingKey: string | null;
  /** Entity IDs from selected finding (for highlights) */
  selectedEntityIds: string[];
}

/**
 * Gate UI store actions.
 */
export interface GateUIActions {
  /** Update the last validation result */
  setResult: (result: GateResult) => void;
  /** Set running state */
  setRunning: (running: boolean) => void;
  /** Select a finding and its entities */
  selectFinding: (findingKey: string, entityIds: string[]) => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Reset the entire state */
  reset: () => void;
}

// ============================================
// SEVERITY COLORS
// ============================================

export const SEVERITY_COLORS: Record<Severity, string> = {
  BLOCKER: '#ef4444', // Red
  WARNING: '#f59e0b', // Amber
  INFO: '#3b82f6',    // Blue
};

export const SEVERITY_BG: Record<Severity, string> = {
  BLOCKER: 'rgba(239, 68, 68, 0.15)',
  WARNING: 'rgba(245, 158, 11, 0.15)',
  INFO: 'rgba(59, 130, 246, 0.15)',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Count total findings by severity.
 */
export function countBySeverity(result: GateResult | null): Record<Severity, number> {
  if (!result) return { BLOCKER: 0, WARNING: 0, INFO: 0 };
  return {
    BLOCKER: result.findings.blockers.length,
    WARNING: result.findings.warnings.length,
    INFO: result.findings.info.length,
  };
}

/**
 * Get all findings as a flat array.
 */
export function flattenFindings(result: GateResult | null): GateFinding[] {
  if (!result) return [];
  return [
    ...result.findings.blockers,
    ...result.findings.warnings,
    ...result.findings.info,
  ];
}

/**
 * Find a specific finding by key.
 */
export function findFindingByKey(result: GateResult | null, key: string): GateFinding | null {
  if (!result) return null;
  const all = flattenFindings(result);
  return all.find(f => f.key === key) ?? null;
}
