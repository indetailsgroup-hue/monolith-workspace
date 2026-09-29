/**
 * src/ai-scheduler/AiSchedulerBoard.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for <AiSchedulerBoard>
 *
 * Stories cover:
 *  - PlanGateWall          — FREE/PROFESSIONAL plan → plan-gate-wall shown
 *  - EmptyRuns             — ENTERPRISE, loaded, no production runs → no-runs
 *  - TimelineDraft         — run in DRAFT: first step active, none done
 *  - TimelineGenerating    — run in GENERATING: DRAFT done, GENERATING active
 *  - TimelineReady         — run in READY: DRAFT+GENERATING done, READY active
 *  - TimelineApproved      — run in APPROVED: DRAFT+GENERATING+READY done, APPROVED active
 *  - TimelineInProgress    — run in IN_PROGRESS: four steps done, IN_PROGRESS active
 *  - TimelineCompleted     — run in COMPLETED: all six steps done/active
 *  - TimelineCancelled     — run in CANCELLED: single terminal step active
 *  - TimelineFailed        — run in FAILED: single terminal step active
 *  - WithApproveAction     — READY run → click approve btn → approveRun spy called
 *  - WithCancelAction      — READY run → click cancel btn → cancelRun spy called
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * AiSchedulerBoard reads from useAiSchedulerStore.
 * We inject state via useAiSchedulerStore.setState() inside per-story
 * decorators — same pattern as AiCostDashboard stories.
 *
 * Timeline interaction pattern:
 *   1. Click the run-card to set selectedRunId (local useState in component)
 *   2. Assert timeline-step data-active / data-done attributes in right panel
 *
 * Approve / Cancel interaction:
 *   run-approve-btn and run-cancel-btn appear in RunCard (left panel) and also
 *   in the right panel when a run is selected.  The RunCard buttons are always
 *   visible in the list (no selection required) — we click those for the
 *   interaction stories.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React from 'react';

import { AiSchedulerBoard } from './AiSchedulerBoard';
import { useAiSchedulerStore } from './aiSchedulerStore';
import type { ApsProductionRun, ApsRunStatus } from './aiSchedulerTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level spies (reset per interaction story)
// ─────────────────────────────────────────────────────────────────────────────

const approveRunSpy = fn();
const cancelRunSpy  = fn();

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';

function makeRun(status: ApsRunStatus, overrides: Partial<ApsProductionRun> = {}): ApsProductionRun {
  return {
    id:                     `run-${status.toLowerCase()}`,
    orgId:                  ORG_ID,
    runLabel:               `Test Run — ${status}`,
    scheduleDate:           '2027-03-01',
    status,
    scheduleMode:           'AUTO',
    aiModelUsed:            null,
    aiPromptTokens:         null,
    aiRunDurationMs:        null,
    aiConfidenceScore:      null,
    overrideCount:          0,
    approvedBy:             null,
    approvedAt:             null,
    totalItems:             0,
    estimatedUtilisationPct: null,
    delayRiskCount:         0,
    notes:                  null,
    createdBy:              'user-001',
    createdAt:              '2027-03-01T08:00:00Z',
    updatedAt:              '2027-03-01T08:00:00Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreOverride = Record<string, any>;

const withSchedulerStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useAiSchedulerStore.setState({
      machineConfigs:    [],
      productionRuns:    [],
      scheduleItems:     [],
      constraints:       [],
      scheduleSummary:   [],
      machineUtilisation: [],
      filters: {
        status:          'ALL',
        scheduleMode:    'ALL',
        fromDate:        null,
        toDate:          null,
        machineConfigId: null,
      },
      isLoading:     false,
      isRunLoading:  false,
      isItemLoading: false,
      error:         null,
      fetchMachineConfigs:    async () => {},
      createMachineConfig:    async () => ({} as never),
      updateMachineConfig:    async () => ({} as never),
      fetchProductionRuns:    async () => {},
      createProductionRun:    async () => ({} as never),
      approveRun:             async () => ({} as never),
      cancelRun:              async () => {},
      fetchScheduleItems:     async () => {},
      addScheduleItem:        async () => ({} as never),
      updateItemStatus:       async () => ({} as never),
      fetchConstraints:       async () => {},
      createConstraint:       async () => ({} as never),
      deactivateConstraint:   async () => {},
      fetchScheduleSummary:   async () => {},
      fetchMachineUtilisation: async () => {},
      setFilters: () => {},
      clearError: () => {},
      ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof AiSchedulerBoard> = {
  title: 'AI Scheduler/AiSchedulerBoard',
  component: AiSchedulerBoard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'AI Production Scheduler Board — ENTERPRISE plan only. ' +
          'Two-panel layout: runs list (left) + run detail / timeline (right). ' +
          'Supports approve and cancel actions with ENTERPRISE plan gate.',
      },
    },
  },
  args: {
    orgId:   ORG_ID,
    orgPlan: 'ENTERPRISE',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof AiSchedulerBoard>;

// ─────────────────────────────────────────────────────────────────────────────
// Plan Gate Wall
// ─────────────────────────────────────────────────────────────────────────────

/** FREE plan → plan-gate-wall shown; board not rendered */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withSchedulerStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aps-board')).not.toBeInTheDocument();
  },
};

