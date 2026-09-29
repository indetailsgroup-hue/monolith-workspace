/**
 * qcAnomalyStore.test.ts
 * Vitest unit tests for useQcAnomalyStore (MONOLITH v18.0)
 *
 * Coverage:
 *  - ENTERPRISE plan gate on all 8 gated actions (24 reject + 8 pass = 32 tests)
 *  - fetchThresholds: success, error path, isLoading flag
 *  - createThreshold: prepend to state, error path
 *  - updateThreshold: updates in-place by id, error path
 *  - deleteThreshold: removes by id, error path
 *  - fetchAnomalies: parallel sets anomalies+summaries, anomaly error, summary error, isLoading
 *  - acknowledgeAnomaly: optimistic ACKNOWLEDGED, rollback to OPEN + error
 *  - resolveAnomaly: optimistic RESOLVED, rollback to OPEN + error
 *  - submitMeasurement: isMeasurementLoading (renderHook), prepend+slice 50, re-fetch visible, error path
 *  - UI helpers: selectAnomaly(id), selectAnomaly(null), setFilters merge, clearError
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQcAnomalyStore } from '../qcAnomalyStore';
import {
  DEFAULT_QCA_FILTERS,
  QcAnomalyPlanGateError,
  type QcaThresholdConfigRow,
  type QcaAnomalyEventRow,
  type QcaAnomalySummaryRow,
  type QcaMeasurementRow,
  type CreateQcaThresholdPayload,
  type SubmitQcaMeasurementPayload,
} from '../qcAnomalyTypes';
import type { OrgPlan } from '../../tenant/types';

// ─── Supabase mock ─────────────────────────────────────────────────────────────

const { setResult, resetMock, mockSupabase } = vi.hoisted(() => {
  type ChainResult = { data: unknown; error: unknown };
  const tableResults: Record<string, ChainResult> = {};

  function setResult(
    table: string,
    op: string,
    data: unknown,
    error: unknown = null,
  ) {
    tableResults[`${table}:${op}`] = { data, error };
  }

  function resetMock() {
    for (const key of Object.keys(tableResults)) delete tableResults[key];
  }

  function makeChain(table: string) {
    let currentOp = 'select';
    let hasWriteOp = false;

    function getResult(): ChainResult {
      return tableResults[`${table}:${currentOp}`] ?? { data: null, error: null };
    }

    const singleProxy = {
      then(
        onFulfilled: (r: ChainResult) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(getResult()).then(onFulfilled, onRejected);
      },
    };

    const chainHandler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (
            onFulfilled: (r: ChainResult) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve(getResult()).then(onFulfilled, onRejected);
        }
        if (prop === 'single') return () => singleProxy;
        if (prop === 'insert') {
          return (_data: unknown) => {
            currentOp = 'insert';
            hasWriteOp = true;
            return chain;
          };
        }
        if (prop === 'update') {
          return (_data: unknown) => {
            currentOp = 'update';
            hasWriteOp = true;
            return chain;
          };
        }
        if (prop === 'delete') {
          return () => {
            currentOp = 'delete';
            hasWriteOp = true;
            return chain;
          };
        }
        if (prop === 'select') {
          return (_cols?: string) => {
            if (!hasWriteOp) currentOp = 'select';
            return chain;
          };
        }
        // eq, order, filter, lt, gte, neq, not, is, in, or, etc.
        return () => chain;
      },
    };

    const chain = new Proxy({} as Record<string, unknown>, chainHandler);
    return chain;
  }

  const mockSupabase = {
    from: (table: string) => makeChain(table),
  };

  return { setResult, resetMock, mockSupabase };
});

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ─── Factory functions ─────────────────────────────────────────────────────────

function makeThresholdRow(overrides: Partial<QcaThresholdConfigRow> = {}): QcaThresholdConfigRow {
  return {
    id:                 'thresh-1',
    org_id:             'org-1',
    metric_key:         'DEFECT_RATE',
    threshold_type:     'MAX',
    min_value:          null,
    max_value:          5.0,
    zscore_threshold:   null,
    is_active:          true,
    description:        null,
    created_by:         'user-1',
    created_at:         '2027-02-10T00:00:00Z',
    updated_at:         '2027-02-10T00:00:00Z',
    ...overrides,
  };
}

function makeAnomalyRow(overrides: Partial<QcaAnomalyEventRow> = {}): QcaAnomalyEventRow {
  return {
    id:                     'anomaly-1',
    org_id:                 'org-1',
    metric_key:             'DEFECT_RATE',
    measurement_id:         'meas-1',
    threshold_id:           'thresh-1',
    severity:               'HIGH',
    status:                 'OPEN',
    measured_value:         7.5,
    threshold_breach_detail: { threshold_value: 5.0 },
    acknowledged_by:        null,
    acknowledged_at:        null,
    resolved_by:            null,
    resolved_at:            null,
    notes:                  null,
    created_at:             '2027-02-10T00:00:00Z',
    updated_at:             '2027-02-10T00:00:00Z',
    ...overrides,
  };
}

function makeSummaryRow(overrides: Partial<QcaAnomalySummaryRow> = {}): QcaAnomalySummaryRow {
  return {
    org_id:               'org-1',
    metric_key:           'DEFECT_RATE',
    open_count:           2,
    acknowledged_count:   1,
    resolved_count:       0,
    last_open_anomaly_at: '2027-02-10T00:00:00Z',
    last_anomaly_at:      '2027-02-10T00:00:00Z',
    ...overrides,
  };
}

function makeMeasurementRow(overrides: Partial<QcaMeasurementRow> = {}): QcaMeasurementRow {
  return {
    id:          'meas-1',
    org_id:      'org-1',
    metric_key:  'DEFECT_RATE',
    value:       3.5,
    measured_at: '2027-02-10T00:00:00Z',
    source:      null,
    notes:       null,
    created_by:  'user-1',
    created_at:  '2027-02-10T00:00:00Z',
    ...overrides,
  };
}

function makeThresholdPayload(): CreateQcaThresholdPayload {
  return {
    org_id:         'org-1',
    metric_key:     'DEFECT_RATE',
    threshold_type: 'MAX',
    max_value:      5.0,
    is_active:      true,
  };
}

function makeMeasurementPayload(): SubmitQcaMeasurementPayload {
  return {
    org_id:     'org-1',
    metric_key: 'DEFECT_RATE',
    value:      5,
  };
}

// ─── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  thresholds:           [] as QcaThresholdConfigRow[],
  anomalies:            [] as QcaAnomalyEventRow[],
  summaries:            [] as QcaAnomalySummaryRow[],
  recentMeasurements:   [] as QcaMeasurementRow[],
  selectedAnomalyId:    null as string | null,
  isLoading:            false,
  isMeasurementLoading: false,
  filters:              DEFAULT_QCA_FILTERS,
  error:                null as string | null,
};

// ─── Actions array for plan gate tests ─────────────────────────────────────────

const ACTIONS: Array<{ name: string; call: (plan: OrgPlan) => Promise<void> }> = [
  {
    name: 'fetchThresholds',
    call: (plan) => useQcAnomalyStore.getState().fetchThresholds('org-1', plan),
  },
  {
    name: 'createThreshold',
    call: (plan) => useQcAnomalyStore.getState().createThreshold(makeThresholdPayload(), plan),
  },
  {
    name: 'updateThreshold',
    call: (plan) => useQcAnomalyStore.getState().updateThreshold('thresh-1', { is_active: false }, plan),
  },
  {
    name: 'deleteThreshold',
    call: (plan) => useQcAnomalyStore.getState().deleteThreshold('thresh-1', plan),
  },
  {
    name: 'fetchAnomalies',
    call: (plan) => useQcAnomalyStore.getState().fetchAnomalies('org-1', plan),
  },
  {
    name: 'acknowledgeAnomaly',
    call: (plan) => useQcAnomalyStore.getState().acknowledgeAnomaly('anomaly-1', plan),
  },
  {
    name: 'resolveAnomaly',
    call: (plan) => useQcAnomalyStore.getState().resolveAnomaly('anomaly-1', plan),
  },
  {
    name: 'submitMeasurement',
    call: (plan) =>
      useQcAnomalyStore.getState().submitMeasurement(makeMeasurementPayload(), plan),
  },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useQcAnomalyStore', () => {
  beforeEach(() => {
    resetMock();
    useQcAnomalyStore.setState(INITIAL_STATE);

    // Default success seeds for all tables
    setResult('qca_threshold_configs', 'select', []);
    setResult('qca_threshold_configs', 'insert', makeThresholdRow());
    setResult('qca_threshold_configs', 'update', makeThresholdRow());
    setResult('qca_threshold_configs', 'delete', null);
    setResult('qca_anomaly_events',    'select', []);
    setResult('qca_anomaly_events',    'update', null);
    setResult('qca_anomaly_summary_v', 'select', []);
    setResult('qca_measurements',      'insert', makeMeasurementRow());
  });

  // ── Plan gate: 24 reject tests + 8 ENTERPRISE pass tests ──────────────────

  describe.each(ACTIONS)('$name plan gate', ({ call }) => {
    it.each<OrgPlan>(['FREE', 'STARTER', 'PROFESSIONAL'])(
      'rejects with QcAnomalyPlanGateError for %s plan',
      async (plan) => {
        await expect(call(plan)).rejects.toBeInstanceOf(QcAnomalyPlanGateError);
      },
    );

    it('resolves without throwing for ENTERPRISE plan', async () => {
      await expect(call('ENTERPRISE')).resolves.not.toThrow();
    });
  });

  // ── fetchThresholds ──────────────────────────────────────────────────────

  describe('fetchThresholds', () => {
    it('sets thresholds on success', async () => {
      const rows = [makeThresholdRow({ id: 't-1' }), makeThresholdRow({ id: 't-2' })];
      setResult('qca_threshold_configs', 'select', rows);

      await act(async () => {
        await useQcAnomalyStore.getState().fetchThresholds('org-1', 'ENTERPRISE');
      });

      const { thresholds, isLoading, error } = useQcAnomalyStore.getState();
      expect(thresholds).toHaveLength(2);
      expect(thresholds[0].id).toBe('t-1');
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('sets error state on fetch failure', async () => {
      setResult('qca_threshold_configs', 'select', null, { message: 'fetch failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().fetchThresholds('org-1', 'ENTERPRISE');
      });

      const { thresholds, isLoading, error } = useQcAnomalyStore.getState();
      expect(error).toBe('fetch failed');
      expect(isLoading).toBe(false);
      expect(thresholds).toHaveLength(0); // unchanged
    });

    it('sets isLoading true during fetch then clears to false', async () => {
      const loadingValues: boolean[] = [];
      const unsub = useQcAnomalyStore.subscribe((s) => {
        loadingValues.push(s.isLoading);
      });

      await act(async () => {
        await useQcAnomalyStore.getState().fetchThresholds('org-1', 'ENTERPRISE');
      });

      unsub();
      expect(loadingValues).toContain(true);
      expect(loadingValues[loadingValues.length - 1]).toBe(false);
    });
  });

  // ── createThreshold ──────────────────────────────────────────────────────

  describe('createThreshold', () => {
    it('prepends the created threshold to state', async () => {
      const existing = makeThresholdRow({ id: 'old-thresh' });
      useQcAnomalyStore.setState({ thresholds: [existing] });

      const newRow = makeThresholdRow({ id: 'new-thresh' });
      setResult('qca_threshold_configs', 'insert', newRow);

      await act(async () => {
        await useQcAnomalyStore.getState().createThreshold(makeThresholdPayload(), 'ENTERPRISE');
      });

      const { thresholds } = useQcAnomalyStore.getState();
      expect(thresholds).toHaveLength(2);
      expect(thresholds[0].id).toBe('new-thresh'); // prepended
      expect(thresholds[1].id).toBe('old-thresh');
    });

    it('sets error state on insert failure', async () => {
      setResult('qca_threshold_configs', 'insert', null, { message: 'insert failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().createThreshold(makeThresholdPayload(), 'ENTERPRISE');
      });

      const { error, thresholds, isLoading } = useQcAnomalyStore.getState();
      expect(error).toBe('insert failed');
      expect(isLoading).toBe(false);
      expect(thresholds).toHaveLength(0); // unchanged
    });
  });

  // ── updateThreshold ──────────────────────────────────────────────────────

  describe('updateThreshold', () => {
    it('updates threshold in-place by id', async () => {
      const original = makeThresholdRow({ id: 'thresh-1', is_active: true });
      const other    = makeThresholdRow({ id: 'thresh-2', is_active: true });
      useQcAnomalyStore.setState({ thresholds: [original, other] });

      const updated = makeThresholdRow({ id: 'thresh-1', is_active: false });
      setResult('qca_threshold_configs', 'update', updated);

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .updateThreshold('thresh-1', { is_active: false }, 'ENTERPRISE');
      });

      const { thresholds } = useQcAnomalyStore.getState();
      expect(thresholds).toHaveLength(2);
      expect(thresholds.find((t) => t.id === 'thresh-1')?.is_active).toBe(false);
      expect(thresholds.find((t) => t.id === 'thresh-2')?.is_active).toBe(true); // unchanged
    });

    it('sets error on update failure and leaves state unchanged', async () => {
      const original = makeThresholdRow({ id: 'thresh-1', is_active: true });
      useQcAnomalyStore.setState({ thresholds: [original] });
      setResult('qca_threshold_configs', 'update', null, { message: 'update failed' });

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .updateThreshold('thresh-1', { is_active: false }, 'ENTERPRISE');
      });

      const { error, thresholds } = useQcAnomalyStore.getState();
      expect(error).toBe('update failed');
      expect(thresholds[0].is_active).toBe(true); // not modified
    });
  });

  // ── deleteThreshold ──────────────────────────────────────────────────────

  describe('deleteThreshold', () => {
    it('removes the threshold from state by id', async () => {
      const t1 = makeThresholdRow({ id: 'thresh-1' });
      const t2 = makeThresholdRow({ id: 'thresh-2' });
      useQcAnomalyStore.setState({ thresholds: [t1, t2] });
      setResult('qca_threshold_configs', 'delete', null);

      await act(async () => {
        await useQcAnomalyStore.getState().deleteThreshold('thresh-1', 'ENTERPRISE');
      });

      const { thresholds } = useQcAnomalyStore.getState();
      expect(thresholds).toHaveLength(1);
      expect(thresholds[0].id).toBe('thresh-2');
    });

    it('sets error on delete failure and leaves state unchanged', async () => {
      const t1 = makeThresholdRow({ id: 'thresh-1' });
      useQcAnomalyStore.setState({ thresholds: [t1] });
      setResult('qca_threshold_configs', 'delete', null, { message: 'delete failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().deleteThreshold('thresh-1', 'ENTERPRISE');
      });

      const { error, thresholds } = useQcAnomalyStore.getState();
      expect(error).toBe('delete failed');
      expect(thresholds).toHaveLength(1); // unchanged
    });
  });

  // ── fetchAnomalies ───────────────────────────────────────────────────────

  describe('fetchAnomalies', () => {
    it('sets anomalies and summaries from parallel fetch', async () => {
      const anomaly = makeAnomalyRow({ id: 'a-1' });
      const summary = makeSummaryRow({ open_count: 1 });
      setResult('qca_anomaly_events',    'select', [anomaly]);
      setResult('qca_anomaly_summary_v', 'select', [summary]);

      await act(async () => {
        await useQcAnomalyStore.getState().fetchAnomalies('org-1', 'ENTERPRISE');
      });

      const { anomalies, summaries, isLoading, error } = useQcAnomalyStore.getState();
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].id).toBe('a-1');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].open_count).toBe(1);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('uses anomaly error when qca_anomaly_events query fails', async () => {
      setResult('qca_anomaly_events',    'select', null, { message: 'events query failed' });
      setResult('qca_anomaly_summary_v', 'select', []);

      await act(async () => {
        await useQcAnomalyStore.getState().fetchAnomalies('org-1', 'ENTERPRISE');
      });

      const { error, isLoading } = useQcAnomalyStore.getState();
      expect(error).toBe('events query failed');
      expect(isLoading).toBe(false);
    });

    it('uses summary error when qca_anomaly_summary_v query fails', async () => {
      setResult('qca_anomaly_events',    'select', []);
      setResult('qca_anomaly_summary_v', 'select', null, { message: 'summary query failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().fetchAnomalies('org-1', 'ENTERPRISE');
      });

      const { error, isLoading } = useQcAnomalyStore.getState();
      expect(error).toBe('summary query failed');
      expect(isLoading).toBe(false);
    });

    it('clears isLoading after successful parallel fetch', async () => {
      const loadingValues: boolean[] = [];
      const unsub = useQcAnomalyStore.subscribe((s) => {
        loadingValues.push(s.isLoading);
      });

      await act(async () => {
        await useQcAnomalyStore.getState().fetchAnomalies('org-1', 'ENTERPRISE');
      });

      unsub();
      expect(loadingValues).toContain(true);
      expect(loadingValues[loadingValues.length - 1]).toBe(false);
    });
  });

  // ── acknowledgeAnomaly ───────────────────────────────────────────────────

  describe('acknowledgeAnomaly', () => {
    it('sets anomaly status to ACKNOWLEDGED on success', async () => {
      const anomaly = makeAnomalyRow({ id: 'a-1', status: 'OPEN' });
      useQcAnomalyStore.setState({ anomalies: [anomaly] });
      setResult('qca_anomaly_events', 'update', null);

      await act(async () => {
        await useQcAnomalyStore.getState().acknowledgeAnomaly('a-1', 'ENTERPRISE');
      });

      const { anomalies, error } = useQcAnomalyStore.getState();
      expect(anomalies[0].status).toBe('ACKNOWLEDGED');
      expect(error).toBeNull();
    });

    it('rolls back to OPEN and sets error on update failure', async () => {
      const anomaly = makeAnomalyRow({ id: 'a-1', status: 'OPEN' });
      useQcAnomalyStore.setState({ anomalies: [anomaly] });
      setResult('qca_anomaly_events', 'update', null, { message: 'acknowledge failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().acknowledgeAnomaly('a-1', 'ENTERPRISE');
      });

      const { anomalies, error } = useQcAnomalyStore.getState();
      expect(anomalies[0].status).toBe('OPEN'); // rolled back
      expect(error).toBe('acknowledge failed');
    });
  });

  // ── resolveAnomaly ───────────────────────────────────────────────────────

  describe('resolveAnomaly', () => {
    it('sets anomaly status to RESOLVED on success', async () => {
      const anomaly = makeAnomalyRow({ id: 'a-1', status: 'OPEN' });
      useQcAnomalyStore.setState({ anomalies: [anomaly] });
      setResult('qca_anomaly_events', 'update', null);

      await act(async () => {
        await useQcAnomalyStore.getState().resolveAnomaly('a-1', 'ENTERPRISE');
      });

      const { anomalies, error } = useQcAnomalyStore.getState();
      expect(anomalies[0].status).toBe('RESOLVED');
      expect(error).toBeNull();
    });

    it('rolls back to OPEN and sets error on update failure', async () => {
      const anomaly = makeAnomalyRow({ id: 'a-1', status: 'OPEN' });
      useQcAnomalyStore.setState({ anomalies: [anomaly] });
      setResult('qca_anomaly_events', 'update', null, { message: 'resolve failed' });

      await act(async () => {
        await useQcAnomalyStore.getState().resolveAnomaly('a-1', 'ENTERPRISE');
      });

      const { anomalies, error } = useQcAnomalyStore.getState();
      expect(anomalies[0].status).toBe('OPEN'); // rolled back
      expect(error).toBe('resolve failed');
    });
  });

  // ── submitMeasurement ────────────────────────────────────────────────────

  describe('submitMeasurement', () => {
    it('captures isMeasurementLoading true then false via renderHook re-renders', async () => {
      const loadingValues: boolean[] = [];

      const unsub = useQcAnomalyStore.subscribe((s) => {
        loadingValues.push(s.isMeasurementLoading);
      });

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .submitMeasurement(makeMeasurementPayload(), 'ENTERPRISE');
      });

      unsub();

      expect(loadingValues).toContain(true);
      expect(loadingValues[loadingValues.length - 1]).toBe(false);
    });

    it('prepends new measurement and slices recentMeasurements to 50', async () => {
      const existing = Array.from({ length: 50 }, (_, i) =>
        makeMeasurementRow({ id: `m-old-${i}` }),
      );
      useQcAnomalyStore.setState({ recentMeasurements: existing });

      const newRow = makeMeasurementRow({ id: 'm-new' });
      setResult('qca_measurements', 'insert', newRow);

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .submitMeasurement(makeMeasurementPayload(), 'ENTERPRISE');
      });

      const { recentMeasurements } = useQcAnomalyStore.getState();
      expect(recentMeasurements).toHaveLength(50); // sliced back to 50
      expect(recentMeasurements[0].id).toBe('m-new'); // new item prepended
      expect(recentMeasurements[49].id).toBe('m-old-48'); // oldest dropped
    });

    it('re-fetches anomalies after insert so new events are visible in state', async () => {
      const autoDetected = makeAnomalyRow({ id: 'auto-anomaly', status: 'OPEN' });
      setResult('qca_anomaly_events',    'select', [autoDetected]);
      setResult('qca_anomaly_summary_v', 'select', [makeSummaryRow({ open_count: 1 })]);

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .submitMeasurement(makeMeasurementPayload(), 'ENTERPRISE');
      });

      const { anomalies } = useQcAnomalyStore.getState();
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].id).toBe('auto-anomaly');
    });

    it('sets error and clears isMeasurementLoading on insert failure', async () => {
      setResult('qca_measurements', 'insert', null, { message: 'measurement insert failed' });

      await act(async () => {
        await useQcAnomalyStore
          .getState()
          .submitMeasurement(makeMeasurementPayload(), 'ENTERPRISE');
      });

      const { error, isMeasurementLoading } = useQcAnomalyStore.getState();
      expect(error).toBe('measurement insert failed');
      expect(isMeasurementLoading).toBe(false);
    });
  });

  // ── UI helpers ───────────────────────────────────────────────────────────

  describe('UI helpers', () => {
    it('selectAnomaly sets selectedAnomalyId to the given id', () => {
      useQcAnomalyStore.getState().selectAnomaly('a-42');
      expect(useQcAnomalyStore.getState().selectedAnomalyId).toBe('a-42');
    });

    it('selectAnomaly(null) clears selectedAnomalyId', () => {
      useQcAnomalyStore.setState({ selectedAnomalyId: 'a-42' });
      useQcAnomalyStore.getState().selectAnomaly(null);
      expect(useQcAnomalyStore.getState().selectedAnomalyId).toBeNull();
    });

    it('setFilters merges partial filter without overwriting other fields', () => {
      useQcAnomalyStore.getState().setFilters({ severity: 'HIGH' });

      const { filters } = useQcAnomalyStore.getState();
      expect(filters.severity).toBe('HIGH');
      expect(filters.metricKey).toBe(DEFAULT_QCA_FILTERS.metricKey); // unchanged
      expect(filters.status).toBe(DEFAULT_QCA_FILTERS.status);       // unchanged
    });

    it('clearError resets error to null', () => {
      useQcAnomalyStore.setState({ error: 'some error' });
      useQcAnomalyStore.getState().clearError();
      expect(useQcAnomalyStore.getState().error).toBeNull();
    });
  });
});
