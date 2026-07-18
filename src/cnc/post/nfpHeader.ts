/**
 * nfpHeader.ts — ADR-065 Q3: NOT-FOR-PRODUCTION header for G-code output
 *
 * While SHADOW_MODE is on, EVERY G-code dialect must carry a NOT-FOR-PRODUCTION
 * marking near the top of the program so no file near a machine is unlabeled.
 *
 * The label is a safety marking, not an informational comment — dialects must
 * emit it even when includeComments is false (use raw emission, not the
 * comment-suppressing helpers).
 *
 * Values are imported from shadowMode.ts (single source of truth — do not fork).
 */

import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_LABEL,
} from '../../core/config/shadowMode';

/**
 * Plain-text NFP header lines.
 *
 * ASCII-only and free of parentheses so the lines are safe inside every
 * dialect's comment syntax (FANUC parenthesis comments reject nested parens).
 *
 * Returns an empty array when shadow mode is off, so dialects can emit the
 * result unconditionally.
 */
export function getNfpHeaderLines(): string[] {
  if (!SHADOW_MODE_NOT_FOR_PRODUCTION) return [];
  return [
    `*** ${NOT_FOR_PRODUCTION_LABEL} - ADR-065 SHADOW MODE ***`,
    'DO NOT CUT REAL WORKPIECES FROM THIS PROGRAM',
  ];
}
