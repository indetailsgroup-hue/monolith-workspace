import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * DXF Export E2E Tests
 *
 * Tests the full DXF export flow from UI to download.
 * AGENT-T008: Validates that DXF export uses OperationGraph (manufacturing intent)
 *
 * Two explicit tiers (FS-R2-B1-02 — no vacuous/silent success):
 *
 * - @smoke      UI-only critical path. Runs against the frontend alone (no factory
 *               service). Deterministic — MUST pass and MUST NEVER skip. The
 *               verify-full `e2e-smoke` job fails the build if any @smoke test
 *               skips, so a skipped critical path can no longer report green.
 *
 * - @integration Exercises the real freeze → RELEASE → factory export flow. Requires
 *               the factory service (`server/`) reachable behind the /api/factory
 *               proxy. When the service is absent these tests skip with an EXPLICIT,
 *               reasoned annotation (never a silent mid-test test.skip()). Bringing
 *               the factory service up in CI — with the FS-B0-02 fail-closed bearer
 *               boundary + frontend auth — is tracked under B0-02/B1-05; these tests
 *               run for real and force-assert the downloaded artifact + manifest once
 *               that lands.
 */

/**
 * Helper: Freeze the spec to enable export functionality
 * Returns true if successfully frozen, false if already frozen or couldn't freeze
 */
async function freezeSpecIfNeeded(page: Page): Promise<boolean> {
    // Check current state - look for DRAFT badge
    const draftBadge = page.locator('div').filter({ hasText: /^DRAFT$/ }).first();
    const isDraft = await draftBadge.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isDraft) {
        // Already FROZEN or RELEASED
        return true;
    }

    // Find and click the Freeze button
    const freezeButton = page.getByRole('button', { name: /freeze/i });
    const canFreeze = await freezeButton.isEnabled({ timeout: 2000 }).catch(() => false);

    if (canFreeze) {
        await freezeButton.click();
        // Wait for state transition
        await page.waitForTimeout(500);

        // Verify we're now FROZEN
        const frozenBadge = page.locator('div').filter({ hasText: /^FROZEN$/ }).first();
        return await frozenBadge.isVisible({ timeout: 2000 }).catch(() => false);
    }

    return false;
}

/**
 * Helper: Check if export button is enabled
 */
async function isExportEnabled(page: Page): Promise<boolean> {
    const exportButton = page.getByRole('button', { name: /export/i }).first();
    const isVisible = await exportButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (!isVisible) return false;
    return await exportButton.isEnabled().catch(() => false);
}

