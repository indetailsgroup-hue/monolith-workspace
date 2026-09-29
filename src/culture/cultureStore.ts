// =============================================================================
// src/culture/cultureStore.ts
// MONOLITH v16.0 — Culture Module: Psychological Safety Zustand Store
//
// ANONYMITY GUARANTEE:
//   • ps_survey_responses: no user_id column in DB schema
//   • anonymous_feedback:  no user_id column in DB schema
//   • anonymous_token:     generated via crypto.randomUUID() client-side,
//     persisted in localStorage (LocalSurveyState), never tied to auth.uid()
//
// HIGH POWER DISTANCE CONTEXT (Thailand):
//   • Survey responses aggregated before any metric is exposed (≥3 required)
//   • Feedback content never linked to identity at rest or in transit
//   • Privacy threshold enforced at both DB (CHECK constraint) and app layer
//
// Store: 'monolith-culture-store'
// Persist: surveyTemplates, psScores, localSurveyStates
// Exclude:  anonymousFeedback, dashboardMetrics, loading flags, error
// =============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../core/supabase';
import {
  DEFAULT_PS_QUESTIONS,
  PS_MINIMUM_RESPONSE_COUNT,
  THAI_MANUFACTURING_PS_BENCHMARK,
  mapPsSurveyTemplateRow,
  mapPsScoreRow,
  mapAnonymousFeedbackRow,
  computePsScore,
  computeDashboardMetrics,
  generatePeriodLabel,
} from './types';
import type {
  PsSurveyTemplate,
  PsScore,
  AnonymousFeedback,
  PsDashboardMetrics,
  LocalSurveyState,
  CreatePsSurveyTemplateInput,
  UpdatePsSurveyTemplateInput,
  SubmitSurveyResponseInput,
  SubmitFeedbackInput,
  ActionFeedbackInput,
  PsSurveyTemplateRow,
  PsSurveyResponseRow,
  PsScoreRow,
  AnonymousFeedbackRow,
  PsDimension,
  FeedbackCategory,
  SurveyStatus,
  PsSurveyAnswer,
} from './types';

// ============================================================
// STATE INTERFACE
// ============================================================

interface CultureState {
  // Remote data
  surveyTemplates: PsSurveyTemplate[];
  activeSurvey: PsSurveyTemplate | null;
  psScores: PsScore[];
  anonymousFeedback: AnonymousFeedback[];
  dashboardMetrics: PsDashboardMetrics | null;

  // Local-only state (persisted in localStorage; never synced to server)
  localSurveyStates: LocalSurveyState[];

  // 10 granular loading flags
  loadingTemplates:   boolean;
  loadingScores:      boolean;
  loadingFeedback:    boolean;
  loadingActiveSurvey: boolean;
  creatingTemplate:   boolean;
  updatingTemplate:   boolean;
  submittingResponse: boolean;
  submittingFeedback: boolean;
  computingScore:     boolean;
  actioningFeedback:  boolean;

  // Error
  error: string | null;
}

// ============================================================
// ACTIONS INTERFACE
// ============================================================

interface CultureActions {
  // Survey Templates
  fetchSurveyTemplates:  (orgId: string) => Promise<void>;
  fetchActiveSurvey:     (orgId: string) => Promise<void>;
  createSurveyTemplate:  (orgId: string, input: CreatePsSurveyTemplateInput) => Promise<PsSurveyTemplate | null>;
  updateSurveyTemplate:  (input: UpdatePsSurveyTemplateInput) => Promise<PsSurveyTemplate | null>;
  activateSurveyTemplate:(orgId: string, templateId: string) => Promise<boolean>;

  // Responses (anonymous)
  submitSurveyResponse:    (orgId: string, input: SubmitSurveyResponseInput) => Promise<boolean>;
  hasSubmittedThisPeriod:  (surveyId: string, periodLabel: string) => boolean;
  getOrCreateAnonymousToken:(surveyId: string, periodLabel: string) => string;

  // Scores
  fetchPsScores:      (orgId: string, surveyId?: string) => Promise<void>;
  computeAndSaveScore:(orgId: string, surveyId: string, periodLabel: string) => Promise<PsScore | null>;

  // Anonymous Feedback
  fetchAnonymousFeedback:(orgId: string) => Promise<void>;
  submitFeedback:        (orgId: string, input: SubmitFeedbackInput) => Promise<boolean>;
  actionFeedback:        (input: ActionFeedbackInput) => Promise<boolean>;

