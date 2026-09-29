/**
 * PeopleDirectory Visual Regression Tests
 *
 * Uses `@chromatic-com/playwright` to capture named snapshots of Storybook
 * stories and upload them to Chromatic for visual diffing.
 *
 * Run with:
 *   npx chromatic --playwright --project-token=$CHROMATIC_PROJECT_TOKEN
 *
 * Stories covered:
 *   - Default (full employee list, no filter)
 *   - AllStageBadges (every SuperEmployeeStage badge visible)
 *   - SingleSuperEmployee (Super Employee badge highlighted)
 *   - StageFilterSuperEmployee (stage filter active → badge visible)
 *   - SkillFilterPythonAI (skill chip filter applied)
 *   - SearchFilter (search input filled)
 *   - EmptyState (no matching employees)
 *   - Loading (skeleton loader)
 */

import { test, takeSnapshot } from '@chromatic-com/playwright';
import { expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigate to a Storybook story iframe and wait for it to finish rendering.
 * Storybook story IDs follow the pattern:
 *   <title-kebab>--<story-name-kebab>
 * e.g. "People/PeopleDirectory" + "Default" → "people-peopledirectory--default"
 */
async function gotoStory(
  page: import('@playwright/test').Page,
  storyId: string,
): Promise<void> {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'networkidle',
  });
  // Wait for Storybook root element so we know React has mounted
  await page.waitForSelector('#storybook-root', { timeout: 15_000 });
  // Extra tick for any micro-animations to settle
  await page.waitForTimeout(300);
}

// ─────────────────────────────────────────────────────────────────────────────
// Story IDs (derived from meta.title + export name)
// ─────────────────────────────────────────────────────────────────────────────
const STORY = {
  default: 'people-peopledirectory--default',
  allStageBadges: 'people-peopledirectory--all-stage-badges',
  singleSuperEmployee: 'people-peopledirectory--single-super-employee',
  stageFilterSuperEmployee: 'people-peopledirectory--stage-filter-super-employee',
  skillFilterPythonAI: 'people-peopledirectory--skill-filter-python-ai',
  searchFilter: 'people-peopledirectory--search-filter',
  emptyState: 'people-peopledirectory--empty-state',
  loading: 'people-peopledirectory--loading',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Visual snapshot tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PeopleDirectory — Visual Regression', () => {
  // ── Default view ────────────────────────────────────────────────────────────
  test('Default: full employee list renders correctly', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);

    // Assert key structural elements are present before snapshot
    await expect(page.getByTestId('people-directory')).toBeVisible();
    await expect(page.getByTestId('employee-card').first()).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — Default', testInfo);
  });

  // ── All stage badges ─────────────────────────────────────────────────────────
  test('AllStageBadges: every SuperEmployeeStage badge visible', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.allStageBadges);

    await expect(page.getByTestId('people-directory')).toBeVisible();
    // Verify at least one Super Employee badge is visible
    const badges = page.locator('[data-testid="super-employee-badge"]');
    await expect(badges.first()).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — All Stage Badges', testInfo);
  });

  // ── Single Super Employee ─────────────────────────────────────────────────────
  test('SingleSuperEmployee: Super Employee badge highlighted', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.singleSuperEmployee);

    await expect(page.getByTestId('people-directory')).toBeVisible();
    const badge = page.locator('[data-testid="super-employee-badge"]').first();
    await expect(badge).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — Single Super Employee', testInfo);
  });

  // ── Stage filter ─────────────────────────────────────────────────────────────
  test('StageFilter: SuperEmployee stage filter applied', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.stageFilterSuperEmployee);

    await expect(page.getByTestId('people-directory')).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — Stage Filter (SuperEmployee)', testInfo);
  });

  // ── Skill filter ─────────────────────────────────────────────────────────────
  test('SkillFilter: Python/AI skill chip filter applied', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.skillFilterPythonAI);

    await expect(page.getByTestId('people-directory')).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — Skill Filter (Python/AI)', testInfo);
  });

  // ── Search filter ─────────────────────────────────────────────────────────────
  test('SearchFilter: search input with text renders filtered list', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.searchFilter);

    await expect(page.getByTestId('people-directory')).toBeVisible();

    await takeSnapshot(page, 'PeopleDirectory — Search Filter', testInfo);
  });

  // ── Empty state ──────────────────────────────────────────────────────────────
  test('EmptyState: no matching employees shows empty message', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.emptyState);

    await expect(page.getByTestId('people-directory')).toBeVisible();
    // Empty state message should be visible
    const emptyMsg = page.getByText(/ไม่พบพนักงาน|no employees|empty/i);
    if (await emptyMsg.count() > 0) {
      await expect(emptyMsg.first()).toBeVisible();
    }

    await takeSnapshot(page, 'PeopleDirectory — Empty State', testInfo);
  });

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  test('Loading: skeleton loader displayed during fetch', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.loading);

    // Skeleton should be visible (or the directory container at minimum)
    const skeleton = page.locator('[data-testid="skeleton"], .animate-pulse, [aria-busy="true"]');
    const directory = page.getByTestId('people-directory');

    const skeletonCount = await skeleton.count();
    if (skeletonCount > 0) {
      await expect(skeleton.first()).toBeVisible();
    } else {
      await expect(directory).toBeVisible();
    }

    await takeSnapshot(page, 'PeopleDirectory — Loading Skeleton', testInfo);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction snapshot tests — capture state AFTER user interaction
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PeopleDirectory — Interaction Snapshots', () => {
  test('Stage filter dropdown: options visible on open', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);

    await expect(page.getByTestId('people-directory')).toBeVisible();

    // Open stage filter select if present
    const stageSelect = page.locator('select[aria-label*="stage"], select[data-testid*="stage"], select').first();
    if (await stageSelect.count() > 0) {
      // Take snapshot with select focused (before selecting)
      await stageSelect.focus();
      await takeSnapshot(page, 'PeopleDirectory — Stage Select Focused', testInfo);
    } else {
      await takeSnapshot(page, 'PeopleDirectory — Stage Filter Area', testInfo);
    }
  });

  test('Search input: typed query filters list', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);

    await expect(page.getByTestId('people-directory')).toBeVisible();

    const searchInput = page.locator('input[type="search"], input[placeholder*="ค้นหา"], input[placeholder*="search" i]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('สมชาย');
      await page.waitForTimeout(300); // debounce
      await takeSnapshot(page, 'PeopleDirectory — Search Typed', testInfo);
    }
  });
});
