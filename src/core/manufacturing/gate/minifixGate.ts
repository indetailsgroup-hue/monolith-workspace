/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * Minifix Gate - Export/G-code Enforcement
 *
 * Gate enforcement hook that blocks export/G-code/packet generation
 * if Minifix placements don't pass validation.
 *
 * POLICY: Export is BLOCKED if any MinifixPlacement fails validation
 */

import type { Cabinet } from '../../types/Cabinet';
import type { GateBlocker } from './types';
import {
  MinifixPlacement,
  MinifixJointResolution,
  ValidationIssue,
} from '../../../contracts/minifixJointContracts';
import { validatePlacement, validatePlacements } from '../../../contracts/minifixJointGuards';
import {
  createCabinetTopologyApi,
  detectCabinetMinifixJoints,
} from '../minifix/cabinetTopologyApi';
import { resolveMinifixPlacement } from '../minifix/resolveMinifixPlacement';

// ─────────────────────────────────────────────────────────────────────────────
// Gate Error Types
// ─────────────────────────────────────────────────────────────────────────────

export type MinifixGateErrorCode =
  | 'MINIFIX_INVALID'
  | 'MINIFIX_ALIGNMENT_FAILED'
  | 'MINIFIX_AXIS_INVALID'
  | 'MINIFIX_PANEL_ROLE_MISMATCH'
  | 'MINIFIX_TOO_CLOSE'
  | 'MINIFIX_PANEL_NOT_FOUND';

export interface MinifixGateError {
  code: MinifixGateErrorCode;
  message: string;
  issues: ValidationIssue[];
  placement?: MinifixPlacement;
  jointId?: string;
}

export interface MinifixGateResult {
  ok: boolean;
  errors: MinifixGateError[];
  placements: MinifixPlacement[];
  resolutions: MinifixJointResolution[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run Minifix gate validation for a cabinet
 *
 * This function:
 * 1. Detects all Minifix joints in the cabinet
 * 2. Resolves placements using topology
 * 3. Validates each placement
 * 4. Returns gate result with any blocking errors
 *
 * @param cabinet The cabinet to validate
 * @returns Gate result indicating if export is allowed
 */
export function runMinifixGate(cabinet: Cabinet): MinifixGateResult {
  const errors: MinifixGateError[] = [];
  const allPlacements: MinifixPlacement[] = [];
  const allResolutions: MinifixJointResolution[] = [];

  // Create topology API
  const api = createCabinetTopologyApi(cabinet);

  // Detect all Minifix joints
  const jointConfigs = detectCabinetMinifixJoints(cabinet);

  // Resolve and validate each joint
  for (const config of jointConfigs) {
    const resolution = resolveMinifixPlacement(config, api);
    allResolutions.push(resolution);
    allPlacements.push(...resolution.placements);

    // Check if resolution itself failed
    if (!resolution.validation.valid) {
      const errorIssues = resolution.validation.issues.filter(
        (i) => i.severity === 'error'
      );

      if (errorIssues.length > 0) {
        // Map to appropriate error code
        const code = mapIssuesToCode(errorIssues);

        errors.push({
          code,
          message: `Minifix joint ${config.id} (${config.style} ${config.position}) failed validation`,
          issues: errorIssues,
          jointId: config.id,
        });
      }
    }
  }

  // Validate all placements together (check for collisions, etc.)
  if (allPlacements.length > 0) {
    const combinedValidation = validatePlacements(allPlacements);

    if (!combinedValidation.valid) {
      const collisionIssues = combinedValidation.issues.filter(
        (i) => i.severity === 'error' && (i.code === 'CAM_TOO_CLOSE' || i.code === 'BOLT_TOO_CLOSE')
      );

      if (collisionIssues.length > 0) {
        errors.push({
          code: 'MINIFIX_TOO_CLOSE',
          message: 'Minifix placements are too close together',
          issues: collisionIssues,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    placements: allPlacements,
    resolutions: allResolutions,
  };
}

/**
 * Map validation issues to gate error code
 */
function mapIssuesToCode(issues: ValidationIssue[]): MinifixGateErrorCode {
  for (const issue of issues) {
    if (issue.code === 'CAM_AXIS_INVALID' || issue.code === 'BOLT_AXIS_INVALID') {
      return 'MINIFIX_AXIS_INVALID';
    }
    if (issue.code === 'ALIGNMENT_TOO_FAR') {
      return 'MINIFIX_ALIGNMENT_FAILED';
    }
    if (issue.code.includes('PANEL_ROLE')) {
      return 'MINIFIX_PANEL_ROLE_MISMATCH';
    }
    if (issue.code === 'PANEL_NOT_FOUND' || issue.code === 'FACE_OR_EDGE_NOT_FOUND') {
      return 'MINIFIX_PANEL_NOT_FOUND';
    }
  }
  return 'MINIFIX_INVALID';
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate Integration Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert Minifix gate errors to standard GateBlockers
 * for integration with the existing gate system
 */
export function minifixErrorsToBlockers(errors: MinifixGateError[]): GateBlocker[] {
  const blockers: GateBlocker[] = [];

  for (const error of errors) {
    blockers.push({
      code: error.code,
      message: error.message,
      severity: 'error',
      panelId: error.placement?.cam.face.panelId,
    });

    // Add individual issues as sub-blockers
    for (const issue of error.issues) {
      blockers.push({
        code: issue.code,
        message: issue.message,
        severity: issue.severity === 'error' ? 'error' : 'warning',
        panelId: issue.location?.panelId,
      });
    }
  }

  return blockers;
}

/**
 * Check if cabinet can be exported (Minifix validation passes)
 */
export function canExportWithMinifix(cabinet: Cabinet): boolean {
  const result = runMinifixGate(cabinet);
  return result.ok;
}

/**
 * Get human-readable gate summary for Minifix validation
 */
export function getMinifixGateSummary(result: MinifixGateResult): string {
  if (result.ok) {
    return `Minifix Gate PASS: ${result.placements.length} placements validated`;
  }

  const errorCount = result.errors.length;
  const issueCount = result.errors.reduce((sum, e) => sum + e.issues.length, 0);

  return `Minifix Gate BLOCKED: ${errorCount} joint(s) failed with ${issueCount} issue(s)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preflight Integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combined preflight and Minifix gate check
 *
 * Use this before export/compile operations to ensure all validations pass.
 */
export function preflightMinifixOps(cabinet: Cabinet): {
  gate: MinifixGateResult;
  canProceed: boolean;
  blockers: GateBlocker[];
} {
  const gate = runMinifixGate(cabinet);
  const blockers = minifixErrorsToBlockers(gate.errors);

  return {
    gate,
    canProceed: gate.ok,
    blockers,
  };
}
