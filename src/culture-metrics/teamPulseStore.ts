/**
 * src/culture-metrics/teamPulseStore.ts
 *
 * MONOLITH v18.5 Sprint 15 — Team Pulse Check (TPC) Zustand store
 *
 * Actions:
 *   fetchConfigs       — PROFESSIONAL+ gated: load tpc_pulse_configs
 *   fetchSessions      — PROFESSIONAL+ gated: load tpc_pulse_sessions
 *   fetchSummary       — PROFESSIONAL+ gated: load tpc_pulse_summary_v
 *   upsertConfig       — PROFESSIONAL+ gated: admin upsert per-topic config
 *   createSession      — PROFESSIONAL+ gated: admin creates a new DRAFT session
 *   activateSession    — PROFESSIONAL+ gated: DRAFT → ACTIVE (sets opened_at)
 *   closeSession       — PROFESSIONAL+ gated: ACTIVE → CLOSED (sets closed_at)
 *   submitResponse     — PLAN-GATE EXEMPT: anonymous insert, no auth.getUser
 *   setActiveSession   — local state only (select which session to view)
 *   setFilters         — local state only
 *   clearError         — local state only
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessTpcModule,
  TPC_PLAN_GATE_ERROR,
  mapTpcPulseConfig,
  mapTpcPulseSession,
  mapTpcPulseSummary,
  type TpcPulseConfig,
  type TpcPulseSession,
  type TpcPulseSummary,
  type TpcFilters,
  type TpcUpsertConfigPayload,
  type TpcCreateSessionPayload,
  type TpcSubmitResponsePayload,
  type TpcPulseConfigRow,
  type TpcPulseSessionRow,
  type TpcPulseSummaryRow,
} from './teamPulseTypes';

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface TpcState {
  configs:         TpcPulseConfig[];
  sessions:        TpcPulseSession[];
  summaries:       TpcPulseSummary[];
  activeSessionId: string | null;
  filters:         TpcFilters;
  loading:         boolean;
  error:           string | null;

  fetchConfigs:      (orgId: string, plan: OrgPlan) => Promise<void>;
  fetchSessions:     (orgId: string, plan: OrgPlan) => Promise<void>;
  fetchSummary:      (orgId: string, plan: OrgPlan) => Promise<void>;
  upsertConfig:      (payload: TpcUpsertConfigPayload, plan: OrgPlan) => Promise<void>;
  createSession:     (payload: TpcCreateSessionPayload, plan: OrgPlan) => Promise<void>;
  activateSession:   (sessionId: string, orgId: string, plan: OrgPlan) => Promise<void>;
  closeSession:      (sessionId: string, orgId: string, plan: OrgPlan) => Promise<void>;
  submitResponse:    (payload: TpcSubmitResponsePayload) => Promise<void>;
  setActiveSession:  (sessionId: string | null) => void;
  setFilters:        (filters: TpcFilters) => void;
  clearError:        () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useTpcStore = create<TpcState>((set, get) => ({
  configs:         [],
  sessions:        [],
  summaries:       [],
  activeSessionId: null,
  filters:         {},
  loading:         false,
  error:           null,

  // ── fetchConfigs ─────────────────────────────────────────────────────────
  fetchConfigs: async (orgId, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('tpc_pulse_configs')
      .select('*')
      .eq('org_id', orgId)
      .order('topic');

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      loading: false,
      configs: (data as TpcPulseConfigRow[]).map(mapTpcPulseConfig),
    });
  },

  // ── fetchSessions ────────────────────────────────────────────────────────
  fetchSessions: async (orgId, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('tpc_pulse_sessions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      loading:  false,
      sessions: (data as TpcPulseSessionRow[]).map(mapTpcPulseSession),
    });
  },

  // ── fetchSummary ──────────────────────────────────────────────────────────
  fetchSummary: async (orgId, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('tpc_pulse_summary_v')
      .select('*')
      .eq('org_id', orgId)
      .order('period_label', { ascending: false });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({
      loading:   false,
      summaries: (data as TpcPulseSummaryRow[]).map(mapTpcPulseSummary),
    });
  },

  // ── upsertConfig ──────────────────────────────────────────────────────────
  upsertConfig: async (payload, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('tpc_pulse_configs')
      .upsert(
        {
          org_id:    payload.orgId,
          topic:     payload.topic,
          ...(payload.isActive !== undefined && { is_active: payload.isActive }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,topic' }
      );

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ loading: false });
    // Re-fetch configs to reflect the upserted row
    await get().fetchConfigs(payload.orgId, plan);
  },

  // ── createSession ─────────────────────────────────────────────────────────
  createSession: async (payload, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('tpc_pulse_sessions')
      .insert({
        org_id:       payload.orgId,
        title:        payload.title.trim(),
        period_label: payload.periodLabel.trim(),
      })
      .select()
      .single();

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    const newSession = mapTpcPulseSession(data as TpcPulseSessionRow);
    set(state => ({
      loading:  false,
      sessions: [newSession, ...state.sessions],
    }));
  },

  // ── activateSession ───────────────────────────────────────────────────────
  // DRAFT → ACTIVE; sets opened_at to now
  activateSession: async (sessionId, orgId, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('tpc_pulse_sessions')
      .update({ status: 'ACTIVE', opened_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('org_id', orgId);

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set(state => ({
      loading:  false,
      sessions: state.sessions.map(s =>
        s.id === sessionId
          ? { ...s, status: 'ACTIVE' as const, openedAt: new Date().toISOString() }
          : s
      ),
    }));
  },

  // ── closeSession ──────────────────────────────────────────────────────────
  // ACTIVE → CLOSED; sets closed_at to now
  closeSession: async (sessionId, orgId, plan) => {
    if (!canAccessTpcModule(plan)) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return;
    }
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('tpc_pulse_sessions')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('org_id', orgId);

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set(state => ({
      loading:  false,
      sessions: state.sessions.map(s =>
        s.id === sessionId
          ? { ...s, status: 'CLOSED' as const, closedAt: new Date().toISOString() }
          : s
      ),
    }));
  },

  // ── submitResponse ────────────────────────────────────────────────────────
  // PLAN-GATE EXEMPT — anonymous, no auth.getUser (mirrors submitSentimentEntry)
  submitResponse: async (payload) => {
    set({ loading: true, error: null });
    const { error } = await supabase
      .from('tpc_pulse_responses')
      .insert({
        org_id:     payload.orgId,
        session_id: payload.sessionId,
        topic:      payload.topic,
        score:      payload.score,
        comment:    payload.comment ?? null,
      });

    if (error) {
      set({ loading: false, error: error.message });
      return;
    }
    set({ loading: false });
  },

  // ── setActiveSession / setFilters / clearError ───────────────────────────
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  setFilters:       (filters)   => set({ filters }),
  clearError:       ()          => set({ error: null }),
}));
