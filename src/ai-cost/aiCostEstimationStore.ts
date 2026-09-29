/**
 * src/ai-cost/aiCostEstimationStore.ts
 *
 * MONOLITH v17.5 — AI Cost Estimation Module: Zustand store
 *
 * Manages AI cost models, usage logs, task estimates, budget periods,
 * and org-level usage analytics for ENTERPRISE-plan orgs.
 *
 * Plan Gate: ENTERPRISE (enforced on every write action)
 *
 * Actions:
 *   fetchCostModels      — load active cost models for the org
 *   createCostModel      — ENTERPRISE + ADMIN+ — add a new cost model
 *   updateCostModel      — ENTERPRISE + ADMIN+ — update rate/notes
 *   deactivateCostModel  — ENTERPRISE + ADMIN+ — soft-delete a model
 *
 *   logUsage             — ENTERPRISE — append a usage log entry (immutable)
 *   fetchUsageLogs       — load usage logs (own for employees, all for ADMIN+)
 *   fetchUsageSummary    — load monthly aggregated view (ace_usage_summary_v)
 *
 *   createTaskEstimate   — ENTERPRISE — create a pre-task cost estimate
 *   fetchTaskEstimates   — load task estimates for the org
 *   updateActuals        — fill in actual cost + ROI after task completion
 *   fetchTaskRoi         — load ace_task_roi_v for ROI dashboard
 *
 *   fetchBudgetPeriods   — load budget periods for the org
 *   createBudgetPeriod   — ENTERPRISE + ADMIN+ — add a budget period
 *   updateBudgetPeriod   — ENTERPRISE + ADMIN+ — edit budget/threshold
 *
 *   setFilters           — update filter state (no DB call)
 *   clearError           — reset error state
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessAiCostEstimation,
  AiCostEstimationPlanGateError,
  mapCostModelRow,
  mapUsageLogRow,
  mapTaskEstimateRow,
  mapBudgetPeriodRow,
  mapUsageSummaryRow,
  mapTaskRoiRow,
  computeTokenCostUsd,
  usdToThb,
  DEFAULT_AI_COST_FILTERS,
} from './aiCostEstimationTypes';
import type {
  AiCostModel,
  AiUsageLog,
  AiTaskEstimate,
  AiBudgetPeriod,
  AiUsageSummary,
  AiTaskRoi,
  AiCostFilters,
  CreateCostModelPayload,
  LogUsagePayload,
  CreateTaskEstimatePayload,
  UpdateActualsPayload,
  CreateBudgetPeriodPayload,
} from './aiCostEstimationTypes';

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface AiCostEstimationState {
  // ── Data ──────────────────────────────────────────────────────────────────
  costModels: AiCostModel[];
  usageLogs: AiUsageLog[];
  usageSummary: AiUsageSummary[];
  taskEstimates: AiTaskEstimate[];
  taskRoi: AiTaskRoi[];
  budgetPeriods: AiBudgetPeriod[];

  // ── UI state ──────────────────────────────────────────────────────────────
  filters: AiCostFilters;

  // ── Loading flags ─────────────────────────────────────────────────────────
  isLoading: boolean;
  isUsageLoading: boolean;
  isEstimateLoading: boolean;
  isBudgetLoading: boolean;

  // ── Error ─────────────────────────────────────────────────────────────────
  error: string | null;

  // ── Actions: Cost Models ──────────────────────────────────────────────────
  fetchCostModels: (orgId: string) => Promise<void>;
  createCostModel: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateCostModelPayload
  ) => Promise<AiCostModel>;
  updateCostModel: (
    orgId: string,
    orgPlan: OrgPlan | string,
    modelId: string,
    updates: Partial<CreateCostModelPayload>
  ) => Promise<AiCostModel>;
  deactivateCostModel: (
    orgId: string,
    orgPlan: OrgPlan | string,
    modelId: string
  ) => Promise<void>;

  // ── Actions: Usage Logs ───────────────────────────────────────────────────
  logUsage: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: LogUsagePayload
  ) => Promise<AiUsageLog>;
  fetchUsageLogs: (
    orgId: string,
    filters?: Partial<AiCostFilters>
  ) => Promise<void>;
  fetchUsageSummary: (orgId: string) => Promise<void>;

  // ── Actions: Task Estimates ───────────────────────────────────────────────
  createTaskEstimate: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateTaskEstimatePayload
  ) => Promise<AiTaskEstimate>;
  fetchTaskEstimates: (orgId: string) => Promise<void>;
  updateActuals: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: UpdateActualsPayload
  ) => Promise<AiTaskEstimate>;
  fetchTaskRoi: (orgId: string) => Promise<void>;

  // ── Actions: Budget Periods ───────────────────────────────────────────────
  fetchBudgetPeriods: (orgId: string) => Promise<void>;
  createBudgetPeriod: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateBudgetPeriodPayload
  ) => Promise<AiBudgetPeriod>;
  updateBudgetPeriod: (
    orgId: string,
    orgPlan: OrgPlan | string,
    periodId: string,
    updates: Partial<CreateBudgetPeriodPayload>
  ) => Promise<AiBudgetPeriod>;

  // ── Actions: UI ───────────────────────────────────────────────────────────
  setFilters: (updates: Partial<AiCostFilters>) => void;
  clearError: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useAiCostEstimationStore = create<AiCostEstimationState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  costModels: [],
  usageLogs: [],
  usageSummary: [],
  taskEstimates: [],
  taskRoi: [],
  budgetPeriods: [],
  filters: { ...DEFAULT_AI_COST_FILTERS },
  isLoading: false,
  isUsageLoading: false,
  isEstimateLoading: false,
  isBudgetLoading: false,
  error: null,

  // ── clearError ─────────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),

  // ── setFilters ─────────────────────────────────────────────────────────────
  setFilters: (updates) =>
    set((state) => ({ filters: { ...state.filters, ...updates } })),

  // ══════════════════════════════════════════════════════════════════════════
  // COST MODELS
  // ══════════════════════════════════════════════════════════════════════════

  fetchCostModels: async (orgId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ace_cost_models')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('tool', { ascending: true });
      if (error) throw error;
      set({ costModels: (data ?? []).map(mapCostModelRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load cost models' });
    } finally {
      set({ isLoading: false });
    }
  },

  createCostModel: async (orgId, orgPlan, payload) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('ace_cost_models')
      .insert({
        org_id: orgId,
        tool: payload.tool,
        display_name: payload.displayName,
        cost_unit: payload.costUnit,
        rate_usd: payload.rateUsd,
        input_rate_usd: payload.inputRateUsd ?? null,
        output_rate_usd: payload.outputRateUsd ?? null,
        thb_exchange_rate: payload.thbExchangeRate ?? 35.0,
        is_active: true,
        notes: payload.notes ?? null,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const model = mapCostModelRow(data);
    set((state) => ({ costModels: [...state.costModels, model] }));
    return model;
  },

  updateCostModel: async (orgId, orgPlan, modelId, updates) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const patch: Record<string, unknown> = {};
    if (updates.rateUsd !== undefined) patch.rate_usd = updates.rateUsd;
    if (updates.inputRateUsd !== undefined) patch.input_rate_usd = updates.inputRateUsd;
    if (updates.outputRateUsd !== undefined) patch.output_rate_usd = updates.outputRateUsd;
    if (updates.displayName !== undefined) patch.display_name = updates.displayName;
    if (updates.notes !== undefined) patch.notes = updates.notes;

    const { data, error } = await supabase
      .from('ace_cost_models')
      .update(patch)
      .eq('id', modelId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const model = mapCostModelRow(data);
    set((state) => ({
      costModels: state.costModels.map((m) => (m.id === modelId ? model : m)),
    }));
    return model;
  },

  deactivateCostModel: async (orgId, orgPlan, modelId) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const { error } = await supabase
      .from('ace_cost_models')
      .update({ is_active: false })
      .eq('id', modelId)
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
    set((state) => ({
      costModels: state.costModels.filter((m) => m.id !== modelId),
    }));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // USAGE LOGS
  // ══════════════════════════════════════════════════════════════════════════

  logUsage: async (orgId, orgPlan, payload) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }

    // Compute cost from the referenced model
    const model = get().costModels.find((m) => m.id === payload.costModelId);
    let computedCostUsd = 0;
    if (model) {
      if (model.costUnit === 'PER_TOKEN' && payload.inputTokens != null && payload.outputTokens != null) {
        computedCostUsd = computeTokenCostUsd(model, payload.inputTokens, payload.outputTokens);
      } else if (model.costUnit === 'PER_REQUEST') {
        computedCostUsd = model.rateUsd * (payload.requestCount ?? 1);
      } else if (model.costUnit === 'PER_IMAGE' || model.costUnit === 'PER_MINUTE') {
        const qty = model.costUnit === 'PER_IMAGE'
          ? (payload.requestCount ?? 1)
          : (payload.durationMinutes ?? 1);
        computedCostUsd = model.rateUsd * qty;
      } else if (model.costUnit === 'MONTHLY_FLAT') {
        computedCostUsd = model.rateUsd; // flat per session
      }
    }
    const computedCostThb = model
      ? usdToThb(computedCostUsd, model.thbExchangeRate)
      : 0;

    const { data, error } = await supabase
      .from('ace_usage_logs')
      .insert({
        org_id: orgId,
        employee_id: payload.employeeId,
        cost_model_id: payload.costModelId,
        task_category: payload.taskCategory,
        task_ref_id: payload.taskRefId ?? null,
        task_description: payload.taskDescription ?? null,
        input_tokens: payload.inputTokens ?? null,
        output_tokens: payload.outputTokens ?? null,
        request_count: payload.requestCount ?? 1,
        duration_minutes: payload.durationMinutes ?? null,
        computed_cost_usd: computedCostUsd,
        computed_cost_thb: computedCostThb,
        time_saved_minutes: payload.timeSavedMinutes ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const log = mapUsageLogRow(data);
    set((state) => ({ usageLogs: [log, ...state.usageLogs] }));
    return log;
  },

  fetchUsageLogs: async (orgId, filters) => {
    set({ isUsageLoading: true, error: null });
    try {
      let query = supabase
        .from('ace_usage_logs')
        .select('*')
        .eq('org_id', orgId)
        .order('logged_at', { ascending: false })
        .limit(200);

      const activeFilters = { ...get().filters, ...filters };
      if (activeFilters.employeeId) {
        query = query.eq('employee_id', activeFilters.employeeId);
      }
      if (activeFilters.taskCategory !== 'ALL') {
        query = query.eq('task_category', activeFilters.taskCategory);
      }
      if (activeFilters.fromDate) {
        query = query.gte('logged_at', activeFilters.fromDate);
      }
      if (activeFilters.toDate) {
        query = query.lte('logged_at', activeFilters.toDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ usageLogs: (data ?? []).map(mapUsageLogRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load usage logs' });
    } finally {
      set({ isUsageLoading: false });
    }
  },

  fetchUsageSummary: async (orgId) => {
    set({ isUsageLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ace_usage_summary_v')
        .select('*')
        .eq('org_id', orgId)
        .order('usage_month', { ascending: false });
      if (error) throw error;
      set({ usageSummary: (data ?? []).map(mapUsageSummaryRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load usage summary' });
    } finally {
      set({ isUsageLoading: false });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TASK ESTIMATES
  // ══════════════════════════════════════════════════════════════════════════

  createTaskEstimate: async (orgId, orgPlan, payload) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    set({ isEstimateLoading: true, error: null });
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Compute estimated cost from selected models
      const models = get().costModels.filter((m) => payload.costModelIds.includes(m.id));
      let estCostUsd = 0;
      for (const model of models) {
        if (model.costUnit === 'PER_TOKEN' && payload.estInputTokens != null && payload.estOutputTokens != null) {
          estCostUsd += computeTokenCostUsd(model, payload.estInputTokens, payload.estOutputTokens);
        } else if (model.costUnit === 'PER_REQUEST') {
          estCostUsd += model.rateUsd * (payload.estRequests ?? 1);
        } else if (model.costUnit === 'PER_IMAGE' || model.costUnit === 'PER_MINUTE') {
          const qty = model.costUnit === 'PER_IMAGE'
            ? (payload.estRequests ?? 1)
            : (payload.estDurationMinutes ?? 1);
          estCostUsd += model.rateUsd * qty;
        } else if (model.costUnit === 'MONTHLY_FLAT') {
          estCostUsd += model.rateUsd;
        }
      }
      // Use first model's exchange rate, or default
      const exchangeRate = models[0]?.thbExchangeRate ?? 35.0;
      const estCostThb = usdToThb(estCostUsd, exchangeRate);
      const estRoiPct =
        payload.manualCostThb && payload.manualCostThb > 0
          ? ((payload.manualCostThb - estCostThb) / payload.manualCostThb) * 100
          : null;

      const { data, error } = await supabase
        .from('ace_task_estimates')
        .insert({
          org_id: orgId,
          created_by: userData?.user?.id ?? null,
          task_category: payload.taskCategory,
          task_description: payload.taskDescription,
          task_ref_id: payload.taskRefId ?? null,
          cost_model_ids: payload.costModelIds,
          est_input_tokens: payload.estInputTokens ?? null,
          est_output_tokens: payload.estOutputTokens ?? null,
          est_requests: payload.estRequests ?? 1,
          est_duration_minutes: payload.estDurationMinutes ?? null,
          est_cost_usd: estCostUsd,
          est_cost_thb: estCostThb,
          manual_cost_thb: payload.manualCostThb ?? null,
          manual_time_min: payload.manualTimeMin ?? null,
          est_roi_pct: estRoiPct,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const estimate = mapTaskEstimateRow(data);
      set((state) => ({ taskEstimates: [estimate, ...state.taskEstimates] }));
      return estimate;
    } finally {
      set({ isEstimateLoading: false });
    }
  },

  fetchTaskEstimates: async (orgId) => {
    set({ isEstimateLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ace_task_estimates')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ taskEstimates: (data ?? []).map(mapTaskEstimateRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load task estimates' });
    } finally {
      set({ isEstimateLoading: false });
    }
  },

  updateActuals: async (orgId, orgPlan, payload) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const { data, error } = await supabase
      .from('ace_task_estimates')
      .update({
        actual_cost_usd: payload.actualCostUsd,
        actual_cost_thb: payload.actualCostThb,
        actual_roi_pct: payload.actualRoiPct ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', payload.estimateId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const estimate = mapTaskEstimateRow(data);
    set((state) => ({
      taskEstimates: state.taskEstimates.map((e) =>
        e.id === payload.estimateId ? estimate : e
      ),
    }));
    return estimate;
  },

  fetchTaskRoi: async (orgId) => {
    set({ isEstimateLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ace_task_roi_v')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ taskRoi: (data ?? []).map(mapTaskRoiRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load ROI data' });
    } finally {
      set({ isEstimateLoading: false });
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BUDGET PERIODS
  // ══════════════════════════════════════════════════════════════════════════

  fetchBudgetPeriods: async (orgId) => {
    set({ isBudgetLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('ace_budget_periods')
        .select('*')
        .eq('org_id', orgId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      set({ budgetPeriods: (data ?? []).map(mapBudgetPeriodRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load budget periods' });
    } finally {
      set({ isBudgetLoading: false });
    }
  },

  createBudgetPeriod: async (orgId, orgPlan, payload) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('ace_budget_periods')
      .insert({
        org_id: orgId,
        period_type: payload.periodType,
        period_label: payload.periodLabel,
        start_date: payload.startDate,
        end_date: payload.endDate,
        budget_usd: payload.budgetUsd,
        budget_thb: payload.budgetThb,
        alert_threshold: payload.alertThreshold ?? 0.80,
        notes: payload.notes ?? null,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const period = mapBudgetPeriodRow(data);
    set((state) => ({ budgetPeriods: [period, ...state.budgetPeriods] }));
    return period;
  },

  updateBudgetPeriod: async (orgId, orgPlan, periodId, updates) => {
    if (!canAccessAiCostEstimation(orgPlan)) {
      throw new AiCostEstimationPlanGateError(orgPlan as string);
    }
    const patch: Record<string, unknown> = {};
    if (updates.budgetUsd !== undefined) patch.budget_usd = updates.budgetUsd;
    if (updates.budgetThb !== undefined) patch.budget_thb = updates.budgetThb;
    if (updates.alertThreshold !== undefined) patch.alert_threshold = updates.alertThreshold;
    if (updates.notes !== undefined) patch.notes = updates.notes;

    const { data, error } = await supabase
      .from('ace_budget_periods')
      .update(patch)
      .eq('id', periodId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const period = mapBudgetPeriodRow(data);
    set((state) => ({
      budgetPeriods: state.budgetPeriods.map((p) => (p.id === periodId ? period : p)),
    }));
    return period;
  },
}));

export default useAiCostEstimationStore;
