/**
 * Gate Runner - Pre-Freeze Validation
 *
 * Runs the complete gate check:
 * 1. Preflight validation (from modeling layer)
 * 2. OperationGraph generation
 * 3. Minifix placement validation (SPEC-MINIFIX-JOINT-LOGIC v1.0)
 * 4. Combined status determination
 *
 * v1.0: Initial gate runner
 * v1.1: Added Minifix gate integration
 */

import type { GateReport, CabinetGateReport, GateStatus, GateBlocker } from './types';
import type { DesignIntent, ProfileAsset } from '../../modeling/types';
import type { PanelContext, ToolContext } from '../../modeling/preflight';
import type { Cabinet } from '../../types/Cabinet';
import { validateAllIntents } from '../../modeling/preflight';
import { buildOpGraphFromIntents } from '../opgraph/buildOpGraph';
import { runMinifixGate, minifixErrorsToBlockers, type MinifixGateResult } from './minifixGate';

// Simple profile lookup using built-in profiles
const defaultProfileLookup = (profileId: string): ProfileAsset | undefined => {
  // Import BUILT_IN_PROFILES dynamically to avoid circular deps
  const { BUILT_IN_PROFILES: profiles } = require('../../modeling/types');
  return profiles.find((p: ProfileAsset) => p.id === profileId);
};

/**
 * Run gate check for a single panel.
 */
export function runGate(
  panelId: string,
  panel: PanelContext,
  intents: DesignIntent[],
  toolContext?: ToolContext,
  profileLookup?: (id: string) => ProfileAsset | undefined
): GateReport {
  // Create panel context map for validateAllIntents
  const panelContexts = new Map<string, PanelContext>();
  panelContexts.set(panelId, panel);

  // Run preflight validation
  const preflight = validateAllIntents(
    intents,
    panelContexts,
    profileLookup ?? defaultProfileLookup,
    toolContext
  );

  // Build operation graph
  const opGraph = buildOpGraphFromIntents(panelId, intents);

  // Determine status
  const hasErrors = preflight.errors.some((e) => e.severity === 'error');
  const status: GateStatus = hasErrors ? 'BLOCKED' : 'PASS';

  return {
    status,
    ok: !hasErrors,
    preflight,
    opGraph,
    timestamp: new Date().toISOString(),
    panelId,
  };
}

/**
 * Run gate check for all panels in a cabinet.
 */
export function runCabinetGate(
  panels: Map<string, PanelContext>,
  intents: DesignIntent[],
  toolContext?: ToolContext
): CabinetGateReport {
  const panelReports = new Map<string, GateReport>();
  let errorCount = 0;
  let warningCount = 0;
  let totalOps = 0;

  for (const [panelId, panel] of panels) {
    const panelIntents = intents.filter(
      (i) => i.target.panelId === panelId
    );
    const report = runGate(panelId, panel, panelIntents, toolContext);
    panelReports.set(panelId, report);

    errorCount += report.preflight.errors.filter((e) => e.severity === 'error').length;
    warningCount += report.preflight.errors.filter((e) => e.severity === 'warning').length;
    totalOps += report.opGraph.nodes.length;
  }

  const status: GateStatus = errorCount > 0 ? 'BLOCKED' : 'PASS';

  return {
    status,
    ok: errorCount === 0,
    panels: panelReports,
    errorCount,
    warningCount,
    totalOps,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if gate is ready for freeze.
 */
export function canFreeze(report: GateReport | CabinetGateReport): boolean {
  return report.ok;
}

/**
 * Get human-readable gate summary.
 */
export function getGateSummary(report: GateReport): string {
  if (report.ok) {
    return `Gate PASS: ${report.opGraph.nodes.length} operations ready`;
  } else {
    const errorCount = report.preflight.errors.filter((e) => e.severity === 'error').length;
    return `Gate BLOCKED: ${errorCount} error(s) must be fixed`;
  }
}

// ============================================
// MINIFIX GATE INTEGRATION (v1.1)
// ============================================

/**
 * Extended cabinet gate report with Minifix validation
 */
export interface CabinetGateReportWithMinifix extends CabinetGateReport {
  /** Minifix-specific gate result */
  minifix: MinifixGateResult;
  /** Combined blockers from all gates */
  allBlockers: GateBlocker[];
}

/**
 * Run complete gate check including Minifix validation.
 *
 * POLICY: Export is BLOCKED if either:
 * - Panel preflight validation fails
 * - Minifix placement validation fails
 *
 * Use this for export/G-code/packet generation.
 */
export function runFullCabinetGate(
  cabinet: Cabinet,
  panels: Map<string, PanelContext>,
  intents: DesignIntent[],
  toolContext?: ToolContext
): CabinetGateReportWithMinifix {
  // Run standard cabinet gate
  const cabinetGate = runCabinetGate(panels, intents, toolContext);

  // Run Minifix gate
  const minifixGate = runMinifixGate(cabinet);
  const minifixBlockers = minifixErrorsToBlockers(minifixGate.errors);

  // Collect all blockers
  const panelBlockers: GateBlocker[] = [];
  for (const [panelId, report] of cabinetGate.panels) {
    for (const error of report.preflight.errors) {
      if (error.severity === 'error') {
        panelBlockers.push({
          code: error.code,
          message: error.message,
          severity: 'error',
          panelId,
          intentId: error.targetId,
        });
      }
    }
  }

  const allBlockers = [...panelBlockers, ...minifixBlockers];

  // Combined status
  const isOk = cabinetGate.ok && minifixGate.ok;
  const status: GateStatus = isOk ? 'PASS' : 'BLOCKED';

  return {
    ...cabinetGate,
    status,
    ok: isOk,
    errorCount: cabinetGate.errorCount + minifixGate.errors.length,
    minifix: minifixGate,
    allBlockers,
  };
}

/**
 * Check if cabinet can be exported (all gates pass)
 */
export function canExport(report: CabinetGateReportWithMinifix): boolean {
  return report.ok && report.minifix.ok;
}

/**
 * Get combined gate summary including Minifix status
 */
export function getFullGateSummary(report: CabinetGateReportWithMinifix): string {
  const parts: string[] = [];

  if (!report.ok) {
    if (report.errorCount > 0) {
      parts.push(`${report.errorCount - report.minifix.errors.length} panel error(s)`);
    }
    if (!report.minifix.ok) {
      parts.push(`${report.minifix.errors.length} Minifix error(s)`);
    }
    return `Gate BLOCKED: ${parts.join(', ')}`;
  }

  return `Gate PASS: ${report.totalOps} ops, ${report.minifix.placements.length} Minifix placements`;
}
