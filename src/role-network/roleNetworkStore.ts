// =============================================================================
// roleNetworkStore.ts — v18.0 Role Network View Zustand store
// Plan gate: ENTERPRISE only (canAccessRoleNetwork)
// Actions: fetchNetwork, createRole, updateRole, deleteRole,
//          addRelationship, removeRelationship,
//          assignEmployeeRole, unassignEmployeeRole,
//          + UI helpers
// =============================================================================

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  type RnvRole,
  type RnvRoleRelationship,
  type RnvEmployeeRole,
  type RnvRoleNetworkRow,
  type RnvRoleRelationshipRow,
  type RnvEmployeeRoleRow,
  type RnvFilters,
  type CreateRnvRolePayload,
  type UpdateRnvRolePayload,
  type AddRnvRelationshipPayload,
  type AssignRnvEmployeeRolePayload,
  DEFAULT_RNV_FILTERS,
  canAccessRoleNetwork,
  RoleNetworkPlanGateError,
  mapRnvRoleRow,
  mapRnvRelationshipRow,
  mapRnvEmployeeRoleRow,
} from './roleNetworkTypes';

// ─── State ───────────────────────────────────────────────────────────────────

interface RoleNetworkState {
  /** All roles for this org (with network stats from view). */
  roles: RnvRole[];
  /** All cross-functional relationships. */
  relationships: RnvRoleRelationship[];
  /** All employee-role assignments. */
  employeeRoles: RnvEmployeeRole[];
  /** Currently selected role ID in the network diagram. */
  selectedRoleId: string | null;
  /** True while roles / relationships are loading. */
  isLoading: boolean;
  /** True while a relationship mutation is in flight. */
  isRelationshipLoading: boolean;
  /** Active display filters. */
  filters: RnvFilters;
  /** Last error message, or null. */
  error: string | null;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

interface RoleNetworkActions {
  /**
   * Fetch roles (via view), relationships, and employee-role assignments
   * for the org in parallel. Throws RoleNetworkPlanGateError if plan != ENTERPRISE.
   */
  fetchNetwork: (orgId: string, orgPlan: OrgPlan) => Promise<void>;

  /** Create a new role. */
  createRole: (
    orgId: string,
    orgPlan: OrgPlan,
    payload: CreateRnvRolePayload
  ) => Promise<void>;

  /** Update role metadata. */
  updateRole: (
    orgId: string,
    orgPlan: OrgPlan,
    roleId: string,
    payload: UpdateRnvRolePayload
  ) => Promise<void>;

  /** Delete a role (cascades relationships + employee_roles via DB). */
  deleteRole: (orgId: string, orgPlan: OrgPlan, roleId: string) => Promise<void>;

  /** Add a cross-functional relationship between two roles. */
  addRelationship: (
    orgId: string,
    orgPlan: OrgPlan,
    payload: AddRnvRelationshipPayload
  ) => Promise<void>;

  /** Remove a cross-functional relationship by ID. */
  removeRelationship: (orgId: string, orgPlan: OrgPlan, relId: string) => Promise<void>;

  /** Assign an employee to a role. */
  assignEmployeeRole: (
    orgId: string,
    orgPlan: OrgPlan,
    payload: AssignRnvEmployeeRolePayload
  ) => Promise<void>;

  /** Remove an employee-role assignment by ID. */
  unassignEmployeeRole: (
    orgId: string,
    orgPlan: OrgPlan,
    assignmentId: string
  ) => Promise<void>;

  // ─── UI helpers ────────────────────────────────────────────────────────

  /** Select a role in the network diagram (pass null to deselect). */
  selectRole: (roleId: string | null) => void;

  /** Merge partial filter updates. */
  setFilters: (filters: Partial<RnvFilters>) => void;

  /** Clear the last error. */
  clearError: () => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useRoleNetworkStore = create<RoleNetworkState & RoleNetworkActions>(
  (set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    roles: [],
    relationships: [],
    employeeRoles: [],
    selectedRoleId: null,
    isLoading: false,
    isRelationshipLoading: false,
    filters: { ...DEFAULT_RNV_FILTERS },
    error: null,

    // ── fetchNetwork ───────────────────────────────────────────────────────
    fetchNetwork: async (orgId, orgPlan) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ isLoading: true, error: null });
      try {
        const [rolesRes, relsRes, erRes] = await Promise.all([
          supabase
            .from('rnv_role_network_v')
            .select('*')
            .eq('org_id', orgId)
            .order('seniority', { ascending: false })
            .order('name', { ascending: true }),
          supabase
            .from('rnv_role_relationships')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: true }),
          supabase
            .from('rnv_employee_roles')
            .select('*')
            .eq('org_id', orgId)
            .is('ended_at', null),
        ]);

