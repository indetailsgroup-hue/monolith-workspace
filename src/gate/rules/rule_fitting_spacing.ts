/**
 * Rule: Fitting Spacing
 *
 * @module gate/rules/rule_fitting_spacing
 * @version 0.1.0
 *
 * Validates minimum spacing between hardware fittings on the same panel.
 * Prevents fittings from overlapping or being too close to function properly.
 *
 * ## Issue Codes
 * - `B_FITTING_SPACING` (BLOCKER): Two fittings are closer than minimum distance
 *
 * ## Why This Matters
 * - Minifix cams have 15mm diameter - need space between them
 * - System 32 spacing is industry standard (32mm pitch)
 * - Overlapping drill holes weaken the panel
 *
 * ## Algorithm
 * 1. Groups fittings by partId
 * 2. Sorts fittings deterministically for reproducible results
 * 3. Checks Euclidean distance between all pairs
 * 4. Respects groupKey for organized fitting sets
 *
 * @example
 * // Two cams at (100, 37) and (110, 37) with min=32mm
 * // Distance = 10mm < 32mm → BLOCKER
 */

import type { FittingIntent, GateIssue, GatePolicy, PartSpec } from '../types';
import { issueId } from '../utils/idGen';

/**
 * Validates minimum spacing between fittings on the same panel.
 *
 * Uses Euclidean distance calculation and respects groupKey to allow
 * fittings from different logical groups to overlap if needed.
 *
 * @param policy - Gate policy containing minFittingSpacingMm
 * @param _parts - Part specifications (reserved for future use)
 * @param fittings - Array of fitting intents with positions
 * @returns Array of blocker issues for spacing violations
 *
 * @example
 * const issues = ruleFittingSpacing(policy, parts, fittings);
 * for (const issue of issues) {
 *   console.log(`${issue.context.fittingA} too close to ${issue.context.fittingB}`);
 * }
 *
 * @see {@link GatePolicy.minFittingSpacingMm} for spacing threshold
 */
export function ruleFittingSpacing(
  policy: GatePolicy,
  _parts: PartSpec[],
  fittings: FittingIntent[]
): GateIssue[] {
  // Group fittings by part
  const byPart = new Map<string, FittingIntent[]>();
  for (const f of fittings) {
    const arr = byPart.get(f.partId) ?? [];
    arr.push(f);
    byPart.set(f.partId, arr);
  }

  const issues: GateIssue[] = [];
  const min = policy.minFittingSpacingMm;

  for (const [partId, list] of byPart) {
    // Deterministic ordering for reproducible results
    const sorted = [...list].sort(
      (a, b) =>
        a.x - b.x ||
        a.y - b.y ||
        a.fittingId.localeCompare(b.fittingId)
    );

    // Check all pairs
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // If groupKey exists, only compare within same group to reduce noise
        if (a.groupKey && b.groupKey && a.groupKey !== b.groupKey) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);

        if (dist < min) {
          issues.push({
            id: issueId('B_FITTING_SPACING', a.fittingId, b.fittingId, dist),
            severity: 'BLOCKER',
            code: 'B_FITTING_SPACING',
            message: `Fittings are too close (${dist.toFixed(1)}mm < min ${min}mm).`,
            partIds: [partId],
            context: {
              fittingA: a.fittingId,
              fittingB: b.fittingId,
              distMm: Math.round(dist * 10) / 10,
              minFittingSpacingMm: min,
            },
          });
        }
      }
    }
  }

  return issues;
}
