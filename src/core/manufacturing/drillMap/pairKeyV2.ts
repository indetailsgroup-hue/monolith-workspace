/**
 * pairKeyV2.ts - Content-addressed connector pair key
 *
 * Builds a stable, content-addressed key for a connector pair
 * based on physical System32 position rather than loop index.
 *
 * Format: "pair2-{cornerType}[-B]-{round(sys32Pos)}"
 * A-run examples: "pair2-TOP_RIGHT-37", "pair2-BOTTOM_LEFT-229"
 * B-run examples: "pair2-TOP_RIGHT-B-37", "pair2-BOTTOM_LEFT-B-527"
 *
 * The Math.round() is a safety net for floating-point noise.
 * System32 grid positions are typically integers (37, 69, 101...)
 * but buildCadConnectorRunPositions can produce non-grid centre
 * positions that may have FP residue.
 *
 * @version 1.0.0
 */

import type { CornerType } from './types';

/**
 * Canonical run-axis tag inserted into pairKeyV2.
 * Single source of truth — never hardcode '-B-' or '-B' elsewhere.
 */
export const RUN_AXIS_TAG = { A: '', B: '-B' } as const satisfies Record<string, string>;

/** Type-safe run axis identifier */
export type RunAxis = keyof typeof RUN_AXIS_TAG;

/**
 * Regex that matches the root portion of a pairKeyV2.
 *
 * Captures:
 *   [1] cornerType  (e.g. TOP_LEFT)
 *   [2] axisTag     'B' | undefined   — present only for B-run
 *   [3] sys32Pos    integer string
 *
 * Examples:
 *   "pair2-TOP_LEFT-37"            → ['TOP_LEFT', undefined, '37']
 *   "pair2-TOP_LEFT-B-37"          → ['TOP_LEFT', 'B',       '37']
 *   "pair2-BOTTOM_RIGHT-B-527-..." → ['BOTTOM_RIGHT', 'B',   '527']
 */
export const PAIR_KEY_V2_RE =
  /^pair2-([A-Z_]+?)(?:-(B))?-(\d+)/;

/**
 * Build a content-addressed pair key from corner type and System32 position.
 *
 * @param cornerType - Corner position (TOP_LEFT, TOP_RIGHT, etc.)
 * @param sys32Pos - System32 position from reference edge (mm)
 * @param runAxis - Optional run axis: 'A' (depth, default) or 'B' (width)
 * @returns Stable key string, e.g. "pair2-TOP_RIGHT-37" or "pair2-TOP_RIGHT-B-37"
 */
export function buildPairKeyV2(cornerType: CornerType, sys32Pos: number, runAxis?: RunAxis): string {
  const axisTag = RUN_AXIS_TAG[runAxis ?? 'A'];
  return `pair2-${cornerType}${axisTag}-${Math.round(sys32Pos)}`;
}

/**
 * Parse-based run-axis detection.
 * Uses PAIR_KEY_V2_RE to extract the axis token — no substring guessing.
 */
export function isRunAxis(key: string, axis: RunAxis): boolean {
  const m = PAIR_KEY_V2_RE.exec(key);
  if (!m) return false; // not a valid pairKeyV2 at all
  const parsedAxis: RunAxis = m[2] === 'B' ? 'B' : 'A';
  return parsedAxis === axis;
}

/**
 * Check whether a key is in pairKeyV2 format.
 * Useful for migration detection and dual-read logic.
 */
export function isPairKeyV2(key: string): boolean {
  return key.startsWith('pair2-');
}
