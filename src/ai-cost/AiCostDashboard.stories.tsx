/**
 * src/ai-cost/AiCostDashboard.stories.tsx
 *
 * MONOLITH v17.5 — Storybook CSF3 stories for <AiCostDashboard>
 *
 * Stories cover:
 *  - PlanGateWallFree       — FREE plan → plan-gate-wall shown
 *  - PlanGateWallProfessional — PROFESSIONAL plan → plan-gate-wall shown
 *  - DashboardLoading       — all loading flags true + empty data → skeleton
 *  - EmptyState             — ENTERPRISE, loaded but no data → no-usage-data etc.
 *  - WithUsageData          — 3 months × 2 tools, summary cards, trend bars, table rows
 *  - WithBudgetUtilization  — budget period under threshold (40%)
 *  - BudgetOverThreshold    — budget utilization ≥ alert_threshold (90%) → red bar + warning
 *  - AdminView              — isAdmin = true, admin-only hints visible
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * AiCostDashboard reads from useAiCostEstimationStore.
 * We inject state via useAiCostEstimationStore.setState() inside per-story
 * decorators — same pattern as other module stories.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, within } from '@storybook/test';
import React from 'react';

import { AiCostDashboard } from './AiCostDashboard';
import { useAiCostEstimationStore } from './aiCostEstimationStore';
import type { AiUsageSummary, AiBudgetPeriod, AiCostModel } from './aiCostEstimationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';

/** Current month in "YYYY-MM" format for realistic summary cards */
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const LAST_MONTH = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
})();
const TWO_MONTHS_AGO = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.toISOString().slice(0, 7);
})();

function makeUsageSummary(overrides: Partial<AiUsageSummary> = {}): AiUsageSummary {
  return {
    orgId: ORG_ID,
    tool: 'CHATGPT',
    modelName: 'GPT-4o',
    usageMonth: THIS_MONTH,
    requestCount: 120,
    totalInputTokens: 240000,
    totalOutputTokens: 120000,
    totalCostUsd: 3.6,
    totalCostThb: 126,
    totalTimeSavedMin: 720,
    uniqueEmployees: 4,
    ...overrides,
  };
}

