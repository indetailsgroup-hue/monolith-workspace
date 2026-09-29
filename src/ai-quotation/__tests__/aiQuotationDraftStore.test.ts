/**
 * aiQuotationDraftStore.test.ts
 * Vitest unit tests for useAiQuotationDraftStore (MONOLITH v18.0)
 *
 * Coverage:
 *  - ENTERPRISE plan gate on all 10 gated actions (30 reject + 10 pass = 40 tests)
 *  - fetchDrafts: parallel Promise.all, draftResult.error, summaryResult.error, isLoading flag
 *  - createDraft: prepend to drafts array, error path
 *  - updateDraft: updates in-place by id, error path
 *  - deleteDraft: removes from drafts + lineItems, resets selectedDraftId, error path
 *  - addLineItem: appends to lineItems, isLineItemLoading, error path
 *  - updateLineItem: updates in-place by id, error path
 *  - removeLineItem: filters by id, error path
 *  - submitForReview: optimistic PENDING_REVIEW, rollback prevStatus on error
 *  - approveDraft: optimistic APPROVED, rollback prevStatus on error
 *  - rejectDraft: optimistic REJECTED, rollback prevStatus on error
 *  - UI helpers: selectDraft, setFilters merge, clearError
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useAiQuotationDraftStore } from '../aiQuotationDraftStore';
import {
  DEFAULT_AQD_FILTERS,
  AiQuotationPlanGateError,
  type AqdQuotationDraftRow,
  type AqdDraftLineItemRow,
  type AqdDraftSummaryRow,
  type CreateAqdDraftPayload,
  type CreateAqdLineItemPayload,
} from '../aiQuotationDraftTypes';
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeDraftRow(overrides: Partial<AqdQuotationDraftRow> = {}): AqdQuotationDraftRow {
  return {
    id:              'd-1',
    org_id:          'org-1',
    title:           'Draft 1',
    customer_name:   'ACME Co.',
    customer_email:  null,
    status:          'DRAFT',
    subtotal_thb:    1000,
    tax_rate:        7,
    tax_amount_thb:  70,
    total_thb:       1070,
    notes:           null,
    generated_by_ai: false,
    ai_prompt:       null,
    created_by:      'user-1',
    reviewed_by:     null,
    reviewed_at:     null,
    created_at:      '2027-02-15T00:00:00Z',
    updated_at:      '2027-02-15T00:00:00Z',
    ...overrides,
  };
}

function makeLineItemRow(overrides: Partial<AqdDraftLineItemRow> = {}): AqdDraftLineItemRow {
  return {
    id:              'li-1',
    draft_id:        'd-1',
    org_id:          'org-1',
    item_type:       'PRODUCT',
    description:     'Widget A',
    quantity:        2,
    unit_price_thb:  500,
    line_total_thb:  1000,
    sort_order:      1,
    notes:           null,
    created_at:      '2027-02-15T00:00:00Z',
    updated_at:      '2027-02-15T00:00:00Z',
    ...overrides,
  };
}

function makeSummaryRow(overrides: Partial<AqdDraftSummaryRow> = {}): AqdDraftSummaryRow {
  return {
    org_id:          'org-1',
    status:          'DRAFT',
    draft_count:     3,
    total_value_thb: 15000,
    ...overrides,
  };
}

function makeCreatePayload(overrides: Partial<CreateAqdDraftPayload> = {}): CreateAqdDraftPayload {
  return {
    org_id: 'org-1',
    title:  'New Draft',
    ...overrides,
  };
}

function makeLineItemPayload(
  overrides: Partial<CreateAqdLineItemPayload> = {},
): CreateAqdLineItemPayload {
  return {
    draft_id:       'd-1',
    org_id:         'org-1',
    item_type:      'PRODUCT',
    description:    'Test Item',
    quantity:       1,
    unit_price_thb: 100,
    ...overrides,
  };
}

// ─── Plan gate constants ───────────────────────────────────────────────────────

const NON_ENTERPRISE: OrgPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL'];

const ACTIONS = [
  'fetchDrafts',
  'createDraft',
  'updateDraft',
  'deleteDraft',
  'addLineItem',
  'updateLineItem',
  'removeLineItem',
  'submitForReview',
  'approveDraft',
  'rejectDraft',
] as const;

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMock();
  // Default success responses for all tables
  setResult('aqd_quotation_drafts',  'select', []);
  setResult('aqd_quotation_drafts',  'insert', makeDraftRow());
  setResult('aqd_quotation_drafts',  'update', makeDraftRow());
  setResult('aqd_quotation_drafts',  'delete', null);
  setResult('aqd_draft_line_items',  'select', []);
  setResult('aqd_draft_line_items',  'insert', makeLineItemRow());
  setResult('aqd_draft_line_items',  'update', makeLineItemRow());
  setResult('aqd_draft_line_items',  'delete', null);
  setResult('aqd_draft_summary_v',   'select', []);
  useAiQuotationDraftStore.setState({
    drafts:            [],
    summaries:         [],
    lineItems:         [],
    selectedDraftId:   null,
    isLoading:         false,
    isLineItemLoading: false,
    filters:           DEFAULT_AQD_FILTERS,
    error:             null,
  });
});

// =============================================================================
// PLAN GATE
// =============================================================================

describe('Plan gate — all 10 actions reject non-ENTERPRISE plans', () => {
  it.each(NON_ENTERPRISE)('fetchDrafts throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().fetchDrafts('org-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('createDraft throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().createDraft(makeCreatePayload(), plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('updateDraft throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().updateDraft('d-1', { title: 'x' }, plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('deleteDraft throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().deleteDraft('d-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('addLineItem throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().addLineItem(makeLineItemPayload(), plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('updateLineItem throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().updateLineItem('li-1', { quantity: 2 }, plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('removeLineItem throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().removeLineItem('li-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('submitForReview throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().submitForReview('d-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('approveDraft throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().approveDraft('d-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });

  it.each(NON_ENTERPRISE)('rejectDraft throws for %s', async (plan) => {
    await expect(
      useAiQuotationDraftStore.getState().rejectDraft('d-1', plan),
    ).rejects.toBeInstanceOf(AiQuotationPlanGateError);
  });
});

describe('Plan gate — ENTERPRISE passes all 10 actions', () => {
  it.each(ACTIONS)('%s resolves without AiQuotationPlanGateError for ENTERPRISE', async (action) => {
    // Set up extra default responses for the two 3-arg actions
    setResult('aqd_quotation_drafts', 'update', makeDraftRow());
    setResult('aqd_draft_line_items', 'update', makeLineItemRow());

    let promise: Promise<void>;
    const store = useAiQuotationDraftStore.getState();
    switch (action) {
      case 'fetchDrafts':
        promise = store.fetchDrafts('org-1', 'ENTERPRISE');
        break;
      case 'createDraft':
        promise = store.createDraft(makeCreatePayload(), 'ENTERPRISE');
        break;
      case 'updateDraft':
        promise = store.updateDraft('d-1', { title: 'x' }, 'ENTERPRISE');
        break;
      case 'deleteDraft':
        promise = store.deleteDraft('d-1', 'ENTERPRISE');
        break;
      case 'addLineItem':
        promise = store.addLineItem(makeLineItemPayload(), 'ENTERPRISE');
        break;
      case 'updateLineItem':
        promise = store.updateLineItem('li-1', { quantity: 2 }, 'ENTERPRISE');
        break;
      case 'removeLineItem':
        promise = store.removeLineItem('li-1', 'ENTERPRISE');
        break;
      case 'submitForReview':
        promise = store.submitForReview('d-1', 'ENTERPRISE');
        break;
      case 'approveDraft':
        promise = store.approveDraft('d-1', 'ENTERPRISE');
        break;
      case 'rejectDraft':
        promise = store.rejectDraft('d-1', 'ENTERPRISE');
        break;
    }
    await expect(promise!).resolves.toBeUndefined();
  });
});

// =============================================================================
// fetchDrafts
// =============================================================================

describe('fetchDrafts', () => {
  it('sets drafts and summaries from parallel fetch results', async () => {
    const row     = makeDraftRow();
    const summary = makeSummaryRow();
    setResult('aqd_quotation_drafts', 'select', [row]);
    setResult('aqd_draft_summary_v',  'select', [summary]);

    await act(async () => {
      await useAiQuotationDraftStore.getState().fetchDrafts('org-1', 'ENTERPRISE');
    });

    const { drafts, summaries } = useAiQuotationDraftStore.getState();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe('d-1');
    expect(drafts[0].createdAt).toBe(row.created_at);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].draftCount).toBe(3);
    expect(summaries[0].totalValueThb).toBe(15000);
  });

  it('propagates draftResult.error and sets error state', async () => {
    setResult('aqd_quotation_drafts', 'select', null, { message: 'drafts DB error' });
    setResult('aqd_draft_summary_v',  'select', []);

    await expect(
    useAiQuotationDraftStore.getState().fetchDrafts('org-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'drafts DB error' });

    expect(useAiQuotationDraftStore.getState().error).toBe('drafts DB error');
    expect(useAiQuotationDraftStore.getState().isLoading).toBe(false);
  });

  it('propagates summaryResult.error when drafts succeed', async () => {
    setResult('aqd_quotation_drafts', 'select', []);
    setResult('aqd_draft_summary_v',  'select', null, { message: 'summary DB error' });

    await expect(
    useAiQuotationDraftStore.getState().fetchDrafts('org-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'summary DB error' });

    expect(useAiQuotationDraftStore.getState().error).toBe('summary DB error');
  });

  it('tracks isLoading true then false via subscribe', async () => {
    const loadingValues: boolean[] = [];
    const unsub = useAiQuotationDraftStore.subscribe((s) => {
      loadingValues.push(s.isLoading);
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().fetchDrafts('org-1', 'ENTERPRISE');
    });
    unsub();

    expect(loadingValues).toContain(true);
    expect(loadingValues[loadingValues.length - 1]).toBe(false);
  });

  it('clears isLoading after drafts fetch succeeds', async () => {
    await act(async () => {
      await useAiQuotationDraftStore.getState().fetchDrafts('org-1', 'ENTERPRISE');
    });
    expect(useAiQuotationDraftStore.getState().isLoading).toBe(false);
  });
});

// =============================================================================
// createDraft
// =============================================================================

describe('createDraft', () => {
  it('prepends new draft to drafts array', async () => {
    const existing = makeDraftRow({ id: 'd-existing' });
    useAiQuotationDraftStore.setState({ drafts: [{ ...existing, createdAt: '', updatedAt: '', reviewedAt: null }] });

    const newRow = makeDraftRow({ id: 'd-new', title: 'New Draft' });
    setResult('aqd_quotation_drafts', 'insert', newRow);

    await act(async () => {
      await useAiQuotationDraftStore.getState().createDraft(makeCreatePayload(), 'ENTERPRISE');
    });

    const { drafts } = useAiQuotationDraftStore.getState();
    expect(drafts[0].id).toBe('d-new');
    expect(drafts[1].id).toBe('d-existing');
  });

  it('sets error and does not mutate drafts on insert failure', async () => {
    setResult('aqd_quotation_drafts', 'insert', null, { message: 'insert failed' });

    await expect(
    useAiQuotationDraftStore.getState().createDraft(makeCreatePayload(), 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'insert failed' });

    expect(useAiQuotationDraftStore.getState().error).toBe('insert failed');
    expect(useAiQuotationDraftStore.getState().drafts).toHaveLength(0);
  });
});

// =============================================================================
// updateDraft
// =============================================================================

describe('updateDraft', () => {
  it('updates draft in-place by id', async () => {
    const initial = makeDraftRow({ id: 'd-1', title: 'Old Title' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...initial, createdAt: '', updatedAt: '', reviewedAt: null }],
    });

    const updated = makeDraftRow({ id: 'd-1', title: 'New Title' });
    setResult('aqd_quotation_drafts', 'update', updated);

    await act(async () => {
      await useAiQuotationDraftStore
        .getState()
        .updateDraft('d-1', { title: 'New Title' }, 'ENTERPRISE');
    });

    const { drafts } = useAiQuotationDraftStore.getState();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('New Title');
  });

  it('sets error on update failure', async () => {
    setResult('aqd_quotation_drafts', 'update', null, { message: 'update failed' });

    await expect(
        useAiQuotationDraftStore
          .getState()
          .updateDraft('d-1', { title: 'x' }, 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'update failed' });

    expect(useAiQuotationDraftStore.getState().error).toBe('update failed');
  });
});

// =============================================================================
// deleteDraft
// =============================================================================

describe('deleteDraft', () => {
  it('removes draft from drafts array', async () => {
    const draft = makeDraftRow({ id: 'd-del' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().deleteDraft('d-del', 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().drafts).toHaveLength(0);
  });

  it('removes associated line items on delete', async () => {
    const li1 = makeLineItemRow({ id: 'li-a', draft_id: 'd-del' });
    const li2 = makeLineItemRow({ id: 'li-b', draft_id: 'd-other' });
    useAiQuotationDraftStore.setState({
      drafts: [],
      lineItems: [
        { ...li1, createdAt: '', updatedAt: '' },
        { ...li2, createdAt: '', updatedAt: '' },
      ],
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().deleteDraft('d-del', 'ENTERPRISE');
    });

    const { lineItems } = useAiQuotationDraftStore.getState();
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].id).toBe('li-b');
  });

  it('resets selectedDraftId when deleted draft was selected', async () => {
    useAiQuotationDraftStore.setState({ selectedDraftId: 'd-del', drafts: [] });

    await act(async () => {
      await useAiQuotationDraftStore.getState().deleteDraft('d-del', 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().selectedDraftId).toBeNull();
  });

  it('preserves selectedDraftId when a different draft is deleted', async () => {
    useAiQuotationDraftStore.setState({ selectedDraftId: 'd-other', drafts: [] });

    await act(async () => {
      await useAiQuotationDraftStore.getState().deleteDraft('d-del', 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().selectedDraftId).toBe('d-other');
  });

  it('sets error on delete failure', async () => {
    setResult('aqd_quotation_drafts', 'delete', null, { message: 'delete failed' });

    await expect(
    useAiQuotationDraftStore.getState().deleteDraft('d-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'delete failed' });

    expect(useAiQuotationDraftStore.getState().error).toBe('delete failed');
  });
});

// =============================================================================
// addLineItem
// =============================================================================

describe('addLineItem', () => {
  it('appends new line item to lineItems', async () => {
    const newItem = makeLineItemRow({ id: 'li-new' });
    setResult('aqd_draft_line_items', 'insert', newItem);

    await act(async () => {
      await useAiQuotationDraftStore
        .getState()
        .addLineItem(makeLineItemPayload(), 'ENTERPRISE');
    });

    const { lineItems } = useAiQuotationDraftStore.getState();
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].id).toBe('li-new');
  });

  it('tracks isLineItemLoading true then false via subscribe', async () => {
    const loadingValues: boolean[] = [];
    const unsub = useAiQuotationDraftStore.subscribe((s) => {
      loadingValues.push(s.isLineItemLoading);
    });

    await act(async () => {
      await useAiQuotationDraftStore
        .getState()
        .addLineItem(makeLineItemPayload(), 'ENTERPRISE');
    });
    unsub();

    expect(loadingValues).toContain(true);
    expect(loadingValues[loadingValues.length - 1]).toBe(false);
  });

  it('sets error and clears isLineItemLoading on insert failure', async () => {
    setResult('aqd_draft_line_items', 'insert', null, { message: 'li insert failed' });

    await expect(
        useAiQuotationDraftStore
          .getState()
          .addLineItem(makeLineItemPayload(), 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'li insert failed' });

    const { error, isLineItemLoading } = useAiQuotationDraftStore.getState();
    expect(error).toBe('li insert failed');
    expect(isLineItemLoading).toBe(false);
  });
});

// =============================================================================
// updateLineItem
// =============================================================================

describe('updateLineItem', () => {
  it('updates line item in-place by id', async () => {
    const initial = makeLineItemRow({ id: 'li-1', quantity: 1 });
    useAiQuotationDraftStore.setState({
      lineItems: [{ ...initial, createdAt: '', updatedAt: '' }],
    });

    const updated = makeLineItemRow({ id: 'li-1', quantity: 5 });
    setResult('aqd_draft_line_items', 'update', updated);

    await act(async () => {
      await useAiQuotationDraftStore
        .getState()
        .updateLineItem('li-1', { quantity: 5 }, 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().lineItems[0].quantity).toBe(5);
  });

  it('sets error on update failure', async () => {
    setResult('aqd_draft_line_items', 'update', null, { message: 'li update failed' });

    await expect(
        useAiQuotationDraftStore
          .getState()
          .updateLineItem('li-1', { quantity: 5 }, 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'li update failed' });

    expect(useAiQuotationDraftStore.getState().error).toBe('li update failed');
  });
});

// =============================================================================
// removeLineItem
// =============================================================================

describe('removeLineItem', () => {
  it('removes line item by id from lineItems', async () => {
    const li1 = makeLineItemRow({ id: 'li-keep' });
    const li2 = makeLineItemRow({ id: 'li-remove' });
    useAiQuotationDraftStore.setState({
      lineItems: [
        { ...li1, createdAt: '', updatedAt: '' },
        { ...li2, createdAt: '', updatedAt: '' },
      ],
    });

    await act(async () => {
      await useAiQuotationDraftStore
        .getState()
        .removeLineItem('li-remove', 'ENTERPRISE');
    });

    const { lineItems } = useAiQuotationDraftStore.getState();
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].id).toBe('li-keep');
  });

  it('sets error on delete failure', async () => {
    setResult('aqd_draft_line_items', 'delete', null, { message: 'li delete failed' });

    await expect(
        useAiQuotationDraftStore
          .getState()
          .removeLineItem('li-1', 'ENTERPRISE'),
    ).rejects.toMatchObject({ message: 'li delete failed' });

    expect(useAiQuotationDraftStore.getState().error).toBe('li delete failed');
  });
});

// =============================================================================
// submitForReview — optimistic rollback
// =============================================================================

describe('submitForReview', () => {
  it('optimistically sets status to PENDING_REVIEW before DB resolves', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'DRAFT' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });

    // Use a slow mock by capturing intermediate state via subscribe
    const statusValues: string[] = [];
    const unsub = useAiQuotationDraftStore.subscribe((s) => {
      const d = s.drafts.find((x) => x.id === 'd-1');
      if (d) statusValues.push(d.status);
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().submitForReview('d-1', 'ENTERPRISE');
    });
    unsub();

    expect(statusValues).toContain('PENDING_REVIEW');
    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('PENDING_REVIEW');
  });

  it('rolls back to previous status (DRAFT) when DB update fails', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'DRAFT' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });
    setResult('aqd_quotation_drafts', 'update', null, { message: 'submit failed' });

    await expect(
    useAiQuotationDraftStore.getState().submitForReview('d-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'submit failed' });

    const { drafts, error } = useAiQuotationDraftStore.getState();
    expect(drafts[0].status).toBe('DRAFT');
    expect(error).toBe('submit failed');
  });

  it('rolls back to PENDING_REVIEW when re-submit from PENDING_REVIEW fails', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'PENDING_REVIEW' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });
    setResult('aqd_quotation_drafts', 'update', null, { message: 'oops' });

    await expect(
    useAiQuotationDraftStore.getState().submitForReview('d-1', 'ENTERPRISE')
  ).rejects.toBeTruthy();

    // Should rollback to PENDING_REVIEW (the prevStatus captured before optimistic update)
    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('PENDING_REVIEW');
  });

  it('rolls back for unknown draftId without throwing prevStatus lookup error', async () => {
    useAiQuotationDraftStore.setState({ drafts: [] });
    setResult('aqd_quotation_drafts', 'update', null, { message: 'no such draft' });

    await expect(
    useAiQuotationDraftStore.getState().submitForReview('d-unknown', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'no such draft' });
  });
});

// =============================================================================
// approveDraft — optimistic rollback
// =============================================================================

describe('approveDraft', () => {
  it('optimistically sets status to APPROVED', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'PENDING_REVIEW' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().approveDraft('d-1', 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('APPROVED');
  });

  it('rolls back to PENDING_REVIEW when DB update fails', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'PENDING_REVIEW' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });
    setResult('aqd_quotation_drafts', 'update', null, { message: 'approve failed' });

    await expect(
    useAiQuotationDraftStore.getState().approveDraft('d-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'approve failed' });

    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('PENDING_REVIEW');
    expect(useAiQuotationDraftStore.getState().error).toBe('approve failed');
  });
});

// =============================================================================
// rejectDraft — optimistic rollback
// =============================================================================

describe('rejectDraft', () => {
  it('optimistically sets status to REJECTED', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'PENDING_REVIEW' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });

    await act(async () => {
      await useAiQuotationDraftStore.getState().rejectDraft('d-1', 'ENTERPRISE');
    });

    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('REJECTED');
  });

  it('rolls back to PENDING_REVIEW when DB update fails', async () => {
    const draft = makeDraftRow({ id: 'd-1', status: 'PENDING_REVIEW' });
    useAiQuotationDraftStore.setState({
      drafts: [{ ...draft, createdAt: '', updatedAt: '', reviewedAt: null }],
    });
    setResult('aqd_quotation_drafts', 'update', null, { message: 'reject failed' });

    await expect(
    useAiQuotationDraftStore.getState().rejectDraft('d-1', 'ENTERPRISE')
  ).rejects.toMatchObject({ message: 'reject failed' });

    expect(useAiQuotationDraftStore.getState().drafts[0].status).toBe('PENDING_REVIEW');
    expect(useAiQuotationDraftStore.getState().error).toBe('reject failed');
  });
});

// =============================================================================
// UI helpers
// =============================================================================

describe('UI helpers', () => {
  it('selectDraft sets selectedDraftId', () => {
    useAiQuotationDraftStore.getState().selectDraft('d-42');
    expect(useAiQuotationDraftStore.getState().selectedDraftId).toBe('d-42');
  });

  it('selectDraft(null) clears selectedDraftId', () => {
    useAiQuotationDraftStore.setState({ selectedDraftId: 'd-99' });
    useAiQuotationDraftStore.getState().selectDraft(null);
    expect(useAiQuotationDraftStore.getState().selectedDraftId).toBeNull();
  });

  it('setFilters merges partial filter update', () => {
    useAiQuotationDraftStore.getState().setFilters({ status: 'APPROVED' });
    const { filters } = useAiQuotationDraftStore.getState();
    expect(filters.status).toBe('APPROVED');
    expect(filters.generatedByAi).toBe(DEFAULT_AQD_FILTERS.generatedByAi);
  });

  it('setFilters updates generatedByAi independently', () => {
    useAiQuotationDraftStore.getState().setFilters({ generatedByAi: true });
    expect(useAiQuotationDraftStore.getState().filters.generatedByAi).toBe(true);
  });

  it('clearError resets error to null', () => {
    useAiQuotationDraftStore.setState({ error: 'some error' });
    useAiQuotationDraftStore.getState().clearError();
    expect(useAiQuotationDraftStore.getState().error).toBeNull();
  });
});
