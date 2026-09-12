/**
 * src/culture-metrics/SentimentTimelineBoard.stories.tsx
 *
 * MONOLITH v18.5 Sprint 14 — Storybook CSF3 stories for SentimentTimelineBoard
 *
 * 12 stories:
 *   PlanGateWall            — FREE plan  → est-plan-gate-wall
 *   PlanGateWallStarter     — STARTER plan → est-plan-gate-wall
 *   LoadingState            — loading: true → est-loading
 *   EmptyState              — configs: [], summaries: [] → empty messages
 *   WithDimensionCards      — 5 active configs + summaries → 5 dimension cards
 *   HealthBadgeCritical     — MORALE config + CRITICAL summary
 *   HealthBadgeWarning      — MORALE config + WARNING summary
 *   WithTimeline            — filtered summaries → est-period-row rows
 *   NoTimelineData          — configs active, summaries: [] → est-no-data
 *   SubmitFormInteraction   — play: click submit → submitSentimentEntrySpy called
 *   ErrorBanner             — play: error visible, click clear → clearErrorSpy called
 *   AdminView               — isAdmin: true → admin config panel visible
 *
 * Mock strategy:
 *   withEstStore decorator calls useEstStore.setState(…) to seed state and
 *   replaces all async actions with spies to prevent Supabase calls on mount.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import SentimentTimelineBoard from './SentimentTimelineBoard';
import { useEstStore } from './employeeSentimentStore';
import type { EstSentimentSummary, EstTimelineConfig } from './employeeSentimentTypes';

// =============================================================================
// Module-level spies
// Async action spies use .mockResolvedValue(undefined) so .then() chains work.
// Sync action spies use fn() directly.
// =============================================================================

const fetchSummarySpy           = fn().mockResolvedValue(undefined);
const fetchTimelineConfigsSpy   = fn().mockResolvedValue(undefined);
const submitSentimentEntrySpy   = fn().mockResolvedValue(undefined);
const upsertTimelineConfigSpy   = fn().mockResolvedValue(undefined);
const clearErrorSpy             = fn();
const setFiltersSpy             = fn();

// =============================================================================
// Sample data helpers
// =============================================================================

const ORG_ID = 'org-th';

/** 5 active configs — one per EST dimension */
const ACTIVE_CONFIGS: EstTimelineConfig[] = [
  { id: 'cfg-1', orgId: ORG_ID, dimension: 'MORALE',        isActive: true,  isInverted: false, minResponses: 3, periodType: 'WEEKLY',  createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' },
  { id: 'cfg-2', orgId: ORG_ID, dimension: 'ENGAGEMENT',    isActive: true,  isInverted: false, minResponses: 3, periodType: 'WEEKLY',  createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' },
  { id: 'cfg-3', orgId: ORG_ID, dimension: 'STRESS',        isActive: true,  isInverted: true,  minResponses: 3, periodType: 'WEEKLY',  createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' },
  { id: 'cfg-4', orgId: ORG_ID, dimension: 'COLLABORATION', isActive: true,  isInverted: false, minResponses: 3, periodType: 'MONTHLY', createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' },
  { id: 'cfg-5', orgId: ORG_ID, dimension: 'CLARITY',       isActive: true,  isInverted: false, minResponses: 3, periodType: 'MONTHLY', createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' },
];

/** Inactive configs — dimension cards should NOT render */
const INACTIVE_CONFIGS: EstTimelineConfig[] = ACTIVE_CONFIGS.map((c) => ({
  ...c,
  isActive: false,
}));

function makeSummary(
  dimension: EstSentimentSummary['dimension'],
  avgScore: number,
  healthStatus: EstSentimentSummary['healthStatus'],
  periodLabel = '2027-W10',
): EstSentimentSummary {
  return {
    orgId:         ORG_ID,
    dimension,
    periodType:    'WEEKLY',
    periodLabel,
    avgScore,
    responseCount: 5,
    isInverted:    false,
    minResponses:  3,
    healthStatus,
  };
}

const SUMMARIES_NORMAL: EstSentimentSummary[] = [
  makeSummary('MORALE',        7.5, 'NORMAL'),
  makeSummary('ENGAGEMENT',    8.0, 'NORMAL'),
  makeSummary('STRESS',        4.0, 'NORMAL'),
  makeSummary('COLLABORATION', 8.5, 'NORMAL'),
  makeSummary('CLARITY',       7.0, 'NORMAL'),
];

const SUMMARIES_WITH_TIMELINE: EstSentimentSummary[] = [
  makeSummary('MORALE',     7.5, 'NORMAL',   '2027-W11'),
  makeSummary('MORALE',     6.5, 'WARNING',  '2027-W10'),
  makeSummary('ENGAGEMENT', 8.0, 'NORMAL',   '2027-W11'),
  makeSummary('ENGAGEMENT', 7.5, 'NORMAL',   '2027-W10'),
];

// =============================================================================
// Decorator factory
// =============================================================================

const noopAsync = async () => {};

function withEstStore(
  stateOverride: Partial<ReturnType<typeof useEstStore.getState>>,
) {
  return (Story: StoryFn) => {
    useEstStore.setState({
      summaries: [],
      configs:   [],
      filters:   {},
      loading:   false,
      error:     null,
      // no-op fetches to prevent real Supabase calls on mount
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchSummary:          noopAsync as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchTimelineConfigs:  noopAsync as any,
      // mutating action spies
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submitSentimentEntry:  submitSentimentEntrySpy as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsertTimelineConfig:  upsertTimelineConfigSpy as any,
      setFilters:            setFiltersSpy,
      clearError:            clearErrorSpy,
      ...stateOverride,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    fetchSummarySpy.mockClear();
    fetchTimelineConfigsSpy.mockClear();
    submitSentimentEntrySpy.mockClear();
    upsertTimelineConfigSpy.mockClear();
    clearErrorSpy.mockClear();
    setFiltersSpy.mockClear();

    return <Story />;
  };
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof SentimentTimelineBoard> = {
  title:     'CultureMetrics/SentimentTimelineBoard',
  component: SentimentTimelineBoard,
  parameters: { layout: 'fullscreen' },
  args: {
    orgId:   ORG_ID,
    plan:    'ENTERPRISE',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof SentimentTimelineBoard>;

// =============================================================================
// Stories
// =============================================================================

// ─── Plan gate wall stories ──────────────────────────────────────────────────

/** FREE plan → est-plan-gate-wall (gate renders before useEstStore is read) */
export const PlanGateWall: Story = {
  args:       { plan: 'FREE' },
  decorators: [withEstStore({})],
};

/** STARTER plan → est-plan-gate-wall */
export const PlanGateWallStarter: Story = {
  args:       { plan: 'STARTER' },
  decorators: [withEstStore({})],
};

// ─── Loading skeleton ────────────────────────────────────────────────────────

/** PROFESSIONAL plan + loading:true → est-loading skeleton */
export const LoadingState: Story = {
  args:       { plan: 'PROFESSIONAL' },
  decorators: [withEstStore({ loading: true })],
};

// ─── Board states ────────────────────────────────────────────────────────────

/**
 * EmptyState — ENTERPRISE, no active configs, no summaries
 * → est-board visible, "ยังไม่มีมิติที่เปิดใช้งาน" shown, est-no-data shown
 */
export const EmptyState: Story = {
  decorators: [withEstStore({ configs: INACTIVE_CONFIGS, summaries: [] })],
};

/**
 * WithDimensionCards — 5 active configs + NORMAL summaries
 * → 5 est-dimension-card elements rendered
 */
export const WithDimensionCards: Story = {
  decorators: [
    withEstStore({
      configs:   ACTIVE_CONFIGS,
      summaries: SUMMARIES_NORMAL,
    }),
  ],
};

/** HealthBadgeCritical — MORALE with CRITICAL health status */
export const HealthBadgeCritical: Story = {
  decorators: [
    withEstStore({
      configs: [ACTIVE_CONFIGS[0]],
      summaries: [makeSummary('MORALE', 2.5, 'CRITICAL')],
    }),
  ],
};

/** HealthBadgeWarning — MORALE with WARNING health status */
export const HealthBadgeWarning: Story = {
  decorators: [
    withEstStore({
      configs: [ACTIVE_CONFIGS[0]],
      summaries: [makeSummary('MORALE', 5.5, 'WARNING')],
    }),
  ],
};

/**
 * WithTimeline — multiple summaries across periods
 * → multiple est-period-row elements in timeline section
 */
export const WithTimeline: Story = {
  decorators: [
    withEstStore({
      configs:   ACTIVE_CONFIGS,
      summaries: SUMMARIES_WITH_TIMELINE,
    }),
  ],
};

/**
 * NoTimelineData — active configs but empty summaries
 * → est-no-data shown in timeline section
 */
export const NoTimelineData: Story = {
  decorators: [
    withEstStore({
      configs:   ACTIVE_CONFIGS,
      summaries: [],
    }),
  ],
};

// ─── Interactive stories ─────────────────────────────────────────────────────

/**
 * SubmitFormInteraction
 * play: click Submit button → submitSentimentEntrySpy called once
 */
export const SubmitFormInteraction: Story = {
  decorators: [withEstStore({ configs: ACTIVE_CONFIGS, summaries: SUMMARIES_NORMAL })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submitBtn = canvas.getByTestId('est-submit-btn');
    await userEvent.click(submitBtn);
    expect(submitSentimentEntrySpy).toHaveBeenCalledTimes(1);
  },
};

/**
 * ErrorBanner
 * play: error banner visible → click est-clear-error-btn → clearErrorSpy called
 */
export const ErrorBanner: Story = {
  decorators: [
    withEstStore({
      configs:   ACTIVE_CONFIGS,
      summaries: [],
      error:     'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByTestId('est-error-banner');
    expect(banner).toBeVisible();
    const clearBtn = canvas.getByTestId('est-clear-error-btn');
    await userEvent.click(clearBtn);
    expect(clearErrorSpy).toHaveBeenCalledTimes(1);
  },
};

// ─── Admin view ──────────────────────────────────────────────────────────────

/**
 * AdminView — isAdmin: true → admin config panel section rendered
 */
export const AdminView: Story = {
  args:       { isAdmin: true },
  decorators: [withEstStore({ configs: ACTIVE_CONFIGS, summaries: SUMMARIES_NORMAL })],
};
