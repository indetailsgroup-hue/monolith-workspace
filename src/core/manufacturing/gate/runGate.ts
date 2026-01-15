/**
 * Gate Runner - Pre-Freeze Validation
 *
 * Runs the complete gate check:
 * 1. Preflight validation (from modeling layer)
 * 2. OperationGraph generation
 * 3. Combined status determination
 *
 * v1.0: Initial gate runner
 */

import type { GateReport, CabinetGateReport, GateStatus } from './types';
import type { DesignIntent, ProfileAsset } from '../../modeling/types';
import type { PanelContext, ToolContext } from '../../modeling/preflight';
import { validateAllIntents } from '../../modeling/preflight';
import { buildOpGraphFromIntents } from '../opgraph/buildOpGraph';

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
