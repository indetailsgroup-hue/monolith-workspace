/**
 * src/culture-metrics/CultureDashboard.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for CultureDashboard
 *
 * 11 stories:
 *   PlanGateWallFree      — FREE plan → plan-gate-wall shown
 *   PlanGateWallStarter   — STARTER plan → plan-gate-wall shown
 *   DashboardLoading      — isLoading: true → dashboard-loading skeleton
 *   EmptyState            — PROFESSIONAL, no data
 *   WithSurveys           — DRAFT + ACTIVE + CLOSED survey cards (no admin btns)
 *   ActivateSurveyAction  — admin + DRAFT → click activate → spy called
 *   CloseSurveyAction     — admin + ACTIVE → click close → spy called
 *   WithEnpsResults       — one result above threshold, one below
 *   WithOrgHealth         — org health metric rows
 *   AdminView             — ENTERPRISE + isAdmin: true, full data
 *   StoreError            — error string → error-banner shown
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import CultureDashboard from './CultureDashboard';
import { useCultureMetricsStore } from './cultureMetricsStore';
import type {
  CmdEnpsSurvey,
  CmdEnpsResults,
  CmdOrgHealth,
} from './cultureMetricsTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level spies (reset per story in beforeEach)
// ─────────────────────────────────────────────────────────────────────────────

const activateSpy = fn();
const closeSpy    = fn();

// ─────────────────────────────────────────────────────────────────────────────
// Store decorator
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withCultureStore = (state: Record<string, any>) =>
  (Story: StoryFn) => {
    useCultureMetricsStore.setState(state as any);
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_SURVEY: CmdEnpsSurvey = {
  id:               'survey-draft',
  orgId:            'org-1',
  title:            'Q1 2027 eNPS Survey',
  titleTh:          'แบบสำรวจ eNPS ไตรมาส 1 ปี 2027',
  status:           'DRAFT',
  questionText:     'How likely are you to recommend working here?',
  followupQuestion: 'Why did you give this score?',
  opensAt:          null,
  closesAt:         null,
  minResponses:     3,
  notes:            null,
  createdBy:        'user-1',
  createdAt:        '2027-01-01T00:00:00Z',
  updatedAt:        '2027-01-01T00:00:00Z',
};

const ACTIVE_SURVEY: CmdEnpsSurvey = {
  ...DRAFT_SURVEY,
  id:        'survey-active',
  title:     'Q4 2026 eNPS Survey',
  titleTh:   'แบบสำรวจ eNPS ไตรมาส 4 ปี 2026',
  status:    'ACTIVE',
  opensAt:   '2026-12-01T00:00:00Z',
  closesAt:  '2026-12-31T00:00:00Z',
};

const CLOSED_SURVEY: CmdEnpsSurvey = {
  ...DRAFT_SURVEY,
  id:        'survey-closed',
  title:     'Q3 2026 eNPS Survey',
  titleTh:   'แบบสำรวจ eNPS ไตรมาส 3 ปี 2026',
  status:    'CLOSED',
  opensAt:   '2026-09-01T00:00:00Z',
  closesAt:  '2026-09-30T00:00:00Z',
};

/** totalResponses (10) >= minResponses (3) → nps-score-display */
const RESULT_ABOVE_THRESHOLD: CmdEnpsResults = {
  surveyId:       'survey-closed',
  orgId:          'org-1',
  title:          'Q3 2026 eNPS Survey',
  status:         'CLOSED',
  closesAt:       '2026-09-30T00:00:00Z',
  minResponses:   3,
  totalResponses: 10,
  promoterCount:  6,
  passiveCount:   2,
  detractorCount: 2,
  npsScore:       40,
  avgScore:       7.8,
};

/** totalResponses (2) < minResponses (3) → nps-hidden */
const RESULT_BELOW_THRESHOLD: CmdEnpsResults = {
  surveyId:       'survey-active',
  orgId:          'org-1',
  title:          'Q4 2026 eNPS Survey',
  status:         'ACTIVE',
  closesAt:       '2026-12-31T00:00:00Z',
  minResponses:   3,
  totalResponses: 2,
  promoterCount:  1,
  passiveCount:   1,
  detractorCount: 0,
  npsScore:       0,
  avgScore:       6.5,
};

