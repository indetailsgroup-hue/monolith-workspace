import { test, expect } from '@playwright/test';

/**
 * Finance Dashboard E2E Tests
 *
 * Tests tab navigation, overdue filter interaction, and role-based visibility.
 * Requires the app to be running at localhost:5173 with the Finance Dashboard route.
 *
 * @smoke - Critical path tests that must pass before deployment
 */

test.describe('Finance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('monolith.user.role')) {
        localStorage.setItem('monolith.user.role', 'FINANCE');
      }
    });
    // Navigate to the Finance Dashboard page
    // The route pattern follows MONOLITH SPA routing
    await page.goto('/finance');
    // Wait for the dashboard to render
    await page.waitForSelector('[data-testid="finance-dashboard"]', { timeout: 15000 });
  });

  // --------------------------------------------------------------------------
  // Tab Navigation
  // --------------------------------------------------------------------------

  test('@smoke should render all 4 tab buttons', async ({ page }) => {
    await expect(page.getByTestId('tab-overview')).toBeVisible();
    await expect(page.getByTestId('tab-ledger')).toBeVisible();
    await expect(page.getByTestId('tab-receivables')).toBeVisible();
    await expect(page.getByTestId('tab-bankfeed')).toBeVisible();
  });

  test('@smoke should show Overview tab as default active tab', async ({ page }) => {
    const overviewTab = page.getByTestId('tab-overview');
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
  });

  test('@smoke should navigate between tabs', async ({ page }) => {
    // Click Ledger tab
    await page.getByTestId('tab-ledger').click();
    await expect(page.getByTestId('tab-ledger')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-selected', 'false');

    // Click Receivables tab
    await page.getByTestId('tab-receivables').click();
    await expect(page.getByTestId('tab-receivables')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-ledger')).toHaveAttribute('aria-selected', 'false');

    // Click Bank Feed tab
    await page.getByTestId('tab-bankfeed').click();
    await expect(page.getByTestId('tab-bankfeed')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-receivables')).toHaveAttribute('aria-selected', 'false');

    // Back to Overview
    await page.getByTestId('tab-overview').click();
    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-selected', 'true');
  });

  // --------------------------------------------------------------------------
  // Ledger Tab — Real-time RPC integration
  // --------------------------------------------------------------------------

  test('@smoke Ledger tab shows loading or data state', async ({ page }) => {
    await page.getByTestId('tab-ledger').click();

    // Should show either loading, error, or data — one of these must be present
    const loadingOrData = await Promise.race([
      page.waitForSelector('[data-testid="ledger-loading"]', { timeout: 3000 }).then(() => 'loading'),
      page.waitForSelector('[data-testid="ledger-error"]', { timeout: 3000 }).then(() => 'error'),
      page.waitForSelector('[data-testid="book-selector"]', { timeout: 3000 }).then(() => 'data'),
      page.waitForSelector('text=ยังไม่มีข้อมูลบัญชี', { timeout: 3000 }).then(() => 'empty'),
    ]);

    expect(['loading', 'error', 'data', 'empty']).toContain(loadingOrData);
  });

  test('Ledger tab has book and format selectors when data is available', async ({ page }) => {
    // Set up localStorage with a mock role to ensure access
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'FINANCE');
    });
    await page.reload();
    await page.waitForSelector('[data-testid="finance-dashboard"]');

    await page.getByTestId('tab-ledger').click();

    // Wait for either data state or error/empty
    const hasBookSelector = await page
      .waitForSelector('[data-testid="book-selector"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (hasBookSelector) {
      await expect(page.getByTestId('book-selector')).toBeVisible();
      await expect(page.getByTestId('format-selector')).toBeVisible();

      // Switch to External book
      await page.getByTestId('book-selector').selectOption('external');
      await expect(page.getByTestId('book-selector')).toHaveValue('external');

      // Switch format to IFRS
      await page.getByTestId('format-selector').selectOption('IFRS_Format3');
      await expect(page.getByTestId('format-selector')).toHaveValue('IFRS_Format3');
    }
  });

  // --------------------------------------------------------------------------
  // Receivables Tab — Overdue Filter Interaction
  // --------------------------------------------------------------------------

  test('@smoke Receivables tab renders table or empty state', async ({ page }) => {
    await page.getByTestId('tab-receivables').click();

    // Should show either the table or empty state
    const hasTable = await page
      .waitForSelector('[data-testid="receivables-table"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (hasTable) {
      await expect(page.getByTestId('receivables-table')).toBeVisible();
      await expect(page.getByTestId('overdue-filter')).toBeVisible();
    } else {
      await expect(page.getByText('ยังไม่มีข้อมูลลูกหนี้')).toBeVisible();
    }
  });

  test('@smoke Overdue filter toggles row visibility', async ({ page }) => {
    await page.getByTestId('tab-receivables').click();

    const hasTable = await page
      .waitForSelector('[data-testid="receivables-table"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!hasTable) {
      // An empty dataset is a valid deterministic state; assert it instead of
      // marking a release-critical smoke test as skipped.
      await expect(page.getByText('ยังไม่มีข้อมูลลูกหนี้')).toBeVisible();
      return;
    }

    // Count rows before filter
    const rowsBefore = await page.locator('[data-testid^="receivable-row-"]').count();

    // Toggle overdue filter
    const filterCheckbox = page.getByTestId('overdue-filter');
    await filterCheckbox.check();

    // Wait for UI update
    await page.waitForTimeout(300);

    // Count rows after filter — should be less (only overdue items)
    const rowsAfter = await page.locator('[data-testid^="receivable-row-"]').count();

    // If there are overdue items, filtered count should be <= total
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);

    // Uncheck to restore
    await filterCheckbox.uncheck();
    await page.waitForTimeout(300);
    const rowsRestored = await page.locator('[data-testid^="receivable-row-"]').count();
    expect(rowsRestored).toBe(rowsBefore);
  });

  // --------------------------------------------------------------------------
  // Role-based Column Visibility
  // --------------------------------------------------------------------------

  test('Receivables table shows full columns for FINANCE role', async ({ page }) => {
    // Set FINANCE role
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'FINANCE');
    });
    await page.reload();
    await page.waitForSelector('[data-testid="finance-dashboard"]');
    await page.getByTestId('tab-receivables').click();

    const hasTable = await page
      .waitForSelector('[data-testid="receivables-table"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!hasTable) {
      test.skip();
      return;
    }

    // FINANCE should see all 6 columns
    const headers = page.locator('[data-testid="receivables-table"] th');
    const headerCount = await headers.count();
    expect(headerCount).toBe(6);

    // Verify role indicator
    await expect(page.getByTestId('receivables-role-indicator')).toContainText('FINANCE');
  });

  test('Receivables table shows summary columns for ADMIN role', async ({ page }) => {
    // Set ADMIN role
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'ADMIN');
    });
    await page.reload();
    await page.waitForSelector('[data-testid="finance-dashboard"]');
    await page.getByTestId('tab-receivables').click();

    const hasTable = await page
      .waitForSelector('[data-testid="receivables-table"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!hasTable) {
      test.skip();
      return;
    }

    // ADMIN should see only 3 columns (amount, remaining, status)
    const headers = page.locator('[data-testid="receivables-table"] th');
    const headerCount = await headers.count();
    expect(headerCount).toBe(3);

    // Verify role indicator
    await expect(page.getByTestId('receivables-role-indicator')).toContainText('ADMIN');
  });

  // --------------------------------------------------------------------------
  // Bank Feed Tab — Basic
  // --------------------------------------------------------------------------

  test('@smoke Bank Feed tab shows reconciliation info or empty state', async ({ page }) => {
    await page.getByTestId('tab-bankfeed').click();

    const hasTable = await page
      .waitForSelector('[data-testid="bankfeed-table"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (hasTable) {
      await expect(page.getByTestId('bankfeed-table')).toBeVisible();
      await expect(page.getByTestId('reconciliation-bar')).toBeVisible();
    } else {
      await expect(page.getByText('ยังไม่มีข้อมูล Bank Feed')).toBeVisible();
    }
  });
});
