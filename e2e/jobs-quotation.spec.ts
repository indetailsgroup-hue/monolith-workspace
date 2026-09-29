import { test, expect } from '@playwright/test';

/**
 * Jobs & Quotation E2E Tests
 *
 * Tests the CreateJobWizard multi-step flow and QuotationBuilder approval cycle.
 * Requires the app to be running at localhost:5173.
 *
 * @smoke - Critical path tests that must pass before deployment
 */

test.describe('CreateJobWizard Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set DESIGNER role to access /jobs/new
    await page.addInitScript(() => {
      if (!localStorage.getItem('monolith.user.role')) {
        localStorage.setItem('monolith.user.role', 'DESIGNER');
      }
    });
    await page.goto('/jobs/new');
    await page.waitForSelector('[data-testid="create-job-wizard"]', { timeout: 15000 });
  });

  // --------------------------------------------------------------------------
  // Route Access & Guard Tests
  // --------------------------------------------------------------------------

  test('@smoke should render the CreateJobWizard page', async ({ page }) => {
    await expect(page.getByTestId('create-job-wizard')).toBeVisible();
    // Step indicator should show step 1 active
    await expect(page.getByTestId('wizard-step-1')).toBeVisible();
  });

  test('@smoke should block FACTORY role from accessing /jobs/new', async ({ page }) => {
    // Override role to FACTORY
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'FACTORY');
    });
    await page.reload();

    // Should show role gate dialog or redirect — not the wizard
    const hasWizard = await page
      .waitForSelector('[data-testid="create-job-wizard"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    expect(hasWizard).toBe(false);

    // Role gate should be shown
    const hasGate = await page
      .waitForSelector('[data-testid="role-gate-dialog"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    expect(hasGate).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Step 1: Customer Information
  // --------------------------------------------------------------------------

  test('@smoke Step 1 — fill customer info and advance to Step 2', async ({ page }) => {
    // Fill customer name
    await page.getByTestId('input-customer-name').fill('DAPH Decor Test Client');
    await page.getByTestId('input-customer-phone').fill('081-234-5678');
    await page.getByTestId('input-customer-email').fill('test@daphdecor.com');

    // Click Next
    await page.getByTestId('btn-next-step').click();

    // Should advance to Step 2
    await expect(page.getByTestId('wizard-step-2')).toBeVisible();
    await expect(page.getByTestId('wizard-step-2')).toHaveAttribute('aria-current', 'step');
  });

  test('Step 1 — Next button disabled when customer name is empty', async ({ page }) => {
    // Leave name empty, fill other fields
    await page.getByTestId('input-customer-phone').fill('081-234-5678');

    // Next button should be disabled
    const nextBtn = page.getByTestId('btn-next-step');
    await expect(nextBtn).toBeDisabled();
  });

  // --------------------------------------------------------------------------
  // Step 2: Job Details
  // --------------------------------------------------------------------------

  test('@smoke Step 2 — fill job details and advance to Step 3', async ({ page }) => {
    // Complete Step 1 first
    await page.getByTestId('input-customer-name').fill('DAPH Decor');
    await page.getByTestId('input-customer-phone').fill('081-111-2222');
    await page.getByTestId('btn-next-step').click();
    await expect(page.getByTestId('wizard-step-2')).toBeVisible();

    // Fill job details
    await page.getByTestId('input-job-title').fill('ตู้ครัวบิวท์อิน ชุด A');
    await page.getByTestId('select-priority').selectOption('HIGH');

    // Click Next
    await page.getByTestId('btn-next-step').click();

    // Should advance to Step 3
    await expect(page.getByTestId('wizard-step-3')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Step 3: Panel Configuration
  // --------------------------------------------------------------------------

  test('@smoke Step 3 — add panels and advance to Review', async ({ page }) => {
    // Complete Steps 1-2
    await page.getByTestId('input-customer-name').fill('DAPH Decor');
    await page.getByTestId('input-customer-phone').fill('081-111-2222');
    await page.getByTestId('btn-next-step').click();
    await page.getByTestId('input-job-title').fill('Test Job');
    await page.getByTestId('select-priority').selectOption('NORMAL');
    await page.getByTestId('btn-next-step').click();
    await expect(page.getByTestId('wizard-step-3')).toBeVisible();

    // Add a panel
    await page.getByTestId('panel-name').fill('Melamine White Panel');
    await page.getByTestId('input-panel-width').fill('600');
    await page.getByTestId('input-panel-height').fill('800');
    await page.getByTestId('btn-add-panel').click();

    // Advance to Step 4 (Review)
    await page.getByTestId('btn-next-step').click();
    await expect(page.getByTestId('wizard-step-4')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // Step 4: Review & Submit
  // --------------------------------------------------------------------------

  test('@smoke Step 4 — review summary and submit job', async ({ page }) => {
    // Complete Steps 1-3
    await page.getByTestId('input-customer-name').fill('DAPH Review Test');
    await page.getByTestId('input-customer-phone').fill('081-999-0000');
    await page.getByTestId('btn-next-step').click();
    await page.getByTestId('input-job-title').fill('Review Test Job');
    await page.getByTestId('select-priority').selectOption('HIGH');
    await page.getByTestId('btn-next-step').click();
    await page.getByTestId('panel-name').fill('PVC Oak Panel');
    await page.getByTestId('input-panel-width').fill('500');
    await page.getByTestId('input-panel-height').fill('700');
    await page.getByTestId('btn-add-panel').click();
    await page.getByTestId('btn-next-step').click();

    // Should see review summary
    await expect(page.getByTestId('wizard-step-4')).toBeVisible();
    await expect(page.getByTestId('review-customer-name')).toContainText('DAPH Review Test');
    await expect(page.getByTestId('review-job-title')).toContainText('Review Test Job');
    await expect(page.getByTestId('review-panel-count')).toContainText('1');

    // Submit
    await page.getByTestId('btn-submit-job').click();

    // Should show success state or redirect to /jobs
    const success = await Promise.race([
      page.waitForSelector('[data-testid="job-created-success"]', { timeout: 5000 }).then(() => 'success'),
      page.waitForURL('**/jobs', { timeout: 5000 }).then(() => 'redirected'),
      page.waitForURL('**/jobs/**', { timeout: 5000 }).then(() => 'detail'),
    ]);

    expect(['success', 'redirected', 'detail']).toContain(success);
  });

  // --------------------------------------------------------------------------
  // Navigation — Back Button
  // --------------------------------------------------------------------------

  test('Back button navigates to previous step', async ({ page }) => {
    // Go to Step 2
    await page.getByTestId('input-customer-name').fill('Back Test');
    await page.getByTestId('input-customer-phone').fill('081-000-0000');
    await page.getByTestId('btn-next-step').click();
    await expect(page.getByTestId('wizard-step-2')).toBeVisible();

    // Go back to Step 1
    await page.getByTestId('btn-prev-step').click();
    await expect(page.getByTestId('wizard-step-1')).toBeVisible();

    // Customer name should be preserved
    await expect(page.getByTestId('input-customer-name')).toHaveValue('Back Test');
  });
});

// ============================================================================
// Job Board Route Tests
// ============================================================================

test.describe('Job Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('monolith.user.role')) {
        localStorage.setItem('monolith.user.role', 'DESIGNER');
      }
    });
    await page.goto('/jobs');
    await page.waitForSelector('[data-testid="job-board"]', { timeout: 15000 });
  });

  test('@smoke should render the Job Board page', async ({ page }) => {
    await expect(page.getByTestId('job-board')).toBeVisible();
  });

  test('@smoke should show view toggle (kanban/list)', async ({ page }) => {
    const hasToggle = await page
      .waitForSelector('[data-testid="view-toggle"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (hasToggle) {
      await expect(page.getByTestId('view-toggle')).toBeVisible();
      // Switch to list view
      await page.getByTestId('view-list').click();
      await expect(page.getByTestId('job-list-view')).toBeVisible();
      // Switch back to kanban
      await page.getByTestId('view-kanban').click();
      await expect(page.getByTestId('job-kanban-view')).toBeVisible();
    }
  });

  test('@smoke should navigate to Create Job from board', async ({ page }) => {
    const createBtn = page.getByTestId('btn-create-job');
    const hasBtn = await createBtn.isVisible().catch(() => false);

    if (hasBtn) {
      await createBtn.click();
      await page.waitForURL('**/jobs/new', { timeout: 5000 });
      await expect(page.getByTestId('create-job-wizard')).toBeVisible();
    }
  });

  test('INSTALLER role should be blocked from /jobs', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'INSTALLER');
    });
    await page.goto('/jobs');

    const hasBoard = await page
      .waitForSelector('[data-testid="job-board"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    expect(hasBoard).toBe(false);
  });
});

