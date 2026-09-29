/**
 * src/training/trainingStore.ts
 *
 * MONOLITH v17.5 — Training Tracker Zustand Store
 *
 * Plan Gate: PROFESSIONAL+ (all write operations + analytics enforce the gate)
 *
 * Key actions:
 *   fetchCourses      — load org + global course catalogue with optional filters
 *   fetchCourseById   — load a single course record by id
 *   enroll            — enrol one employee in a course
 *   bulkEnroll        — enrol multiple employees in one course
 *   logCompletion     — record a training completion with optional score
 *   verifyCompletion  — ADMIN+ mark a completion as verified
 *   fetchEnrollments  — load enrollments for the org with filter support
 *   fetchEmployeeSummary — load per-employee progress from training_summary_v
 *   fetchCourseStats  — load per-course aggregates from training_course_stats_v
 *   createCourse / updateCourse / deleteCourse — course CRUD (ADMIN+)
 *
 * Schema: supabase/migrations/20270101_training_tracker.sql
 */

import { create } from 'zustand';
import { supabase } from '../core/supabase';
import type {
  TrainingCourse,
  TrainingCourseSummary,
  TrainingCourseInput,
  TrainingCourseFilters,
  TrainingEnrollment,
  TrainingEnrollmentInput,
  BulkEnrollmentInput,
  TrainingCompletion,
  TrainingCompletionInput,
  TrainingVerificationInput,
  TrainingEnrollmentFilters,
  TrainingEmployeeSummary,
  TrainingCourseStats,
  TrainingTrackerState,
} from './trainingTypes';
import {
  canAccessTrainingTracker,
  DEFAULT_TRAINING_COURSE_FILTERS,
  DEFAULT_ENROLLMENT_FILTERS,
} from './trainingTypes';
import type { OrgPlan } from '../tenant/types';

// ============================================================================
// PLAN GATE ERROR
// ============================================================================

/**
 * Thrown when a store action is called for an org that does not meet
 * the PROFESSIONAL+ plan gate required by Training Tracker.
 */
export class TrainingPlanGateError extends Error {
  constructor(currentPlan: OrgPlan) {
    super(
      `Training Tracker ต้องการ plan PROFESSIONAL+ (แผนปัจจุบัน: ${currentPlan})`
    );
    this.name = 'TrainingPlanGateError';
  }
}

// ============================================================================
// STORE ACTIONS INTERFACE
// ============================================================================

interface TrainingStoreActions {
  // ── Courses ──────────────────────────────────────────────────────────────
  /** Load org-specific + global courses; applies filters from state or `filters` override. */
  fetchCourses: (orgId: string, filters?: TrainingCourseFilters) => Promise<void>;
  /** Load a single course by id into `selectedCourse`. */
  fetchCourseById: (courseId: string) => Promise<void>;
  /** Create a new org-specific course (ADMIN+, PROFESSIONAL+). */
  createCourse: (orgId: string, orgPlan: OrgPlan, input: TrainingCourseInput) => Promise<TrainingCourse>;
  /** Update fields on an existing course (ADMIN+, PROFESSIONAL+). */
  updateCourse: (courseId: string, orgPlan: OrgPlan, updates: Partial<TrainingCourseInput>) => Promise<void>;
  /** Delete a course; removes it from state immediately (optimistic). */
  deleteCourse: (courseId: string, orgPlan: OrgPlan) => Promise<void>;

  // ── Enrollments ──────────────────────────────────────────────────────────
  /** Load enrollments for the org with optional filter overrides. */
  fetchEnrollments: (orgId: string, filters?: TrainingEnrollmentFilters) => Promise<void>;
  /** Enrol a single employee in a course (PROFESSIONAL+). */
  enroll: (orgId: string, orgPlan: OrgPlan, input: TrainingEnrollmentInput) => Promise<TrainingEnrollment>;
  /** Enrol multiple employees in the same course in one DB round-trip (PROFESSIONAL+). */
  bulkEnroll: (orgId: string, orgPlan: OrgPlan, input: BulkEnrollmentInput) => Promise<TrainingEnrollment[]>;
  /** Set an enrollment's status to CANCELLED (PROFESSIONAL+). */
  cancelEnrollment: (enrollmentId: string, orgPlan: OrgPlan) => Promise<void>;

