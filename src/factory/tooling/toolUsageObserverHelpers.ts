/**
 * toolUsageObserverHelpers.ts - Observer Helper Functions
 *
 * Pure helper functions for tool usage observation.
 * No side effects, deterministic.
 *
 * @version 1.0.0 - Phase D6-B
 */

import type { ToolIdentity, ToolUsageEvent } from './types';

/**
 * Stable sort events for deterministic ordering.
 * Sort key: toolId | holeKind | diameterMm | depthMm | material | jobId
 */
export function stableSortEvents(events: ToolUsageEvent[]): ToolUsageEvent[] {
  return [...events].sort((a, b) => {
    // Deterministic ordering: toolId, holeKind, diameter, depth, material, jobId
    const kA = `${a.tool.toolId}|${a.holeKind}|${a.diameterMm}|${a.depthMm}|${a.material}|${a.jobId}`;
    const kB = `${b.tool.toolId}|${b.holeKind}|${b.diameterMm}|${b.depthMm}|${b.material}|${b.jobId}`;
    return kA < kB ? -1 : kA > kB ? 1 : 0;
  });
}

/**
 * Create a ToolIdentity from toolId and optional diameter.
 */
export function makeToolIdentity(toolId: string, diameterMm?: number): ToolIdentity {
  return { toolId, diameterMm };
}

/**
 * Normalize a number to specified decimal places.
 * Returns 0 for non-finite values.
 */
export function normalizeNumber(n: number, decimals = 3): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/**
 * Clamp a number to non-negative.
 * Returns 0 for non-finite or negative values.
 */
export function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