  // Dashboard
  refreshDashboard:(orgId: string, surveyId?: string) => Promise<void>;

  // Utilities
  clearError: () => void;
  reset:      () => void;
}

// ============================================================
// INITIAL STATE
// ============================================================

const initialState: CultureState = {
  surveyTemplates:     [],
  activeSurvey:        null,
  psScores:            [],
  anonymousFeedback:   [],
  dashboardMetrics:    null,
  localSurveyStates:   [],
  loadingTemplates:    false,
  loadingScores:       false,
  loadingFeedback:     false,
  loadingActiveSurvey: false,
  creatingTemplate:    false,
  updatingTemplate:    false,
  submittingResponse:  false,
  submittingFeedback:  false,
  computingScore:      false,
  actioningFeedback:   false,
  error:               null,
};

// ============================================================
// STORE
// ============================================================

export const useCultureStore = create<CultureState & CultureActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // --------------------------------------------------------
      // SURVEY TEMPLATES
      // --------------------------------------------------------

      fetchSurveyTemplates: async (orgId: string) => {
        set({ loadingTemplates: true, error: null });
        try {
          const { data, error } = await supabase
            .from('ps_survey_templates')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          const templates = (data as PsSurveyTemplateRow[]).map(mapPsSurveyTemplateRow);
          set({ surveyTemplates: templates });
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch survey templates' });
        } finally {
          set({ loadingTemplates: false });
        }
      },

      fetchActiveSurvey: async (orgId: string) => {
        set({ loadingActiveSurvey: true, error: null });
        try {
          const { data, error } = await supabase
            .from('ps_survey_templates')
            .select('*')
            .eq('org_id', orgId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

          if (error) throw error;

          set({
            activeSurvey: data
              ? mapPsSurveyTemplateRow(data as PsSurveyTemplateRow)
              : null,
          });
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch active survey' });
        } finally {
          set({ loadingActiveSurvey: false });
        }
      },

      createSurveyTemplate: async (
        orgId: string,
        input: CreatePsSurveyTemplateInput
      ): Promise<PsSurveyTemplate | null> => {
        set({ creatingTemplate: true, error: null });
        try {
          const { data, error } = await supabase
            .from('ps_survey_templates')
            .insert({
              org_id:      orgId,
              title:       input.title,
              description: input.description ?? null,
              questions:   input.questions ?? DEFAULT_PS_QUESTIONS,
              period_type: input.periodType,
              status:      'DRAFT',
            })
            .select()
            .single();

          if (error) throw error;

          const template = mapPsSurveyTemplateRow(data as PsSurveyTemplateRow);
          set((state) => ({
            surveyTemplates: [template, ...state.surveyTemplates],
          }));
          return template;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to create survey template' });
          return null;
        } finally {
          set({ creatingTemplate: false });
        }
      },

      updateSurveyTemplate: async (
        input: UpdatePsSurveyTemplateInput
      ): Promise<PsSurveyTemplate | null> => {
        set({ updatingTemplate: true, error: null });
        try {
          const updates: Record<string, unknown> = {};
          if (input.title       !== undefined) updates.title       = input.title;
          if (input.description !== undefined) updates.description = input.description;
          if (input.questions   !== undefined) updates.questions   = input.questions;
          if (input.periodType  !== undefined) updates.period_type = input.periodType;
          if (input.status      !== undefined) updates.status      = input.status;

          const { data, error } = await supabase
            .from('ps_survey_templates')
            .update(updates)
            .eq('id', input.id)
            .select()
            .single();

          if (error) throw error;

          const template = mapPsSurveyTemplateRow(data as PsSurveyTemplateRow);
          set((state) => ({
            surveyTemplates: state.surveyTemplates.map((t) =>
              t.id === template.id ? template : t
            ),
            activeSurvey:
              state.activeSurvey?.id === template.id ? template : state.activeSurvey,
          }));
          return template;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to update survey template' });
          return null;
        } finally {
          set({ updatingTemplate: false });
        }
      },

      activateSurveyTemplate: async (
        orgId: string,
        templateId: string
      ): Promise<boolean> => {
        set({ updatingTemplate: true, error: null });
        try {
          // Close any existing ACTIVE template first
          // (partial unique index at DB ensures at most one ACTIVE per org,
          //  but we close here to avoid a transient conflict window)
          await supabase
            .from('ps_survey_templates')
            .update({ status: 'CLOSED' })
            .eq('org_id', orgId)
            .eq('status', 'ACTIVE')
            .neq('id', templateId);

          const { data, error } = await supabase
            .from('ps_survey_templates')
            .update({ status: 'ACTIVE' })
            .eq('id', templateId)
            .eq('org_id', orgId)
            .select()
            .single();

          if (error) throw error;

          const template = mapPsSurveyTemplateRow(data as PsSurveyTemplateRow);
          set((state) => ({
            activeSurvey: template,
            surveyTemplates: state.surveyTemplates.map((t) => {
              if (t.id === templateId) return template;
              if (t.status === 'ACTIVE') return { ...t, status: 'CLOSED' as SurveyStatus };
              return t;
            }),
          }));
          return true;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to activate survey template' });
          return false;
        } finally {
          set({ updatingTemplate: false });
        }
      },

      // --------------------------------------------------------
      // RESPONSES (ANONYMOUS)
      // --------------------------------------------------------

      submitSurveyResponse: async (
        orgId: string,
        input: SubmitSurveyResponseInput
      ): Promise<boolean> => {
        set({ submittingResponse: true, error: null });
        try {
          // Client-side duplicate guard
          if (get().hasSubmittedThisPeriod(input.surveyId, input.periodLabel)) {
            throw new Error('คุณได้ส่งแบบสำรวจสำหรับรอบนี้แล้ว');
          }

          const { error } = await supabase
            .from('ps_survey_responses')
            .insert({
              org_id:          orgId,
              survey_id:       input.surveyId,
              period_label:    input.periodLabel,
              answers:         input.answers,
              anonymous_token: input.anonymousToken,
              // NO user_id — anonymity guaranteed at schema level
            });

          if (error) throw error;

          // Record submission in localStorage only (never synced to server)
          const localState: LocalSurveyState = {
            surveyId:       input.surveyId,
            periodLabel:    input.periodLabel,
            anonymousToken: input.anonymousToken,
            submittedAt:    new Date().toISOString(),
          };

          set((state) => ({
            localSurveyStates: [
              ...state.localSurveyStates.filter(
                (s) => !(s.surveyId === input.surveyId && s.periodLabel === input.periodLabel)
              ),
              localState,
            ],
          }));

          return true;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to submit survey response' });
          return false;
        } finally {
          set({ submittingResponse: false });
        }
      },

      /** Returns true if this device has already submitted for the given survey+period */
      hasSubmittedThisPeriod: (surveyId: string, periodLabel: string): boolean => {
        return get().localSurveyStates.some(
          (s) => s.surveyId === surveyId && s.periodLabel === periodLabel
        );
      },

      /**
       * Returns the existing anonymous_token for this survey+period (if already submitted),
       * otherwise generates a new one via crypto.randomUUID().
       * Token is NOT stored until submitSurveyResponse succeeds.
       */
      getOrCreateAnonymousToken: (surveyId: string, periodLabel: string): string => {
        const existing = get().localSurveyStates.find(
          (s) => s.surveyId === surveyId && s.periodLabel === periodLabel
        );
        return existing?.anonymousToken ?? crypto.randomUUID();
      },

      // --------------------------------------------------------
      // SCORES
      // --------------------------------------------------------

      fetchPsScores: async (orgId: string, surveyId?: string) => {
        set({ loadingScores: true, error: null });
        try {
          let query = supabase
            .from('ps_scores')
            .select('*')
            .eq('org_id', orgId)
            .order('computed_at', { ascending: false });

          if (surveyId) {
            query = query.eq('survey_id', surveyId);
          }

          const { data, error } = await query;
          if (error) throw error;

          set({ psScores: (data as PsScoreRow[]).map(mapPsScoreRow) });
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch PS scores' });
        } finally {
          set({ loadingScores: false });
        }
      },

      /**
       * Fetch all responses for the given survey+period, aggregate answers,
       * compute PS score, and upsert to ps_scores.
       *
       * Privacy threshold: aborts with an error message if response count < PS_MINIMUM_RESPONSE_COUNT (3).
       */
      computeAndSaveScore: async (
        orgId: string,
        surveyId: string,
        periodLabel: string
      ): Promise<PsScore | null> => {
        set({ computingScore: true, error: null });
        try {
          // Fetch response answers (anonymous — no user_id)
          const { data: responseData, error: responseError } = await supabase
            .from('ps_survey_responses')
            .select('answers')
            .eq('org_id', orgId)
            .eq('survey_id', surveyId)
            .eq('period_label', periodLabel);

          if (responseError) throw responseError;

          const responseCount = responseData?.length ?? 0;

          // Enforce privacy threshold at application layer (DB CHECK also enforces at INSERT)
          if (responseCount < PS_MINIMUM_RESPONSE_COUNT) {
            throw new Error(
              `ต้องการอย่างน้อย ${PS_MINIMUM_RESPONSE_COUNT} การตอบกลับเพื่อคำนวณคะแนน ` +
              `(ปัจจุบัน: ${responseCount})`
            );
          }

          // Resolve questions from cached template or active survey
          const template =
            get().surveyTemplates.find((t) => t.id === surveyId) ??
            get().activeSurvey;
          const questions = template?.questions ?? DEFAULT_PS_QUESTIONS;
          const periodType = template?.periodType ?? 'MONTHLY';

          // Aggregate: compute per-question averages across all responses
          const allAnswers = (responseData as { answers: PsSurveyAnswer[] }[]).flatMap(
            (r) => r.answers
          );

          const questionTotals: Record<string, number[]> = {};
          for (const answer of allAnswers) {
            if (!questionTotals[answer.questionId]) {
              questionTotals[answer.questionId] = [];
            }
            questionTotals[answer.questionId].push(answer.value);
          }

          const avgAnswers: PsSurveyAnswer[] = Object.entries(questionTotals).map(
            ([questionId, values]) => ({
              questionId,
              value: values.reduce((a, b) => a + b, 0) / values.length,
            })
          );

          const result = computePsScore(avgAnswers, questions);
          if (!result) throw new Error('Failed to compute PS score — no valid answers');

          // Upsert score (UNIQUE: org_id, survey_id, period_label)
          const { data: scoreData, error: scoreError } = await supabase
            .from('ps_scores')
            .upsert(
              {
                org_id:           orgId,
                survey_id:        surveyId,
                period_label:     periodLabel,
                period_type:      periodType,
                score:            result.score,
                dimension_scores: result.dimensionScores,
                response_count:   responseCount,
                computed_at:      new Date().toISOString(),
              },
              { onConflict: 'org_id,survey_id,period_label' }
            )
            .select()
            .single();

          if (scoreError) throw scoreError;

          const score = mapPsScoreRow(scoreData as PsScoreRow);

          // Replace any existing entry for this period in local state
          set((state) => ({
            psScores: [
              score,
              ...state.psScores.filter(
                (s) =>
                  !(
                    s.orgId === orgId &&
                    s.surveyId === surveyId &&
                    s.periodLabel === periodLabel
                  )
              ),
            ],
          }));

          return score;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to compute PS score' });
          return null;
        } finally {
          set({ computingScore: false });
        }
      },

      // --------------------------------------------------------
      // ANONYMOUS FEEDBACK
      // --------------------------------------------------------

      fetchAnonymousFeedback: async (orgId: string) => {
        set({ loadingFeedback: true, error: null });
        try {
          const { data, error } = await supabase
            .from('anonymous_feedback')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          set({
            anonymousFeedback: (data as AnonymousFeedbackRow[]).map(mapAnonymousFeedbackRow),
          });
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch anonymous feedback' });
        } finally {
          set({ loadingFeedback: false });
        }
      },

      submitFeedback: async (
        orgId: string,
        input: SubmitFeedbackInput
      ): Promise<boolean> => {
        set({ submittingFeedback: true, error: null });
        try {
          const { error } = await supabase.from('anonymous_feedback').insert({
            org_id:        orgId,
            category:      input.category,
            sentiment:     input.sentiment,
            content:       input.content,
            action_status: 'PENDING',
            // NO user_id — anonymity guaranteed at schema level
          });

          if (error) throw error;
          return true;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to submit feedback' });
          return false;
        } finally {
          set({ submittingFeedback: false });
        }
      },

      actionFeedback: async (input: ActionFeedbackInput): Promise<boolean> => {
        set({ actioningFeedback: true, error: null });
        try {
          const { data: { user } } = await supabase.auth.getUser();

          const { data, error } = await supabase
            .from('anonymous_feedback')
            .update({
              action_status: input.actionStatus,
              action_note:   input.actionNote ?? null,
              actioned_by:   user?.id ?? null,
              actioned_at:   new Date().toISOString(),
            })
            .eq('id', input.feedbackId)
            .select()
            .single();

          if (error) throw error;

          const updated = mapAnonymousFeedbackRow(data as AnonymousFeedbackRow);
          set((state) => ({
            anonymousFeedback: state.anonymousFeedback.map((f) =>
              f.id === updated.id ? updated : f
            ),
          }));
          return true;
        } catch (err: unknown) {
          set({ error: err instanceof Error ? err.message : 'Failed to action feedback' });
          return false;
        } finally {
          set({ actioningFeedback: false });
        }
      },

      // --------------------------------------------------------
      // DASHBOARD
      // --------------------------------------------------------

      refreshDashboard: async (orgId: string, surveyId?: string) => {
        await get().fetchPsScores(orgId, surveyId);
        await get().fetchAnonymousFeedback(orgId);

        const { psScores, anonymousFeedback } = get();

        const filteredScores = surveyId
          ? psScores.filter((s) => s.surveyId === surveyId)
          : psScores;

        const pendingFeedbackCount = anonymousFeedback.filter(
          (f) => f.actionStatus === 'PENDING'
        ).length;

        set({ dashboardMetrics: computeDashboardMetrics(filteredScores, pendingFeedbackCount) });
      },

      // --------------------------------------------------------
      // UTILITIES
      // --------------------------------------------------------

      clearError: () => set({ error: null }),

      reset: () => set(initialState),
    }),
    {
      name: 'monolith-culture-store',
      partialize: (state) => ({
        // Persist: lightweight lookup tables + local anonymity state
        surveyTemplates:   state.surveyTemplates,
        psScores:          state.psScores,
        localSurveyStates: state.localSurveyStates,
        // Excluded from persist:
        //   anonymousFeedback  — sensitive; always fetch fresh
        //   dashboardMetrics   — computed; always recalculate
        //   activeSurvey       — derived from surveyTemplates on fetchActiveSurvey
        //   all loading flags  — transient
        //   error              — transient
      }),
    }
  )
);

