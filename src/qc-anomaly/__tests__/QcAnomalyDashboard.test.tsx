// src/qc-anomaly/__tests__/QcAnomalyDashboard.test.tsx
// MONOLITH v18.5 — Vitest component tests for QcAnomalyDashboard

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { OrgPlan } from '../../tenant/types';
import type { QcaAnomalyEvent, QcaThresholdConfig, QcaFilters } from '../qcAnomalyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mock the store — every exported fn becomes a vi.fn()
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../qcAnomalyStore');

import { useQcAnomalyStore } from '../qcAnomalyStore';
import QcAnomalyDashboard from '../QcAnomalyDashboard';

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: QcaFilters = {
  metricKey: 'ALL',
  severity:  'ALL',
  status:    'OPEN',
};

function makeAnomaly(
  overrides: Partial<QcaAnomalyEvent> = {},
): QcaAnomalyEvent {
  return {
    id:                      'anomaly-1',
    org_id:                  'org-1',
    metric_key:              'DEFECT_RATE',
    measurement_id:          'meas-1',
    threshold_id:            'thr-1',
    severity:                'HIGH',
    status:                  'OPEN',
    measured_value:          12.5,
    threshold_breach_detail: {},
    acknowledged_by:         null,
    acknowledged_at:         null,
    resolved_by:             null,
    resolved_at:             null,
    notes:                   null,
    created_at:              '2027-07-01T08:00:00Z',
    updated_at:              '2027-07-01T08:00:00Z',
    ...overrides,
  };
}