/** PROFESSIONAL plan → plan-gate-wall shown; ENTERPRISE required */
export const PlanGateWallProfessional: Story = {
  name: 'Plan Gate Wall (PROFESSIONAL plan)',
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withSchedulerStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aps-board')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty Runs
// ─────────────────────────────────────────────────────────────────────────────

/** ENTERPRISE plan, loaded, no production runs yet → no-runs placeholder */
export const EmptyRuns: Story = {
  name: 'Empty Runs State',
  decorators: [
    withSchedulerStore({
      productionRuns: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aps-board')).toBeInTheDocument();
    await expect(canvas.getByTestId('no-runs')).toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RunStatusTimeline — all 8 statuses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timeline for a DRAFT run.
 * Steps: [DRAFT*]  — first step is active, no steps done yet.
 */
export const TimelineDraft: Story = {
  name: 'Timeline — DRAFT (first step active)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('DRAFT')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Click the run card to select it and show the right panel timeline
    const runCard = canvas.getByTestId('run-card');
    await userEvent.click(runCard);

    const steps = canvas.getAllByTestId('timeline-step');
    // DRAFT is the first step — active=true, done=false
    const draftStep = steps.find((s) => s.dataset.status === 'DRAFT');
    await expect(draftStep).toBeDefined();
    await expect(draftStep!.dataset.active).toBe('true');
    await expect(draftStep!.dataset.done).not.toBe('true');
  },
};

/**
 * Timeline for a GENERATING run.
 * Steps: [DRAFT✓] [GENERATING*]
 */
export const TimelineGenerating: Story = {
  name: 'Timeline — GENERATING (DRAFT done)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('GENERATING')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    const byStatus = (s: ApsRunStatus) => steps.find((el) => el.dataset.status === s);

    await expect(byStatus('DRAFT')!.dataset.done).toBe('true');
    await expect(byStatus('GENERATING')!.dataset.active).toBe('true');
  },
};

/**
 * Timeline for a READY run.
 * Steps: [DRAFT✓] [GENERATING✓] [READY*]
 */
export const TimelineReady: Story = {
  name: 'Timeline — READY (approve button visible)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('READY')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    const byStatus = (s: ApsRunStatus) => steps.find((el) => el.dataset.status === s);

    await expect(byStatus('DRAFT')!.dataset.done).toBe('true');
    await expect(byStatus('GENERATING')!.dataset.done).toBe('true');
    await expect(byStatus('READY')!.dataset.active).toBe('true');

    // Approve button visible for READY runs
    await expect(canvas.getAllByTestId('run-approve-btn').length).toBeGreaterThan(0);
  },
};

/**
 * Timeline for an APPROVED run.
 * Steps: [DRAFT✓] [GENERATING✓] [READY✓] [APPROVED*]
 */
export const TimelineApproved: Story = {
  name: 'Timeline — APPROVED (three steps done)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('APPROVED')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    const byStatus = (s: ApsRunStatus) => steps.find((el) => el.dataset.status === s);

    await expect(byStatus('DRAFT')!.dataset.done).toBe('true');
    await expect(byStatus('GENERATING')!.dataset.done).toBe('true');
    await expect(byStatus('READY')!.dataset.done).toBe('true');
    await expect(byStatus('APPROVED')!.dataset.active).toBe('true');

    // No approve button for already-APPROVED run
    await expect(canvas.queryAllByTestId('run-approve-btn')).toHaveLength(0);
  },
};

/**
 * Timeline for an IN_PROGRESS run.
 * Steps: [DRAFT✓] [GENERATING✓] [READY✓] [APPROVED✓] [IN_PROGRESS*]
 */
export const TimelineInProgress: Story = {
  name: 'Timeline — IN_PROGRESS (four steps done)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('IN_PROGRESS')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    const byStatus = (s: ApsRunStatus) => steps.find((el) => el.dataset.status === s);

    await expect(byStatus('DRAFT')!.dataset.done).toBe('true');
    await expect(byStatus('GENERATING')!.dataset.done).toBe('true');
    await expect(byStatus('READY')!.dataset.done).toBe('true');
    await expect(byStatus('APPROVED')!.dataset.done).toBe('true');
    await expect(byStatus('IN_PROGRESS')!.dataset.active).toBe('true');
  },
};

