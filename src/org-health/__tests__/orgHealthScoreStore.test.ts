// src/org-health/__tests__/orgHealthScoreStore.test.ts
// MONOLITH v18.5 — Vitest unit tests for orgHealthScoreStore

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// vi.hoisted mock — must be defined before vi.mock()
// ─────────────────────────────────────────────────────────────────────────────

type MockResult = { data: unknown; error: unknown };

const {
  mockSupabase,
  setResult,
  setRpcResult,
  resetMock,
} = vi.hoisted(() => {
  const results = new Map<string, MockResult>();
  let rpcResult: MockResult = { data: null, error: null };

  function setResult(
    table: string,
    op: string,
    data: unknown,
    error: unknown = null,
  ) {
    results.set(`${table}:${op}`, { data, error });
  }

  function setRpcResult(data: unknown, error: unknown = null) {
    rpcResult = { data, error };
  }

  function resetMock() {
    results.clear();
    rpcResult = { data: null, error: null };
  }

  // Chain object — each call to from() creates an independent chain so that
  // upsertScoringConfig (which calls from() twice) resolves the correct result
  // for each terminal operation (upsert vs. select).
  function makeChain(table: string) {
    let terminalOp = 'select';

    const c: Record<string, unknown> = {
      select: () => {
        terminalOp = 'select';
        return c;
      },
      eq:    () => c,
      gte:   () => c,
      lte:   () => c,
      order: () => c,
      update: (_v: unknown) => {
        terminalOp = 'update';
        return c;
      },
      upsert: (_v: unknown, _o?: unknown) => {
        terminalOp = 'upsert';
        return c;
      },
      maybeSingle: () =>
        Promise.resolve(
          results.get(`${table}:select`) ?? { data: null, error: null },
        ),
      single: () =>
        Promise.resolve(
          results.get(`${table}:select`) ?? { data: null, error: null },
        ),
      then: <T>(
        resolve: (v: MockResult) => T,
        reject?: (e: unknown) => T,
      ): Promise<T> => {
        const result =
          results.get(`${table}:${terminalOp}`) ?? { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return c;
  }

  const mockSupabase = {
    from: (table: string) => makeChain(table),
    rpc:  (_fn: string, _args: unknown) => Promise.resolve(rpcResult),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'user-test' } }, error: null }),
    },
  };

  return { mockSupabase, setResult, setRpcResult, resetMock };
});

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mock registration)
// ─────────────────────────────────────────────────────────────────────────────

import { useOrgHealthScoreStore } from '../orgHealthScoreStore';
import type { OrgPlan } from '../../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const ENTERPRISE: OrgPlan        = 'ENTERPRISE';
const NON_ENTERPRISE: OrgPlan[]  = ['FREE', 'STARTER', 'PROFESSIONAL'];
const ORG_ID                     = 'org-test-001';

function getStore() {
  return useOrgHealthScoreStore.getState();
}

function makeDimScoreRow(dim: string) {
  return {
    id:                    `ds-${dim}`,
    snapshot_id:           'snap-1',
    org_id:                ORG_ID,
    dimension:             dim,
    raw_score:             80,
    weight:                0.2,
    weighted_contribution: 16,
    detail:                null,
  };
}

const MOCK_CURRENT_SCORE_ROW = {
  id:              'snap-1',
  org_id:          ORG_ID,
  snapshot_date:   '2027-07-01',
  composite_score: 80,
  grade:           'B' as const,
  computed_by:     'system',
  computed_at:     '2027-07-01T10:00:00Z',
  notes:           null,
  snapshot_id:     'snap-1',
  dimensions: [
    makeDimScoreRow('SAFETY'),
    makeDimScoreRow('SATISFACTION'),
    makeDimScoreRow('PERFORMANCE'),
    makeDimScoreRow('PROCESS'),
    makeDimScoreRow('CULTURE'),
  ],
};

const MOCK_SNAPSHOT_ROW = {
  id:              'snap-2',
  org_id:          ORG_ID,
  snapshot_date:   '2027-06-01',
  composite_score: 72,
  grade:           'C' as const,
  computed_by:     'system',
  computed_at:     '2027-06-01T10:00:00Z',
  notes:           null,
};

const MOCK_CONFIG_ROW = {
  id:          'cfg-1',
  org_id:      ORG_ID,
  dimension:   'SAFETY' as const,
  weight:      0.2,
  description: null,
  created_by:  'user-test',
  created_at:  '2027-01-01T00:00:00Z',
  updated_at:  '2027-01-01T00:00:00Z',
};