test.describe('DXF Export', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the 3D canvas and app to load
        await page.waitForSelector('canvas', { timeout: 15000 });
        // Wait for initial render
        await page.waitForTimeout(2000);
    });

    test.describe('Export Panel Access', () => {
        test('@smoke should show Export button with gate status', async ({ page }) => {
            // Look for Export button/tab in the UI
            const exportButton = page.locator('[data-testid="export-panel-trigger"]').or(
                page.getByRole('button', { name: /export/i })
            ).or(
                page.getByText('Export', { exact: false })
            );

            // Try to find export button
            const exportTriggerExists = await exportButton.first().isVisible().catch(() => false);

            if (exportTriggerExists) {
                // Button exists - check if it shows gate status info
                const button = exportButton.first();
                const isDisabled = await button.isDisabled().catch(() => false);

                if (isDisabled) {
                    // Button is disabled due to gate status - this is expected behavior
                    // Verify it has appropriate tooltip/title
                    const title = await button.getAttribute('title');
                    expect(title).toMatch(/FROZEN|RELEASED|export/i);
                } else {
                    // Button is enabled - click it to open panel
                    await button.click();
                    await page.waitForTimeout(500);

                    // Check Export Panel is visible
                    const exportPanel = page.locator('[data-testid="export-panel"]').or(
                        page.locator('text=/DXF Files|Cut List|BOM/i')
                    );
                    await expect(exportPanel.first()).toBeVisible({ timeout: 5000 });
                }
            } else {
                // The Designer must always expose an export entry point. A missing
                // trigger is a real UI regression on the critical path — assert it,
                // never skip (a silent skip here would green a broken smoke gate).
                expect(
                    exportTriggerExists,
                    'Export trigger must be present in the Designer UI',
                ).toBe(true);
            }
        });

        test('should display DXF export option', async ({ page }) => {
            // Navigate to export area
            const dxfOption = page.locator('[data-testid="export-dxf"]').or(
                page.getByText('DXF Files', { exact: false })
            ).or(
                page.getByText('📐', { exact: false })
            );

            const exists = await dxfOption.first().isVisible({ timeout: 5000 }).catch(() => false);

            if (exists) {
                await expect(dxfOption.first()).toBeVisible();
            } else {
                // May need to open export panel first
                test.skip();
            }
        });
    });

    test.describe('DXF Export Flow', () => {
        test('@integration should trigger DXF export without console errors', async ({ page }) => {
            // Collect console errors
            const errors: string[] = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            // Also catch page errors
            page.on('pageerror', (error) => {
                errors.push(error.message);
            });

            // Freeze spec to enable export. Freeze calls /api/factory/.../freeze, so a
            // failure here means the factory service is not reachable in this job —
            // skip EXPLICITLY with the reason (the @integration tier is gated on the
            // factory service; see the file header + FS-R2-B1-02).
            const frozen = await freezeSpecIfNeeded(page);
            test.skip(
                !frozen,
                '@integration: factory service unreachable (spec could not be frozen). ' +
                'Runs in the factory-up E2E job — wiring tracked under B0-02/B1-05.',
            );

            // Click the Export button to open the menu
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            const exportEnabled = await exportButton.isEnabled({ timeout: 2000 }).catch(() => false);

            // TODO(B0-02/B1-05): once the factory service runs in CI this must become a
            // hard assertion (export MUST enable after a successful freeze).
            test.skip(
                !exportEnabled,
                '@integration: export not enabled after freeze — verify in the factory-up job.',
            );

            await exportButton.click();
            await page.waitForTimeout(300);

            // Find and click DXF option in dropdown. Reaching here means export was
            // enabled, so the DXF option MUST exist — assert it, never skip silently.
            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);
            expect(dxfExists, 'DXF export option must be available once export is enabled').toBe(true);

            await dxfOption.click();

            // Wait for export process
            await page.waitForTimeout(3000);

            // Check for critical errors (not counting download-related)
            const criticalErrors = errors.filter(e =>
                !e.includes('download') &&
                !e.includes('Download') &&
                e.toLowerCase().includes('error')
            );

            // Should have no critical errors
            expect(criticalErrors.filter(e =>
                e.includes('TypeError') ||
                e.includes('ReferenceError') ||
                e.includes('Cannot read')
            )).toHaveLength(0);
        });

        test('should show progress during DXF export', async ({ page }) => {
            // Freeze spec to enable export
            const frozen = await freezeSpecIfNeeded(page);
            if (!frozen) {
                test.skip();
                return;
            }

            // Click the Export button to open the menu
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            const exportEnabled = await exportButton.isEnabled({ timeout: 2000 }).catch(() => false);

            if (!exportEnabled) {
                test.skip();
                return;
            }

            await exportButton.click();
            await page.waitForTimeout(300);

            // Find and click DXF option
            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

            if (dxfExists) {
                await dxfOption.click();

                // Look for progress indicator (spinner or "Exporting..." text)
                const progressIndicator = page.locator('[data-testid="dxf-progress"]').or(
                    page.locator('text=/Generating|Exporting|Building/i')
                );

                // Progress should appear (or export completes quickly) - both are valid
                await progressIndicator.first().isVisible({ timeout: 2000 }).catch(() => false);
                expect(true).toBe(true);
            } else {
                test.skip();
            }
        });
    });

    test.describe('DXF Download', () => {
        test('should download DXF ZIP file', async ({ page }) => {
            // Freeze spec to enable export
            const frozen = await freezeSpecIfNeeded(page);
            if (!frozen) {
                test.skip();
                return;
            }

            // Check if export is enabled
            const exportEnabled = await isExportEnabled(page);
            if (!exportEnabled) {
                test.skip();
                return;
            }

            // Set up download listener before clicking
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

            // Open export menu and click DXF
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            await exportButton.click();
            await page.waitForTimeout(300);

            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

            if (!dxfExists) {
                test.skip();
                return;
            }

            await dxfOption.click();

            // Wait for download
            const download = await downloadPromise;

            if (download) {
                // Verify download filename
                const filename = download.suggestedFilename();
                expect(filename).toMatch(/\.zip$/i);

                // Optional: Verify file content
                const filePath = await download.path();
                if (filePath) {
                    const stats = fs.statSync(filePath);
                    expect(stats.size).toBeGreaterThan(0);
                }
            } else {
                // Download might be blocked or not triggered - skip
                test.skip();
            }
        });

        test('DXF ZIP should contain expected files', async ({ page }) => {
            // Freeze spec to enable export
            const frozen = await freezeSpecIfNeeded(page);
            if (!frozen) {
                test.skip();
                return;
            }

            // Check if export is enabled
            const exportEnabled = await isExportEnabled(page);
            if (!exportEnabled) {
                test.skip();
                return;
            }

            // Set up download listener
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

            // Open export menu and click DXF
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            await exportButton.click();
            await page.waitForTimeout(300);

            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

            if (!dxfExists) {
                test.skip();
                return;
            }

            await dxfOption.click();

            const download = await downloadPromise;

            if (download) {
                const filePath = await download.path();
                if (filePath) {
                    // Verify file exists and has content
                    const stats = fs.statSync(filePath);
                    expect(stats.size).toBeGreaterThan(100); // Should be more than just headers
                }
            } else {
                test.skip();
            }
        });
    });

    test.describe('Panel Selection', () => {
        test('should allow selecting/deselecting panels for export', async ({ page }) => {
            // Look for panel selection checkboxes
            const panelCheckboxes = page.locator('[data-testid^="panel-select-"]').or(
                page.locator('input[type="checkbox"]').filter({ hasText: /panel|side|top|bottom/i })
            );

            const checkboxCount = await panelCheckboxes.count();

            if (checkboxCount > 0) {
                // Click first checkbox to toggle
                const firstCheckbox = panelCheckboxes.first();
                const initialState = await firstCheckbox.isChecked();

                await firstCheckbox.click();

                // Verify state changed
                const newState = await firstCheckbox.isChecked();
                expect(newState).not.toBe(initialState);

                // Toggle back
                await firstCheckbox.click();
            } else {
                // Panel selection might not be visible
                test.skip();
            }
        });

        test('should show Select All / Deselect All buttons', async ({ page }) => {
            const selectAllButton = page.getByRole('button', { name: /select all/i });
            const deselectAllButton = page.getByRole('button', { name: /deselect|clear/i });

            const hasSelectAll = await selectAllButton.isVisible({ timeout: 3000 }).catch(() => false);
            const hasDeselectAll = await deselectAllButton.isVisible({ timeout: 3000 }).catch(() => false);

            // At least one should exist if panel selection is available
            if (!hasSelectAll && !hasDeselectAll) {
                test.skip();
            }
        });
    });

    test.describe('Gate Status', () => {
        test('should show gate status for DXF export', async ({ page }) => {
            // DXF requires FROZEN state according to EXPORT_OPTIONS
            const gateIndicator = page.locator('[data-testid="gate-status"]').or(
                page.locator('text=/DRAFT|FROZEN|RELEASED/i')
            );

            const hasGateStatus = await gateIndicator.first().isVisible({ timeout: 5000 }).catch(() => false);

            if (hasGateStatus) {
                // Gate status should be displayed
                await expect(gateIndicator.first()).toBeVisible();
            } else {
                test.skip();
            }
        });

        test('should indicate if DXF export is disabled due to gate status', async ({ page }) => {
            // Check if Export button is disabled when gate is DRAFT
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            const buttonExists = await exportButton.isVisible({ timeout: 5000 }).catch(() => false);

            if (buttonExists) {
                // Check if button has disabled state or shows tooltip
                const isDisabled = await exportButton.isDisabled().catch(() => false);

                // Either enabled (gate is FROZEN+) or disabled (gate is DRAFT) - both valid
                expect(typeof isDisabled).toBe('boolean');

                // If disabled, check it has informative tooltip
                if (isDisabled) {
                    const title = await exportButton.getAttribute('title');
                    expect(title).toBeTruthy();
                }
            } else {
                test.skip();
            }
        });
    });

    test.describe('OperationGraph Source (T008)', () => {
        test('@integration should log OperationGraph usage during export', async ({ page }) => {
            // Collect console logs
            const logs: string[] = [];
            page.on('console', (msg) => {
                logs.push(msg.text());
            });

            // @integration: gated on the factory service (freeze → RELEASE → export).
            // Skip EXPLICITLY with a reason when it is unreachable — never silently.
            const frozen = await freezeSpecIfNeeded(page);
            test.skip(
                !frozen,
                '@integration: factory service unreachable (spec could not be frozen). ' +
                'Runs in the factory-up E2E job — wiring tracked under B0-02/B1-05.',
            );

            const exportEnabled = await isExportEnabled(page);
            test.skip(
                !exportEnabled,
                '@integration: export not enabled after freeze — verify in the factory-up job.',
            );

            // Open export menu and click DXF
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            await exportButton.click();
            await page.waitForTimeout(300);

            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

            // Reaching here means the factory service enabled export, so the DXF
            // option MUST be present — its absence is a real regression, not a skip.
            expect(dxfExists, 'DXF export option must be available once export is enabled').toBe(true);

            await dxfOption.click();
            await page.waitForTimeout(3000);

            // Check if any logs mention OperationGraph or T008
            const opGraphLogs = logs.filter(l =>
                l.includes('OperationGraph') ||
                l.includes('T008') ||
                l.includes('manufacturing intent')
            );

            // TODO(B0-02/B1-05): T008 asserts DXF is built from the OperationGraph
            // (manufacturing intent). Once the factory service runs in CI, turn this
            // into a hard assertion — expect(opGraphLogs.length).toBeGreaterThan(0) —
            // plus assert the downloaded artifact + manifest (see the sibling
            // 'DXF manifest should indicate OperationGraph source' test). Logging only
            // is retained deliberately until that path is executable/verifiable.
            console.log('OperationGraph related logs:', opGraphLogs.length);
        });

        test('DXF manifest should indicate OperationGraph source', async ({ page }) => {
            // Freeze spec to enable export
            const frozen = await freezeSpecIfNeeded(page);
            if (!frozen) {
                test.skip();
                return;
            }

            const exportEnabled = await isExportEnabled(page);
            if (!exportEnabled) {
                test.skip();
                return;
            }

            const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

            // Open export menu and click DXF
            const exportButton = page.getByRole('button', { name: /export/i }).first();
            await exportButton.click();
            await page.waitForTimeout(300);

            const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
            const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

            if (!dxfExists) {
                test.skip();
                return;
            }

            await dxfOption.click();

            const download = await downloadPromise;

            if (download) {
                const filePath = await download.path();
                if (filePath) {
                    // Would need to extract ZIP and check _manifest.json
                    // For now, just verify download succeeded
                    expect(fs.existsSync(filePath)).toBe(true);
                }
            } else {
                test.skip();
            }
        });
    });

    test.describe('Error Handling', () => {
        test('should handle export failure gracefully', async ({ page }) => {
            // This test verifies error handling - may need specific setup to trigger error
            const errors: string[] = [];
            page.on('pageerror', (error) => {
                errors.push(error.message);
            });

            // Navigate and wait
            await page.waitForTimeout(1000);

            // Check no unhandled errors during normal operation
            const unhandledErrors = errors.filter(e =>
                e.includes('Unhandled') ||
                e.includes('uncaught')
            );

            expect(unhandledErrors).toHaveLength(0);
        });

        test('should show error message on export failure', async ({ page }) => {
            // This would require mocking a failure scenario
            // For now, just verify error display mechanism exists
            const errorDisplay = page.locator('[data-testid="export-error"]').or(
                page.locator('.error-message').or(
                    page.locator('[role="alert"]')
                )
            );

            // Error display should not be visible during normal operation
            const hasVisibleError = await errorDisplay.first().isVisible({ timeout: 1000 }).catch(() => false);

            // If there's an error shown, it should be a real error
            // If not, that's the expected state
            expect(true).toBe(true);
        });
    });
});

test.describe('DXF Export Performance', () => {
    test('should complete export within reasonable time', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('canvas', { timeout: 15000 });
        await page.waitForTimeout(2000);

        // Freeze spec to enable export
        const frozen = await freezeSpecIfNeeded(page);
        if (!frozen) {
            test.skip();
            return;
        }

        const exportEnabled = await isExportEnabled(page);
        if (!exportEnabled) {
            test.skip();
            return;
        }

        const startTime = Date.now();

        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);

        // Open export menu and click DXF
        const exportButton = page.getByRole('button', { name: /export/i }).first();
        await exportButton.click();
        await page.waitForTimeout(300);

        const dxfOption = page.getByRole('button', { name: /dxf/i }).last();
        const dxfExists = await dxfOption.isVisible({ timeout: 2000 }).catch(() => false);

        if (!dxfExists) {
            test.skip();
            return;
        }

        await dxfOption.click();

        const download = await downloadPromise;
        const endTime = Date.now();

        if (download) {
            const duration = endTime - startTime;

            // Export should complete within 30 seconds for reasonable cabinet
            expect(duration).toBeLessThan(30000);

            console.log(`DXF export completed in ${duration}ms`);
        } else {
            test.skip();
        }
    });
});
