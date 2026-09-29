/**
 * src/training/SuperEmployeeProgressPanel.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for <SuperEmployeeProgressPanel>
 *
 * Stories cover:
 *  - Default             (PROFESSIONAL plan, AI_UNAWARE stage, no skill gaps)
 *  - PlanGateWallFree    (FREE plan → plan-gate-wall, no progress-panel)
 *  - PlanGateWallStarter (STARTER plan → plan-gate-wall)
 *  - LoadingSkeleton     (isLoading=true, employeeReadiness=null → panel-loading)
 *  - StageAiUnaware      (score=0  → AI_UNAWARE current, all others upcoming)
 *  - StageAiAware        (score=25 → AI_UNAWARE completed, AI_AWARE current)
 *  - StageAiAssisted     (score=50 → 2 completed, AI_ASSISTED current, AI Readiness badge)
 *  - StageAiPartner      (score=75 → 3 completed, AI_PARTNER current)
 *  - StageSuperEmployee  (score=100 → 4 completed, SUPER_EMPLOYEE current, AI Readiness badge)
 *  - WithSkillGapsNonAdmin (2 open gaps, isAdmin=false → no resolve-gap-btn)
 *  - AdminResolveInteraction (2 open gaps, isAdmin=true → play: click resolve → spy assertion)
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * SuperEmployeeProgressPanel reads from useSuperEmployeeStore:
 *   employeeReadiness, skillGaps, isLoading, error, clearError,
 *   fetchEmployeeReadiness, fetchStageHistory, fetchSkillGaps, resolveSkillGap
 *
 * We inject all fields via useSuperEmployeeStore.setState() inside
 * per-story decorators — same pattern as TrainingEnrollmentPanel.stories.tsx.
 * All fetch actions default to no-ops so the component does not actually
 * call Supabase during Storybook rendering.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from '@storybook/test';
import React from 'react';

import { SuperEmployeeProgressPanel } from './SuperEmployeeProgressPanel';
import { useSuperEmployeeStore } from './superEmployeeStore';
import type { EmployeeAiReadiness, SkillGap } from './superEmployeeTypes';
import type { SuperEmployeeStage } from '../people/types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';
const EMPLOYEE_ID = 'emp-somchai-001';
const EMPLOYEE_NAME = 'สมชาย ใจดี';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

function makeReadiness(
  currentStage: SuperEmployeeStage,
  currentScore: number,
): EmployeeAiReadiness {
  return {
    orgId: ORG_ID,
    employeeId: EMPLOYEE_ID,
    currentStage,
    currentScore,
    lastAssessedAt: '2027-01-15T09:00:00Z',
  };
}

function makeSkillGap(
  id: string,
  skillName: string,
  stageRequired: SuperEmployeeStage,
  overrides: Partial<SkillGap> = {},
): SkillGap {
  return {
    id,
    orgId: ORG_ID,
    employeeId: EMPLOYEE_ID,
    stageRequired,
    skillName,
    skillDescription: `ทักษะที่จำเป็นสำหรับระดับ ${stageRequired}`,
    resolved: false,
    resolvedAt: null,
    createdAt: '2027-01-10T08:00:00Z',
    ...overrides,
  };
}

const MOCK_SKILL_GAPS: SkillGap[] = [
  makeSkillGap('gap-001', 'Prompt Engineering', 'AI_ASSISTED', {
    skillDescription: 'สามารถเขียน prompt ที่ได้ผลลัพธ์แม่นยำสำหรับงาน QC',
  }),
  makeSkillGap('gap-002', 'AI Tool Integration', 'AI_PARTNER', {
    skillDescription: 'ผสานการทำงาน AI tools เข้ากับ workflow ประจำวัน',
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

interface ProgressStoreOverride {
  employeeReadiness?: EmployeeAiReadiness | null;
  skillGaps?: SkillGap[];
  isLoading?: boolean;
  error?: string | null;
  resolveSkillGap?: (...args: unknown[]) => Promise<void>;
  fetchEmployeeReadiness?: (...args: unknown[]) => Promise<void>;
  fetchStageHistory?: (...args: unknown[]) => Promise<void>;
  fetchSkillGaps?: (...args: unknown[]) => Promise<void>;
  clearError?: () => void;
}

const NOOP_FETCH = fn() as any;

const withProgressStore =
  (overrides: ProgressStoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useSuperEmployeeStore.setState({
      employeeReadiness: null,
      skillGaps: [],
      stageHistory: [],
      assessments: [],
      orgReadiness: null,
      isLoading: false,
      isAssessmentLoading: false,
      isOrgLoading: false,
      error: null,
      // Default all fetch actions to no-ops to prevent Supabase calls
      fetchEmployeeReadiness: NOOP_FETCH,
      fetchStageHistory: NOOP_FETCH,
      fetchSkillGaps: NOOP_FETCH,
      fetchAssessments: NOOP_FETCH,
      fetchOrgReadiness: NOOP_FETCH,
      // Default write actions to no-ops
      resolveSkillGap: fn() as any,
      recordStageTransition: fn() as any,
      createAssessment: fn() as any,
      addSkillGap: fn() as any,
      clearError: fn() as any,
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof SuperEmployeeProgressPanel> = {
  title: 'Training/SuperEmployeeProgressPanel',
  component: SuperEmployeeProgressPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'AI Readiness progress panel for the Super Employee Tracker module. ' +
          'Displays the employee\'s current stage, 5-step progression timeline, ' +
          'AI Readiness badge (AI_ASSISTED+), and open skill gap list. ' +
          'PROFESSIONAL+ plan required.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    employeeId: EMPLOYEE_ID,
    employeeName: EMPLOYEE_NAME,
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof SuperEmployeeProgressPanel>;

// ─────────────────────────────────────────────────────────────────────────────
// Plan Gate Wall Stories
// ─────────────────────────────────────────────────────────────────────────────

/** FREE plan: full plan gate wall, no progress-panel rendered */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withProgressStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('progress-panel')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('panel-loading')).not.toBeInTheDocument();
  },
};

