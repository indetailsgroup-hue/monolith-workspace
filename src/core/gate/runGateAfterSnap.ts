/**
 * runGateAfterSnap.ts - Gate Validation After Snap Commit
 *
 * POLICY:
 * - Body collision → ERROR (blocks commit or marks invalid)
 * - Use envelope collision → WARNING (allows commit with warning)
 *
 * DETERMINISTIC:
 * - Same inputs always produce same validation result
 * - All parameters serializable for history replay
 */

import type { Vec3 } from '../types/SnapTypes';
import type { CabinetCollisionShape } from '../collision/obbTypes';
import { buildCollisionContextNear } from '../collision/collisionContextBuilder';
import {
  validateClearance,
  formatClearanceIssues,
  getClearanceSummary,
  type ClearanceValidationResult,
  type ClearanceIssue,
} from '../clearance/clearanceValidator';
import type { WorldCollisionRegistry } from '../world/worldCollisionRegistry';
import { SPATIAL_CONFIG, GATE_SEVERITY } from '../config/snapClearanceConfig';

// ============================================
// TYPES
// ============================================

export interface GateInput {
  /** Cabinet ID that was moved */
  movedCabId: string;

  /** Body collision shape at committed transform */
  movedBody: CabinetCollisionShape;

  /** Use envelope shape at committed transform (optional) */
  movedUseEnv?: CabinetCollisionShape;

  /** Collision registry */
  registry: WorldCollisionRegistry;
}

export interface GateReport {
  /** True if no ERROR issues (can proceed) */
  ok: boolean;

  /** All issues found */
  issues: GateIssue[];

  /** Summary string */
  summary: string;

  /** Formatted issues for display */
  formatted: string[];
}

export interface GateIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  targetId?: string;
  targetKind?: string;
}

// ============================================
// GATE VALIDATION
// ============================================

/**
 * Run Gate validation after snap commit
 *
 * @param input - Gate input
 * @returns GateReport
 */
export function runGateAfterSnap(input: GateInput): GateReport {
  const { movedCabId, movedBody, movedUseEnv, registry } = input;

  // Build near-field collision context
  const ctxNear = buildCollisionContextNear(
    movedBody.obbs,
    registry.getSpatialRegistries(),
    registry.getShapeRegistries(),
    SPATIAL_CONFIG.nearPaddingMm
  );

  // Run clearance validation
  const result = validateClearance(
    movedCabId,
    movedBody,
    movedUseEnv,
    ctxNear
  );

  // Convert to gate issues
  const issues: GateIssue[] = result.issues.map(issue => ({
    severity: issue.severity as 'ERROR' | 'WARNING',
    code: issue.code,
    message: issue.message,
    targetId: issue.targetId,
    targetKind: issue.targetKind,
  }));

  return {
    ok: result.ok,
    issues,
    summary: getClearanceSummary(result),
    formatted: formatClearanceIssues(result.issues),
  };
}

// ============================================
// GATE POLICY INFO
// ============================================

export interface GatePolicyInfo {
  bodyCollision: 'ERROR';
  useEnvelopeCollision: 'WARNING';
}

/**
 * Get current gate policy
 */
export function getGatePolicy(): GatePolicyInfo {
  return {
    bodyCollision: GATE_SEVERITY.bodyCollision as 'ERROR',
    useEnvelopeCollision: GATE_SEVERITY.useEnvelopeCollision as 'WARNING',
  };
}

// ============================================
// FEATURE PARAMS FOR HISTORY
// ============================================

/**
 * Parameters for CABINET_SNAP feature with gate results
 */
export interface CabinetSnapGateParams {
  // Snap params
  aCabId: string;
  bCabId: string;
  snapType: string;
  delta: Vec3;

  // Gate results
  gateOk: boolean;
  gateIssues: GateIssue[];

  // Policy used
  gatePolicy: GatePolicyInfo;

  // Deterministic params for replay
  spatialCellSize: number;
  nearPaddingMm: number;
}

/**
 * Create gate params for history
 */
export function createGateParams(
  aCabId: string,
  bCabId: string,
  snapType: string,
  delta: Vec3,
  gateReport: GateReport
): CabinetSnapGateParams {
  return {
    aCabId,
    bCabId,
    snapType,
    delta,
    gateOk: gateReport.ok,
    gateIssues: gateReport.issues,
    gatePolicy: getGatePolicy(),
    spatialCellSize: SPATIAL_CONFIG.cellSizeMm,
    nearPaddingMm: SPATIAL_CONFIG.nearPaddingMm,
  };
}

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Check if gate report allows commit
 */
export function canCommit(report: GateReport): boolean {
  return report.ok;
}

/**
 * Check if gate report has any warnings
 */
export function hasWarnings(report: GateReport): boolean {
  return report.issues.some(i => i.severity === 'WARNING');
}

/**
 * Get error messages only
 */
export function getErrors(report: GateReport): GateIssue[] {
  return report.issues.filter(i => i.severity === 'ERROR');
}

/**
 * Get warning messages only
 */
export function getWarnings(report: GateReport): GateIssue[] {
  return report.issues.filter(i => i.severity === 'WARNING');
}
