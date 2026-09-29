/**
 * src/org-health/OrgHealthScoreBoard.stories.tsx
 *
 * MONOLITH v18.5 — Storybook CSF3 stories for OrgHealthScoreBoard
 *
 * 13 stories:
 *   PlanGateWall             — PROFESSIONAL plan → ohs-plan-gate-wall
 *   PlanGateWallFree         — FREE plan → ohs-plan-gate-wall
 *   LoadingState             — isLoading: true → ohs-loading
 *   EmptyScore               — no currentScore → ohs-empty-score
 *   FullScoreGradeA          — composite 92.0, grade A
 *   FullScoreGradeB          — composite 78.0, grade B
 *   FullScoreGradeF          — composite 28.0, grade F
 *   WithHistory              — 3 snapshots in history list
 *   AdminConfigPanel         — isAdmin: true, edit buttons visible
 *   ComputingState           — isComputing: true → ohs-is-computing
 *   ErrorBanner              — error state → ohs-error-banner
 *   ConfigPanelEditSave      — play: edit → change → save → spy called
 *   ComputeButtonInteraction — play: click compute btn → spy called
 *
 * Mock strategy:
 *   withOrgHealthScoreStore decorator calls useOrgHealthScoreStore.setState(…)
 *   to seed state + replace async actions with spies.
 *   Fetch actions always replaced with noopAsync to prevent Supabase calls.
 *   Mutating action spies keep an async default so Storybook mock restoration
 *   preserves the Promise contract used by component .then() chains.
 */

