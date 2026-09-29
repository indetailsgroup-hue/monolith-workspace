/**
 * src/training/TrainingCourseList.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for <TrainingCourseList>
 *
 * Stories cover:
 *  - Default (PROFESSIONAL plan, 6 courses, mixed categories)
 *  - PlanGateWallFree (FREE plan — locked view)
 *  - PlanGateWallStarter (STARTER plan — locked view)
 *  - LoadingSkeleton (6 animated skeleton cards)
 *  - EmptyStateNoResults (search returned no results)
 *  - EmptyStateFirstRun (no courses at all)
 *  - ProfessionalPlanAdmin (isAdmin = true, enroll buttons visible on all cards)
 *  - CategoryFilterAiLiteracy (AI_LITERACY filter pre-set)
 *  - StageFilterPreset (AI_PARTNER stage filter)
 *  - AdminEnrollFlow (play function — click enroll-btn, verify onEnroll called)
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * TrainingCourseList reads all data from `useTrainingStore`.
 * We inject mock state via `useTrainingStore.setState()` inside
 * a per-story decorator — same pattern as ProcessTemplateList.stories.tsx.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React from 'react';

import { TrainingCourseList } from './TrainingCourseList';
import { useTrainingStore } from './trainingStore';
import type { TrainingCourseSummary, TrainingCourseFilters } from './trainingTypes';
import { DEFAULT_TRAINING_COURSE_FILTERS } from './trainingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';

function makeCourse(
  id: string,
  title: string,
  overrides: Partial<TrainingCourseSummary> = {},
): TrainingCourseSummary {
  return {
    id,
    orgId: ORG_ID,
    title,
    category: 'QUALITY',
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

const MOCK_COURSES: TrainingCourseSummary[] = [
  makeCourse('c-001', 'ความปลอดภัยในโรงงาน', {
    category: 'SAFETY',
    isGlobal: true,
    tags: ['safety', 'mandatory'],
    durationHours: 8,
    passingScore: 80,
  }),
  makeCourse('c-002', 'QC พื้นฐาน', {
    category: 'QUALITY',
    durationHours: 6,
    tags: ['quality', 'inspection'],
  }),
  makeCourse('c-003', 'ความรู้ AI เบื้องต้น', {
    category: 'AI_LITERACY',
    requiredForStage: 'AI_AWARE',
    durationHours: 3,
    tags: ['ai', 'awareness'],
  }),
  makeCourse('c-004', 'ผู้นำทีมการผลิต', {
    category: 'LEADERSHIP',
    durationHours: 12,
    passingScore: 75,
    tags: ['leadership', 'management'],
  }),
  makeCourse('c-005', 'Onboarding DAPH Decor', {
    category: 'ONBOARDING',
    isGlobal: true,
    durationHours: 2,
    passingScore: null,
    tags: ['onboarding'],
  }),
  makeCourse('c-006', 'AI Partner: ทำงานร่วมกับ AI', {
    category: 'AI_LITERACY',
    requiredForStage: 'AI_PARTNER',
    durationHours: 5,
    passingScore: 80,
    tags: ['ai', 'advanced'],
  }),
];

const AI_LITERACY_COURSES = MOCK_COURSES.filter((c) => c.category === 'AI_LITERACY');
const AI_PARTNER_STAGE_COURSES = MOCK_COURSES.filter(
  (c) => c.requiredForStage === 'AI_PARTNER',
);

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

type StoreOverride = {
  courses?: TrainingCourseSummary[];
  courseFilters?: TrainingCourseFilters;
  isLoading?: boolean;
  error?: string | null;
};

const withTrainingStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useTrainingStore.setState({
      courses: MOCK_COURSES,
      courseFilters: { ...DEFAULT_TRAINING_COURSE_FILTERS },
      isLoading: false,
      error: null,
      fetchCourses: async () => {},
      setCourseFilters: () => {},
      clearError: () => {},
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof TrainingCourseList> = {
  title: 'Training/TrainingCourseList',
  component: TrainingCourseList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Training course catalogue with category/stage/search filters. ' +
          'PROFESSIONAL+ plan required. Shows plan gate wall for FREE/STARTER.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    isAdmin: false,
    onSelectCourse: fn(),
    onEnroll: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TrainingCourseList>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

/** Default: PROFESSIONAL plan, 6 courses, mixed categories */
export const Default: Story = {
  decorators: [withTrainingStore()],
};

/** Plan gate wall: FREE plan cannot access Training Tracker */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withTrainingStore({ courses: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('training-course-list')).not.toBeInTheDocument();
  },
};

