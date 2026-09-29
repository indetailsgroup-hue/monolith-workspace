// src/leadership-actions/leadershipActionStore.ts
// MONOLITH v18.0 — Leadership Action Tracker Zustand Store

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessLeadershipActions,
  LeadershipActionPlanGateError,
  mapLatActionRow,
  mapLatAssignmentRow,
  mapLatUpdateRow,
  mapLatSummaryRow,
  DEFAULT_LAT_FILTERS,
  type LatAction,
  type LatActionAssignment,
  type LatActionUpdate,
  type LatActionSummary,
  type LatFilters,
  type LatActionStatus,
  type CreateLatActionPayload,
  type UpdateLatActionPayload,
  type AddLatAssignmentPayload,
  type PostLatUpdatePayload,
} from './leadershipActionTypes';

// ─────────────────────────────────────────────────────────────
// State + Actions Interface
// ─────────────────────────────────────────────────────────────

interface LeadershipActionState {
  actions:            LatAction[];
  assignments:        LatActionAssignment[];
  updates:            LatActionUpdate[];
  summaries:          LatActionSummary[];
  selectedActionId:   string | null;
  isLoading:          boolean;
  isUpdateLoading:    boolean;
  filters:            LatFilters;
  error:              string | null;

  // 10 ENTERPRISE-gated actions
  fetchActions:      (orgId: string, orgPlan: OrgPlan) => Promise<void>;
  createAction:      (payload: CreateLatActionPayload, orgPlan: OrgPlan) => Promise<void>;
  updateAction:      (actionId: string, payload: UpdateLatActionPayload, orgPlan: OrgPlan) => Promise<void>;
  deleteAction:      (actionId: string, orgPlan: OrgPlan) => Promise<void>;
  addAssignment:     (payload: AddLatAssignmentPayload, orgPlan: OrgPlan) => Promise<void>;
  removeAssignment:  (assignmentId: string, orgPlan: OrgPlan) => Promise<void>;
  postUpdate:        (payload: PostLatUpdatePayload, orgPlan: OrgPlan) => Promise<void>;
  completeAction:    (actionId: string, reviewedBy: string, orgPlan: OrgPlan) => Promise<void>;
  cancelAction:      (actionId: string, orgPlan: OrgPlan) => Promise<void>;
  reassignOwner:     (actionId: string, newOwnerId: string, orgPlan: OrgPlan) => Promise<void>;

