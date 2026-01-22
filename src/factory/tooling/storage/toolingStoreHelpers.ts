/**
 * toolingStoreHelpers.ts - Storage Helper Functions
 *
 * Pure helper functions for tool usage record management.
 * No side effects, deterministic.
 *
 * @version 1.0.0 - Phase D6-C
 */

import type { ToolUsageEvent, ToolUsageRecord, MaterialClass } from '../types';
import { computeWearUnits } from '../wearModel';

/**
 * Get current timestamp in milliseconds.
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Initialize an empty ToolUsageRecord for a tool.
 */
export function initRecord(toolId: string, updatedAt: number): ToolUsageRecord {
  return {
    toolId,
    totalHoles: 0,
    totalDepthMm: 0,
    wearUnits: 0,
    byMaterial: {},
    updatedAt,
  };
}

/**
 * Merge a ToolUsageEvent into an existing ToolUsageRecord.
 * Pure function - returns new record without mutating input.
 */
export function mergeEventIntoRecord(
  record: ToolUsageRecord,
  e: ToolUsageEvent,
  updatedAt: number
): ToolUsageRecord {
  const holes = Math.max(0, Number.isFinite(e.count) ? e.count : 0);
  const depth = Math.max(0, Number.isFinite(e.depthMm) ? e.depthMm : 0);

  const wear = computeWearUnits({
    count: holes,
    depthMm: depth,
    material: e.material as MaterialClass,
  });

  const prevMat = record.byMaterial[e.material] ?? { holes: 0, depthMm: 0, wearUnits: 0 };

  return {
    ...record,
    toolId: record.toolId || e.tool.toolId,
    totalHoles: record.totalHoles + holes,
    totalDepthMm: record.totalDepthMm + holes * depth,
    wearUnits: record.wearUnits + wear,
    byMaterial: {
      ...record.byMaterial,
      [e.material]: {
        holes: prevMat.holes + holes,
        depthMm: prevMat.depthMm + holes * depth,
        wearUnits: prevMat.wearUnits + wear,
      },
    },
    lastJobId: e.jobId,
    lastOccurredAt: e.occurredAt,
    updatedAt,
  };
}
