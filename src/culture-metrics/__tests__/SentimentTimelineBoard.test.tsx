/**
 * src/culture-metrics/__tests__/SentimentTimelineBoard.test.tsx
 *
 * MONOLITH v18.5 Sprint 14 — Vitest component tests for SentimentTimelineBoard
 *
 * Test structure:
 *   Plan gate            — FREE/STARTER → gate wall; PROFESSIONAL/ENTERPRISE → board
 *   Loading state        — est-loading skeleton shown when loading:true
 *   Board render         — est-board, est-summary-section, est-timeline-section, est-submit-form
 *   Dimension cards      — cards rendered per active config; testid per dim; score + badge
 *   Timeline rows        — est-period-row per filtered summary; est-no-data when empty
 *   Submit form          — handleSubmit calls submitSentimentEntry with correct payload
 *   Error banner         — est-error-banner shown/hidden; clearError on button click
 *   Effects on mount     — fetchSummary + fetchTimelineConfigs called on mount
 *   Admin panel          — isAdmin:true → admin section; false → hidden
 *
 * Pattern follows OrgHealthScoreBoard.test.tsx:
 *   vi.mock('../employeeSentimentStore') → mockUseEstStore.mockReturnValue(makeStore(…))
 */

import React, { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import SentimentTimelineBoard from '../SentimentTimelineBoard';
import { useEstStore } from '../employeeSentimentStore';
import { canAccessEstModule as _canAccessEstModule, type EstSentimentSummary, type EstTimelineConfig } from '../employeeSentimentTypes';
import type { OrgPlan } from '../../tenant/types';

// =============================================================================
// Mock the store (not the types — canAccessEstModule is used directly from types)
// =============================================================================

vi.mock('../employeeSentimentStore');

const mockUseEstStore = vi.mocked(useEstStore);

// =============================================================================
// Store shape & helpers
// =============================================================================

interface StoreShape {
  summaries:             EstSentimentSummary[];
  configs:               EstTimelineConfig[];
  filters:               { dimension?: string; periodType?: string };
  loading:               boolean;
  error:                 string | null;
  fetchSummary:          ReturnType<typeof vi.fn>;
  fetchTimelineConfigs:  ReturnType<typeof vi.fn>;
  submitSentimentEntry:  ReturnType<typeof vi.fn>;
  upsertTimelineConfig:  ReturnType<typeof vi.fn>;
  setFilters:            ReturnType<typeof vi.fn>;
  clearError:            ReturnType<typeof vi.fn>;
}

const ORG_ID = 'org-th';

function makeStore(overrides: Partial<StoreShape> = {}): StoreShape {
  return {
    summaries:            [],
    configs:              [],
    filters:              {},
    loading:              false,
    error:                null,
    fetchSummary:         vi.fn().mockResolvedValue(undefined),
    fetchTimelineConfigs: vi.fn().mockResolvedValue(undefined),
    submitSentimentEntry: vi.fn().mockResolvedValue(undefined),
    upsertTimelineConfig: vi.fn().mockResolvedValue(undefined),
    setFilters:           vi.fn(),
    clearError:           vi.fn(),
    ...overrides,
  };
}

function setStore(overrides: Partial<StoreShape> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockUseEstStore.mockReturnValue(makeStore(overrides) as any);
}

function renderBoard(props: Partial<{ orgId: string; plan: OrgPlan; isAdmin: boolean }> = {}) {
  return render(
    <SentimentTimelineBoard
      orgId={props.orgId ?? ORG_ID}
      plan={props.plan ?? 'ENTERPRISE'}
      isAdmin={props.isAdmin ?? false}
    />,
  );
}

// =============================================================================
// Sample fixtures
// =============================================================================

function makeConfig(
  dimension: EstTimelineConfig['dimension'],
  isActive = true,
): EstTimelineConfig {
  return {
    id:           `cfg-${dimension.toLowerCase()}`,
    orgId:        ORG_ID,
    dimension,
    isActive,
    isInverted:   false,
    minResponses: 3,
    periodType:   'WEEKLY',
    createdAt:    '2027-01-01T00:00:00Z',
    updatedAt:    '2027-01-01T00:00:00Z',
  };
}

function makeSummary(
  dimension: EstSentimentSummary['dimension'],
  avgScore: number,
  healthStatus: EstSentimentSummary['healthStatus'] = 'NORMAL',
  periodLabel = '2027-W10',
): EstSentimentSummary {
  return {
    orgId:         ORG_ID,
    dimension,
    periodType:    'WEEKLY',
    periodLabel,
    avgScore,
    responseCount: 5,
    isInverted:    false,
    minResponses:  3,
    healthStatus,
  };
}

const ALL_ACTIVE_CONFIGS: EstTimelineConfig[] = [
  makeConfig('MORALE'),
  makeConfig('ENGAGEMENT'),
  makeConfig('STRESS'),
  makeConfig('COLLABORATION'),
  makeConfig('CLARITY'),
];

const SAMPLE_SUMMARIES: EstSentimentSummary[] = [
  makeSummary('MORALE',        7.5, 'NORMAL'),
  makeSummary('ENGAGEMENT',    8.0, 'NORMAL'),
  makeSummary('STRESS',        4.0, 'NORMAL'),
  makeSummary('COLLABORATION', 8.5, 'NORMAL'),
  makeSummary('CLARITY',       7.0, 'NORMAL'),
];

// =============================================================================
// beforeEach — reset mocks
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  setStore();
});

