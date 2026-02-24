/**
 * drillTuningTypes.ts - Drill Tuning Options for Fine Control
 *
 * Defines tuning parameters for chip control, retract behavior, and peck scheduling.
 * These are "optimization" parameters that don't change cycle selection (G81/G82/G83)
 * but affect how cycles are executed.
 *
 * @version 1.0.0 - Phase D5-C.0
 */

// ============================================================================
// RETRACT MODE
// ============================================================================

/**
 * Retract behavior for peck drilling (G83).
 *
 * FULL: Retract to R-plane after each peck (safest, best chip clearing)
 * PARTIAL: Retract only a small clearance above current depth (faster, risk of chip pack)
 *
 * Conservative default: FULL
 */
export type RetractMode = 'FULL' | 'PARTIAL';

/**
 * Default retract mode - FULL is safest for chip evacuation.
 */
export const DEFAULT_RETRACT_MODE: RetractMode = 'FULL';

/**
 * Clearance for PARTIAL retract mode (mm above current depth).
 * Only used when RetractMode = 'PARTIAL'.
 */
export const PARTIAL_RETRACT_CLEARANCE = 2; // mm

// ============================================================================
// PECK MODE
// ============================================================================

/**
 * Peck scheduling mode for deep holes.
 *
 * FIXED: Use constant peck depth (Q) throughout
 * FINAL_CLAMP: Clamp final peck to remaining depth (prevents overshoot)
 * TAPERED: Reduce peck depth in final 30% of hole (advanced chip control)
 *
 * Conservative default: FINAL_CLAMP (simple and safe)
 */
export type PeckMode = 'FIXED' | 'FINAL_CLAMP' | 'TAPERED';

/**
 * Default peck mode - FINAL_CLAMP prevents overshooting the target depth.
 */
export const DEFAULT_PECK_MODE: PeckMode = 'FINAL_CLAMP';

/**
 * Taper ratio for TAPERED mode (multiplier for final pecks).
 * Only used when PeckMode = 'TAPERED'.
 */
export const TAPER_PECK_RATIO = 0.8;

/**
 * Depth percentage where tapering begins.
 * Only used when PeckMode = 'TAPERED'.
 */
export const TAPER_START_PERCENT = 0.7; // Start tapering at 70% depth

// ============================================================================
// DRILL TUNING OPTIONS
// ============================================================================

/**
 * Tuning options for drill cycle execution.
 * These affect HOW cycles run, not WHICH cycle is selected.
 */
export interface DrillTuningOptions {
  /**
   * Retract behavior for peck drilling.
   * @default 'FULL'
   */
  retractMode?: RetractMode;

  /**
   * Peck scheduling mode.
   * @default 'FINAL_CLAMP'
   */
  peckMode?: PeckMode;

  /**
   * Clearance for PARTIAL retract (mm).
   * Only used when retractMode = 'PARTIAL'.
   * @default 2
   */
  partialRetractClearance?: number;

  /**
   * Minimum peck depth (mm).
   * Prevents excessively small pecks that waste time.
   * @default 1
   */
  minPeckDepth?: number;
}

/**
 * Default tuning options - conservative settings for production safety.
 */
export const DEFAULT_DRILL_TUNING: Required<DrillTuningOptions> = {
  retractMode: DEFAULT_RETRACT_MODE,
  peckMode: DEFAULT_PECK_MODE,
  partialRetractClearance: PARTIAL_RETRACT_CLEARANCE,
  minPeckDepth: 1,
};

// ============================================================================
// PECK SCHEDULE CALCULATION
// ============================================================================

/**
 * Peck schedule entry - one peck in the drilling sequence.
 */
export interface PeckEntry {
  /** Peck number (1-based) */
  peckNumber: number;
  /** Target Z depth for this peck (negative from surface) */
  targetZ: number;
  /** Peck depth for this step (incremental) */
  peckDepth: number;
  /** Retract Z position after this peck */
  retractZ: number;
}

/**
 * Calculate peck schedule for a deep hole.
 *
 * @param totalDepth Total hole depth (positive)
 * @param basePeckDepth Base peck depth (Q value)
 * @param safeZ Safe/R-plane Z position
 * @param surfaceZ Surface Z position (usually 0)
 * @param tuning Tuning options
 * @returns Array of peck entries
 */