/** STARTER plan: plan gate wall visible */
export const PlanGateWallStarter: Story = {
  name: 'Plan Gate Wall (STARTER plan)',
  args: { orgPlan: 'STARTER' },
  decorators: [withProgressStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('progress-panel')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loading skeleton: isLoading=true with employeeReadiness=null
 * (initial mount state while fetch is in flight)
 */
export const LoadingSkeleton: Story = {
  name: 'Loading Skeleton',
  decorators: [
    withProgressStore({
      isLoading: true,
      employeeReadiness: null,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('panel-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('progress-panel')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Stage Timeline Stories — all 5 stages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default / Stage AI_UNAWARE:
 *  - currentScore = 0 → AI_UNAWARE status = current, all others = upcoming
 *  - No AI Readiness badge (score < 50)
 *  - No skill gaps
 */
export const Default: Story = {
  name: 'Stage: AI_UNAWARE (score 0)',
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('AI_UNAWARE', 0),
      skillGaps: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('progress-panel')).toBeInTheDocument();
    await expect(canvas.getByTestId('current-stage-display')).toBeInTheDocument();
    await expect(canvas.getByTestId('current-score')).toHaveTextContent('0');

    // AI Readiness badge should NOT appear (score < 50)
    await expect(canvas.queryByTestId('ai-readiness-badge')).not.toBeInTheDocument();

    // Timeline: 5 steps total
    const steps = canvas.getAllByTestId('stage-step');
    await expect(steps).toHaveLength(5);

    // AI_UNAWARE = current, rest = upcoming
    await expect(steps[0]).toHaveAttribute('data-stage', 'AI_UNAWARE');
    await expect(steps[0]).toHaveAttribute('data-status', 'current');
    await expect(steps[1]).toHaveAttribute('data-stage', 'AI_AWARE');
    await expect(steps[1]).toHaveAttribute('data-status', 'upcoming');
    await expect(steps[4]).toHaveAttribute('data-stage', 'SUPER_EMPLOYEE');
    await expect(steps[4]).toHaveAttribute('data-status', 'upcoming');

    // No open skill gaps
    await expect(canvas.getByTestId('no-gaps-message')).toBeInTheDocument();
    await expect(canvas.queryByTestId('skill-gap-list')).not.toBeInTheDocument();
  },
};

/**
 * Stage AI_AWARE (score=25):
 *  - AI_UNAWARE = completed (score 0 < 25)
 *  - AI_AWARE = current (score 25 === 25)
 *  - AI_ASSISTED, AI_PARTNER, SUPER_EMPLOYEE = upcoming
 *  - No AI Readiness badge
 */
export const StageAiAware: Story = {
  name: 'Stage: AI_AWARE (score 25)',
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('AI_AWARE', 25),
      skillGaps: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('current-score')).toHaveTextContent('25');
    await expect(canvas.queryByTestId('ai-readiness-badge')).not.toBeInTheDocument();

    const steps = canvas.getAllByTestId('stage-step');
    await expect(steps[0]).toHaveAttribute('data-stage', 'AI_UNAWARE');
    await expect(steps[0]).toHaveAttribute('data-status', 'completed');
    await expect(steps[1]).toHaveAttribute('data-stage', 'AI_AWARE');
    await expect(steps[1]).toHaveAttribute('data-status', 'current');
    await expect(steps[2]).toHaveAttribute('data-stage', 'AI_ASSISTED');
    await expect(steps[2]).toHaveAttribute('data-status', 'upcoming');
  },
};

/**
 * Stage AI_ASSISTED (score=50):
 *  - AI_UNAWARE, AI_AWARE = completed
 *  - AI_ASSISTED = current (AI Readiness threshold reached!)
 *  - AI_PARTNER, SUPER_EMPLOYEE = upcoming
 *  - AI Readiness badge VISIBLE (score >= 50)
 */
export const StageAiAssisted: Story = {
  name: 'Stage: AI_ASSISTED (score 50) — AI Readiness Badge',
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('AI_ASSISTED', 50),
      skillGaps: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('current-score')).toHaveTextContent('50');

    // AI Readiness badge must appear at score >= 50
    await expect(canvas.getByTestId('ai-readiness-badge')).toBeInTheDocument();
    await expect(canvas.getByTestId('ai-readiness-badge')).toHaveTextContent('AI Ready');

    const steps = canvas.getAllByTestId('stage-step');
    await expect(steps[0]).toHaveAttribute('data-status', 'completed'); // AI_UNAWARE
    await expect(steps[1]).toHaveAttribute('data-status', 'completed'); // AI_AWARE
    await expect(steps[2]).toHaveAttribute('data-stage', 'AI_ASSISTED');
    await expect(steps[2]).toHaveAttribute('data-status', 'current');
    await expect(steps[3]).toHaveAttribute('data-status', 'upcoming'); // AI_PARTNER
    await expect(steps[4]).toHaveAttribute('data-status', 'upcoming'); // SUPER_EMPLOYEE
  },
};

/**
 * Stage AI_PARTNER (score=75):
 *  - AI_UNAWARE, AI_AWARE, AI_ASSISTED = completed
 *  - AI_PARTNER = current
 *  - SUPER_EMPLOYEE = upcoming
 *  - AI Readiness badge visible
 */
export const StageAiPartner: Story = {
  name: 'Stage: AI_PARTNER (score 75)',
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('AI_PARTNER', 75),
      skillGaps: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('current-score')).toHaveTextContent('75');
    await expect(canvas.getByTestId('ai-readiness-badge')).toBeInTheDocument();

    const steps = canvas.getAllByTestId('stage-step');
    await expect(steps[0]).toHaveAttribute('data-status', 'completed'); // AI_UNAWARE
    await expect(steps[1]).toHaveAttribute('data-status', 'completed'); // AI_AWARE
    await expect(steps[2]).toHaveAttribute('data-status', 'completed'); // AI_ASSISTED
    await expect(steps[3]).toHaveAttribute('data-stage', 'AI_PARTNER');
    await expect(steps[3]).toHaveAttribute('data-status', 'current');
    await expect(steps[4]).toHaveAttribute('data-stage', 'SUPER_EMPLOYEE');
    await expect(steps[4]).toHaveAttribute('data-status', 'upcoming');
  },
};

