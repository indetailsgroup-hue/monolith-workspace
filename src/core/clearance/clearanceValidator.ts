/**
 * clearanceValidator.ts - Validate Cabinet Clearance (Body + Use Envelope)
 *
 * POLICY:
 * - Body collision → ERROR (blocks commit)
 * - Use envelope collision → WARNING (allows commit with warning)
 *
 * DETERMINISTIC: Same inputs always produce same validation result
 */

import type { CabinetCollisionShape } from '../collision/obbTypes';
import type { CollisionContextOBB } from '../collision/collisionEngine';
import { detectCollisionForMovedCabinet, detectAllCollisions } from '../collision/collisionEngine';
import { GATE_SEVERITY } from '../config/snapClearanceConfig';

// ============================================
// TYPES
// ============================================

export type ClearanceSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ClearanceIssue {
  severity: ClearanceSeverity;
  code: string;
  message: string;
  targetId?: string;
  targetKind?: string;
}

export interface ClearanceValidationResult {
  /** True if no ERROR issues */
  ok: boolean;

  /** All issues found */
  issues: ClearanceIssue[];

  /** Count of errors */
  errorCount: number;

  /** Count of warnings */
  warningCount: number;
}

// ============================================
// BODY COLLISION VALIDATION
// ============================================

/**
 * Validate body collision (cabinet carcass)
 *
 * @param cabId - Cabinet ID being validated
 * @param body - Cabinet body collision shape
 * @param ctx - Collision context
 * @returns Array of clearance issues (errors)
 */
export function validateBodyCollision(
  cabId: string,
  body: CabinetCollisionShape,
  ctx: CollisionContextOBB
): ClearanceIssue[] {
  const issues: ClearanceIssue[] = [];

  const hits = detectAllCollisions(cabId, body, ctx);

  for (const hit of hits) {
    issues.push({
      severity: GATE_SEVERITY.bodyCollision as ClearanceSeverity,
      code: 'BODY_COLLISION',
      message: hit.reason,
      targetId: hit.targetId,
      targetKind: hit.targetKind,
    });
  }

  return issues;
}

// ============================================
// USE ENVELOPE COLLISION VALIDATION
// ============================================

/**
 * Validate use envelope collision (door/drawer clearance)
 *
 * @param cabId - Cabinet ID being validated
 * @param useEnvelope - Use envelope collision shape
 * @param ctx - Collision context
 * @returns Array of clearance issues (warnings)
 */
export function validateUseEnvelope(
  cabId: string,
  useEnvelope: CabinetCollisionShape,
  ctx: CollisionContextOBB
): ClearanceIssue[] {
  const issues: ClearanceIssue[] = [];

  // Skip if no envelope OBBs
  if (!useEnvelope?.obbs?.length) {
    return issues;
  }

  const hits = detectAllCollisions(cabId, useEnvelope, ctx);

  for (const hit of hits) {
    issues.push({
      severity: GATE_SEVERITY.useEnvelopeCollision as ClearanceSeverity,
      code: 'USE_ENVELOPE_COLLISION',
      message: `Door/drawer clearance issue: ${hit.reason}`,
      targetId: hit.targetId,
      targetKind: hit.targetKind,
    });
  }

  return issues;
}

// ============================================
// COMBINED VALIDATION
// ============================================

/**
 * Validate both body and use envelope collisions
 *
 * @param cabId - Cabinet ID
 * @param body - Body collision shape
 * @param useEnvelope - Use envelope collision shape (optional)
 * @param ctx - Collision context
 * @returns Complete validation result
 */
export function validateClearance(
  cabId: string,
  body: CabinetCollisionShape,
  useEnvelope: CabinetCollisionShape | undefined,
  ctx: CollisionContextOBB
): ClearanceValidationResult {
  const issues: ClearanceIssue[] = [];

  // Body collision (ERROR)
  issues.push(...validateBodyCollision(cabId, body, ctx));

  // Use envelope (WARNING)
  if (useEnvelope) {
    issues.push(...validateUseEnvelope(cabId, useEnvelope, ctx));
  }

  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;

  return {
    ok: errorCount === 0,
    issues,
    errorCount,
    warningCount,
  };
}

// ============================================
// QUICK CHECKS
// ============================================

/**
 * Quick check if body collision exists (for preview)
 */
export function hasBodyCollision(
  cabId: string,
  body: CabinetCollisionShape,
  ctx: CollisionContextOBB
): boolean {
  return detectCollisionForMovedCabinet(cabId, body, ctx) !== null;
}

/**
 * Quick check if use envelope collision exists
 */
export function hasUseEnvelopeCollision(
  cabId: string,
  useEnvelope: CabinetCollisionShape,
  ctx: CollisionContextOBB
): boolean {
  if (!useEnvelope?.obbs?.length) return false;
  return detectCollisionForMovedCabinet(cabId, useEnvelope, ctx) !== null;
}

// ============================================
// FORMATTING
// ============================================

/**
 * Format issues for display
 */
export function formatClearanceIssues(issues: ClearanceIssue[]): string[] {
  return issues.map(issue => {
    const prefix = issue.severity === 'ERROR' ? '❌' : issue.severity === 'WARNING' ? '⚠️' : 'ℹ️';
    return `${prefix} [${issue.code}] ${issue.message}`;
  });
}

/**
 * Get summary string
 */
export function getClearanceSummary(result: ClearanceValidationResult): string {
  if (result.ok && result.warningCount === 0) {
    return 'Clearance OK';
  }

  const parts: string[] = [];
  if (result.errorCount > 0) {
    parts.push(`${result.errorCount} error${result.errorCount > 1 ? 's' : ''}`);
  }
  if (result.warningCount > 0) {
    parts.push(`${result.warningCount} warning${result.warningCount > 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}