function makeThreshold(
  overrides: Partial<QcaThresholdConfig> = {},
): QcaThresholdConfig {
  return {
    id:                'thr-1',
    org_id:            'org-1',
    metric_key:        'DEFECT_RATE',
    threshold_type:    'MAX',
    min_value:         null,
    max_value:         10,
    zscore_threshold:  null,
    is_active:         true,
    description:       null,
    created_by:        'user-1',
    created_at:        '2027-01-01T00:00:00Z',
    updated_at:        '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

// Explicit interface — avoids ReturnType<> resolving to `unknown` through Vitest auto-mock
interface StoreShape {
  thresholds:           QcaThresholdConfig[];
  anomalies:            QcaAnomalyEvent[];
  summaries:            any[];
  recentMeasurements:   any[];
  selectedAnomalyId:    string | null;
  isLoading:            boolean;
  isMeasurementLoading: boolean;
  filters:              QcaFilters;
  error:                string | null;
  fetchThresholds:    (...args: any[]) => any;
  createThreshold:    (...args: any[]) => any;
  updateThreshold:    (...args: any[]) => any;
  deleteThreshold:    (...args: any[]) => any;
  fetchAnomalies:     (...args: any[]) => any;
  acknowledgeAnomaly: (...args: any[]) => any;
  resolveAnomaly:     (...args: any[]) => any;
  submitMeasurement:  (...args: any[]) => any;
  selectAnomaly:      (...args: any[]) => any;
  setFilters:         (...args: any[]) => any;
  clearError:         (...args: any[]) => any;
}

function makeStore(overrides: Partial<StoreShape> = {}): StoreShape {
  return {
    thresholds:           [],
    anomalies:            [],
    summaries:            [],
    recentMeasurements:   [],
    selectedAnomalyId:    null,
    isLoading:            false,
    isMeasurementLoading: false,
    filters:              DEFAULT_FILTERS,
    error:                null,

    fetchThresholds:    vi.fn(),
    createThreshold:    vi.fn(),
    updateThreshold:    vi.fn(),
    deleteThreshold:    vi.fn(),
    fetchAnomalies:     vi.fn(),
    acknowledgeAnomaly: vi.fn(),
    resolveAnomaly:     vi.fn(),
    submitMeasurement:  vi.fn(),
    selectAnomaly:      vi.fn(),
    setFilters:         vi.fn(),
    clearError:         vi.fn(),

    ...overrides,
  } as StoreShape;
}

function renderBoard(
  orgPlan: OrgPlan,
  storeOverrides: Partial<StoreShape> = {},
  isAdmin = false,
) {
  vi.mocked(useQcAnomalyStore).mockReturnValue(makeStore(storeOverrides) as any);
  return render(
    <QcAnomalyDashboard orgId="org-1" orgPlan={orgPlan} isAdmin={isAdmin} />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset mocks before each test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan gate
// ─────────────────────────────────────────────────────────────────────────────

describe('plan gate wall', () => {
  const nonEnterprisePlans: OrgPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL'];

  it.each(nonEnterprisePlans)(
    'renders qca-plan-gate-wall for %s plan',
    (plan) => {
      renderBoard(plan);
      expect(screen.getByTestId('qca-plan-gate-wall')).toBeInTheDocument();
    },
  );

  it('does NOT render qca-plan-gate-wall for ENTERPRISE plan', () => {
    renderBoard('ENTERPRISE');
    expect(screen.queryByTestId('qca-plan-gate-wall')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Loading state
// ─────────────────────────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows qca-loading when isLoading=true', () => {
    renderBoard('ENTERPRISE', { isLoading: true });
    expect(screen.getByTestId('qca-loading')).toBeInTheDocument();
  });

  it('does NOT show qca-loading when isLoading=false', () => {
    renderBoard('ENTERPRISE', { isLoading: false });
    expect(screen.queryByTestId('qca-loading')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary metric cards
// ─────────────────────────────────────────────────────────────────────────────

describe('summary metric cards', () => {
  it('renders all four summary cards', () => {
    renderBoard('ENTERPRISE');
    expect(screen.getByTestId('qca-open-count-card')).toBeInTheDocument();
    expect(screen.getByTestId('qca-critical-count-card')).toBeInTheDocument();
    expect(screen.getByTestId('qca-acknowledged-count-card')).toBeInTheDocument();
    expect(screen.getByTestId('qca-resolved-count-card')).toBeInTheDocument();
  });

  it('derives open count from anomalies with status=OPEN', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', status: 'OPEN' }),
      makeAnomaly({ id: 'a2', status: 'OPEN' }),
      makeAnomaly({ id: 'a3', status: 'RESOLVED' }),
    ];
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.getByTestId('qca-open-count-card')).toHaveTextContent('2');
  });

  it('derives critical count from anomalies with severity=CRITICAL', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', severity: 'CRITICAL', status: 'OPEN' }),
      makeAnomaly({ id: 'a2', severity: 'HIGH',     status: 'OPEN' }),
    ];
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.getByTestId('qca-critical-count-card')).toHaveTextContent('1');
  });

  it('derives acknowledged count from anomalies with status=ACKNOWLEDGED', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', status: 'ACKNOWLEDGED' }),
      makeAnomaly({ id: 'a2', status: 'ACKNOWLEDGED' }),
      makeAnomaly({ id: 'a3', status: 'OPEN' }),
    ];
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.getByTestId('qca-acknowledged-count-card')).toHaveTextContent('2');
  });

  it('derives resolved count from anomalies with status=RESOLVED', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', status: 'RESOLVED' }),
    ];
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.getByTestId('qca-resolved-count-card')).toHaveTextContent('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filter bar
// ─────────────────────────────────────────────────────────────────────────────

describe('filter bar', () => {
  it('renders metric / severity / status filter selects', () => {
    renderBoard('ENTERPRISE');
    expect(screen.getByTestId('qca-filter-metric')).toBeInTheDocument();
    expect(screen.getByTestId('qca-filter-severity')).toBeInTheDocument();
    expect(screen.getByTestId('qca-filter-status')).toBeInTheDocument();
  });

  it('calls setFilters with metricKey on metric select change', () => {
    const store = makeStore();
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    fireEvent.change(screen.getByTestId('qca-filter-metric'), {
      target: { value: 'DEFECT_RATE' },
    });

    expect(store.setFilters).toHaveBeenCalledWith({ metricKey: 'DEFECT_RATE' });
  });

  it('calls setFilters with severity on severity select change', () => {
    const store = makeStore();
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    fireEvent.change(screen.getByTestId('qca-filter-severity'), {
      target: { value: 'CRITICAL' },
    });

    expect(store.setFilters).toHaveBeenCalledWith({ severity: 'CRITICAL' });
  });

  it('calls setFilters with status on status select change', () => {
    const store = makeStore();
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    fireEvent.change(screen.getByTestId('qca-filter-status'), {
      target: { value: 'RESOLVED' },
    });

    expect(store.setFilters).toHaveBeenCalledWith({ status: 'RESOLVED' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly list
// ─────────────────────────────────────────────────────────────────────────────

describe('anomaly list', () => {
  it('renders qca-empty-anomalies when no anomalies match filters', () => {
    // Default filters: status=OPEN, no OPEN anomalies
    renderBoard('ENTERPRISE', { anomalies: [] });
    expect(screen.getByTestId('qca-empty-anomalies')).toBeInTheDocument();
  });

  it('renders anomaly rows for filtered anomalies', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', status: 'OPEN' }),
      makeAnomaly({ id: 'a2', status: 'OPEN' }),
    ];
    // filters.status = 'OPEN' by default → both show
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.getAllByTestId('qca-anomaly-row')).toHaveLength(2);
  });

  it('does NOT render qca-empty-anomalies when anomaly rows are present', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'OPEN' })];
    renderBoard('ENTERPRISE', { anomalies });
    expect(screen.queryByTestId('qca-empty-anomalies')).toBeNull();
  });

  it('filters anomalies by severity when filters.severity != ALL', () => {
    const anomalies = [
      makeAnomaly({ id: 'a1', status: 'OPEN', severity: 'CRITICAL' }),
      makeAnomaly({ id: 'a2', status: 'OPEN', severity: 'LOW' }),
    ];
    renderBoard('ENTERPRISE', {
      anomalies,
      filters: { ...DEFAULT_FILTERS, severity: 'CRITICAL' },
    });
    expect(screen.getAllByTestId('qca-anomaly-row')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acknowledge button
// ─────────────────────────────────────────────────────────────────────────────

describe('acknowledge button', () => {
  it('visible for admin with OPEN anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'OPEN' })];
    renderBoard('ENTERPRISE', { anomalies }, true);
    expect(screen.getByTestId('qca-acknowledge-btn')).toBeInTheDocument();
  });

  it('absent for non-admin even with OPEN anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'OPEN' })];
    renderBoard('ENTERPRISE', { anomalies }, false);
    expect(screen.queryByTestId('qca-acknowledge-btn')).toBeNull();
  });

  it('absent for admin with ACKNOWLEDGED anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'ACKNOWLEDGED' })];
    renderBoard(
      'ENTERPRISE',
      { anomalies, filters: { ...DEFAULT_FILTERS, status: 'ALL' } },
      true,
    );
    expect(screen.queryByTestId('qca-acknowledge-btn')).toBeNull();
  });

  it('calls acknowledgeAnomaly when clicked by admin', () => {
    const store = makeStore({
      anomalies: [makeAnomaly({ id: 'a1', status: 'OPEN' })],
    });
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" isAdmin />);

    fireEvent.click(screen.getByTestId('qca-acknowledge-btn'));

    expect(store.acknowledgeAnomaly).toHaveBeenCalledWith(
      'a1',
      'ENTERPRISE',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolve button
// ─────────────────────────────────────────────────────────────────────────────

describe('resolve button', () => {
  it('visible for admin with OPEN anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'OPEN' })];
    renderBoard('ENTERPRISE', { anomalies }, true);
    expect(screen.getByTestId('qca-resolve-btn')).toBeInTheDocument();
  });

  it('visible for admin with ACKNOWLEDGED anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'ACKNOWLEDGED' })];
    renderBoard(
      'ENTERPRISE',
      { anomalies, filters: { ...DEFAULT_FILTERS, status: 'ALL' } },
      true,
    );
    expect(screen.getByTestId('qca-resolve-btn')).toBeInTheDocument();
  });

  it('absent for non-admin', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'OPEN' })];
    renderBoard('ENTERPRISE', { anomalies }, false);
    expect(screen.queryByTestId('qca-resolve-btn')).toBeNull();
  });

  it('absent for admin with RESOLVED anomaly', () => {
    const anomalies = [makeAnomaly({ id: 'a1', status: 'RESOLVED' })];
    renderBoard(
      'ENTERPRISE',
      { anomalies, filters: { ...DEFAULT_FILTERS, status: 'ALL' } },
      true,
    );
    expect(screen.queryByTestId('qca-resolve-btn')).toBeNull();
  });

  it('calls resolveAnomaly when clicked by admin', () => {
    const store = makeStore({
      anomalies: [makeAnomaly({ id: 'a1', status: 'OPEN' })],
    });
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" isAdmin />);

    fireEvent.click(screen.getByTestId('qca-resolve-btn'));

    expect(store.resolveAnomaly).toHaveBeenCalledWith(
      'a1',
      'ENTERPRISE',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Threshold toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('threshold toggle', () => {
  it('renders qca-threshold-toggle for admin', () => {
    const thresholds = [makeThreshold()];
    renderBoard('ENTERPRISE', { thresholds }, true);
    expect(screen.getByTestId('qca-threshold-toggle')).toBeInTheDocument();
  });

  it('does NOT render qca-threshold-toggle for non-admin', () => {
    const thresholds = [makeThreshold()];
    renderBoard('ENTERPRISE', { thresholds }, false);
    expect(screen.queryByTestId('qca-threshold-toggle')).toBeNull();
  });

  it('calls updateThreshold on checkbox change', () => {
    const store = makeStore({ thresholds: [makeThreshold()] });
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" isAdmin />);

    fireEvent.click(screen.getByTestId('qca-threshold-toggle'));

    expect(store.updateThreshold).toHaveBeenCalledWith(
      'thr-1',
      { is_active: false },
      'ENTERPRISE',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error banner
// ─────────────────────────────────────────────────────────────────────────────

describe('error banner', () => {
  it('renders qca-error-banner when error is set', () => {
    renderBoard('ENTERPRISE', { error: 'Something went wrong' });
    expect(screen.getByTestId('qca-error-banner')).toBeInTheDocument();
    expect(screen.getByTestId('qca-error-banner')).toHaveTextContent(
      'Something went wrong',
    );
  });

  it('does NOT render qca-error-banner when error is null', () => {
    renderBoard('ENTERPRISE', { error: null });
    expect(screen.queryByTestId('qca-error-banner')).toBeNull();
  });

  it('calls clearError when clear button is clicked', () => {
    const store = makeStore({ error: 'Some error' });
    vi.mocked(useQcAnomalyStore).mockReturnValue(store as any);
    render(<QcAnomalyDashboard orgId="org-1" orgPlan="ENTERPRISE" />);

    const banner = screen.getByTestId('qca-error-banner');
    const clearBtn = banner.querySelector('button')!;
    fireEvent.click(clearBtn);

    expect(store.clearError).toHaveBeenCalledTimes(1);
  });
});
