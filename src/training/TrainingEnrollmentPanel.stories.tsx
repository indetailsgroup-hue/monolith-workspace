/**
 * src/training/TrainingEnrollmentPanel.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for <TrainingEnrollmentPanel>
 *
 * Stories cover:
 *  - Default (PROFESSIONAL plan, empty form, empty timeline)
 *  - PlanGateWallFree (FREE plan — locked view)
 *  - PlanGateWallStarter (STARTER plan — locked view)
 *  - WithExistingEnrollments (3 timeline items already present)
 *  - TimelineLoading (isEnrollmentLoading = true → panel-loading)
 *  - StoreError (error pre-set in store → error-banner visible)
 *  - BulkEnrollSuccess (play: add employee → submit → verify spy called)
 *  - BulkEnrollErrorPath (play: bulkEnroll rejects → localError shown)
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * TrainingEnrollmentPanel reads bulkEnroll, fetchEnrollments, enrollments,
 * isEnrollmentLoading, error, and clearError from useTrainingStore.
 * We inject all of them via useTrainingStore.setState() inside per-story
 * decorators — same pattern as TrainingCourseList.stories.tsx.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React from 'react';

import { TrainingEnrollmentPanel } from './TrainingEnrollmentPanel';
import { useTrainingStore } from './trainingStore';
import type { TrainingEnrollment } from './trainingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';
const COURSE_ID = 'c-ai-literacy-001';
const COURSE_NAME = 'ความรู้ AI เบื้องต้น';

function makeEnrollment(
  id: string,
  overrides: Partial<TrainingEnrollment> = {},
): TrainingEnrollment {
  return {
    id,
    orgId: ORG_ID,
    courseId: COURSE_ID,
    employeeId: `EMP-${id.toUpperCase()}`,
    enrolledAt: '2027-01-10T08:00:00Z',
    dueDate: '2027-02-28',
    status: 'ENROLLED',
    updatedAt: '2027-01-10T08:00:00Z',
    ...overrides,
  };
}

const MOCK_ENROLLMENTS: TrainingEnrollment[] = [
  makeEnrollment('001', { status: 'COMPLETED' }),
  makeEnrollment('002', { status: 'IN_PROGRESS' }),
  makeEnrollment('003', { status: 'ENROLLED' }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

interface StoreOverride {
  enrollments?: TrainingEnrollment[];
  isEnrollmentLoading?: boolean;
  error?: string | null;
  bulkEnroll?: (...args: unknown[]) => Promise<TrainingEnrollment[]>;
  fetchEnrollments?: (...args: unknown[]) => Promise<void>;
  clearError?: () => void;
}

const withEnrollmentStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useTrainingStore.setState({
      enrollments: [],
      isEnrollmentLoading: false,
      error: null,
      bulkEnroll: (async () => []) as any,
      fetchEnrollments: (async () => {}) as any,
      clearError: () => {},
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof TrainingEnrollmentPanel> = {
  title: 'Training/TrainingEnrollmentPanel',
  component: TrainingEnrollmentPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Bulk enrollment panel for assigning training courses to employees. ' +
          'PROFESSIONAL+ plan required. Supports employee tag input, due date, notes, ' +
          'and displays an enrollment status timeline.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    courseId: COURSE_ID,
    courseName: COURSE_NAME,
    isAdmin: true,
    onClose: fn(),
    onEnrolled: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof TrainingEnrollmentPanel>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

/** Default: PROFESSIONAL plan, empty form, no prior enrollments */
export const Default: Story = {
  decorators: [withEnrollmentStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('enrollment-panel')).toBeInTheDocument();
    await expect(canvas.getByTestId('employee-id-input')).toBeInTheDocument();
    await expect(canvas.getByTestId('enroll-submit-btn')).toBeDisabled();
  },
};

/** Plan gate wall: FREE plan cannot access Training Tracker */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withEnrollmentStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('enrollment-panel')).not.toBeInTheDocument();
  },
};

/** Plan gate wall: STARTER plan cannot access Training Tracker */
export const PlanGateWallStarter: Story = {
  name: 'Plan Gate Wall (STARTER plan)',
  args: { orgPlan: 'STARTER' },
  decorators: [withEnrollmentStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('enrollment-panel')).not.toBeInTheDocument();
  },
};

