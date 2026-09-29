/**
 * src/jobs/__tests__/ProcessTemplateList.visual.spec.ts
 *
 * MONOLITH v17.0 — Visual Regression Tests for <ProcessTemplateList>
 *
 * Uses `@chromatic-com/playwright` to capture named snapshots of Storybook
 * stories and upload them to Chromatic for visual diffing.
 *
 * Run with:
 *   npx chromatic --playwright --project-token=$CHROMATIC_PROJECT_TOKEN
 *
 * Stories covered:
 *   - Default (STARTER plan, 6 templates, mixed categories)
 *   - CategoryFilterCabinet (CABINET only)
 *   - GlobalOnlyFilter
 *   - PlanGateWallFree (FREE plan — locked view)
 *   - LoadingSkeleton (6 skeleton cards)
 *   - EmptyStateNoResults (search with no match)
 *   - EmptyStateFirstRun (no templates at all)
 *   - ErrorBanner
 *   - AdminView (clone button visible)
 *   - ProfessionalPlanUnlocked (PROFESSIONAL+ template accessible)
 */

import { test, takeSnapshot } from '@chromatic-com/playwright';
import { expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function gotoStory(
  page: import('@playwright/test').Page,
  storyId: string,
): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#storybook-root', { timeout: 15_000 });
  await page.waitForTimeout(300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Story IDs (title: Jobs/ProcessTemplateList → jobs-processtemplatelist)
// ─────────────────────────────────────────────────────────────────────────────

const STORY = {
  default:                 'jobs-processtemplatelist--default',
  categoryFilterCabinet:   'jobs-processtemplatelist--category-filter-cabinet',
  globalOnlyFilter:        'jobs-processtemplatelist--global-only-filter',
  planGateWallFree:        'jobs-processtemplatelist--plan-gate-wall-free',
  loadingSkeleton:         'jobs-processtemplatelist--loading-skeleton',
  emptyStateNoResults:     'jobs-processtemplatelist--empty-state-no-results',
  emptyStateFirstRun:      'jobs-processtemplatelist--empty-state-first-run',
  errorBanner:             'jobs-processtemplatelist--error-banner',
  adminView:               'jobs-processtemplatelist--admin-view',
  professionalUnlocked:    'jobs-processtemplatelist--professional-plan-unlocked',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Visual snapshot tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ProcessTemplateList — Visual Regression', () => {
  test('Default: STARTER plan, 6 templates mixed categories', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('process-template-list')).toBeVisible();
    const cards = page.locator('[data-testid="template-card"]');
    await expect(cards.first()).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Default', testInfo);
  });

  test('CategoryFilter: CABINET templates only', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.categoryFilterCabinet);
    await expect(page.getByTestId('process-template-list')).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Category Filter CABINET', testInfo);
  });

  test('GlobalOnlyFilter: only global templates shown', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.globalOnlyFilter);
    await expect(page.getByTestId('process-template-list')).toBeVisible();
    const globalBadges = page.locator('[data-testid="global-badge"]');
    await expect(globalBadges.first()).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Global Only Filter', testInfo);
  });

  test('PlanGateWallFree: FREE plan sees upgrade prompt', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.planGateWallFree);
    await expect(page.getByTestId('plan-gate-wall')).toBeVisible();
    await expect(page.locator('text=STARTER+')).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Plan Gate Wall (FREE)', testInfo);
  });

  test('LoadingSkeleton: 6 animated skeleton cards', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.loadingSkeleton);
    await expect(page.getByTestId('template-loading')).toBeVisible();
    const skeletons = page.locator('[data-testid="template-skeleton"]');
    await expect(skeletons).toHaveCount(6);
    await takeSnapshot(page, 'ProcessTemplateList — Loading Skeleton', testInfo);
  });

  test('EmptyStateNoResults: no templates for search term', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.emptyStateNoResults);
    await expect(page.getByTestId('template-empty-state')).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Empty State (No Results)', testInfo);
  });

  test('EmptyStateFirstRun: no templates exist yet', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.emptyStateFirstRun);
    await expect(page.getByTestId('template-empty-state')).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Empty State (First Run)', testInfo);
  });

  test('ErrorBanner: error message displayed', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.errorBanner);
    await expect(page.getByTestId('error-banner')).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Error Banner', testInfo);
  });

  test('AdminView: Clone button visible on global templates', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.adminView);
    await expect(page.getByTestId('process-template-list')).toBeVisible();
    const cloneBtns = page.locator('[data-testid="clone-template-btn"]');
    await expect(cloneBtns.first()).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — Admin View (Clone visible)', testInfo);
  });

  test('ProfessionalPlan: PROFESSIONAL+ template accessible', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.professionalUnlocked);
    await expect(page.getByTestId('process-template-list')).toBeVisible();
    const planBadges = page.locator('[data-testid="plan-gate-badge"]');
    await expect(planBadges.first()).toBeVisible();
    await takeSnapshot(page, 'ProcessTemplateList — PROFESSIONAL Plan Unlocked', testInfo);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction snapshots — state AFTER user action
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ProcessTemplateList — Interaction Snapshots', () => {
  test('Search input: typed query state captured', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('process-template-list')).toBeVisible();

    const searchInput = page.getByTestId('template-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Cabinet');
    await page.waitForTimeout(350); // debounce 300ms + buffer
    await takeSnapshot(page, 'ProcessTemplateList — Search Typed (Cabinet)', testInfo);
  });

  test('Category dropdown: CNC selected state', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('process-template-list')).toBeVisible();

    const categorySelect = page.getByTestId('category-filter');
    await categorySelect.selectOption('CNC');
    await page.waitForTimeout(200);
    await takeSnapshot(page, 'ProcessTemplateList — Category Dropdown (CNC)', testInfo);
  });
});