  // UI helpers
  selectAction: (actionId: string | null) => void;
  setFilters:   (filters: Partial<LatFilters>) => void;
  clearError:   () => void;
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useLeadershipActionStore = create<LeadershipActionState>((set, get) => ({
  actions:          [],
  assignments:      [],
  updates:          [],
  summaries:        [],
  selectedActionId: null,
  isLoading:        false,
  isUpdateLoading:  false,
  filters:          DEFAULT_LAT_FILTERS,
  error:            null,

  // ─── fetchActions ─────────────────────────────────────────
  // Parallel: actions + summaries
  fetchActions: async (orgId, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ isLoading: true, error: null });
    try {
      const [actionResult, summaryResult] = await Promise.all([
        supabase
          .from('lat_actions')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('lat_action_summary_v')
          .select('*')
          .eq('org_id', orgId),
      ]);

      const err = actionResult.error ?? summaryResult.error;
      if (err) throw err;

      set({
        actions:   (actionResult.data  ?? []).map(mapLatActionRow),
        summaries: (summaryResult.data ?? []).map(mapLatSummaryRow),
        isLoading: false,
      });
    } catch (e: unknown) {
      set({ isLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  // ─── createAction ─────────────────────────────────────────
  createAction: async (payload, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('lat_actions')
      .insert(payload)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const newAction = mapLatActionRow(data);
    set((state) => ({ actions: [newAction, ...state.actions] }));
  },

  // ─── updateAction ─────────────────────────────────────────
  updateAction: async (actionId, payload, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('lat_actions')
      .update(payload)
      .eq('id', actionId)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const updated = mapLatActionRow(data);
    set((state) => ({
      actions: state.actions.map((a) => (a.id === actionId ? updated : a)),
    }));
  },

  // ─── deleteAction ─────────────────────────────────────────
  // Cascade: assignments + updates removed by FK ON DELETE CASCADE
  deleteAction: async (actionId, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { error } = await supabase
      .from('lat_actions')
      .delete()
      .eq('id', actionId);
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set((state) => ({
      actions:          state.actions.filter((a) => a.id !== actionId),
      assignments:      state.assignments.filter((a) => a.action_id !== actionId),
      updates:          state.updates.filter((u) => u.action_id !== actionId),
      selectedActionId: state.selectedActionId === actionId ? null : state.selectedActionId,
    }));
  },

  // ─── addAssignment ────────────────────────────────────────
  addAssignment: async (payload, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('lat_action_assignments')
      .insert(payload)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const newAssignment = mapLatAssignmentRow(data);
    set((state) => ({ assignments: [...state.assignments, newAssignment] }));
  },

  // ─── removeAssignment ─────────────────────────────────────
  removeAssignment: async (assignmentId, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { error } = await supabase
      .from('lat_action_assignments')
      .delete()
      .eq('id', assignmentId);
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set((state) => ({
      assignments: state.assignments.filter((a) => a.id !== assignmentId),
    }));
  },

  // ─── postUpdate ───────────────────────────────────────────
  // Append-only progress comment; optionally records a status transition
  postUpdate: async (payload, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ isUpdateLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('lat_action_updates')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const newUpdate = mapLatUpdateRow(data);
      set((state) => ({
        updates:         [newUpdate, ...state.updates],
        isUpdateLoading: false,
      }));
    } catch (e: unknown) {
      set({ isUpdateLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  // ─── completeAction ───────────────────────────────────────
  // Optimistic: COMPLETED immediately → rollback to prevStatus on error
  completeAction: async (actionId, reviewedBy, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    const prevStatus: LatActionStatus =
      get().actions.find((a) => a.id === actionId)?.status ?? 'IN_PROGRESS';
    set((state) => ({
      actions: state.actions.map((a) =>
        a.id === actionId ? { ...a, status: 'COMPLETED' } : a
      ),
      error: null,
    }));
    const { error } = await supabase
      .from('lat_actions')
      .update({ status: 'COMPLETED', reviewed_by: reviewedBy })
      .eq('id', actionId);
    if (error) {
      set((state) => ({
        actions: state.actions.map((a) =>
          a.id === actionId ? { ...a, status: prevStatus } : a
        ),
        error: error.message,
      }));
      throw error;
    }
  },

  // ─── cancelAction ─────────────────────────────────────────
  // Optimistic: CANCELLED immediately → rollback to prevStatus on error
  cancelAction: async (actionId, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    const prevStatus: LatActionStatus =
      get().actions.find((a) => a.id === actionId)?.status ?? 'OPEN';
    set((state) => ({
      actions: state.actions.map((a) =>
        a.id === actionId ? { ...a, status: 'CANCELLED' } : a
      ),
      error: null,
    }));
    const { error } = await supabase
      .from('lat_actions')
      .update({ status: 'CANCELLED' })
      .eq('id', actionId);
    if (error) {
      set((state) => ({
        actions: state.actions.map((a) =>
          a.id === actionId ? { ...a, status: prevStatus } : a
        ),
        error: error.message,
      }));
      throw error;
    }
  },

  // ─── reassignOwner ────────────────────────────────────────
  reassignOwner: async (actionId, newOwnerId, orgPlan) => {
    if (!canAccessLeadershipActions(orgPlan)) {
      throw new LeadershipActionPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('lat_actions')
      .update({ owner_id: newOwnerId })
      .eq('id', actionId)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const updated = mapLatActionRow(data);
    set((state) => ({
      actions: state.actions.map((a) => (a.id === actionId ? updated : a)),
    }));
  },

  // ─── UI helpers ───────────────────────────────────────────
  selectAction: (actionId) => set({ selectedActionId: actionId }),
  setFilters:   (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  clearError: () => set({ error: null }),
}));
