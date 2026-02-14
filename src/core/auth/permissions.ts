/**
 * permissions.ts - Permission Functions
 *
 * Priority 0: Gate-aware permission checking
 *
 * Combines Role + SpecState + VerifyStatus to determine allowed actions.
 * These are the "authority moments" in the Swimlane.
 */

import type { Role } from './roles';
import { getCurrentRole, getRoleFeatures, isAdmin } from './roles';

// ============================================================================
// Spec State Types (matches useSpecStore)
// ============================================================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';
export type VerifyStatus = 'PENDING' | 'PASS' | 'FAIL';
export type DepositStatus = 'UNPAID' | 'PAID' | 'PARTIAL';

// ============================================================================
// Permission Context
// ============================================================================

export interface PermissionContext {
  role: Role;
  specState: SpecState;
  verifyStatus: VerifyStatus;
  depositStatus?: DepositStatus;
}

/**
 * Build permission context from current state.
 */
export function buildPermissionContext(
  specState: SpecState,
  verifyStatus: VerifyStatus,
  depositStatus: DepositStatus = 'UNPAID'
): PermissionContext {
  return {
    role: getCurrentRole(),
    specState,
    verifyStatus,
    depositStatus,
  };
}

// ============================================================================
// Core Permission Functions
// ============================================================================

/**
 * Can user edit the spec (geometry, materials, etc.)?
 * Only in DRAFT state, and only DESIGNER or ADMIN.
 */
export function canEdit(ctx: PermissionContext): boolean {
  const features = getRoleFeatures(ctx.role);
  return features.canEditSpec && ctx.specState === 'DRAFT';
}

/**
 * Can user freeze the spec (create immutable snapshot)?
 * Only DESIGNER/ADMIN, only in DRAFT state.
 */
export function canFreeze(ctx: PermissionContext): boolean {
  if (ctx.specState !== 'DRAFT') return false;
  const features = getRoleFeatures(ctx.role);
  return features.canEditSpec;
}

/**
 * Can user run validation/gate check?
 * DESIGNER can validate anytime, FACTORY can re-verify.
 */
export function canValidate(ctx: PermissionContext): boolean {
  const features = getRoleFeatures(ctx.role);
  return features.canRunValidation;
}

/**
 * Can user initiate release?
 * - Role: DESIGNER or ADMIN
 * - State: FROZEN (not DRAFT, not already RELEASED)
 * - Verify: PASS (validation must pass)
 */
export function canRelease(ctx: PermissionContext): boolean {
  if (ctx.specState !== 'FROZEN') return false;
  if (ctx.verifyStatus !== 'PASS') return false;

  const features = getRoleFeatures(ctx.role);
  return features.canInitiateRelease;
}

/**
 * Can user export to manufacturing (CNC, DXF, etc.)?
 * - Role: FACTORY or ADMIN only
 * - State: RELEASED (must be fully released)
 * - Verify: PASS (must pass verification)
 *
 * This is the key gate: DESIGNER cannot export.
 */
export function canExport(ctx: PermissionContext): boolean {
  // Must be RELEASED
  if (ctx.specState !== 'RELEASED') return false;

  // Must pass verification
  if (ctx.verifyStatus !== 'PASS') return false;

  // Only FACTORY or ADMIN can export
  const features = getRoleFeatures(ctx.role);
  return features.canExportToMachine;
}

/**
 * Can user view the packet (read-only JSON)?
 * Almost everyone can view, but content varies.
 */
export function canViewPacket(ctx: PermissionContext): boolean {
  const features = getRoleFeatures(ctx.role);
  return features.canViewPacket;
}

/**
 * Can user view finance/cost breakdown?
 * FINANCE, DESIGNER (own projects), ADMIN
 */
export function canViewFinance(ctx: PermissionContext): boolean {
  const features = getRoleFeatures(ctx.role);
  return features.canViewFinance || features.canEditSpec; // Designer sees cost of own spec
}

