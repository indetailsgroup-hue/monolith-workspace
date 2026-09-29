/**
 * src/jobs/ProcessTemplateList.stories.tsx
 *
 * MONOLITH v17.0 — Storybook CSF3 stories for <ProcessTemplateList>
 *
 * Stories cover:
 *  - Default (STARTER plan, mix of categories, global + org templates)
 *  - Category filter pre-set (CABINET only)
 *  - Plan gate wall (FREE plan — locked view)
 *  - Loading skeleton state (6 skeleton cards)
 *  - Empty state (no templates match filter)
 *  - Error banner state
 *  - Admin view (clone button visible on global templates)
 *  - Global-only filter active
 *  - PROFESSIONAL plan — all templates unlocked
 *  - Search interaction (play function)
 *  - Category dropdown interaction (play function)
 *
 * Store mocking strategy
 * ─────────────────────────────────────────────────────────────────────────
 * ProcessTemplateList reads all data from `useProcessTemplateStore`.
 * We inject mock state via `useProcessTemplateStore.setState()` inside
 * a per-story decorator — same pattern as PeopleDirectory.stories.tsx:
 *   (overrides) => (Story: StoryFn) => ReactElement
 */

import type { Meta, StoryObj } from '@storybook/react';
import type { StoryFn } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import React from 'react';

import { ProcessTemplateList } from './ProcessTemplateList';
import { useProcessTemplateStore } from './processTemplateStore';
import type { JobTemplateSummary, JobTemplateFilters } from './processTemplateTypes';
import { DEFAULT_TEMPLATE_FILTERS } from './processTemplateTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data factories
// ─────────────────────────────────────────────────────────────────────────────

const ORG_ID = 'org-daph-th-001';

function makeTemplate(
  id: string,
  name: string,
  overrides: Partial<JobTemplateSummary> = {},
): JobTemplateSummary {
  return {
    id,
    orgId: ORG_ID,
    name,
    category: 'CABINET',
    description: `Template สำหรับ ${name}`,
    planGate: 'STARTER',
    isActive: true,
    isGlobal: false,
    version: 1,
    tags: ['production', 'standard'],
    estimatedTotalHours: 8,
    createdAt: '2026-12-01T00:00:00Z',
    updatedAt: '2026-12-01T00:00:00Z',
    ...overrides,
  };
}

const MOCK_TEMPLATES: JobTemplateSummary[] = [
  makeTemplate('t-001', 'Cabinet Kitchen Standard', {
    category: 'CABINET',
    isGlobal: true,
    tags: ['kitchen', 'standard'],
    estimatedTotalHours: 12,
  }),
  makeTemplate('t-002', 'Sliding Door Premium', {
    category: 'DOOR',
    orgId: ORG_ID,
    planGate: 'STARTER',
    estimatedTotalHours: 6,
    tags: ['door', 'sliding'],
  }),
  makeTemplate('t-003', 'CNC Batch Processing', {
    category: 'CNC',
    isGlobal: true,
    planGate: 'PROFESSIONAL',
    estimatedTotalHours: 4,
    tags: ['cnc', 'batch'],
  }),
  makeTemplate('t-004', 'Drawer Standard', {
    category: 'DRAWER',
    estimatedTotalHours: 3,
    tags: ['drawer'],
  }),
  makeTemplate('t-005', 'Site Installation Complete', {
    category: 'SITE',
    isGlobal: true,
    estimatedTotalHours: 16,
    tags: ['installation', 'on-site'],
  }),
  makeTemplate('t-006', 'Quotation Template Basic', {
    category: 'QUOTATION',
    estimatedTotalHours: null,
    tags: [],
    description: undefined,
  }),
];

const CABINET_TEMPLATES = MOCK_TEMPLATES.filter((t) => t.category === 'CABINET');
const GLOBAL_TEMPLATES = MOCK_TEMPLATES.filter((t) => t.isGlobal);

// ─────────────────────────────────────────────────────────────────────────────
// Decorator helper
// ─────────────────────────────────────────────────────────────────────────────

type StoreOverride = {
  templates?: JobTemplateSummary[];
  filters?: JobTemplateFilters;
  isLoading?: boolean;
  error?: string | null;
};

const withProcessTemplateStore =
  (overrides: StoreOverride = {}): ((Story: StoryFn) => React.ReactElement) =>
  (Story) => {
    useProcessTemplateStore.setState({
      templates: MOCK_TEMPLATES,
      filters: { ...DEFAULT_TEMPLATE_FILTERS },
      isLoading: false,
      error: null,
      fetchTemplates: async () => {},
      cloneGlobalTemplate: async () => ({} as JobTemplateSummary),
      ...overrides,
    });
    return <Story />;
  };

