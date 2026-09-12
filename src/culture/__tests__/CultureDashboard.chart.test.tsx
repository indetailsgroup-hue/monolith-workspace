import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CultureDashboard } from '../CultureDashboard';
import { useCultureStore } from '../cultureStore';
import type { PsScore } from '../types';

// Give Recharts a measured viewport while keeping its real chart, axes,
// tick formatting, and the production store selectors in this regression.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width: number; height: number }> }) =>
      React.cloneElement(children, { width: 640, height: 230 }),
  };
});

vi.mock('../../tenant/tenantStore', () => ({
  useTenantStore: (selector: (state: { currentMember: null }) => unknown) =>
    selector({ currentMember: null }),
}));

const initialState = useCultureStore.getState();
const score = (periodLabel: string, value: number): PsScore => ({
  id: `synthetic-${periodLabel}`, orgId: 'chart-org', surveyId: 'synthetic-survey',
  periodLabel, periodType: 'QUARTERLY', score: value,
  dimensionScores: { SPEAK_UP: value, HELP_SEEKING: value, RISK_TAKING: value, INCLUSION: value },
  responseCount: 10, computedAt: '2026-07-01T00:00:00Z',
});

beforeEach(() => {
  useCultureStore.setState({
    ...initialState,
    psScores: [score('2569-Q2', 62), score('2569-Q1', 42)],
    activeSurvey: null,
    fetchPsScores: vi.fn(async () => undefined),
  }, true);
});

afterEach(() => {
  cleanup();
  useCultureStore.setState(initialState, true);
});

describe('CultureDashboard chart contract', () => {
  it('renders historical quarter labels from the actual score selector without an active survey', () => {
    render(<CultureDashboard orgId="chart-org" />);
    expect(screen.getByText('ไตรมาส 1/2569')).toBeVisible();
    expect(screen.getByText('ไตรมาส 2/2569')).toBeVisible();
  });
});
