/**
 * src/leadership-actions/LeadershipActionBoard.stories.tsx
 *
 * MONOLITH v18.5 — Storybook CSF3 stories for LeadershipActionBoard
 *
 * 15 stories:
 *   PlanGateWall              — PROFESSIONAL plan → lat-plan-gate-wall
 *   PlanGateWallFree          — FREE plan → lat-plan-gate-wall
 *   LoadingState              — isLoading: true → lat-loading
 *   EmptyList                 — no actions → lat-action-empty
 *   WithActions               — mixed statuses/priorities list
 *   ActionSelected            — selectedActionId set, no updates
 *   AdminView                 — isAdmin: true, delete + reassign visible
 *   DetailPanelWithUpdates    — selectedActionId + two updates
 *   BlockedCriticalAction     — BLOCKED/CRITICAL action selected
 *   ErrorBanner               — error state → lat-error-banner
 *   FilterBarInteraction      — play: change status filter → list narrows
 *   NewActionFormInteraction  — play: open form, fill, submit → spy called
 *   CompleteInteraction       — play: click complete → spy called
 *   CancelActionInteraction   — play: click cancel → spy called
 *   PostUpdateInteraction     — play: type update, submit → spy called
 *
 * Mock strategy:
 *   withLeadershipActionStore decorator calls useLeadershipActionStore.setState(…)
 *   to seed state + replace async actions with spies.
 *   fetchActions always replaced with noopAsync to prevent Supabase calls.
 *   All mutating action spies use explicit async implementations so that the
 *   component's .catch(() => {}) chain does not throw on undefined returns.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import LeadershipActionBoard from './LeadershipActionBoard';
import { useLeadershipActionStore } from './leadershipActionStore';
import type { LatAction, LatActionUpdate } from './leadershipActionTypes';
import { DEFAULT_LAT_FILTERS } from './leadershipActionTypes';

// =============================================================================
// Module-level spies
// All async mutating actions use explicit async implementations so component
// .catch() chains work correctly in the Storybook browser environment.
// =============================================================================

const createActionSpy     = fn(async () => undefined);
const deleteActionSpy     = fn(async () => undefined);
const updateActionSpy     = fn(async () => undefined);
const addAssignmentSpy    = fn(async () => undefined);
const removeAssignmentSpy = fn(async () => undefined);
const postUpdateSpy       = fn(async () => undefined);
const completeActionSpy   = fn(async () => undefined);
const cancelActionSpy     = fn(async () => undefined);
const reassignOwnerSpy    = fn(async () => undefined);

// =============================================================================
// Sample data helpers
// =============================================================================

function makeAction(overrides: Partial<LatAction>): LatAction {
  const id  = overrides.id ?? 'action-1';
  const now = '2027-02-27T09:00:00Z';
  return {
    id,
    org_id:       'org-th',
    title:        'ปรับปรุงกระบวนการผลิต',
    description:  'ลดของเสียในไลน์ผลิตภัณฑ์หลัก',
    category:     'OPERATIONS',
    priority:     'MEDIUM',
    status:       'OPEN',
    due_date:     '2027-03-31',
    owner_id:     'user-owner',
    reviewed_by:  null,
    completed_at: null,
    cancelled_at: null,
    created_by:   'user-admin',
    created_at:   now,
    updated_at:   now,
    createdAt:    now,
    updatedAt:    now,
    completedAt:  null,
    cancelledAt:  null,
    dueDate:      '2027-03-31',
    ...overrides,
  };
}

function makeUpdate(overrides: Partial<LatActionUpdate>): LatActionUpdate {
  const id  = overrides.id ?? 'update-1';
  const now = '2027-02-27T10:00:00Z';
  return {
    id,
    action_id:       overrides.action_id ?? 'action-selected',
    org_id:          'org-th',
    author_id:       'user-admin',
    body:            'ดำเนินการตามแผน — ลดของเสียได้ 20%',
    previous_status: null,
    new_status:      null,
    created_at:      now,
    createdAt:       now,
    ...overrides,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTION_OPEN = makeAction({
  id:       'action-open',
  status:   'OPEN',
  priority: 'HIGH',
  title:    'ปรับปรุงระบบควบคุมคุณภาพ',
  category: 'QUALITY',
});

const ACTION_IN_PROGRESS = makeAction({
  id:       'action-inprog',
  status:   'IN_PROGRESS',
  priority: 'MEDIUM',
  title:    'ฝึกอบรมพนักงานใหม่',
  category: 'PEOPLE',
});

const ACTION_BLOCKED = makeAction({
  id:       'action-blocked',
  status:   'BLOCKED',
  priority: 'CRITICAL',
  title:    'แก้ไขปัญหาอุปกรณ์ขัดข้อง',
  category: 'SAFETY',
});

const ACTION_COMPLETED = makeAction({
  id:           'action-completed',
  status:       'COMPLETED',
  priority:     'LOW',
  title:        'อัปเดตนโยบายความปลอดภัย',
  completed_at: '2027-02-20T08:00:00Z',
  completedAt:  '2027-02-20T08:00:00Z',
});

const ACTION_SELECTED = makeAction({
  id:          'action-selected',
  status:      'IN_PROGRESS',
  priority:    'HIGH',
  title:       'ทบทวนเป้าหมายรายไตรมาส',
  description: 'ตรวจสอบผลการดำเนินงาน Q1 และปรับเป้าหมาย Q2',
  category:    'STRATEGY',
  owner_id:    'user-owner',
});

const ACTION_BLOCKED_CRIT = makeAction({
  id:       'action-bc',
  status:   'BLOCKED',
  priority: 'CRITICAL',
  title:    'หยุดไลน์ผลิต — รอชิ้นส่วน',
  category: 'OPERATIONS',
  owner_id: 'user-owner',
});

const SAMPLE_ACTIONS: LatAction[] = [
  ACTION_OPEN,
  ACTION_IN_PROGRESS,
  ACTION_BLOCKED,
  ACTION_COMPLETED,
];

const UPDATE_1 = makeUpdate({
  id:        'upd-1',
  action_id: 'action-selected',
  body:      'ทีมประชุมแล้ว — ตั้งเป้าลดต้นทุน 15%',
});

const UPDATE_2 = makeUpdate({
  id:         'upd-2',
  action_id:  'action-selected',
  body:       'รายงานกลางเดือน: คืบหน้า 60%',
  created_at: '2027-02-27T14:00:00Z',
  createdAt:  '2027-02-27T14:00:00Z',
});

// =============================================================================
// Decorator factory
// =============================================================================

const noopAsync = async () => {};

function withLeadershipActionStore(
  stateOverride: Partial<ReturnType<typeof useLeadershipActionStore.getState>>,
) {
  return (Story: StoryFn) => {
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
      // no-op fetch to prevent Supabase calls on mount
      fetchActions:       noopAsync,
      createAction:       createActionSpy,
      updateAction:       updateActionSpy,
      deleteAction:       deleteActionSpy,
      addAssignment:      addAssignmentSpy,
      removeAssignment:   removeAssignmentSpy,
      postUpdate:         postUpdateSpy,
      completeAction:     completeActionSpy,
      cancelAction:       cancelActionSpy,
      reassignOwner:      reassignOwnerSpy,
      selectAction: (id) => useLeadershipActionStore.setState({ selectedActionId: id }),
      setFilters:   (f)  =>
        useLeadershipActionStore.setState((s) => ({ filters: { ...s.filters, ...f } })),
      clearError:   ()   => useLeadershipActionStore.setState({ error: null }),
      ...stateOverride,
    });
    // Reset spy call history; async implementations are preserved
    createActionSpy.mockClear();
    deleteActionSpy.mockClear();
    completeActionSpy.mockClear();
    cancelActionSpy.mockClear();
    reassignOwnerSpy.mockClear();
    postUpdateSpy.mockClear();
    return <Story />;
  };
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof LeadershipActionBoard> = {
  title:      'Modules/LeadershipActions/LeadershipActionBoard',
  component:  LeadershipActionBoard,
  parameters: { layout: 'fullscreen' },
  args: {
    orgId:   'org-th',
    orgPlan: 'ENTERPRISE',
    userId:  'user-owner',
    isAdmin: false,
  },
};
export default meta;
type Story = StoryObj<typeof LeadershipActionBoard>;

// =============================================================================
// Stories
// =============================================================================

// ─── 1. Plan Gate Wall — PROFESSIONAL ────────────────────────────────────────

export const PlanGateWall: Story = {
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withLeadershipActionStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-summary-bar')).not.toBeInTheDocument();
  },
};

// ─── 2. Plan Gate Wall — FREE ─────────────────────────────────────────────────

export const PlanGateWallFree: Story = {
  args: { orgPlan: 'FREE' },
  decorators: [withLeadershipActionStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-filter-bar')).not.toBeInTheDocument();
  },
};

// ─── 3. Loading State ─────────────────────────────────────────────────────────

export const LoadingState: Story = {
  decorators: [withLeadershipActionStore({ isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-summary-bar')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-filter-bar')).not.toBeInTheDocument();
  },
};

// ─── 4. Empty List ────────────────────────────────────────────────────────────

export const EmptyList: Story = {
  decorators: [withLeadershipActionStore({ actions: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-summary-bar')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-filter-bar')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-action-empty')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-no-selection')).toBeInTheDocument();
  },
};

// ─── 5. With Actions ─────────────────────────────────────────────────────────

export const WithActions: Story = {
  decorators: [withLeadershipActionStore({ actions: SAMPLE_ACTIONS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-action-item-action-open')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-action-item-action-inprog')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-action-item-action-blocked')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-action-item-action-completed')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-status-badge-OPEN')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-status-badge-BLOCKED')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-priority-badge-CRITICAL')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-no-selection')).toBeInTheDocument();
  },
};

// ─── 6. Action Selected ───────────────────────────────────────────────────────

export const ActionSelected: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_SELECTED, ACTION_OPEN],
      selectedActionId: 'action-selected',
      updates:          [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-action-detail-panel')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-updates-empty')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-complete-btn')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-cancel-action-btn')).toBeInTheDocument();
    // Not admin — no reassign button
    await expect(canvas.queryByTestId('lat-reassign-btn')).not.toBeInTheDocument();
  },
};

// ─── 7. Admin View ────────────────────────────────────────────────────────────

export const AdminView: Story = {
  args: { isAdmin: true },
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_OPEN, ACTION_IN_PROGRESS, ACTION_BLOCKED],
      selectedActionId: 'action-open',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Admin sees delete buttons for every action (not just owned ones)
    await expect(canvas.getByTestId('lat-delete-action-action-open')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-delete-action-action-inprog')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-delete-action-action-blocked')).toBeInTheDocument();
    // Reassign button visible in detail panel for admin
    await expect(canvas.getByTestId('lat-reassign-btn')).toBeInTheDocument();
  },
};

// ─── 8. Detail Panel With Updates ─────────────────────────────────────────────

export const DetailPanelWithUpdates: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_SELECTED, ACTION_OPEN],
      selectedActionId: 'action-selected',
      updates:          [UPDATE_1, UPDATE_2],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-updates-section')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-update-row-upd-1')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-update-row-upd-2')).toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-updates-empty')).not.toBeInTheDocument();
  },
};

// ─── 9. Blocked Critical Action ───────────────────────────────────────────────

export const BlockedCriticalAction: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_BLOCKED_CRIT, ACTION_OPEN],
      selectedActionId: 'action-bc',
      updates:          [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-status-badge-BLOCKED')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-priority-badge-CRITICAL')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-action-detail-panel')).toBeInTheDocument();
    // Complete + cancel buttons are enabled for BLOCKED status
    await expect(canvas.getByTestId('lat-complete-btn')).not.toBeDisabled();
    await expect(canvas.getByTestId('lat-cancel-action-btn')).not.toBeDisabled();
  },
};

// ─── 10. Error Banner ─────────────────────────────────────────────────────────

export const ErrorBanner: Story = {
  decorators: [
    withLeadershipActionStore({
      actions: SAMPLE_ACTIONS,
      error:   'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('lat-error-banner')).toBeInTheDocument();
    await expect(canvas.getByTestId('lat-clear-error-btn')).toBeInTheDocument();
  },
};

// ─── 11. Filter Bar Interaction ───────────────────────────────────────────────

export const FilterBarInteraction: Story = {
  decorators: [withLeadershipActionStore({ actions: SAMPLE_ACTIONS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initial: all 4 actions visible
    await expect(canvas.getByTestId('lat-action-item-action-open')).toBeInTheDocument();

    // Filter to BLOCKED only
    const statusSelect = canvas.getByTestId('lat-filter-status');
    await userEvent.selectOptions(statusSelect, 'BLOCKED');
    await expect(statusSelect).toHaveValue('BLOCKED');

    // Only blocked action remains
    await expect(canvas.getByTestId('lat-action-item-action-blocked')).toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-action-item-action-open')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('lat-action-item-action-inprog')).not.toBeInTheDocument();
  },
};

// ─── 12. New Action Form Interaction ──────────────────────────────────────────

export const NewActionFormInteraction: Story = {
  decorators: [withLeadershipActionStore({ actions: SAMPLE_ACTIONS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Open new-action form
    await userEvent.click(canvas.getByTestId('lat-new-action-btn'));
    await expect(canvas.getByTestId('lat-new-action-form')).toBeInTheDocument();

    // Fill title + owner
    await userEvent.type(canvas.getByTestId('lat-action-title-input'), 'Action ทดสอบ Sprint 8');
    await userEvent.type(canvas.getByTestId('lat-action-owner-input'), 'user-test');

    // Submit
    await userEvent.click(canvas.getByTestId('lat-create-action-submit-btn'));
    await expect(createActionSpy).toHaveBeenCalledOnce();
  },
};

// ─── 13. Complete Interaction ─────────────────────────────────────────────────

export const CompleteInteraction: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_SELECTED, ACTION_OPEN],
      selectedActionId: 'action-selected',
      updates:          [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const completeBtn = canvas.getByTestId('lat-complete-btn');
    await expect(completeBtn).not.toBeDisabled();
    await userEvent.click(completeBtn);
    await expect(completeActionSpy).toHaveBeenCalledOnce();
  },
};

// ─── 14. Cancel Action Interaction ────────────────────────────────────────────

export const CancelActionInteraction: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_SELECTED, ACTION_OPEN],
      selectedActionId: 'action-selected',
      updates:          [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cancelBtn = canvas.getByTestId('lat-cancel-action-btn');
    await expect(cancelBtn).not.toBeDisabled();
    await userEvent.click(cancelBtn);
    await expect(cancelActionSpy).toHaveBeenCalledOnce();
    await expect(cancelActionSpy).toHaveBeenCalledWith('action-selected', 'ENTERPRISE');
  },
};

// ─── 15. Post Update Interaction ──────────────────────────────────────────────

export const PostUpdateInteraction: Story = {
  decorators: [
    withLeadershipActionStore({
      actions:          [ACTION_SELECTED],
      selectedActionId: 'action-selected',
      updates:          [],
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const textarea  = canvas.getByTestId('lat-update-body-input');
    const submitBtn = canvas.getByTestId('lat-post-update-submit-btn');

    // Submit is disabled while textarea is empty
    await expect(submitBtn).toBeDisabled();

    // Type update body
    await userEvent.type(textarea, 'ความคืบหน้าล่าสุด: เสร็จ 75%');
    await expect(submitBtn).not.toBeDisabled();

    // Submit
    await userEvent.click(submitBtn);
    await expect(postUpdateSpy).toHaveBeenCalledOnce();
    await expect(postUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action_id: 'action-selected', org_id: 'org-th' }),
      'ENTERPRISE',
    );
  },
};
