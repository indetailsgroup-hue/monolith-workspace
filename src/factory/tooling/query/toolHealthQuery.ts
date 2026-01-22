/**
 * toolHealthQuery.ts - Tool Health Query Helpers
 *
 * Async queries for tool health status.
 * Reads from IndexedDB, computes health with D6-A wearModel.
 *
 * @version 1.0.0 - Phase D6-E.1
 */

import type { ToolHealth, ToolWearThreshold } from '../types';
import { computeToolHealth, DEFAULT_MAX_WEAR_UNITS } from '../wearModel';
import {
  getToolUsageRecord,
  listToolUsageRecords,
  getToolWearThreshold,
} from '../storage';

/**
 * Options for tool health queries.
 */
export type ToolHealthQueryOptions = {
  /** Percentage threshold for NEARING_LIMIT status (default: 85) */
  nearingLimitPct?: number;
  /** Include OVER_LIMIT tools in results (default: true) */
  includeOverLimit?: boolean;
};

/**
 * Default threshold for tools without explicit threshold.
 */
function defaultThreshold(toolId: string): ToolWearThreshold {
  return {
    toolId,
    maxWearUnits: DEFAULT_MAX_WEAR_UNITS,
  };
}

/**
 * Get health status for a single tool.
 *
 * @param toolId - Tool identifier
 * @param options - Query options
 * @returns ToolHealth or null if tool not found
 *
 * @example
 * ```typescript
 * const health = await getToolHealth('DRILL_5');
 * if (health?.status === 'NEARING_LIMIT') {
 *   console.warn(`Tool ${health.toolId} at ${health.healthPct}%`);
 * }
 * ```
 */
export async function getToolHealth(
  toolId: string,
  options?: ToolHealthQueryOptions
): Promise<ToolHealth | null> {
  const record = await getToolUsageRecord(toolId);
  if (!record) return null;

  const threshold = (await getToolWearThreshold(toolId)) ?? defaultThreshold(toolId);
  const nearingLimitPct = options?.nearingLimitPct ?? 85;

  return computeToolHealth({
    toolId: record.toolId,
    wearUnits: record.wearUnits,
    threshold,
    nearingLimitPct,
  });
}

/**
 * List health status for all tools.
 *
 * Sorting (deterministic, UI-friendly):
 * 1. OVER_LIMIT first
 * 2. NEARING_LIMIT second
 * 3. OK last
 * Within each group: healthPct asc (more worn first), then toolId asc
 *
 * @param options - Query options
 * @returns Array of ToolHealth for all tracked tools
 */
export async function listToolHealth(
  options?: ToolHealthQueryOptions
): Promise<ToolHealth[]> {
  const records = await listToolUsageRecords();
  const nearingLimitPct = options?.nearingLimitPct ?? 85;

  const results: ToolHealth[] = [];

  for (const record of records) {
    const threshold =
      (await getToolWearThreshold(record.toolId)) ?? defaultThreshold(record.toolId);

    const health = computeToolHealth({
      toolId: record.toolId,
      wearUnits: record.wearUnits,
      threshold,
      nearingLimitPct,
    });

    results.push(health);
  }

  // Sort: status priority, then healthPct desc, then toolId asc
  return sortToolHealthResults(results);
}

/**
 * List tools that are at or near their wear limit.
 *
 * Returns only NEARING_LIMIT and OVER_LIMIT tools.
 * Useful for warning badges and alerts.
 *
 * @param options - Query options
 * @returns Array of ToolHealth for tools needing attention
 */
export async function listNearingLimitTools(
  options?: ToolHealthQueryOptions
): Promise<ToolHealth[]> {
  const all = await listToolHealth(options);
  const includeOverLimit = options?.includeOverLimit ?? true;

  return all.filter((h) => {
    if (h.status === 'NEARING_LIMIT') return true;
    if (h.status === 'OVER_LIMIT' && includeOverLimit) return true;
    return false;
  });
}

/**
 * Sort tool health results by severity and health percentage.
 *
 * Order:
 * 1. OVER_LIMIT (most critical)
 * 2. NEARING_LIMIT
 * 3. OK
 *
 * Within each status: healthPct asc (lower = more worn = first), then toolId asc (determinism)
 */
function sortToolHealthResults(results: ToolHealth[]): ToolHealth[] {
  const statusPriority: Record<ToolHealth['status'], number> = {
    OVER_LIMIT: 0,
    NEARING_LIMIT: 1,
    OK: 2,
  };

  return results.slice().sort((a, b) => {
    // Primary: status priority (OVER_LIMIT first)
    const statusDiff = statusPriority[a.status] - statusPriority[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Secondary: healthPct asc (lower % = more worn = first)
    if (a.healthPct !== b.healthPct) {
      return a.healthPct - b.healthPct;
    }

    // Tertiary: toolId asc (determinism)
    return a.toolId.localeCompare(b.toolId);
  });
}