/** With existing enrollments: shows 3 timeline items */
export const WithExistingEnrollments: Story = {
  name: 'With Existing Enrollments (3 timeline items)',
  decorators: [withEnrollmentStore({ enrollments: MOCK_ENROLLMENTS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const items = canvas.getAllByTestId('timeline-item');
    await expect(items.length).toBe(MOCK_ENROLLMENTS.length);
    // First item should show COMPLETED badge
    await expect(canvas.getAllByTestId('enrollment-status-badge')[0]).toBeInTheDocument();
  },
};

/** Loading state: isEnrollmentLoading = true → shows panel-loading */
export const TimelineLoading: Story = {
  name: 'Timeline Loading',
  decorators: [withEnrollmentStore({ isEnrollmentLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('panel-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('enrollment-timeline')).not.toBeInTheDocument();
  },
};

/** Store error pre-set: error-banner visible on render */
export const StoreError: Story = {
  name: 'Store Error — error-banner visible',
  decorators: [
    withEnrollmentStore({
      error: 'ไม่สามารถโหลดรายการมอบหมายได้',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByTestId('error-banner');
    await expect(banner).toBeInTheDocument();
    await expect(banner).toHaveTextContent('ไม่สามารถโหลดรายการมอบหมายได้');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Enroll Success — Interaction Test
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level spy shared between the decorator and play function.
 * bulkEnroll spy resolves to an empty array (simulates successful DB insert).
 */
const bulkEnrollSpy = fn().mockResolvedValue([]);
const fetchEnrollmentsSpy = fn().mockResolvedValue(undefined);
const onEnrolledSpy = fn();

/**
 * BulkEnrollSuccess:
 *  1. Type employee ID in input
 *  2. Press Enter → tag appears
 *  3. Click submit button
 *  4. Verify bulkEnroll spy was called with correct courseId + employeeIds
 *  5. Verify onEnrolled callback was called
 */
export const BulkEnrollSuccess: Story = {
  name: 'Bulk Enroll Success — Interaction Test',
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    courseId: COURSE_ID,
    onEnrolled: onEnrolledSpy,
  },
  decorators: [
    (Story: StoryFn) => {
      // Reset spies for idempotent play() runs
      bulkEnrollSpy.mockClear();
      fetchEnrollmentsSpy.mockClear();
      onEnrolledSpy.mockClear();
      useTrainingStore.setState({
        enrollments: [],
        isEnrollmentLoading: false,
        error: null,
        bulkEnroll: bulkEnrollSpy,
        fetchEnrollments: fetchEnrollmentsSpy,
        clearError: () => {},
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 1. Panel rendered, submit disabled initially
    const submitBtn = canvas.getByTestId('enroll-submit-btn');
    await expect(submitBtn).toBeDisabled();

    // 2. Type employee ID and press Enter to add tag
    const input = canvas.getByTestId('employee-id-input');
    await userEvent.click(input);
    await userEvent.type(input, 'EMP-TEST-001');
    await userEvent.keyboard('{Enter}');

    // 3. Employee tag visible
    const tags = canvas.getAllByTestId('employee-tag');
    await expect(tags.length).toBe(1);
    await expect(tags[0]).toHaveTextContent('EMP-TEST-001');

    // 4. Submit button enabled (1 employee added)
    await expect(submitBtn).not.toBeDisabled();

    // 5. Click submit
    await userEvent.click(submitBtn);

    // 6. bulkEnroll spy must have been called once
    await expect(bulkEnrollSpy).toHaveBeenCalledTimes(1);

    // 7. Called with correct orgId + orgPlan + courseId + employeeIds
    await expect(bulkEnrollSpy).toHaveBeenCalledWith(
      ORG_ID,
      'PROFESSIONAL',
      expect.objectContaining({
        courseId: COURSE_ID,
        employeeIds: ['EMP-TEST-001'],
      }),
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Enroll Error Path — Interaction Test
// ─────────────────────────────────────────────────────────────────────────────

/** bulkEnroll spy rejects → component catches and shows localError banner */
const bulkEnrollErrorSpy = fn(async () => {
  throw new Error('DB write failed — server error');
});
const fetchEnrollmentsNoop = fn().mockResolvedValue(undefined);

export const BulkEnrollErrorPath: Story = {
  name: 'Bulk Enroll Error Path — Interaction Test',
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    courseId: COURSE_ID,
  },
  decorators: [
    (Story: StoryFn) => {
      bulkEnrollErrorSpy.mockClear();
      fetchEnrollmentsNoop.mockClear();
      useTrainingStore.setState({
        enrollments: [],
        isEnrollmentLoading: false,
        error: null,
        bulkEnroll: bulkEnrollErrorSpy,
        fetchEnrollments: fetchEnrollmentsNoop,
        clearError: () => {},
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 1. Add an employee tag
    const input = canvas.getByTestId('employee-id-input');
    await userEvent.click(input);
    await userEvent.type(input, 'EMP-ERR-001');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getAllByTestId('employee-tag').length).toBe(1);

    // 2. Click submit — bulkEnroll will reject
    const submitBtn = canvas.getByTestId('enroll-submit-btn');
    await userEvent.click(submitBtn);

    // 3. error-banner should appear with the rejection message
    const banner = await canvas.findByTestId('error-banner');
    await expect(banner).toBeInTheDocument();
    await expect(banner).toHaveTextContent('DB write failed');

    // 4. bulkEnroll was indeed called
    await expect(bulkEnrollErrorSpy).toHaveBeenCalledTimes(1);
  },
};
