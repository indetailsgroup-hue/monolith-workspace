/**
 * src/leadership-actions/__tests__/LeadershipActionBoard.test.tsx
 *
 * MONOLITH v18.0 — Vitest component tests for <LeadershipActionBoard>
 *
 * Coverage (57 tests, 11 describe blocks):
 *  1. plan gate wall      — FREE/STARTER/PROFESSIONAL show gate; ENTERPRISE skips it
 *  2. loading state       — isLoading=true shows loader, hides board content
 *  3. mount effect        — fetchActions called on mount with orgId + orgPlan
 *  4. summary bar counts  — open/in-progress/blocked/completed derived from actions[]
 *  5. filter bar          — status / priority / category selects call setFilters
 *  6. new action form     — show/hide, submit → createAction, cancel, empty-field guard
 *  7. action list         — items, empty state, status/priority badges, click selectAction
 *  8. delete button       — visible for admin or owner; hidden otherwise; calls deleteAction
 *  9. detail panel        — no-selection, panel open, complete/cancel/reassign handlers
 * 10. updates section     — empty state, update rows, post-update form, submit guard
 * 11. error banner        — shown, dismissed via clearError
 *
 * Mock strategy (mirrors AiSchedulerBoard.test.tsx):
 *   vi.mock('../leadershipActionStore')
 *   vi.mocked(useLeadershipActionStore).mockReturnValue(makeStore() as any)
 *   fireEvent from @testing-library/react (no user-event installed)
 *   window.prompt mocked via vi.spyOn for reassign tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import React from 'react';

import LeadershipActionBoard from '../LeadershipActionBoard';
import { useLeadershipActionStore } from '../leadershipActionStore';
import type { LatAction, LatActionUpdate } from '../leadershipActionTypes';
import { DEFAULT_LAT_FILTERS } from '../leadershipActionTypes';
import type { OrgPlan } from '../../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mock the store
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../leadershipActionStore');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID   = 'org-th';
const USER_ID  = 'user-1';
const OWNER_ID = 'user-1';  // matches USER_ID so owner tests work

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<LatAction> = {}): LatAction {
  const id = overrides.id ?? 'action-1';
  return {
    id,
    org_id:       ORG_ID,
    title:        `Action ${id}`,
    description:  null,
    category:     'STRATEGY',
    priority:     'MEDIUM',
    status:       'OPEN',
    due_date:     null,
    owner_id:     OWNER_ID,
    reviewed_by:  null,
    completed_at: null,
    cancelled_at: null,
    created_by:   OWNER_ID,
    created_at:   '2027-02-27T00:00:00Z',
    updated_at:   '2027-02-27T00:00:00Z',
    createdAt:    '2027-02-27T00:00:00Z',
    updatedAt:    '2027-02-27T00:00:00Z',
    completedAt:  null,
    cancelledAt:  null,
    dueDate:      null,
    ...overrides,
  };
}

function makeUpdate(overrides: Partial<LatActionUpdate> = {}): LatActionUpdate {
  const id = overrides.id ?? 'upd-1';
  return {
    id,
    action_id:       'action-1',
    org_id:          ORG_ID,
    author_id:       USER_ID,
    body:            'Progress update note',
    previous_status: null,
    new_status:      null,
    created_at:      '2027-02-27T00:00:00Z',
    createdAt:       '2027-02-27T00:00:00Z',
    ...overrides,
  };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    actions:          [] as LatAction[],
    assignments:      [],
    updates:          [],
    summaries:        [],
    selectedActionId: null as string | null,
    isLoading:        false,
    isUpdateLoading:  false,
    filters:          { ...DEFAULT_LAT_FILTERS },
    error:            null as string | null,
    fetchActions:     vi.fn().mockResolvedValue(undefined),
    createAction:     vi.fn().mockResolvedValue(undefined),
    updateAction:     vi.fn().mockResolvedValue(undefined),
    deleteAction:     vi.fn().mockResolvedValue(undefined),
    addAssignment:    vi.fn().mockResolvedValue(undefined),
    removeAssignment: vi.fn().mockResolvedValue(undefined),
    postUpdate:       vi.fn().mockResolvedValue(undefined),
    completeAction:   vi.fn().mockResolvedValue(undefined),
    cancelAction:     vi.fn().mockResolvedValue(undefined),
    reassignOwner:    vi.fn().mockResolvedValue(undefined),
    selectAction:     vi.fn(),
    setFilters:       vi.fn(),
    clearError:       vi.fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render helper
// ─────────────────────────────────────────────────────────────────────────────

function renderBoard(
  orgPlan: OrgPlan = 'ENTERPRISE',
  storeOverrides: Record<string, unknown> = {},
  {
    userId  = USER_ID,
    isAdmin = false,
  }: { userId?: string; isAdmin?: boolean } = {},
) {
  const store = makeStore(storeOverrides);
  vi.mocked(useLeadershipActionStore).mockReturnValue(
    store as ReturnType<typeof useLeadershipActionStore>,
  );
  const result = render(
    <LeadershipActionBoard
      orgId={ORG_ID}
      orgPlan={orgPlan}
      userId={userId}
      isAdmin={isAdmin}
    />,
  );
  return { ...result, store };
}

// ─────────────────────────────────────────────────────────────────────────────
// beforeEach / afterEach
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(useLeadershipActionStore).mockReturnValue(
    makeStore() as ReturnType<typeof useLeadershipActionStore>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// 1. PLAN GATE WALL
// =============================================================================

describe('LeadershipActionBoard — plan gate wall', () => {
  it.each([
    ['FREE']          as const,
    ['STARTER']       as const,
    ['PROFESSIONAL']  as const,
  ])('%s plan → lat-plan-gate-wall present', (plan) => {
    const { getByTestId, queryByTestId } = renderBoard(plan);
    expect(getByTestId('lat-plan-gate-wall')).toBeInTheDocument();
    expect(queryByTestId('lat-summary-bar')).toBeNull();
  });

  it('ENTERPRISE plan → lat-plan-gate-wall absent', () => {
    const { queryByTestId, getByTestId } = renderBoard('ENTERPRISE');
    expect(queryByTestId('lat-plan-gate-wall')).toBeNull();
    expect(getByTestId('lat-summary-bar')).toBeInTheDocument();
  });

  it('gate wall shows ENTERPRISE badge text', () => {
    const { getByTestId } = renderBoard('FREE');
    expect(getByTestId('lat-plan-gate-wall').textContent).toContain('ENTERPRISE');
  });
});

// =============================================================================
// 2. LOADING STATE
// =============================================================================

describe('LeadershipActionBoard — loading state', () => {
  it('isLoading=true → lat-loading present', () => {
    const { getByTestId } = renderBoard('ENTERPRISE', { isLoading: true });
    expect(getByTestId('lat-loading')).toBeInTheDocument();
  });

  it('isLoading=true → lat-summary-bar absent', () => {
    const { queryByTestId } = renderBoard('ENTERPRISE', { isLoading: true });
    expect(queryByTestId('lat-summary-bar')).toBeNull();
  });

  it('isLoading=false → lat-loading absent', () => {
    const { queryByTestId } = renderBoard('ENTERPRISE', { isLoading: false });
    expect(queryByTestId('lat-loading')).toBeNull();
  });
});

// =============================================================================
// 3. MOUNT EFFECT — fetchActions called
// =============================================================================

describe('LeadershipActionBoard — mount effect', () => {
  it('calls fetchActions with orgId and orgPlan on mount', () => {
    const { store } = renderBoard('ENTERPRISE');
    expect(store.fetchActions).toHaveBeenCalledWith(ORG_ID, 'ENTERPRISE');
  });

  it('fetchActions called exactly once on initial mount', () => {
    const { store } = renderBoard('ENTERPRISE');
    expect(store.fetchActions).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// 4. SUMMARY BAR COUNTS
// =============================================================================

describe('LeadershipActionBoard — summary bar counts', () => {
  it('shows correct OPEN count from actions array', () => {
    const actions = [
      makeAction({ id: 'a1', status: 'OPEN' }),
      makeAction({ id: 'a2', status: 'OPEN' }),
      makeAction({ id: 'a3', status: 'OPEN' }),
    ];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    const bar = getByTestId('lat-summary-bar');
    expect(bar.textContent).toContain('3');
  });

  it('shows correct IN_PROGRESS count', () => {
    const actions = [
      makeAction({ id: 'a1', status: 'IN_PROGRESS' }),
      makeAction({ id: 'a2', status: 'IN_PROGRESS' }),
    ];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    const bar = getByTestId('lat-summary-bar');
    expect(bar.textContent).toContain('2');
  });

  it('shows correct BLOCKED count', () => {
    const actions = [makeAction({ id: 'a1', status: 'BLOCKED' })];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    const bar = getByTestId('lat-summary-bar');
    // blocked pill has value 1
    expect(within(bar).getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('all four distinct counts appear in summary bar', () => {
    const actions = [
      // OPEN x3, IN_PROGRESS x2, BLOCKED x1, COMPLETED x4
      makeAction({ id: 'o1', status: 'OPEN' }),
      makeAction({ id: 'o2', status: 'OPEN' }),
      makeAction({ id: 'o3', status: 'OPEN' }),
      makeAction({ id: 'p1', status: 'IN_PROGRESS' }),
      makeAction({ id: 'p2', status: 'IN_PROGRESS' }),
      makeAction({ id: 'b1', status: 'BLOCKED' }),
      makeAction({ id: 'c1', status: 'COMPLETED' }),
      makeAction({ id: 'c2', status: 'COMPLETED' }),
      makeAction({ id: 'c3', status: 'COMPLETED' }),
      makeAction({ id: 'c4', status: 'COMPLETED' }),
    ];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    const bar = getByTestId('lat-summary-bar');
    expect(bar.textContent).toContain('3');
    expect(bar.textContent).toContain('2');
    expect(bar.textContent).toContain('1');
    expect(bar.textContent).toContain('4');
  });
});

// =============================================================================
// 5. FILTER BAR
// =============================================================================

describe('LeadershipActionBoard — filter bar', () => {
  it('lat-filter-bar is rendered', () => {
    const { getByTestId } = renderBoard('ENTERPRISE');
    expect(getByTestId('lat-filter-bar')).toBeInTheDocument();
  });

  it('changing lat-filter-status calls setFilters with correct status', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.change(getByTestId('lat-filter-status'), {
      target: { value: 'IN_PROGRESS' },
    });
    expect(store.setFilters).toHaveBeenCalledWith({ status: 'IN_PROGRESS' });
  });

  it('changing lat-filter-priority calls setFilters with correct priority', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.change(getByTestId('lat-filter-priority'), {
      target: { value: 'CRITICAL' },
    });
    expect(store.setFilters).toHaveBeenCalledWith({ priority: 'CRITICAL' });
  });

  it('changing lat-filter-category calls setFilters with correct category', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.change(getByTestId('lat-filter-category'), {
      target: { value: 'QUALITY' },
    });
    expect(store.setFilters).toHaveBeenCalledWith({ category: 'QUALITY' });
  });
});

// =============================================================================
// 6. NEW ACTION FORM
// =============================================================================

describe('LeadershipActionBoard — new action form', () => {
  it('lat-new-action-form absent initially', () => {
    const { queryByTestId } = renderBoard('ENTERPRISE');
    expect(queryByTestId('lat-new-action-form')).toBeNull();
  });

  it('clicking lat-new-action-btn shows lat-new-action-form', () => {
    const { getByTestId } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    expect(getByTestId('lat-new-action-form')).toBeInTheDocument();
  });

  it('clicking lat-cancel-new-action-btn hides form', () => {
    const { getByTestId, queryByTestId } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    fireEvent.click(getByTestId('lat-cancel-new-action-btn'));
    expect(queryByTestId('lat-new-action-form')).toBeNull();
  });

  it('submitting with title + owner calls createAction', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    fireEvent.change(getByTestId('lat-action-title-input'), {
      target: { value: 'New Strategy Action' },
    });
    fireEvent.change(getByTestId('lat-action-owner-input'), {
      target: { value: 'user-mgr' },
    });
    fireEvent.click(getByTestId('lat-create-action-submit-btn'));
    expect(store.createAction).toHaveBeenCalledWith(
      { org_id: ORG_ID, title: 'New Strategy Action', owner_id: 'user-mgr' },
      'ENTERPRISE',
    );
  });

  it('submitting with empty title does NOT call createAction', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    fireEvent.change(getByTestId('lat-action-owner-input'), {
      target: { value: 'user-mgr' },
    });
    // title left empty
    fireEvent.click(getByTestId('lat-create-action-submit-btn'));
    expect(store.createAction).not.toHaveBeenCalled();
  });

  it('submitting with empty owner does NOT call createAction', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    fireEvent.change(getByTestId('lat-action-title-input'), {
      target: { value: 'Title Only' },
    });
    // owner left empty
    fireEvent.click(getByTestId('lat-create-action-submit-btn'));
    expect(store.createAction).not.toHaveBeenCalled();
  });

  it('form hides after successful submit', () => {
    const { getByTestId, queryByTestId } = renderBoard('ENTERPRISE');
    fireEvent.click(getByTestId('lat-new-action-btn'));
    fireEvent.change(getByTestId('lat-action-title-input'), {
      target: { value: 'My Action' },
    });
    fireEvent.change(getByTestId('lat-action-owner-input'), {
      target: { value: 'user-x' },
    });
    fireEvent.click(getByTestId('lat-create-action-submit-btn'));
    expect(queryByTestId('lat-new-action-form')).toBeNull();
  });
});

// =============================================================================
// 7. ACTION LIST
// =============================================================================

describe('LeadershipActionBoard — action list', () => {
  it('lat-action-list is rendered', () => {
    const { getByTestId } = renderBoard('ENTERPRISE');
    expect(getByTestId('lat-action-list')).toBeInTheDocument();
  });

  it('lat-action-empty shown when no actions', () => {
    const { getByTestId } = renderBoard('ENTERPRISE', { actions: [] });
    expect(getByTestId('lat-action-empty')).toBeInTheDocument();
  });

  it('lat-action-item-{id} rendered per action', () => {
    const actions = [
      makeAction({ id: 'a1' }),
      makeAction({ id: 'a2' }),
      makeAction({ id: 'a3' }),
    ];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    expect(getByTestId('lat-action-item-a1')).toBeInTheDocument();
    expect(getByTestId('lat-action-item-a2')).toBeInTheDocument();
    expect(getByTestId('lat-action-item-a3')).toBeInTheDocument();
  });

  it('status badge present with correct testid', () => {
    const actions = [makeAction({ id: 'a1', status: 'BLOCKED' })];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    expect(getByTestId('lat-status-badge-BLOCKED')).toBeInTheDocument();
  });

  it('priority badge present with correct testid', () => {
    const actions = [makeAction({ id: 'a1', priority: 'CRITICAL' })];
    const { getByTestId } = renderBoard('ENTERPRISE', { actions });
    expect(getByTestId('lat-priority-badge-CRITICAL')).toBeInTheDocument();
  });

  it('clicking action item calls selectAction with its id', () => {
    const actions = [makeAction({ id: 'a1' })];
    const { getByTestId, store } = renderBoard('ENTERPRISE', { actions });
    fireEvent.click(getByTestId('lat-action-item-a1'));
    expect(store.selectAction).toHaveBeenCalledWith('a1');
  });

  it('lat-action-empty absent when actions exist', () => {
    const { queryByTestId } = renderBoard('ENTERPRISE', {
      actions: [makeAction({ id: 'a1' })],
    });
    expect(queryByTestId('lat-action-empty')).toBeNull();
  });
});

// =============================================================================
// 8. DELETE BUTTON VISIBILITY
// =============================================================================

describe('LeadershipActionBoard — delete button', () => {
  it('delete button visible when isAdmin=true', () => {
    const actions = [makeAction({ id: 'a1', owner_id: 'other-user' })];
    const { getByTestId } = renderBoard(
      'ENTERPRISE',
      { actions },
      { userId: 'non-owner', isAdmin: true },
    );
    expect(getByTestId('lat-delete-action-a1')).toBeInTheDocument();
  });

  it('delete button visible when userId matches owner_id', () => {
    const actions = [makeAction({ id: 'a1', owner_id: USER_ID })];
    const { getByTestId } = renderBoard(
      'ENTERPRISE',
      { actions },
      { userId: USER_ID, isAdmin: false },
    );
    expect(getByTestId('lat-delete-action-a1')).toBeInTheDocument();
  });

  it('delete button absent for non-admin non-owner', () => {
    const actions = [makeAction({ id: 'a1', owner_id: 'someone-else' })];
    const { queryByTestId } = renderBoard(
      'ENTERPRISE',
      { actions },
      { userId: 'not-the-owner', isAdmin: false },
    );
    expect(queryByTestId('lat-delete-action-a1')).toBeNull();
  });

  it('clicking delete button calls deleteAction with id and orgPlan', () => {
    const actions = [makeAction({ id: 'a1', owner_id: USER_ID })];
    const { getByTestId, store } = renderBoard('ENTERPRISE', { actions });
    fireEvent.click(getByTestId('lat-delete-action-a1'));
    expect(store.deleteAction).toHaveBeenCalledWith('a1', 'ENTERPRISE');
  });
});

// =============================================================================
// 9. DETAIL PANEL — no-selection / complete / cancel / reassign
// =============================================================================

describe('LeadershipActionBoard — detail panel', () => {
  it('lat-no-selection shown when no action selected', () => {
    const { getByTestId, queryByTestId } = renderBoard('ENTERPRISE', {
      selectedActionId: null,
      actions: [makeAction({ id: 'a1' })],
    });
    expect(getByTestId('lat-no-selection')).toBeInTheDocument();
    expect(queryByTestId('lat-action-detail-panel')).toBeNull();
  });

  it('lat-action-detail-panel shown when action is selected', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId, queryByTestId } = renderBoard('ENTERPRISE', {
      actions: [action],
      selectedActionId: 'a1',
    });
    expect(getByTestId('lat-action-detail-panel')).toBeInTheDocument();
    expect(queryByTestId('lat-no-selection')).toBeNull();
  });

  it('lat-complete-btn calls completeAction with actionId and orgPlan', () => {
    const action = makeAction({ id: 'a1', status: 'OPEN' });
    const { getByTestId, store } = renderBoard(
      'ENTERPRISE',
      { actions: [action], selectedActionId: 'a1' },
      { userId: USER_ID },
    );
    fireEvent.click(getByTestId('lat-complete-btn'));
    expect(store.completeAction).toHaveBeenCalledWith('a1', USER_ID, 'ENTERPRISE');
  });

  it('lat-complete-btn disabled when action is COMPLETED', () => {
    const action = makeAction({ id: 'a1', status: 'COMPLETED' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action],
      selectedActionId: 'a1',
    });
    expect(getByTestId('lat-complete-btn')).toBeDisabled();
  });

  it('lat-cancel-action-btn calls cancelAction with actionId and orgPlan', () => {
    const action = makeAction({ id: 'a1', status: 'OPEN' });
    const { getByTestId, store } = renderBoard('ENTERPRISE', {
      actions: [action],
      selectedActionId: 'a1',
    });
    fireEvent.click(getByTestId('lat-cancel-action-btn'));
    expect(store.cancelAction).toHaveBeenCalledWith('a1', 'ENTERPRISE');
  });

  it('lat-cancel-action-btn disabled when action is CANCELLED', () => {
    const action = makeAction({ id: 'a1', status: 'CANCELLED' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action],
      selectedActionId: 'a1',
    });
    expect(getByTestId('lat-cancel-action-btn')).toBeDisabled();
  });

  it('lat-reassign-btn absent for non-admin', () => {
    const action = makeAction({ id: 'a1' });
    const { queryByTestId } = renderBoard(
      'ENTERPRISE',
      { actions: [action], selectedActionId: 'a1' },
      { isAdmin: false },
    );
    expect(queryByTestId('lat-reassign-btn')).toBeNull();
  });

  it('lat-reassign-btn present for isAdmin=true', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard(
      'ENTERPRISE',
      { actions: [action], selectedActionId: 'a1' },
      { isAdmin: true },
    );
    expect(getByTestId('lat-reassign-btn')).toBeInTheDocument();
  });

  it('clicking reassign-btn calls window.prompt and then reassignOwner', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('new-owner-xyz');
    const action = makeAction({ id: 'a1' });
    const { getByTestId, store } = renderBoard(
      'ENTERPRISE',
      { actions: [action], selectedActionId: 'a1' },
      { isAdmin: true },
    );
    fireEvent.click(getByTestId('lat-reassign-btn'));
    expect(window.prompt).toHaveBeenCalled();
    expect(store.reassignOwner).toHaveBeenCalledWith('a1', 'new-owner-xyz', 'ENTERPRISE');
  });

  it('reassignOwner NOT called when prompt returns null', () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const action = makeAction({ id: 'a1' });
    const { getByTestId, store } = renderBoard(
      'ENTERPRISE',
      { actions: [action], selectedActionId: 'a1' },
      { isAdmin: true },
    );
    fireEvent.click(getByTestId('lat-reassign-btn'));
    expect(store.reassignOwner).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 10. UPDATES SECTION
// =============================================================================

describe('LeadershipActionBoard — updates section', () => {
  it('lat-updates-empty shown when no updates for selected action', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action],
      selectedActionId: 'a1',
      updates: [],
    });
    expect(getByTestId('lat-updates-empty')).toBeInTheDocument();
  });

  it('lat-update-row-{id} rendered for each update', () => {
    const action  = makeAction({ id: 'a1' });
    const update1 = makeUpdate({ id: 'upd-1', action_id: 'a1' });
    const update2 = makeUpdate({ id: 'upd-2', action_id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions:          [action],
      selectedActionId: 'a1',
      updates:          [update1, update2],
    });
    expect(getByTestId('lat-update-row-upd-1')).toBeInTheDocument();
    expect(getByTestId('lat-update-row-upd-2')).toBeInTheDocument();
  });

  it('updates from other actions are not shown in current panel', () => {
    const action   = makeAction({ id: 'a1' });
    const otherUpd = makeUpdate({ id: 'upd-other', action_id: 'a2' });
    const { queryByTestId } = renderBoard('ENTERPRISE', {
      actions:          [action],
      selectedActionId: 'a1',
      updates:          [otherUpd],
    });
    expect(queryByTestId('lat-update-row-upd-other')).toBeNull();
    expect(queryByTestId('lat-updates-empty')).toBeInTheDocument();
  });

  it('lat-post-update-form is rendered in detail panel', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action], selectedActionId: 'a1',
    });
    expect(getByTestId('lat-post-update-form')).toBeInTheDocument();
  });

  it('lat-post-update-submit-btn disabled when update body is empty', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action], selectedActionId: 'a1',
    });
    expect(getByTestId('lat-post-update-submit-btn')).toBeDisabled();
  });

  it('lat-post-update-submit-btn enabled after typing in body', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action], selectedActionId: 'a1',
    });
    fireEvent.change(getByTestId('lat-update-body-input'), {
      target: { value: 'Some progress update' },
    });
    expect(getByTestId('lat-post-update-submit-btn')).not.toBeDisabled();
  });

  it('clicking submit calls postUpdate with correct payload', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId, store } = renderBoard('ENTERPRISE', {
      actions: [action], selectedActionId: 'a1',
    });
    fireEvent.change(getByTestId('lat-update-body-input'), {
      target: { value: 'Progress note' },
    });
    fireEvent.click(getByTestId('lat-post-update-submit-btn'));
    expect(store.postUpdate).toHaveBeenCalledWith(
      { action_id: 'a1', org_id: ORG_ID, body: 'Progress note' },
      'ENTERPRISE',
    );
  });

  it('isUpdateLoading=true disables post-update submit btn', () => {
    const action = makeAction({ id: 'a1' });
    const { getByTestId } = renderBoard('ENTERPRISE', {
      actions: [action], selectedActionId: 'a1', isUpdateLoading: true,
    });
    fireEvent.change(getByTestId('lat-update-body-input'), {
      target: { value: 'Some text' },
    });
    expect(getByTestId('lat-post-update-submit-btn')).toBeDisabled();
  });
});

// =============================================================================
// 11. ERROR BANNER
// =============================================================================

describe('LeadershipActionBoard — error banner', () => {
  it('lat-error-banner absent when error is null', () => {
    const { queryByTestId } = renderBoard('ENTERPRISE', { error: null });
    expect(queryByTestId('lat-error-banner')).toBeNull();
  });

  it('lat-error-banner present when error is set', () => {
    const { getByTestId } = renderBoard('ENTERPRISE', {
      error: 'เชื่อมต่อฐานข้อมูลล้มเหลว',
    });
    expect(getByTestId('lat-error-banner')).toBeInTheDocument();
  });

  it('error banner shows the error message text', () => {
    const { getByTestId } = renderBoard('ENTERPRISE', {
      error: 'เชื่อมต่อฐานข้อมูลล้มเหลว',
    });
    expect(getByTestId('lat-error-banner').textContent).toContain(
      'เชื่อมต่อฐานข้อมูลล้มเหลว',
    );
  });

  it('clicking lat-clear-error-btn calls clearError', () => {
    const { getByTestId, store } = renderBoard('ENTERPRISE', {
      error: 'some error',
    });
    fireEvent.click(getByTestId('lat-clear-error-btn'));
    expect(store.clearError).toHaveBeenCalledTimes(1);
  });
});