/**
 * Can user unfreeze (revert to DRAFT)?
 * Only in FROZEN state, only DESIGNER/ADMIN.
 */
export function canUnfreeze(ctx: PermissionContext): boolean {
  if (ctx.specState !== 'FROZEN') return false;
  const features = getRoleFeatures(ctx.role);
  return features.canEditSpec;
}

/**
 * Can user override a gate (waive, admin override)?
 * Only ADMIN, and only in non-production or with special flag.
 */
export function canOverrideGate(ctx: PermissionContext): boolean {
  const features = getRoleFeatures(ctx.role);
  return features.canOverrideGates;
}

// ============================================================================
// Helper: Get All Permission States
// ============================================================================

export interface PermissionState {
  canEdit: boolean;
  canFreeze: boolean;
  canUnfreeze: boolean;
  canValidate: boolean;
  canRelease: boolean;
  canExport: boolean;
  canViewPacket: boolean;
  canViewFinance: boolean;
  canOverrideGate: boolean;
}

/**
 * Get all permissions for current context.
 */
export function getPermissions(ctx: PermissionContext): PermissionState {
  return {
    canEdit: canEdit(ctx),
    canFreeze: canFreeze(ctx),
    canUnfreeze: canUnfreeze(ctx),
    canValidate: canValidate(ctx),
    canRelease: canRelease(ctx),
    canExport: canExport(ctx),
    canViewPacket: canViewPacket(ctx),
    canViewFinance: canViewFinance(ctx),
    canOverrideGate: canOverrideGate(ctx),
  };
}

// ============================================================================
// Shorthand: Current Role Permissions
// ============================================================================

/**
 * Quick check: can current role export?
 * Use when you don't have full context.
 */
export function canCurrentRoleExport(): boolean {
  const features = getRoleFeatures(getCurrentRole());
  return features.canExportToMachine;
}

/**
 * Quick check: is override UI allowed?
 * Hidden in production unless ADMIN.
 */
export function isOverrideUIAllowed(): boolean {
  // In production, only ADMIN can see override UI
  if (process.env.NODE_ENV === 'production') {
    return isAdmin();
  }
  // In development, show for ADMIN
  return isAdmin();
}

/**
 * Quick check: is dev mode (show all debug UI)?
 */
export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

// ============================================================================
// Blocker Reasons
// ============================================================================

export interface PermissionBlocker {
  action: string;
  reason: string;
  requirement: string;
}

/**
 * Get blockers for why an action is not allowed.
 */
export function getBlockers(ctx: PermissionContext): PermissionBlocker[] {
  const blockers: PermissionBlocker[] = [];

  // Export blockers
  if (ctx.specState !== 'RELEASED') {
    blockers.push({
      action: 'export',
      reason: `Spec is ${ctx.specState}, not RELEASED`,
      requirement: 'Spec must be RELEASED to export',
    });
  }

  if (ctx.verifyStatus !== 'PASS') {
    blockers.push({
      action: 'export',
      reason: `Verification is ${ctx.verifyStatus}`,
      requirement: 'Verification must PASS to export',
    });
  }

  const features = getRoleFeatures(ctx.role);
  if (!features.canExportToMachine) {
    blockers.push({
      action: 'export',
      reason: `Role ${ctx.role} cannot export`,
      requirement: 'Only FACTORY or ADMIN can export to machines',
    });
  }

  // Release blockers
  if (ctx.specState === 'DRAFT') {
    blockers.push({
      action: 'release',
      reason: 'Spec is still DRAFT',
      requirement: 'Freeze spec before releasing',
    });
  }

  if (ctx.specState === 'RELEASED') {
    blockers.push({
      action: 'release',
      reason: 'Spec is already RELEASED',
      requirement: 'Cannot re-release',
    });
  }

  if (ctx.verifyStatus !== 'PASS' && ctx.specState === 'FROZEN') {
    blockers.push({
      action: 'release',
      reason: `Verification is ${ctx.verifyStatus}`,
      requirement: 'Verification must PASS to release',
    });
  }

  return blockers;
}
