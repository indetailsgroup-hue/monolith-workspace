/**
 * Snap Utilities - Precision Value Snapping
 *
 * Plasticity-style snap system:
 * - Fine: 0.1mm (default drag)
 * - Standard: 0.5mm, 1mm (Shift snap)
 * - Coarse: 5mm, 10mm (grid snap)
 *
 * v1.0: Initial snap utilities
 */

export interface SnapConfig {
  /** Is snapping enabled */
  enabled: boolean;
  /** Snap step in mm */
  stepMm: number;
}

/** Common snap presets */
export const SNAP_PRESETS = {
  FINE: { enabled: true, stepMm: 0.1 },
  HALF_MM: { enabled: true, stepMm: 0.5 },
  ONE_MM: { enabled: true, stepMm: 1 },
  FIVE_MM: { enabled: true, stepMm: 5 },
  TEN_MM: { enabled: true, stepMm: 10 },
  OFF: { enabled: false, stepMm: 0 },
} as const;

/**
 * Snap a value to the nearest step.
 *
 * @param value - Raw value in mm
 * @param config - Snap configuration
 * @returns Snapped value (or original if disabled)
 */
export function snapValue(value: number, config: SnapConfig): number {
  if (!config.enabled) return value;

  const step = Math.max(0.0001, config.stepMm);
  return Math.round(value / step) * step;
}

/**
 * Snap and clamp a value within a range.
 */
export function snapClamp(
  value: number,
  config: SnapConfig,
  min: number,
  max: number
): number {
  const snapped = snapValue(value, config);
  return Math.max(min, Math.min(max, snapped));
}

/**
 * Format value for display, respecting snap precision.
 */
export function formatSnapValue(value: number, config: SnapConfig): string {
  if (!config.enabled) {
    return value.toFixed(2);
  }

  const step = config.stepMm;
  if (step >= 1) {
    return value.toFixed(1);
  } else if (step >= 0.1) {
    return value.toFixed(1);
  } else {
    return value.toFixed(2);
  }
}

/**
 * Get snap config based on modifier keys.
 *
 * @param shiftHeld - Is Shift key pressed
 * @param shiftStep - Step when Shift held (default 1mm)
 * @param defaultStep - Step when Shift not held (default 0.1mm)
 */
export function getSnapConfig(
  shiftHeld: boolean,
  shiftStep = 1,
  defaultStep = 0.1
): SnapConfig {
  return {
    enabled: true,
    stepMm: shiftHeld ? shiftStep : defaultStep,
  };
}
