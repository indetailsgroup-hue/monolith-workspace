/**
 * src/jobs/__tests__/BottleneckHeatmap.visual.spec.ts
 *
 * MONOLITH v17.0 — Visual Regression Tests for <BottleneckHeatmap>
 *
 * Uses `@chromatic-com/playwright` to capture named snapshots of Storybook
 * stories and upload them to Chromatic for visual diffing.
 *
 * Run with:
 *   npx chromatic --playwright --project-token=$CHROMATIC_PROJECT_TOKEN
 *
 * Stories covered:
 *   - Default (PROFESSIONAL, mixed severity)
 *   - AllOKSeverity (all green)
 *   - AllCriticalSeverity (all red)
 *   - MixedSeverityWorstStage (ประกอบ highlighted)
 *   - TemplateScopedView (templateId + templateName)
 *   - LoadingState (skeleton)
 *   - EmptyState (no data yet)
 *   - PlanGateWallStarter (STARTER plan locked)
 *   - PlanGateWallFree (FREE plan locked)
 *   - ErrorBanner
 *   - SingleStage
 *   - EnterprisePlan
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
// Story IDs (title: Jobs/BottleneckHeatmap → jobs-bottleneckheatmap)
// ─────────────────────────────────────────────────────────────────────────────

const STORY = {
  default:                'jobs-bottleneckheatmap--default',
  allOK:                  'jobs-bottleneckheatmap--all-ok-severity',
  allCritical:            'jobs-bottleneckheatmap--all-critical-severity',
  mixedWorstStage:        'jobs-bottleneckheatmap--mixed-severity-worst-stage',
  templateScoped:         'jobs-bottleneckheatmap--template-scoped-view',
  loadingState:           'jobs-bottleneckheatmap--loading-state',
  emptyState:             'jobs-bottleneckheatmap--empty-state',
  planGateWallStarter:    'jobs-bottleneckheatmap--plan-gate-wall-starter',
  planGateWallFree:       'jobs-bottleneckheatmap--plan-gate-wall-free',
  errorBanner:            'jobs-bottleneckheatmap--error-banner',
  singleStage:            'jobs-bottleneckheatmap--single-stage',
  enterprise:             'jobs-bottleneckheatmap--enterprise-plan',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Visual snapshot tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('BottleneckHeatmap — Visual Regression', () => {
  test('Default: PROFESSIONAL plan, mixed severity stages', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    await expect(page.getByTestId('bottleneck-table')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Default', testInfo);
  });

  test('AllOKSeverity: all stages green (≤110%)', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.allOK);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    const severityTexts = page.locator('[data-testid="severity-text"]');
    await expect(severityTexts.first()).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — All OK (green)', testInfo);
  });

  test('AllCriticalSeverity: all stages red (>150%)', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.allCritical);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — All Critical (red)', testInfo);
  });

  test('MixedSeverity: worst stage "ประกอบ" highlighted', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.mixedWorstStage);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    const worstDisplay = page.getByTestId('worst-stage-display');
    await expect(worstDisplay).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Mixed Severity Worst Stage', testInfo);
  });

  test('TemplateScopedView: header shows template name', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.templateScoped);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    await expect(page.locator('text=Cabinet Kitchen Standard')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Template Scoped View', testInfo);
  });

  test('LoadingState: skeleton shown, table hidden', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.loadingState);
    await expect(page.getByTestId('bottleneck-loading')).toBeVisible();
    await expect(page.locator('[data-testid="bottleneck-heatmap"]')).toHaveCount(0);
    await takeSnapshot(page, 'BottleneckHeatmap — Loading State', testInfo);
  });

  test('EmptyState: no data message visible', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.emptyState);
    await expect(page.getByTestId('bottleneck-empty-state')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Empty State', testInfo);
  });

  test('PlanGateWallStarter: STARTER plan sees upgrade prompt', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.planGateWallStarter);
    await expect(page.getByTestId('bottleneck-plan-gate-wall')).toBeVisible();
    await expect(page.locator('text=PROFESSIONAL+')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Plan Gate Wall (STARTER)', testInfo);
  });

  test('PlanGateWallFree: FREE plan sees upgrade prompt', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.planGateWallFree);
    await expect(page.getByTestId('bottleneck-plan-gate-wall')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Plan Gate Wall (FREE)', testInfo);
  });

  test('ErrorBanner: error message displayed', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.errorBanner);
    await expect(page.getByTestId('bottleneck-error-banner')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Error Banner', testInfo);
  });

  test('SingleStage: one row in heatmap table', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.singleStage);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    const rows = page.locator('[data-testid="heatmap-row"]');
    await expect(rows).toHaveCount(1);
    await takeSnapshot(page, 'BottleneckHeatmap — Single Stage', testInfo);
  });

  test('EnterprisePlan: ENTERPRISE unlocked, same as PROFESSIONAL', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.enterprise);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — ENTERPRISE Plan', testInfo);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Severity color accuracy tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('BottleneckHeatmap — Severity Color Accuracy', () => {
  test('Summary bar: overall bottleneck rate is visible', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('bottleneck-summary-bar')).toBeVisible();
    await expect(page.getByTestId('overall-bottleneck-rate')).toBeVisible();
    await expect(page.getByTestId('total-bottleneck-events')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Summary Bar', testInfo);
  });

  test('Legend: OK/WARNING/CRITICAL legend items visible', async ({ page }, testInfo) => {
    await gotoStory(page, STORY.default);
    await expect(page.getByTestId('bottleneck-heatmap')).toBeVisible();
    await expect(page.locator('text=ปกติ (≤ 110%)')).toBeVisible();
    await expect(page.locator('text=ช้ากว่าแผน (111–150%)')).toBeVisible();
    await expect(page.locator('text=Bottleneck (> 150%)')).toBeVisible();
    await takeSnapshot(page, 'BottleneckHeatmap — Legend', testInfo);
  });
});
