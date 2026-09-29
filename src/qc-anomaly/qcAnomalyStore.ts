/**
 * qcAnomalyStore.ts
 * Zustand store for the QC Anomaly Detection module (MONOLITH v18.0)
 * All 8 write actions are gated behind the ENTERPRISE plan.
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessQcAnomaly,
  QcAnomalyPlanGateError,
  DEFAULT_QCA_FILTERS,
  mapQcaThresholdConfigRow,
  mapQcaMeasurementRow,
  mapQcaAnomalyEventRow,
  mapQcaAnomalySummaryRow,
  type QcaThresholdConfig,
  type QcaThresholdConfigRow,
  type QcaMeasurement,
  type QcaMeasurementRow,
  type QcaAnomalyEvent,
  type QcaAnomalyEventRow,
  type QcaAnomalySummary,
  type QcaAnomalySummaryRow,
  type QcaFilters,
  type CreateQcaThresholdPayload,
  type UpdateQcaThresholdPayload,
  type SubmitQcaMeasurementPayload,
} from './qcAnomalyTypes';

// ─── State & Actions Interfaces ───────────────────────────────────────────────

interface QcAnomalyState {
  thresholds:          QcaThresholdConfig[];
  anomalies:           QcaAnomalyEvent[];
  summaries:           QcaAnomalySummary[];
  recentMeasurements:  QcaMeasurement[];
  selectedAnomalyId:   string | null;
  isLoading:           boolean;
  isMeasurementLoading: boolean;
  filters:             QcaFilters;
  error:               string | null;
}

interface QcAnomalyActions {
  // ── ENTERPRISE-gated write actions ──────────────────────────────────────────
  fetchThresholds:    (orgId: string, orgPlan: OrgPlan) => Promise<void>;
  createThreshold:    (payload: CreateQcaThresholdPayload, orgPlan: OrgPlan) => Promise<void>;
  updateThreshold:    (thresholdId: string, payload: UpdateQcaThresholdPayload, orgPlan: OrgPlan) => Promise<void>;
  deleteThreshold:    (thresholdId: string, orgPlan: OrgPlan) => Promise<void>;
  fetchAnomalies:     (orgId: string, orgPlan: OrgPlan) => Promise<void>;
  acknowledgeAnomaly: (anomalyId: string, orgPlan: OrgPlan) => Promise<void>;
  resolveAnomaly:     (anomalyId: string, orgPlan: OrgPlan) => Promise<void>;
  submitMeasurement:  (payload: SubmitQcaMeasurementPayload, orgPlan: OrgPlan) => Promise<void>;
  // ── UI helpers ───────────────────────────────────────────────────────────────
  selectAnomaly: (anomalyId: string | null) => void;
  setFilters:    (partial: Partial<QcaFilters>) => void;
  clearError:    () => void;
}

type QcAnomalyStore = QcAnomalyState & QcAnomalyActions;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useQcAnomalyStore = create<QcAnomalyStore>((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────────
  thresholds:           [],
  anomalies:            [],
  summaries:            [],
  recentMeasurements:   [],
  selectedAnomalyId:    null,
  isLoading:            false,
  isMeasurementLoading: false,
  filters:              DEFAULT_QCA_FILTERS,
  error:                null,

  // ── fetchThresholds ──────────────────────────────────────────────────────────
  fetchThresholds: async (orgId, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('qca_threshold_configs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({
      thresholds: (data as QcaThresholdConfigRow[]).map(mapQcaThresholdConfigRow),
      isLoading:  false,
    });
  },

  // ── createThreshold ──────────────────────────────────────────────────────────
  createThreshold: async (payload, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('qca_threshold_configs')
      .insert(payload)
      .select()
      .single();

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    const created = mapQcaThresholdConfigRow(data as QcaThresholdConfigRow);
    set((state) => ({
      thresholds: [created, ...state.thresholds],
      isLoading:  false,
    }));
  },

  // ── updateThreshold ──────────────────────────────────────────────────────────
  updateThreshold: async (thresholdId, payload, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('qca_threshold_configs')
      .update(payload)
      .eq('id', thresholdId)
      .select()
      .single();

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    const updated = mapQcaThresholdConfigRow(data as QcaThresholdConfigRow);
    set((state) => ({
      thresholds: state.thresholds.map((t) => (t.id === thresholdId ? updated : t)),
      isLoading:  false,
    }));
  },

  // ── deleteThreshold (local cleanup — no re-fetch) ────────────────────────────
  deleteThreshold: async (thresholdId, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isLoading: true, error: null });

    const { error } = await supabase
      .from('qca_threshold_configs')
      .delete()
      .eq('id', thresholdId);

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set((state) => ({
      thresholds: state.thresholds.filter((t) => t.id !== thresholdId),
      isLoading:  false,
    }));
  },

  // ── fetchAnomalies (parallel: events + summary view) ─────────────────────────
  fetchAnomalies: async (orgId, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isLoading: true, error: null });

    const [anomalyResult, summaryResult] = await Promise.all([
      supabase
        .from('qca_anomaly_events')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('qca_anomaly_summary_v')
        .select('*')
        .eq('org_id', orgId),
    ]);

    if (anomalyResult.error || summaryResult.error) {
      set({
        isLoading: false,
        error: (anomalyResult.error ?? summaryResult.error)!.message,
      });
      return;
    }
    set({
      anomalies:  (anomalyResult.data as QcaAnomalyEventRow[]).map(mapQcaAnomalyEventRow),
      summaries:  (summaryResult.data as QcaAnomalySummaryRow[]).map(mapQcaAnomalySummaryRow),
      isLoading:  false,
    });
  },

  // ── acknowledgeAnomaly (optimistic → rollback to OPEN on error) ──────────────
  acknowledgeAnomaly: async (anomalyId, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();

    // Optimistic update
    set((state) => ({
      anomalies: state.anomalies.map((a) =>
        a.id === anomalyId ? { ...a, status: 'ACKNOWLEDGED' as const } : a
      ),
      error: null,
    }));

    const { error } = await supabase
      .from('qca_anomaly_events')
      .update({ status: 'ACKNOWLEDGED' })
      .eq('id', anomalyId);

    if (error) {
      // Rollback to OPEN
      set((state) => ({
        anomalies: state.anomalies.map((a) =>
          a.id === anomalyId ? { ...a, status: 'OPEN' as const } : a
        ),
        error: error.message,
      }));
    }
  },

  // ── resolveAnomaly (optimistic → rollback to OPEN on error) ─────────────────
  resolveAnomaly: async (anomalyId, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();

    // Optimistic update
    set((state) => ({
      anomalies: state.anomalies.map((a) =>
        a.id === anomalyId ? { ...a, status: 'RESOLVED' as const } : a
      ),
      error: null,
    }));

    const { error } = await supabase
      .from('qca_anomaly_events')
      .update({ status: 'RESOLVED' })
      .eq('id', anomalyId);

    if (error) {
      // Rollback to OPEN
      set((state) => ({
        anomalies: state.anomalies.map((a) =>
          a.id === anomalyId ? { ...a, status: 'OPEN' as const } : a
        ),
        error: error.message,
      }));
    }
  },

  // ── submitMeasurement (insert → re-fetch anomalies; keep last 50) ────────────
  submitMeasurement: async (payload, orgPlan) => {
    if (!canAccessQcAnomaly(orgPlan)) throw new QcAnomalyPlanGateError();
    set({ isMeasurementLoading: true, error: null });

    const { data, error } = await supabase
      .from('qca_measurements')
      .insert(payload)
      .select()
      .single();

    if (error) {
      set({ isMeasurementLoading: false, error: error.message });
      return;
    }
    const newMeasurement = mapQcaMeasurementRow(data as QcaMeasurementRow);
    set((state) => ({
      recentMeasurements:   [newMeasurement, ...state.recentMeasurements].slice(0, 50),
      isMeasurementLoading: false,
    }));

    // Re-fetch anomalies so auto-detected events appear immediately
    await get().fetchAnomalies(payload.org_id, orgPlan);
  },

  // ── UI helpers ───────────────────────────────────────────────────────────────
  selectAnomaly: (anomalyId) => set({ selectedAnomalyId: anomalyId }),

  setFilters: (partial) =>
    set((state) => ({ filters: { ...state.filters, ...partial } })),

  clearError: () => set({ error: null }),
}));
