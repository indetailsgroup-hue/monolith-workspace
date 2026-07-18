import { test, expect, Page } from '@playwright/test';

/**
 * Factory verify flow — deterministic lane (FS 2026-07-18, execution order #4)
 *
 * The factory API is route-mocked, so these tests ALWAYS run in CI — they are
 * the guaranteed non-skipped coverage that lets the e2e-integration job
 * enforce "factory-flow may never all-skip" (a skipped lane must not report
 * a green gate). When the real factory service is wired into CI (B1-05),
 * service-backed tests join this lane; these contract tests stay.
 *
 * They also regression-lock FS-B1-02 in the rendered UI: a storage-integrity
 * verdict must gate the swimlane honestly and must NEVER render as a
 * full-verification PASS (the pre-fix behavior fabricated exactly that).
 */

const PROJECT = 'e2e-fsflow-1';

function storageVerifyResponse(verdict: string) {
  return {
    ok: true,
    verdict,
    scope: 'STORAGE_INTEGRITY_ONLY',
    expected: 'a'.repeat(64),
    computed: verdict.endsWith('MISMATCH') ? 'b'.repeat(64) : 'a'.repeat(64),
    bytes: 8092,
  };
}

async function mockVerify(page: Page, verdict: string): Promise<void> {
  await page.route('**/factory/jobs/**/verify', (route) =>
    route.fulfill({ json: storageVerifyResponse(verdict) }),
  );
}

test.describe('factory verify flow — storage-hash verdict contract (mocked factory API)', () => {
  test('storage hash match renders the storage verdict and opens the export lane', async ({ page }) => {
    await mockVerify(page, 'STORAGE_HASH_MATCH');
    await page.goto(`/projects/${PROJECT}`);

    // the pill must say STORAGE HASH — never the full-verification PASS label
    await expect(page.getByText('STORAGE HASH', { exact: false }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('✓ PASS', { exact: true })).toHaveCount(0);

    // export lane: verdict known + gate satisfied -> in progress (not blocked/pending)
    const exportLane = page.locator('div').filter({ hasText: 'ส่งออก' }).last();
    await expect(exportLane).toContainText('in progress');
  });

  test('legacy PASS response (pre-deploy Edge) still renders as storage verdict, not PASS', async ({ page }) => {
    await mockVerify(page, 'PASS');
    await page.goto(`/projects/${PROJECT}`);

    await expect(page.getByText('STORAGE HASH', { exact: false }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('✓ PASS', { exact: true })).toHaveCount(0);
  });

  test('storage hash mismatch fails closed: FAIL pill and export lane not opened', async ({ page }) => {
    await mockVerify(page, 'STORAGE_HASH_MISMATCH');
    await page.goto(`/projects/${PROJECT}`);

    await expect(page.getByText('✗ FAIL', { exact: false }).first()).toBeVisible({ timeout: 20000 });

    const exportLane = page.locator('div').filter({ hasText: 'ส่งออก' }).last();
    await expect(exportLane).not.toContainText('in progress');
  });
});