/**
 * Stage SUPER_EMPLOYEE (score=100):
 *  - AI_UNAWARE, AI_AWARE, AI_ASSISTED, AI_PARTNER = completed
 *  - SUPER_EMPLOYEE = current
 *  - AI Readiness badge visible
 *  - No skill gaps
 */
export const StageSuperEmployee: Story = {
  name: 'Stage: SUPER_EMPLOYEE (score 100) — Peak Stage',
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('SUPER_EMPLOYEE', 100),
      skillGaps: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('current-score')).toHaveTextContent('100');
    await expect(canvas.getByTestId('ai-readiness-badge')).toBeInTheDocument();

    const steps = canvas.getAllByTestId('stage-step');
    await expect(steps[0]).toHaveAttribute('data-status', 'completed'); // AI_UNAWARE
    await expect(steps[1]).toHaveAttribute('data-status', 'completed'); // AI_AWARE
    await expect(steps[2]).toHaveAttribute('data-status', 'completed'); // AI_ASSISTED
    await expect(steps[3]).toHaveAttribute('data-status', 'completed'); // AI_PARTNER
    await expect(steps[4]).toHaveAttribute('data-stage', 'SUPER_EMPLOYEE');
    await expect(steps[4]).toHaveAttribute('data-status', 'current');

    // Peak stage — no open gaps
    await expect(canvas.getByTestId('no-gaps-message')).toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Skill Gap Stories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * With Skill Gaps — non-admin viewer:
 *  - 2 open skill gaps visible in skill-gap-list
 *  - isAdmin=false → no resolve-gap-btn rendered
 */