// ─────────────────────────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ProcessTemplateList> = {
  title: 'Jobs/ProcessTemplateList',
  component: ProcessTemplateList,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Process Template browser with category/search/global filters. ' +
          'STARTER+ plan required. PROFESSIONAL+ templates show a plan gate badge ' +
          'and are locked on STARTER plan.',
      },
    },
  },
  args: {
    orgId: ORG_ID,
    orgPlan: 'STARTER',
    isAdmin: false,
    onSelectTemplate: fn(),
    onApplyTemplate: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ProcessTemplateList>;

// ─────────────────────────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────────────────────────

/** Default: STARTER plan, 6 templates, mixed categories */
export const Default: Story = {
  decorators: [withProcessTemplateStore()],
};

/** Pre-filtered to CABINET category */
export const CategoryFilterCabinet: Story = {
  name: 'Category Filter — CABINET',
  decorators: [
    withProcessTemplateStore({
      templates: CABINET_TEMPLATES,
      filters: { ...DEFAULT_TEMPLATE_FILTERS, category: 'CABINET' },
    }),
  ],
};

/** Global-only filter active */
export const GlobalOnlyFilter: Story = {
  name: 'Global-Only Filter',
  decorators: [
    withProcessTemplateStore({
      templates: GLOBAL_TEMPLATES,
      filters: { ...DEFAULT_TEMPLATE_FILTERS, isGlobal: true },
    }),
  ],
};

/** Plan gate wall: FREE plan cannot access Process Templates */
export const PlanGateWallFree: Story = {
  name: 'Plan Gate Wall (FREE plan)',
  args: { orgPlan: 'FREE' },
  decorators: [withProcessTemplateStore({ templates: [] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('plan-gate-wall')).toBeInTheDocument();
    await expect(canvas.queryByTestId('process-template-list')).not.toBeInTheDocument();
  },
};

/** Loading skeleton: 6 animated cards */
export const LoadingSkeleton: Story = {
  name: 'Loading Skeleton',
  decorators: [withProcessTemplateStore({ templates: [], isLoading: true })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('template-loading')).toBeInTheDocument();
    const skeletons = canvas.getAllByTestId('template-skeleton');
    await expect(skeletons.length).toBe(6);
  },
};

/** Empty state: search returned no results */
export const EmptyStateNoResults: Story = {
  name: 'Empty State — No Results',
  decorators: [
    withProcessTemplateStore({
      templates: [],
      filters: { ...DEFAULT_TEMPLATE_FILTERS, search: 'xyz-not-found' },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('template-empty-state')).toBeInTheDocument();
  },
};

/** Empty state: no templates at all (first run) */
export const EmptyStateFirstRun: Story = {
  name: 'Empty State — First Run',
  decorators: [withProcessTemplateStore({ templates: [] })],
};

/** Error banner visible */
export const ErrorBanner: Story = {
  name: 'Error Banner',
  decorators: [
    withProcessTemplateStore({
      templates: [],
      error: 'ไม่สามารถโหลด Templates ได้ กรุณาลองใหม่อีกครั้ง',
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('error-banner')).toBeInTheDocument();
  },
};

/** Admin view: clone button visible on global templates */
export const AdminView: Story = {
  name: 'Admin View (Clone visible)',
  args: { isAdmin: true },
  decorators: [withProcessTemplateStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cloneBtns = canvas.getAllByTestId('clone-template-btn');
    await expect(cloneBtns.length).toBeGreaterThan(0);
  },
};

/** PROFESSIONAL plan: PROFESSIONAL+ template accessible */
export const ProfessionalPlanUnlocked: Story = {
  name: 'PROFESSIONAL Plan — All Templates Unlocked',
  args: { orgPlan: 'PROFESSIONAL' },
  decorators: [withProcessTemplateStore()],
};

/** Search interaction: user types and input receives value */
export const SearchInteraction: Story = {
  name: 'Search Interaction',
  decorators: [withProcessTemplateStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const searchInput = canvas.getByTestId('template-search-input');
    await userEvent.click(searchInput);
    await userEvent.type(searchInput, 'Cabinet', { delay: 30 });
    await expect(searchInput).toHaveValue('Cabinet');
  },
};

/** Category dropdown interaction */
export const CategoryDropdownInteraction: Story = {
  name: 'Category Dropdown Interaction',
  decorators: [withProcessTemplateStore()],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByTestId('category-filter');
    await userEvent.selectOptions(select, 'CNC');
    await expect(select).toHaveValue('CNC');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Clone Flow Interaction (play function)
// Added v17.5: verifies cloneGlobalTemplate is called with correct args
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Module-level spy so both the decorator and play function share the same ref.
 * fn() is @storybook/test's vi-compatible mock — supports .mockClear() and
 * toHaveBeenCalledWith assertions.
 */
const cloneGlobalTemplateSpy = fn(async (_templateId: string, _orgId: string) => ({} as import('./processTemplateTypes').JobTemplateSummary));

/** Clone flow interaction: Admin clicks Clone on a global template */
export const CloneFlowInteraction: Story = {
  name: 'Clone Flow — Interaction Test',
  args: { isAdmin: true, orgId: ORG_ID, orgPlan: 'PROFESSIONAL' },
  decorators: [
    (Story: StoryFn) => {
      // Reset call history on each story render so interaction tests are idempotent
      cloneGlobalTemplateSpy.mockClear();
      useProcessTemplateStore.setState({
        templates: MOCK_TEMPLATES,
        filters: { ...DEFAULT_TEMPLATE_FILTERS },
        isLoading: false,
        error: null,
        fetchTemplates: async () => {},
        cloneGlobalTemplate: cloneGlobalTemplateSpy,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 1. Verify clone buttons are rendered for admin (global templates only)
    const cloneBtns = canvas.getAllByTestId('clone-template-btn');
    await expect(cloneBtns.length).toBeGreaterThan(0);
    await expect(cloneBtns.length).toBe(GLOBAL_TEMPLATES.length);

    // 2. Click the first clone button (first global template: Cabinet Kitchen Standard)
    await userEvent.click(cloneBtns[0]);

    // 3. cloneGlobalTemplate must have been called exactly once
    await expect(cloneGlobalTemplateSpy).toHaveBeenCalledTimes(1);

    // 4. Verify it was called with (templateId, orgId) matching the first global template
    await expect(cloneGlobalTemplateSpy).toHaveBeenCalledWith(
      GLOBAL_TEMPLATES[0].id,  // 't-001'
      ORG_ID,                  // 'org-daph-th-001'
    );
  },
};
