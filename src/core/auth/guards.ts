/**
 * guards.ts - Route Guards for Role-Based Access
 *
 * React components for protecting routes based on user roles.
 *
 * @version 0.12.3
 */

import React from 'react';
import { hasAnyRole, type Role } from './roles';

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
  if (hasAnyRole(allow)) {
    return React.createElement(React.Fragment, null, children);
  }
  return React.createElement(React.Fragment, null, fallback);
}
