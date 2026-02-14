/**
 * roles.ts - Role Definitions
 *
 * Priority 0: Role-based access control for MONOLITH
 *
 * Roles map to Swimlane actors:
 * - DESIGNER: Creates specs, runs validation, initiates release
 * - FACTORY: Receives released specs, exports to CNC
 * - INSTALLER: Views installation guides (future)
 * - FINANCE: Views cost breakdowns, handles deposits (future)
 * - ADMIN: Full access, can override gates
 */

// ============================================================================
// Role Types
// ============================================================================

export type Role = 'DESIGNER' | 'FACTORY' | 'INSTALLER' | 'FINANCE' | 'ADMIN';

export const ROLES: Role[] = ['DESIGNER', 'FACTORY', 'INSTALLER', 'FINANCE', 'ADMIN'];

// ============================================================================
// Role Metadata
// ============================================================================

export interface RoleInfo {
  id: Role;
  label: string;
  description: string;
  color: string;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  DESIGNER: {
    id: 'DESIGNER',
    label: 'Designer',
    description: 'Creates and edits cabinet specs, runs validation, initiates release',
    color: '#8b5cf6', // Purple
  },
  FACTORY: {
    id: 'FACTORY',
    label: 'Factory',
    description: 'Receives released specs, verifies, exports to CNC machines',
    color: '#22c55e', // Green
  },
  INSTALLER: {
    id: 'INSTALLER',
    label: 'Installer',
    description: 'Views installation guides and assembly instructions',
    color: '#3b82f6', // Blue
  },
  FINANCE: {
    id: 'FINANCE',
    label: 'Finance',
    description: 'Views cost breakdowns, handles deposits and invoicing',
    color: '#f59e0b', // Amber
  },
  ADMIN: {
    id: 'ADMIN',
    label: 'Admin',
    description: 'Full system access, can override gates and manage keys',
    color: '#ef4444', // Red
  },
};

// ============================================================================
// Role Storage (localStorage for MVP)
// ============================================================================

const ROLE_STORAGE_KEY = 'monolith.user.role';

/**
 * Get current user role from storage.
 * Defaults to DESIGNER for development.
 */
export function getCurrentRole(): Role {
  if (typeof window === 'undefined') return 'DESIGNER';

  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  if (stored && ROLES.includes(stored as Role)) {
    return stored as Role;
  }
  return 'DESIGNER';
}

/**
 * Set current user role.
 * In production, this would come from auth system.
 */
export function setCurrentRole(role: Role): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROLE_STORAGE_KEY, role);
}

/**
 * Check if current role is in allowed list.
 */
export function hasRole(allowed: Role[]): boolean {
  const current = getCurrentRole();
  return allowed.includes(current);
}

/**
 * Check if current role is Admin.
 */
export function isAdmin(): boolean {
  return getCurrentRole() === 'ADMIN';
}

// ============================================================================
// Role-Based Feature Flags
// ============================================================================

/**
 * Features available per role.
 */
export interface RoleFeatures {
  canAccessWorkspace: boolean;
  canEditSpec: boolean;
  canRunValidation: boolean;
  canInitiateRelease: boolean;
  canViewPacket: boolean;
  canExportToMachine: boolean;
  canViewFinance: boolean;
  canOverrideGates: boolean;
  canManageKeys: boolean;
}

export function getRoleFeatures(role: Role): RoleFeatures {
  switch (role) {
    case 'DESIGNER':
      return {
        canAccessWorkspace: true,
        canEditSpec: true,
        canRunValidation: true,
        canInitiateRelease: true,
        canViewPacket: true,
        canExportToMachine: false, // ← Designer cannot export
        canViewFinance: false,
        canOverrideGates: false,
        canManageKeys: false,
      };

    case 'FACTORY':
      return {
        canAccessWorkspace: false, // Factory uses separate app
        canEditSpec: false,
        canRunValidation: true, // Re-verify on receive
        canInitiateRelease: false,
        canViewPacket: true,
        canExportToMachine: true, // ← Factory CAN export
        canViewFinance: false,
        canOverrideGates: false,
        canManageKeys: false,
      };

    case 'INSTALLER':
      return {
        canAccessWorkspace: false,
        canEditSpec: false,
        canRunValidation: false,
        canInitiateRelease: false,
        canViewPacket: true, // Read-only
        canExportToMachine: false,
        canViewFinance: false,
        canOverrideGates: false,
        canManageKeys: false,
      };

    case 'FINANCE':
      return {
        canAccessWorkspace: false,
        canEditSpec: false,
        canRunValidation: false,
        canInitiateRelease: false,
        canViewPacket: true,
        canExportToMachine: false,
        canViewFinance: true,
        canOverrideGates: false,
        canManageKeys: false,
      };

    case 'ADMIN':
      return {
        canAccessWorkspace: true,
        canEditSpec: true,
        canRunValidation: true,
        canInitiateRelease: true,
        canViewPacket: true,
        canExportToMachine: true,
        canViewFinance: true,
        canOverrideGates: true,
        canManageKeys: true,
      };
  }
}

/**
 * Get features for current role.
 */
export function getCurrentRoleFeatures(): RoleFeatures {
  return getRoleFeatures(getCurrentRole());
}