function makeBudgetPeriod(overrides: Partial<AiBudgetPeriod> = {}): AiBudgetPeriod {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    id: 'bp-001',
    orgId: ORG_ID,
    periodType: 'MONTHLY',
    periodLabel: now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${lastDay}`,
    budgetUsd: 100,
    budgetThb: 3500,
    alertThreshold: 0.8,
    alertSent: false,
    notes: null,
    createdBy: 'user-001',
    createdAt: `${year}-${month}-01T00:00:00Z`,
    updatedAt: `${year}-${month}-01T00:00:00Z`,
    ...overrides,
  };
}

function makeCostModel(overrides: Partial<AiCostModel> = {}): AiCostModel {
  return {
    id: 'cm-001',
    orgId: ORG_ID,
    tool: 'CHATGPT',
    displayName: 'GPT-4o',
    costUnit: 'PER_TOKEN',
    rateUsd: 0.005,
    inputRateUsd: 0.003,
    outputRateUsd: 0.015,
    thbExchangeRate: 35,
    isActive: true,
    notes: null,
    createdBy: 'user-001',
    createdAt: '2027-01-01T00:00:00Z',
    updatedAt: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

// 3 months × 2 tools = 6 rows
const MOCK_USAGE: AiUsageSummary[] = [
  // This month
  makeUsageSummary({ tool: 'CHATGPT', modelName: 'GPT-4o', usageMonth: THIS_MONTH, totalCostThb: 126, requestCount: 120, totalTimeSavedMin: 720 }),
  makeUsageSummary({ tool: 'CLAUDE', modelName: 'Claude 3.5 Sonnet', usageMonth: THIS_MONTH, totalCostThb: 89, requestCount: 85, totalTimeSavedMin: 510 }),
  // Last month
  makeUsageSummary({ tool: 'CHATGPT', modelName: 'GPT-4o', usageMonth: LAST_MONTH, totalCostThb: 98, requestCount: 95, totalTimeSavedMin: 570 }),
  makeUsageSummary({ tool: 'CLAUDE', modelName: 'Claude 3.5 Sonnet', usageMonth: LAST_MONTH, totalCostThb: 72, requestCount: 68, totalTimeSavedMin: 408 }),
  // Two months ago
  makeUsageSummary({ tool: 'CHATGPT', modelName: 'GPT-4o', usageMonth: TWO_MONTHS_AGO, totalCostThb: 65, requestCount: 62, totalTimeSavedMin: 372 }),
  makeUsageSummary({ tool: 'GEMINI', modelName: 'Gemini 1.5 Pro', usageMonth: TWO_MONTHS_AGO, totalCostThb: 42, requestCount: 40, totalTimeSavedMin: 240 }),
];

const MOCK_COST_MODELS: AiCostModel[] = [
  makeCostModel({ id: 'cm-001', tool: 'CHATGPT', displayName: 'GPT-4o' }),
  makeCostModel({ id: 'cm-002', tool: 'CLAUDE', displayName: 'Claude 3.5 Sonnet' }),
  makeCostModel({ id: 'cm-003', tool: 'GEMINI', displayName: 'Gemini 1.5 Pro' }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

interface StoreOverride {
  costModels?: AiCostModel[];
  usageSummary?: AiUsageSummary[];
  budgetPeriods?: AiBudgetPeriod[];
  isLoading?: boolean;
  isUsageLoading?: boolean;
  isBudgetLoading?: boolean;
  error?: string | null;
  fetchCostModels?: (...args: unknown[]) => unknown;
  fetchUsageSummary?: (...args: unknown[]) => unknown;
  fetchBudgetPeriods?: (...args: unknown[]) => unknown;
  clearError?: () => void;
}

const withDashboardStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useAiCostEstimationStore.setState({
      costModels: [],
      usageSummary: [],
      budgetPeriods: [],
      isLoading: false,
      isUsageLoading: false,
      isBudgetLoading: false,
      error: null,
      fetchCostModels: (async () => {}) as any,
      fetchUsageSummary: (async () => {}) as any,
      fetchBudgetPeriods: (async () => {}) as any,
      clearError: () => {},
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof AiCostDashboard> = {
  title: 'AiCost/AiCostDashboard',
  component: AiCostDashboard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'AI Cost Estimation Dashboard — ENTERPRISE plan only. ' +
          'Shows monthly spend summary cards, budget utilization bar, ' +
          'monthly cost trend chart, and per-tool usage breakdown table.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'ENTERPRISE',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof AiCostDashboard>;

// ─────────────────────────────────────────────────────────────────────────────
// Plan Gate Wall Stories
// ─────────────────────────────────────────────────────────────────────────────

/** FREE plan cannot access AI Cost Estimation */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withDashboardStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  },
};

/** PROFESSIONAL plan cannot access AI Cost Estimation (ENTERPRISE only) */
export const PlanGateWallProfessional: Story = {
  name: 'Plan Gate Wall (PROFESSIONAL plan)',
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withDashboardStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

/** Loading state: all loading flags true + empty data → skeleton */
export const DashboardLoading: Story = {
  name: 'Dashboard Loading Skeleton',
  decorators: [
    withDashboardStore({
      isLoading: true,
      isUsageLoading: true,
      isBudgetLoading: true,
      costModels: [],
      usageSummary: [],
      budgetPeriods: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('dashboard-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────────────────────

/** ENTERPRISE plan, loaded successfully, but zero data */
export const EmptyState: Story = {
  name: 'Empty State — no data yet',
  decorators: [
    withDashboardStore({
      costModels: [],
      usageSummary: [],
      budgetPeriods: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('ace-dashboard')).toBeInTheDocument();
    await expect(canvas.getByTestId('no-usage-data')).toBeInTheDocument();
    await expect(canvas.getByTestId('no-budget-data')).toBeInTheDocument();
    await expect(canvas.getByTestId('no-trend-data')).toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// With Usage Data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full usage data: 3 months × 2–3 tools.
 * Verifies summary cards, trend bars, and table rows are all present.
 */
export const WithUsageData: Story = {
  name: 'With Usage Data (3 months)',
  decorators: [
    withDashboardStore({
      costModels: MOCK_COST_MODELS,
      usageSummary: MOCK_USAGE,
      budgetPeriods: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Dashboard rendered
    await expect(canvas.getByTestId('ace-dashboard')).toBeInTheDocument();

    // Summary cards all present
    await expect(canvas.getByTestId('summary-cards')).toBeInTheDocument();
    await expect(canvas.getByTestId('total-cost-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('time-saved-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('total-requests-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('models-count-card')).toBeInTheDocument();

    // Trend bars: 3 distinct months
    const trendBars = canvas.getAllByTestId('trend-bar');
    await expect(trendBars.length).toBe(3); // THIS_MONTH, LAST_MONTH, TWO_MONTHS_AGO

    // Usage table rows: 6 rows (3 months × 2-3 tools)
    const tableRows = canvas.getAllByTestId('usage-table-row');
    await expect(tableRows.length).toBe(MOCK_USAGE.length);

    // No empty-state messages when data is present
    await expect(canvas.queryByTestId('no-usage-data')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('no-trend-data')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Budget Utilization (under threshold)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget period present, usage < 80% threshold.
 * No over-threshold warning shown.
 */
export const WithBudgetUtilization: Story = {
  name: 'Budget Utilization — under threshold (40%)',
  decorators: [
    withDashboardStore({
      costModels: MOCK_COST_MODELS,
      usageSummary: [
        // This month spend: 126 + 89 = 215 THB out of 537.50 budget = 40%.
        makeUsageSummary({ totalCostThb: 126, usageMonth: THIS_MONTH }),
        makeUsageSummary({ tool: 'CLAUDE', modelName: 'Claude 3.5', totalCostThb: 89, usageMonth: THIS_MONTH }),
      ],
      budgetPeriods: [makeBudgetPeriod({ budgetThb: 537.5, budgetUsd: 537.5 / 35, alertThreshold: 0.8 })],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('budget-period-item')).toBeInTheDocument();
    await expect(canvas.getByTestId('budget-utilization-bar')).toBeInTheDocument();
    // Under threshold — no warning
    await expect(canvas.queryByTestId('budget-over-threshold')).not.toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Budget Over Threshold
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget period with usage ≥ alert_threshold → red bar + warning badge.
 * Budget = 200 THB, this month spend ≈ 180 THB → 90% utilization.
 */
export const BudgetOverThreshold: Story = {
  name: 'Budget Over Threshold (90%) — warning shown',
  decorators: [
    withDashboardStore({
      costModels: MOCK_COST_MODELS,
      usageSummary: [
        makeUsageSummary({ totalCostThb: 180, usageMonth: THIS_MONTH }),
      ],
      budgetPeriods: [
        makeBudgetPeriod({
          budgetThb: 200,
          budgetUsd: 5.71,
          alertThreshold: 0.8, // 80% threshold — 180/200 = 90% → over
          alertSent: true,
        }),
      ],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('budget-period-item')).toBeInTheDocument();
    await expect(canvas.getByTestId('budget-utilization-bar')).toBeInTheDocument();
    // Over threshold → warning badge visible
    await expect(canvas.getByTestId('budget-over-threshold')).toBeInTheDocument();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin View
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin view: isAdmin = true.
 * Empty data → shows admin-specific text in plan gate (not triggered here — ENTERPRISE),
 * and no-budget-data message shows "สร้างงบประมาณแรกได้เลย".
 */
export const AdminView: Story = {
  name: 'Admin View — isAdmin = true',
  args: { isAdmin: true },
  decorators: [
    withDashboardStore({
      costModels: MOCK_COST_MODELS,
      usageSummary: MOCK_USAGE,
      budgetPeriods: [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Dashboard renders
    await expect(canvas.getByTestId('ace-dashboard')).toBeInTheDocument();

    // No budget yet → admin-specific message shown
    const noBudget = canvas.getByTestId('no-budget-data');
    await expect(noBudget).toBeInTheDocument();
    await expect(noBudget).toHaveTextContent('สร้างงบประมาณแรกได้เลย');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Store Error Banner
// ─────────────────────────────────────────────────────────────────────────────

/** Pre-set store error → error-banner visible */
export const StoreError: Story = {
  name: 'Store Error — error-banner visible',
  decorators: [
    withDashboardStore({
      costModels: [],
      usageSummary: [],
      budgetPeriods: [],
      error: 'ไม่สามารถโหลดข้อมูลต้นทุน AI ได้ กรุณาลองใหม่',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const banner = canvas.getByTestId('error-banner');
    await expect(banner).toBeInTheDocument();
    await expect(banner).toHaveTextContent('ไม่สามารถโหลดข้อมูลต้นทุน AI ได้');
  },
};
