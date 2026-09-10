// src/culture-metrics/cultureMetricsStore.ts
// MONOLITH v18.5 — Culture Metrics Dashboard (CMD) Zustand Store
//
// Plan gate: PROFESSIONAL+ (PROFESSIONAL or ENTERPRISE) for all write actions.
// submitEnpsResponse is plan-gate EXEMPT — anonymous eNPS responses never carry
// a user identity; supabase.auth.getUser is intentionally NOT called.
//
// DB tables: cmd_metric_definitions, cmd_metric_snapshots,
//            cmd_enps_surveys, cmd_enps_responses
// DB views:  cmd_org_health_v, cmd_enps_results_v
//
// Schema: supabase/migrations/20270125_culture_metrics_dashboard.sql

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessCultureMetrics,
  CultureMetricsPlanGateError,
  DEFAULT_CMD_FILTERS,
  mapCmdMetricDefinitionRow,
  mapCmdMetricSnapshotRow,
  mapCmdEnpsSurveyRow,
  mapCmdEnpsResultsRow,
  mapCmdOrgHealthRow,
} from './cultureMetricsTypes';
import type {
  CmdMetricDefinition,
  CmdMetricSnapshot,
  CmdEnpsSurvey,
  CmdEnpsResults,
  CmdOrgHealth,
  CmdFilters,
  CmdMetricDefinitionRow,
  CmdMetricSnapshotRow,
  CmdEnpsSurveyRow,
  CmdEnpsResultsRow,
  CmdOrgHealthRow,
} from './cultureMetricsTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Payload types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateMetricDefinitionPayload {
  metricCategory: string;
  metricSource: string;
  displayName: string;
  displayNameTh?: string | null;
  minScore?: number;
  maxScore?: number;
  targetScore?: number | null;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
  healthWeight?: number;
  description?: string | null;
}

export interface UpdateMetricDefinitionPayload {
  displayName?: string;
  displayNameTh?: string | null;
  targetScore?: number | null;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
  healthWeight?: number;
  isActive?: boolean;
  description?: string | null;
}

export interface RecordSnapshotPayload {
  metricId: string;
  periodType: string;
  periodLabel: string;
  snapshotDate: string;
  score: number;
  respondentCount?: number;
  notes?: string | null;
  sourceRefId?: string | null;
}

export interface CreateEnpsSurveyPayload {
  title: string;
  titleTh?: string | null;
  questionText?: string;
  followupQuestion?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  minResponses?: number;
  notes?: string | null;
}

export interface SubmitEnpsResponsePayload {
  surveyId: string;
  score: number;
  anonymousToken: string;
  followupText?: string | null;
  departmentLabel?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

interface CultureMetricsState {
  metricDefinitions:  CmdMetricDefinition[];
  snapshots:          CmdMetricSnapshot[];
  orgHealth:          CmdOrgHealth[];
  enpsSurveys:        CmdEnpsSurvey[];
  enpsResults:        CmdEnpsResults[];
  filters:            CmdFilters;
  isLoading:          boolean;
  isSnapshotLoading:  boolean;
  isEnpsLoading:      boolean;
  error:              string | null;
}

interface CultureMetricsActions {
  // ── Read (no plan gate) ────────────────────────────────────────────────────
  fetchMetricDefinitions: (orgId: string) => Promise<void>;
  fetchSnapshots:         (orgId: string) => Promise<void>;
  fetchEnpsSurveys:       (orgId: string) => Promise<void>;
  fetchEnpsResults:       (orgId: string) => Promise<void>;
  fetchOrgHealth:         (orgId: string) => Promise<void>;

  // ── Write — PROFESSIONAL+ gated ───────────────────────────────────────────
  createMetricDefinition: (
    orgId:   string,
    plan:    OrgPlan,
    payload: CreateMetricDefinitionPayload,
  ) => Promise<CmdMetricDefinition>;

  updateMetricDefinition: (
    orgId:    string,
    plan:     OrgPlan,
    metricId: string,
    updates:  UpdateMetricDefinitionPayload,
  ) => Promise<void>;

  recordSnapshot: (
    orgId:   string,
    plan:    OrgPlan,
    payload: RecordSnapshotPayload,
  ) => Promise<void>;

  createEnpsSurvey: (
    orgId:   string,
    plan:    OrgPlan,
    payload: CreateEnpsSurveyPayload,
  ) => Promise<CmdEnpsSurvey>;

  activateEnpsSurvey: (orgId: string, plan: OrgPlan, surveyId: string) => Promise<void>;
  closeEnpsSurvey:    (orgId: string, plan: OrgPlan, surveyId: string) => Promise<void>;

  // ── Plan-gate exempt (anonymous eNPS) ─────────────────────────────────────
  submitEnpsResponse: (orgId: string, payload: SubmitEnpsResponsePayload) => Promise<void>;

