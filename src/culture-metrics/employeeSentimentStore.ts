/**
 * src/culture-metrics/employeeSentimentStore.ts
 *
 * MONOLITH v18.5 Sprint 13 — Employee Sentiment Timeline (EST) Zustand store
 *
 * Actions:
 *   fetchSummary          — PROFESSIONAL+ gated: load est_sentiment_summary_v
 *   fetchTimelineConfigs  — PROFESSIONAL+ gated: load est_timeline_configs
 *   submitSentimentEntry  — PLAN-GATE EXEMPT: anonymous insert, no auth.getUser
 *   upsertTimelineConfig  — PROFESSIONAL+ gated: admin upsert config per dimension
 *   setFilters            — local state only
 *   clearError            — local state only
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessEstModule,
  mapEstSentimentSummary,
  mapEstTimelineConfig,
  type EstSentimentSummary,
  type EstTimelineConfig,
  type EstFilters,
  type EstSubmitPayload,
  type EstUpsertConfigPayload,
  type EstSentimentSummaryRow,
  type EstTimelineConfigRow,
} from './employeeSentimentTypes';

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface EstState {
  summaries:           EstSentimentSummary[];
  configs:             EstTimelineConfig[];
  filters:             EstFilters;
  loading:             boolean;
  error:               string | null;

  fetchSummary:          (orgId: string, plan: OrgPlan) => Promise<void>;
  fetchTimelineConfigs:  (orgId: string, plan: OrgPlan) => Promise<void>;
  submitSentimentEntry:  (payload: EstSubmitPayload) => Promise<void>;
  upsertTimelineConfig:  (payload: EstUpsertConfigPayload, plan: OrgPlan) => Promise<void>;
  setFilters:            (filters: EstFilters) => void;
  clearError:            () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useEstStore = create<EstState>((set, get) => ({
  summaries: [],
  configs:   [],
  filters:   {},
  loading:   false,
  error:     null,

  // ── fetchSummary ────────────────────────────────────────────────────────────
  fetchSummary: async (orgId, plan) => {
    if (!canAccessEstModule(plan)) {
      set({ error: 'EST module requires PROFESSIONAL or ENTERPRISE plan' });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('est_sentiment_summary_v')
      .select('*')
      .eq('org_id', orgId)
      .order('period_label', { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      loading:   false,
      summaries: (data as EstSentimentSummaryRow[]).map(mapEstSentimentSummary),
    });
  },

  // ── fetchTimelineConfigs ────────────────────────────────────────────────────
  fetchTimelineConfigs: async (orgId, plan) => {
    if (!canAccessEstModule(plan)) {
      set({ error: 'EST module requires PROFESSIONAL or ENTERPRISE plan' });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('est_timeline_configs')
      .select('*')
      .eq('org_id', orgId)
      .order('dimension');

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      loading: false,
      configs: (data as EstTimelineConfigRow[]).map(mapEstTimelineConfig),
    });
  },

  // ── submitSentimentEntry ────────────────────────────────────────────────────
  // PLAN-GATE EXEMPT — anonymous, no auth.getUser (mirrors submitEnpsResponse)
  submitSentimentEntry: async (payload) => {
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('est_sentiment_entries')
      .insert({
        org_id:       payload.orgId,
        dimension:    payload.dimension,
        score:        payload.score,
        period_type:  payload.periodType,
        period_label: payload.periodLabel,
        note:         payload.note ?? null,
      });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ loading: false });
  },

  // ── upsertTimelineConfig ────────────────────────────────────────────────────
  upsertTimelineConfig: async (payload, plan) => {
    if (!canAccessEstModule(plan)) {
      set({ error: 'EST module requires PROFESSIONAL or ENTERPRISE plan' });
      return;
    }
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('est_timeline_configs')
      .upsert(
        {
          org_id:    payload.orgId,
          dimension: payload.dimension,
          ...(payload.isActive     !== undefined && { is_active:     payload.isActive }),
          ...(payload.isInverted   !== undefined && { is_inverted:   payload.isInverted }),
          ...(payload.minResponses !== undefined && { min_responses: payload.minResponses }),
          ...(payload.periodType   !== undefined && { period_type:   payload.periodType }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,dimension' }
      );

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ loading: false });
    // Re-fetch configs to reflect the upserted row
    await get().fetchTimelineConfigs(payload.orgId, plan);
  },

  // ── setFilters / clearError ─────────────────────────────────────────────────
  setFilters: (filters) => set({ filters }),
  clearError: ()        => set({ error: null }),
}));
