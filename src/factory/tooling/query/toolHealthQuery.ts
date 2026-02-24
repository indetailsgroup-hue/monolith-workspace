/**
 * toolHealthQuery.ts - Tool Health Query Helpers
 *
 * Async queries for tool health status.
 * Reads from IndexedDB, computes health with D6-A wearModel.
 *
 * @version 1.1.0 - Phase D6.2 (added trend queries)
 */

import type { ToolHealth, ToolWearThreshold, ToolHealthTrend, WearDataPoint } from '../types';
import { computeToolHealth, DEFAULT_MAX_WEAR_UNITS } from '../wearModel';
import {
  getToolUsageRecord,
  listToolUsageRecords,
  getToolWearThreshold,
  getToolUsageEventsByTool,
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

// ============================================================================
// D6.2: Wear Trend Queries
// ============================================================================

/**
 * Options for trend queries.
 */
export type TrendQueryOptions = ToolHealthQueryOptions & {
  /** Number of recent data points to include (default: 5) */
  dataPoints?: number;
  /** Maximum events to scan for building trend (default: 50) */
  maxEvents?: number;
};

/**
 * Compute trend direction from wear history.
 *
 * - STABLE: wear rate is consistent or decreasing
 * - INCREASING: wear rate is increasing moderately
 * - RAPID: wear rate is increasing significantly (>50% above average)
 */
function computeTrend(
  wearHistory: WearDataPoint[],
  avgWearPerJob: number
): ToolHealthTrend['trend'] {
  if (wearHistory.length < 3) return 'STABLE';

  // Calculate recent wear rate (last 3 points)
  const recent = wearHistory.slice(-3);
  const recentWearDelta = recent[recent.length - 1].wearUnits - recent[0].wearUnits;
  const recentJobs = recent.length - 1;
  const recentRate = recentJobs > 0 ? recentWearDelta / recentJobs : 0;

  // Compare to average
  if (recentRate > avgWearPerJob * 1.5) return 'RAPID';
  if (recentRate > avgWearPerJob * 1.1) return 'INCREASING';
  return 'STABLE';
}

/**
 * Build wear history from events.
 *
 * Aggregates events by job to create data points showing
 * cumulative wear progression over time.
 */
function buildWearHistory(
  events: Array<{ jobId: string; occurredAt: number; wearUnits: number }>,
  maxPoints: number
): WearDataPoint[] {
  if (events.length === 0) return [];

  // Group by jobId to get per-job cumulative wear
  const jobMap = new Map<string, { timestamp: number; wearUnits: number }>();
  let cumulativeWear = 0;

  for (const e of events) {
    cumulativeWear += e.wearUnits;
    // Update or set job entry (last event wins for timestamp)
    jobMap.set(e.jobId, {
      timestamp: e.occurredAt,
      wearUnits: cumulativeWear,
    });
  }

  // Convert to sorted array
  const history: WearDataPoint[] = Array.from(jobMap.entries())
    .map(([jobId, data]) => ({
      jobId,
      timestamp: data.timestamp,
      wearUnits: data.wearUnits,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Return last N points
  return history.slice(-maxPoints);
}

/**
 * Get tool health with trend information.
 *
 * Includes wear history for sparkline visualization and
 * computed trend direction.
 *
 * @param toolId - Tool identifier
 * @param options - Query options
 * @returns ToolHealthTrend or null if tool not found
 *
 * @example
 * ```typescript
 * const trend = await getToolHealthTrend('DRILL_5');
 * if (trend?.trend === 'RAPID') {
 *   console.warn(`Tool ${trend.toolId} degrading rapidly!`);
 * }
 * ```
 */
export async function getToolHealthTrend(
  toolId: string,
  options?: TrendQueryOptions
): Promise<ToolHealthTrend | null> {
  const health = await getToolHealth(toolId, options);
  if (!health) return null;

  const dataPoints = options?.dataPoints ?? 5;
  const maxEvents = options?.maxEvents ?? 50;

  // Fetch recent events
  const events = await getToolUsageEventsByTool(toolId, maxEvents);

  // Build wear history from events
  // Each event has wearUnits computed during D6-B processing
  // We need to extract per-event wear contribution
  const eventData = events.map((e) => ({
    jobId: e.jobId,
    occurredAt: e.occurredAt,
    // Use count * depth as proxy for wear (simplified)
    // In production, this would use the same wearModel calculation
    wearUnits: e.count * e.depthMm * 0.01, // Simplified wear calculation
  }));

  const wearHistory = buildWearHistory(eventData, dataPoints);

  // Calculate average wear per job
  const uniqueJobs = new Set(events.map((e) => e.jobId)).size;
  const avgWearPerJob = uniqueJobs > 0 ? health.wearUnits / uniqueJobs : 0;

  // Compute trend
  const trend = computeTrend(wearHistory, avgWearPerJob);

  return {
    ...health,
    wearHistory,
    trend,
    avgWearPerJob,
  };
}

/**
 * List tool health with trend for all tools.
 *
 * @param options - Query options
 * @returns Array of ToolHealthTrend for all tracked tools
 */
export async function listToolHealthTrend(
  options?: TrendQueryOptions
): Promise<ToolHealthTrend[]> {
  const records = await listToolUsageRecords();
  const results: ToolHealthTrend[] = [];

  for (const record of records) {
    const trend = await getToolHealthTrend(record.toolId, options);
    if (trend) results.push(trend);
  }

  // Sort by same rules as listToolHealth
  return results.slice().sort((a, b) => {
    const statusPriority = { OVER_LIMIT: 0, NEARING_LIMIT: 1, OK: 2 };
    const statusDiff = statusPriority[a.status] - statusPriority[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (a.healthPct !== b.healthPct) return a.healthPct - b.healthPct;
    return a.toolId.localeCompare(b.toolId);
  });
}