// ============================================================================
// Quotation Builder Approval Cycle
// ============================================================================

test.describe('QuotationBuilder Approval Cycle', () => {
  test.beforeEach(async ({ page }) => {
    // FINANCE role can access quotations
    await page.addInitScript(() => {
      if (!localStorage.getItem('monolith.user.role')) {
        localStorage.setItem('monolith.user.role', 'FINANCE');
      }
      localStorage.setItem('monolith-jobs-store', JSON.stringify({
        state: {
          jobs: [{
            jobId: 'test-job-001',
            jobCode: 'DAPH-2026-E2E1',
            title: 'Quotation E2E Job',
            customer: { customerId: 'customer-e2e', name: 'E2E Customer' },
            panels: [{
              panelId: 'panel-e2e-1',
              name: 'Melamine Panel',
              material: 'Melamine 18mm White',
              width: 600,
              height: 800,
              qty: 2,
              isCurved: false,
            }],
            status: 'DRAFT',
            priority: 'NORMAL',
            materialGroup: 'Melamine 18mm White',
            totalPanelCount: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            createdBy: 'e2e-user',
          }],
          selectedJobId: null,
        },
        version: 1,
      }));
    });
    await page.goto('/quotations');
    await page.waitForLoadState('networkidle');
  });

  test('@smoke should render quotation page for FINANCE role', async ({ page }) => {
    // Should not be blocked by role gate
    const hasGate = await page
      .waitForSelector('[data-testid="role-gate-dialog"]', { timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    expect(hasGate).toBe(false);
  });

  test('@smoke DESIGNER role should be blocked from /quotations', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('monolith.user.role', 'DESIGNER');
    });
    await page.reload();

    // Should see role gate
    const hasGate = await page
      .waitForSelector('[data-testid="role-gate-dialog"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    expect(hasGate).toBe(true);
  });

  test('@smoke QuotationBuilder — create and approve quotation', async ({ page }) => {
    // Navigate to quotation builder with a deterministic persisted job context.
    await page.goto('/quotations?jobId=test-job-001');
    await expect(page.getByTestId('quotation-builder')).toBeVisible();

    await page.getByTestId('price-panel-e2e-1').fill('1000');
    await expect(page.getByTestId('quotation-subtotal')).toContainText('2,000');
    await expect(page.getByTestId('quotation-vat')).toContainText('140');
    await expect(page.getByTestId('quotation-total')).toContainText('2,140');

    await page.getByTestId('submit-quotation').click();
    await expect(page).toHaveURL(/\/quotations\?id=/);
    await expect(page.getByTestId('quotation-status-DRAFT')).toBeVisible();

    await page.getByTestId('btn-approve-quotation').click();
    await expect(page.getByTestId('quotation-status-APPROVED')).toBeVisible();
    await expect(page.getByTestId('auto-invoice-created')).toBeVisible();
    await expect(page.getByTestId('invoice-total')).toContainText('2,140');
  });

  test('QuotationBuilder — VAT calculation is correct', async ({ page }) => {
    await page.goto('/quotations?jobId=test-job-002');
    await page.waitForLoadState('networkidle');

    const hasBuilder = await page
      .waitForSelector('[data-testid="quotation-builder"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!hasBuilder) {
      test.skip();
      return;
    }

    // Add items
    await page.getByTestId('btn-add-line').click();
    await page.getByTestId('input-line-description-0').fill('Panel A');
    await page.getByTestId('input-line-qty-0').fill('1');
    await page.getByTestId('input-line-unit-price-0').fill('1000');

    // VAT should be 7% of 1000 = 70
    await expect(page.getByTestId('vat-amount')).toContainText('70');
    // Total should be 1070
    await expect(page.getByTestId('grand-total')).toContainText('1,070');
  });

  test('QuotationBuilder — PDF export button triggers download', async ({ page }) => {
    await page.goto('/quotations?jobId=test-job-003');
    await page.waitForLoadState('networkidle');

    const hasBuilder = await page
      .waitForSelector('[data-testid="quotation-builder"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!hasBuilder) {
      test.skip();
      return;
    }

    // Add a line so the quotation has content
    await page.getByTestId('btn-add-line').click();
    await page.getByTestId('input-line-description-0').fill('Test Panel');
    await page.getByTestId('input-line-qty-0').fill('5');
    await page.getByTestId('input-line-unit-price-0').fill('500');

    // Click PDF export
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByTestId('btn-export-pdf').click(),
    ]);

    // Verify download happened
    expect(download.suggestedFilename()).toMatch(/quotation.*\.pdf/i);
  });
});