  // ── UI helpers ─────────────────────────────────────────────────────────────
  setFilters:  (partial: Partial<CmdFilters>) => void;
  clearError:  () => void;
}

type CultureMetricsStore = CultureMetricsState & CultureMetricsActions;

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCultureMetricsStore = create<CultureMetricsStore>((set, get) => ({

  // ── Initial state ──────────────────────────────────────────────────────────
  metricDefinitions: [],
  snapshots:         [],
  orgHealth:         [],
  enpsSurveys:       [],
  enpsResults:       [],
  filters:           { ...DEFAULT_CMD_FILTERS },
  isLoading:         false,
  isSnapshotLoading: false,
  isEnpsLoading:     false,
  error:             null,

  // ─── fetchMetricDefinitions ────────────────────────────────────────────────
  fetchMetricDefinitions: async (orgId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('cmd_metric_definitions')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_name');
      if (error) throw error;
      set({
        metricDefinitions: (data as CmdMetricDefinitionRow[]).map(mapCmdMetricDefinitionRow),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, error: 'Failed to load metric definitions' });
    }
  },

  // ─── fetchSnapshots ────────────────────────────────────────────────────────
  fetchSnapshots: async (orgId) => {
    const { filters } = get();
    set({ isSnapshotLoading: true, error: null });
    try {
      let query = supabase
        .from('cmd_metric_snapshots')
        .select('*')
        .eq('org_id', orgId)
        .order('snapshot_date', { ascending: false });

      if (filters.periodType)  query = query.eq('period_type', filters.periodType);
      if (filters.fromDate)    query = query.gte('snapshot_date', filters.fromDate);
      if (filters.toDate)      query = query.lte('snapshot_date', filters.toDate);

      const { data, error } = await query;
      if (error) throw error;
      set({
        snapshots: (data as CmdMetricSnapshotRow[]).map(mapCmdMetricSnapshotRow),
        isSnapshotLoading: false,
      });
    } catch {
      set({ isSnapshotLoading: false, error: 'Failed to load snapshots' });
    }
  },

  // ─── fetchEnpsSurveys ──────────────────────────────────────────────────────
  fetchEnpsSurveys: async (orgId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('cmd_enps_surveys')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({
        enpsSurveys: (data as CmdEnpsSurveyRow[]).map(mapCmdEnpsSurveyRow),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, error: 'Failed to load eNPS surveys' });
    }
  },

  // ─── fetchEnpsResults ─────────────────────────────────────────────────────
  // Queries cmd_enps_results_v.  Sets isEnpsLoading around the request.
  // npsScore remains null when total_responses < min_responses (anonymity guard).
  // Error message is a fixed string — not derived from the Supabase error object.
  fetchEnpsResults: async (orgId) => {
    set({ isEnpsLoading: true, error: null });
    const { data, error } = await supabase
      .from('cmd_enps_results_v')
      .select('*')
      .eq('org_id', orgId);
    if (error) {
      set({ isEnpsLoading: false, error: 'Failed to load eNPS results' });
      return;
    }
    set({
      enpsResults: (data as CmdEnpsResultsRow[]).map(mapCmdEnpsResultsRow),
      isEnpsLoading: false,
    });
  },

  // ─── fetchOrgHealth ────────────────────────────────────────────────────────
  fetchOrgHealth: async (orgId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('cmd_org_health_v')
        .select('*')
        .eq('org_id', orgId);
      if (error) throw error;
      set({
        orgHealth: (data as CmdOrgHealthRow[]).map(mapCmdOrgHealthRow),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, error: 'Failed to load org health data' });
    }
  },

  // ─── createMetricDefinition — PROFESSIONAL+ ───────────────────────────────
  createMetricDefinition: async (orgId, plan, payload) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const { data, error } = await supabase
      .from('cmd_metric_definitions')
      .insert({
        org_id:             orgId,
        metric_category:    payload.metricCategory,
        metric_source:      payload.metricSource,
        display_name:       payload.displayName,
        display_name_th:    payload.displayNameTh   ?? null,
        min_score:          payload.minScore         ?? 0,
        max_score:          payload.maxScore         ?? 100,
        target_score:       payload.targetScore      ?? null,
        warning_threshold:  payload.warningThreshold ?? null,
        critical_threshold: payload.criticalThreshold ?? null,
        health_weight:      payload.healthWeight     ?? 1.0,
        description:        payload.description      ?? null,
      })
      .select()
      .single();

    if (error) {
      set({ error: 'Failed to create metric definition' });
      throw error;
    }

