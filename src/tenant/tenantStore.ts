/**
 * tenant/tenantStore.ts — Zustand store for current tenant (organization) context
 *
 * Provides:
 * - Current org context for the logged-in user
 * - Org switching (for users in multiple orgs)
 * - Member & invitation management
 * - Plan feature gates
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Organization,
  OrgMember,
  OrgInvitation,
  OrgRole,
  OrgSettings,
  TenantContext,
  TenantPermissions,
  OrgPlan,
} from './types';
import { hasPermission, isOwnerOrAdmin, canAccessFeature, PLAN_LIMITS } from './types';

// ============================================================================
// Store Interface
// ============================================================================

interface TenantState {
  /** Current organization */
  currentOrg: Organization | null;
  /** Current member (logged-in user's membership in currentOrg) */
  currentMember: OrgMember | null;
  /** All orgs the user belongs to */
  userOrgs: Organization[];
  /** Members of the current org */
  members: OrgMember[];
  /** Pending invitations */
  invitations: OrgInvitation[];
  /** Loading state */
  isLoading: boolean;
}

interface TenantActions {
  /** Set the active organization */
  setCurrentOrg: (org: Organization, member: OrgMember) => void;
  /** Switch to a different org */
  switchOrg: (orgId: string) => void;
  /** Set all user's orgs */
  setUserOrgs: (orgs: Organization[]) => void;
  /** Get computed permissions for current member */
  getPermissions: () => TenantPermissions;
  /** Get full tenant context */
  getTenantContext: () => TenantContext | null;
  /** Check if a feature is available in current plan */
  hasFeature: (feature: string) => boolean;
  /** Check if current user has at least the given role */
  hasRole: (role: OrgRole) => boolean;
  /** Add a member to current org */
  addMember: (member: OrgMember) => void;
  /** Remove a member from current org */
  removeMember: (memberId: string) => void;
  /** Update a member's role */
  updateMemberRole: (memberId: string, newRole: OrgRole) => void;
  /** Set members list */
  setMembers: (members: OrgMember[]) => void;
  /** Create invitation */
  createInvitation: (invite: OrgInvitation) => void;
  /** Accept invitation */
  acceptInvitation: (inviteId: string) => void;
  /** Revoke invitation */
  revokeInvitation: (inviteId: string) => void;
  /** Set invitations */
  setInvitations: (invites: OrgInvitation[]) => void;
  /** Update org settings */
  updateSettings: (settings: Partial<OrgSettings>) => void;
  /** Update org plan (billing) */
  updatePlan: (plan: OrgPlan) => void;
  /** Clear tenant state (logout) */
  clear: () => void;
  /** Set loading */
  setLoading: (loading: boolean) => void;
}

type TenantStore = TenantState & TenantActions;

// ============================================================================
// Permission Computation
// ============================================================================

function computePermissions(member: OrgMember | null): TenantPermissions {
  if (!member) {
    return {
      canManageMembers: false,
      canManageBilling: false,
      canCreateJobs: false,
      canViewFinance: false,
      canManageSettings: false,
      canExportData: false,
    };
  }

  const isAdmin = isOwnerOrAdmin(member);

  return {
    canManageMembers: isAdmin,
    canManageBilling: member.role === 'OWNER',
    canCreateJobs: hasPermission(member, 'DESIGNER'),
    canViewFinance: member.role === 'FINANCE' || isAdmin,
    canManageSettings: isAdmin,
    canExportData: hasPermission(member, 'DESIGNER'),
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

const initialState: TenantState = {
  currentOrg: null,
  currentMember: null,
  userOrgs: [],
  members: [],
  invitations: [],
  isLoading: false,
};

export const useTenantStore = create<TenantStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentOrg: (org, member) => {
        set({ currentOrg: org, currentMember: member });
      },

      switchOrg: (orgId) => {
        const org = get().userOrgs.find((o) => o.orgId === orgId);
        if (org) {
          // In real app, would fetch member record for this org
          set({ currentOrg: org, members: [], invitations: [] });
        }
      },

      setUserOrgs: (orgs) => set({ userOrgs: orgs }),

      getPermissions: () => computePermissions(get().currentMember),

      getTenantContext: () => {
        const { currentOrg, currentMember } = get();
        if (!currentOrg || !currentMember) return null;
        return {
          org: currentOrg,
          currentMember,
          permissions: computePermissions(currentMember),
        };
      },

      hasFeature: (feature) => {
        const org = get().currentOrg;
        if (!org) return false;
        return canAccessFeature(org, feature);
      },

      hasRole: (role) => {
        const member = get().currentMember;
        if (!member) return false;
        return hasPermission(member, role);
      },

      addMember: (member) => {
        set((s) => ({ members: [...s.members, member] }));
      },

      removeMember: (memberId) => {
        set((s) => ({ members: s.members.filter((m) => m.memberId !== memberId) }));
      },

      updateMemberRole: (memberId, newRole) => {
        set((s) => ({
          members: s.members.map((m) =>
            m.memberId === memberId ? { ...m, role: newRole } : m
          ),
        }));
      },

      setMembers: (members) => set({ members }),

      createInvitation: (invite) => {
        set((s) => ({ invitations: [...s.invitations, invite] }));
      },

      acceptInvitation: (inviteId) => {
        set((s) => ({
          invitations: s.invitations.map((i) =>
            i.inviteId === inviteId
              ? { ...i, status: 'ACCEPTED' as const, acceptedAt: new Date().toISOString() }
              : i
          ),
        }));
      },

      revokeInvitation: (inviteId) => {
        set((s) => ({
          invitations: s.invitations.map((i) =>
            i.inviteId === inviteId ? { ...i, status: 'REVOKED' as const } : i
          ),
        }));
      },

      setInvitations: (invites) => set({ invitations: invites }),

      updateSettings: (settings) => {
        const org = get().currentOrg;
        if (!org) return;
        set({
          currentOrg: {
            ...org,
            settings: { ...org.settings, ...settings },
            updatedAt: new Date().toISOString(),
          },
        });
      },

      updatePlan: (plan) => {
        const org = get().currentOrg;
        if (!org) return;
        const limits = PLAN_LIMITS[plan];
        set({
          currentOrg: {
            ...org,
            plan,
            maxUsers: limits.maxUsers,
            maxJobsPerMonth: limits.maxJobsPerMonth,
            updatedAt: new Date().toISOString(),
          },
        });
      },

      clear: () => set(initialState),

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'monolith-tenant-store',
      partialize: (state) => ({
        currentOrg: state.currentOrg,
        currentMember: state.currentMember,
        userOrgs: state.userOrgs,
      }),
    }
  )
);
