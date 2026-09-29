/**
 * src/ai-scheduler/aiSchedulerStore.ts
 *
 * MONOLITH v17.5 — AI Production Scheduler Module: Zustand store
 *
 * Manages machine configurations, production runs, schedule items,
 * and scheduling constraints for the AI-assisted production floor scheduler.
 *
 * Plan Gate: ENTERPRISE (enforced on every write action)
 *
 * Actions:
 *   fetchMachineConfigs    — load active machine configs for the org
 *   createMachineConfig    — ENTERPRISE — add a new machine config
 *   updateMachineConfig    — ENTERPRISE — edit capacity / setup time
 *
 *   fetchProductionRuns    — load runs for the org (with filter support)
 *   createProductionRun    — ENTERPRISE — create a new DRAFT run
 *   approveRun             — ENTERPRISE — set run status to APPROVED
 *   cancelRun              — ENTERPRISE — set run status to CANCELLED
 *
 *   fetchScheduleItems     — load items for a specific run
 *   addScheduleItem        — ENTERPRISE — append an item to a run
 *   updateItemStatus       — ENTERPRISE — progress or override an item
 *
 *   fetchConstraints       — load scheduling constraints (org-wide or per-run)
 *   createConstraint       — ENTERPRISE — add a new constraint
 *   deactivateConstraint   — ENTERPRISE — soft-delete a constraint
 *
 *   fetchScheduleSummary   — load aps_schedule_summary_v for the org
 *   fetchMachineUtilisation — load aps_machine_utilisation_v (optionally per run)
 *
 *   setFilters             — update filter state (no DB call)
 *   clearError             — reset error state
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import {
  canAccessAiScheduler,
  AiSchedulerPlanGateError,
  mapMachineConfigRow,
  mapProductionRunRow,
  mapScheduleItemRow,
  mapSchedulingConstraintRow,
  mapScheduleSummaryRow,
  mapMachineUtilisationRow,
  DEFAULT_APS_FILTERS,
} from './aiSchedulerTypes';
import type {
  ApsMachineConfig,
  ApsProductionRun,
  ApsScheduleItem,
  ApsSchedulingConstraint,
  ApsScheduleSummary,
  ApsMachineUtilisation,
  ApsFilters,
  CreateMachineConfigPayload,
  CreateProductionRunPayload,
  AddScheduleItemPayload,
  UpdateItemStatusPayload,
  CreateConstraintPayload,
} from './aiSchedulerTypes';

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface AiSchedulerState {
  // ── Data ──────────────────────────────────────────────────────────────────
  machineConfigs: ApsMachineConfig[];
  productionRuns: ApsProductionRun[];
  scheduleItems: ApsScheduleItem[];
  constraints: ApsSchedulingConstraint[];
  scheduleSummary: ApsScheduleSummary[];
  machineUtilisation: ApsMachineUtilisation[];

  // ── UI state ──────────────────────────────────────────────────────────────
  filters: ApsFilters;

  // ── Loading flags ─────────────────────────────────────────────────────────
  isLoading: boolean;
  isRunLoading: boolean;
  isItemLoading: boolean;

  // ── Error ─────────────────────────────────────────────────────────────────
  error: string | null;

  // ── Actions: Machine Configs ──────────────────────────────────────────────
  fetchMachineConfigs: (orgId: string) => Promise<void>;
  createMachineConfig: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateMachineConfigPayload
  ) => Promise<ApsMachineConfig>;
  updateMachineConfig: (
    orgId: string,
    orgPlan: OrgPlan | string,
    configId: string,
    updates: Partial<CreateMachineConfigPayload>
  ) => Promise<ApsMachineConfig>;

  // ── Actions: Production Runs ──────────────────────────────────────────────
  fetchProductionRuns: (orgId: string) => Promise<void>;
  createProductionRun: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateProductionRunPayload
  ) => Promise<ApsProductionRun>;
  approveRun: (
    orgId: string,
    orgPlan: OrgPlan | string,
    runId: string
  ) => Promise<ApsProductionRun>;
  cancelRun: (
    orgId: string,
    orgPlan: OrgPlan | string,
    runId: string
  ) => Promise<void>;

  // ── Actions: Schedule Items ───────────────────────────────────────────────
  fetchScheduleItems: (orgId: string, runId: string) => Promise<void>;
  addScheduleItem: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: AddScheduleItemPayload
  ) => Promise<ApsScheduleItem>;
  updateItemStatus: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: UpdateItemStatusPayload
  ) => Promise<ApsScheduleItem>;

  // ── Actions: Constraints ──────────────────────────────────────────────────
  fetchConstraints: (orgId: string, runId?: string) => Promise<void>;
  createConstraint: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateConstraintPayload
  ) => Promise<ApsSchedulingConstraint>;
  deactivateConstraint: (
    orgId: string,
    orgPlan: OrgPlan | string,
    constraintId: string
  ) => Promise<void>;

  // ── Actions: Views ────────────────────────────────────────────────────────
  fetchScheduleSummary: (orgId: string) => Promise<void>;
  fetchMachineUtilisation: (orgId: string, runId?: string) => Promise<void>;

  // ── Actions: UI ───────────────────────────────────────────────────────────
  setFilters: (updates: Partial<ApsFilters>) => void;
  clearError: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useAiSchedulerStore = create<AiSchedulerState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  machineConfigs: [],
  productionRuns: [],
  scheduleItems: [],
  constraints: [],
  scheduleSummary: [],
  machineUtilisation: [],
  filters: { ...DEFAULT_APS_FILTERS },
  isLoading: false,
  isRunLoading: false,
  isItemLoading: false,
  error: null,

  // ── clearError ─────────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),

  // ── setFilters ─────────────────────────────────────────────────────────────
  setFilters: (updates) =>
    set((state) => ({ filters: { ...state.filters, ...updates } })),

  // ══════════════════════════════════════════════════════════════════════════
  // MACHINE CONFIGS
  // ══════════════════════════════════════════════════════════════════════════

  fetchMachineConfigs: async (orgId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('aps_machine_configs')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_name', { ascending: true });
      if (error) throw error;
      set({ machineConfigs: (data ?? []).map(mapMachineConfigRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load machine configs' });
    } finally {
      set({ isLoading: false });
    }
  },

  createMachineConfig: async (orgId, orgPlan, payload) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('aps_machine_configs')
      .insert({
        org_id: orgId,
        machine_type: payload.machineType,
        display_name: payload.displayName,
        daily_capacity_hrs: payload.dailyCapacityHrs ?? 8.0,
        setup_time_min: payload.setupTimeMin ?? 15,
        max_concurrent_jobs: payload.maxConcurrentJobs ?? 1,
        scheduling_weight: payload.schedulingWeight ?? 1.0,
        is_active: true,
        notes: payload.notes ?? null,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const config = mapMachineConfigRow(data);
    set((state) => ({ machineConfigs: [...state.machineConfigs, config] }));
    return config;
  },

  updateMachineConfig: async (orgId, orgPlan, configId, updates) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const patch: Record<string, unknown> = {};
    if (updates.dailyCapacityHrs !== undefined) patch.daily_capacity_hrs = updates.dailyCapacityHrs;
    if (updates.setupTimeMin !== undefined) patch.setup_time_min = updates.setupTimeMin;
    if (updates.maxConcurrentJobs !== undefined) patch.max_concurrent_jobs = updates.maxConcurrentJobs;
    if (updates.schedulingWeight !== undefined) patch.scheduling_weight = updates.schedulingWeight;
    if (updates.displayName !== undefined) patch.display_name = updates.displayName;
    if (updates.notes !== undefined) patch.notes = updates.notes;

    const { data, error } = await supabase
      .from('aps_machine_configs')
      .update(patch)
      .eq('id', configId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const config = mapMachineConfigRow(data);
    set((state) => ({
      machineConfigs: state.machineConfigs.map((c) => (c.id === configId ? config : c)),
    }));
    return config;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PRODUCTION RUNS
  // ══════════════════════════════════════════════════════════════════════════

  fetchProductionRuns: async (orgId) => {
    set({ isRunLoading: true, error: null });
    try {
      const filters = get().filters;
      let query = supabase
        .from('aps_production_runs')
        .select('*')
        .eq('org_id', orgId)
        .order('schedule_date', { ascending: false })
        .limit(100);

      if (filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters.scheduleMode !== 'ALL') {
        query = query.eq('schedule_mode', filters.scheduleMode);
      }
      if (filters.fromDate) {
        query = query.gte('schedule_date', filters.fromDate);
      }
      if (filters.toDate) {
        query = query.lte('schedule_date', filters.toDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ productionRuns: (data ?? []).map(mapProductionRunRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load production runs' });
    } finally {
      set({ isRunLoading: false });
    }
  },

  createProductionRun: async (orgId, orgPlan, payload) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('aps_production_runs')
      .insert({
        org_id: orgId,
        run_label: payload.runLabel,
        schedule_date: payload.scheduleDate,
        status: 'DRAFT',
        schedule_mode: payload.scheduleMode ?? 'AUTO',
        notes: payload.notes ?? null,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const run = mapProductionRunRow(data);
    set((state) => ({ productionRuns: [run, ...state.productionRuns] }));
    return run;
  },

  approveRun: async (orgId, orgPlan, runId) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('aps_production_runs')
      .update({
        status: 'APPROVED',
        approved_by: userData?.user?.id ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const run = mapProductionRunRow(data);
    set((state) => ({
      productionRuns: state.productionRuns.map((r) => (r.id === runId ? run : r)),
    }));
    return run;
  },

  cancelRun: async (orgId, orgPlan, runId) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { error } = await supabase
      .from('aps_production_runs')
      .update({ status: 'CANCELLED' })
      .eq('id', runId)
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
    set((state) => ({
      productionRuns: state.productionRuns.map((r) =>
        r.id === runId ? { ...r, status: 'CANCELLED' as const } : r
      ),
    }));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SCHEDULE ITEMS
  // ══════════════════════════════════════════════════════════════════════════

  fetchScheduleItems: async (orgId, runId) => {
    set({ isItemLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('aps_schedule_items')
        .select('*')
        .eq('org_id', orgId)
        .eq('run_id', runId)
        .order('sequence_order', { ascending: true });
      if (error) throw error;
      set({ scheduleItems: (data ?? []).map(mapScheduleItemRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load schedule items' });
    } finally {
      set({ isItemLoading: false });
    }
  },

  addScheduleItem: async (orgId, orgPlan, payload) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    // Default sequence_order to end of current item list for this run
    const currentItems = get().scheduleItems.filter((i) => i.runId === payload.runId);
    const nextOrder = payload.sequenceOrder ?? currentItems.length + 1;

    const { data, error } = await supabase
      .from('aps_schedule_items')
      .insert({
        org_id: orgId,
        run_id: payload.runId,
        job_label: payload.jobLabel,
        priority: payload.priority ?? 'NORMAL',
        status: 'PENDING',
        machine_config_id: payload.machineConfigId ?? null,
        job_ref_id: payload.jobRefId ?? null,
        est_duration_min: payload.estDurationMin,
        scheduled_start: payload.scheduledStart ?? null,
        scheduled_end: payload.scheduledEnd ?? null,
        depends_on: payload.dependsOn ?? [],
        ai_rationale: payload.aiRationale ?? null,
        is_overridden: false,
        override_reason: null,
        sequence_order: nextOrder,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const item = mapScheduleItemRow(data);
    set((state) => ({ scheduleItems: [...state.scheduleItems, item] }));
    return item;
  },

  updateItemStatus: async (orgId, orgPlan, payload) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const patch: Record<string, unknown> = {
      status: payload.status,
    };
    if (payload.actualStart !== undefined) patch.actual_start = payload.actualStart;
    if (payload.actualEnd !== undefined) patch.actual_end = payload.actualEnd;
    if (payload.overrideReason !== undefined) {
      patch.is_overridden = true;
      patch.override_reason = payload.overrideReason;
    }

    const { data, error } = await supabase
      .from('aps_schedule_items')
      .update(patch)
      .eq('id', payload.itemId)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const item = mapScheduleItemRow(data);
    set((state) => ({
      scheduleItems: state.scheduleItems.map((i) => (i.id === payload.itemId ? item : i)),
    }));
    return item;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTRAINTS
  // ══════════════════════════════════════════════════════════════════════════

  fetchConstraints: async (orgId, runId) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('aps_scheduling_constraints')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (runId) {
        query = query.eq('run_id', runId);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ constraints: (data ?? []).map(mapSchedulingConstraintRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load constraints' });
    } finally {
      set({ isLoading: false });
    }
  },

  createConstraint: async (orgId, orgPlan, payload) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('aps_scheduling_constraints')
      .insert({
        org_id: orgId,
        constraint_type: payload.constraintType,
        run_id: payload.runId ?? null,
        machine_config_id: payload.machineConfigId ?? null,
        job_ref_id: payload.jobRefId ?? null,
        job_ref_id_b: payload.jobRefIdB ?? null,
        window_start: payload.windowStart ?? null,
        window_end: payload.windowEnd ?? null,
        capacity_value: payload.capacityValue ?? null,
        priority_value: payload.priorityValue ?? null,
        deadline_value: payload.deadlineValue ?? null,
        custom_note: payload.customNote ?? null,
        is_active: true,
        created_by: userData?.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const constraint = mapSchedulingConstraintRow(data);
    set((state) => ({ constraints: [constraint, ...state.constraints] }));
    return constraint;
  },

  deactivateConstraint: async (orgId, orgPlan, constraintId) => {
    if (!canAccessAiScheduler(orgPlan)) {
      throw new AiSchedulerPlanGateError(orgPlan as string);
    }
    const { error } = await supabase
      .from('aps_scheduling_constraints')
      .update({ is_active: false })
      .eq('id', constraintId)
      .eq('org_id', orgId);
    if (error) throw new Error(error.message);
    set((state) => ({
      constraints: state.constraints.filter((c) => c.id !== constraintId),
    }));
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ══════════════════════════════════════════════════════════════════════════

  fetchScheduleSummary: async (orgId) => {
    set({ isRunLoading: true, error: null });
    try {
      const filters = get().filters;
      let query = supabase
        .from('aps_schedule_summary_v')
        .select('*')
        .eq('org_id', orgId)
        .order('schedule_date', { ascending: false })
        .limit(100);

      if (filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }
      if (filters.fromDate) {
        query = query.gte('schedule_date', filters.fromDate);
      }
      if (filters.toDate) {
        query = query.lte('schedule_date', filters.toDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ scheduleSummary: (data ?? []).map(mapScheduleSummaryRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load schedule summary' });
    } finally {
      set({ isRunLoading: false });
    }
  },

  fetchMachineUtilisation: async (orgId, runId) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('aps_machine_utilisation_v')
        .select('*')
        .eq('org_id', orgId)
        .order('schedule_date', { ascending: false });

      if (runId) {
        query = query.eq('run_id', runId);
      }
      if (get().filters.machineConfigId) {
        query = query.eq('machine_config_id', get().filters.machineConfigId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ machineUtilisation: (data ?? []).map(mapMachineUtilisationRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load machine utilisation' });
    } finally {
      set({ isLoading: false });
    }
  },
}));

export default useAiSchedulerStore;