    const definition = mapCmdMetricDefinitionRow(data as CmdMetricDefinitionRow);
    set((state) => ({
      metricDefinitions: [...state.metricDefinitions, definition],
    }));
    return definition;
  },

  // ─── updateMetricDefinition — PROFESSIONAL+ ───────────────────────────────
  updateMetricDefinition: async (orgId, plan, metricId, updates) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.displayName     !== undefined) dbUpdates.display_name      = updates.displayName;
    if (updates.displayNameTh   !== undefined) dbUpdates.display_name_th   = updates.displayNameTh;
    if (updates.targetScore     !== undefined) dbUpdates.target_score      = updates.targetScore;
    if (updates.warningThreshold  !== undefined) dbUpdates.warning_threshold  = updates.warningThreshold;
    if (updates.criticalThreshold !== undefined) dbUpdates.critical_threshold = updates.criticalThreshold;
    if (updates.healthWeight    !== undefined) dbUpdates.health_weight     = updates.healthWeight;
    if (updates.isActive        !== undefined) dbUpdates.is_active         = updates.isActive;
    if (updates.description     !== undefined) dbUpdates.description       = updates.description;

    const { error } = await supabase
      .from('cmd_metric_definitions')
      .update(dbUpdates)
      .eq('id', metricId)
      .eq('org_id', orgId);

    if (error) {
      set({ error: 'Failed to update metric definition' });
      throw error;
    }

    set((state) => ({
      metricDefinitions: state.metricDefinitions.map((m) =>
        m.id === metricId ? { ...m, ...updates } : m,
      ),
    }));
  },

  // ─── recordSnapshot — PROFESSIONAL+ ──────────────────────────────────────
  recordSnapshot: async (orgId, plan, payload) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const { error } = await supabase
      .from('cmd_metric_snapshots')
      .insert({
        org_id:           orgId,
        metric_id:        payload.metricId,
        period_type:      payload.periodType,
        period_label:     payload.periodLabel,
        snapshot_date:    payload.snapshotDate,
        score:            payload.score,
        respondent_count: payload.respondentCount ?? 0,
        notes:            payload.notes            ?? null,
        source_ref_id:    payload.sourceRefId      ?? null,
      });

    if (error) {
      set({ error: 'Failed to record snapshot' });
      throw error;
    }
  },

  // ─── createEnpsSurvey — PROFESSIONAL+ ────────────────────────────────────
  createEnpsSurvey: async (orgId, plan, payload) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const { data, error } = await supabase
      .from('cmd_enps_surveys')
      .insert({
        org_id:            orgId,
        title:             payload.title,
        title_th:          payload.titleTh           ?? null,
        question_text:     payload.questionText       ??
          'คุณมีแนวโน้มแนะนำองค์กรนี้แก่คนรู้จักมากน้อยแค่ไหน? (0–10)',
        followup_question: payload.followupQuestion   ?? null,
        opens_at:          payload.opensAt            ?? null,
        closes_at:         payload.closesAt           ?? null,
        min_responses:     payload.minResponses       ?? 3,
        notes:             payload.notes              ?? null,
      })
      .select()
      .single();

    if (error) {
      set({ error: 'Failed to create eNPS survey' });
      throw error;
    }

    const survey = mapCmdEnpsSurveyRow(data as CmdEnpsSurveyRow);
    set((state) => ({
      enpsSurveys: [survey, ...state.enpsSurveys],
    }));
    return survey;
  },

  // ─── activateEnpsSurvey — PROFESSIONAL+ ──────────────────────────────────
  activateEnpsSurvey: async (orgId, plan, surveyId) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const { error } = await supabase
      .from('cmd_enps_surveys')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', surveyId)
      .eq('org_id', orgId);

    if (error) {
      set({ error: 'Failed to activate survey' });
      throw error;
    }

    set((state) => ({
      enpsSurveys: state.enpsSurveys.map((s) =>
        s.id === surveyId ? { ...s, status: 'ACTIVE' as const } : s,
      ),
    }));
  },

  // ─── closeEnpsSurvey — PROFESSIONAL+ ─────────────────────────────────────
  closeEnpsSurvey: async (orgId, plan, surveyId) => {
    if (!canAccessCultureMetrics(plan)) throw new CultureMetricsPlanGateError(plan);

    const { error } = await supabase
      .from('cmd_enps_surveys')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('id', surveyId)
      .eq('org_id', orgId);

    if (error) {
      set({ error: 'Failed to close survey' });
      throw error;
    }

    set((state) => ({
      enpsSurveys: state.enpsSurveys.map((s) =>
        s.id === surveyId ? { ...s, status: 'CLOSED' as const } : s,
      ),
    }));
  },

  // ─── submitEnpsResponse — plan-gate EXEMPT ────────────────────────────────
  // Anonymous eNPS submission.  No user identity is stored or looked up.
  // supabase.auth.getUser is intentionally NOT called here.
  submitEnpsResponse: async (orgId, payload) => {
    const { error } = await supabase
      .from('cmd_enps_responses')
      .insert({
        org_id:           orgId,
        survey_id:        payload.surveyId,
        score:            payload.score,
        anonymous_token:  payload.anonymousToken,
        followup_text:    payload.followupText    ?? null,
        department_label: payload.departmentLabel ?? null,
      });

    if (error) {
      set({ error: 'Failed to submit eNPS response' });
      throw error;
    }
  },

  // ─── setFilters ───────────────────────────────────────────────────────────
  setFilters: (partial) => {
    set((state) => ({
      filters: { ...state.filters, ...partial },
    }));
  },

  // ─── clearError ───────────────────────────────────────────────────────────
  clearError: () => {
    set({ error: null });
  },
}));