// ============================================================
// SELECTORS
// ============================================================

/** The currently active PS survey template (null if none active) */
export const selectActiveSurvey = (state: CultureState) => state.activeSurvey;

/**
 * PS score history formatted for a line/bar chart.
 * Sorted ascending by period label (lexicographic — works for '2568-Q1', '2568-Q2' etc.)
 * Each entry includes a benchmark line value for overlay.
 */
export const selectScoresForChart = (state: CultureState) =>
  [...state.psScores]
    .sort((a, b) => a.periodLabel.localeCompare(b.periodLabel))
    .map((s) => ({
      period:    s.periodLabel,
      score:     s.score,
      benchmark: THAI_MANUFACTURING_PS_BENCHMARK,
    }));

/** All anonymous feedback items awaiting action */
export const selectPendingFeedback = (state: CultureState) =>
  state.anonymousFeedback.filter((f) => f.actionStatus === 'PENDING');

/** Factory selector: feedback filtered by a specific category */
export const selectFeedbackByCategory =
  (category: FeedbackCategory) =>
  (state: CultureState) =>
    state.anonymousFeedback.filter((f) => f.category === category);

/** Whether the latest PS score meets or exceeds the Thai manufacturing benchmark */
export const selectIsAboveBenchmark = (state: CultureState) =>
  state.dashboardMetrics?.isAboveBenchmark ?? false;

/** True when any async operation is in progress */
export const selectIsAnyLoading = (state: CultureState) =>
  state.loadingTemplates    ||
  state.loadingScores       ||
  state.loadingFeedback     ||
  state.loadingActiveSurvey ||
  state.creatingTemplate    ||
  state.updatingTemplate    ||
  state.submittingResponse  ||
  state.submittingFeedback  ||
  state.computingScore      ||
  state.actioningFeedback;

/**
 * The current period label for the active survey (Buddhist Era).
 * Returns null if no active survey is loaded.
 * Example: 'MONTHLY' on 2026-08-28 → '2569-08'
 */
export const selectCurrentPeriodLabel = (state: CultureState): string | null => {
  const survey = state.activeSurvey;
  if (!survey) return null;
  return generatePeriodLabel(new Date(), survey.periodType);
};
