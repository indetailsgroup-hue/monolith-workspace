/**
 * roles.ts - Role-Based Access Control
 *
 * Defines user roles and role information for IIMOS.
 *
 * @version 0.12.3
 */

// ============================================================================
// Role Types
// ============================================================================

/**
 * User roles in the system.
 */
export type Role = 'DESIGNER' | 'FACTORY' | 'FINANCE' | 'ADMIN';

/**
 * Role information for display.
 */
export interface RoleInfo {
  /** Role label */
  label: string;
  /** Role description */
  description: string;
  /** Display color */
  color: string;
}

/**
 * Role information lookup table.
 */
export const ROLE_INFO: Record<Role, RoleInfo> = {
  DESIGNER: {
    label: 'Designer',
    description: 'Can design and modify cabinets',
    color: '#8b5cf6',
  },
  FACTORY: {
    label: 'Factory',
    description: 'Can verify and produce jobs',
    color: '#22c55e',
  },
  FINANCE: {
    label: 'Finance',
    description: 'Can view financial data',
    color: '#3b82f6',
  },
  ADMIN: {
    label: 'Admin',
    description: 'Full system access',
    color: '#f59e0b',
  },
};

// ============================================================================
// Role Helpers
// ============================================================================

/** Current user role (stored in localStorage) */
let _currentRole: Role = 'DESIGNER';

/**
 * Get the current user role.
 */
export function getCurrentRole(): Role {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('iimos:role');
    if (stored && isValidRole(stored)) {
      _currentRole = stored;
    }
  }
  return _currentRole;
}

/**
 * Set the current user role.
 */
export function setCurrentRole(role: Role): void {
  _currentRole = role;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('iimos:role', role);
  }
}

/**
 * Check if a string is a valid role.
 */
export function isValidRole(value: string): value is Role {
  return ['DESIGNER', 'FACTORY', 'FINANCE', 'ADMIN'].includes(value);
}

/**
 * Check if user has a specific role or any of the specified roles.
 */
export function hasRole(role: Role | Role[]): boolean {
  const current = getCurrentRole();
  // ADMIN has all roles
  if (current === 'ADMIN') return true;
  if (Array.isArray(role)) {
    return role.includes(current);
  }
  return current === role;
}

/**
 * Check if user has any of the specified roles.
 */
export function hasAnyRole(roles: Role[]): boolean {
  return roles.some((r) => hasRole(r));
}
