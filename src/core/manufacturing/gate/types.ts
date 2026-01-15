/**
 * Gate Types - Pre-Freeze Validation
 *
 * Gate is the "single explicit step" before Freeze.
 * Combines: Preflight validation + OpGraph preview + Freeze readiness.
 *
 * v1.0: Initial gate types
 */

import type { OperationGraph } from '../opgraph/types';
import type { PreflightResult } from '../../modeling/preflight';

export type GateStatus = 'PASS' | 'BLOCKED' | 'PENDING';

/**
 * Complete gate report for a panel.
 */
export interface GateReport {
  /** Overall status */
  status: GateStatus;
  /** Is gate passing (no errors) */
  ok: boolean;
  /** Preflight validation result */
  preflight: PreflightResult;
  /** Operation graph preview */
  opGraph: OperationGraph;
  /** Timestamp of gate run */
  timestamp: string;
  /** Panel ID this report is for */
  panelId: string;
}

/**
 * Cabinet-level gate report (all panels).
 */
export interface CabinetGateReport {
  /** Overall status */
  status: GateStatus;
  /** Is cabinet passing */
  ok: boolean;
  /** Per-panel reports */
  panels: Map<string, GateReport>;
  /** Total error count */
  errorCount: number;
  /** Total warning count */
  warningCount: number;
  /** Total operation count */
  totalOps: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Gate blocker - reason why gate is not passing.
 */
export interface GateBlocker {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  panelId?: string;
  intentId?: string;
}

/**
 * Get blockers from a gate report.
 */
export function getBlockers(report: GateReport): GateBlocker[] {
  const blockers: GateBlocker[] = [];

  for (const error of report.preflight.errors) {
    blockers.push({
      code: error.code,
      message: error.message,
      severity: error.severity === 'error' ? 'error' : 'warning',
      panelId: report.panelId,
      intentId: error.targetId,
    });
  }

  return blockers;
}