const MOCK_CONFIG_APP = {
  ...MOCK_CONFIG_ROW,
  createdAt: MOCK_CONFIG_ROW.created_at,
  updatedAt: MOCK_CONFIG_ROW.updated_at,
};

// ─────────────────────────────────────────────────────────────────────────────
// Reset state before every test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMock();
  useOrgHealthScoreStore.setState({
    currentScore:       null,
    history:            [],
    dimensionScores:    [],
    scoringConfig:      [],
    selectedSnapshotId: null,
    isLoading:          false,
    isComputing:        false,
    isConfigLoading:    false,
    error:              null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan gate — all 6 actions reject for non-ENTERPRISE plans
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_GATE_ACTIONS: Array<{
  name:   string;
  invoke: (plan: OrgPlan) => Promise<unknown>;
}> = [
  {
    name:   'fetchLatestScore',
    invoke: (p) => getStore().fetchLatestScore(ORG_ID, p),
  },
  {
    name:   'fetchHistory',
    invoke: (p) => getStore().fetchHistory(ORG_ID, p),
  },
  {
    name:   'computeScore',
    invoke: (p) => getStore().computeScore(ORG_ID, '2027-07-01', p),
  },
  {
    name:   'fetchScoringConfig',
    invoke: (p) => getStore().fetchScoringConfig(ORG_ID, p),
  },
  {
    name:   'updateScoringConfig',
    invoke: (p) => getStore().updateScoringConfig('cfg-1', 0.25, undefined, p),
  },
  {
    name:   'upsertScoringConfig',
    invoke: (p) => getStore().upsertScoringConfig(ORG_ID, { SAFETY: 0.3 }, p),
  },
];

describe.each(PLAN_GATE_ACTIONS)('plan gate — $name', ({ invoke }) => {
  it.each(NON_ENTERPRISE)('rejects for plan %s', async (plan) => {
    await expect(invoke(plan)).rejects.toMatchObject({
      name: 'OrgHealthScorePlanGateError',
    });
  });

  it('passes for ENTERPRISE (no OrgHealthScorePlanGateError)', async () => {
    // Provide enough mock data for every action to complete without DB errors
    setResult('ohs_current_score_v',  'select', MOCK_CURRENT_SCORE_ROW);
    setResult('ohs_health_snapshots', 'select', [MOCK_SNAPSHOT_ROW]);
    setResult('ohs_scoring_configs',  'select', [MOCK_CONFIG_ROW]);
    setResult('ohs_scoring_configs',  'update', null);
    setResult('ohs_scoring_configs',  'upsert', null);
    setRpcResult(80);

    await expect(invoke(ENTERPRISE)).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchLatestScore
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchLatestScore', () => {
  it('sets currentScore and dimensionScores (5 dims) on success', async () => {
    setResult('ohs_current_score_v', 'select', MOCK_CURRENT_SCORE_ROW);

    await act(async () => {
      await getStore().fetchLatestScore(ORG_ID, ENTERPRISE);
    });

    const { currentScore, dimensionScores } = getStore();
    expect(currentScore).not.toBeNull();
    expect(currentScore!.composite_score).toBe(80);
    expect(currentScore!.grade).toBe('B');
    expect(Object.keys(currentScore!.dimensionMap)).toHaveLength(5);
    expect(dimensionScores).toHaveLength(5);
  });

  it('sets currentScore to null when DB returns null (no snapshot yet)', async () => {
    setResult('ohs_current_score_v', 'select', null);

    await act(async () => {
      await getStore().fetchLatestScore(ORG_ID, ENTERPRISE);
    });

    expect(getStore().currentScore).toBeNull();
    expect(getStore().dimensionScores).toHaveLength(0);
  });

  it('sets error and rethrows on DB error', async () => {
    setResult('ohs_current_score_v', 'select', null, { message: 'DB read failed' });

    await expect(
      getStore().fetchLatestScore(ORG_ID, ENTERPRISE),
    ).rejects.toMatchObject({ message: 'DB read failed' });
    expect(getStore().error).toBe('DB read failed');
  });

  it('tracks isLoading: true then false', async () => {
    setResult('ohs_current_score_v', 'select', MOCK_CURRENT_SCORE_ROW);

    const states: boolean[] = [];
    const unsub = useOrgHealthScoreStore.subscribe((s) =>
      states.push(s.isLoading),
    );

    await act(async () => {
      await getStore().fetchLatestScore(ORG_ID, ENTERPRISE);
    });

    unsub();
    expect(states).toContain(true);
    expect(getStore().isLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchHistory', () => {
  it('sets history array on success', async () => {
    setResult('ohs_health_snapshots', 'select', [MOCK_SNAPSHOT_ROW, MOCK_SNAPSHOT_ROW]);

    await act(async () => {
      await getStore().fetchHistory(ORG_ID, ENTERPRISE);
    });

    expect(getStore().history).toHaveLength(2);
    expect(getStore().history[0].composite_score).toBe(72);
  });

  it('resolves with fromDate and toDate filter params', async () => {
    setResult('ohs_health_snapshots', 'select', [MOCK_SNAPSHOT_ROW]);

    await act(async () => {
      await getStore().fetchHistory(ORG_ID, ENTERPRISE, '2027-01-01', '2027-06-30');
    });

    expect(getStore().history).toHaveLength(1);
  });

  it('sets error and rethrows on DB error', async () => {
    setResult('ohs_health_snapshots', 'select', null, { message: 'history fail' });

    await expect(
      getStore().fetchHistory(ORG_ID, ENTERPRISE),
    ).rejects.toMatchObject({ message: 'history fail' });
    expect(getStore().error).toBe('history fail');
  });

  it('tracks isLoading: true then false', async () => {
    setResult('ohs_health_snapshots', 'select', []);

    const states: boolean[] = [];
    const unsub = useOrgHealthScoreStore.subscribe((s) =>
      states.push(s.isLoading),
    );

    await act(async () => {
      await getStore().fetchHistory(ORG_ID, ENTERPRISE);
    });

    unsub();
    expect(states).toContain(true);
    expect(getStore().isLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeScore', () => {
  it('calls RPC and returns the composite score', async () => {
    setRpcResult(77.5);
    setResult('ohs_current_score_v', 'select', MOCK_CURRENT_SCORE_ROW);

    let result: number | undefined;
    await act(async () => {
      result = await getStore().computeScore(ORG_ID, '2027-07-01', ENTERPRISE);
    });

    expect(result).toBe(77.5);
  });

  it('re-fetches latest score after RPC completes', async () => {
    setRpcResult(80);
    setResult('ohs_current_score_v', 'select', MOCK_CURRENT_SCORE_ROW);

    await act(async () => {
      await getStore().computeScore(ORG_ID, '2027-07-01', ENTERPRISE);
    });

    expect(getStore().currentScore).not.toBeNull();
    expect(getStore().currentScore!.composite_score).toBe(80);
  });

  it('sets error and rethrows on RPC error', async () => {
    setRpcResult(null, { message: 'rpc compute failed' });

    await expect(
      getStore().computeScore(ORG_ID, '2027-07-01', ENTERPRISE),
    ).rejects.toMatchObject({ message: 'rpc compute failed' });
    expect(getStore().error).toBe('rpc compute failed');
  });

  it('tracks isComputing: true then false', async () => {
    setRpcResult(80);
    setResult('ohs_current_score_v', 'select', MOCK_CURRENT_SCORE_ROW);

    const states: boolean[] = [];
    const unsub = useOrgHealthScoreStore.subscribe((s) =>
      states.push(s.isComputing),
    );

    await act(async () => {
      await getStore().computeScore(ORG_ID, '2027-07-01', ENTERPRISE);
    });

    unsub();
    expect(states).toContain(true);
    expect(getStore().isComputing).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchScoringConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchScoringConfig', () => {
  it('sets scoringConfig on success', async () => {
    setResult('ohs_scoring_configs', 'select', [MOCK_CONFIG_ROW]);

    await act(async () => {
      await getStore().fetchScoringConfig(ORG_ID, ENTERPRISE);
    });

    expect(getStore().scoringConfig).toHaveLength(1);
    expect(getStore().scoringConfig[0].dimension).toBe('SAFETY');
    expect(getStore().scoringConfig[0].weight).toBe(0.2);
  });

  it('sets empty array when no configs exist', async () => {
    setResult('ohs_scoring_configs', 'select', []);

    await act(async () => {
      await getStore().fetchScoringConfig(ORG_ID, ENTERPRISE);
    });

    expect(getStore().scoringConfig).toHaveLength(0);
  });

  it('sets error and rethrows on DB error', async () => {
    setResult('ohs_scoring_configs', 'select', null, { message: 'config read failed' });

    await expect(
      getStore().fetchScoringConfig(ORG_ID, ENTERPRISE),
    ).rejects.toMatchObject({ message: 'config read failed' });
    expect(getStore().error).toBe('config read failed');
  });

  it('tracks isConfigLoading: true then false', async () => {
    setResult('ohs_scoring_configs', 'select', []);

    const states: boolean[] = [];
    const unsub = useOrgHealthScoreStore.subscribe((s) =>
      states.push(s.isConfigLoading),
    );

    await act(async () => {
      await getStore().fetchScoringConfig(ORG_ID, ENTERPRISE);
    });

    unsub();
    expect(states).toContain(true);
    expect(getStore().isConfigLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateScoringConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('updateScoringConfig', () => {
  beforeEach(() => {
    useOrgHealthScoreStore.setState({ scoringConfig: [MOCK_CONFIG_APP] });
  });

  it('applies optimistic weight update', async () => {
    setResult('ohs_scoring_configs', 'update', null);

    await act(async () => {
      await getStore().updateScoringConfig(
        'cfg-1',
        0.3,
        'Updated safety weight',
        ENTERPRISE,
      );
    });

    const updated = getStore().scoringConfig.find((c) => c.id === 'cfg-1');
    expect(updated?.weight).toBe(0.3);
    expect(updated?.description).toBe('Updated safety weight');
  });

  it('applies optimistic description update when description=undefined', async () => {
    setResult('ohs_scoring_configs', 'update', null);

    await act(async () => {
      await getStore().updateScoringConfig('cfg-1', 0.25, undefined, ENTERPRISE);
    });

    const updated = getStore().scoringConfig.find((c) => c.id === 'cfg-1');
    expect(updated?.weight).toBe(0.25);
  });

  it('rolls back optimistic update on DB error', async () => {
    setResult('ohs_scoring_configs', 'update', null, { message: 'write denied' });

    await expect(
      getStore().updateScoringConfig('cfg-1', 0.9, undefined, ENTERPRISE),
    ).rejects.toMatchObject({ message: 'write denied' });

    const rolled = getStore().scoringConfig.find((c) => c.id === 'cfg-1');
    expect(rolled?.weight).toBe(0.2);           // original weight
    expect(getStore().error).toBe('write denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertScoringConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('upsertScoringConfig', () => {
  it('upserts rows then re-fetches and updates scoringConfig', async () => {
    setResult('ohs_scoring_configs', 'upsert', null);
    setResult('ohs_scoring_configs', 'select', [{ ...MOCK_CONFIG_ROW, weight: 0.3 }]);

    await act(async () => {
      await getStore().upsertScoringConfig(ORG_ID, { SAFETY: 0.3 }, ENTERPRISE);
    });

    expect(getStore().scoringConfig).toHaveLength(1);
    expect(getStore().scoringConfig[0].weight).toBe(0.3);
  });

  it('sets error and rethrows on upsert DB error', async () => {
    setResult('ohs_scoring_configs', 'upsert', null, { message: 'upsert failed' });

    await expect(
      getStore().upsertScoringConfig(ORG_ID, { SAFETY: 0.3 }, ENTERPRISE),
    ).rejects.toMatchObject({ message: 'upsert failed' });
    expect(getStore().error).toBe('upsert failed');
  });

  it('tracks isConfigLoading: true then false', async () => {
    setResult('ohs_scoring_configs', 'upsert', null);
    setResult('ohs_scoring_configs', 'select', []);

    const states: boolean[] = [];
    const unsub = useOrgHealthScoreStore.subscribe((s) =>
      states.push(s.isConfigLoading),
    );

    await act(async () => {
      await getStore().upsertScoringConfig(ORG_ID, { SAFETY: 0.2 }, ENTERPRISE);
    });

    unsub();
    expect(states).toContain(true);
    expect(getStore().isConfigLoading).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('UI helpers', () => {
  it('selectSnapshot(id) sets selectedSnapshotId', () => {
    getStore().selectSnapshot('snap-abc');
    expect(getStore().selectedSnapshotId).toBe('snap-abc');
  });

  it('selectSnapshot(null) clears selectedSnapshotId', () => {
    useOrgHealthScoreStore.setState({ selectedSnapshotId: 'snap-abc' });
    getStore().selectSnapshot(null);
    expect(getStore().selectedSnapshotId).toBeNull();
  });

  it('clearError sets error to null', () => {
    useOrgHealthScoreStore.setState({ error: 'some error message' });
    getStore().clearError();
    expect(getStore().error).toBeNull();
  });
});