// =============================================================================
// Plan gate
// =============================================================================

describe('Plan gate', () => {
  it.each<OrgPlan>(['FREE', 'STARTER'])(
    '%s plan → est-plan-gate-wall shown, est-board hidden',
    (plan) => {
      setStore();
      renderBoard({ plan });
      expect(screen.getByTestId('est-plan-gate-wall')).toBeInTheDocument();
      expect(screen.queryByTestId('est-board')).not.toBeInTheDocument();
    },
  );

  it.each<OrgPlan>(['PROFESSIONAL', 'ENTERPRISE'])(
    '%s plan → est-board shown, gate wall hidden',
    (plan) => {
      setStore();
      renderBoard({ plan });
      expect(screen.queryByTestId('est-plan-gate-wall')).not.toBeInTheDocument();
      expect(screen.getByTestId('est-board')).toBeInTheDocument();
    },
  );
});

// =============================================================================
// Loading state
// =============================================================================

describe('Loading state', () => {
  it('loading:true → est-loading shown, est-board hidden', () => {
    setStore({ loading: true });
    renderBoard();
    expect(screen.getByTestId('est-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('est-board')).not.toBeInTheDocument();
  });

  it('loading:false → est-loading hidden, est-board shown', () => {
    setStore({ loading: false });
    renderBoard();
    expect(screen.queryByTestId('est-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('est-board')).toBeInTheDocument();
  });
});

// =============================================================================
// Board render
// =============================================================================

describe('Board render', () => {
  it('renders est-board, est-summary-section, est-timeline-section, est-submit-form', () => {
    setStore();
    renderBoard();
    expect(screen.getByTestId('est-board')).toBeInTheDocument();
    expect(screen.getByTestId('est-summary-section')).toBeInTheDocument();
    expect(screen.getByTestId('est-timeline-section')).toBeInTheDocument();
    expect(screen.getByTestId('est-submit-form')).toBeInTheDocument();
  });

  it('est-score-input and est-dimension-select rendered inside submit form', () => {
    setStore();
    renderBoard();
    expect(screen.getByTestId('est-score-input')).toBeInTheDocument();
    expect(screen.getByTestId('est-dimension-select')).toBeInTheDocument();
  });

  it('est-submit-btn rendered', () => {
    setStore();
    renderBoard();
    expect(screen.getByTestId('est-submit-btn')).toBeInTheDocument();
  });

  it('no active configs → "ยังไม่มีมิติที่เปิดใช้งาน" shown', () => {
    setStore({ configs: [] });
    renderBoard();
    expect(screen.getByText('ยังไม่มีมิติที่เปิดใช้งาน')).toBeInTheDocument();
  });
});

// =============================================================================
// Dimension cards
// =============================================================================

describe('Dimension cards', () => {
  it('5 active configs → 5 est-dimension-card elements', () => {
    setStore({ configs: ALL_ACTIVE_CONFIGS, summaries: SAMPLE_SUMMARIES });
    renderBoard();
    expect(screen.getAllByTestId('est-dimension-card')).toHaveLength(5);
  });

  it('est-dimension-card-MORALE anchor rendered', () => {
    setStore({ configs: [makeConfig('MORALE')], summaries: [] });
    renderBoard();
    expect(screen.getByTestId('est-dimension-card-MORALE')).toBeInTheDocument();
  });

  it('est-dim-score-MORALE shows formatted avg score', () => {
    setStore({ configs: [makeConfig('MORALE')], summaries: [makeSummary('MORALE', 7.5)] });
    renderBoard();
    expect(screen.getByTestId('est-dim-score-MORALE')).toHaveTextContent('7.5');
  });

  it('est-dim-score-MORALE shows "—" when no summary for that dim', () => {
    setStore({ configs: [makeConfig('MORALE')], summaries: [] });
    renderBoard();
    expect(screen.getByTestId('est-dim-score-MORALE')).toHaveTextContent('—');
  });

  it('health badge CRITICAL → text-red-700 class applied', () => {
    setStore({
      configs:   [makeConfig('MORALE')],
      summaries: [makeSummary('MORALE', 2.0, 'CRITICAL')],
    });
    renderBoard();
    const badge = screen.getByTestId('est-health-badge-MORALE');
    expect(badge.className).toContain('text-red-700');
  });

  it('health badge WARNING → text-amber-700 class applied', () => {
    setStore({
      configs:   [makeConfig('MORALE')],
      summaries: [makeSummary('MORALE', 5.0, 'WARNING')],
    });
    renderBoard();
    const badge = screen.getByTestId('est-health-badge-MORALE');
    expect(badge.className).toContain('text-amber-700');
  });

  it('no active configs → no est-dimension-card rendered', () => {
    setStore({ configs: [makeConfig('MORALE', false)] });
    renderBoard();
    expect(screen.queryByTestId('est-dimension-card')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Timeline rows
// =============================================================================

describe('Timeline rows', () => {
  it('summaries present → est-period-row rows rendered', () => {
    setStore({ configs: ALL_ACTIVE_CONFIGS, summaries: SAMPLE_SUMMARIES });
    renderBoard();
    const rows = screen.getAllByTestId('est-period-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('empty summaries → est-no-data shown', () => {
    setStore({ configs: ALL_ACTIVE_CONFIGS, summaries: [] });
    renderBoard();
    expect(screen.getByTestId('est-no-data')).toBeInTheDocument();
  });
});

// =============================================================================
// Submit form
// =============================================================================

describe('Submit form', () => {
  it('form submit → submitSentimentEntry called once', async () => {
    const submitSentimentEntry = vi.fn().mockResolvedValue(undefined);
    setStore({ submitSentimentEntry });
    renderBoard();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('est-submit-form'));
    });
    expect(submitSentimentEntry).toHaveBeenCalledTimes(1);
  });

  it('submit payload has orgId and default dimension MORALE, score 5', async () => {
    const submitSentimentEntry = vi.fn().mockResolvedValue(undefined);
    setStore({ submitSentimentEntry });
    renderBoard();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('est-submit-form'));
    });
    expect(submitSentimentEntry).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, dimension: 'MORALE', score: 5 }),
    );
  });

  it('periodLabel defaults to YYYY-MM-DD format when submit label empty', async () => {
    const submitSentimentEntry = vi.fn().mockResolvedValue(undefined);
    setStore({ submitSentimentEntry });
    renderBoard();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('est-submit-form'));
    });
    const payload = submitSentimentEntry.mock.calls[0][0] as { periodLabel: string };
    expect(payload.periodLabel).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('note is undefined when note input is empty', async () => {
    const submitSentimentEntry = vi.fn().mockResolvedValue(undefined);
    setStore({ submitSentimentEntry });
    renderBoard();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('est-submit-form'));
    });
    const payload = submitSentimentEntry.mock.calls[0][0] as { note?: string };
    expect(payload.note).toBeUndefined();
  });
});

