/**
 * src/training/__tests__/trainingStore.test.ts
 *
 * MONOLITH v17.5 — Training Tracker Store
 * Framework: Vitest + thenable Proxy Supabase mock
 *
 * Mock strategy: every chained Supabase method returns a fresh thenable Proxy.
 * `await proxy` resolves via .then() to the module-level `mockResult` variable,
 * which is set per-test. This handles all query chain endings (single, order,
 * eq, not, …) uniformly without duplicating chain shapes.
 *
 * Coverage:
 *  - TrainingPlanGateError — name, message, instanceof
 *  - setCourseFilters / setEnrollmentFilters — merge semantics
 *  - clearError / reset
 *  - Plan gate: FREE + STARTER throw; PROFESSIONAL + ENTERPRISE pass
 *    Gated actions: createCourse, updateCourse, deleteCourse, enroll,
 *    bulkEnroll, cancelEnrollment, logCompletion, verifyCompletion,
 *    fetchEmployeeSummary, fetchCourseStats
 *  - fetchCourses: isLoading flag, success path, null data, error path
 *  - logCompletion: optimistic append to completions + enrollment → COMPLETED
 *  - cancelEnrollment: optimistic status → CANCELLED (non-matching unchanged)
 *  - deleteCourse: optimistic removal; clears selectedCourse if id matches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE — thenable Proxy
// ============================================================================
// vi.mock is hoisted before imports, so mockResult / makeThenableProxy
// must be declared at module scope before the mock factory runs.

const { mockState, mockSupabase } = vi.hoisted(() => {
  const mockState = {
    result: { data: null, error: null } as { data: unknown; error: unknown },
  };
  const makeThenableProxy = (): unknown => new Proxy({}, {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(mockState.result).then(onFulfilled, onRejected);
      }
      return (..._args: unknown[]) => makeThenableProxy();
    },
  });
  return {
    mockState,
    mockSupabase: { from: vi.fn(() => makeThenableProxy()) },
  };
});

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ============================================================================
// IMPORTS (after mock — Vitest hoisting guarantees mock is in place first)
// ============================================================================

import { useTrainingStore, TrainingPlanGateError } from '../trainingStore';
import type {
  TrainingEnrollment,
  TrainingCompletion,
  TrainingCourseSummary,
  TrainingCourse,
} from '../trainingTypes';

// ============================================================================
// HELPERS
// ============================================================================

function makeEnrollment(
  id: string,
  overrides: Partial<TrainingEnrollment> = {},
): TrainingEnrollment {
  return {
    id,
    orgId: 'org-001',
    courseId: 'c-001',
    employeeId: `emp-${id}`,
    enrolledAt: '2027-01-01T00:00:00Z',
    status: 'ENROLLED',
    updatedAt: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCourse(
  id: string,
  overrides: Partial<TrainingCourseSummary> = {},
): TrainingCourseSummary {
  return {
    id,
    orgId: 'org-001',
    title: `Course ${id}`,
    category: 'SAFETY',
    planGate: 'PROFESSIONAL',
    durationHours: 4,
    passingScore: 70,
    requiredForStage: null,
    isActive: true,
    isGlobal: false,
    version: 1,
    tags: [],
    createdAt: '2027-01-01T00:00:00Z',
    updatedAt: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCompletion(
  id: string,
  overrides: Partial<TrainingCompletion> = {},
): TrainingCompletion {
  return {
    id,
    orgId: 'org-001',
    courseId: 'c-001',
    enrollmentId: 'enr-001',
    employeeId: 'emp-001',
    completedAt: '2027-01-10T00:00:00Z',
    score: 85,
    isPassed: true,
    createdAt: '2027-01-10T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// TrainingPlanGateError
// ============================================================================

describe('TrainingPlanGateError', () => {
  it('has name = "TrainingPlanGateError"', () => {
    const err = new TrainingPlanGateError('FREE');
    expect(err.name).toBe('TrainingPlanGateError');
  });

  it('message includes the current plan', () => {
    const err = new TrainingPlanGateError('STARTER');
    expect(err.message).toContain('STARTER');
  });

  it('message references PROFESSIONAL+', () => {
    const err = new TrainingPlanGateError('FREE');
    expect(err.message).toContain('PROFESSIONAL');
  });

  it('is instanceof Error', () => {
    const err = new TrainingPlanGateError('FREE');
    expect(err).toBeInstanceOf(Error);
  });

  it('is instanceof TrainingPlanGateError', () => {
    const err = new TrainingPlanGateError('FREE');
    expect(err).toBeInstanceOf(TrainingPlanGateError);
  });

  it('name is not the generic "Error"', () => {
    const err = new TrainingPlanGateError('STARTER');
    expect(err.name).not.toBe('Error');
  });
});

// ============================================================================
// State management
// ============================================================================

describe('useTrainingStore — state management', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
    mockState.result = { data: null, error: null };
  });

  // ── setCourseFilters ────────────────────────────────────────────────────

  describe('setCourseFilters', () => {
    it('merges partial filter without overwriting unrelated keys', () => {
      useTrainingStore.getState().setCourseFilters({ category: 'AI_LITERACY' });
      const { courseFilters } = useTrainingStore.getState();
      expect(courseFilters.category).toBe('AI_LITERACY');
      expect(courseFilters.isActive).toBe(true);   // default preserved
      expect(courseFilters.search).toBe('');         // default preserved
    });

    it('updates multiple filter keys in one call', () => {
      useTrainingStore.getState().setCourseFilters({ category: 'SAFETY', search: 'ไฟ' });
      const { courseFilters } = useTrainingStore.getState();
      expect(courseFilters.category).toBe('SAFETY');
      expect(courseFilters.search).toBe('ไฟ');
    });

    it('clears category when set to null', () => {
      useTrainingStore.getState().setCourseFilters({ category: 'QUALITY' });
      useTrainingStore.getState().setCourseFilters({ category: null });
      expect(useTrainingStore.getState().courseFilters.category).toBeNull();
    });

    it('updates requiredForStage independently of category', () => {
      useTrainingStore.getState().setCourseFilters({ requiredForStage: 'AI_PARTNER' });
      const { courseFilters } = useTrainingStore.getState();
      expect(courseFilters.requiredForStage).toBe('AI_PARTNER');
      expect(courseFilters.category).toBeNull(); // default untouched
    });
  });

  // ── setEnrollmentFilters ────────────────────────────────────────────────

  describe('setEnrollmentFilters', () => {
    it('merges partial enrollment filter without overwriting unrelated keys', () => {
      useTrainingStore.getState().setEnrollmentFilters({ status: 'COMPLETED' });
      const { enrollmentFilters } = useTrainingStore.getState();
      expect(enrollmentFilters.status).toBe('COMPLETED');
      expect(enrollmentFilters.overdueOnly).toBe(false); // default preserved
    });

    it('updates courseId filter independently', () => {
      useTrainingStore.getState().setEnrollmentFilters({ courseId: 'c-abc' });
      const { enrollmentFilters } = useTrainingStore.getState();
      expect(enrollmentFilters.courseId).toBe('c-abc');
      expect(enrollmentFilters.status).toBeNull(); // default preserved
    });

    it('sets overdueOnly = true', () => {
      useTrainingStore.getState().setEnrollmentFilters({ overdueOnly: true });
      expect(useTrainingStore.getState().enrollmentFilters.overdueOnly).toBe(true);
    });
  });

  // ── clearError ──────────────────────────────────────────────────────────

  describe('clearError', () => {
    it('resets a non-null error to null', () => {
      useTrainingStore.setState({ error: 'something went wrong' });
      useTrainingStore.getState().clearError();
      expect(useTrainingStore.getState().error).toBeNull();
    });

    it('is safe to call when error is already null', () => {
      expect(useTrainingStore.getState().error).toBeNull();
      useTrainingStore.getState().clearError();
      expect(useTrainingStore.getState().error).toBeNull();
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears courses, enrollments, and completions arrays', () => {
      useTrainingStore.setState({
        courses: [makeCourse('c-001')],
        enrollments: [makeEnrollment('enr-001')],
        completions: [makeCompletion('comp-001')],
      });
      useTrainingStore.getState().reset();
      const state = useTrainingStore.getState();
      expect(state.courses).toHaveLength(0);
      expect(state.enrollments).toHaveLength(0);
      expect(state.completions).toHaveLength(0);
    });

    it('resets isLoading and error to defaults', () => {
      useTrainingStore.setState({ isLoading: true, error: 'oops' });
      useTrainingStore.getState().reset();
      const state = useTrainingStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('resets selectedCourse to null', () => {
      useTrainingStore.setState({
        selectedCourse: makeCourse('c-001') as unknown as TrainingCourse,
      });
      useTrainingStore.getState().reset();
      expect(useTrainingStore.getState().selectedCourse).toBeNull();
    });
  });
});

// ============================================================================
// Plan gate enforcement
// ============================================================================

describe('Plan gate enforcement', () => {
  const orgId = 'org-001';
  const courseInput = { title: 'Test Course', category: 'SAFETY' as const };
  const enrollInput = { courseId: 'c-001', employeeId: 'emp-001' };
  const bulkInput = { courseId: 'c-001', employeeIds: ['emp-001', 'emp-002'] };
  const completionInput = {
    enrollmentId: 'enr-001',
    courseId: 'c-001',
    employeeId: 'emp-001',
  };
  const verifyInput = { completionId: 'comp-001', verifiedBy: 'admin-001' };

  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
    mockState.result = { data: null, error: null };
  });

  // ── FREE plan ─────────────────────────────────────────────────────────

  describe('FREE plan — all gated actions throw TrainingPlanGateError', () => {
    it('createCourse throws', async () => {
      await expect(
        useTrainingStore.getState().createCourse(orgId, 'FREE', courseInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('updateCourse throws', async () => {
      await expect(
        useTrainingStore.getState().updateCourse('c-001', 'FREE', { title: 'New' }),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('deleteCourse throws', async () => {
      await expect(
        useTrainingStore.getState().deleteCourse('c-001', 'FREE'),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('enroll throws', async () => {
      await expect(
        useTrainingStore.getState().enroll(orgId, 'FREE', enrollInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('bulkEnroll throws', async () => {
      await expect(
        useTrainingStore.getState().bulkEnroll(orgId, 'FREE', bulkInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('cancelEnrollment throws', async () => {
      await expect(
        useTrainingStore.getState().cancelEnrollment('enr-001', 'FREE'),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('logCompletion throws', async () => {
      await expect(
        useTrainingStore.getState().logCompletion(orgId, 'FREE', completionInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('verifyCompletion throws', async () => {
      await expect(
        useTrainingStore.getState().verifyCompletion(orgId, 'FREE', verifyInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('fetchEmployeeSummary throws', async () => {
      await expect(
        useTrainingStore.getState().fetchEmployeeSummary(orgId, 'FREE'),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('fetchCourseStats throws', async () => {
      await expect(
        useTrainingStore.getState().fetchCourseStats(orgId, 'FREE'),
      ).rejects.toThrow(TrainingPlanGateError);
    });
  });

  // ── STARTER plan ──────────────────────────────────────────────────────

  describe('STARTER plan — all gated actions throw TrainingPlanGateError', () => {
    it('createCourse throws', async () => {
      await expect(
        useTrainingStore.getState().createCourse(orgId, 'STARTER', courseInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('bulkEnroll throws', async () => {
      await expect(
        useTrainingStore.getState().bulkEnroll(orgId, 'STARTER', bulkInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('logCompletion throws', async () => {
      await expect(
        useTrainingStore.getState().logCompletion(orgId, 'STARTER', completionInput),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('fetchCourseStats throws', async () => {
      await expect(
        useTrainingStore.getState().fetchCourseStats(orgId, 'STARTER'),
      ).rejects.toThrow(TrainingPlanGateError);
    });

    it('fetchEmployeeSummary throws', async () => {
      await expect(
        useTrainingStore.getState().fetchEmployeeSummary(orgId, 'STARTER'),
      ).rejects.toThrow(TrainingPlanGateError);
    });
  });

  // ── PROFESSIONAL plan — passes gate ──────────────────────────────────

  describe('PROFESSIONAL plan — gated actions do not throw', () => {
    it('createCourse resolves', async () => {
      mockState.result = { data: { id: 'c-new' }, error: null };
      await expect(
        useTrainingStore.getState().createCourse(orgId, 'PROFESSIONAL', courseInput),
      ).resolves.toBeDefined();
    });

    it('fetchCourseStats resolves', async () => {
      mockState.result = { data: [], error: null };
      await expect(
        useTrainingStore.getState().fetchCourseStats(orgId, 'PROFESSIONAL'),
      ).resolves.toBeUndefined();
    });

    it('verifyCompletion resolves', async () => {
      mockState.result = { data: null, error: null };
      await expect(
        useTrainingStore.getState().verifyCompletion(orgId, 'PROFESSIONAL', verifyInput),
      ).resolves.toBeUndefined();
    });
  });

  // ── ENTERPRISE plan ───────────────────────────────────────────────────

  describe('ENTERPRISE plan — gated actions do not throw', () => {
    it('fetchEmployeeSummary resolves', async () => {
      mockState.result = { data: [], error: null };
      await expect(
        useTrainingStore.getState().fetchEmployeeSummary(orgId, 'ENTERPRISE'),
      ).resolves.toBeUndefined();
    });
  });
});

// ============================================================================
// fetchCourses
// ============================================================================

describe('fetchCourses', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
  });

  it('sets isLoading = true synchronously before the query resolves', async () => {
    mockState.result = { data: [], error: null };
    const promise = useTrainingStore.getState().fetchCourses('org-001');
    // set({ isLoading: true }) is called before the first await in fetchCourses
    expect(useTrainingStore.getState().isLoading).toBe(true);
    await promise;
    expect(useTrainingStore.getState().isLoading).toBe(false);
  });

  it('clears a previous error synchronously at start', async () => {
    useTrainingStore.setState({ error: 'previous error' });
    mockState.result = { data: [], error: null };
    const promise = useTrainingStore.getState().fetchCourses('org-001');
    expect(useTrainingStore.getState().error).toBeNull();
    await promise;
  });

  it('populates courses on success', async () => {
    const mockData = [
      { id: 'c-001', title: 'Safety 101', category: 'SAFETY' },
      { id: 'c-002', title: 'AI Basics', category: 'AI_LITERACY' },
    ];
    mockState.result = { data: mockData, error: null };
    await useTrainingStore.getState().fetchCourses('org-001');
    const { courses } = useTrainingStore.getState();
    expect(courses).toHaveLength(2);
    expect(courses[0].id).toBe('c-001');
    expect(courses[1].category).toBe('AI_LITERACY');
  });

  it('treats null data as empty array', async () => {
    mockState.result = { data: null, error: null };
    await useTrainingStore.getState().fetchCourses('org-001');
    expect(useTrainingStore.getState().courses).toHaveLength(0);
  });

  it('sets error state and clears isLoading on Supabase Error', async () => {
    mockState.result = { data: null, error: new Error('connection refused') };
    await useTrainingStore.getState().fetchCourses('org-001');
    const state = useTrainingStore.getState();
    expect(state.error).toBe('connection refused');
    expect(state.isLoading).toBe(false);
  });

  it('sets generic error message for non-Error thrown values', async () => {
    mockState.result = { data: null, error: { code: '42501', hint: 'RLS denied' } };
    await useTrainingStore.getState().fetchCourses('org-001');
    const state = useTrainingStore.getState();
    expect(state.error).toBeTruthy();
    expect(state.isLoading).toBe(false);
  });
});

// ============================================================================
// logCompletion — optimistic update
// ============================================================================

describe('logCompletion — optimistic update', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
  });

  it('appends new completion to state.completions', async () => {
    const newCompletion = makeCompletion('comp-001', { enrollmentId: 'enr-001' });
    mockState.result = { data: newCompletion, error: null };
    useTrainingStore.setState({
      completions: [],
      enrollments: [makeEnrollment('enr-001')],
    });

    const result = await useTrainingStore.getState().logCompletion(
      'org-001',
      'PROFESSIONAL',
      { enrollmentId: 'enr-001', courseId: 'c-001', employeeId: 'emp-001' },
    );

    const { completions } = useTrainingStore.getState();
    expect(completions).toHaveLength(1);
    expect(completions[0].id).toBe('comp-001');
    expect(result.id).toBe('comp-001');
  });

  it('syncs matching enrollment status to COMPLETED', async () => {
    const newCompletion = makeCompletion('comp-001', { enrollmentId: 'enr-001' });
    mockState.result = { data: newCompletion, error: null };
    useTrainingStore.setState({
      completions: [],
      enrollments: [
        makeEnrollment('enr-001', { status: 'IN_PROGRESS' }),
        makeEnrollment('enr-002', { status: 'ENROLLED' }), // must NOT change
      ],
    });

    await useTrainingStore.getState().logCompletion(
      'org-001',
      'PROFESSIONAL',
      { enrollmentId: 'enr-001', courseId: 'c-001', employeeId: 'emp-001' },
    );

    const { enrollments } = useTrainingStore.getState();
    expect(enrollments.find((e) => e.id === 'enr-001')?.status).toBe('COMPLETED');
    expect(enrollments.find((e) => e.id === 'enr-002')?.status).toBe('ENROLLED');
  });

  it('appends to existing completions without replacing them', async () => {
    const existing = makeCompletion('comp-000');
    const newCompletion = makeCompletion('comp-001', { enrollmentId: 'enr-001' });
    mockState.result = { data: newCompletion, error: null };
    useTrainingStore.setState({
      completions: [existing],
      enrollments: [makeEnrollment('enr-001')],
    });

    await useTrainingStore.getState().logCompletion(
      'org-001',
      'PROFESSIONAL',
      { enrollmentId: 'enr-001', courseId: 'c-001', employeeId: 'emp-001' },
    );

    const { completions } = useTrainingStore.getState();
    expect(completions).toHaveLength(2);
    expect(completions[0].id).toBe('comp-000');
    expect(completions[1].id).toBe('comp-001');
  });
});

// ============================================================================
// cancelEnrollment — optimistic update
// ============================================================================

describe('cancelEnrollment — optimistic update', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
    mockState.result = { data: null, error: null };
  });

  it('sets the matching enrollment status to CANCELLED', async () => {
    useTrainingStore.setState({
      enrollments: [
        makeEnrollment('enr-001', { status: 'ENROLLED' }),
        makeEnrollment('enr-002', { status: 'ENROLLED' }),
      ],
    });

    await useTrainingStore.getState().cancelEnrollment('enr-001', 'PROFESSIONAL');

    const { enrollments } = useTrainingStore.getState();
    expect(enrollments.find((e) => e.id === 'enr-001')?.status).toBe('CANCELLED');
  });

  it('does not change non-matching enrollment statuses', async () => {
    useTrainingStore.setState({
      enrollments: [
        makeEnrollment('enr-001', { status: 'ENROLLED' }),
        makeEnrollment('enr-002', { status: 'IN_PROGRESS' }),
      ],
    });

    await useTrainingStore.getState().cancelEnrollment('enr-001', 'PROFESSIONAL');

    expect(
      useTrainingStore.getState().enrollments.find((e) => e.id === 'enr-002')?.status,
    ).toBe('IN_PROGRESS');
  });

  it('preserves total enrollment count', async () => {
    useTrainingStore.setState({
      enrollments: [makeEnrollment('enr-001'), makeEnrollment('enr-002')],
    });

    await useTrainingStore.getState().cancelEnrollment('enr-002', 'PROFESSIONAL');

    expect(useTrainingStore.getState().enrollments).toHaveLength(2);
  });
});

// ============================================================================
// deleteCourse — optimistic removal
// ============================================================================

describe('deleteCourse — optimistic removal', () => {
  beforeEach(() => {
    useTrainingStore.getState().reset();
    vi.clearAllMocks();
    mockState.result = { data: null, error: null };
  });

  it('removes the deleted course from the courses array', async () => {
    useTrainingStore.setState({
      courses: [makeCourse('c-001'), makeCourse('c-002')],
    });

    await useTrainingStore.getState().deleteCourse('c-001', 'PROFESSIONAL');

    const { courses } = useTrainingStore.getState();
    expect(courses).toHaveLength(1);
    expect(courses[0].id).toBe('c-002');
  });

  it('clears selectedCourse when the deleted course matches', async () => {
    useTrainingStore.setState({
      courses: [makeCourse('c-001')],
      selectedCourse: makeCourse('c-001') as unknown as TrainingCourse,
    });

    await useTrainingStore.getState().deleteCourse('c-001', 'PROFESSIONAL');

    expect(useTrainingStore.getState().selectedCourse).toBeNull();
  });

  it('preserves selectedCourse when a different course is deleted', async () => {
    useTrainingStore.setState({
      courses: [makeCourse('c-001'), makeCourse('c-002')],
      selectedCourse: makeCourse('c-002') as unknown as TrainingCourse,
    });

    await useTrainingStore.getState().deleteCourse('c-001', 'PROFESSIONAL');

    expect(useTrainingStore.getState().selectedCourse?.id).toBe('c-002');
  });
});