  // ── Completions ──────────────────────────────────────────────────────────
  /**
   * Record a training completion.
   * `is_passed` is computed server-side by the `tt_set_completion_passed` trigger.
   * The enrollment's status is synced to COMPLETED by `tt_sync_enrollment_completed`.
   * (PROFESSIONAL+)
   */
  logCompletion: (orgId: string, orgPlan: OrgPlan, input: TrainingCompletionInput) => Promise<TrainingCompletion>;
  /** Mark a completion record as verified by an ADMIN (PROFESSIONAL+). */
  verifyCompletion: (orgId: string, orgPlan: OrgPlan, input: TrainingVerificationInput) => Promise<void>;

  // ── Analytics / summaries ────────────────────────────────────────────────
  /** Load per-employee progress from `training_summary_v` (PROFESSIONAL+). */
  fetchEmployeeSummary: (orgId: string, orgPlan: OrgPlan, employeeId?: string) => Promise<void>;
  /** Load per-course aggregate stats from `training_course_stats_v` (PROFESSIONAL+). */
  fetchCourseStats: (orgId: string, orgPlan: OrgPlan) => Promise<void>;

  // ── Filters ──────────────────────────────────────────────────────────────
  /** Merge partial course filters into state (triggers re-fetch manually). */
  setCourseFilters: (filters: Partial<TrainingCourseFilters>) => void;
  /** Merge partial enrollment filters into state. */
  setEnrollmentFilters: (filters: Partial<TrainingEnrollmentFilters>) => void;