// =============================================================================
// Error banner
// =============================================================================

describe('Error banner', () => {
  it('error: null → est-error-banner not in DOM', () => {
    setStore({ error: null });
    renderBoard();
    expect(screen.queryByTestId('est-error-banner')).not.toBeInTheDocument();
  });

  it('error: string → est-error-banner shown with message', () => {
    setStore({ error: 'โหลดข้อมูลล้มเหลว' });
    renderBoard();
    const banner = screen.getByTestId('est-error-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('โหลดข้อมูลล้มเหลว');
  });

  it('click est-clear-error-btn → clearError called once', () => {
    const clearError = vi.fn();
    setStore({ error: 'some error', clearError });
    renderBoard();
    fireEvent.click(screen.getByTestId('est-clear-error-btn'));
    expect(clearError).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Effects on mount
// =============================================================================

describe('Effects on mount', () => {
  it('fetchSummary called on mount with orgId and plan', () => {
    const fetchSummary = vi.fn().mockResolvedValue(undefined);
    setStore({ fetchSummary });
    renderBoard({ plan: 'ENTERPRISE' });
    expect(fetchSummary).toHaveBeenCalledWith(ORG_ID, 'ENTERPRISE');
  });

  it('fetchTimelineConfigs called on mount with orgId and plan', () => {
    const fetchTimelineConfigs = vi.fn().mockResolvedValue(undefined);
    setStore({ fetchTimelineConfigs });
    renderBoard({ plan: 'ENTERPRISE' });
    expect(fetchTimelineConfigs).toHaveBeenCalledWith(ORG_ID, 'ENTERPRISE');
  });
});

// =============================================================================
// Admin panel
// =============================================================================

describe('Admin panel', () => {
  it('isAdmin:true → admin config panel section visible', () => {
    setStore();
    renderBoard({ isAdmin: true });
    expect(screen.getByText('การตั้งค่ามิติ (Admin)')).toBeInTheDocument();
  });

  it('isAdmin:false → admin config panel section hidden', () => {
    setStore();
    renderBoard({ isAdmin: false });
    expect(screen.queryByText('การตั้งค่ามิติ (Admin)')).not.toBeInTheDocument();
  });
});
