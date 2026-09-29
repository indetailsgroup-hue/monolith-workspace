/**
 * src/training/superEmployeeStore.ts
 *
 * MONOLITH v17.5 — Super Employee Tracker: Zustand store
 *
 * Manages AI Readiness stage history, assessments, skill gaps, and
 * org-level AI readiness analytics for DAPH Decor employees.
 *
 * Plan Gate: PROFESSIONAL+ (enforced per write action)
 *
 * Actions:
 *   fetchStageHistory       — load stage history for one employee
 *   fetchAssessments        — load assessments for one employee
 *   fetchSkillGaps          — load skill gaps for one employee
 *   fetchEmployeeReadiness  — load current stage from employee_ai_readiness_v
 *   fetchOrgReadiness       — load org-level summary from org_ai_readiness_summary_v
 *   recordStageTransition   — PROFESSIONAL+ — log a new stage entry
 *   createAssessment        — PROFESSIONAL+ — create a periodic AI assessment
 *   addSkillGap             — PROFESSIONAL+ — log an identified skill gap
 *   resolveSkillGap         — PROFESSIONAL+ — mark a skill gap as resolved
 *   clearError              — reset error state
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type { OrgPlan } from '../tenant/types';
import { STAGE_SCORE_MAP } from './superEmployeeTypes';
import {
  canAccessSuperEmployeeTracker,
  SuperEmployeeTrackerPlanGateError,
  mapAssessmentRow,
  mapStageHistoryRow,
  mapSkillGapRow,
  mapReadinessRow,
  mapOrgSummaryRow,
} from './superEmployeeTypes';
import type {
  AiAssessment,
  StageHistoryEntry,
  SkillGap,
  EmployeeAiReadiness,
  OrgAiReadinessSummary,
  RecordStageTransitionPayload,
  CreateAssessmentPayload,
  AddSkillGapPayload,
} from './superEmployeeTypes';

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface SuperEmployeeState {
  // ── Data ──────────────────────────────────────────────────────────────────
  stageHistory: StageHistoryEntry[];
  assessments: AiAssessment[];
  skillGaps: SkillGap[];
  employeeReadiness: EmployeeAiReadiness | null;
  orgReadiness: OrgAiReadinessSummary | null;

  // ── Loading flags ─────────────────────────────────────────────────────────
  isLoading: boolean;
  isAssessmentLoading: boolean;
  isOrgLoading: boolean;

  // ── Error ─────────────────────────────────────────────────────────────────
  error: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  fetchStageHistory: (orgId: string, employeeId: string) => Promise<void>;
  fetchAssessments: (orgId: string, employeeId: string) => Promise<void>;
  fetchSkillGaps: (orgId: string, employeeId: string, resolvedOnly?: boolean) => Promise<void>;
  fetchEmployeeReadiness: (orgId: string, employeeId: string) => Promise<void>;
  fetchOrgReadiness: (orgId: string) => Promise<void>;

  recordStageTransition: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: RecordStageTransitionPayload
  ) => Promise<StageHistoryEntry>;

  createAssessment: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: CreateAssessmentPayload
  ) => Promise<AiAssessment>;

  addSkillGap: (
    orgId: string,
    orgPlan: OrgPlan | string,
    payload: AddSkillGapPayload
  ) => Promise<SkillGap>;

  resolveSkillGap: (
    orgId: string,
    orgPlan: OrgPlan | string,
    gapId: string
  ) => Promise<void>;

  clearError: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useSuperEmployeeStore = create<SuperEmployeeState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  stageHistory: [],
  assessments: [],
  skillGaps: [],
  employeeReadiness: null,
  orgReadiness: null,
  isLoading: false,
  isAssessmentLoading: false,
  isOrgLoading: false,
  error: null,

  // ── clearError ─────────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),

  // ── fetchStageHistory ──────────────────────────────────────────────────────
  fetchStageHistory: async (orgId, employeeId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('employee_stage_history')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_id', employeeId)
        .order('scored_at', { ascending: false });

      if (error) throw error;

      set({ stageHistory: (data ?? []).map(mapStageHistoryRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch stage history' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── fetchAssessments ───────────────────────────────────────────────────────
  fetchAssessments: async (orgId, employeeId) => {
    set({ isAssessmentLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('employee_ai_assessments')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_id', employeeId)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      set({ assessments: (data ?? []).map(mapAssessmentRow) });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch assessments',
      });
    } finally {
      set({ isAssessmentLoading: false });
    }
  },

  // ── fetchSkillGaps ─────────────────────────────────────────────────────────
  fetchSkillGaps: async (orgId, employeeId, resolvedOnly = false) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('employee_skill_gaps')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

      if (!resolvedOnly) {
        query = query.eq('resolved', false);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({ skillGaps: (data ?? []).map(mapSkillGapRow) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch skill gaps' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── fetchEmployeeReadiness ─────────────────────────────────────────────────
  fetchEmployeeReadiness: async (orgId, employeeId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('employee_ai_readiness_v')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_id', employeeId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

      set({ employeeReadiness: data ? mapReadinessRow(data) : null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch employee readiness',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── fetchOrgReadiness ──────────────────────────────────────────────────────
  fetchOrgReadiness: async (orgId) => {
    set({ isOrgLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('org_ai_readiness_summary_v')
        .select('*')
        .eq('org_id', orgId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      set({ orgReadiness: data ? mapOrgSummaryRow(data) : null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch org readiness' });
    } finally {
      set({ isOrgLoading: false });
    }
  },

  // ── recordStageTransition ──────────────────────────────────────────────────
  recordStageTransition: async (orgId, orgPlan, payload) => {
    if (!canAccessSuperEmployeeTracker(orgPlan)) {
      throw new SuperEmployeeTrackerPlanGateError(orgPlan);
    }

    const stageScore = STAGE_SCORE_MAP[payload.stage] ?? 0;

    const { data, error } = await supabase
      .from('employee_stage_history')
      .insert({
        org_id: orgId,
        employee_id: payload.employeeId,
        stage: payload.stage,
        stage_score: stageScore,
        assessment_id: payload.assessmentId ?? null,
        changed_by: (await supabase.auth.getUser()).data.user?.id ?? '',
        notes: payload.notes ?? null,
        scored_at: payload.scoredAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const entry = mapStageHistoryRow(data);

    // Optimistic prepend to stageHistory
    set((state) => ({
      stageHistory: [entry, ...state.stageHistory],
      // Update employeeReadiness if it's for the same employee
      employeeReadiness:
        state.employeeReadiness?.employeeId === payload.employeeId
          ? {
              ...state.employeeReadiness,
              currentStage: payload.stage,
              currentScore: stageScore,
              lastAssessedAt: entry.scoredAt,
            }
          : state.employeeReadiness,
    }));

    return entry;
  },

  // ── createAssessment ───────────────────────────────────────────────────────
  createAssessment: async (orgId, orgPlan, payload) => {
    if (!canAccessSuperEmployeeTracker(orgPlan)) {
      throw new SuperEmployeeTrackerPlanGateError(orgPlan);
    }

    const { data, error } = await supabase
      .from('employee_ai_assessments')
      .insert({
        org_id: orgId,
        employee_id: payload.employeeId,
        assessor_id: payload.assessorId,
        stage_at_assessment: payload.stageAtAssessment,
        score: payload.score,
        strengths: payload.strengths ?? [],
        gaps: payload.gaps ?? [],
        ai_tools_used: payload.aiToolsUsed ?? [],
        completed_at: payload.completedAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    const assessment = mapAssessmentRow(data);

    // Prepend to assessments list
    set((state) => ({ assessments: [assessment, ...state.assessments] }));

    return assessment;
  },

  // ── addSkillGap ────────────────────────────────────────────────────────────
  addSkillGap: async (orgId, orgPlan, payload) => {
    if (!canAccessSuperEmployeeTracker(orgPlan)) {
      throw new SuperEmployeeTrackerPlanGateError(orgPlan);
    }

    const { data, error } = await supabase
      .from('employee_skill_gaps')
      .insert({
        org_id: orgId,
        employee_id: payload.employeeId,
        stage_required: payload.stageRequired,
        skill_name: payload.skillName,
        skill_description: payload.skillDescription ?? null,
        resolved: false,
      })
      .select()
      .single();

    if (error) throw error;

    const gap = mapSkillGapRow(data);

    // Optimistic prepend
    set((state) => ({ skillGaps: [gap, ...state.skillGaps] }));

    return gap;
  },

  // ── resolveSkillGap ────────────────────────────────────────────────────────
  resolveSkillGap: async (orgId, orgPlan, gapId) => {
    if (!canAccessSuperEmployeeTracker(orgPlan)) {
      throw new SuperEmployeeTrackerPlanGateError(orgPlan);
    }

    const resolvedAt = new Date().toISOString();

    const { error } = await supabase
      .from('employee_skill_gaps')
      .update({ resolved: true, resolved_at: resolvedAt })
      .eq('id', gapId)
      .eq('org_id', orgId);

    if (error) throw error;

    // Optimistic update in store
    set((state) => ({
      skillGaps: state.skillGaps.map((g) =>
        g.id === gapId ? { ...g, resolved: true, resolvedAt } : g
      ),
    }));
  },
}));

export default useSuperEmployeeStore;
