/**
 * toolThresholdQuery.ts - Tool Threshold Query Helpers
 *
 * Query functions for tool wear thresholds.
 * Part of D6.1: Threshold & Maintenance UX.
 *
 * @version 1.0.0 - Phase D6.1
 */

import type { ToolWearThreshold } from '../types';
import { DEFAULT_MAX_WEAR_UNITS } from '../wearModel';
import {
  getToolWearThreshold,
  listToolWearThresholds,
  setToolWearThreshold,
  deleteToolWearThreshold,
} from '../storage';

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get the effective threshold for a tool.
 * Returns custom threshold if set, otherwise returns default.
 *
 * @param toolId - Tool identifier
 * @returns maxWearUnits value (custom or default)
 */
export async function getEffectiveThreshold(toolId: string): Promise<number> {
  const custom = await getToolWearThreshold(toolId);
  return custom?.maxWearUnits ?? DEFAULT_MAX_WEAR_UNITS;
}

/**
 * Check if a tool has a custom threshold set.
 *
 * @param toolId - Tool identifier
 * @returns true if custom threshold exists
 */
export async function hasCustomThreshold(toolId: string): Promise<boolean> {
  const custom = await getToolWearThreshold(toolId);
  return custom !== null;
}

/**
 * Get all tools with custom thresholds.
 * Returns in stable order (sorted by toolId).
 *
 * @returns Array of ToolWearThreshold
 */
export async function listCustomThresholds(): Promise<ToolWearThreshold[]> {
  return listToolWearThresholds();
}

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Update or create a tool threshold.
 *
 * @param toolId - Tool identifier
 * @param maxWearUnits - New threshold value (must be > 0)
 * @throws Error if maxWearUnits <= 0
 */
export async function updateThreshold(
  toolId: string,
  maxWearUnits: number
): Promise<void> {
  if (maxWearUnits <= 0) {
    throw new Error('maxWearUnits must be greater than 0');
  }

  await setToolWearThreshold({ toolId, maxWearUnits });
}

/**
 * Remove a custom threshold for a tool.
 * After removal, the tool will use the default threshold.
 *
 * @param toolId - Tool identifier
 * @returns true if threshold was deleted, false if not found
 */
export async function removeThreshold(toolId: string): Promise<boolean> {
  return deleteToolWearThreshold(toolId);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Threshold presets for common use cases.
 */
export const THRESHOLD_PRESETS = {
  /** Light duty - shorter life expectancy */
  LIGHT: 5000,
  /** Standard duty - default */
  STANDARD: DEFAULT_MAX_WEAR_UNITS,
  /** Heavy duty - extended life */
  HEAVY: 20000,
  /** Extra heavy - premium tools */
  EXTRA_HEAVY: 50000,
} as const;

export type ThresholdPreset = keyof typeof THRESHOLD_PRESETS;

/**
 * Get threshold value from preset name.
 *
 * @param preset - Preset name
 * @returns Threshold value
 */
export function getPresetValue(preset: ThresholdPreset): number {
  return THRESHOLD_PRESETS[preset];
}

/**
 * Suggest a preset based on a threshold value.
 *
 * @param value - Threshold value
 * @returns Nearest preset name
 */
export function suggestPreset(value: number): ThresholdPreset {
  const entries = Object.entries(THRESHOLD_PRESETS) as [ThresholdPreset, number][];
  let closest: ThresholdPreset = 'STANDARD';
  let minDiff = Infinity;

  for (const [name, preset] of entries) {
    const diff = Math.abs(value - preset);
    if (diff < minDiff) {
      minDiff = diff;
      closest = name;
    }
  }

  return closest;
}
