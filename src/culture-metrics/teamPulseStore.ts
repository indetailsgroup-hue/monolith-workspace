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
 *   submitResponse     — PLAN-GATE EXEMPT: identity-free row; RLS requires membership
 *   setContext         — call before loading; reset on tenant/plan/auth changes
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
  contextOrgId:    string | null;
  contextPlan:     OrgPlan | null;
  configs:         TpcPulseConfig[];
  sessions:        TpcPulseSession[];
  summaries:       TpcPulseSummary[];
  activeSessionId: string | null;
  filters:         TpcFilters;
  loading:         boolean;
  error:           string | null;

  setContext:        (orgId: string | null, plan: OrgPlan | null) => void;
  fetchConfigs:      (orgId: string, plan: OrgPlan) => Promise<boolean>;
  fetchSessions:     (orgId: string, plan: OrgPlan) => Promise<boolean>;
  fetchSummary:      (orgId: string, plan: OrgPlan) => Promise<boolean>;
  upsertConfig:      (payload: TpcUpsertConfigPayload, plan: OrgPlan) => Promise<boolean>;
  createSession:     (payload: TpcCreateSessionPayload, plan: OrgPlan) => Promise<boolean>;
  activateSession:   (sessionId: string, orgId: string, plan: OrgPlan) => Promise<boolean>;
  closeSession:      (sessionId: string, orgId: string, plan: OrgPlan) => Promise<boolean>;
  submitResponse:    (payload: TpcSubmitResponsePayload) => Promise<boolean>;
  setActiveSession:  (sessionId: string | null) => void;
  setFilters:        (filters: TpcFilters) => void;
  clearError:        () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

type Resource = 'configs' | 'sessions' | 'summaries' | 'responses';
type QueryResult = { data: unknown; error: { message: string } | null };

function scopedRows<T extends { org_id: string }>(data: unknown, orgId: string): T[] {
  const rows = (data ?? []) as T[];
  if (!Array.isArray(rows) || rows.some(row => !row || row.org_id !== orgId)) {
    throw new Error('TPC returned data outside the active organization');
  }
  return rows;
}

function scopedRow<T extends { org_id: string }>(data: unknown, orgId: string): T {
  if (!data) throw new Error('TPC update did not match a permitted record');
  return scopedRows<T>([data], orgId)[0];
}

