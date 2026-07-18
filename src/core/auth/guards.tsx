/**
 * guards.tsx - React Guard Components
 *
 * Priority 0: Role and state-based UI guards
 *
 * Use these to wrap UI elements that should only be visible/accessible
 * to certain roles or in certain states.
 */

import React, { useState, type ReactNode } from 'react';
import { type Role, getCurrentRole, hasRole, ROLE_INFO } from './roles';
import { useRoleStore } from './useRoleStore';
import { RoleGateDialog } from '../../components/ui/RoleGateDialog';
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
  /** Optional fallback if unauthorized (overrides the RoleGateDialog default) */
  fallback?: ReactNode;
  /** If true, completely hide (no fallback, no dialog) for inline affordances. Default: false */
  hide?: boolean;
}

/**
 * S18 L7 Slice 3: full-screen fallback for role-gated routes.
 * No more silent bounce — explain which roles the page is for and how to
 * proceed (switch presentation role in the AppShell, or contact admin).
 */
function RoleGateFallback({ allow }: { allow: Role[] }): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(true);
  const roleLabels = allow.map((r) => ROLE_INFO[r].label).join(' / ');
  const message = `หน้านี้สำหรับ ${roleLabels} — สลับ role หรือติดต่อ admin`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔒</div>
        <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px', lineHeight: 1.6 }}>
          {message}
        </p>
        <a href="/" style={{ color: '#4ade80', fontSize: '13px', textDecoration: 'none' }}>
          ← กลับหน้าหลัก
        </a>
      </div>
      <RoleGateDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        requiredRoles={allow}
        title="สลับ role เพื่อเข้าหน้านี้"
        description={message}
      />
    </div>
  );
}

/**
 * Guard that only renders children if current role is in allowed list.
 *
 * Reactive: subscribes to useRoleStore, so switching the presentation role in
 * the AppShell re-renders the guard immediately (S18 L7 Slice 2).
 *
 * Unauthorized behavior (S18 L7 Slice 3 — no silent bounce):
 * - explicit `fallback` prop → render it
 * - `hide` → render nothing (for inline buttons/menus)
 * - default → RoleGateFallback with RoleGateDialog explaining required roles
 *
 * @example
 * <RequireRole allow={['FACTORY', 'ADMIN']}>
 *   <ExportButton />
 * </RequireRole>
 */
export function RequireRole({
  allow,
  children,
  fallback,
  hide = false,
}: RequireRoleProps): React.ReactElement | null {
  const currentRole = useRoleStore((s) => s.role);
  const isAllowed = allow.includes(currentRole);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  if (hide) {
    return null;
  }

  return <RoleGateFallback allow={allow} />;
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
