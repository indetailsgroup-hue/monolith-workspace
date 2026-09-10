/**
 * src/org-health/__tests__/OrgHealthScoreBoard.test.tsx
 *
 * MONOLITH v18.5 — Vitest component tests for OrgHealthScoreBoard
 *
 * Coverage:
 *   - Plan gate: FREE/STARTER/PROFESSIONAL → ohs-plan-gate-wall
 *   - Plan gate: ENTERPRISE → no gate wall
 *   - Loading state → ohs-loading
 *   - Score gauge: currentScore → ohs-score-gauge + ohs-grade-badge
 *   - Score gauge: null → ohs-empty-score
 *   - All 5 dimension cards rendered
 *   - Dimension scores displayed via ohs-dim-score-{dim}
 *   - History: empty → ohs-history-empty
 *   - History: snapshots → ohs-snapshot-row
 *   - Config panel: weights in ohs-config-row-{dim}
 *   - Config panel: edit button hidden when !isAdmin
 *   - Inline edit: click edit → input visible
 *   - Inline edit: cancel → input hidden
 *   - Inline edit: save → updateScoringConfig called with correct args
 *   - Compute button: click → computeScore called
 *   - Computing state: disabled btn + ohs-is-computing
 *   - Error banner: error → ohs-error-banner visible
 *   - Error banner: click clear → clearError called
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { OrgHealthScoreBoard } from '../OrgHealthScoreBoard';
import { useOrgHealthScoreStore } from '../orgHealthScoreStore';
import {
  ALL_OHS_DIMENSIONS,
  deriveOhsGrade,
  type OhsCurrentScore,
  type OhsHealthSnapshot,
  type OhsScoringConfig,
} from '../orgHealthScoreTypes';
import type { OrgPlan } from '../../tenant/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock the Zustand store — component receives return value of the hook
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../orgHealthScoreStore');

// ─────────────────────────────────────────────────────────────────────────────
// StoreShape — explicit interface (not ReturnType<>)
// ─────────────────────────────────────────────────────────────────────────────

interface StoreShape {
  currentScore:       OhsCurrentScore | null;
  history:            OhsHealthSnapshot[];
  dimensionScores:    import('../orgHealthScoreTypes').OhsDimensionScore[];
  scoringConfig:      OhsScoringConfig[];
  selectedSnapshotId: string | null;
  isLoading:          boolean;
  isComputing:        boolean;
  isConfigLoading:    boolean;
  error:              string | null;
  fetchLatestScore:    (...args: any[]) => any;
  fetchHistory:        (...args: any[]) => any;
  computeScore:        (...args: any[]) => any;
  fetchScoringConfig:  (...args: any[]) => any;
  updateScoringConfig: (...args: any[]) => any;
  upsertScoringConfig: (...args: any[]) => any;
  selectSnapshot:      (...args: any[]) => any;
  clearError:          (...args: any[]) => any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SCORING_CONFIG: OhsScoringConfig[] = ALL_OHS_DIMENSIONS.map((dim) => ({
  id:          `cfg-${dim.toLowerCase()}`,
  org_id:      'org-th',
  dimension:   dim,
  weight:      0.2,
  description: null,
  created_by:  'system',
  created_at:  '2027-01-01T00:00:00Z',
  updated_at:  '2027-01-01T00:00:00Z',
  createdAt:   '2027-01-01T00:00:00Z',
  updatedAt:   '2027-01-01T00:00:00Z',
}));

function makeCurrentScore(compositeScore: number): OhsCurrentScore {
  const grade     = deriveOhsGrade(compositeScore);
  const dimScores = ALL_OHS_DIMENSIONS.map((dim) => ({
    id:                    `ds-${dim.toLowerCase()}`,
    snapshot_id:           'snap-1',
    org_id:                'org-th',
    dimension:             dim,
    raw_score:             compositeScore,
    weight:                0.2,
    weighted_contribution: compositeScore * 0.2,
    detail:                null,
    weightedContribution:  compositeScore * 0.2,
  }));
  const dimensionMap = Object.fromEntries(
    dimScores.map((s) => [s.dimension, s]),
  ) as OhsCurrentScore['dimensionMap'];

  return {
    id:              'snap-1',
    org_id:          'org-th',
    snapshot_id:     'snap-1',
    snapshot_date:   '2027-02-27',
    composite_score: compositeScore,
    grade,
    computed_by:     'system',
    computed_at:     '2027-02-27T09:00:00Z',
    notes:           null,
    dimensions:      dimScores,
    snapshotDate:    '2027-02-27',
    computedAt:      '2027-02-27T09:00:00Z',
    dimensionMap,
  } as OhsCurrentScore;
}

function makeSnapshot(id: string, compositeScore: number, date: string): OhsHealthSnapshot {
  return {
    id,
    org_id:          'org-th',
    snapshot_date:   date,
    composite_score: compositeScore,
    grade:           deriveOhsGrade(compositeScore),
    computed_by:     'system',
    computed_at:     `${date}T09:00:00Z`,
    notes:           null,
    snapshotDate:    date,
    computedAt:      `${date}T09:00:00Z`,
  } as OhsHealthSnapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store mock helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockUseStore = vi.mocked(useOrgHealthScoreStore);

function makeDefaultState(overrides: Partial<StoreShape> = {}): StoreShape {
  return {
    currentScore:       null,
    history:            [],
    dimensionScores:    [],
    scoringConfig:      SCORING_CONFIG,
    selectedSnapshotId: null,
    isLoading:          false,
    isComputing:        false,
    isConfigLoading:    false,
    error:              null,
    fetchLatestScore:    vi.fn(),
    fetchHistory:        vi.fn(),
    computeScore:        vi.fn(),
    fetchScoringConfig:  vi.fn(),
    updateScoringConfig: vi.fn().mockResolvedValue(undefined),
    upsertScoringConfig: vi.fn().mockResolvedValue(undefined),
    selectSnapshot:      vi.fn(),
    clearError:          vi.fn(),
    ...overrides,
  };
}

function setStore(overrides: Partial<StoreShape> = {}) {
  mockUseStore.mockReturnValue(makeDefaultState(overrides) as any);
}

beforeEach(() => {
  setStore();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-th';
const ENTERPRISE: OrgPlan = 'ENTERPRISE';

function renderBoard(props: Partial<React.ComponentProps<typeof OrgHealthScoreBoard>> = {}) {
  return render(
    <OrgHealthScoreBoard
      orgId={ORG_ID}
      orgPlan={ENTERPRISE}
      {...props}
    />,
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('OrgHealthScoreBoard — plan gate', () => {
  it.each<[OrgPlan]>([['FREE'], ['STARTER'], ['PROFESSIONAL']])(
    'renders gate wall for %s plan',
    (orgPlan) => {
      render(
        <OrgHealthScoreBoard orgId={ORG_ID} orgPlan={orgPlan} />,
      );
      expect(screen.getByTestId('ohs-plan-gate-wall')).toBeInTheDocument();
    },
  );

  it('does NOT render gate wall for ENTERPRISE plan', () => {
    renderBoard({ orgPlan: ENTERPRISE });
    expect(screen.queryByTestId('ohs-plan-gate-wall')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — loading state', () => {
  it('renders ohs-loading when isLoading is true', () => {
    setStore({ isLoading: true });
    renderBoard();
    expect(screen.getByTestId('ohs-loading')).toBeInTheDocument();
  });

  it('does not render ohs-loading when isLoading is false', () => {
    setStore({ isLoading: false });
    renderBoard();
    expect(screen.queryByTestId('ohs-loading')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — score gauge', () => {
  it('renders ohs-score-gauge and ohs-grade-badge when currentScore is set', () => {
    setStore({ currentScore: makeCurrentScore(92.0) });
    renderBoard();
    expect(screen.getByTestId('ohs-score-gauge')).toBeInTheDocument();
    expect(screen.getByTestId('ohs-grade-badge')).toBeInTheDocument();
  });

  it('displays composite score value', () => {
    setStore({ currentScore: makeCurrentScore(92.0) });
    renderBoard();
    expect(screen.getByTestId('ohs-score-gauge').textContent).toContain('92.0');
  });

  it('renders ohs-empty-score when currentScore is null', () => {
    setStore({ currentScore: null });
    renderBoard();
    expect(screen.getByTestId('ohs-empty-score')).toBeInTheDocument();
  });

  it('does not render ohs-score-gauge when currentScore is null', () => {
    setStore({ currentScore: null });
    renderBoard();
    expect(screen.queryByTestId('ohs-score-gauge')).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — dimension cards', () => {
  it('renders all 5 dimension cards', () => {
    setStore({ currentScore: makeCurrentScore(80.0) });
    renderBoard();
    for (const dim of ALL_OHS_DIMENSIONS) {
      expect(
        screen.getByTestId(`ohs-dimension-card-${dim}`),
      ).toBeInTheDocument();
    }
  });

  it('displays dimension score via ohs-dim-score-{dim} when data present', () => {
    setStore({ currentScore: makeCurrentScore(85.0) });
    renderBoard();
    for (const dim of ALL_OHS_DIMENSIONS) {
      const scoreEl = screen.getByTestId(`ohs-dim-score-${dim}`);
      expect(scoreEl).toBeInTheDocument();
      expect(scoreEl.textContent).toContain('85.0');
    }
  });

  it('shows dash for dim score when currentScore is null (hasData false)', () => {
    setStore({ currentScore: null });
    renderBoard();
    const scoreEls = screen.getAllByTestId(/^ohs-dim-score-/);
    expect(scoreEls.length).toBe(5);
    for (const el of scoreEls) {
      expect(el.textContent).toBe('—');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — history', () => {
  it('renders ohs-history-empty when history is empty', () => {
    setStore({ history: [] });
    renderBoard();
    expect(screen.getByTestId('ohs-history-empty')).toBeInTheDocument();
  });

  it('renders ohs-snapshot-row for each history entry', () => {
    const history = [
      makeSnapshot('s1', 92.0, '2027-02-27'),
      makeSnapshot('s2', 80.5, '2027-01-27'),
      makeSnapshot('s3', 74.2, '2026-12-27'),
    ];
    setStore({ history });
    renderBoard();
    const rows = screen.getAllByTestId('ohs-snapshot-row');
    expect(rows).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — config panel', () => {
  it('renders ohs-config-row for all 5 dimensions', () => {
    renderBoard();
    for (const dim of ALL_OHS_DIMENSIONS) {
      expect(
        screen.getByTestId(`ohs-config-row-${dim}`),
      ).toBeInTheDocument();
    }
  });

  it('displays weight values in each config row', () => {
    renderBoard();
    for (const dim of ALL_OHS_DIMENSIONS) {
      const row = screen.getByTestId(`ohs-config-row-${dim}`);
      // Default weight 0.2 → "20%"
      expect(row.textContent).toContain('20%');
    }
  });

  it('does not show edit buttons when isAdmin is false', () => {
    renderBoard({ isAdmin: false });
    for (const dim of ALL_OHS_DIMENSIONS) {
      expect(
        screen.queryByTestId(`ohs-config-edit-btn-${dim}`),
      ).not.toBeInTheDocument();
    }
  });

  it('shows edit buttons for all dims when isAdmin is true', () => {
    renderBoard({ isAdmin: true });
    for (const dim of ALL_OHS_DIMENSIONS) {
      expect(
        screen.getByTestId(`ohs-config-edit-btn-${dim}`),
      ).toBeInTheDocument();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — inline weight edit', () => {
  it('shows weight input after clicking edit button', () => {
    renderBoard({ isAdmin: true });
    fireEvent.click(screen.getByTestId('ohs-config-edit-btn-SAFETY'));
    expect(
      screen.getByTestId('ohs-config-weight-input-SAFETY'),
    ).toBeInTheDocument();
  });

  it('hides weight input after clicking cancel button', () => {
    renderBoard({ isAdmin: true });
    fireEvent.click(screen.getByTestId('ohs-config-edit-btn-SAFETY'));
    expect(
      screen.getByTestId('ohs-config-weight-input-SAFETY'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ohs-config-cancel-btn-SAFETY'));
    expect(
      screen.queryByTestId('ohs-config-weight-input-SAFETY'),
    ).not.toBeInTheDocument();
  });

  it('calls updateScoringConfig with correct args on save', () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    setStore({ updateScoringConfig: updateSpy, scoringConfig: SCORING_CONFIG });
    renderBoard({ isAdmin: true });

    // Open edit mode for SAFETY
    fireEvent.click(screen.getByTestId('ohs-config-edit-btn-SAFETY'));

    // Change weight to 0.30
    const input = screen.getByTestId('ohs-config-weight-input-SAFETY');
    fireEvent.change(input, { target: { value: '0.30' } });

    // Save
    fireEvent.click(screen.getByTestId('ohs-config-save-btn-SAFETY'));

    expect(updateSpy).toHaveBeenCalledWith(
      'cfg-safety',
      0.3,
      undefined,
      ENTERPRISE,
    );
  });

  it('does not call updateScoringConfig when weight is out of range', () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    setStore({ updateScoringConfig: updateSpy, scoringConfig: SCORING_CONFIG });
    renderBoard({ isAdmin: true });

    fireEvent.click(screen.getByTestId('ohs-config-edit-btn-SAFETY'));
    const input = screen.getByTestId('ohs-config-weight-input-SAFETY');
    fireEvent.change(input, { target: { value: '1.5' } }); // invalid: > 1
    fireEvent.click(screen.getByTestId('ohs-config-save-btn-SAFETY'));

    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — compute button', () => {
  it('calls computeScore when compute button is clicked', () => {
    const computeSpy = vi.fn();
    setStore({ computeScore: computeSpy });
    renderBoard();

    fireEvent.click(screen.getByTestId('ohs-compute-btn'));

    expect(computeSpy).toHaveBeenCalledWith(
      ORG_ID,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ENTERPRISE,
    );
  });

  it('disables compute button when isComputing is true', () => {
    setStore({ isComputing: true });
    renderBoard();
    expect(screen.getByTestId('ohs-compute-btn')).toBeDisabled();
  });

  it('renders ohs-is-computing span when isComputing is true', () => {
    setStore({ isComputing: true });
    renderBoard();
    expect(screen.getByTestId('ohs-is-computing')).toBeInTheDocument();
  });

  it('compute button is NOT disabled when isComputing is false', () => {
    setStore({ isComputing: false });
    renderBoard();
    expect(screen.getByTestId('ohs-compute-btn')).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('OrgHealthScoreBoard — error banner', () => {
  it('renders ohs-error-banner when error is set', () => {
    setStore({ error: 'โหลดข้อมูลล้มเหลว' });
    renderBoard();
    expect(screen.getByTestId('ohs-error-banner')).toBeInTheDocument();
    expect(screen.getByTestId('ohs-error-banner').textContent).toContain(
      'โหลดข้อมูลล้มเหลว',
    );
  });

  it('does not render ohs-error-banner when error is null', () => {
    setStore({ error: null });
    renderBoard();
    expect(screen.queryByTestId('ohs-error-banner')).not.toBeInTheDocument();
  });

  it('calls clearError when ohs-clear-error-btn is clicked', () => {
    const clearSpy = vi.fn();
    setStore({ error: 'Test error', clearError: clearSpy });
    renderBoard();
    fireEvent.click(screen.getByTestId('ohs-clear-error-btn'));
    expect(clearSpy).toHaveBeenCalledOnce();
  });
});