export function calculatePeckSchedule(
  totalDepth: number,
  basePeckDepth: number,
  safeZ: number,
  surfaceZ: number = 0,
  tuning: DrillTuningOptions = {}
): PeckEntry[] {
  const opts = { ...DEFAULT_DRILL_TUNING, ...tuning };
  const schedule: PeckEntry[] = [];

  let currentDepth = 0;
  let peckNumber = 0;

  while (currentDepth < totalDepth) {
    peckNumber++;
    const remaining = totalDepth - currentDepth;

    // Calculate peck depth for this step
    let peckDepth = basePeckDepth;

    // Apply peck mode
    switch (opts.peckMode) {
      case 'TAPERED': {
        // Reduce peck depth in final portion
        const depthPercent = currentDepth / totalDepth;
        if (depthPercent >= TAPER_START_PERCENT) {
          peckDepth = basePeckDepth * TAPER_PECK_RATIO;
        }
        // Still clamp to remaining
        peckDepth = Math.min(peckDepth, remaining);
        break;
      }
      case 'FINAL_CLAMP':
        // Clamp final peck to remaining depth
        peckDepth = Math.min(peckDepth, remaining);
        break;
      case 'FIXED':
      default:
        // Use fixed peck depth (may overshoot on last peck)
        // Controller typically handles this, but we keep it explicit
        break;
    }

    // Enforce minimum peck depth
    peckDepth = Math.max(peckDepth, Math.min(opts.minPeckDepth, remaining));

    // Calculate target Z (negative from surface)
    const targetZ = surfaceZ - currentDepth - peckDepth;

    // Calculate retract Z based on mode
    let retractZ: number;
    if (opts.retractMode === 'PARTIAL') {
      // Retract to current depth + clearance (but not above safe Z)
      retractZ = Math.min(surfaceZ - currentDepth + opts.partialRetractClearance, safeZ);
    } else {
      // FULL: Always retract to safe Z (R-plane)
      retractZ = safeZ;
    }

    schedule.push({
      peckNumber,
      targetZ,
      peckDepth,
      retractZ,
    });

    currentDepth += peckDepth;

    // Safety: prevent infinite loop
    if (peckNumber > 1000) {
      break;
    }
  }

  return schedule;
}

/**
 * Get the effective peck depth for a single G83 command.
 *
 * For standard G83 (single Q value), this returns the Q to use.
 * The controller handles the peck schedule internally.
 *
 * For FINAL_CLAMP mode with non-divisible depth, this returns
 * a Q that will complete the hole cleanly.
 *
 * @param totalDepth Total hole depth (positive)
 * @param basePeckDepth Base peck depth (Q value)
 * @param tuning Tuning options
 * @returns Effective peck depth to use in G83 Q parameter
 */
export function getEffectivePeckDepth(
  totalDepth: number,
  basePeckDepth: number,
  tuning: DrillTuningOptions = {}
): number {
  const opts = { ...DEFAULT_DRILL_TUNING, ...tuning };

  // For FIXED mode, just use the base peck depth
  if (opts.peckMode === 'FIXED') {
    return basePeckDepth;
  }

  // For FINAL_CLAMP and TAPERED, ensure we don't exceed total depth
  // But since G83 Q is incremental and controller handles it,
  // we just need to ensure Q is reasonable
  return Math.min(basePeckDepth, totalDepth);
}

/**
 * Determine if a peck schedule needs special handling.
 *
 * Returns true if the depth/peck combination would benefit from
 * explicit peck scheduling (e.g., non-divisible depth with TAPERED mode).
 *
 * @param totalDepth Total hole depth
 * @param basePeckDepth Base peck depth
 * @param tuning Tuning options
 */
export function needsExplicitPeckSchedule(
  totalDepth: number,
  basePeckDepth: number,
  tuning: DrillTuningOptions = {}
): boolean {
  const opts = { ...DEFAULT_DRILL_TUNING, ...tuning };

  // TAPERED mode always needs explicit schedule
  if (opts.peckMode === 'TAPERED') {
    return true;
  }

  // PARTIAL retract needs explicit schedule (non-standard G83 behavior)
  if (opts.retractMode === 'PARTIAL') {
    return true;
  }

  // Standard G83 handles FIXED and FINAL_CLAMP fine
  return false;
}
