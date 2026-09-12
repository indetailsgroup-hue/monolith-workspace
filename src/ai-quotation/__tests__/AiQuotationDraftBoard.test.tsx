import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiQuotationDraftBoard } from '../AiQuotationDraftBoard';
import { useAiQuotationDraftStore } from '../aiQuotationDraftStore';
import type { AiQuotationDraft, AiQuotationLineItem } from '../aiQuotationDraftTypes';

const initialState = useAiQuotationDraftStore.getState();
const draft: AiQuotationDraft = {
  id: 'synthetic-draft', org_id: 'test-org', title: 'Synthetic quotation',
  customer_name: null, customer_email: null, status: 'APPROVED',
  subtotal_thb: 10000, tax_rate: 0.07, tax_amount_thb: 700, total_thb: 10700,
  notes: null, generated_by_ai: false, ai_prompt: null, created_by: 'test-user',
  reviewed_by: null, reviewed_at: null, reviewedAt: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};
const item: AiQuotationLineItem = {
  id: 'synthetic-item', draft_id: draft.id, org_id: draft.org_id,
  item_type: 'PRODUCT', description: 'Synthetic item', quantity: 1,
  unit_price_thb: 10000, line_total_thb: 10000, sort_order: 0, notes: null,
  created_at: draft.created_at, updated_at: draft.updated_at,
  createdAt: draft.createdAt, updatedAt: draft.updatedAt,
};

afterEach(() => {
  cleanup();
  useAiQuotationDraftStore.setState(initialState, true);
});

describe('AiQuotationDraftBoard tax display', () => {
  it.each([
    { rate: 0.07, label: '7', amount: 700, total: 10700 },
    { rate: 0.0725, label: '7.25', amount: 725, total: 10725 },
    { rate: 0, label: '0', amount: 0, total: 10000 },
  ])('displays fractional rate $rate as $label% without changing monetary totals', ({ rate, label, amount, total }) => {
    useAiQuotationDraftStore.setState({
      ...initialState,
      drafts: [{ ...draft, tax_rate: rate, tax_amount_thb: amount, total_thb: total }],
      selectedDraftId: draft.id,
      lineItems: [item],
      fetchDrafts: vi.fn(async () => undefined),
    }, true);

    render(<AiQuotationDraftBoard orgId={draft.org_id} orgPlan="ENTERPRISE" />);

    expect(screen.getByText(`ภาษี (${label}%)`)).toBeVisible();
    expect(screen.getByTestId('aqd-subtotal')).toHaveTextContent('฿10,000');
    expect(screen.getByTestId('aqd-tax-amount')).toHaveTextContent(`฿${amount.toLocaleString('th')}`);
    expect(screen.getByTestId('aqd-total')).toHaveTextContent(`฿${total.toLocaleString('th')}`);
    expect(useAiQuotationDraftStore.getState().drafts[0].tax_rate).toBe(rate);
  });
});