/** Plan gate wall: STARTER plan cannot access Training Tracker */
export const PlanGateWallStarter: Story = {
  name: 'Plan Gate Wall (STARTER plan)',
  args: { orgPlan: 'STARTER' },
  decorators: [withTrainingStore({ courses: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('training-course-list')).not.toBeInTheDocument();
  },
};

/** Loading skeleton: 6 animated cards */
export const LoadingSkeleton: Story = {
  name: 'Loading Skeleton',
  decorators: [withTrainingStore({ courses: [], isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('course-loading')).toBeInTheDocument();
    const skeletons = canvas.getAllByTestId('course-skeleton');
    await expect(skeletons.length).toBe(6);
  },
};

/** Empty state: search returned no results */
export const EmptyStateNoResults: Story = {
  name: 'Empty State — No Results',
  decorators: [
    withTrainingStore({
      courses: [],
      courseFilters: {
        ...DEFAULT_TRAINING_COURSE_FILTERS,
        search: 'ไม่มีหลักสูตรนี้',
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('course-empty-state')).toBeInTheDocument();
  },
};

/** Empty state: no courses at all (first run) */
export const EmptyStateFirstRun: Story = {
  name: 'Empty State — First Run',
  decorators: [withTrainingStore({ courses: [] })],
};

/** PROFESSIONAL plan + isAdmin: enroll buttons visible on all cards */
export const ProfessionalPlanAdmin: Story = {
  name: 'PROFESSIONAL Plan — Admin (Enroll Buttons)',
  args: { orgPlan: 'PROFESSIONAL', isAdmin: true },
  decorators: [withTrainingStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const enrollBtns = canvas.getAllByTestId('enroll-btn');
    await expect(enrollBtns.length).toBe(MOCK_COURSES.length);
  },
};

/** Category filter pre-set to AI_LITERACY */
export const CategoryFilterAiLiteracy: Story = {
  name: 'Category Filter — AI_LITERACY',
  decorators: [
    withTrainingStore({
      courses: AI_LITERACY_COURSES,
      courseFilters: {
        ...DEFAULT_TRAINING_COURSE_FILTERS,
        category: 'AI_LITERACY',
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = canvas.getAllByTestId('course-card');
    await expect(cards.length).toBe(AI_LITERACY_COURSES.length);
  },
};

/** Stage filter pre-set to AI_PARTNER */
export const StageFilterPreset: Story = {
  name: 'Stage Filter — AI_PARTNER',
  decorators: [
    withTrainingStore({
      courses: AI_PARTNER_STAGE_COURSES,
      courseFilters: {
        ...DEFAULT_TRAINING_COURSE_FILTERS,
        requiredForStage: 'AI_PARTNER',
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stageBadges = canvas.getAllByTestId('required-stage-badge');
    await expect(stageBadges.length).toBeGreaterThan(0);
    // All visible cards should show the AI_PARTNER stage label
    for (const badge of stageBadges) {
      await expect(badge).toHaveTextContent('ทำงานร่วมกับ AI');
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Enroll Flow Interaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level spy so both the decorator and play function share the same ref.
 * fn() is @storybook/test's vi-compatible mock — supports .mockClear() and
 * toHaveBeenCalledWith assertions.
 */
const enrollSpy = fn();

/** Admin enroll flow: click enroll-btn, verify onEnroll callback called */
export const AdminEnrollFlow: Story = {
  name: 'Admin Enroll Flow — Interaction Test',
  args: { isAdmin: true, orgPlan: 'PROFESSIONAL', orgId: ORG_ID, onEnroll: enrollSpy },
  decorators: [
    (Story: StoryFn) => {
      // Reset call history on each story render so interaction tests are idempotent
      enrollSpy.mockClear();
      useTrainingStore.setState({
        courses: MOCK_COURSES,
        courseFilters: { ...DEFAULT_TRAINING_COURSE_FILTERS },
        isLoading: false,
        error: null,
        fetchCourses: async () => {},
        setCourseFilters: () => {},
        clearError: () => {},
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 1. Enroll buttons should be visible for all courses (admin + PROFESSIONAL)
    const enrollBtns = canvas.getAllByTestId('enroll-btn');
    await expect(enrollBtns.length).toBe(MOCK_COURSES.length);

    // 2. Click the first enroll button
    await userEvent.click(enrollBtns[0]);

    // 3. onEnroll must have been called exactly once
    await expect(enrollSpy).toHaveBeenCalledTimes(1);

    // 4. Verify it was called with the first mock course object
    await expect(enrollSpy).toHaveBeenCalledWith(MOCK_COURSES[0]);
  },
};
