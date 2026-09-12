/**
 * src/jobs/BottleneckHeatmap.stories.tsx
 *
 * MONOLITH v17.0 — Storybook CSF3 stories for <BottleneckHeatmap>
 *
 * Stories cover:
 *  - Default (PROFESSIONAL, 4 stages, mixed severities)
 *  - All OK severities
 *  - All CRITICAL severities (worst-case)
 *  - Mixed severity — worst-stage highlighted
 *  - Loading state (skeleton)
 *  - Empty state (no time-in-stage data)
 *  - Plan gate wall: STARTER plan
 *  - Plan gate wall: FREE plan
 *  - Error banner
 *  - Template-scoped view (templateId + templateName)
 *  - Single stage
 *  - ENTERPRISE plan
 *
 * Store mocking strategy: same `(overrides) => (Story) => ReactElement`
 * pattern as PeopleDirectory.stories.tsx.
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, within } from '@storybook/test';
import React from 'react';

import { BottleneckHeatmap } from './BottleneckHeatmap';
import { useProcessTemplateStore } from './processTemplateStore';
import type { BottleneckHeatmapRow } from './processTemplateTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';
const TEMPLATE_ID = 't-cabinet-001';

function makeRow(
  stageName: string,
  pctOfExpected: number,
  overrides: Partial<BottleneckHeatmapRow> = {},
): BottleneckHeatmapRow {
  const avgExpected = 120;
  const avgActual = Math.round((pctOfExpected / 100) * avgExpected);
  const bottleneckRatePct = pctOfExpected > 100 ? Math.min((pctOfExpected - 100) * 0.8, 95) : 5;

  return {
    orgId: ORG_ID,
    stageName,
    stageOrder: null,
    templateId: null,
    jobCount: 20,
    avgDurationMinutes: avgActual,
    avgExpectedMinutes: avgExpected,
    maxDurationMinutes: Math.round(avgActual * 1.5),
    pctOfExpected,
    bottleneckCount: Math.round((bottleneckRatePct / 100) * 20),
    bottleneckRatePct,
    ...overrides,
  };
}

const MIXED_ROWS: BottleneckHeatmapRow[] = [
  makeRow('ออกแบบ',   95,  { stageOrder: 1 }),   // OK
  makeRow('ตัด CNC',  130, { stageOrder: 2, jobCount: 25 }),  // WARNING
  makeRow('ประกอบ',   175, { stageOrder: 3, jobCount: 18 }),  // CRITICAL
  makeRow('ทาสี',     108, { stageOrder: 4, jobCount: 22 }),   // OK
];

const ALL_OK_ROWS: BottleneckHeatmapRow[] = [
  makeRow('ออกแบบ', 88,  { stageOrder: 1 }),
  makeRow('ตัด CNC', 95, { stageOrder: 2 }),
  makeRow('ประกอบ', 102, { stageOrder: 3 }),
  makeRow('ทาสี',    98, { stageOrder: 4 }),
];

const ALL_CRITICAL_ROWS: BottleneckHeatmapRow[] = [
  makeRow('ออกแบบ', 165, { stageOrder: 1 }),
  makeRow('ตัด CNC', 190, { stageOrder: 2 }),
  makeRow('ประกอบ', 210, { stageOrder: 3 }),
  makeRow('ทาสี',   175, { stageOrder: 4 }),
];

const TEMPLATE_ROWS: BottleneckHeatmapRow[] = MIXED_ROWS.map((r, i) => ({
  ...r,
  templateId: TEMPLATE_ID,
  stageOrder: i + 1,
}));

const SINGLE_ROW: BottleneckHeatmapRow[] = [
  makeRow('ตัด CNC', 145, {
    stageOrder: 1,
    jobCount: 10,
    bottleneckCount: 4,
    bottleneckRatePct: (4 / 10) * 100,
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

type StoreOverride = {
  bottleneckData?: BottleneckHeatmapRow[];
  isBottleneckLoading?: boolean;
  error?: string | null;
};

const withBottleneckStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useProcessTemplateStore.setState({
      bottleneckData: MIXED_ROWS,
      isBottleneckLoading: false,
      error: null,
      fetchBottleneckData: async () => {},
      clearError: fn(),
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof BottleneckHeatmap> = {
  title: 'Jobs/BottleneckHeatmap',
  component: BottleneckHeatmap,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'PROFESSIONAL+ heatmap showing avg time per stage vs. plan. ' +
          'Severity color-coded: OK (green ≤110%), WARNING (amber 111–150%), ' +
          'CRITICAL (red >150%). Worst stage highlighted with ⚠️.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'PROFESSIONAL',
  },
};

export default meta;
type Story = StoryObj<typeof BottleneckHeatmap>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

/** Default: PROFESSIONAL plan, mixed OK/WARNING/CRITICAL stages */
export const Default: Story = {
  decorators: [withBottleneckStore()],
};

