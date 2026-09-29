/**
 * src/qc-anomaly/QcAnomalyDashboard.stories.tsx
 *
 * MONOLITH v18.0 — Storybook CSF3 stories for QcAnomalyDashboard
 *
 * 14 stories:
 *   PlanGateWall              — FREE plan → qca-plan-gate-wall, no board
 *   PlanGateWallProfessional  — PROFESSIONAL → qca-plan-gate-wall
 *   LoadingState              — ENTERPRISE + isLoading → qca-loading
 *   EmptyAnomalies            — no anomalies → qca-empty-anomalies
 *   SummaryCards              — anomalies with OPEN/CRITICAL/ACK/RESOLVED counts
 *   AnomalyList               — 3 anomalies rendered with rows + badges
 *   CriticalAnomaly           — CRITICAL severity badge attribute
 *   ThresholdPanel            — thresholds rendered with rows + toggle
 *   EmptyThresholds           — no thresholds → qca-empty-thresholds
 *   FilterBar                 — filter selects present
 *   AcknowledgeInteraction    — play: click acknowledge → spy called
 *   ResolveInteraction        — play: click resolve → spy called
 *   ErrorBanner               — error state → banner; no clear btn in this component
 *   ThresholdToggleInteraction— play: click threshold toggle → spy called
 *
 * Mock strategy:
 *   withQcAnomalyStore decorator calls useQcAnomalyStore.setState(…) to seed
 *   state + replace async actions with spies.
 *   fetchThresholds/fetchAnomalies always replaced with no-ops.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import QcAnomalyDashboard from './QcAnomalyDashboard';
import { useQcAnomalyStore } from './qcAnomalyStore';
import type {
  QcaThresholdConfig,
  QcaAnomalyEvent,
  QcaAnomalySummary,
} from './qcAnomalyTypes';
import { DEFAULT_QCA_FILTERS } from './qcAnomalyTypes';

// =============================================================================
// Module-level spies
// =============================================================================

const acknowledgeAnomalySpy = fn();
const resolveAnomalySpy     = fn();
const updateThresholdSpy    = fn();
const createThresholdSpy    = fn();
const deleteThresholdSpy    = fn();
const submitMeasurementSpy  = fn();

// =============================================================================
// Sample data helpers
// =============================================================================

function makeAnomaly(overrides: Partial<QcaAnomalyEvent>): QcaAnomalyEvent {
  const id = overrides.id ?? 'anomaly-1';
  return {
    id,
    org_id:                   'org-th',
    metric_key:               'DEFECT_RATE',
    measurement_id:           `meas-${id}`,
    threshold_id:             'thr-1',
    severity:                 'MEDIUM',
    status:                   'OPEN',
    measured_value:           0.12,
    threshold_breach_detail:  { min: 0.05, actual: 0.12 },
    acknowledged_by:          null,
    acknowledged_at:          null,
    resolved_by:              null,
    resolved_at:              null,
    notes:                    null,
    created_at:               '2027-02-20T08:00:00Z',
    updated_at:               '2027-02-20T08:00:00Z',
    ...overrides,
  };
}

function makeThreshold(overrides: Partial<QcaThresholdConfig>): QcaThresholdConfig {
  const id = overrides.id ?? 'thr-1';
  return {
    id,
    org_id:            'org-th',
    metric_key:        'DEFECT_RATE',
    threshold_type:    'MAX',
    min_value:         null,
    max_value:         0.05,
    zscore_threshold:  null,
    is_active:         true,
    description:       'Defect rate must stay below 5%',
    created_by:        'user-admin',
    created_at:        '2027-02-15T00:00:00Z',
    updated_at:        '2027-02-15T00:00:00Z',
    ...overrides,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ANOMALY_OPEN   = makeAnomaly({ id: 'anomaly-open',   severity: 'MEDIUM',   status: 'OPEN' });
const ANOMALY_CRIT   = makeAnomaly({ id: 'anomaly-crit',   severity: 'CRITICAL', status: 'OPEN',         metric_key: 'CYCLE_TIME' });
const ANOMALY_ACK    = makeAnomaly({ id: 'anomaly-ack',    severity: 'HIGH',     status: 'ACKNOWLEDGED', acknowledged_by: 'user-mgr', acknowledged_at: '2027-02-20T09:00:00Z' });
const ANOMALY_RESOLVED = makeAnomaly({ id: 'anomaly-res',  severity: 'LOW',      status: 'RESOLVED',     resolved_by: 'user-mgr', resolved_at: '2027-02-20T10:00:00Z' });

const THR_ACTIVE   = makeThreshold({ id: 'thr-active',   is_active: true,  metric_key: 'DEFECT_RATE' });
const THR_INACTIVE = makeThreshold({ id: 'thr-inactive', is_active: false, metric_key: 'SCRAP_RATE', description: 'Scrap rate threshold (disabled)' });

const SUMMARIES: QcaAnomalySummary[] = [
  { org_id: 'org-th', metric_key: 'DEFECT_RATE', open_count: 2, acknowledged_count: 1, resolved_count: 1, last_open_anomaly_at: '2027-02-20T08:00:00Z', last_anomaly_at: '2027-02-20T08:00:00Z' },
  { org_id: 'org-th', metric_key: 'CYCLE_TIME',  open_count: 1, acknowledged_count: 0, resolved_count: 0, last_open_anomaly_at: '2027-02-20T08:30:00Z', last_anomaly_at: '2027-02-20T08:30:00Z' },
];

// =============================================================================
// Decorator factory
// =============================================================================

const noopAsync = async () => {};

function withQcAnomalyStore(
  stateOverride: Partial<ReturnType<typeof useQcAnomalyStore.getState>>,
) {
  return (Story: StoryFn) => {
    useQcAnomalyStore.setState({
      thresholds:           [],
      anomalies:            [],
      summaries:            [],
      recentMeasurements:   [],
      selectedAnomalyId:    null,
      isLoading:            false,
      isMeasurementLoading: false,
      filters:              DEFAULT_QCA_FILTERS,
      error:                null,
      // no-op all async actions to prevent Supabase calls
      fetchThresholds:    noopAsync,
      fetchAnomalies:     noopAsync,
      createThreshold:    createThresholdSpy,
      updateThreshold:    updateThresholdSpy,
      deleteThreshold:    deleteThresholdSpy,
      acknowledgeAnomaly: acknowledgeAnomalySpy,
      resolveAnomaly:     resolveAnomalySpy,
      submitMeasurement:  submitMeasurementSpy,
      selectAnomaly: (id) => useQcAnomalyStore.setState({ selectedAnomalyId: id }),
      setFilters:    (f)  => useQcAnomalyStore.setState((s) => ({ filters: { ...s.filters, ...f } })),
      clearError:    ()   => useQcAnomalyStore.setState({ error: null }),
      ...stateOverride,
    });
    acknowledgeAnomalySpy.mockClear();
    resolveAnomalySpy.mockClear();
    updateThresholdSpy.mockClear();
    return <Story />;
  };
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof QcAnomalyDashboard> = {
  title:     'Modules/QcAnomaly/QcAnomalyDashboard',
  component: QcAnomalyDashboard,
  parameters: { layout: 'fullscreen' },
  args: {
    orgId:   'org-th',
    orgPlan: 'ENTERPRISE',
    isAdmin: false,
  },
};
export default meta;
type Story = StoryObj<typeof QcAnomalyDashboard>;

// =============================================================================
// Stories
// =============================================================================

// ─── 1. Plan Gate Wall — FREE ─────────────────────────────────────────────────

export const PlanGateWall: Story = {
  args: { orgPlan: 'FREE' },
  decorators: [withQcAnomalyStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('qca-summary-cards')).not.toBeInTheDocument();
  },
};

// ─── 2. Plan Gate Wall — PROFESSIONAL ────────────────────────────────────────

export const PlanGateWallProfessional: Story = {
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withQcAnomalyStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-plan-gate-wall')).toBeInTheDocument();
  },
};

// ─── 3. Loading State ─────────────────────────────────────────────────────────

export const LoadingState: Story = {
  decorators: [withQcAnomalyStore({ isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('qca-summary-cards')).not.toBeInTheDocument();
  },
};

// ─── 4. Empty Anomalies ───────────────────────────────────────────────────────

export const EmptyAnomalies: Story = {
  decorators: [
    withQcAnomalyStore({ anomalies: [], thresholds: [THR_ACTIVE], summaries: [] }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-empty-anomalies')).toBeInTheDocument();
    await expect(canvas.queryByTestId('qca-anomaly-list')).not.toBeInTheDocument();
  },
};

// ─── 5. Summary Cards ─────────────────────────────────────────────────────────

export const SummaryCards: Story = {
  decorators: [
    withQcAnomalyStore({
      anomalies: [ANOMALY_OPEN, ANOMALY_CRIT, ANOMALY_ACK, ANOMALY_RESOLVED],
      summaries: SUMMARIES,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-summary-cards')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-open-count-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-critical-count-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-acknowledged-count-card')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-resolved-count-card')).toBeInTheDocument();
  },
};

// ─── 6. Anomaly List ──────────────────────────────────────────────────────────

export const AnomalyList: Story = {
  decorators: [
    withQcAnomalyStore({
      anomalies: [ANOMALY_OPEN, ANOMALY_CRIT, ANOMALY_ACK],
      summaries: SUMMARIES,
      filters:   { ...DEFAULT_QCA_FILTERS, status: 'ALL' },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-anomaly-list')).toBeInTheDocument();
    const rows = canvas.getAllByTestId('qca-anomaly-row');
    await expect(rows).toHaveLength(3);
  },
};

// ─── 7. Critical Anomaly — severity badge ─────────────────────────────────────

export const CriticalAnomaly: Story = {
  decorators: [
    withQcAnomalyStore({
      anomalies: [ANOMALY_CRIT],
      summaries: SUMMARIES,
      filters:   { ...DEFAULT_QCA_FILTERS, status: 'ALL' },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByTestId('qca-severity-badge');
    await expect(badge).toBeInTheDocument();
    await expect(badge).toHaveTextContent('วิกฤต');
  },
};

// ─── 8. Threshold Panel — active rows with toggle ────────────────────────────

export const ThresholdPanel: Story = {
  args: { isAdmin: true },
  decorators: [
    withQcAnomalyStore({
      thresholds: [THR_ACTIVE, THR_INACTIVE],
      anomalies:  [],
      summaries:  [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-threshold-panel')).toBeInTheDocument();
    const rows = canvas.getAllByTestId('qca-threshold-row');
    await expect(rows).toHaveLength(2);
    // Both rows have a toggle
    const toggles = canvas.getAllByTestId('qca-threshold-toggle');
    await expect(toggles).toHaveLength(2);
  },
};

// ─── 9. Empty Thresholds ──────────────────────────────────────────────────────

export const EmptyThresholds: Story = {
  decorators: [
    withQcAnomalyStore({ thresholds: [], anomalies: [], summaries: [] }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-empty-thresholds')).toBeInTheDocument();
    await expect(canvas.queryByTestId('qca-threshold-row')).not.toBeInTheDocument();
  },
};

// ─── 10. Filter Bar ───────────────────────────────────────────────────────────

export const FilterBar: Story = {
  decorators: [
    withQcAnomalyStore({ anomalies: [ANOMALY_OPEN], summaries: SUMMARIES }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-filter-bar')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-filter-metric')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-filter-severity')).toBeInTheDocument();
    await expect(canvas.getByTestId('qca-filter-status')).toBeInTheDocument();
  },
};

// ─── 11. Acknowledge interaction ──────────────────────────────────────────────

export const AcknowledgeInteraction: Story = {
  args: { isAdmin: true },
  decorators: [
    withQcAnomalyStore({
      anomalies: [ANOMALY_OPEN],
      summaries: SUMMARIES,
      filters:   { ...DEFAULT_QCA_FILTERS, status: 'ALL' },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ackBtn = canvas.getByTestId('qca-acknowledge-btn');
    await userEvent.click(ackBtn);
    await expect(acknowledgeAnomalySpy).toHaveBeenCalledWith(ANOMALY_OPEN.id, 'ENTERPRISE');
  },
};

// ─── 12. Resolve interaction ──────────────────────────────────────────────────

export const ResolveInteraction: Story = {
  args: { isAdmin: true },
  decorators: [
    withQcAnomalyStore({
      anomalies: [ANOMALY_ACK],
      summaries: SUMMARIES,
      filters:   { ...DEFAULT_QCA_FILTERS, status: 'ALL' },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resolveBtn = canvas.getByTestId('qca-resolve-btn');
    await userEvent.click(resolveBtn);
    await expect(resolveAnomalySpy).toHaveBeenCalledWith(ANOMALY_ACK.id, 'ENTERPRISE');
  },
};

// ─── 13. Error Banner ─────────────────────────────────────────────────────────

export const ErrorBanner: Story = {
  decorators: [
    withQcAnomalyStore({
      anomalies: [],
      summaries: [],
      error:     'โหลดข้อมูล QC Anomaly ล้มเหลว กรุณาลองใหม่',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('qca-error-banner')).toBeInTheDocument();
  },
};

// ─── 14. Threshold Toggle interaction ─────────────────────────────────────────

export const ThresholdToggleInteraction: Story = {
  args: { isAdmin: true },
  decorators: [
    withQcAnomalyStore({
      thresholds: [THR_ACTIVE],
      anomalies:  [],
      summaries:  [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByTestId('qca-threshold-toggle');
    await userEvent.click(toggle);
    await expect(updateThresholdSpy).toHaveBeenCalledWith(
      THR_ACTIVE.id,
      { is_active: false },
      'ENTERPRISE',
    );
  },
};