export const WithSkillGapsNonAdmin: Story = {
  name: 'With Skill Gaps — Non-Admin (no resolve button)',
  args: { isAdmin: false },
  decorators: [
    withProgressStore({
      employeeReadiness: makeReadiness('AI_AWARE', 25),
      skillGaps: MOCK_SKILL_GAPS,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // skill-gap-list visible with 2 items
    await expect(canvas.getByTestId('skill-gap-list')).toBeInTheDocument();
    const gapItems = canvas.getAllByTestId('skill-gap-item');
    await expect(gapItems).toHaveLength(2);

    // First gap shows skill name
    await expect(gapItems[0]).toHaveTextContent('Prompt Engineering');
    await expect(gapItems[1]).toHaveTextContent('AI Tool Integration');

    // No resolve button for non-admin
    await expect(canvas.queryByTestId('resolve-gap-btn')).not.toBeInTheDocument();

    // no-gaps-message should NOT appear when there are open gaps
    await expect(canvas.queryByTestId('no-gaps-message')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Resolve Interaction — Interaction Test
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level spies reset on each play() run to ensure idempotency.
 * resolveSkillGap spy resolves successfully so the component proceeds
 * to call fetchSkillGaps afterward.
 */
const resolveSkillGapSpy = fn().mockResolvedValue(undefined);
const fetchSkillGapsSpy = fn().mockResolvedValue(undefined);

/**
 * Admin Resolve Interaction:
 *  1. 2 skill gaps rendered with resolve-gap-btn (isAdmin=true)
 *  2. Click first resolve button
 *  3. Verify resolveSkillGap spy called with (orgId, orgPlan, gapId)
 *  4. Verify fetchSkillGaps spy called once (re-fetch after resolve)
 */
export const AdminResolveInteraction: Story = {
  name: 'Admin Resolve Skill Gap — Interaction Test',
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
    employeeId: EMPLOYEE_ID,
    employeeName: EMPLOYEE_NAME,
    isAdmin: true,
  },
  decorators: [
    (Story: StoryFn) => {
      // Reset spies on each play() run
      resolveSkillGapSpy.mockClear();
      fetchSkillGapsSpy.mockClear();

      useSuperEmployeeStore.setState({
        employeeReadiness: makeReadiness('AI_AWARE', 25),
        skillGaps: MOCK_SKILL_GAPS,
        stageHistory: [],
        assessments: [],
        orgReadiness: null,
        isLoading: false,
        isAssessmentLoading: false,
        isOrgLoading: false,
        error: null,
        fetchEmployeeReadiness: fn().mockResolvedValue(undefined),
        fetchStageHistory: fn().mockResolvedValue(undefined),
        fetchSkillGaps: fetchSkillGapsSpy,
        fetchAssessments: fn().mockResolvedValue(undefined),
        fetchOrgReadiness: fn().mockResolvedValue(undefined),
        resolveSkillGap: resolveSkillGapSpy,
        recordStageTransition: fn() as any,
        createAssessment: fn() as any,
        addSkillGap: fn() as any,
        clearError: fn() as any,
      });

      return <Story />;
    },
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // 1. Two skill gap items visible
    const gapItems = canvas.getAllByTestId('skill-gap-item');
    await expect(gapItems).toHaveLength(2);

    // 2. Resolve buttons rendered for admin
    const resolveButtons = canvas.getAllByTestId('resolve-gap-btn');
    await expect(resolveButtons).toHaveLength(2);

    // Ignore the initial fetch triggered by the component's mount effect.
    await waitFor(() => expect(fetchSkillGapsSpy).toHaveBeenCalledTimes(1));
    fetchSkillGapsSpy.mockClear();

    // 3. Click the first resolve button (gap-001: Prompt Engineering)
    await userEvent.click(resolveButtons[0]);

    // 4. resolveSkillGap must be called with (orgId, orgPlan, gap.id)
    await expect(resolveSkillGapSpy).toHaveBeenCalledTimes(1);
    await expect(resolveSkillGapSpy).toHaveBeenCalledWith(
      args.orgId,
      args.orgPlan,
      MOCK_SKILL_GAPS[0].id, // 'gap-001'
    );

    // 5. fetchSkillGaps re-fetched after resolve
    await expect(fetchSkillGapsSpy).toHaveBeenCalledTimes(1);
    await expect(fetchSkillGapsSpy).toHaveBeenCalledWith(args.orgId, args.employeeId);
  },
};
