/**
 * src/culture-metrics/__tests__/employeeSentimentStore.test.ts
 *
 * MONOLITH v18.5 Sprint 14 — Employee Sentiment Timeline (EST) store tests
 *
 * Mock strategy: vi.hoisted capturing thenable Proxy, same convention as
 * cultureMetricsStore.test.ts — extended with `upsert` capture so
 * upsertTimelineConfig tests can inspect the payload and options.
 *
 * Coverage (~42 tests):
 *  Plan gate (describe.each × 3 gated actions)
 *    - FREE / STARTER  → sets error, does NOT call supabase.from
 *    - PROFESSIONAL / ENTERPRISE → resolves, no error
 *  fetchSummary
 *    - loading flag lifecycle, success mapping, empty data, DB error, table
 *  fetchTimelineConfigs
 *    - success mapping, empty data, DB error, table
 *  submitSentimentEntry  (PLAN-GATE EXEMPT)
 *    - no auth.getUser, inserts to est_sentiment_entries, correct fields,
 *      note undefined → null, note provided, loading lifecycle, DB error
 *  upsertTimelineConfig
 *    - upsert to correct table, data fields, onConflict option, updated_at ISO,
 *      re-fetches configs after success, skips re-fetch on error,
 *      omits undefined optional fields
 *  setFilters  — sync state update, replaces previous filters
 *  clearError  — resets to null, idempotent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE — hoisted so vi.mock factory can reference it
// ============================================================================

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  auth: { getUser: vi.fn() },
}));

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ============================================================================
// IMPORTS (after mock)
// ============================================================================

import { useEstStore } from '../employeeSentimentStore';
import type {
  EstSentimentSummaryRow,
  EstTimelineConfigRow,
} from '../employeeSentimentTypes';
import type { OrgPlan } from '../../tenant/types';

// ============================================================================
// CAPTURING PROXY — module-level state reset in beforeEach
// ============================================================================

let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
let lastInsertArgs:    unknown = null;
let lastUpsertData:    unknown = null;
let lastUpsertOptions: unknown = null;
let _lastFromTable:     string | null = null;

function makeCapturingProxy(): unknown {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?:  (e: unknown) => unknown,
        ) => Promise.resolve(mockResult).then(onFulfilled, onRejected);
      }
      if (prop === 'insert') {
        return (args: unknown) => {
          lastInsertArgs = args;
          return makeCapturingProxy();
        };
      }
      if (prop === 'upsert') {
        return (data: unknown, options?: unknown) => {
          lastUpsertData    = data;
          lastUpsertOptions = options ?? null;
          return makeCapturingProxy();
        };
      }
      // select, eq, order, etc. — all chain back to the proxy
      return (..._args: unknown[]) => makeCapturingProxy();
    },
  };
  return new Proxy({} as Record<string, unknown>, handler);
}

// ============================================================================
// FIXTURES
// ============================================================================

const ORG_ID = 'org-test-1';

const SUMMARY_ROW: EstSentimentSummaryRow = {
  org_id:         ORG_ID,
  dimension:      'MORALE',
  period_type:    'MONTHLY',
  period_label:   '2027-03',
  avg_score:      7.5,
  response_count: 12,
  is_inverted:    false,
  min_responses:  3,
  health_status:  'NORMAL',
};

const CONFIG_ROW: EstTimelineConfigRow = {
  id:            'cfg-morale',
  org_id:        ORG_ID,
  dimension:     'MORALE',
  is_active:     true,
  is_inverted:   false,
  min_responses: 3,
  period_type:   'MONTHLY',
  created_at:    '2027-01-01T00:00:00Z',
  updated_at:    '2027-01-15T00:00:00Z',
};

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  mockResult        = { data: null,  error: null };
  lastInsertArgs    = null;
  lastUpsertData    = null;
  lastUpsertOptions = null;
  _lastFromTable     = null;

  mockSupabase.from.mockImplementation((table: string) => {
    _lastFromTable = table;
    return makeCapturingProxy();
  });

  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'u1' } },
    error: null,
  });

  useEstStore.setState({
    summaries: [],
    configs:   [],
    filters:   {},
    loading:   false,
    error:     null,
  });
});

// ============================================================================
// PLAN GATE — describe.each × 3 gated actions
// ============================================================================

const PLAN_GATE_CASES = [
  {
    name:   'fetchSummary',
    action: (plan: OrgPlan) =>
      useEstStore.getState().fetchSummary(ORG_ID, plan),
  },
  {
    name:   'fetchTimelineConfigs',
    action: (plan: OrgPlan) =>
      useEstStore.getState().fetchTimelineConfigs(ORG_ID, plan),
  },
  {
    name:   'upsertTimelineConfig',
    action: (plan: OrgPlan) =>
      useEstStore
        .getState()
        .upsertTimelineConfig({ orgId: ORG_ID, dimension: 'MORALE' }, plan),
  },
] as const;

describe.each(PLAN_GATE_CASES)('plan gate — $name', ({ action }) => {
  it('sets error for FREE plan and does NOT call supabase.from', () => {
    action('FREE');
    expect(useEstStore.getState().error).toBe(
      'EST module requires PROFESSIONAL or ENTERPRISE plan',
    );
    expect(useEstStore.getState().loading).toBe(false);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('sets error for STARTER plan and does NOT call supabase.from', () => {
    action('STARTER');
    expect(useEstStore.getState().error).toBe(
      'EST module requires PROFESSIONAL or ENTERPRISE plan',
    );
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('resolves without error for PROFESSIONAL plan', async () => {
    mockResult = { data: [], error: null };
    await action('PROFESSIONAL');
    expect(useEstStore.getState().error).toBeNull();
    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it('resolves without error for ENTERPRISE plan', async () => {
    mockResult = { data: [], error: null };
    await action('ENTERPRISE');
    expect(useEstStore.getState().error).toBeNull();
    expect(mockSupabase.from).toHaveBeenCalled();
  });
});

// ============================================================================
// fetchSummary
// ============================================================================

describe('fetchSummary', () => {
  it('sets loading true while fetch is in flight', async () => {
    let capturedLoading = false;
    mockResult = { data: [SUMMARY_ROW], error: null };

    const unsub = useEstStore.subscribe((state) => {
      if (state.loading) capturedLoading = true;
    });
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');
    unsub();

    expect(capturedLoading).toBe(true);
  });

  it('resets loading to false after success', async () => {
    mockResult = { data: [SUMMARY_ROW], error: null };
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');
    expect(useEstStore.getState().loading).toBe(false);
  });

  it('maps summary row to camelCase correctly', async () => {
    mockResult = { data: [SUMMARY_ROW], error: null };
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');

    const { summaries } = useEstStore.getState();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      orgId:         ORG_ID,
      dimension:     'MORALE',
      periodType:    'MONTHLY',
      periodLabel:   '2027-03',
      avgScore:      7.5,
      responseCount: 12,
      isInverted:    false,
      minResponses:  3,
      healthStatus:  'NORMAL',
    });
  });

  it('sets summaries to empty array when data is empty', async () => {
    mockResult = { data: [], error: null };
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');
    expect(useEstStore.getState().summaries).toHaveLength(0);
  });

  it('sets error on DB failure', async () => {
    mockResult = { data: null, error: { message: 'connection refused' } };
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');
    expect(useEstStore.getState().error).toBe('connection refused');
    expect(useEstStore.getState().loading).toBe(false);
  });

  it('queries est_sentiment_summary_v table', async () => {
    mockResult = { data: [], error: null };
    await useEstStore.getState().fetchSummary(ORG_ID, 'ENTERPRISE');
    expect(mockSupabase.from).toHaveBeenCalledWith('est_sentiment_summary_v');
  });
});

// ============================================================================
// fetchTimelineConfigs
// ============================================================================

describe('fetchTimelineConfigs', () => {
  it('maps config row to camelCase correctly', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().fetchTimelineConfigs(ORG_ID, 'ENTERPRISE');

    const { configs } = useEstStore.getState();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      id:           'cfg-morale',
      orgId:        ORG_ID,
      dimension:    'MORALE',
      isActive:     true,
      isInverted:   false,
      minResponses: 3,
      periodType:   'MONTHLY',
    });
  });

  it('sets configs to empty array when data is empty', async () => {
    mockResult = { data: [], error: null };
    await useEstStore.getState().fetchTimelineConfigs(ORG_ID, 'ENTERPRISE');
    expect(useEstStore.getState().configs).toHaveLength(0);
  });

  it('sets error on DB failure', async () => {
    mockResult = { data: null, error: { message: 'timeout' } };
    await useEstStore.getState().fetchTimelineConfigs(ORG_ID, 'ENTERPRISE');
    expect(useEstStore.getState().error).toBe('timeout');
    expect(useEstStore.getState().loading).toBe(false);
  });

  it('queries est_timeline_configs table', async () => {
    mockResult = { data: [], error: null };
    await useEstStore.getState().fetchTimelineConfigs(ORG_ID, 'ENTERPRISE');
    expect(mockSupabase.from).toHaveBeenCalledWith('est_timeline_configs');
  });
});

// ============================================================================
// submitSentimentEntry — PLAN-GATE EXEMPT
// ============================================================================

describe('submitSentimentEntry', () => {
  it('does NOT call supabase.auth.getUser (anonymous / plan-gate exempt)', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       7,
      periodType:  'WEEKLY',
      periodLabel: '2027-W10',
    });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('inserts to est_sentiment_entries table', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'ENGAGEMENT',
      score:       8,
      periodType:  'MONTHLY',
      periodLabel: '2027-03',
    });
    expect(mockSupabase.from).toHaveBeenCalledWith('est_sentiment_entries');
  });

  it('insert args contain correct snake_case fields', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'STRESS',
      score:       4,
      periodType:  'QUARTERLY',
      periodLabel: '2027-Q1',
    });
    expect(lastInsertArgs).toMatchObject({
      org_id:       ORG_ID,
      dimension:    'STRESS',
      score:        4,
      period_type:  'QUARTERLY',
      period_label: '2027-Q1',
    });
  });

  it('coerces undefined note to null', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       5,
      periodType:  'WEEKLY',
      periodLabel: '2027-W01',
      // note intentionally omitted
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((lastInsertArgs as any).note).toBeNull();
  });

  it('passes note string through when provided', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       5,
      periodType:  'WEEKLY',
      periodLabel: '2027-W01',
      note:        'รู้สึกดีมาก',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((lastInsertArgs as any).note).toBe('รู้สึกดีมาก');
  });

  it('sets loading true while insert is in flight', async () => {
    let capturedLoading = false;
    mockResult = { data: null, error: null };

    const unsub = useEstStore.subscribe((state) => {
      if (state.loading) capturedLoading = true;
    });
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       5,
      periodType:  'WEEKLY',
      periodLabel: '2027-W01',
    });
    unsub();

    expect(capturedLoading).toBe(true);
  });

  it('resets loading to false after success', async () => {
    mockResult = { data: null, error: null };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       5,
      periodType:  'WEEKLY',
      periodLabel: '2027-W01',
    });
    expect(useEstStore.getState().loading).toBe(false);
  });

  it('sets error on DB failure', async () => {
    mockResult = { data: null, error: { message: 'insert failed' } };
    await useEstStore.getState().submitSentimentEntry({
      orgId:       ORG_ID,
      dimension:   'MORALE',
      score:       5,
      periodType:  'WEEKLY',
      periodLabel: '2027-W01',
    });
    expect(useEstStore.getState().error).toBe('insert failed');
    expect(useEstStore.getState().loading).toBe(false);
  });
});

// ============================================================================
// upsertTimelineConfig
// ============================================================================

describe('upsertTimelineConfig', () => {
  it('calls supabase.from with est_timeline_configs', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE', isActive: true },
      'ENTERPRISE',
    );
    expect(mockSupabase.from).toHaveBeenCalledWith('est_timeline_configs');
  });

  it('upsert data contains org_id, dimension, and mapped optional fields', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      {
        orgId:        ORG_ID,
        dimension:    'ENGAGEMENT',
        isActive:     false,
        periodType:   'MONTHLY',
        minResponses: 5,
      },
      'ENTERPRISE',
    );
    expect(lastUpsertData).toMatchObject({
      org_id:        ORG_ID,
      dimension:     'ENGAGEMENT',
      is_active:     false,
      period_type:   'MONTHLY',
      min_responses: 5,
    });
  });

  it('upsert options contain onConflict: org_id,dimension', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE' },
      'ENTERPRISE',
    );
    expect(lastUpsertOptions).toMatchObject({
      onConflict: 'org_id,dimension',
    });
  });

  it('upsert data contains updated_at as ISO datetime string', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE' },
      'ENTERPRISE',
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((lastUpsertData as any).updated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it('re-fetches timeline configs after successful upsert (from called twice)', async () => {
    // Both the upsert and the re-fetch resolve from the same mockResult
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE' },
      'ENTERPRISE',
    );
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    expect(useEstStore.getState().configs).toHaveLength(1);
    expect(useEstStore.getState().configs[0].dimension).toBe('MORALE');
  });

  it('sets error and does NOT re-fetch on upsert DB error', async () => {
    mockResult = { data: null, error: { message: 'upsert failed' } };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE' },
      'ENTERPRISE',
    );
    expect(useEstStore.getState().error).toBe('upsert failed');
    // Only one call — the failed upsert; re-fetch must not execute
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('omits undefined optional fields from upsert data', async () => {
    mockResult = { data: [CONFIG_ROW], error: null };
    await useEstStore.getState().upsertTimelineConfig(
      { orgId: ORG_ID, dimension: 'MORALE' /* no optional fields */ },
      'ENTERPRISE',
    );
    expect(lastUpsertData).not.toHaveProperty('is_active');
    expect(lastUpsertData).not.toHaveProperty('is_inverted');
    expect(lastUpsertData).not.toHaveProperty('min_responses');
    expect(lastUpsertData).not.toHaveProperty('period_type');
  });
});

// ============================================================================
// setFilters
// ============================================================================

describe('setFilters', () => {
  it('sets filters correctly', () => {
    useEstStore.getState().setFilters({ dimension: 'MORALE', periodType: 'MONTHLY' });
    expect(useEstStore.getState().filters).toEqual({
      dimension:  'MORALE',
      periodType: 'MONTHLY',
    });
  });

  it('replaces previous filters entirely (no merge)', () => {
    useEstStore.getState().setFilters({ dimension: 'MORALE' });
    useEstStore.getState().setFilters({ periodType: 'WEEKLY' });
    // dimension from the first call should be gone
    expect(useEstStore.getState().filters).toEqual({ periodType: 'WEEKLY' });
  });
});

// ============================================================================
// clearError
// ============================================================================

describe('clearError', () => {
  it('resets error to null', () => {
    useEstStore.setState({ error: 'some error' });
    useEstStore.getState().clearError();
    expect(useEstStore.getState().error).toBeNull();
  });

  it('is idempotent when error is already null', () => {
    useEstStore.getState().clearError();
    expect(useEstStore.getState().error).toBeNull();
  });
});
