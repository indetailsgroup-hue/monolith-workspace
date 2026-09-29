/**
 * src/ai-cost/__tests__/AiCostDashboard.test.tsx
 *
 * Vitest unit tests for AiCostDashboard.tsx
 *
 * Covers:
 *  1. plan gate FREE         → plan-gate-wall rendered, ace-dashboard absent
 *  2. plan gate PROFESSIONAL → plan-gate-wall rendered
 *  3. ENTERPRISE loading (isLoading=true, empty arrays) → dashboard-loading
 *  4. ENTERPRISE empty state → no-budget-data, no-trend-data, no-usage-data
 *  5. Summary cards with current-month data → all 4 card testids + models count
 *  6. Budget over-threshold (9000/10000, alertThreshold=0.8) → budget-over-threshold
 *  7. Budget under-threshold (3000/10000, alertThreshold=0.8) → no budget-over-threshold
 *  8. 3 distinct months in usageSummary → 3 trend-bar elements
 *  9. error state → error-banner with correct message text
 * 10. isAdmin=true in plan-gate-wall → admin-specific upgrade copy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiCostDashboard } from '../AiCostDashboard';
import { useAiCostEstimationStore } from '../aiCostEstimationStore';
import type { AiCostEstimationState } from '../aiCostEstimationStore';
import type { AiTool } from '../aiCostEstimationTypes';

vi.mock('../aiCostEstimationStore');

// ── Dynamic current month — no fake timers needed ────────────────────────────
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ── Fixture helpers ───────────────────────────────────────────────────────────

type SummaryOverrides = Partial<{
  totalCostThb: number;
  totalTimeSavedMin: number;
  requestCount: number;
  tool?: AiTool;
  modelName: string;
}>;

function makeSummaryRow(usageMonth: string, overrides: SummaryOverrides = {}) {
  return {
    orgId: 'org-1',
    tool: 'CHATGPT' as AiTool,
    modelName: 'gpt-4o',
    usageMonth,
    totalCostThb: 500,
    totalCostUsd: 14.3,
    totalTimeSavedMin: 120,
    requestCount: 10,
    ...overrides,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  uniqueEmployees: 1,
};
}

type BudgetOverrides = Partial<{
  budgetThb: number;
  alertThreshold: number;
  startDate: string;
  endDate: string;
}>;

function makeBudgetPeriod(overrides: BudgetOverrides = {}) {
  return {
    id: 'bp-1',
    orgId: 'org-1',
    periodType: 'MONTHLY' as const,
    periodLabel: '2027-01',
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    budgetUsd: 286,
    budgetThb: 10000,
    alertThreshold: 0.8,
    notes: null,
    createdBy: null,
    createdAt: '2027-01-01T00:00:00Z',
    ...overrides,
  alertSent: false,
  updatedAt: '2027-01-01T00:00:00Z',
};
}

function makeStore(overrides: Partial<AiCostEstimationState> = {}) {
  return {
    costModels: [],
    usageLogs: [],
    usageSummary: [],
    taskEstimates: [],
    taskRoi: [],
    budgetPeriods: [],
    filters: {
      tool: 'ALL' as const,
      employeeId: null,
      taskCategory: 'ALL' as const,
      fromDate: null,
      toDate: null,
    },
    isLoading: false,
    isUsageLoading: false,
    isEstimateLoading: false,
    isBudgetLoading: false,
    error: null,
    fetchCostModels: vi.fn(),
    fetchUsageLogs: vi.fn(),
    fetchUsageSummary: vi.fn(),
    fetchTaskEstimates: vi.fn(),
    fetchTaskRoi: vi.fn(),
    fetchBudgetPeriods: vi.fn(),
    createCostModel: vi.fn(),
    updateCostModel: vi.fn(),
    deactivateCostModel: vi.fn(),
    logUsage: vi.fn(),
    createTaskEstimate: vi.fn(),
    updateActuals: vi.fn(),
    createBudgetPeriod: vi.fn(),
    updateBudgetPeriod: vi.fn(),
    setFilters: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AiCostDashboard', () => {
  // ── 1. Plan gate — FREE ────────────────────────────────────────────────────
  it('renders plan-gate-wall for FREE plan', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(makeStore() as any);
    render(<AiCostDashboard orgId="org-1" orgPlan="FREE" />);

    expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  });

  // ── 2. Plan gate — PROFESSIONAL ───────────────────────────────────────────
  it('renders plan-gate-wall for PROFESSIONAL plan', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(makeStore() as any);
    render(<AiCostDashboard orgId="org-1" orgPlan="PROFESSIONAL" />);

    expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  });

  // ── 3. ENTERPRISE — loading skeleton ─────────────────────────────────────
  it('renders dashboard-loading when isLoading=true with empty data arrays', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({ isLoading: true, usageSummary: [], budgetPeriods: [] }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('ace-dashboard')).not.toBeInTheDocument();
  });

  // ── 4. ENTERPRISE — empty state ───────────────────────────────────────────
  it('renders no-budget-data, no-trend-data, no-usage-data when ENTERPRISE with no data', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(makeStore() as any);
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    expect(screen.getByTestId('no-budget-data')).toBeInTheDocument();
    expect(screen.getByTestId('no-trend-data')).toBeInTheDocument();
    expect(screen.getByTestId('no-usage-data')).toBeInTheDocument();
  });

  // ── 5. Summary cards with current-month data ─────────────────────────────
  it('renders all 4 summary cards and displays active models count', () => {
    const summaryRow = makeSummaryRow(CURRENT_MONTH, {
      totalCostThb: 1500,
      totalTimeSavedMin: 180,
      requestCount: 25,
    });
    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({
        usageSummary: [summaryRow],
        costModels: [{ id: 'm1' } as any],
      }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    expect(screen.getByTestId('summary-cards')).toBeInTheDocument();
    expect(screen.getByTestId('total-cost-card')).toBeInTheDocument();
    expect(screen.getByTestId('time-saved-card')).toBeInTheDocument();
    expect(screen.getByTestId('total-requests-card')).toBeInTheDocument();
    expect(screen.getByTestId('models-count-card')).toBeInTheDocument();
    // Active models count from costModels.length
    expect(screen.getByTestId('models-count-card')).toHaveTextContent('1');
  });

  // ── 6. Budget over-threshold ──────────────────────────────────────────────
  it('shows budget-over-threshold when utilisation (90%) >= alertThreshold (80%)', () => {
    const budget = makeBudgetPeriod({
      budgetThb: 10000,
      alertThreshold: 0.8,
      startDate: '2027-01-01',
    });
    const summaryRow = makeSummaryRow('2027-01', { totalCostThb: 9000 });

    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({ budgetPeriods: [budget], usageSummary: [summaryRow] }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    expect(screen.getByTestId('budget-over-threshold')).toBeInTheDocument();
  });

  // ── 7. Budget under-threshold ─────────────────────────────────────────────
  it('does NOT show budget-over-threshold when utilisation (30%) < alertThreshold (80%)', () => {
    const budget = makeBudgetPeriod({
      budgetThb: 10000,
      alertThreshold: 0.8,
      startDate: '2027-01-01',
    });
    const summaryRow = makeSummaryRow('2027-01', { totalCostThb: 3000 });

    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({ budgetPeriods: [budget], usageSummary: [summaryRow] }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    expect(screen.queryByTestId('budget-over-threshold')).not.toBeInTheDocument();
  });

  // ── 8. Monthly trend bars ─────────────────────────────────────────────────
  it('renders exactly 3 trend-bar elements for 3 distinct months', () => {
    const summaryRows = [
      makeSummaryRow('2026-07', { totalCostThb: 800 }),
      makeSummaryRow('2026-08', { totalCostThb: 1200 }),
      makeSummaryRow('2026-09', { totalCostThb: 950 }),
    ];
    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({ usageSummary: summaryRows }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    const bars = screen.getAllByTestId('trend-bar');
    expect(bars).toHaveLength(3);
  });

  // ── 9. Error banner ───────────────────────────────────────────────────────
  it('renders error-banner with the error message text', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(
      makeStore({ error: 'Network timeout' }) as any
    );
    render(<AiCostDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    const banner = screen.getByTestId('error-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('Network timeout');
  });

  // ── 10. isAdmin plan-gate-wall copy ──────────────────────────────────────
  it('shows admin-specific upgrade copy inside plan-gate-wall when isAdmin=true', () => {
    vi.mocked(useAiCostEstimationStore).mockReturnValue(makeStore() as any);
    render(<AiCostDashboard orgId="org-1" orgPlan="FREE" isAdmin />);

    expect(screen.getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(
      screen.getByText('ติดต่อทีมขายเพื่ออัปเกรดไปยังแผน ENTERPRISE')
    ).toBeInTheDocument();
  });
});
