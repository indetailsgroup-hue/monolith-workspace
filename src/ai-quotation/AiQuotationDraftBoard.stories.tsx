/**
 * src/ai-quotation/AiQuotationDraftBoard.stories.tsx
 *
 * MONOLITH v18.0 — Storybook CSF3 stories for AiQuotationDraftBoard
 *
 * 17 stories:
 *   PlanGateWall                — FREE plan → aqd-plan-gate-wall, board absent
 *   PlanGateWallProfessional    — PROFESSIONAL plan → aqd-plan-gate-wall
 *   LoadingState                — ENTERPRISE + isLoading → aqd-loading
 *   EmptyDrafts                 — ENTERPRISE + no drafts → aqd-draft-empty
 *   WithDrafts                  — 3 drafts (DRAFT/PENDING_REVIEW/APPROVED) + ai-badge
 *   DraftSelected               — pre-selected draft → detail panel + line items
 *   ApprovedDraft               — APPROVED status → aqd-approved-label
 *   RejectedDraft               — REJECTED status → aqd-rejected-label
 *   AdminPendingReview          — isAdmin + PENDING_REVIEW → approve/reject buttons
 *   ApproveInteraction          — play: click approve → approveDraft spy called
 *   SubmitForReviewInteraction  — play: click submit-review → submitForReview spy called
 *   DeleteDraftInteraction      — play: click delete → deleteDraft spy called
 *   NewDraftFormInteraction     — play: click new-draft-btn → form appears
 *   ErrorBanner                 — error state → banner visible; clear clears it
 *   GenerationLogPanel          — AI-generated draft selected → panel rendered
 *   SummaryBar                  — summaries present → aqd-summary-bar visible
 *   FilterBar                   — aqd-filter-bar + selects present
 *
 * Mock strategy:
 *   withAiQuotationDraftStore decorator calls useAiQuotationDraftStore.setState(…)
 *   to seed state and replace async actions with spies before each story.
 *   fetchDrafts is always replaced with a no-op so useEffect never hits Supabase.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import AiQuotationDraftBoard from './AiQuotationDraftBoard';
import { useAiQuotationDraftStore } from './aiQuotationDraftStore';
import type {
  AiQuotationDraft,
  AiQuotationLineItem,
  AiQuotationDraftSummary,
} from './aiQuotationDraftTypes';
import { DEFAULT_AQD_FILTERS } from './aiQuotationDraftTypes';

// =============================================================================
// Module-level spies (cleared per story in the decorator)
// =============================================================================

const createDraftSpy    = fn();
const updateDraftSpy    = fn();
const deleteDraftSpy    = fn();
const submitReviewSpy   = fn();
const approveDraftSpy   = fn();
const rejectDraftSpy    = fn();
const addLineItemSpy    = fn();
const updateLineItemSpy = fn();
const removeLineItemSpy = fn();

// =============================================================================
// Sample data helpers
// =============================================================================

function makeDraft(overrides: Partial<AiQuotationDraft>): AiQuotationDraft {
  const id = overrides.id ?? 'draft-1';
  return {
    id,
    org_id:          'org-th',
    title:           'Quotation Draft',
    customer_name:   'DAPH Decor Co., Ltd.',
    customer_email:  'purchase@daph.co.th',
    status:          'DRAFT',
    subtotal_thb:    10000,
    tax_rate:        0.07,
    tax_amount_thb:  700,
    total_thb:       10700,
    notes:           null,
    generated_by_ai: false,
    ai_prompt:       null,
    created_by:      'user-mgr',
    reviewed_by:     null,
    reviewed_at:     null,
    created_at:      '2027-02-20T09:00:00Z',
    updated_at:      '2027-02-20T09:00:00Z',
    createdAt:       '2027-02-20T09:00:00Z',
    updatedAt:       '2027-02-20T09:00:00Z',
    reviewedAt:      null,
    ...overrides,
  };
}

function makeLineItem(overrides: Partial<AiQuotationLineItem>): AiQuotationLineItem {
  const id = overrides.id ?? 'li-1';
  return {
    id,
    draft_id:       overrides.draft_id ?? 'draft-a',
    org_id:         'org-th',
    item_type:      'PRODUCT',
    description:    'Steel Panel 4mm',
    quantity:       10,
    unit_price_thb: 500,
    line_total_thb: 5000,
    sort_order:     1,
    notes:          null,
    created_at:     '2027-02-20T09:00:00Z',
    updated_at:     '2027-02-20T09:00:00Z',
    createdAt:      '2027-02-20T09:00:00Z',
    updatedAt:      '2027-02-20T09:00:00Z',
    ...overrides,
  };
}

// ─── Draft fixtures ──────────────────────────────────────────────────────────

const DRAFT_A = makeDraft({
  id: 'draft-a', title: 'Quotation A – DRAFT', status: 'DRAFT',
});
const DRAFT_B = makeDraft({
  id: 'draft-b', title: 'Quotation B – PENDING', status: 'PENDING_REVIEW',
  generated_by_ai: true, ai_prompt: 'สร้างใบเสนอราคาอัตโนมัติ',
});
const DRAFT_C = makeDraft({
  id: 'draft-c', title: 'Quotation C – APPROVED', status: 'APPROVED',
  reviewed_by: 'user-admin', reviewed_at: '2027-02-21T10:00:00Z', reviewedAt: '2027-02-21T10:00:00Z',
});
const DRAFT_D = makeDraft({
  id: 'draft-d', title: 'Quotation D – REJECTED', status: 'REJECTED',
  reviewed_by: 'user-admin', reviewed_at: '2027-02-21T11:00:00Z', reviewedAt: '2027-02-21T11:00:00Z',
});

const LINE_ITEMS_A: AiQuotationLineItem[] = [
  makeLineItem({ id: 'li-a1', draft_id: 'draft-a', description: 'Steel Panel 4mm',  quantity: 10, unit_price_thb: 500,  line_total_thb: 5000, sort_order: 1 }),
  makeLineItem({ id: 'li-a2', draft_id: 'draft-a', description: 'Aluminium Frame',  quantity: 5,  unit_price_thb: 1000, line_total_thb: 5000, sort_order: 2 }),
];

const SUMMARIES: AiQuotationDraftSummary[] = [
  { orgId: 'org-th', status: 'DRAFT',          draftCount: 1, totalValueThb: 10700 },
  { orgId: 'org-th', status: 'PENDING_REVIEW', draftCount: 1, totalValueThb: 10700 },
  { orgId: 'org-th', status: 'APPROVED',       draftCount: 1, totalValueThb: 10700 },
  { orgId: 'org-th', status: 'REJECTED',       draftCount: 1, totalValueThb: 10700 },
];

// =============================================================================
// Decorator factory
// =============================================================================

const noopAsync = async () => {};

function withAiQuotationDraftStore(
  stateOverride: Partial<ReturnType<typeof useAiQuotationDraftStore.getState>>,
) {
  return (Story: StoryFn) => {
    useAiQuotationDraftStore.setState({
      drafts:            [],
      summaries:         [],
      lineItems:         [],
      selectedDraftId:   null,
      isLoading:         false,
      isLineItemLoading: false,
      filters:           DEFAULT_AQD_FILTERS,
      error:             null,
      // always no-op fetchDrafts so useEffect never calls Supabase
      fetchDrafts:     noopAsync,
      createDraft:     createDraftSpy,
      updateDraft:     updateDraftSpy,
      deleteDraft:     deleteDraftSpy,
      addLineItem:     addLineItemSpy,
      updateLineItem:  updateLineItemSpy,
      removeLineItem:  removeLineItemSpy,
      submitForReview: submitReviewSpy,
      approveDraft:    approveDraftSpy,
      rejectDraft:     rejectDraftSpy,
      selectDraft:   (id) => useAiQuotationDraftStore.setState({ selectedDraftId: id }),
      setFilters:    (f)  => useAiQuotationDraftStore.setState((s) => ({ filters: { ...s.filters, ...f } })),
      clearError:    ()   => useAiQuotationDraftStore.setState({ error: null }),
      ...stateOverride,
    });
    // Reset spies before every story render
    createDraftSpy.mockClear();
    updateDraftSpy.mockClear();
    deleteDraftSpy.mockClear();
    submitReviewSpy.mockClear();
    approveDraftSpy.mockClear();
    rejectDraftSpy.mockClear();
    addLineItemSpy.mockClear();
    removeLineItemSpy.mockClear();
    return <Story />;
  };
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof AiQuotationDraftBoard> = {
  title:     'Modules/AiQuotationDraft/AiQuotationDraftBoard',
  component: AiQuotationDraftBoard,
  parameters: { layout: 'fullscreen' },
  args: {
    orgId:   'org-th',
    orgPlan: 'ENTERPRISE',
    userId:  'user-mgr',
    isAdmin: false,
  },
};
export default meta;
type Story = StoryObj<typeof AiQuotationDraftBoard>;

// =============================================================================
// Stories
// =============================================================================

// ─── 1. Plan Gate Wall — FREE ─────────────────────────────────────────────────

export const PlanGateWall: Story = {
  args: { orgPlan: 'FREE' },
  decorators: [withAiQuotationDraftStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-board')).not.toBeInTheDocument();
  },
};

// ─── 2. Plan Gate Wall — PROFESSIONAL ────────────────────────────────────────

export const PlanGateWallProfessional: Story = {
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withAiQuotationDraftStore({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-board')).not.toBeInTheDocument();
  },
};

// ─── 3. Loading State ─────────────────────────────────────────────────────────

export const LoadingState: Story = {
  decorators: [withAiQuotationDraftStore({ isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-draft-list')).not.toBeInTheDocument();
  },
};

// ─── 4. Empty Drafts ──────────────────────────────────────────────────────────

export const EmptyDrafts: Story = {
  decorators: [withAiQuotationDraftStore({ drafts: [], summaries: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-board')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-draft-empty')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-draft-list')).toBeInTheDocument();
  },
};

// ─── 5. Draft List ────────────────────────────────────────────────────────────

export const WithDrafts: Story = {
  decorators: [
    withAiQuotationDraftStore({ drafts: [DRAFT_A, DRAFT_B, DRAFT_C], summaries: SUMMARIES }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-draft-list')).toBeInTheDocument();
    await expect(canvas.getByTestId(`aqd-draft-item-${DRAFT_A.id}`)).toBeInTheDocument();
    await expect(canvas.getByTestId(`aqd-draft-item-${DRAFT_B.id}`)).toBeInTheDocument();
    await expect(canvas.getByTestId(`aqd-draft-item-${DRAFT_C.id}`)).toBeInTheDocument();
    // AI badge only on the AI-generated draft
    await expect(canvas.getByTestId(`aqd-ai-badge-${DRAFT_B.id}`)).toBeInTheDocument();
    await expect(canvas.queryByTestId(`aqd-ai-badge-${DRAFT_A.id}`)).not.toBeInTheDocument();
  },
};

// ─── 6. Draft Detail Panel ────────────────────────────────────────────────────

export const DraftSelected: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_A],
      summaries:       SUMMARIES,
      lineItems:       LINE_ITEMS_A,
      selectedDraftId: 'draft-a',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-draft-detail-panel')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-line-items-section')).toBeInTheDocument();
    await expect(canvas.getByTestId(`aqd-line-item-row-${LINE_ITEMS_A[0].id}`)).toBeInTheDocument();
    await expect(canvas.getByTestId(`aqd-line-item-row-${LINE_ITEMS_A[1].id}`)).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-subtotal')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-total')).toBeInTheDocument();
  },
};

// ─── 7. Approved Draft ────────────────────────────────────────────────────────

export const ApprovedDraft: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_C],
      summaries:       SUMMARIES,
      lineItems:       [],
      selectedDraftId: 'draft-c',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-approved-label')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-submit-review-btn')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-approve-btn')).not.toBeInTheDocument();
  },
};

// ─── 8. Rejected Draft ────────────────────────────────────────────────────────

export const RejectedDraft: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_D],
      summaries:       SUMMARIES,
      lineItems:       [],
      selectedDraftId: 'draft-d',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-rejected-label')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-approve-btn')).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-reject-btn')).not.toBeInTheDocument();
  },
};

// ─── 9. Admin — Pending Review buttons visible ────────────────────────────────

export const AdminPendingReview: Story = {
  args: { isAdmin: true },
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_B],
      summaries:       SUMMARIES,
      lineItems:       [],
      selectedDraftId: 'draft-b',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-approve-btn')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-reject-btn')).toBeInTheDocument();
    await expect(canvas.queryByTestId('aqd-submit-review-btn')).not.toBeInTheDocument();
  },
};

// ─── 10. Approve interaction ──────────────────────────────────────────────────

export const ApproveInteraction: Story = {
  args: { isAdmin: true },
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_B],
      summaries:       SUMMARIES,
      lineItems:       [],
      selectedDraftId: 'draft-b',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveBtn = canvas.getByTestId('aqd-approve-btn');
    await userEvent.click(approveBtn);
    await expect(approveDraftSpy).toHaveBeenCalledWith('draft-b', 'ENTERPRISE');
  },
};

// ─── 11. Submit for Review interaction ────────────────────────────────────────

export const SubmitForReviewInteraction: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_A],
      summaries:       SUMMARIES,
      lineItems:       LINE_ITEMS_A,
      selectedDraftId: 'draft-a',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submitBtn = canvas.getByTestId('aqd-submit-review-btn');
    await userEvent.click(submitBtn);
    await expect(submitReviewSpy).toHaveBeenCalledWith('draft-a', 'ENTERPRISE');
  },
};

// ─── 12. Delete Draft interaction ─────────────────────────────────────────────

export const DeleteDraftInteraction: Story = {
  args: { isAdmin: true },
  decorators: [
    withAiQuotationDraftStore({ drafts: [DRAFT_A, DRAFT_B], summaries: SUMMARIES }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const deleteBtn = canvas.getByTestId(`aqd-delete-draft-${DRAFT_A.id}`);
    await userEvent.click(deleteBtn);
    await expect(deleteDraftSpy).toHaveBeenCalledWith(DRAFT_A.id, 'ENTERPRISE');
  },
};

// ─── 13. New Draft Form open ──────────────────────────────────────────────────

export const NewDraftFormInteraction: Story = {
  decorators: [withAiQuotationDraftStore({ drafts: [], summaries: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const newBtn = canvas.getByTestId('aqd-new-draft-btn');
    await userEvent.click(newBtn);
    await expect(canvas.getByTestId('aqd-new-draft-form')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-new-draft-title-input')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-new-draft-customer-input')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-create-draft-submit-btn')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-cancel-new-draft-btn')).toBeInTheDocument();
  },
};

// ─── 14. New Draft Form cancel ────────────────────────────────────────────────

export const NewDraftFormCancel: Story = {
  decorators: [withAiQuotationDraftStore({ drafts: [], summaries: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('aqd-new-draft-btn'));
    await expect(canvas.getByTestId('aqd-new-draft-form')).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('aqd-cancel-new-draft-btn'));
    await expect(canvas.queryByTestId('aqd-new-draft-form')).not.toBeInTheDocument();
  },
};

// ─── 15. Error Banner + clear ────────────────────────────────────────────────

export const ErrorBanner: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:    [],
      summaries: [],
      error:     'ไม่สามารถโหลดใบเสนอราคาได้ กรุณาลองใหม่',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-error-banner')).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('aqd-clear-error-btn'));
    await expect(canvas.queryByTestId('aqd-error-banner')).not.toBeInTheDocument();
  },
};

// ─── 16. Generation Log Panel visible ────────────────────────────────────────

export const GenerationLogPanel: Story = {
  decorators: [
    withAiQuotationDraftStore({
      drafts:          [DRAFT_B],
      summaries:       SUMMARIES,
      lineItems:       [],
      selectedDraftId: 'draft-b',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Panel is always rendered when an AI-generated draft is selected
    await expect(canvas.getByTestId('aqd-generation-log-panel')).toBeInTheDocument();
  },
};

// ─── 17. Summary Bar ─────────────────────────────────────────────────────────

export const SummaryBar: Story = {
  decorators: [
    withAiQuotationDraftStore({ drafts: [DRAFT_A, DRAFT_B, DRAFT_C], summaries: SUMMARIES }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-summary-bar')).toBeInTheDocument();
  },
};

// ─── 18. Filter Bar ──────────────────────────────────────────────────────────

export const FilterBar: Story = {
  decorators: [
    withAiQuotationDraftStore({ drafts: [DRAFT_A, DRAFT_B, DRAFT_C], summaries: SUMMARIES }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('aqd-filter-bar')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-filter-status-select')).toBeInTheDocument();
    await expect(canvas.getByTestId('aqd-filter-ai-select')).toBeInTheDocument();
  },
};