import React from 'react';
import type { Meta, StoryFn, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';

import OrgHealthScoreBoard from './OrgHealthScoreBoard';
import { useOrgHealthScoreStore } from './orgHealthScoreStore';
import {
  ALL_OHS_DIMENSIONS,
  OHS_GRADE_ACCENT,
  deriveOhsGrade,
  type OhsCurrentScore,
  type OhsHealthSnapshot,
  type OhsScoringConfig,
} from './orgHealthScoreTypes';

// =============================================================================
// Module-level spies
// Storybook restores spies before rendering. Put async behavior in the original
// implementation so restoration keeps the Promise contract of store actions.
// =============================================================================

const computeScoreSpy        = fn(async () => 82.5);
const updateScoringConfigSpy = fn(async () => {});
const upsertScoringConfigSpy = fn(async () => {});

// =============================================================================
// Sample data helpers
// =============================================================================

/** Scoring config for all 5 dimensions — 20% each */
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

const SAMPLE_HISTORY: OhsHealthSnapshot[] = [
  makeSnapshot('snap-3', 92.0, '2027-02-27'),
  makeSnapshot('snap-2', 80.5, '2027-01-27'),
  makeSnapshot('snap-1', 74.2, '2026-12-27'),
];

// =============================================================================
// Decorator factory
// =============================================================================

const noopAsync = async () => {};

function withOrgHealthScoreStore(
  stateOverride: Partial<ReturnType<typeof useOrgHealthScoreStore.getState>>,
) {
  return (Story: StoryFn) => {
    useOrgHealthScoreStore.setState({
      currentScore:       null,
      history:            [],
      dimensionScores:    [],
      scoringConfig:      SCORING_CONFIG,
      selectedSnapshotId: null,
      isLoading:          false,
      isComputing:        false,
      isConfigLoading:    false,
      error:              null,
      // no-op fetches to prevent Supabase calls on mount
      fetchLatestScore:    noopAsync,
      fetchHistory:        noopAsync,
      fetchScoringConfig:  noopAsync,
      // mutating action spies
      computeScore:        computeScoreSpy,
      updateScoringConfig: updateScoringConfigSpy,
      upsertScoringConfig: upsertScoringConfigSpy,
      selectSnapshot:      fn(),
      clearError:          fn(),
      ...stateOverride,
    } as any);
    computeScoreSpy.mockClear();
    updateScoringConfigSpy.mockClear();
    upsertScoringConfigSpy.mockClear();
    return <Story />;
  };
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof OrgHealthScoreBoard> = {
  title:     'OrgHealth/OrgHealthScoreBoard',
  component: OrgHealthScoreBoard,
  parameters: { layout: 'fullscreen' },
  args: {
    orgId:   'org-th',
    orgPlan: 'ENTERPRISE',
    isAdmin: false,
  },
};

export default meta;
type Story = StoryObj<typeof OrgHealthScoreBoard>;

// =============================================================================
// Stories
// =============================================================================

// ─── Plan gate wall stories ──────────────────────────────────────────────────

/** PROFESSIONAL plan → ohs-plan-gate-wall (gate is before hooks) */
export const PlanGateWall: Story = {
  args:       { orgPlan: 'PROFESSIONAL' },
  decorators: [withOrgHealthScoreStore({})],
};

/** FREE plan → ohs-plan-gate-wall */
export const PlanGateWallFree: Story = {
  args:       { orgPlan: 'FREE' },
  decorators: [withOrgHealthScoreStore({})],
};

// ─── Loading state ────────────────────────────────────────────────────────────

export const LoadingState: Story = {
  decorators: [withOrgHealthScoreStore({ isLoading: true })],
};

// ─── Score gauge states ───────────────────────────────────────────────────────

/** No currentScore → ohs-empty-score */
export const EmptyScore: Story = {
  decorators: [withOrgHealthScoreStore({ currentScore: null })],
};

/** Grade A — composite 92.0 */
export const FullScoreGradeA: Story = {
  decorators: [
    withOrgHealthScoreStore({
      currentScore: makeCurrentScore(92.0),
    }),
  ],
};

/** Grade B — composite 78.0 */
export const FullScoreGradeB: Story = {
  decorators: [
    withOrgHealthScoreStore({
      currentScore: makeCurrentScore(78.0),
    }),
  ],
};

/** Grade F — composite 28.0 */
export const FullScoreGradeF: Story = {
  decorators: [
    withOrgHealthScoreStore({
      currentScore: makeCurrentScore(28.0),
    }),
  ],
};

// ─── History list ─────────────────────────────────────────────────────────────

/** 3 snapshots in the history list */
export const WithHistory: Story = {
  decorators: [
    withOrgHealthScoreStore({
      currentScore: makeCurrentScore(92.0),
      history:      SAMPLE_HISTORY,
    }),
  ],
};

// ─── Admin config panel ───────────────────────────────────────────────────────

/** isAdmin: true — edit buttons visible on each config row */
export const AdminConfigPanel: Story = {
  args:       { isAdmin: true },
  decorators: [
    withOrgHealthScoreStore({
      currentScore: makeCurrentScore(84.0),
      scoringConfig: SCORING_CONFIG,
    }),
  ],
};

// ─── Computing state ──────────────────────────────────────────────────────────

/** isComputing: true → compute btn disabled + ohs-is-computing span */
export const ComputingState: Story = {
  decorators: [
    withOrgHealthScoreStore({
      isComputing: true,
    }),
  ],
};

// ─── Error banner ─────────────────────────────────────────────────────────────

export const ErrorBanner: Story = {
  decorators: [
    withOrgHealthScoreStore({
      error: 'โหลดข้อมูลล้มเหลว: connection timeout',
    }),
  ],
};

// ─── Play function stories ────────────────────────────────────────────────────

/**
 * ConfigPanelEditSave
 * play: click ohs-config-edit-btn-SAFETY → change input → click
 *        ohs-config-save-btn-SAFETY → updateScoringConfigSpy called
 */
export const ConfigPanelEditSave: Story = {
  args:       { orgPlan: 'ENTERPRISE', isAdmin: true },
  decorators: [
    withOrgHealthScoreStore({
      scoringConfig: SCORING_CONFIG,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Click edit button for SAFETY dimension
    await userEvent.click(
      canvas.getByTestId('ohs-config-edit-btn-SAFETY'),
    );

    // Change weight input
    const input = canvas.getByTestId('ohs-config-weight-input-SAFETY');
    await userEvent.clear(input);
    await userEvent.type(input, '0.25');

    // Click save
    await userEvent.click(
      canvas.getByTestId('ohs-config-save-btn-SAFETY'),
    );

    // Spy must have been called with the correct args
    await expect(updateScoringConfigSpy).toHaveBeenCalledWith(
      'cfg-safety',
      0.25,
      undefined,
      'ENTERPRISE',
    );
  },
};

/**
 * ComputeButtonInteraction
 * play: click ohs-compute-btn → computeScoreSpy called
 */
export const ComputeButtonInteraction: Story = {
  args:       { orgPlan: 'ENTERPRISE' },
  decorators: [
    withOrgHealthScoreStore({}),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByTestId('ohs-compute-btn'));

    await expect(computeScoreSpy).toHaveBeenCalled();
  },
};
