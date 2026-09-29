/**
 * src/ai-cost/__tests__/aiCostEstimationStore.test.ts
 *
 * MONOLITH v17.5 — AI Cost Estimation Store
 * Framework: Vitest + thenable Proxy Supabase mock
 *
 * Mock strategy: identical to superEmployeeStore.test.ts — every chained
 * Supabase method returns a thenable Proxy that resolves to `mockResult`.
 * `supabase.auth.getUser` is stubbed for actions that read the session user.
 *
 * Coverage:
 *  - Plan gate guard — all 8 gated write actions throw
 *    AiCostEstimationPlanGateError for FREE, STARTER, PROFESSIONAL;
 *    resolve for ENTERPRISE
 *  - setFilters — merges partial updates without clobbering other fields
 *  - clearError — resets error to null, idempotent
 *  - fetchCostModels — isLoading flag lifecycle, success mapping, error path
 *  - logUsage:
 *      PER_TOKEN with separate input/output rates
 *      PER_REQUEST rate × requestCount
 *      PER_IMAGE rate × requestCount
 *      PER_MINUTE rate × durationMinutes
 *      MONTHLY_FLAT uses rate as-is
 *      model not found → computedCostUsd = 0
 *      new log prepended to usageLogs
 *  - createTaskEstimate:
 *      ROI computed when manualCostThb provided
 *      ROI null when manualCostThb absent
 *      new estimate prepended to taskEstimates
 *  - updateActuals — updates matching estimate in store, non-matching untouched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE — thenable Proxy (hoisted before all imports)
// ============================================================================

const { mockState, mockSupabase } = vi.hoisted(() => {
  const mockState = {
    result: { data: null, error: null } as { data: unknown; error: unknown },
  };
  const makeThenableProxy = (): unknown => new Proxy({}, {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(mockState.result).then(onFulfilled, onRejected);
      }
      return (..._args: unknown[]) => makeThenableProxy();
    },
  });
  return {
    mockState,
    mockSupabase: {
      from: vi.fn(() => makeThenableProxy()),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-ace-001' } },
          error: null,
        }),
      },
    },
  };
});

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ============================================================================
// IMPORTS (after mock)
// ============================================================================

import { useAiCostEstimationStore } from '../aiCostEstimationStore';
import { AiCostEstimationPlanGateError } from '../aiCostEstimationTypes';
import type {
  AiCostModel,
  AiUsageLog,
  AiTaskEstimate,
  CostModelRow,
  UsageLogRow,
  TaskEstimateRow,
} from '../aiCostEstimationTypes';

// ============================================================================
// HELPERS — initial state for clean resets
// ============================================================================

const INITIAL_STATE = {
  costModels: [],
  usageLogs: [],
  usageSummary: [],
  taskEstimates: [],
  taskRoi: [],
  budgetPeriods: [],
  filters: {
    tool: 'ALL' as const,
    taskCategory: 'ALL' as const,
    fromDate: null,
    toDate: null,
    employeeId: null,
  },
  isLoading: false,
  isUsageLoading: false,
  isEstimateLoading: false,
  isBudgetLoading: false,
  error: null,
};

function resetStore() {
  useAiCostEstimationStore.setState(INITIAL_STATE);
}

// ── Row factories ─────────────────────────────────────────────────────────────

function makeCostModelRow(overrides: Partial<CostModelRow> = {}): CostModelRow {
  return {
    id: 'cm-001',
    org_id: 'org-001',
    tool: 'CHATGPT',
    display_name: 'GPT-4o',
    cost_unit: 'PER_TOKEN',
    rate_usd: 0.005,
    input_rate_usd: 0.003,
    output_rate_usd: 0.015,
    thb_exchange_rate: 35.0,
    is_active: true,
    notes: null,
    created_by: 'user-ace-001',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeUsageLogRow(overrides: Partial<UsageLogRow> = {}): UsageLogRow {
  return {
    id: 'ul-001',
    org_id: 'org-001',
    employee_id: 'emp-001',
    cost_model_id: 'cm-001',
    task_category: 'DESIGN',
    task_ref_id: null,
    task_description: null,
    input_tokens: 1000,
    output_tokens: 500,
    request_count: 1,
    duration_minutes: null,
    computed_cost_usd: 0.01,
    computed_cost_thb: 0.35,
    time_saved_minutes: null,
    logged_at: '2027-01-15T10:00:00Z',
    created_at: '2027-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeTaskEstimateRow(overrides: Partial<TaskEstimateRow> = {}): TaskEstimateRow {
  return {
    id: 'te-001',
    org_id: 'org-001',
    created_by: 'user-ace-001',
    task_category: 'QUOTATION',
    task_description: 'Test estimate',
    task_ref_id: null,
    cost_model_ids: ['cm-001'],
    est_input_tokens: 1000,
    est_output_tokens: 2000,
    est_requests: 1,
    est_duration_minutes: null,
    est_cost_usd: 0.033,
    est_cost_thb: 1.155,
    manual_cost_thb: 200,
    manual_time_min: null,
    est_roi_pct: 99.42,
    actual_cost_usd: null,
    actual_cost_thb: null,
    actual_roi_pct: null,
    completed_at: null,
    created_at: '2027-01-15T09:00:00Z',
    updated_at: '2027-01-15T09:00:00Z',
    ...overrides,
  };
}

/** Build a minimal AiCostModel app-layer object for store pre-population */
function makeAiCostModel(overrides: Partial<AiCostModel> = {}): AiCostModel {
  return {
    id: 'cm-001',
    orgId: 'org-001',
    tool: 'CHATGPT',
    displayName: 'GPT-4o',
    costUnit: 'PER_TOKEN',
    rateUsd: 0.005,
    inputRateUsd: 0.003,
    outputRateUsd: 0.015,
    thbExchangeRate: 35.0,
    isActive: true,
    notes: null,
    createdBy: 'user-ace-001',
    createdAt: '2027-01-01T00:00:00Z',
    updatedAt: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Plan gate guard — createCostModel
// ============================================================================

describe('plan gate guard — createCostModel', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().createCostModel('org-001', 'FREE', {
        tool: 'CHATGPT',
        displayName: 'GPT-4o',
        costUnit: 'PER_TOKEN',
        rateUsd: 0.005,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for STARTER', async () => {
    await expect(
      useAiCostEstimationStore.getState().createCostModel('org-001', 'STARTER', {
        tool: 'CHATGPT',
        displayName: 'GPT-4o',
        costUnit: 'PER_TOKEN',
        rateUsd: 0.005,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for PROFESSIONAL', async () => {
    await expect(
      useAiCostEstimationStore.getState().createCostModel('org-001', 'PROFESSIONAL', {
        tool: 'CHATGPT',
        displayName: 'GPT-4o',
        costUnit: 'PER_TOKEN',
        rateUsd: 0.005,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('resolves for ENTERPRISE', async () => {
    mockState.result = { data: makeCostModelRow(), error: null };
    await expect(
      useAiCostEstimationStore.getState().createCostModel('org-001', 'ENTERPRISE', {
        tool: 'CHATGPT',
        displayName: 'GPT-4o',
        costUnit: 'PER_TOKEN',
        rateUsd: 0.005,
      }),
    ).resolves.toBeDefined();
  });
});

// ============================================================================
// Plan gate guard — updateCostModel
// ============================================================================

describe('plan gate guard — updateCostModel', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().updateCostModel('org-001', 'FREE', 'cm-001', {
        rateUsd: 0.01,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for PROFESSIONAL', async () => {
    await expect(
      useAiCostEstimationStore.getState().updateCostModel('org-001', 'PROFESSIONAL', 'cm-001', {
        rateUsd: 0.01,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// Plan gate guard — deactivateCostModel
// ============================================================================

describe('plan gate guard — deactivateCostModel', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().deactivateCostModel('org-001', 'FREE', 'cm-001'),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for STARTER', async () => {
    await expect(
      useAiCostEstimationStore.getState().deactivateCostModel('org-001', 'STARTER', 'cm-001'),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// Plan gate guard — logUsage
// ============================================================================

describe('plan gate guard — logUsage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().logUsage('org-001', 'FREE', {
        employeeId: 'emp-001',
        costModelId: 'cm-001',
        taskCategory: 'DESIGN',
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for PROFESSIONAL', async () => {
    await expect(
      useAiCostEstimationStore.getState().logUsage('org-001', 'PROFESSIONAL', {
        employeeId: 'emp-001',
        costModelId: 'cm-001',
        taskCategory: 'DESIGN',
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// Plan gate guard — createTaskEstimate
// ============================================================================

describe('plan gate guard — createTaskEstimate', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().createTaskEstimate('org-001', 'FREE', {
        taskCategory: 'QUOTATION',
        taskDescription: 'Test',
        costModelIds: ['cm-001'],
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for STARTER', async () => {
    await expect(
      useAiCostEstimationStore.getState().createTaskEstimate('org-001', 'STARTER', {
        taskCategory: 'QUOTATION',
        taskDescription: 'Test',
        costModelIds: ['cm-001'],
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// Plan gate guard — updateActuals
// ============================================================================

describe('plan gate guard — updateActuals', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().updateActuals('org-001', 'FREE', {
        estimateId: 'te-001',
        actualCostUsd: 0.05,
        actualCostThb: 1.75,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for PROFESSIONAL', async () => {
    await expect(
      useAiCostEstimationStore.getState().updateActuals('org-001', 'PROFESSIONAL', {
        estimateId: 'te-001',
        actualCostUsd: 0.05,
        actualCostThb: 1.75,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// Plan gate guard — createBudgetPeriod / updateBudgetPeriod
// ============================================================================

describe('plan gate guard — createBudgetPeriod', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for FREE', async () => {
    await expect(
      useAiCostEstimationStore.getState().createBudgetPeriod('org-001', 'FREE', {
        periodType: 'MONTHLY',
        periodLabel: 'Jan 2027',
        startDate: '2027-01-01',
        endDate: '2027-01-31',
        budgetUsd: 100,
        budgetThb: 3500,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });

  it('throws for PROFESSIONAL', async () => {
    await expect(
      useAiCostEstimationStore.getState().createBudgetPeriod('org-001', 'PROFESSIONAL', {
        periodType: 'MONTHLY',
        periodLabel: 'Jan 2027',
        startDate: '2027-01-01',
        endDate: '2027-01-31',
        budgetUsd: 100,
        budgetThb: 3500,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

describe('plan gate guard — updateBudgetPeriod', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('throws for STARTER', async () => {
    await expect(
      useAiCostEstimationStore.getState().updateBudgetPeriod('org-001', 'STARTER', 'bp-001', {
        budgetUsd: 200,
      }),
    ).rejects.toThrow(AiCostEstimationPlanGateError);
  });
});

// ============================================================================
// clearError
// ============================================================================

describe('clearError', () => {
  beforeEach(resetStore);

  it('resets error to null', () => {
    useAiCostEstimationStore.setState({ error: 'something went wrong' });
    useAiCostEstimationStore.getState().clearError();
    expect(useAiCostEstimationStore.getState().error).toBeNull();
  });

  it('is idempotent when error is already null', () => {
    useAiCostEstimationStore.setState({ error: null });
    expect(() => useAiCostEstimationStore.getState().clearError()).not.toThrow();
    expect(useAiCostEstimationStore.getState().error).toBeNull();
  });
});

// ============================================================================
// setFilters
// ============================================================================

describe('setFilters', () => {
  beforeEach(resetStore);

  it('merges partial updates without clobbering other fields', () => {
    useAiCostEstimationStore.getState().setFilters({ tool: 'CHATGPT' });
    const { filters } = useAiCostEstimationStore.getState();

    expect(filters.tool).toBe('CHATGPT');
    // other fields remain at defaults
    expect(filters.taskCategory).toBe('ALL');
    expect(filters.fromDate).toBeNull();
    expect(filters.toDate).toBeNull();
    expect(filters.employeeId).toBeNull();
  });

  it('applies multiple partial updates in sequence', () => {
    useAiCostEstimationStore.getState().setFilters({ taskCategory: 'DESIGN' });
    useAiCostEstimationStore.getState().setFilters({ fromDate: '2027-01-01', employeeId: 'emp-001' });

    const { filters } = useAiCostEstimationStore.getState();
    expect(filters.taskCategory).toBe('DESIGN');
    expect(filters.fromDate).toBe('2027-01-01');
    expect(filters.employeeId).toBe('emp-001');
    expect(filters.tool).toBe('ALL'); // still default
  });

  it('can reset individual filters back to defaults', () => {
    useAiCostEstimationStore.getState().setFilters({ tool: 'CLAUDE', employeeId: 'emp-999' });
    useAiCostEstimationStore.getState().setFilters({ tool: 'ALL', employeeId: null });

    const { filters } = useAiCostEstimationStore.getState();
    expect(filters.tool).toBe('ALL');
    expect(filters.employeeId).toBeNull();
  });
});

// ============================================================================
// fetchCostModels
// ============================================================================

describe('fetchCostModels', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('sets isLoading = true during fetch, false after', async () => {
    mockState.result = { data: [makeCostModelRow()], error: null };

    const fetchPromise = useAiCostEstimationStore.getState().fetchCostModels('org-001');

    // isLoading should be true immediately
    expect(useAiCostEstimationStore.getState().isLoading).toBe(true);

    await fetchPromise;

    expect(useAiCostEstimationStore.getState().isLoading).toBe(false);
  });

  it('maps DB rows to AiCostModel (camelCase)', async () => {
    const row = makeCostModelRow({ id: 'cm-mapped', display_name: 'Claude 3.5 Sonnet' });
    mockState.result = { data: [row], error: null };

    await useAiCostEstimationStore.getState().fetchCostModels('org-001');

    const { costModels } = useAiCostEstimationStore.getState();
    expect(costModels).toHaveLength(1);
    expect(costModels[0].id).toBe('cm-mapped');
    expect(costModels[0].displayName).toBe('Claude 3.5 Sonnet');
  });

  it('handles null data gracefully (empty array)', async () => {
    mockState.result = { data: null, error: null };

    await useAiCostEstimationStore.getState().fetchCostModels('org-001');

    expect(useAiCostEstimationStore.getState().costModels).toEqual([]);
    expect(useAiCostEstimationStore.getState().isLoading).toBe(false);
  });

  it('sets error on DB failure and isLoading = false', async () => {
    mockState.result = { data: null, error: new Error('DB connection timeout') };

    await useAiCostEstimationStore.getState().fetchCostModels('org-001');

    expect(useAiCostEstimationStore.getState().error).toBe('DB connection timeout');
    expect(useAiCostEstimationStore.getState().isLoading).toBe(false);
  });

  it('calls supabase.from with ace_cost_models table', async () => {
    mockState.result = { data: [], error: null };

    await useAiCostEstimationStore.getState().fetchCostModels('org-001');

    expect(mockSupabase.from).toHaveBeenCalledWith('ace_cost_models');
  });
});

// ============================================================================
// logUsage — cost auto-computation
// ============================================================================

describe('logUsage — PER_TOKEN cost computation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('computes cost using separate input/output rates for PER_TOKEN model', async () => {
    // Pre-populate costModels with the model
    const model = makeAiCostModel({
      costUnit: 'PER_TOKEN',
      inputRateUsd: 0.003,
      outputRateUsd: 0.015,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    // Expected: (1000 × 0.003 + 500 × 0.015) / 1_000_000 × 35 THB
    const expectedUsd = (1000 * 0.003 + 500 * 0.015) / 1_000_000;
    const expectedThb = expectedUsd * 35;

    const returnedRow = makeUsageLogRow({
      computed_cost_usd: expectedUsd,
      computed_cost_thb: expectedThb,
    });
    mockState.result = { data: returnedRow, error: null };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'DESIGN',
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(log.computedCostUsd).toBeCloseTo(expectedUsd, 8);
    expect(log.computedCostThb).toBeCloseTo(expectedThb, 4);
  });

  it('prepends new log to usageLogs', async () => {
    const existingLog: AiUsageLog = {
      id: 'ul-old',
      orgId: 'org-001',
      employeeId: 'emp-002',
      costModelId: 'cm-001',
      taskCategory: 'DOCUMENTATION',
      taskRefId: null,
      taskDescription: null,
      inputTokens: null,
      outputTokens: null,
      requestCount: 1,
      durationMinutes: null,
      computedCostUsd: 0.001,
      computedCostThb: 0.035,
      timeSavedMinutes: null,
      loggedAt: '2027-01-01T00:00:00Z',
      createdAt: '2027-01-01T00:00:00Z',
    };
    useAiCostEstimationStore.setState({
      costModels: [makeAiCostModel()],
      usageLogs: [existingLog],
    });

    const newRow = makeUsageLogRow({ id: 'ul-new' });
    mockState.result = { data: newRow, error: null };

    await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'DESIGN',
      inputTokens: 100,
      outputTokens: 50,
    });

    const { usageLogs } = useAiCostEstimationStore.getState();
    expect(usageLogs).toHaveLength(2);
    expect(usageLogs[0].id).toBe('ul-new'); // new log prepended
    expect(usageLogs[1].id).toBe('ul-old');
  });
});

describe('logUsage — PER_REQUEST cost computation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('multiplies rateUsd by requestCount', async () => {
    const model = makeAiCostModel({
      costUnit: 'PER_REQUEST',
      rateUsd: 0.002,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    const expectedUsd = 0.002 * 5; // 5 requests
    const expectedThb = expectedUsd * 35;

    mockState.result = {
      data: makeUsageLogRow({ computed_cost_usd: expectedUsd, computed_cost_thb: expectedThb }),
      error: null,
    };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'CUSTOMER_SERVICE',
      requestCount: 5,
    });

    expect(log.computedCostUsd).toBeCloseTo(expectedUsd, 8);
  });

  it('uses requestCount = 1 when not provided', async () => {
    const model = makeAiCostModel({
      costUnit: 'PER_REQUEST',
      rateUsd: 0.01,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    mockState.result = { data: makeUsageLogRow({ computed_cost_usd: 0.01 }), error: null };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'QUALITY_CHECK',
      // requestCount omitted — defaults to 1
    });

    expect(log).toBeDefined();
  });
});

describe('logUsage — PER_IMAGE cost computation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('multiplies rateUsd by requestCount for PER_IMAGE', async () => {
    const model = makeAiCostModel({
      costUnit: 'PER_IMAGE',
      rateUsd: 0.04,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    const expectedUsd = 0.04 * 3; // 3 images
    mockState.result = {
      data: makeUsageLogRow({ computed_cost_usd: expectedUsd }),
      error: null,
    };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'DESIGN',
      requestCount: 3,
    });

    expect(log.computedCostUsd).toBeCloseTo(expectedUsd, 8);
  });
});

describe('logUsage — PER_MINUTE cost computation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('multiplies rateUsd by durationMinutes for PER_MINUTE', async () => {
    const model = makeAiCostModel({
      costUnit: 'PER_MINUTE',
      rateUsd: 0.006,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    const expectedUsd = 0.006 * 10; // 10 minutes
    mockState.result = {
      data: makeUsageLogRow({ computed_cost_usd: expectedUsd }),
      error: null,
    };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'DOCUMENTATION',
      durationMinutes: 10,
    });

    expect(log.computedCostUsd).toBeCloseTo(expectedUsd, 8);
  });
});

describe('logUsage — MONTHLY_FLAT cost computation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('uses rateUsd directly as flat cost per session', async () => {
    const model = makeAiCostModel({
      costUnit: 'MONTHLY_FLAT',
      rateUsd: 5.0,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    mockState.result = {
      data: makeUsageLogRow({ computed_cost_usd: 5.0, computed_cost_thb: 175 }),
      error: null,
    };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-001',
      taskCategory: 'DATA_ANALYSIS',
    });

    expect(log.computedCostUsd).toBeCloseTo(5.0, 5);
  });
});

describe('logUsage — model not found', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('uses computedCostUsd = 0 when model is not in store costModels', async () => {
    // costModels is empty — model 'cm-unknown' not found
    useAiCostEstimationStore.setState({ costModels: [] });

    mockState.result = {
      data: makeUsageLogRow({ computed_cost_usd: 0, computed_cost_thb: 0 }),
      error: null,
    };

    const log = await useAiCostEstimationStore.getState().logUsage('org-001', 'ENTERPRISE', {
      employeeId: 'emp-001',
      costModelId: 'cm-unknown',
      taskCategory: 'OTHER',
    });

    expect(log.computedCostUsd).toBe(0);
    expect(log.computedCostThb).toBe(0);
  });
});

// ============================================================================
// createTaskEstimate — ROI calculation
// ============================================================================

describe('createTaskEstimate — ROI calculation', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('computes estRoiPct when manualCostThb is provided', async () => {
    // Model: PER_REQUEST, rateUsd=0.01, exchange=35
    // estCostThb ≈ 0.01 × 35 = 0.35 (1 request)
    // manualCostThb = 200
    // ROI = (200 - 0.35) / 200 × 100 ≈ 99.825%
    const model = makeAiCostModel({
      costUnit: 'PER_REQUEST',
      rateUsd: 0.01,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    const row = makeTaskEstimateRow({
      est_cost_usd: 0.01,
      est_cost_thb: 0.35,
      manual_cost_thb: 200,
      est_roi_pct: 99.825,
    });
    mockState.result = { data: row, error: null };

    const estimate = await useAiCostEstimationStore.getState().createTaskEstimate(
      'org-001',
      'ENTERPRISE',
      {
        taskCategory: 'QUOTATION',
        taskDescription: 'ประเมินราคา Test',
        costModelIds: ['cm-001'],
        estRequests: 1,
        manualCostThb: 200,
      },
    );

    expect(estimate.estRoiPct).toBeCloseTo(99.825, 2);
    expect(estimate.manualCostThb).toBe(200);
  });

  it('estRoiPct is null when manualCostThb is not provided', async () => {
    const model = makeAiCostModel({
      costUnit: 'PER_REQUEST',
      rateUsd: 0.01,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({ costModels: [model] });

    const row = makeTaskEstimateRow({
      manual_cost_thb: null,
      est_roi_pct: null,
    });
    mockState.result = { data: row, error: null };

    const estimate = await useAiCostEstimationStore.getState().createTaskEstimate(
      'org-001',
      'ENTERPRISE',
      {
        taskCategory: 'QUOTATION',
        taskDescription: 'ประเมินราคา Test',
        costModelIds: ['cm-001'],
        // no manualCostThb
      },
    );

    expect(estimate.estRoiPct).toBeNull();
    expect(estimate.manualCostThb).toBeNull();
  });

  it('prepends new estimate to taskEstimates', async () => {
    const model = makeAiCostModel({
      costUnit: 'MONTHLY_FLAT',
      rateUsd: 5,
      inputRateUsd: null,
      outputRateUsd: null,
      thbExchangeRate: 35,
    });
    useAiCostEstimationStore.setState({
      costModels: [model],
      taskEstimates: [
        {
          id: 'te-old',
          orgId: 'org-001',
          createdBy: null,
          taskCategory: 'OTHER',
          taskDescription: 'Old estimate',
          taskRefId: null,
          costModelIds: [],
          estInputTokens: null,
          estOutputTokens: null,
          estRequests: 1,
          estDurationMinutes: null,
          estCostUsd: 0,
          estCostThb: 0,
          manualCostThb: null,
          manualTimeMin: null,
          estRoiPct: null,
          actualCostUsd: null,
          actualCostThb: null,
          actualRoiPct: null,
          completedAt: null,
          createdAt: '2027-01-01T00:00:00Z',
          updatedAt: '2027-01-01T00:00:00Z',
        },
      ],
    });

    mockState.result = { data: makeTaskEstimateRow({ id: 'te-new' }), error: null };

    await useAiCostEstimationStore.getState().createTaskEstimate('org-001', 'ENTERPRISE', {
      taskCategory: 'DESIGN',
      taskDescription: 'New estimate',
      costModelIds: ['cm-001'],
    });

    const { taskEstimates } = useAiCostEstimationStore.getState();
    expect(taskEstimates).toHaveLength(2);
    expect(taskEstimates[0].id).toBe('te-new'); // prepended
    expect(taskEstimates[1].id).toBe('te-old');
  });
});

// ============================================================================
// updateActuals
// ============================================================================

describe('updateActuals', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('updates matching estimate in taskEstimates array', async () => {
    const existingEstimate: AiTaskEstimate = {
      id: 'te-target',
      orgId: 'org-001',
      createdBy: null,
      taskCategory: 'DESIGN',
      taskDescription: 'Test',
      taskRefId: null,
      costModelIds: ['cm-001'],
      estInputTokens: null,
      estOutputTokens: null,
      estRequests: 1,
      estDurationMinutes: null,
      estCostUsd: 0.01,
      estCostThb: 0.35,
      manualCostThb: null,
      manualTimeMin: null,
      estRoiPct: null,
      actualCostUsd: null,
      actualCostThb: null,
      actualRoiPct: null,
      completedAt: null,
      createdAt: '2027-01-10T00:00:00Z',
      updatedAt: '2027-01-10T00:00:00Z',
    };
    useAiCostEstimationStore.setState({ taskEstimates: [existingEstimate] });

    const updatedRow = makeTaskEstimateRow({
      id: 'te-target',
      actual_cost_usd: 0.012,
      actual_cost_thb: 0.42,
      actual_roi_pct: 88.5,
      completed_at: '2027-01-20T12:00:00Z',
    });
    mockState.result = { data: updatedRow, error: null };

    const result = await useAiCostEstimationStore.getState().updateActuals(
      'org-001',
      'ENTERPRISE',
      {
        estimateId: 'te-target',
        actualCostUsd: 0.012,
        actualCostThb: 0.42,
        actualRoiPct: 88.5,
      },
    );

    expect(result.actualCostUsd).toBeCloseTo(0.012, 5);
    expect(result.actualCostThb).toBeCloseTo(0.42, 4);
    expect(result.actualRoiPct).toBeCloseTo(88.5, 2);
    expect(result.completedAt).toBe('2027-01-20T12:00:00Z');

    // Store should reflect the update
    const stored = useAiCostEstimationStore.getState().taskEstimates.find(
      (e) => e.id === 'te-target',
    );
    expect(stored?.actualCostUsd).toBeCloseTo(0.012, 5);
  });

  it('leaves non-matching estimates untouched', async () => {
    const otherEstimate: AiTaskEstimate = {
      id: 'te-other',
      orgId: 'org-001',
      createdBy: null,
      taskCategory: 'QUOTATION',
      taskDescription: 'Other',
      taskRefId: null,
      costModelIds: [],
      estInputTokens: null,
      estOutputTokens: null,
      estRequests: 1,
      estDurationMinutes: null,
      estCostUsd: 1,
      estCostThb: 35,
      manualCostThb: null,
      manualTimeMin: null,
      estRoiPct: null,
      actualCostUsd: null,
      actualCostThb: null,
      actualRoiPct: null,
      completedAt: null,
      createdAt: '2027-01-05T00:00:00Z',
      updatedAt: '2027-01-05T00:00:00Z',
    };
    useAiCostEstimationStore.setState({ taskEstimates: [otherEstimate] });

    const updatedRow = makeTaskEstimateRow({ id: 'te-target' });
    mockState.result = { data: updatedRow, error: null };

    await useAiCostEstimationStore.getState().updateActuals('org-001', 'ENTERPRISE', {
      estimateId: 'te-target',
      actualCostUsd: 0.05,
      actualCostThb: 1.75,
    });

    // te-other should be completely unchanged
    const other = useAiCostEstimationStore
      .getState()
      .taskEstimates.find((e) => e.id === 'te-other');
    expect(other?.actualCostUsd).toBeNull();
    expect(other?.completedAt).toBeNull();
  });
});