const HEALTH_ROWS: CmdOrgHealth[] = [
  {
    orgId:                 'org-1',
    metricId:              'metric-engagement',
    displayName:           'Employee Engagement',
    displayNameTh:         'ความผูกพันพนักงาน',
    metricCategory:        'ENGAGEMENT',
    metricSource:          'PS_SURVEY',
    targetScore:           80,
    warningThreshold:      60,
    criticalThreshold:     40,
    healthWeight:          0.3,
    latestScore:           72,
    latestRespondentCount: 45,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'NORMAL',
  },
  {
    orgId:                 'org-1',
    metricId:              'metric-training',
    displayName:           'Training Completion Rate',
    displayNameTh:         'อัตราการเรียนรู้สำเร็จ',
    metricCategory:        'CUSTOM',
    metricSource:          'OTHER',
    targetScore:           90,
    warningThreshold:      70,
    criticalThreshold:     50,
    healthWeight:          0.2,
    latestScore:           65,
    latestRespondentCount: 50,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'WARNING',
  },
];

/** Base store state — empty / idle */
const BASE_STATE = {
  metricDefinitions: [],
  snapshots:         [],
  orgHealth:         [] as CmdOrgHealth[],
  enpsSurveys:       [] as CmdEnpsSurvey[],
  enpsResults:       [] as CmdEnpsResults[],
  filters:           { metricCategory: 'ALL', periodType: 'ALL', fromDate: null, toDate: null },
  isLoading:         false,
  isSnapshotLoading: false,
  isEnpsLoading:     false,
  error:             null as string | null,
  fetchMetricDefinitions: fn(),
  createMetricDefinition: fn(),
  updateMetricDefinition: fn(),
  recordSnapshot:         fn(),
  fetchSnapshots:         fn(),
  fetchOrgHealth:         fn(),
  createEnpsSurvey:       fn(),
  activateEnpsSurvey:     fn(),
  closeEnpsSurvey:        fn(),
  submitEnpsResponse:     fn(),
  fetchEnpsSurveys:       fn(),
  fetchEnpsResults:       fn(),
  setFilters:             fn(),
  clearError:             fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof CultureDashboard> = {
  title:      'Culture Metrics/CultureDashboard',
  component:  CultureDashboard,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof CultureDashboard>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

// 1. FREE plan → plan-gate-wall
export const PlanGateWallFree: Story = {
  name: 'Plan Gate – FREE',
  args: { orgId: 'org-1', orgPlan: 'FREE', isAdmin: false },
  decorators: [withCultureStore(BASE_STATE)],
};

// 2. STARTER plan → plan-gate-wall
export const PlanGateWallStarter: Story = {
  name: 'Plan Gate – STARTER',
  args: { orgId: 'org-1', orgPlan: 'STARTER', isAdmin: false },
  decorators: [withCultureStore(BASE_STATE)],
};

// 3. Loading skeleton (isLoading: true)
export const DashboardLoading: Story = {
  name: 'Loading Skeleton',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [withCultureStore({ ...BASE_STATE, isLoading: true })],
};

// 4. Empty state (no surveys / results / health)
export const EmptyState: Story = {
  name: 'Empty State',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [withCultureStore(BASE_STATE)],
};

// 5. Three survey cards — DRAFT + ACTIVE + CLOSED (non-admin, no action buttons)
export const WithSurveys: Story = {
  name: 'With Surveys (DRAFT + ACTIVE + CLOSED)',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      enpsSurveys: [DRAFT_SURVEY, ACTIVE_SURVEY, CLOSED_SURVEY],
    }),
  ],
};

