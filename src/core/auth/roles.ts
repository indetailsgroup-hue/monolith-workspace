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
 * - AI_REVIEWER: Reviews Vision-to-BOQ evidence + BOQ drafts (VS-01 pipeline) [AB-AUTH-01 fix]
 */

import { readRaw, writeRaw } from '../persistence/unsafeStorage';

// ============================================================================
// Role Types
// ============================================================================

export type Role = 'DESIGNER' | 'FACTORY' | 'INSTALLER' | 'FINANCE' | 'ADMIN' | 'AI_REVIEWER';

export const ROLES: Role[] = ['DESIGNER', 'FACTORY', 'INSTALLER', 'FINANCE', 'ADMIN', 'AI_REVIEWER'];

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
  // AB-AUTH-01 fix: AI Reviewer role for VS-01 Vision-to-BOQ pipeline
  AI_REVIEWER: {
    id: 'AI_REVIEWER',
    label: 'AI Reviewer',
    description: 'Reviews AI-generated evidence drafts and BOQ drafts (VS-01 pipeline)',
    color: '#0ea5e9', // Sky blue — distinct from other roles
  },
};

// ============================================================================
// Presentation Role Storage (localStorage for MVP; never server authority)
// ============================================================================

const ROLE_STORAGE_KEY = 'monolith.user.role';

/**
 * Get the local presentation role used to hide/show UI affordances.
 * Defaults to DESIGNER for development. Server authorization never consumes it.
 *
 * ⚠️ AB-AUTH-01 WARNING: localStorage role is PRESENTATION-ONLY.
 * It must NEVER be used as server authority for VS-01 API calls.
 * VS-01 routes use Supabase JWT + RLS via factory-api/index.ts.
 * See: supabase/functions/factory-api/index.ts — VS_EVIDENCE_INTAKE_CAPABILITIES
 */
export function getCurrentRole(): Role {
  if (typeof window === 'undefined') return 'DESIGNER';

  const stored = readRaw(ROLE_STORAGE_KEY);
  if (stored && ROLES.includes(stored as Role)) {
    return stored as Role;
  }
  return 'DESIGNER';
}

/**
 * Set the local presentation role. This cannot grant server permissions.
 */
export function setCurrentRole(role: Role): void {
  if (typeof window === 'undefined') return;
  writeRaw(ROLE_STORAGE_KEY, role);
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
  // AB-AUTH-01 fix: VS-01 Vision-to-BOQ pipeline review permission
  canReviewVSEvidence: boolean;
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
        canReviewVSEvidence: true, // Designer can review evidence drafts
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
        canReviewVSEvidence: true, // Factory can review BOQ drafts
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
        canReviewVSEvidence: false,
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
        canReviewVSEvidence: false,
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
        canReviewVSEvidence: true, // Admin has full access
      };

    case 'AI_REVIEWER':
      return {
        canAccessWorkspace: false,
        canEditSpec: false,
        canRunValidation: false,
        canInitiateRelease: false,
        canViewPacket: true, // Read-only — view evidence + BOQ drafts
        canExportToMachine: false,
        canViewFinance: false,
        canOverrideGates: false,
        canManageKeys: false,
        canReviewVSEvidence: true, // Primary capability for VS-01
      };
  }
}

/**
 * Get features for current role.
 */
export function getCurrentRoleFeatures(): RoleFeatures {
  return getRoleFeatures(getCurrentRole());
}