  // ── State management ─────────────────────────────────────────────────────
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: TrainingTrackerState = {
  courses: [],
  selectedCourse: null,
  courseFilters: { ...DEFAULT_TRAINING_COURSE_FILTERS },
  enrollments: [],
  enrollmentFilters: { ...DEFAULT_ENROLLMENT_FILTERS },
  completions: [],
  employeeSummaries: [],
  courseStats: [],
  isLoading: false,
  isEnrollmentLoading: false,
  error: null,
};

// ============================================================================
// STORE
// ============================================================================

export const useTrainingStore = create<TrainingTrackerState & TrainingStoreActions>()(
  (set, get) => ({
    ...initialState,

    // ── fetchCourses ────────────────────────────────────────────────────────
    async fetchCourses(orgId, filters) {
      set({ isLoading: true, error: null });
      try {
        const { category, requiredForStage, isActive, isGlobal, search } =
          filters ?? get().courseFilters;

        let query = supabase
          .from('training_courses')
          .select(
            'id,org_id,title,category,plan_gate,duration_hours,passing_score,' +
            'required_for_stage,is_active,is_global,version,tags,' +
            'created_by,created_at,updated_at'
          )
          // Org-specific courses for this org OR any global seed course
          .or(`org_id.eq.${orgId},is_global.eq.true`)
          .order('category')
          .order('title');

        if (category)               query = query.eq('category', category);
        if (requiredForStage)       query = query.eq('required_for_stage', requiredForStage);
        if (isActive !== undefined) query = query.eq('is_active', isActive);
        if (isGlobal !== undefined) query = query.eq('is_global', isGlobal);
        if (search)                 query = query.ilike('title', `%${search}%`);

        const { data, error } = await query;
        if (error) throw error;

        set({
          courses: (data ?? []) as unknown as TrainingCourseSummary[],
          isLoading: false,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด courses ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── fetchCourseById ─────────────────────────────────────────────────────
    async fetchCourseById(courseId) {
      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('training_courses')
          .select('*')
          .eq('id', courseId)
          .single();

        if (error) throw error;

        set({ selectedCourse: data as unknown as TrainingCourse, isLoading: false });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด course ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── createCourse (PROFESSIONAL+) ────────────────────────────────────────
    async createCourse(orgId, orgPlan, input) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { data, error } = await supabase
        .from('training_courses')
        .insert({
          org_id: orgId,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          plan_gate: 'PROFESSIONAL',
          duration_hours: input.durationHours ?? null,
          passing_score: input.passingScore ?? null,
          required_for_stage: input.requiredForStage ?? null,
          tags: input.tags ?? [],
          external_url: input.externalUrl ?? null,
          thumbnail_url: input.thumbnailUrl ?? null,
          is_global: false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh the course catalogue after creation
      await get().fetchCourses(orgId);
      return data as unknown as TrainingCourse;
    },

    // ── updateCourse (PROFESSIONAL+) ────────────────────────────────────────
    async updateCourse(courseId, orgPlan, updates) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { error } = await supabase
        .from('training_courses')
        .update({
          ...(updates.title && { title: updates.title }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.category && { category: updates.category }),
          ...(updates.durationHours !== undefined && { duration_hours: updates.durationHours }),
          ...(updates.passingScore !== undefined && { passing_score: updates.passingScore }),
          ...(updates.requiredForStage !== undefined && {
            required_for_stage: updates.requiredForStage,
          }),
          ...(updates.tags && { tags: updates.tags }),
          ...(updates.externalUrl !== undefined && { external_url: updates.externalUrl }),
          ...(updates.thumbnailUrl !== undefined && { thumbnail_url: updates.thumbnailUrl }),
        })
        .eq('id', courseId);

      if (error) throw error;

      // Refresh the selected course with updated data
      await get().fetchCourseById(courseId);
    },

    // ── deleteCourse (PROFESSIONAL+) ────────────────────────────────────────
    async deleteCourse(courseId, orgPlan) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { error } = await supabase
        .from('training_courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;

      // Optimistic removal from state
      set((state) => ({
        courses: state.courses.filter((c) => c.id !== courseId),
        selectedCourse:
          state.selectedCourse?.id === courseId ? null : state.selectedCourse,
      }));
    },

    // ── fetchEnrollments ────────────────────────────────────────────────────
    async fetchEnrollments(orgId, filters) {
      set({ isEnrollmentLoading: true, error: null });
      try {
        const { status, courseId, employeeId, overdueOnly } =
          filters ?? get().enrollmentFilters;

        let query = supabase
          .from('training_enrollments')
          .select(`
            *,
            course:training_courses(
              id,org_id,title,category,plan_gate,duration_hours,
              passing_score,required_for_stage,is_active,is_global,
              version,tags,created_by,created_at,updated_at
            )
          `)
          .eq('org_id', orgId)
          .order('enrolled_at', { ascending: false });

        if (status)     query = query.eq('status', status);
        if (courseId)   query = query.eq('course_id', courseId);
        if (employeeId) query = query.eq('employee_id', employeeId);
        if (overdueOnly) {
          const today = new Date().toISOString().slice(0, 10);
          query = query
            .lt('due_date', today)
            .not('status', 'in', '("COMPLETED","CANCELLED")');
        }

        const { data, error } = await query;
        if (error) throw error;

        set({
          enrollments: (data ?? []) as unknown as TrainingEnrollment[],
          isEnrollmentLoading: false,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด enrollments ไม่สำเร็จ',
          isEnrollmentLoading: false,
        });
      }
    },

    // ── enroll (PROFESSIONAL+) ──────────────────────────────────────────────
    async enroll(orgId, orgPlan, input) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { data, error } = await supabase
        .from('training_enrollments')
        .insert({
          org_id: orgId,
          course_id: input.courseId,
          employee_id: input.employeeId,
          due_date: input.dueDate ?? null,
          notes: input.notes ?? null,
          status: 'ENROLLED',
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as TrainingEnrollment;
    },

    // ── bulkEnroll (PROFESSIONAL+) ──────────────────────────────────────────
    async bulkEnroll(orgId, orgPlan, input) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const rows = input.employeeIds.map((employeeId) => ({
        org_id: orgId,
        course_id: input.courseId,
        employee_id: employeeId,
        due_date: input.dueDate ?? null,
        notes: input.notes ?? null,
        status: 'ENROLLED',
      }));

      const { data, error } = await supabase
        .from('training_enrollments')
        .insert(rows)
        .select();

      if (error) throw error;
      return (data ?? []) as unknown as TrainingEnrollment[];
    },

    // ── cancelEnrollment (PROFESSIONAL+) ────────────────────────────────────
    async cancelEnrollment(enrollmentId, orgPlan) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { error } = await supabase
        .from('training_enrollments')
        .update({ status: 'CANCELLED' })
        .eq('id', enrollmentId);

      if (error) throw error;

      // Optimistic status update in state
      set((state) => ({
        enrollments: state.enrollments.map((e) =>
          e.id === enrollmentId ? { ...e, status: 'CANCELLED' as const } : e
        ),
      }));
    },

    // ── logCompletion (PROFESSIONAL+) ───────────────────────────────────────
    async logCompletion(orgId, orgPlan, input) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { data, error } = await supabase
        .from('training_completions')
        .insert({
          org_id: orgId,
          course_id: input.courseId,
          enrollment_id: input.enrollmentId,
          employee_id: input.employeeId,
          completed_at: input.completedAt ?? new Date().toISOString(),
          score: input.score ?? null,
          evidence_url: input.evidenceUrl ?? null,
          evidence_notes: input.evidenceNotes ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      const completion = data as unknown as TrainingCompletion;

      // Append to completions list + sync enrollment status
      // (server triggers handle DB-level sync; this mirrors it in UI state)
      set((state) => ({
        completions: [...state.completions, completion],
        enrollments: state.enrollments.map((e) =>
          e.id === input.enrollmentId
            ? { ...e, status: 'COMPLETED' as const }
            : e
        ),
      }));

      return completion;
    },

    // ── verifyCompletion (PROFESSIONAL+) ────────────────────────────────────
    async verifyCompletion(orgId, orgPlan, input) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      const { error } = await supabase
        .from('training_completions')
        .update({
          verified_by: input.verifiedBy,
          verified_at: input.verifiedAt ?? new Date().toISOString(),
        })
        .eq('id', input.completionId)
        .eq('org_id', orgId);  // Belt-and-suspenders tenant guard alongside RLS

      if (error) throw error;
    },

    // ── fetchEmployeeSummary (PROFESSIONAL+) ────────────────────────────────
    async fetchEmployeeSummary(orgId, orgPlan, employeeId) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      set({ isLoading: true, error: null });
      try {
        let query = supabase
          .from('training_summary_v')
          .select('*')
          .eq('org_id', orgId);

        if (employeeId) query = query.eq('employee_id', employeeId);

        const { data, error } = await query;
        if (error) throw error;

        set({
          employeeSummaries: (data ?? []) as unknown as TrainingEmployeeSummary[],
          isLoading: false,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด employee summaries ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── fetchCourseStats (PROFESSIONAL+) ────────────────────────────────────
    async fetchCourseStats(orgId, orgPlan) {
      if (!canAccessTrainingTracker(orgPlan)) {
        throw new TrainingPlanGateError(orgPlan);
      }

      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('training_course_stats_v')
          .select('*')
          .eq('org_id', orgId);

        if (error) throw error;

        set({
          courseStats: (data ?? []) as unknown as TrainingCourseStats[],
          isLoading: false,
        });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'โหลด course stats ไม่สำเร็จ',
          isLoading: false,
        });
      }
    },

    // ── setCourseFilters ────────────────────────────────────────────────────
    setCourseFilters(filters) {
      set((state) => ({
        courseFilters: { ...state.courseFilters, ...filters },
      }));
    },

    // ── setEnrollmentFilters ────────────────────────────────────────────────
    setEnrollmentFilters(filters) {
      set((state) => ({
        enrollmentFilters: { ...state.enrollmentFilters, ...filters },
      }));
    },

    // ── clearError ──────────────────────────────────────────────────────────
    clearError() {
      set({ error: null });
    },

    // ── reset ───────────────────────────────────────────────────────────────
    reset() {
      set(initialState);
    },
  })
);
