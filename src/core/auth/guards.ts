/**
 * guards.ts - Route Guards for Role-Based Access
 *
 * React components for protecting routes based on user roles.
 *
 * @version 0.12.3
 */

import React from 'react';
import { hasRole, getCurrentRole, ROLE_INFO, type Role } from './roles';

// ============================================================================
// RequireRole Component
// ============================================================================

interface RequireRoleProps {
  /** Roles that are allowed to access children */
  allow: Role[];
  /** Fallback to render if user lacks required role */
  fallback?: React.ReactNode;
  /** Children to render if user has required role */
  children: React.ReactNode;
}

/**
 * Route guard that restricts access based on user roles.
 *
 * Usage:
 * ```tsx
 * <RequireRole allow={['FACTORY', 'ADMIN']} fallback={<Navigate to="/" />}>
 *   <FactoryApp />
 * </RequireRole>
 * ```
 */
export function RequireRole({ allow, fallback = null, children }: RequireRoleProps): React.ReactElement {
  if (hasRole(allow)) {
    return React.createElement(React.Fragment, null, children);
  }
  return React.createElement(React.Fragment, null, fallback);
}

// ============================================================================
// RoleBadge Component
// ============================================================================

interface RoleBadgeProps {
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

  return React.createElement('span', {
    style: {
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
    },
  }, info.label);
}
