/**
 * wearModel.ts - Tool Wear Calculation Model
 *
 * Pure functions for computing tool wear based on material and depth.
 * No side effects, deterministic outputs.
 *
 * @version 1.0.0 - Phase D6-A
 */

import type { MaterialClass, ToolHealth, ToolWearThreshold } from './types';

// Conservative weights (calibratable)
export const MATERIAL_WEAR_WEIGHT: Record<MaterialClass, number> = {
  HPL: 2.0,
  MELAMINE: 1.5,
  PLYWOOD: 1.2,
  MDF: 1.0,
  HMR: 1.1,
  UNKNOWN: 1.3, // conservative fallback
} as const;

/**
 * Default maximum wear units for tools without explicit threshold.
 * Conservative value - can be overridden per-tool via ToolWearThreshold.
 */
export const DEFAULT_MAX_WEAR_UNITS = 10000;

export function computeWearUnits(args: {
  count: number;
  depthMm: number;
  material: MaterialClass;
}): number {
  const { count, depthMm, material } = args;

  const c = Number.isFinite(count) ? count : 0;
  const d = Number.isFinite(depthMm) ? depthMm : 0;
  const w = MATERIAL_WEAR_WEIGHT[material] ?? MATERIAL_WEAR_WEIGHT.UNKNOWN;

  // Clamp negatives defensively to preserve determinism and avoid weird UI
  const c0 = Math.max(0, c);
  const d0 = Math.max(0, d);

  return c0 * d0 * w;
}

export function computeToolHealth(args: {
  toolId: string;
  wearUnits: number;
  threshold: ToolWearThreshold;
  nearingLimitPct?: number; // default 85
}): ToolHealth {
  const nearing = args.nearingLimitPct ?? 85;

  const maxWear = Math.max(0.000001, args.threshold.maxWearUnits); // avoid div-by-zero
  const wear = Math.max(0, args.wearUnits);

  const healthPct = Math.max(0, Math.min(100, 100 - (wear / maxWear) * 100));

  let status: ToolHealth['status'] = 'OK';
  const usedPct = (wear / maxWear) * 100;

  if (usedPct >= 100) status = 'OVER_LIMIT';
  else if (usedPct >= nearing) status = 'NEARING_LIMIT';

  return {
    toolId: args.toolId,
    wearUnits: wear,
    maxWearUnits: maxWear,
    healthPct,
    status,
  };
}
