/**
 * pairKeyV2.ts - Content-addressed connector pair key
 *
 * Builds a stable, content-addressed key for a connector pair
 * based on physical System32 position rather than loop index.
 *
 * Format: "pair2-{cornerType}-{round(sys32Z)}"
 * Examples: "pair2-TOP_RIGHT-37", "pair2-BOTTOM_LEFT-229"
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
 * Build a content-addressed pair key from corner type and System32 Z position.
 *
 * @param cornerType - Corner position (TOP_LEFT, TOP_RIGHT, etc.)
 * @param sys32Z - System32 position from front edge (mm)
 * @returns Stable key string, e.g. "pair2-TOP_RIGHT-37"
 */
export function buildPairKeyV2(cornerType: CornerType, sys32Z: number): string {
  return `pair2-${cornerType}-${Math.round(sys32Z)}`;
}

/**
 * Check whether a key is in pairKeyV2 format.
 * Useful for migration detection and dual-read logic.
 */
export function isPairKeyV2(key: string): boolean {
  return key.startsWith('pair2-');
}
