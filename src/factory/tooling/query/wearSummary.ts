/**
 * wearSummary.ts - Wear Breakdown by Material
 *
 * Pure helper to transform ToolUsageRecord.byMaterial into
 * UI-ready breakdown with percentages.
 *
 * @version 1.0.0 - Phase D6-E.1
 */

import type { ToolUsageRecord, MaterialClass } from '../types';

/**
 * Single material wear breakdown.
 */
export type WearMaterialSummary = {
  /** Material class */
  material: MaterialClass;
  /** Absolute wear units for this material */
  wearUnits: number;
  /** Percentage of total wear (0..100, sum=100 if total>0) */
  percent: number;
};

/**
 * Complete wear summary for a tool.
 */
export type WearSummary = {
  /** Tool identifier */
  toolId: string;
  /** Total wear units across all materials */
  totalWearUnits: number;
  /** Breakdown by material, sorted desc by wearUnits then material */
  items: WearMaterialSummary[];
};

/**
 * All material classes for iteration.
 */
const ALL_MATERIALS: MaterialClass[] = ['MDF', 'MELAMINE', 'PLYWOOD', 'HPL', 'HMR', 'UNKNOWN'];

/**
 * Normalize a number to 3 decimal places.
 */
function normalize3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * Transform a ToolUsageRecord into a UI-ready wear summary.
 *
 * Rules:
 * - If totalWearUnits = 0, all percentages = 0
 * - Percentages are normalized to sum to 100 (with rounding adjustment)
 * - Items sorted by wearUnits desc, then material asc
 *
 * @param record - Tool usage record from storage
 * @returns Wear summary with material breakdown
 *
 * @example
 * ```typescript
 * const summary = summarizeWearByMaterial(record);
 * // { toolId: 'DRILL_5', totalWearUnits: 150, items: [...] }
 * ```
 */
export function summarizeWearByMaterial(record: ToolUsageRecord): WearSummary {
  const totalWearUnits = normalize3(Math.max(0, record.wearUnits));

  // Build items from byMaterial map
  const items: WearMaterialSummary[] = [];

  for (const material of ALL_MATERIALS) {
    const matData = record.byMaterial[material];
    if (matData && matData.wearUnits > 0) {
      const wearUnits = normalize3(matData.wearUnits);
      const percent =
        totalWearUnits > 0 ? normalize3((wearUnits / totalWearUnits) * 100) : 0;

      items.push({ material, wearUnits, percent });
    }
  }

  // Sort: wearUnits desc, then material asc (for determinism)
  items.sort((a, b) => {
    if (b.wearUnits !== a.wearUnits) {
      return b.wearUnits - a.wearUnits;
    }
    return a.material.localeCompare(b.material);
  });

  // Adjust percentages to sum to exactly 100 (handle rounding errors)
  if (totalWearUnits > 0 && items.length > 0) {
    const sumPct = items.reduce((acc, i) => acc + i.percent, 0);
    const diff = normalize3(100 - sumPct);

    if (diff !== 0) {
      // Add/subtract difference from the largest item
      items[0].percent = normalize3(items[0].percent + diff);
    }
  }

  return {
    toolId: record.toolId,
    totalWearUnits,
    items,
  };
}
