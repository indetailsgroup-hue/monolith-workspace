// src/ai-quotation/aiQuotationDraftStore.ts
// MONOLITH v18.0 — AI Quotation Draft Zustand Store

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessAiQuotation,
  AiQuotationPlanGateError,
  mapDraftRow,
  mapLineItemRow,
  mapDraftSummaryRow,
  DEFAULT_AQD_FILTERS,
  type AiQuotationDraft,
  type AiQuotationLineItem,
  type AiQuotationDraftSummary,
  type AqdFilters,
  type CreateAqdDraftPayload,
  type UpdateAqdDraftPayload,
  type CreateAqdLineItemPayload,
  type UpdateAqdLineItemPayload,
} from './aiQuotationDraftTypes';

// ─────────────────────────────────────────────────────────────
// State + Actions Interface
// ─────────────────────────────────────────────────────────────

interface AiQuotationDraftState {
  drafts:              AiQuotationDraft[];
  summaries:           AiQuotationDraftSummary[];
  lineItems:           AiQuotationLineItem[];
  selectedDraftId:     string | null;
  isLoading:           boolean;
  isLineItemLoading:   boolean;
  filters:             AqdFilters;
  error:               string | null;

  // 10 ENTERPRISE-gated actions
  fetchDrafts:    (orgId: string,   orgPlan: OrgPlan) => Promise<void>;
  createDraft:    (payload: CreateAqdDraftPayload,   orgPlan: OrgPlan) => Promise<void>;
  updateDraft:    (draftId: string, payload: UpdateAqdDraftPayload, orgPlan: OrgPlan) => Promise<void>;
  deleteDraft:    (draftId: string, orgPlan: OrgPlan) => Promise<void>;
  addLineItem:    (payload: CreateAqdLineItemPayload, orgPlan: OrgPlan) => Promise<void>;
  updateLineItem: (lineItemId: string, payload: UpdateAqdLineItemPayload, orgPlan: OrgPlan) => Promise<void>;
  removeLineItem: (lineItemId: string, orgPlan: OrgPlan) => Promise<void>;
  submitForReview:(draftId: string, orgPlan: OrgPlan) => Promise<void>;
  approveDraft:   (draftId: string, orgPlan: OrgPlan) => Promise<void>;
  rejectDraft:    (draftId: string, orgPlan: OrgPlan) => Promise<void>;

  // UI helpers
  selectDraft: (draftId: string | null) => void;
  setFilters:  (filters: Partial<AqdFilters>) => void;
  clearError:  () => void;
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useAiQuotationDraftStore = create<AiQuotationDraftState>((set, get) => ({
  drafts:            [],
  summaries:         [],
  lineItems:         [],
  selectedDraftId:   null,
  isLoading:         false,
  isLineItemLoading: false,
  filters:           DEFAULT_AQD_FILTERS,
  error:             null,

  // ─── fetchDrafts ───────────────────────────────────────────
  fetchDrafts: async (orgId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ isLoading: true, error: null });
    try {
      const [draftResult, summaryResult] = await Promise.all([
        supabase
          .from('aqd_quotation_drafts')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('aqd_draft_summary_v')
          .select('*')
          .eq('org_id', orgId),
      ]);

      const err = draftResult.error ?? summaryResult.error;
      if (err) throw err;

      set({
        drafts:    (draftResult.data  ?? []).map(mapDraftRow),
        summaries: (summaryResult.data ?? []).map(mapDraftSummaryRow),
        isLoading: false,
      });
    } catch (e: unknown) {
      set({ isLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  // ─── createDraft ───────────────────────────────────────────
  createDraft: async (payload, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('aqd_quotation_drafts')
      .insert(payload)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const newDraft = mapDraftRow(data);
    set((state) => ({ drafts: [newDraft, ...state.drafts] }));
  },

  // ─── updateDraft ───────────────────────────────────────────
  updateDraft: async (draftId, payload, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('aqd_quotation_drafts')
      .update(payload)
      .eq('id', draftId)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const updated = mapDraftRow(data);
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === draftId ? updated : d)),
    }));
  },