// 6. Admin activates a DRAFT survey
export const ActivateSurveyAction: Story = {
  name: 'Action – Activate Survey',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: true },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      enpsSurveys:       [DRAFT_SURVEY],
      activateEnpsSurvey: activateSpy,
    }),
  ],
  beforeEach() {
    activateSpy.mockReset();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn    = await canvas.findByTestId('survey-activate-btn');
    await userEvent.click(btn);
    expect(activateSpy).toHaveBeenCalledOnce();
    expect(activateSpy).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', 'survey-draft');
  },
};

// 7. Admin closes an ACTIVE survey
export const CloseSurveyAction: Story = {
  name: 'Action – Close Survey',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: true },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      enpsSurveys:    [ACTIVE_SURVEY],
      closeEnpsSurvey: closeSpy,
    }),
  ],
  beforeEach() {
    closeSpy.mockReset();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn    = await canvas.findByTestId('survey-close-btn');
    await userEvent.click(btn);
    expect(closeSpy).toHaveBeenCalledOnce();
    expect(closeSpy).toHaveBeenCalledWith('org-1', 'PROFESSIONAL', 'survey-active');
  },
};

// 8. eNPS results — one above threshold (nps-score-display), one below (nps-hidden)
export const WithEnpsResults: Story = {
  name: 'With eNPS Results (above + below threshold)',
  args: { orgId: 'org-1', orgPlan: 'ENTERPRISE', isAdmin: false },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      enpsSurveys: [CLOSED_SURVEY, ACTIVE_SURVEY],
      enpsResults: [RESULT_ABOVE_THRESHOLD, RESULT_BELOW_THRESHOLD],
    }),
  ],
};

// 9. Org health rows
export const WithOrgHealth: Story = {
  name: 'With Org Health Metrics',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      orgHealth: HEALTH_ROWS,
    }),
  ],
};

// 10. Full admin view — ENTERPRISE + all data
export const AdminView: Story = {
  name: 'Admin View (full data)',
  args: { orgId: 'org-1', orgPlan: 'ENTERPRISE', isAdmin: true },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      enpsSurveys: [DRAFT_SURVEY, ACTIVE_SURVEY, CLOSED_SURVEY],
      enpsResults: [RESULT_ABOVE_THRESHOLD, RESULT_BELOW_THRESHOLD],
      orgHealth:   HEALTH_ROWS,
    }),
  ],
};

// 11. Store error → error-banner
export const StoreError: Story = {
  name: 'Store Error Banner',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      error: 'ไม่สามารถโหลดข้อมูล Culture Metrics ได้ — กรุณาลองใหม่',
    }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Added in sprint 11 — story #12
// ─────────────────────────────────────────────────────────────────────────────

// Org health with three distinct health statuses: NORMAL, WARNING, and CRITICAL.
// The component renders health-metric-row entries via the org-health-section grid.
const METRIC_GRID: CmdOrgHealth[] = [
  ...HEALTH_ROWS,                      // NORMAL (latestScore 72) + WARNING (latestScore 65)
  {
    orgId:                 'org-1',
    metricId:              'metric-turnover',
    displayName:           'Employee Turnover Rate',
    displayNameTh:         'อัตราการลาออกพนักงาน',
    metricCategory:        'ENGAGEMENT',
    metricSource:          'OTHER',
    targetScore:           15,
    warningThreshold:      20,
    criticalThreshold:     30,
    healthWeight:          0.5,
    latestScore:           35,
    latestRespondentCount: 50,
    latestPeriod:          '2026-Q3',
    latestSnapshotDate:    '2026-09-30',
    healthStatus:          'CRITICAL',
  },
];

// 12. Metric grid — org-health-section with NORMAL + WARNING + CRITICAL rows
export const WithMetricGrid: Story = {
  name: 'Metric Grid (NORMAL + WARNING + CRITICAL)',
  args: { orgId: 'org-1', orgPlan: 'PROFESSIONAL', isAdmin: false },
  decorators: [
    withCultureStore({
      ...BASE_STATE,
      orgHealth: METRIC_GRID,
    }),
  ],
};
