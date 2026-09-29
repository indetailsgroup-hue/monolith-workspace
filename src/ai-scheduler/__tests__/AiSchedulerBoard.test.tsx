/**
 * src/ai-scheduler/__tests__/AiSchedulerBoard.test.tsx
 *
 * MONOLITH v17.5 — Vitest unit tests for <AiSchedulerBoard>
 *
 * Coverage:
 *  1. Plan gate wall — FREE / PROFESSIONAL / STARTER plans render plan-gate-wall
 *  2. RunStatusTimeline active/done data attributes for:
 *       DRAFT      — first step active, none done
 *       GENERATING — DRAFT done, GENERATING active
 *       APPROVED   — DRAFT+GENERATING+READY done, APPROVED active
 *       CANCELLED  — single terminal step, data-active="true"
 *  3. Approve button (run-approve-btn) absent in RunCard for:
 *       DRAFT, APPROVED, IN_PROGRESS runs (only READY shows approve btn)
 *
 * Mock strategy (mirrors AiCostDashboard.test.tsx):
 *   vi.mock('../aiSchedulerStore')           ← auto-mock the module
 *   vi.mocked(useAiSchedulerStore).mockReturnValue(makeStore() as any)
 *   fireEvent.click(runCard) to select run → right-panel timeline visible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

import { AiSchedulerBoard } from '../AiSchedulerBoard';
import { useAiSchedulerStore } from '../aiSchedulerStore';
import type { ApsProductionRun, ApsRunStatus } from '../aiSchedulerTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mock the store
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../aiSchedulerStore');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID   = 'org-test-001';
const ORG_PLAN = 'ENTERPRISE' as const;

function makeRun(status: ApsRunStatus, id = `run-${status}`): ApsProductionRun {
  return {
    id,
    orgId:                  ORG_ID,
    runLabel:               `Test Run ${status}`,
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
  };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
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
    fetchMachineConfigs:     vi.fn(),
    createMachineConfig:     vi.fn(),
    updateMachineConfig:     vi.fn(),
    fetchProductionRuns:     vi.fn(),
    createProductionRun:     vi.fn(),
    approveRun:              vi.fn(),
    cancelRun:               vi.fn(),
    fetchScheduleItems:      vi.fn(),
    addScheduleItem:         vi.fn(),
    updateItemStatus:        vi.fn(),
    fetchConstraints:        vi.fn(),
    createConstraint:        vi.fn(),
    deactivateConstraint:    vi.fn(),
    fetchScheduleSummary:    vi.fn(),
    fetchMachineUtilisation: vi.fn(),
    setFilters:  vi.fn(),
    clearError:  vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useAiSchedulerStore).mockReturnValue(makeStore() as ReturnType<typeof useAiSchedulerStore>);
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Plan Gate Wall
// ─────────────────────────────────────────────────────────────────────────────

describe('AiSchedulerBoard — plan gate wall', () => {
  it.each([
    ['FREE'],
    ['PROFESSIONAL'],
    ['STARTER'],
  ] as const)('renders plan-gate-wall for %s plan', (orgPlan) => {
    const { getByTestId, queryByTestId } = render(
      <AiSchedulerBoard orgId={ORG_ID} orgPlan={orgPlan} />,
    );

    expect(getByTestId('plan-gate-wall')).toBeInTheDocument();
    expect(queryByTestId('aps-board')).not.toBeInTheDocument();
  });

  it('renders aps-board for ENTERPRISE plan', () => {
    const { getByTestId, queryByTestId } = render(
      <AiSchedulerBoard orgId={ORG_ID} orgPlan={ORG_PLAN} />,
    );

    expect(getByTestId('aps-board')).toBeInTheDocument();
    expect(queryByTestId('plan-gate-wall')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RunStatusTimeline — active / done attributes
// ─────────────────────────────────────────────────────────────────────────────

describe('AiSchedulerBoard — RunStatusTimeline attributes', () => {
  /**
   * Helper: render board with a single run, click its run-card to select it
   * (which mounts the right-panel timeline), then return all timeline-step els.
   */
  function renderAndSelectRun(run: ApsProductionRun) {
    vi.mocked(useAiSchedulerStore).mockReturnValue(
      makeStore({ productionRuns: [run] }) as ReturnType<typeof useAiSchedulerStore>,
    );

    const utils = render(<AiSchedulerBoard orgId={ORG_ID} orgPlan={ORG_PLAN} />);

    // Click the run-card to select the run → right panel + timeline render
    const runCard = utils.getByTestId('run-card');
    fireEvent.click(runCard);

    return utils;
  }

  function byStatus(
    steps: HTMLElement[],
    status: ApsRunStatus,
  ): HTMLElement | undefined {
    return steps.find((s) => (s as HTMLElement).dataset.status === status);
  }

  it('DRAFT — first step active, no steps done', () => {
    const { getAllByTestId } = renderAndSelectRun(makeRun('DRAFT'));
    const steps = getAllByTestId('timeline-step') as HTMLElement[];

    const draftStep = byStatus(steps, 'DRAFT')!;
    expect(draftStep).toBeDefined();
    expect(draftStep.dataset.active).toBe('true');
    expect(draftStep.dataset.done).not.toBe('true');
  });

  it('GENERATING — DRAFT done, GENERATING active', () => {
    const { getAllByTestId } = renderAndSelectRun(makeRun('GENERATING'));
    const steps = getAllByTestId('timeline-step') as HTMLElement[];

    expect(byStatus(steps, 'DRAFT')!.dataset.done).toBe('true');
    expect(byStatus(steps, 'GENERATING')!.dataset.active).toBe('true');
  });

  it('APPROVED — DRAFT, GENERATING, READY done; APPROVED active', () => {
    const { getAllByTestId } = renderAndSelectRun(makeRun('APPROVED'));
    const steps = getAllByTestId('timeline-step') as HTMLElement[];

    expect(byStatus(steps, 'DRAFT')!.dataset.done).toBe('true');
    expect(byStatus(steps, 'GENERATING')!.dataset.done).toBe('true');
    expect(byStatus(steps, 'READY')!.dataset.done).toBe('true');
    expect(byStatus(steps, 'APPROVED')!.dataset.active).toBe('true');
  });

  it('CANCELLED — single terminal step, data-active="true"', () => {
    const { getAllByTestId } = renderAndSelectRun(makeRun('CANCELLED'));
    const steps = getAllByTestId('timeline-step') as HTMLElement[];

    // Terminal status renders exactly one step
    expect(steps).toHaveLength(1);
    expect(steps[0].dataset.status).toBe('CANCELLED');
    expect(steps[0].dataset.active).toBe('true');
  });

  it('FAILED — single terminal step, data-active="true"', () => {
    const { getAllByTestId } = renderAndSelectRun(makeRun('FAILED'));
    const steps = getAllByTestId('timeline-step') as HTMLElement[];

    expect(steps).toHaveLength(1);
    expect(steps[0].dataset.status).toBe('FAILED');
    expect(steps[0].dataset.active).toBe('true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Approve button — absent for non-READY runs
// ─────────────────────────────────────────────────────────────────────────────

describe('AiSchedulerBoard — approve button absent for non-READY runs', () => {
  it.each([
    ['DRAFT'],
    ['APPROVED'],
    ['IN_PROGRESS'],
    ['COMPLETED'],
    ['CANCELLED'],
    ['FAILED'],
  ] as const)('no run-approve-btn for %s run', (status) => {
    vi.mocked(useAiSchedulerStore).mockReturnValue(
      makeStore({ productionRuns: [makeRun(status)] }) as ReturnType<typeof useAiSchedulerStore>,
    );

    const { queryAllByTestId } = render(
      <AiSchedulerBoard orgId={ORG_ID} orgPlan={ORG_PLAN} />,
    );

    // run-approve-btn only shows for READY — none of these should have it
    expect(queryAllByTestId('run-approve-btn')).toHaveLength(0);
  });

  it('run-approve-btn IS present for READY run', () => {
    vi.mocked(useAiSchedulerStore).mockReturnValue(
      makeStore({ productionRuns: [makeRun('READY')] }) as ReturnType<typeof useAiSchedulerStore>,
    );

    const { getAllByTestId } = render(
      <AiSchedulerBoard orgId={ORG_ID} orgPlan={ORG_PLAN} />,
    );

    // Approve button visible in RunCard for READY run
    expect(getAllByTestId('run-approve-btn').length).toBeGreaterThan(0);
  });
});