/**
 * Timeline for a COMPLETED run.
 * Steps: [DRAFT✓] [GENERATING✓] [READY✓] [APPROVED✓] [IN_PROGRESS✓] [COMPLETED*]
 */
export const TimelineCompleted: Story = {
  name: 'Timeline — COMPLETED (all steps done)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('COMPLETED')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    const byStatus = (s: ApsRunStatus) => steps.find((el) => el.dataset.status === s);

    await expect(byStatus('DRAFT')!.dataset.done).toBe('true');
    await expect(byStatus('GENERATING')!.dataset.done).toBe('true');
    await expect(byStatus('READY')!.dataset.done).toBe('true');
    await expect(byStatus('APPROVED')!.dataset.done).toBe('true');
    await expect(byStatus('IN_PROGRESS')!.dataset.done).toBe('true');
    await expect(byStatus('COMPLETED')!.dataset.active).toBe('true');
  },
};

/**
 * Timeline for a CANCELLED run.
 * Terminal status — renders a single step with data-active="true".
 */
export const TimelineCancelled: Story = {
  name: 'Timeline — CANCELLED (terminal single step)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('CANCELLED')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    // Terminal: exactly one step rendered
    await expect(steps).toHaveLength(1);
    await expect(steps[0].dataset.status).toBe('CANCELLED');
    await expect(steps[0].dataset.active).toBe('true');
  },
};

/**
 * Timeline for a FAILED run.
 * Terminal status — renders a single step with data-active="true".
 */
