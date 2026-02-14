/**
 * Rule: Back Panel Clearance
 *
 * @module gate/rules/rule_clearance_backPanel
 * @version 0.1.0
 *
 * Validates that shelves maintain proper clearance from the cabinet back panel.
 * Prevents shelves from colliding with back panel during assembly.
 *
 * ## Issue Codes
 * - `B_CLEARANCE_BACKPANEL` (BLOCKER): Shelf flush to back without clearance
 *
 * ## Why This Matters
 * Back panels are typically rebated or slotted into cabinet sides. If a shelf
 * extends flush to the back, it may:
 * - Block back panel installation
 * - Create assembly sequence conflicts
 * - Cause gaps if back panel thickness isn't accounted for
 *
 * ## Current Implementation (v0.1)
 * Uses tag-based detection (`SHELF` + `FLUSH_BACK` tags).
 * Future versions will use actual depth geometry measurements.
 *
 * @example
 * // Shelf tagged as FLUSH_BACK with 4mm back panel
 * // Requires at least 2mm clearance → BLOCKER
 */

import type { GateIssue, GatePolicy, GateInput } from '../types';
import { issueId } from '../utils/idGen';

/**
 * Validates back panel clearance for shelf parts.
 *
 * Checks parts tagged as `SHELF` + `FLUSH_BACK` against the cabinet's
 * back panel thickness and required clearance.
 *
 * @param policy - Gate policy containing backPanelClearanceMm
 * @param input - Gate input containing parts and cabinet metadata
 * @returns Array of blocker issues for clearance violations
 *
 * @example
 * const issues = ruleClearanceBackPanel(policy, input);
 * if (issues.length > 0) {
 *   // Shelves need setback from back panel
 *   console.error('Adjust shelf depth for back panel clearance');
 * }
 *
 * @see {@link GatePolicy.backPanelClearanceMm} for clearance setting
 */
export function ruleClearanceBackPanel(
  policy: GatePolicy,
  input: GateInput
): GateIssue[] {
  const issues: GateIssue[] = [];
  const backT = input.cabinet?.backPanelThicknessMm ?? 0;

  // If no back panel thickness known, skip validation (v0.1)
  if (backT <= 0) return issues;

  const clearance = policy.backPanelClearanceMm;

  for (const p of input.parts) {
    const tags = new Set(p.tags ?? []);

    // Only check parts tagged as SHELF
    if (!tags.has('SHELF')) continue;

    // If shelf is tagged as FLUSH_BACK, require clearance
    if (tags.has('FLUSH_BACK')) {
      issues.push({
        id: issueId('B_CLEARANCE_BACKPANEL', p.partId, backT, clearance),
        severity: 'BLOCKER',
        code: 'B_CLEARANCE_BACKPANEL',
        message: `Shelf is flush to back panel; requires clearance ≥ ${clearance}mm to avoid collision.`,
        partIds: [p.partId],
        context: {
          backPanelThicknessMm: backT,
          requiredClearanceMm: clearance,
        },
      });
    }
  }

  return issues;
}