        if (rolesRes.error) throw rolesRes.error;
        if (relsRes.error) throw relsRes.error;
        if (erRes.error) throw erRes.error;

        const relationships = (relsRes.data as RnvRoleRelationshipRow[]).map(
          mapRnvRelationshipRow
        );
        const employeeRoles = (erRes.data as RnvEmployeeRoleRow[]).map(
          mapRnvEmployeeRoleRow
        );

        // Enrich roles with related records
        const roles = (rolesRes.data as RnvRoleNetworkRow[]).map(row => {
          const role = mapRnvRoleRow(row);
          role.relationships = relationships.filter(
            r => r.from_role_id === role.id || r.to_role_id === role.id
          );
          role.employeeRoles = employeeRoles.filter(er => er.role_id === role.id);
          return role;
        });

        set({ roles, relationships, employeeRoles, isLoading: false });
      } catch (err: unknown) {
        set({ isLoading: false, error: (err as Error).message });
      }
    },

    // ── createRole ─────────────────────────────────────────────────────────
    createRole: async (orgId, orgPlan, payload) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('rnv_roles')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        await get().fetchNetwork(orgId, orgPlan);
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── updateRole ─────────────────────────────────────────────────────────
    updateRole: async (orgId, orgPlan, roleId, payload) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('rnv_roles')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', roleId)
          .eq('org_id', orgId);
        if (error) throw error;
        await get().fetchNetwork(orgId, orgPlan);
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── deleteRole ─────────────────────────────────────────────────────────
    deleteRole: async (orgId, orgPlan, roleId) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('rnv_roles')
          .delete()
          .eq('id', roleId)
          .eq('org_id', orgId);
        if (error) throw error;
        set(s => ({
          roles: s.roles.filter(r => r.id !== roleId),
          relationships: s.relationships.filter(
            r => r.from_role_id !== roleId && r.to_role_id !== roleId
          ),
          employeeRoles: s.employeeRoles.filter(er => er.role_id !== roleId),
          selectedRoleId:
            s.selectedRoleId === roleId ? null : s.selectedRoleId,
        }));
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── addRelationship ────────────────────────────────────────────────────
    addRelationship: async (orgId, orgPlan, payload) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ isRelationshipLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('rnv_role_relationships')
          .insert({ ...payload, org_id: orgId })
          .select()
          .single();
        if (error) throw error;
        const newRel = mapRnvRelationshipRow(data as RnvRoleRelationshipRow);
        set(s => ({
          relationships: [...s.relationships, newRel],
          isRelationshipLoading: false,
        }));
      } catch (err: unknown) {
        set({ isRelationshipLoading: false, error: (err as Error).message });
      }
    },

    // ── removeRelationship ─────────────────────────────────────────────────
    removeRelationship: async (orgId, orgPlan, relId) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('rnv_role_relationships')
          .delete()
          .eq('id', relId)
          .eq('org_id', orgId);
        if (error) throw error;
        set(s => ({
          relationships: s.relationships.filter(r => r.id !== relId),
        }));
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── assignEmployeeRole ─────────────────────────────────────────────────
    assignEmployeeRole: async (orgId, orgPlan, payload) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { data, error } = await supabase
          .from('rnv_employee_roles')
          .insert({ ...payload, org_id: orgId })
          .select()
          .single();
        if (error) throw error;
        const newEr = mapRnvEmployeeRoleRow(data as RnvEmployeeRoleRow);
        set(s => ({ employeeRoles: [...s.employeeRoles, newEr] }));
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── unassignEmployeeRole ───────────────────────────────────────────────
    unassignEmployeeRole: async (orgId, orgPlan, assignmentId) => {
      if (!canAccessRoleNetwork(orgPlan)) throw new RoleNetworkPlanGateError(orgPlan);
      set({ error: null });
      try {
        const { error } = await supabase
          .from('rnv_employee_roles')
          .delete()
          .eq('id', assignmentId)
          .eq('org_id', orgId);
        if (error) throw error;
        set(s => ({
          employeeRoles: s.employeeRoles.filter(er => er.id !== assignmentId),
        }));
      } catch (err: unknown) {
        set({ error: (err as Error).message });
      }
    },

    // ── UI helpers ─────────────────────────────────────────────────────────
    selectRole: (roleId) => set({ selectedRoleId: roleId }),

    setFilters: (filters) =>
      set(s => ({ filters: { ...s.filters, ...filters } })),

    clearError: () => set({ error: null }),
  })
);
