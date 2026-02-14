/**
 * guards.tsx - React Guard Components
 *
 * Priority 0: Role and state-based UI guards
 *
 * Use these to wrap UI elements that should only be visible/accessible
 * to certain roles or in certain states.
 */

import React, { type ReactNode } from 'react';
import { type Role, getCurrentRole, hasRole, ROLE_INFO } from './roles';
import {
  type SpecState,
  type VerifyStatus,
  type PermissionContext,
  buildPermissionContext,
  canExport,
  canRelease,
  canEdit,
  canValidate,
  canOverrideGate,
  isDevMode,
} from './permissions';

// ============================================================================
// RequireRole - Hide content from unauthorized roles
// ============================================================================

export interface RequireRoleProps {
  /** Roles that can see this content */
  allow: Role[];
  /** Content to render if authorized */
  children: ReactNode;
  /** Optional fallback if unauthorized */
  fallback?: ReactNode;
  /** If true, completely hide (no fallback). Default: true */
  hide?: boolean;
}

/**
 * Guard that only renders children if current role is in allowed list.
 *
 * @example
 * <RequireRole allow={['FACTORY', 'ADMIN']}>
 *   <ExportButton />
 * </RequireRole>
 */
export function RequireRole({
  allow,
  children,
  fallback = null,
  hide = true,
}: RequireRoleProps): React.ReactElement | null {
  const currentRole = getCurrentRole();
  const isAllowed = allow.includes(currentRole);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (hide) {
    return null;
  }

  return <>{fallback}</>;
}

// ============================================================================
// RequireSpecState - Hide content based on spec state
// ============================================================================

export interface RequireSpecStateProps {
  /** Current spec state */
  state: SpecState;
  /** Minimum state required (DRAFT < FROZEN < RELEASED) */
  min?: SpecState;
  /** Maximum state allowed */
  max?: SpecState;
  /** Exact state required (overrides min/max) */
  exact?: SpecState;
  /** Content to render if state matches */
  children: ReactNode;
  /** Optional fallback */
  fallback?: ReactNode;
}

const STATE_ORDER: Record<SpecState, number> = {
  DRAFT: 0,
  FROZEN: 1,
  RELEASED: 2,
};

/**
 * Guard that only renders children if spec state matches criteria.
 *
 * @example
 * <RequireSpecState state={specState} min="RELEASED">
 *   <ExportPanel />
 * </RequireSpecState>
 */
export function RequireSpecState({
  state,
  min,
  max,
  exact,
  children,
  fallback = null,
}: RequireSpecStateProps): React.ReactElement | null {
  const currentOrder = STATE_ORDER[state];

  // Exact match
  if (exact !== undefined) {
    if (state === exact) {
      return <>{children}</>;
    }
    return <>{fallback}</>;
  }

  // Range check
  const minOrder = min ? STATE_ORDER[min] : 0;
  const maxOrder = max ? STATE_ORDER[max] : 2;

  if (currentOrder >= minOrder && currentOrder <= maxOrder) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

// ============================================================================
// RequirePermission - Combined role + state check
// ============================================================================

export interface RequirePermissionProps {
  /** Permission to check */
  permission: 'export' | 'release' | 'edit' | 'validate' | 'override';
  /** Current spec state */
  specState: SpecState;
  /** Current verify status */
  verifyStatus: VerifyStatus;
  /** Content to render if permitted */
  children: ReactNode;
  /** Optional fallback */
  fallback?: ReactNode;
}

/**
 * Guard that checks combined role + state permissions.
 *
 * @example
 * <RequirePermission permission="export" specState={state} verifyStatus={verify}>
 *   <ExportButton />
 * </RequirePermission>
 */
export function RequirePermission({
  permission,
  specState,
  verifyStatus,
  children,
  fallback = null,
}: RequirePermissionProps): React.ReactElement | null {
  const ctx = buildPermissionContext(specState, verifyStatus);

  let isAllowed = false;

  switch (permission) {
    case 'export':
      isAllowed = canExport(ctx);
      break;
    case 'release':
      isAllowed = canRelease(ctx);
      break;
    case 'edit':
      isAllowed = canEdit(ctx);
      break;
    case 'validate':
      isAllowed = canValidate(ctx);
      break;
    case 'override':
      isAllowed = canOverrideGate(ctx);
      break;
  }

  if (isAllowed) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

// ============================================================================
// DevOnly - Only show in development
// ============================================================================

export interface DevOnlyProps {
  children: ReactNode;
  /** Also require ADMIN role. Default: false */
  requireAdmin?: boolean;
}

/**
 * Guard that only renders in development mode.
 *
 * @example
 * <DevOnly>
 *   <DebugPanel />
 * </DevOnly>
 */
export function DevOnly({
  children,
  requireAdmin = false,
}: DevOnlyProps): React.ReactElement | null {
  if (!isDevMode()) {
    return null;
  }

  if (requireAdmin && getCurrentRole() !== 'ADMIN') {
    return null;
  }

  return <>{children}</>;
}

// ============================================================================
// AdminOnly - Only show for ADMIN role
// ============================================================================

export interface AdminOnlyProps {
  children: ReactNode;
  /** In production, hide even from admin? Default: false */
  hideInProduction?: boolean;
}

/**
 * Guard that only renders for ADMIN role.
 *
 * @example
 * <AdminOnly>
 *   <OverrideButton />
 * </AdminOnly>
 */
export function AdminOnly({
  children,
  hideInProduction = false,
}: AdminOnlyProps): React.ReactElement | null {
  if (hideInProduction && !isDevMode()) {
    return null;
  }

  if (getCurrentRole() !== 'ADMIN') {
    return null;
  }

  return <>{children}</>;
}

// ============================================================================
// FactoryOnly - Only show for FACTORY role (or ADMIN)
// ============================================================================

export interface FactoryOnlyProps {
  children: ReactNode;
}

/**
 * Guard that only renders for FACTORY or ADMIN role.
 * Use this to wrap export functionality.
 *
 * @example
 * <FactoryOnly>
 *   <ExportPanel />
 * </FactoryOnly>
 */
export function FactoryOnly({ children }: FactoryOnlyProps): React.ReactElement | null {
  const role = getCurrentRole();
  if (role === 'FACTORY' || role === 'ADMIN') {
    return <>{children}</>;
  }
  return null;
}

// ============================================================================
// RoleBadge - Display current role
// ============================================================================

export interface RoleBadgeProps {
  /** Override role to display */
  role?: Role;
  /** Show full label or just icon. Default: 'full' */
  variant?: 'full' | 'compact';
}

/**
 * Display badge showing current (or specified) role.
 */
export function RoleBadge({
  role,
  variant = 'full',
}: RoleBadgeProps): React.ReactElement {
  const displayRole = role ?? getCurrentRole();
  const info = ROLE_INFO[displayRole];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: variant === 'full' ? '4px 8px' : '2px 6px',
        backgroundColor: `${info.color}20`,
        border: `1px solid ${info.color}40`,
        borderRadius: 4,
        fontSize: variant === 'full' ? 12 : 10,
        fontWeight: 600,
        color: info.color,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {variant === 'full' ? info.label : info.label.slice(0, 3)}
    </span>
  );
}

// ============================================================================
// Export all
// ============================================================================

export {
  getCurrentRole,
  hasRole,
  type Role,
  type SpecState,
  type VerifyStatus,
};
