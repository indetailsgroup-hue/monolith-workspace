/**
 * leadershipActionStore.test.ts
 * Vitest unit tests for useLeadershipActionStore (MONOLITH v18.0)
 *
 * Coverage:
 *  - ENTERPRISE plan gate on all 10 gated actions (30 reject + 10 pass = 40 tests)
 *  - fetchActions: parallel Promise.all, actionResult.error, summaryResult.error, isLoading flag
 *  - createAction: prepend to actions array, error path
 *  - updateAction: updates in-place by id, error path
 *  - deleteAction: cascade (removes assignments + updates, resets selectedActionId), error path
 *  - addAssignment: appends to assignments, error path
 *  - removeAssignment: filters by id, error path
 *  - postUpdate: appends to updates (append-only), isUpdateLoading flag, error path
 *  - completeAction: optimistic COMPLETED, rollback prevStatus on error
 *  - cancelAction: optimistic CANCELLED, rollback prevStatus on error
 *  - reassignOwner: updates owner_id in-place, error path
 *  - UI helpers: selectAction, setFilters merge, clearError
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useLeadershipActionStore } from '../leadershipActionStore';
import {
  DEFAULT_LAT_FILTERS,
  LeadershipActionPlanGateError,
  type LatActionRow,
  type LatActionAssignmentRow,
  type LatActionUpdateRow,
  type LatActionSummaryRow,
  type LatAction,
  type LatActionAssignment,
  type LatActionUpdate,
  type CreateLatActionPayload,
  type AddLatAssignmentPayload,
  type PostLatUpdatePayload,
} from '../leadershipActionTypes';
import type { OrgPlan } from '../../tenant/types';

// ─── Supabase mock ──────────────────────────────────────────────────────────────

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
        // eq, order, filter, etc.
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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeActionRow(overrides: Partial<LatActionRow> = {}): LatAction {
  const row: LatActionRow = {
    id:           'a-1',
    org_id:       'org-1',
    title:        'Action 1',
    description:  null,
    category:     'STRATEGY',
    priority:     'HIGH',
    status:       'OPEN',
    due_date:     null,
    owner_id:     'user-1',
    reviewed_by:  null,
    completed_at: null,
    cancelled_at: null,
    created_by:   'user-1',
    created_at:   '2027-02-20T00:00:00Z',
    updated_at:   '2027-02-20T00:00:00Z',
    ...overrides,
  };
  return {
    ...row,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    dueDate:     row.due_date,
  };
}

function makeAssignmentRow(overrides: Partial<LatActionAssignmentRow> = {}): LatActionAssignment {
  const row: LatActionAssignmentRow = {
    id:          'asgn-1',
    action_id:   'a-1',
    org_id:      'org-1',
    assignee_id: 'user-2',
    assigned_by: 'user-1',
    assigned_at: '2027-02-20T00:00:00Z',
    ...overrides,
  };
  return { ...row, assignedAt: row.assigned_at };
}

function makeUpdateRow(overrides: Partial<LatActionUpdateRow> = {}): LatActionUpdate {
  const row: LatActionUpdateRow = {
    id:              'upd-1',
    action_id:       'a-1',
    org_id:          'org-1',
    author_id:       'user-1',
    body:            'Progress update',
    previous_status: null,
    new_status:      null,
    created_at:      '2027-02-20T00:00:00Z',
    ...overrides,
  };
  return { ...row, createdAt: row.created_at };
}

function makeSummaryRow(overrides: Partial<LatActionSummaryRow> = {}): LatActionSummaryRow {
  return {
    org_id:        'org-1',
    status:        'OPEN',
    priority:      'HIGH',
    action_count:  5,
    overdue_count: 1,
    ...overrides,
  };
}

function makeCreatePayload(overrides: Partial<CreateLatActionPayload> = {}): CreateLatActionPayload {
  return {
    org_id:   'org-1',
    title:    'New Action',
    owner_id: 'user-1',
    ...overrides,
  };
}

function makeAssignmentPayload(overrides: Partial<AddLatAssignmentPayload> = {}): AddLatAssignmentPayload {
  return {
    action_id:   'a-1',
    org_id:      'org-1',
    assignee_id: 'user-2',
    ...overrides,
  };
}

function makeUpdatePayload(overrides: Partial<PostLatUpdatePayload> = {}): PostLatUpdatePayload {
  return {
    action_id: 'a-1',
    org_id:    'org-1',
    body:      'Status update comment',
    ...overrides,
  };
}

// ─── Plan gate constants ─────────────────────────────────────────────────────────

const NON_ENTERPRISE: OrgPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL'];

const ACTIONS = [
  'fetchActions',
  'createAction',
  'updateAction',
  'deleteAction',
  'addAssignment',
  'removeAssignment',
  'postUpdate',
  'completeAction',
  'cancelAction',
  'reassignOwner',
] as const;

// ─── Setup ───────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMock();
  setResult('lat_actions',           'select', []);
  setResult('lat_actions',           'insert', makeActionRow());
  setResult('lat_actions',           'update', makeActionRow());
  setResult('lat_actions',           'delete', null);
  setResult('lat_action_assignments','select', []);
  setResult('lat_action_assignments','insert', makeAssignmentRow());
  setResult('lat_action_assignments','delete', null);
  setResult('lat_action_updates',    'select', []);
  setResult('lat_action_updates',    'insert', makeUpdateRow());
  setResult('lat_action_summary_v',  'select', []);

  useLeadershipActionStore.setState({
    actions:          [],
    assignments:      [],
    updates:          [],
    summaries:        [],
    selectedActionId: null,
    isLoading:        false,
    isUpdateLoading:  false,
    filters:          DEFAULT_LAT_FILTERS,
    error:            null,
  });
});

// =============================================================================
// PLAN GATE
// =============================================================================

describe('Plan gate — all 10 actions reject non-ENTERPRISE plans', () => {
  it.each(NON_ENTERPRISE)('fetchActions throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().fetchActions('org-1', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('createAction throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().createAction(makeCreatePayload(), plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('updateAction throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().updateAction('a-1', { title: 'x' }, plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('deleteAction throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().deleteAction('a-1', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('addAssignment throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().addAssignment(makeAssignmentPayload(), plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('removeAssignment throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().removeAssignment('asgn-1', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('postUpdate throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().postUpdate(makeUpdatePayload(), plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('completeAction throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().completeAction('a-1', 'user-1', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('cancelAction throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().cancelAction('a-1', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });

  it.each(NON_ENTERPRISE)('reassignOwner throws for %s', async (plan) => {
    await expect(
      useLeadershipActionStore.getState().reassignOwner('a-1', 'user-2', plan),
    ).rejects.toBeInstanceOf(LeadershipActionPlanGateError);
  });
});

describe('Plan gate — ENTERPRISE passes all 10 actions', () => {
  it.each(ACTIONS)('%s resolves without LeadershipActionPlanGateError for ENTERPRISE', async (action) => {
    const store = useLeadershipActionStore.getState();
    let promise: Promise<void>;
    switch (action) {
      case 'fetchActions':     promise = store.fetchActions('org-1', 'ENTERPRISE'); break;
      case 'createAction':     promise = store.createAction(makeCreatePayload(), 'ENTERPRISE'); break;
      case 'updateAction':     promise = store.updateAction('a-1', { title: 'x' }, 'ENTERPRISE'); break;
      case 'deleteAction':     promise = store.deleteAction('a-1', 'ENTERPRISE'); break;
      case 'addAssignment':    promise = store.addAssignment(makeAssignmentPayload(), 'ENTERPRISE'); break;
      case 'removeAssignment': promise = store.removeAssignment('asgn-1', 'ENTERPRISE'); break;
      case 'postUpdate':       promise = store.postUpdate(makeUpdatePayload(), 'ENTERPRISE'); break;
      case 'completeAction':   promise = store.completeAction('a-1', 'user-1', 'ENTERPRISE'); break;
      case 'cancelAction':     promise = store.cancelAction('a-1', 'ENTERPRISE'); break;
      case 'reassignOwner':    promise = store.reassignOwner('a-1', 'user-2', 'ENTERPRISE'); break;
    }
    await expect(promise!).resolves.not.toThrow();
  });
});

// =============================================================================
// fetchActions
// =============================================================================

describe('fetchActions', () => {
  it('populates actions and summaries on success', async () => {
    const row = makeActionRow();
    const sumRow = makeSummaryRow();
    setResult('lat_actions',          'select', [row]);
    setResult('lat_action_summary_v', 'select', [sumRow]);

    await act(async () => {
      await useLeadershipActionStore.getState().fetchActions('org-1', 'ENTERPRISE');
    });

    const { actions, summaries } = useLeadershipActionStore.getState();
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('a-1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].actionCount).toBe(5);
  });

  it('propagates actionResult.error and sets error state', async () => {
    setResult('lat_actions',          'select', null, { message: 'actions DB error' });
    setResult('lat_action_summary_v', 'select', []);

    await expect(
      useLeadershipActionStore.getState().fetchActions('org-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'actions DB error' });

    expect(useLeadershipActionStore.getState().error).toBe('actions DB error');
    expect(useLeadershipActionStore.getState().isLoading).toBe(false);
  });

  it('propagates summaryResult.error when actions succeed', async () => {
    setResult('lat_actions',          'select', []);
    setResult('lat_action_summary_v', 'select', null, { message: 'summary DB error' });

    await expect(
      useLeadershipActionStore.getState().fetchActions('org-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'summary DB error' });

    expect(useLeadershipActionStore.getState().error).toBe('summary DB error');
  });

  it('tracks isLoading true then false via subscribe', async () => {
    setResult('lat_actions',          'select', []);
    setResult('lat_action_summary_v', 'select', []);

    const loadingStates: boolean[] = [];
    const unsub = useLeadershipActionStore.subscribe((s) =>
      loadingStates.push(s.isLoading),
    );

    await act(async () => {
      await useLeadershipActionStore.getState().fetchActions('org-1', 'ENTERPRISE');
    });
    unsub();

    expect(loadingStates).toContain(true);
    expect(loadingStates[loadingStates.length - 1]).toBe(false);
  });
});

// =============================================================================
// createAction
// =============================================================================

describe('createAction', () => {
  it('prepends new action to actions array', async () => {
    const existing = makeActionRow({ id: 'a-old', title: 'Old Action' });
    useLeadershipActionStore.setState({ actions: [existing] });
    setResult('lat_actions', 'insert', makeActionRow({ id: 'a-new', title: 'New Action' }));

    await act(async () => {
      await useLeadershipActionStore.getState().createAction(makeCreatePayload(), 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions).toHaveLength(2);
    expect(actions[0].id).toBe('a-new');
    expect(actions[1].id).toBe('a-old');
  });

  it('sets error on insert failure', async () => {
    setResult('lat_actions', 'insert', null, { message: 'insert failed' });

    await expect(
      useLeadershipActionStore.getState().createAction(makeCreatePayload(), 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'insert failed' });

    expect(useLeadershipActionStore.getState().error).toBe('insert failed');
  });
});

// =============================================================================
// updateAction
// =============================================================================

describe('updateAction', () => {
  it('updates action in-place by id', async () => {
    const row = makeActionRow({ id: 'a-1', title: 'Original' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', title: 'Updated Title' }));

    await act(async () => {
      await useLeadershipActionStore.getState().updateAction('a-1', { title: 'Updated Title' }, 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Updated Title');
  });

  it('sets error on update failure', async () => {
    setResult('lat_actions', 'update', null, { message: 'update failed' });

    await expect(
      useLeadershipActionStore.getState().updateAction('a-1', { title: 'x' }, 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'update failed' });

    expect(useLeadershipActionStore.getState().error).toBe('update failed');
  });
});

// =============================================================================
// deleteAction
// =============================================================================

describe('deleteAction', () => {
  it('removes action from actions array', async () => {
    const a1 = makeActionRow({ id: 'a-del' });
    const a2 = makeActionRow({ id: 'a-keep' });
    useLeadershipActionStore.setState({ actions: [a1, a2] });
    setResult('lat_actions', 'delete', null);

    await act(async () => {
      await useLeadershipActionStore.getState().deleteAction('a-del', 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('a-keep');
  });

  it('cascades to remove assignments and updates for deleted action', async () => {
    useLeadershipActionStore.setState({
      actions:     [makeActionRow({ id: 'a-del' })],
      assignments: [
        makeAssignmentRow({ id: 'asgn-1', action_id: 'a-del' }),
        makeAssignmentRow({ id: 'asgn-2', action_id: 'a-other' }),
      ],
      updates: [
        makeUpdateRow({ id: 'upd-1', action_id: 'a-del' }),
        makeUpdateRow({ id: 'upd-2', action_id: 'a-other' }),
      ],
    });
    setResult('lat_actions', 'delete', null);

    await act(async () => {
      await useLeadershipActionStore.getState().deleteAction('a-del', 'ENTERPRISE');
    });

    const { assignments, updates } = useLeadershipActionStore.getState();
    expect(assignments.every((a) => a.action_id !== 'a-del')).toBe(true);
    expect(updates.every((u) => u.action_id !== 'a-del')).toBe(true);
    expect(assignments).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it('resets selectedActionId when the selected action is deleted', async () => {
    useLeadershipActionStore.setState({
      actions:          [makeActionRow({ id: 'a-del' })],
      selectedActionId: 'a-del',
    });
    setResult('lat_actions', 'delete', null);

    await act(async () => {
      await useLeadershipActionStore.getState().deleteAction('a-del', 'ENTERPRISE');
    });

    expect(useLeadershipActionStore.getState().selectedActionId).toBeNull();
  });

  it('sets error on delete failure', async () => {
    setResult('lat_actions', 'delete', null, { message: 'delete failed' });

    await expect(
      useLeadershipActionStore.getState().deleteAction('a-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'delete failed' });

    expect(useLeadershipActionStore.getState().error).toBe('delete failed');
  });
});

// =============================================================================
// addAssignment
// =============================================================================

describe('addAssignment', () => {
  it('appends new assignment to assignments array', async () => {
    const existing = makeAssignmentRow({ id: 'asgn-old' });
    useLeadershipActionStore.setState({ assignments: [existing] });
    setResult('lat_action_assignments', 'insert', makeAssignmentRow({ id: 'asgn-new' }));

    await act(async () => {
      await useLeadershipActionStore.getState().addAssignment(makeAssignmentPayload(), 'ENTERPRISE');
    });

    const { assignments } = useLeadershipActionStore.getState();
    expect(assignments).toHaveLength(2);
    expect(assignments[1].id).toBe('asgn-new');
  });

  it('sets error on assignment insert failure', async () => {
    setResult('lat_action_assignments', 'insert', null, { message: 'assignment insert failed' });

    await expect(
      useLeadershipActionStore.getState().addAssignment(makeAssignmentPayload(), 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'assignment insert failed' });

    expect(useLeadershipActionStore.getState().error).toBe('assignment insert failed');
  });
});

// =============================================================================
// removeAssignment
// =============================================================================

describe('removeAssignment', () => {
  it('removes assignment by id', async () => {
    useLeadershipActionStore.setState({
      assignments: [
        makeAssignmentRow({ id: 'asgn-del' }),
        makeAssignmentRow({ id: 'asgn-keep' }),
      ],
    });
    setResult('lat_action_assignments', 'delete', null);

    await act(async () => {
      await useLeadershipActionStore.getState().removeAssignment('asgn-del', 'ENTERPRISE');
    });

    const { assignments } = useLeadershipActionStore.getState();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].id).toBe('asgn-keep');
  });

  it('sets error on assignment delete failure', async () => {
    setResult('lat_action_assignments', 'delete', null, { message: 'assignment delete failed' });

    await expect(
      useLeadershipActionStore.getState().removeAssignment('asgn-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'assignment delete failed' });

    expect(useLeadershipActionStore.getState().error).toBe('assignment delete failed');
  });
});

// =============================================================================
// postUpdate (append-only)
// =============================================================================

describe('postUpdate', () => {
  it('prepends new update to updates array (append-only, newest first)', async () => {
    const existing = makeUpdateRow({ id: 'upd-old', body: 'Old comment' });
    useLeadershipActionStore.setState({ updates: [existing] });
    setResult('lat_action_updates', 'insert', makeUpdateRow({ id: 'upd-new', body: 'New comment' }));

    await act(async () => {
      await useLeadershipActionStore.getState().postUpdate(makeUpdatePayload(), 'ENTERPRISE');
    });

    const { updates } = useLeadershipActionStore.getState();
    expect(updates).toHaveLength(2);
    expect(updates[0].id).toBe('upd-new');
    expect(updates[1].id).toBe('upd-old');
  });

  it('tracks isUpdateLoading true then false via subscribe', async () => {
    setResult('lat_action_updates', 'insert', makeUpdateRow());
    const loadingStates: boolean[] = [];
    const unsub = useLeadershipActionStore.subscribe((s) =>
      loadingStates.push(s.isUpdateLoading),
    );

    await act(async () => {
      await useLeadershipActionStore.getState().postUpdate(makeUpdatePayload(), 'ENTERPRISE');
    });
    unsub();

    expect(loadingStates).toContain(true);
    expect(loadingStates[loadingStates.length - 1]).toBe(false);
  });

  it('sets error and clears isUpdateLoading on insert failure', async () => {
    setResult('lat_action_updates', 'insert', null, { message: 'update insert failed' });

    await expect(
      useLeadershipActionStore.getState().postUpdate(makeUpdatePayload(), 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'update insert failed' });

    const { error, isUpdateLoading } = useLeadershipActionStore.getState();
    expect(error).toBe('update insert failed');
    expect(isUpdateLoading).toBe(false);
  });
});

// =============================================================================
// completeAction (optimistic + rollback)
// =============================================================================

describe('completeAction', () => {
  it('optimistically sets status to COMPLETED before DB call', async () => {
    const row = makeActionRow({ id: 'a-1', status: 'IN_PROGRESS' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', status: 'COMPLETED' }));

    const capturedStatuses: string[] = [];
    const unsub = useLeadershipActionStore.subscribe((s) => {
      const a = s.actions.find((x) => x.id === 'a-1');
      if (a) capturedStatuses.push(a.status);
    });

    await act(async () => {
      await useLeadershipActionStore.getState().completeAction('a-1', 'user-1', 'ENTERPRISE');
    });
    unsub();

    expect(capturedStatuses).toContain('COMPLETED');
  });

  it('rolls back to prevStatus on DB error', async () => {
    const row = makeActionRow({ id: 'a-1', status: 'IN_PROGRESS' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', null, { message: 'complete failed' });

    await expect(
      useLeadershipActionStore.getState().completeAction('a-1', 'user-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'complete failed' });

    const { actions, error } = useLeadershipActionStore.getState();
    const a = actions.find((x) => x.id === 'a-1');
    expect(a?.status).toBe('IN_PROGRESS');
    expect(error).toBe('complete failed');
  });

  it('leaves actions array unchanged after successful completion', async () => {
    const row = makeActionRow({ id: 'a-1', status: 'IN_PROGRESS' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', status: 'COMPLETED' }));

    await act(async () => {
      await useLeadershipActionStore.getState().completeAction('a-1', 'user-1', 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions).toHaveLength(1);
    // Status is COMPLETED after optimistic update
    expect(actions[0].status).toBe('COMPLETED');
  });
});

// =============================================================================
// cancelAction (optimistic + rollback)
// =============================================================================

describe('cancelAction', () => {
  it('optimistically sets status to CANCELLED before DB call', async () => {
    const row = makeActionRow({ id: 'a-1', status: 'OPEN' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', status: 'CANCELLED' }));

    const capturedStatuses: string[] = [];
    const unsub = useLeadershipActionStore.subscribe((s) => {
      const a = s.actions.find((x) => x.id === 'a-1');
      if (a) capturedStatuses.push(a.status);
    });

    await act(async () => {
      await useLeadershipActionStore.getState().cancelAction('a-1', 'ENTERPRISE');
    });
    unsub();

    expect(capturedStatuses).toContain('CANCELLED');
  });

  it('rolls back to prevStatus on DB error', async () => {
    const row = makeActionRow({ id: 'a-1', status: 'BLOCKED' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', null, { message: 'cancel failed' });

    await expect(
      useLeadershipActionStore.getState().cancelAction('a-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'cancel failed' });

    const { actions, error } = useLeadershipActionStore.getState();
    const a = actions.find((x) => x.id === 'a-1');
    expect(a?.status).toBe('BLOCKED');
    expect(error).toBe('cancel failed');
  });

  it('does not affect other actions during cancel', async () => {
    useLeadershipActionStore.setState({
      actions: [
        makeActionRow({ id: 'a-1', status: 'OPEN' }),
        makeActionRow({ id: 'a-2', status: 'IN_PROGRESS' }),
      ],
    });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', status: 'CANCELLED' }));

    await act(async () => {
      await useLeadershipActionStore.getState().cancelAction('a-1', 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions.find((a) => a.id === 'a-2')?.status).toBe('IN_PROGRESS');
  });
});

// =============================================================================
// reassignOwner
// =============================================================================

describe('reassignOwner', () => {
  it('updates owner_id in-place by action id', async () => {
    const row = makeActionRow({ id: 'a-1', owner_id: 'user-1' });
    useLeadershipActionStore.setState({ actions: [row] });
    setResult('lat_actions', 'update', makeActionRow({ id: 'a-1', owner_id: 'user-new' }));

    await act(async () => {
      await useLeadershipActionStore.getState().reassignOwner('a-1', 'user-new', 'ENTERPRISE');
    });

    const { actions } = useLeadershipActionStore.getState();
    expect(actions[0].owner_id).toBe('user-new');
  });

  it('sets error on reassign failure', async () => {
    setResult('lat_actions', 'update', null, { message: 'reassign failed' });

    await expect(
      useLeadershipActionStore.getState().reassignOwner('a-1', 'user-new', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'reassign failed' });

    expect(useLeadershipActionStore.getState().error).toBe('reassign failed');
  });
});

// =============================================================================
// UI helpers
// =============================================================================

describe('UI helpers', () => {
  it('selectAction sets selectedActionId', () => {
    useLeadershipActionStore.getState().selectAction('a-1');
    expect(useLeadershipActionStore.getState().selectedActionId).toBe('a-1');

    useLeadershipActionStore.getState().selectAction(null);
    expect(useLeadershipActionStore.getState().selectedActionId).toBeNull();
  });

  it('setFilters merges partial filters without clobbering existing fields', () => {
    useLeadershipActionStore.getState().setFilters({ status: 'OPEN' });
    const { filters } = useLeadershipActionStore.getState();
    expect(filters.status).toBe('OPEN');
    expect(filters.priority).toBe('ALL');
    expect(filters.category).toBe('ALL');
    expect(filters.ownerId).toBe('ALL');
  });

  it('clearError resets error to null', () => {
    useLeadershipActionStore.setState({ error: 'some error' });
    useLeadershipActionStore.getState().clearError();
    expect(useLeadershipActionStore.getState().error).toBeNull();
  });
});