export const TimelineFailed: Story = {
  name: 'Timeline — FAILED (terminal single step)',
  decorators: [
    withSchedulerStore({
      productionRuns: [makeRun('FAILED')],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('run-card'));

    const steps = canvas.getAllByTestId('timeline-step');
    await expect(steps).toHaveLength(1);
    await expect(steps[0].dataset.status).toBe('FAILED');
    await expect(steps[0].dataset.active).toBe('true');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Approve / Cancel interaction stories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * READY run — clicking the approve button in the RunCard calls approveRun
 * with (orgId, orgPlan, runId).
 */
export const WithApproveAction: Story = {
  name: 'Approve Action — approveRun spy called',
  args: { isAdmin: true },
  decorators: [
    (Story: StoryFn) => {
      approveRunSpy.mockClear();
      useAiSchedulerStore.setState({
        machineConfigs:    [],
        productionRuns:    [makeRun('READY')],
        scheduleItems:     [],
        constraints:       [],
        scheduleSummary:   [],
        machineUtilisation: [],
        filters: {
          status:          'ALL',
          scheduleMode:    'ALL',
          fromDate:        null,
          toDate:          null,
          machineConfigId: null,
        },
        isLoading:     false,
        isRunLoading:  false,
        isItemLoading: false,
        error:         null,
        fetchMachineConfigs:     async () => {},
        createMachineConfig:     async () => ({} as never),
        updateMachineConfig:     async () => ({} as never),
        fetchProductionRuns:     async () => {},
        createProductionRun:     async () => ({} as never),
        approveRun:              approveRunSpy,
        cancelRun:               async () => {},
        fetchScheduleItems:      async () => {},
        addScheduleItem:         async () => ({} as never),
        updateItemStatus:        async () => ({} as never),
        fetchConstraints:        async () => {},
        createConstraint:        async () => ({} as never),
        deactivateConstraint:    async () => {},
        fetchScheduleSummary:    async () => {},
        fetchMachineUtilisation: async () => {},
        setFilters:  () => {},
        clearError:  () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return <Story />;
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // run-approve-btn is visible in RunCard for READY runs (no selection needed)
    const approveBtn = canvas.getByTestId('run-approve-btn');
    await userEvent.click(approveBtn);

    await expect(approveRunSpy).toHaveBeenCalledOnce();
    await expect(approveRunSpy).toHaveBeenCalledWith(
      args.orgId,
      args.orgPlan,
      'run-ready',
    );
  },
};

/**
 * READY run — clicking the cancel button in the RunCard calls cancelRun
 * with (orgId, orgPlan, runId).
 */
export const WithCancelAction: Story = {
  name: 'Cancel Action — cancelRun spy called',
  args: { isAdmin: true },
  decorators: [
    (Story: StoryFn) => {
      cancelRunSpy.mockClear();
      useAiSchedulerStore.setState({
        machineConfigs:    [],
        productionRuns:    [makeRun('READY')],
        scheduleItems:     [],
        constraints:       [],
        scheduleSummary:   [],
        machineUtilisation: [],
        filters: {
          status:          'ALL',
          scheduleMode:    'ALL',
          fromDate:        null,
          toDate:          null,
          machineConfigId: null,
        },
        isLoading:     false,
        isRunLoading:  false,
        isItemLoading: false,
        error:         null,
        fetchMachineConfigs:     async () => {},
        createMachineConfig:     async () => ({} as never),
        updateMachineConfig:     async () => ({} as never),
        fetchProductionRuns:     async () => {},
        createProductionRun:     async () => ({} as never),
        approveRun:              async () => ({} as never),
        cancelRun:               cancelRunSpy,
        fetchScheduleItems:      async () => {},
        addScheduleItem:         async () => ({} as never),
        updateItemStatus:        async () => ({} as never),
        fetchConstraints:        async () => {},
        createConstraint:        async () => ({} as never),
        deactivateConstraint:    async () => {},
        fetchScheduleSummary:    async () => {},
        fetchMachineUtilisation: async () => {},
        setFilters:  () => {},
        clearError:  () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      return <Story />;
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // run-cancel-btn visible in RunCard for READY runs
    const cancelBtn = canvas.getByTestId('run-cancel-btn');
    await userEvent.click(cancelBtn);

    await expect(cancelRunSpy).toHaveBeenCalledOnce();
    await expect(cancelRunSpy).toHaveBeenCalledWith(
      args.orgId,
      args.orgPlan,
      'run-ready',
    );
  },
};
