/**
 * tenant/types.ts — Multi-Tenant Organization Types for MONOLITH
 *
 * MONOLITH is a multi-tenant SaaS platform (Manufacturing OS).
 * Each customer (e.g., DAPH Decor) is an Organization (tenant).
 * All data is scoped to an organization via org_id.
 *
 * Architecture:
 * - Organization = top-level tenant entity
 * - OrgMember = user membership within an org (with role)
 * - All business entities (jobs, quotations, invoices) carry org_id
 * - RLS policies enforce tenant isolation at database level
 */

// ============================================================================
// Organization (Tenant)
// ============================================================================

export type OrgPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';

export interface Organization {
  orgId: string;
  name: string;
  slug: string;              // URL-safe identifier (e.g., "daph-decor")
  plan: OrgPlan;
  status: OrgStatus;
  logoUrl?: string;
  primaryColor?: string;     // brand color for white-label
  maxUsers: number;
  maxJobsPerMonth: number;
  settings: OrgSettings;
  createdAt: string;         // ISO
  updatedAt: string;
  trialEndsAt?: string;      // ISO — if on trial
}

export interface OrgSettings {
  locale: string;            // e.g., "th-TH"
  currency: string;          // e.g., "THB"
  timezone: string;          // e.g., "Asia/Bangkok"
  enableCurvedPanels: boolean;
  enableNesting: boolean;
  enableDxfExport: boolean;
  quotationPrefix: string;   // e.g., "DAPH" → DAPH-2026-0001
  jobCodePrefix: string;     // e.g., "DAPH" → DAPH-2026-0001
}

// ============================================================================
// Organization Member
// ============================================================================

export type OrgRole = 'OWNER' | 'ADMIN' | 'DESIGNER' | 'FACTORY' | 'INSTALLER' | 'FINANCE' | 'VIEWER';

export const ORG_ROLE_HIERARCHY: Record<OrgRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  DESIGNER: 60,
  FACTORY: 60,
  INSTALLER: 40,
  FINANCE: 60,
  VIEWER: 10,
};

export interface OrgMember {
  memberId: string;
  orgId: string;
  userId: string;
  email: string;
  displayName: string;
  role: OrgRole;
  isActive: boolean;
  joinedAt: string;
  lastActiveAt?: string;
}

// ============================================================================
// Invitation
// ============================================================================

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface OrgInvitation {
  inviteId: string;
  orgId: string;
  email: string;
  role: OrgRole;
  status: InviteStatus;
  invitedBy: string;         // userId
  expiresAt: string;
  acceptedAt?: string;
  token: string;             // secure token for accepting
}

// ============================================================================
// Tenant Context (Runtime)
// ============================================================================

export interface TenantContext {
  org: Organization;
  currentMember: OrgMember;
  permissions: TenantPermissions;
}

export interface TenantPermissions {
  canManageMembers: boolean;
  canManageBilling: boolean;
  canCreateJobs: boolean;
  canViewFinance: boolean;
  canManageSettings: boolean;
  canExportData: boolean;
}

// ============================================================================
// Plan Limits
// ============================================================================

export const PLAN_LIMITS: Record<OrgPlan, { maxUsers: number; maxJobsPerMonth: number; features: string[] }> = {
  FREE: {
    maxUsers: 2,
    maxJobsPerMonth: 10,
    features: ['basic_design', 'manual_export'],
  },
  STARTER: {
    maxUsers: 5,
    maxJobsPerMonth: 50,
    features: ['basic_design', 'manual_export', 'nesting', 'quotations'],
  },
  PROFESSIONAL: {
    maxUsers: 20,
    maxJobsPerMonth: 200,
    features: ['basic_design', 'manual_export', 'nesting', 'quotations', 'curved_panels', 'dxf_export', 'analytics'],
  },
  ENTERPRISE: {
    maxUsers: 999,
    maxJobsPerMonth: 9999,
    features: ['basic_design', 'manual_export', 'nesting', 'quotations', 'curved_panels', 'dxf_export', 'analytics', 'api_access', 'sso', 'custom_branding'],
  },
};

// ============================================================================
// Helpers
// ============================================================================

export function hasPermission(member: OrgMember, requiredRole: OrgRole): boolean {
  return ORG_ROLE_HIERARCHY[member.role] >= ORG_ROLE_HIERARCHY[requiredRole];
}

export function isOwnerOrAdmin(member: OrgMember): boolean {
  return member.role === 'OWNER' || member.role === 'ADMIN';
}

export function canAccessFeature(org: Organization, feature: string): boolean {
  return PLAN_LIMITS[org.plan].features.includes(feature);
}

export function isTrialExpired(org: Organization): boolean {
  if (org.status !== 'TRIAL' || !org.trialEndsAt) return false;
  return new Date(org.trialEndsAt) < new Date();
}

export function generateOrgSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