/** All stages within expected time — all labels should be "ปกติ" */
export const AllOKSeverity: Story = {
  name: 'All Stages — OK (green)',
  decorators: [withBottleneckStore({ bottleneckData: ALL_OK_ROWS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const labels = canvas.getAllByTestId('severity-text');
    for (const label of labels) {
      await expect(label.textContent).toBe('ปกติ');
    }
  },
};

/** All stages critical */
export const AllCriticalSeverity: Story = {
  name: 'All Stages — CRITICAL (red)',
  decorators: [withBottleneckStore({ bottleneckData: ALL_CRITICAL_ROWS })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const labels = canvas.getAllByTestId('severity-text');
    for (const label of labels) {
      await expect(label.textContent).toBe('Bottleneck');
    }
  },
};

/** Mixed severity — worst-stage "ประกอบ" should be highlighted */
export const MixedSeverityWorstStage: Story = {
  name: 'Mixed Severity — Worst Stage Highlighted',
  decorators: [withBottleneckStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const worstDisplay = canvas.getByTestId('worst-stage-display');
    // "ประกอบ" has pctOfExpected=175 — highest in MIXED_ROWS
    await expect(worstDisplay.textContent).toBe('ประกอบ');
  },
};

/** Template-scoped view */
export const TemplateScopedView: Story = {
  name: 'Template-Scoped View',
  args: {
    templateId: TEMPLATE_ID,
    templateName: 'Cabinet Kitchen Standard',
  },
  decorators: [withBottleneckStore({ bottleneckData: TEMPLATE_ROWS })],
};

/** Loading skeleton */
export const LoadingState: Story = {
  name: 'Loading State',
  decorators: [withBottleneckStore({ bottleneckData: [], isBottleneckLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('bottleneck-loading')).toBeInTheDocument();
    await expect(canvas.queryByTestId('bottleneck-heatmap')).not.toBeInTheDocument();
  },
};

/** Empty state: PROFESSIONAL plan but no time-in-stage data yet */
export const EmptyState: Story = {
  name: 'Empty State — No Data Yet',
  decorators: [withBottleneckStore({ bottleneckData: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('bottleneck-empty-state')).toBeInTheDocument();
  },
};

/** Plan gate wall: STARTER plan */
export const PlanGateWallStarter: Story = {
  name: 'Plan Gate Wall (STARTER plan)',
  args: { orgPlan: 'STARTER' },
  decorators: [withBottleneckStore({ bottleneckData: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('bottleneck-plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('bottleneck-heatmap')).not.toBeInTheDocument();
  },
};

/** Plan gate wall: FREE plan */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withBottleneckStore({ bottleneckData: [] })],
};

/** Error banner */
export const ErrorBanner: Story = {
  name: 'Error Banner',
  decorators: [
    withBottleneckStore({
      bottleneckData: [],
      error: 'ไม่สามารถโหลดข้อมูล Bottleneck ได้ กรุณาตรวจสอบการเชื่อมต่อ',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('bottleneck-error-banner')).toBeInTheDocument();
  },
};

/** Single stage only */
export const SingleStage: Story = {
  name: 'Single Stage',
  decorators: [withBottleneckStore({ bottleneckData: SINGLE_ROW })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByTestId('heatmap-row');
    await expect(rows.length).toBe(1);
  },
};

/** ENTERPRISE plan — same as PROFESSIONAL */
export const EnterprisePlan: Story = {
  name: 'ENTERPRISE Plan',
  args: { orgPlan: 'ENTERPRISE' },
  decorators: [withBottleneckStore()],
};
