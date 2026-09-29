/**
 * src/ai-scheduler/__tests__/aiSchedulerStore.test.ts
 *
 * MONOLITH v17.5 — AI Production Scheduler Store
 * Framework: Vitest + capturing thenable Proxy Supabase mock
 *
 * Mock strategy: vi.hoisted declares mockSupabase so the vi.mock factory can
 * reference it safely after hoisting.  Mutable state (mockResult, lastInsertArgs,
 * lastUpdateArgs) lives at module scope; beforeEach wires mockSupabase.from to a
 * fresh makeCapturingProxy so captures reset every test.
 *
 * Coverage:
 *  Plan gate (ENTERPRISE only)
 *    - createMachineConfig, updateMachineConfig, createProductionRun,
 *      approveRun, cancelRun, addScheduleItem, updateItemStatus,
 *      createConstraint, deactivateConstraint all throw
 *      AiSchedulerPlanGateError for FREE / STARTER / PROFESSIONAL;
 *      resolve for ENTERPRISE
 *
 *  addScheduleItem — auto-sequence
 *    - empty run → sequence_order = 1
 *    - 2 existing items for same run → sequence_order = 3
 *    - explicit sequenceOrder in payload overrides auto-calc
 *    - items from a different runId are NOT counted for this run's order
 *
 *  approveRun — auth write
 *    - supabase.auth.getUser() is called
 *    - update patch contains { status: 'APPROVED', approved_by: '<userId>',
 *      approved_at: <ISO string> }
 *    - store productionRuns array is updated in-place via mapProductionRunRow
 *
 *  updateItemStatus — is_overridden flag
 *    - with overrideReason → patch contains is_overridden: true
 *    - without overrideReason → is_overridden absent from patch
 *    - store scheduleItems array is updated in-place
 *
 *  setFilters — partial merge without clobbering other fields
 *  clearError — resets error to null, idempotent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SUPABASE — hoisted so vi.mock factory can reference it
// ============================================================================

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
}));

vi.mock('../../core/supabase', () => ({ supabase: mockSupabase }));

// ============================================================================
// IMPORTS (after mock)
// ============================================================================

import { useAiSchedulerStore } from '../aiSchedulerStore';
import {
  AiSchedulerPlanGateError,
  mapScheduleItemRow,
  mapProductionRunRow,
  DEFAULT_APS_FILTERS,
} from '../aiSchedulerTypes';
import type { ScheduleItemRow, ProductionRunRow } from '../aiSchedulerTypes';

// ============================================================================
// CAPTURING PROXY — module-level state reset in beforeEach
// ============================================================================

let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
let lastInsertArgs: unknown = null;
let lastUpdateArgs: unknown = null;

function makeCapturingProxy(): unknown {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve(mockResult).then(onFulfilled, onRejected);
      }
      if (prop === 'insert') {
        return (args: unknown) => {
          lastInsertArgs = args;
          return makeCapturingProxy();
        };
      }
      if (prop === 'update') {
        return (args: unknown) => {
          lastUpdateArgs = args;
          return makeCapturingProxy();
        };
      }
      return (..._args: unknown[]) => makeCapturingProxy();
    },
  };
  return new Proxy({} as Record<string, unknown>, handler);
}

// ============================================================================
// HELPERS
// ============================================================================

function makeItemRow(overrides: Partial<ScheduleItemRow> = {}): ScheduleItemRow {
  return {
    id: crypto.randomUUID(),
    org_id: 'org-1',
    run_id: 'run-1',
    machine_config_id: null,
    job_ref_id: null,
    job_label: 'Job A',
    priority: 'NORMAL',
    status: 'PENDING',
    scheduled_start: null,
    scheduled_end: null,
    est_duration_min: 60,
    actual_start: null,
    actual_end: null,
    depends_on: [],
    ai_rationale: null,
    is_overridden: false,
    override_reason: null,
    sequence_order: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  updated_at: new Date().toISOString(),
};
}

function makeRunRow(overrides: Partial<ProductionRunRow> = {}): ProductionRunRow {
  return {
    id: 'run-1',
    org_id: 'org-1',
    run_label: 'Run 1',
    schedule_date: '2027-02-01',
    status: 'READY',
    schedule_mode: 'AUTO',
    ai_model_used: null,
    ai_confidence_score: null,
    total_items: 0,
    approved_by: null,
    approved_at: null,
    notes: null,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  override_count: 0,
  estimated_utilisation_pct: null,
  delay_risk_count: 0,
  ai_prompt_tokens: null,
  ai_run_duration_ms: null,
  updated_at: new Date().toISOString(),
};
}

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  useAiSchedulerStore.setState({
    machineConfigs: [],
    productionRuns: [],
    scheduleItems: [],
    constraints: [],
    scheduleSummary: [],
    machineUtilisation: [],
    filters: { ...DEFAULT_APS_FILTERS },
    isLoading: false,
    isRunLoading: false,
    isItemLoading: false,
    error: null,
  });

  lastInsertArgs = null;
  lastUpdateArgs = null;
  mockResult = { data: null, error: null };

  mockSupabase.from.mockImplementation(() => makeCapturingProxy());
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-aps-001' } },
    error: null,
  });
});

// ============================================================================
// PLAN GATE — ENTERPRISE only
// ============================================================================

describe('Plan gate — ENTERPRISE only', () => {
  const nonEnterprisePlans = ['FREE', 'STARTER', 'PROFESSIONAL'] as const;
  const orgId = 'org-1';

  for (const plan of nonEnterprisePlans) {
    describe(`plan = ${plan}`, () => {
      it('createMachineConfig throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().createMachineConfig(orgId, plan, {
            machineType: 'CNC',
            displayName: 'CNC-01',
            dailyCapacityHrs: 8,
            setupTimeMin: 15,
            maxConcurrentJobs: 1,
            schedulingWeight: 1,
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('updateMachineConfig throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().updateMachineConfig(orgId, plan, 'cfg-1', {
            dailyCapacityHrs: 10,
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('createProductionRun throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().createProductionRun(orgId, plan, {
            runLabel: 'Run A',
            scheduleDate: '2027-02-01',
            scheduleMode: 'AUTO',
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('approveRun throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().approveRun(orgId, plan, 'run-1'),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('cancelRun throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().cancelRun(orgId, plan, 'run-1'),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('addScheduleItem throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().addScheduleItem(orgId, plan, {
            runId: 'run-1',
            jobLabel: 'Job A',
            estDurationMin: 60,
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('updateItemStatus throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().updateItemStatus(orgId, plan, {
            itemId: 'item-1',
            status: 'IN_PROGRESS',
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('createConstraint throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().createConstraint(orgId, plan, {
            constraintType: 'MACHINE_DOWN',
          }),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });

      it('deactivateConstraint throws AiSchedulerPlanGateError', async () => {
        await expect(
          useAiSchedulerStore.getState().deactivateConstraint(orgId, plan, 'con-1'),
        ).rejects.toBeInstanceOf(AiSchedulerPlanGateError);
      });
    });
  }

  it('createMachineConfig resolves for ENTERPRISE', async () => {
    const row = {
      id: 'cfg-1',
      org_id: 'org-1',
      machine_type: 'CNC',
      display_name: 'CNC-01',
      daily_capacity_hrs: 8,
      setup_time_min: 15,
      max_concurrent_jobs: 1,
      scheduling_weight: 1,
      is_active: true,
      notes: null,
      created_by: 'user-aps-001',
      created_at: new Date().toISOString(),
    };
    mockResult = { data: row, error: null };
    await expect(
      useAiSchedulerStore.getState().createMachineConfig('org-1', 'ENTERPRISE', {
        machineType: 'CNC',
        displayName: 'CNC-01',
        dailyCapacityHrs: 8,
        setupTimeMin: 15,
        maxConcurrentJobs: 1,
        schedulingWeight: 1,
      }),
    ).resolves.toMatchObject({ id: 'cfg-1', displayName: 'CNC-01' });
  });
});

// ============================================================================
// addScheduleItem — auto-sequence
// ============================================================================

describe('addScheduleItem — auto-sequence', () => {
  const orgId = 'org-1';
  const runId = 'run-1';

  function seedResult(sequenceOrder: number) {
    const row = makeItemRow({ sequence_order: sequenceOrder, run_id: runId });
    mockResult = { data: row, error: null };
  }

  it('assigns sequence_order = 1 when no items exist for the run', async () => {
    seedResult(1);
    await useAiSchedulerStore.getState().addScheduleItem(orgId, 'ENTERPRISE', {
      runId,
      jobLabel: 'First Job',
      estDurationMin: 30,
    });
    expect((lastInsertArgs as Record<string, unknown>).sequence_order).toBe(1);
  });

  it('assigns sequence_order = 3 when 2 items already exist for the run', async () => {
    const existingItems = [
      mapScheduleItemRow(makeItemRow({ id: 'i-1', sequence_order: 1, run_id: runId })),
      mapScheduleItemRow(makeItemRow({ id: 'i-2', sequence_order: 2, run_id: runId })),
    ];
    useAiSchedulerStore.setState({ scheduleItems: existingItems });
    seedResult(3);

    await useAiSchedulerStore.getState().addScheduleItem(orgId, 'ENTERPRISE', {
      runId,
      jobLabel: 'Third Job',
      estDurationMin: 45,
    });
    expect((lastInsertArgs as Record<string, unknown>).sequence_order).toBe(3);
  });

  it('explicit sequenceOrder in payload overrides auto-calc', async () => {
    const existingItems = [
      mapScheduleItemRow(makeItemRow({ id: 'i-1', sequence_order: 1, run_id: runId })),
      mapScheduleItemRow(makeItemRow({ id: 'i-2', sequence_order: 2, run_id: runId })),
    ];
    useAiSchedulerStore.setState({ scheduleItems: existingItems });
    seedResult(10);

    await useAiSchedulerStore.getState().addScheduleItem(orgId, 'ENTERPRISE', {
      runId,
      jobLabel: 'Jump Job',
      estDurationMin: 20,
      sequenceOrder: 10,
    });
    expect((lastInsertArgs as Record<string, unknown>).sequence_order).toBe(10);
  });

  it('only counts items for the target runId when computing next order', async () => {
    const otherRunItems = [
      mapScheduleItemRow(makeItemRow({ id: 'x-1', run_id: 'run-other', sequence_order: 1 })),
      mapScheduleItemRow(makeItemRow({ id: 'x-2', run_id: 'run-other', sequence_order: 2 })),
      mapScheduleItemRow(makeItemRow({ id: 'x-3', run_id: 'run-other', sequence_order: 3 })),
    ];
    useAiSchedulerStore.setState({ scheduleItems: otherRunItems });
    seedResult(1);

    await useAiSchedulerStore.getState().addScheduleItem(orgId, 'ENTERPRISE', {
      runId, // run-1 has 0 items
      jobLabel: 'Isolated Job',
      estDurationMin: 60,
    });
    expect((lastInsertArgs as Record<string, unknown>).sequence_order).toBe(1);
  });
});

// ============================================================================
// approveRun — auth write
// ============================================================================

describe('approveRun — auth write', () => {
  const orgId = 'org-1';
  const runId = 'run-1';

  beforeEach(() => {
    const run = mapProductionRunRow(makeRunRow({ id: runId, status: 'READY' }));
    useAiSchedulerStore.setState({ productionRuns: [run] });
  });

  it('calls supabase.auth.getUser()', async () => {
    const approvedRow = makeRunRow({ id: runId, status: 'APPROVED', approved_by: 'user-aps-001' });
    mockResult = { data: approvedRow, error: null };

    await useAiSchedulerStore.getState().approveRun(orgId, 'ENTERPRISE', runId);
    expect(mockSupabase.auth.getUser).toHaveBeenCalled();
  });

  it('update patch has status APPROVED, approved_by from getUser, and ISO approved_at', async () => {
    const before = Date.now() - 1000;
    const approvedRow = makeRunRow({ id: runId, status: 'APPROVED', approved_by: 'user-aps-001' });
    mockResult = { data: approvedRow, error: null };

    await useAiSchedulerStore.getState().approveRun(orgId, 'ENTERPRISE', runId);
    const after = Date.now() + 1000;

    const patch = lastUpdateArgs as Record<string, unknown>;
    expect(patch.status).toBe('APPROVED');
    expect(patch.approved_by).toBe('user-aps-001');
    expect(typeof patch.approved_at).toBe('string');
    const ts = new Date(patch.approved_at as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('updates the productionRuns array in the store with the approved run', async () => {
    const approvedRow = makeRunRow({ id: runId, status: 'APPROVED', approved_by: 'user-aps-001' });
    mockResult = { data: approvedRow, error: null };

    await useAiSchedulerStore.getState().approveRun(orgId, 'ENTERPRISE', runId);
    const { productionRuns } = useAiSchedulerStore.getState();
    const updated = productionRuns.find((r) => r.id === runId);
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.approvedBy).toBe('user-aps-001');
  });
});

// ============================================================================
// updateItemStatus — is_overridden flag
// ============================================================================

describe('updateItemStatus — is_overridden flag', () => {
  const orgId = 'org-1';
  const itemId = 'item-1';

  beforeEach(() => {
    const item = mapScheduleItemRow(
      makeItemRow({ id: itemId, status: 'PENDING', run_id: 'run-1' }),
    );
    useAiSchedulerStore.setState({ scheduleItems: [item] });
  });

  it('patch contains is_overridden: true when overrideReason is provided', async () => {
    const updatedRow = makeItemRow({
      id: itemId,
      status: 'IN_PROGRESS',
      is_overridden: true,
      override_reason: 'urgent order',
    });
    mockResult = { data: updatedRow, error: null };

    await useAiSchedulerStore.getState().updateItemStatus(orgId, 'ENTERPRISE', {
      itemId,
      status: 'IN_PROGRESS',
      overrideReason: 'urgent order',
    });

    const patch = lastUpdateArgs as Record<string, unknown>;
    expect(patch.is_overridden).toBe(true);
    expect(patch.override_reason).toBe('urgent order');
  });

  it('is_overridden is absent from patch when overrideReason is not provided', async () => {
    const updatedRow = makeItemRow({ id: itemId, status: 'IN_PROGRESS' });
    mockResult = { data: updatedRow, error: null };

    await useAiSchedulerStore.getState().updateItemStatus(orgId, 'ENTERPRISE', {
      itemId,
      status: 'IN_PROGRESS',
    });

    const patch = lastUpdateArgs as Record<string, unknown>;
    expect(patch.is_overridden).toBeUndefined();
    expect(patch.override_reason).toBeUndefined();
  });

  it('updates the scheduleItems array in the store with the new item state', async () => {
    const updatedRow = makeItemRow({
      id: itemId,
      status: 'DONE',
      is_overridden: true,
      override_reason: 'manual finish',
    });
    mockResult = { data: updatedRow, error: null };

    await useAiSchedulerStore.getState().updateItemStatus(orgId, 'ENTERPRISE', {
      itemId,
      status: 'DONE',
      overrideReason: 'manual finish',
    });

    const { scheduleItems } = useAiSchedulerStore.getState();
    const updated = scheduleItems.find((i) => i.id === itemId);
    expect(updated?.status).toBe('DONE');
    expect(updated?.isOverridden).toBe(true);
    expect(updated?.overrideReason).toBe('manual finish');
  });
});

// ============================================================================
// setFilters — partial merge
// ============================================================================

describe('setFilters — partial merge', () => {
  it('merges a single field without clobbering other fields', () => {
    const store = useAiSchedulerStore.getState();
    store.setFilters({ status: 'APPROVED', scheduleMode: 'MANUAL_OVERRIDE' });
    useAiSchedulerStore.getState().setFilters({ status: 'DRAFT' });
    const { filters } = useAiSchedulerStore.getState();
    expect(filters.status).toBe('DRAFT');
    expect(filters.scheduleMode).toBe('MANUAL_OVERRIDE');
  });

  it('updates fromDate and toDate independently', () => {
    const store = useAiSchedulerStore.getState();
    store.setFilters({ fromDate: '2027-01-01' });
    useAiSchedulerStore.getState().setFilters({ toDate: '2027-03-31' });
    const { filters } = useAiSchedulerStore.getState();
    expect(filters.fromDate).toBe('2027-01-01');
    expect(filters.toDate).toBe('2027-03-31');
  });
});

// ============================================================================
// clearError
// ============================================================================

describe('clearError', () => {
  it('resets error to null', () => {
    useAiSchedulerStore.setState({ error: 'Something went wrong' });
    useAiSchedulerStore.getState().clearError();
    expect(useAiSchedulerStore.getState().error).toBeNull();
  });

  it('is idempotent when error is already null', () => {
    useAiSchedulerStore.setState({ error: null });
    expect(() => useAiSchedulerStore.getState().clearError()).not.toThrow();
    expect(useAiSchedulerStore.getState().error).toBeNull();
  });
});