export const useTpcStore = create<TpcState>((set, get) => {
  let generation = 0;
  let serial = 0;
  const pending = new Set<number>();
  const latestWrites = new Map<string, number>();
  const readVersions: Record<Resource, number> = { configs: 0, sessions: 0, summaries: 0, responses: 0 };

  async function request(
    orgId: string,
    plan: OrgPlan | undefined,
    resource: Resource,
    operation: 'read' | 'write',
    execute: () => PromiseLike<QueryResult>,
    apply: (data: unknown) => void,
    writeKey?: string,
  ): Promise<boolean> {
    // Context is set by the authenticated caller, never adopted from a payload.
    if (get().contextOrgId !== orgId || get().contextPlan === null) return false;
    if (plan !== undefined && (plan !== get().contextPlan || !canAccessTpcModule(plan))) {
      set({ error: TPC_PLAN_GATE_ERROR });
      return false;
    }
    const startedGeneration = generation;
    const version = ++readVersions[resource];
    const token = ++serial;
    if (writeKey) latestWrites.set(writeKey, token);
    pending.add(token);
    set({ loading: true, error: null });
    const current = () => generation === startedGeneration &&
      (operation === 'write' || readVersions[resource] === version) &&
      (!writeKey || latestWrites.get(writeKey) === token);
    try {
      const { data, error } = await execute();
      if (!current()) return false;
      if (error) throw new Error(error.message);
      // A read started before this write completed must not overwrite it later.
      if (operation === 'write') ++readVersions[resource];
      apply(data);
      return true;
    } catch (error) {
      if (current()) set({ error: error instanceof Error ? error.message : 'TPC request failed' });
      return false;
    } finally {
      if (generation === startedGeneration) {
        pending.delete(token);
        if (writeKey && latestWrites.get(writeKey) === token) latestWrites.delete(writeKey);
        set({ loading: pending.size > 0 });
      }
    }
  }

  function transitionSession(
    sessionId: string, orgId: string, plan: OrgPlan,
    source: 'DRAFT' | 'ACTIVE', target: 'ACTIVE' | 'CLOSED',
  ) {
    return request(orgId, plan, 'sessions', 'write', () => supabase
      .from('tpc_pulse_sessions')
      .update({ status: target, [target === 'ACTIVE' ? 'opened_at' : 'closed_at']: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('org_id', orgId)
      .eq('status', source)
      .select('*')
      .maybeSingle(), data => {
        const row = scopedRow<TpcPulseSessionRow>(data, orgId);
        if (row.id !== sessionId || row.status !== target) throw new Error('TPC session transition was not confirmed');
        const session = mapTpcPulseSession(row);
        set(state => ({ sessions: state.sessions.map(existing => existing.id === sessionId ? session : existing) }));
      }, `session:${sessionId}`);
  }

  return {
    contextOrgId:    null,
    contextPlan:     null,
    configs:         [],
    sessions:        [],
    summaries:       [],
    activeSessionId: null,
    filters:         {},
    loading:         false,
    error:           null,

    // Call setContext(orgId, plan) before initial loads. Call setContext(null, null)
    // on logout/unmount, including before re-entering as another user or role.
    setContext: (orgId, plan) => {
      const nextPlan = orgId === null ? null : plan;
      if (get().contextOrgId === orgId && get().contextPlan === nextPlan) return;
      ++generation;
      pending.clear();
      latestWrites.clear();
      set({
        contextOrgId: orgId, contextPlan: nextPlan,
        configs: [], sessions: [], summaries: [], activeSessionId: null, filters: {},
        loading: false, error: null,
      });
    },

    fetchConfigs: (orgId, plan) => request(orgId, plan, 'configs', 'read', () => supabase
        .from('tpc_pulse_configs')
        .select('*')
        .eq('org_id', orgId)
        .order('topic'), data => set({ configs: scopedRows<TpcPulseConfigRow>(data, orgId).map(mapTpcPulseConfig) })),

    // ── fetchSessions ────────────────────────────────────────────────────────
    fetchSessions: (orgId, plan) => request(orgId, plan, 'sessions', 'read', () => supabase
        .from('tpc_pulse_sessions')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }), data => set({ sessions: scopedRows<TpcPulseSessionRow>(data, orgId).map(mapTpcPulseSession) })),

    // ── fetchSummary ──────────────────────────────────────────────────────────
    fetchSummary: (orgId, plan) => request(orgId, plan, 'summaries', 'read', () => supabase
        .from('tpc_pulse_summary_v')
        .select('*')
        .eq('org_id', orgId)
        .order('period_label', { ascending: false }), data => set({ summaries: scopedRows<TpcPulseSummaryRow>(data, orgId).map(mapTpcPulseSummary) })),

    // ── upsertConfig ──────────────────────────────────────────────────────────
    upsertConfig: (payload, plan) => request(payload.orgId, plan, 'configs', 'write', () => supabase
        .from('tpc_pulse_configs')
        .upsert(
          {
            org_id:    payload.orgId,
            topic:     payload.topic,
            ...(payload.isActive !== undefined && { is_active: payload.isActive }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,topic' }
        ).select('*').single(), data => {
          const row = scopedRow<TpcPulseConfigRow>(data, payload.orgId);
          if (row.topic !== payload.topic) throw new Error('TPC configuration update was not confirmed');
          const config = mapTpcPulseConfig(row);
          set(state => ({ configs: [...state.configs.filter(existing => existing.topic !== config.topic), config] }));
        }, `config:${payload.topic}`),

    // ── createSession ─────────────────────────────────────────────────────────
    createSession: (payload, plan) => request(payload.orgId, plan, 'sessions', 'write', () => supabase
        .from('tpc_pulse_sessions')
        .insert({
          org_id:       payload.orgId,
          title:        payload.title.trim(),
          period_label: payload.periodLabel.trim(),
        })
        .select()
        .single(), data => {
          const row = scopedRow<TpcPulseSessionRow>(data, payload.orgId);
          if (row.status !== 'DRAFT') throw new Error('TPC draft session was not confirmed');
          const session = mapTpcPulseSession(row);
          set(state => ({ sessions: [session, ...state.sessions.filter(existing => existing.id !== session.id)] }));
        }),

    // ── activateSession ───────────────────────────────────────────────────────
    // DRAFT → ACTIVE; sets opened_at to now
    activateSession: (sessionId, orgId, plan) => transitionSession(sessionId, orgId, plan, 'DRAFT', 'ACTIVE'),

    // ── closeSession ──────────────────────────────────────────────────────────
    // ACTIVE → CLOSED; sets closed_at to now
    closeSession: (sessionId, orgId, plan) => transitionSession(sessionId, orgId, plan, 'ACTIVE', 'CLOSED'),

    // ── submitResponse ────────────────────────────────────────────────────────
    // No user_id is stored; authenticated organization membership remains enforced
    // by RLS. There is deliberately no plan gate or added auth.getUser call here.
    submitResponse: (payload) => request(payload.orgId, undefined, 'responses', 'write', () => supabase
        .from('tpc_pulse_responses')
        .insert({
          org_id:     payload.orgId,
          session_id: payload.sessionId,
          topic:      payload.topic,
          score:      payload.score,
          comment:    payload.comment ?? null,
        }), () => {}),

    // ── setActiveSession / setFilters / clearError ───────────────────────────
    setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
    setFilters:       (filters)   => set({ filters }),
    clearError:       ()          => set({ error: null }),
  };
});