  // ─── deleteDraft ───────────────────────────────────────────
  deleteDraft: async (draftId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ error: null });
    const { error } = await supabase
      .from('aqd_quotation_drafts')
      .delete()
      .eq('id', draftId);
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set((state) => ({
      drafts:          state.drafts.filter((d) => d.id !== draftId),
      lineItems:       state.lineItems.filter((li) => li.draft_id !== draftId),
      selectedDraftId: state.selectedDraftId === draftId ? null : state.selectedDraftId,
    }));
  },

  // ─── addLineItem ───────────────────────────────────────────
  addLineItem: async (payload, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ isLineItemLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('aqd_draft_line_items')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const newItem = mapLineItemRow(data);
      set((state) => ({
        lineItems:         [...state.lineItems, newItem],
        isLineItemLoading: false,
      }));
    } catch (e: unknown) {
      set({ isLineItemLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  // ─── updateLineItem ────────────────────────────────────────
  updateLineItem: async (lineItemId, payload, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ error: null });
    const { data, error } = await supabase
      .from('aqd_draft_line_items')
      .update(payload)
      .eq('id', lineItemId)
      .select()
      .single();
    if (error) {
      set({ error: error.message });
      throw error;
    }
    const updated = mapLineItemRow(data);
    set((state) => ({
      lineItems: state.lineItems.map((li) => (li.id === lineItemId ? updated : li)),
    }));
  },

  // ─── removeLineItem ────────────────────────────────────────
  removeLineItem: async (lineItemId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    set({ error: null });
    const { error } = await supabase
      .from('aqd_draft_line_items')
      .delete()
      .eq('id', lineItemId);
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set((state) => ({
      lineItems: state.lineItems.filter((li) => li.id !== lineItemId),
    }));
  },

  // ─── submitForReview ───────────────────────────────────────
  // Optimistic: PENDING_REVIEW immediately → rollback to DRAFT on error
  submitForReview: async (draftId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    const prevStatus = get().drafts.find((d) => d.id === draftId)?.status ?? 'DRAFT';
    set((state) => ({
      drafts: state.drafts.map((d) =>
        d.id === draftId ? { ...d, status: 'PENDING_REVIEW' } : d
      ),
      error: null,
    }));
    const { error } = await supabase
      .from('aqd_quotation_drafts')
      .update({ status: 'PENDING_REVIEW' })
      .eq('id', draftId);
    if (error) {
      set((state) => ({
        drafts: state.drafts.map((d) =>
          d.id === draftId ? { ...d, status: prevStatus } : d
        ),
        error: error.message,
      }));
      throw error;
    }
  },

  // ─── approveDraft ──────────────────────────────────────────
  // Optimistic: APPROVED immediately → rollback on error
  approveDraft: async (draftId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    const prevStatus = get().drafts.find((d) => d.id === draftId)?.status ?? 'PENDING_REVIEW';
    set((state) => ({
      drafts: state.drafts.map((d) =>
        d.id === draftId ? { ...d, status: 'APPROVED' } : d
      ),
      error: null,
    }));
    const { error } = await supabase
      .from('aqd_quotation_drafts')
      .update({ status: 'APPROVED' })
      .eq('id', draftId);
    if (error) {
      set((state) => ({
        drafts: state.drafts.map((d) =>
          d.id === draftId ? { ...d, status: prevStatus } : d
        ),
        error: error.message,
      }));
      throw error;
    }
  },

  // ─── rejectDraft ───────────────────────────────────────────
  // Optimistic: REJECTED immediately → rollback on error
  rejectDraft: async (draftId, orgPlan) => {
    if (!canAccessAiQuotation(orgPlan)) {
      throw new AiQuotationPlanGateError(orgPlan);
    }
    const prevStatus = get().drafts.find((d) => d.id === draftId)?.status ?? 'PENDING_REVIEW';
    set((state) => ({
      drafts: state.drafts.map((d) =>
        d.id === draftId ? { ...d, status: 'REJECTED' } : d
      ),
      error: null,
    }));
    const { error } = await supabase
      .from('aqd_quotation_drafts')
      .update({ status: 'REJECTED' })
      .eq('id', draftId);
    if (error) {
      set((state) => ({
        drafts: state.drafts.map((d) =>
          d.id === draftId ? { ...d, status: prevStatus } : d
        ),
        error: error.message,
      }));
      throw error;
    }
  },

  // ─── UI helpers ────────────────────────────────────────────
  selectDraft: (draftId) => set({ selectedDraftId: draftId }),
  setFilters:  (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  clearError: () => set({ error: null }),
}));
