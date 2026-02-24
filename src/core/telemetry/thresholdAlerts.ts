/**
 * thresholdAlerts.ts - Threshold Breach Detection & Alerts
 *
 * PURPOSE:
 * - Detect performance issues automatically
 * - Generate alerts when thresholds are exceeded
 * - Track consecutive breaches (debounce single spikes)
 *
 * ALERTS:
 * - SAT time > 5ms (scene too dense)
 * - Candidates > 40 (cellSize may be too large)
 * - FPS < 30 (performance issue)
 * - Engage/disengage flip-flop (jitter)
 * - Delta clamped frequently (overspeed)
 */

import type { TelemetryAlert } from './telemetryTypes';
import { TELEMETRY } from './telemetrySingleton';
import { nowMs } from './timer';

// ============================================
// THRESHOLD CONFIGURATION
// ============================================

export interface ThresholdConfig {
  /** SAT check time threshold (ms) */
  satTimeMs: number;

  /** Max candidates before alert */
  maxCandidates: number;

  /** Min FPS before alert */
  minFps: number;

  /** Max engage/disengage flips per window */
  maxFlipFlopsPerWindow: number;

  /** Flip-flop detection window (ms) */
  flipFlopWindowMs: number;

  /** Max predictive clamps per window */
  maxClampsPerWindow: number;

  /** Clamp detection window (ms) */
  clampWindowMs: number;

  /** Consecutive breaches before alert */
  consecutiveThreshold: number;
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  satTimeMs: 5,
  maxCandidates: 40,
  minFps: 30,
  maxFlipFlopsPerWindow: 5,
  flipFlopWindowMs: 1000,
  maxClampsPerWindow: 10,
  clampWindowMs: 1000,
  consecutiveThreshold: 3,
} as const;

// ============================================
// ALERT STATE
// ============================================

export interface AlertState {
  /** Consecutive breaches per alert type */
  consecutiveCounts: Record<string, number>;

  /** Last breach time per alert type */
  lastBreachMs: Record<string, number>;

  /** Event timestamps for windowed detection */
  flipFlopTimes: number[];
  clampTimes: number[];

  /** Last engaged state (for flip-flop detection) */
  lastEngaged: boolean | null;
}

/**
 * Create initial alert state
 */
export function createAlertState(): AlertState {
  return {
    consecutiveCounts: {},
    lastBreachMs: {},
    flipFlopTimes: [],
    clampTimes: [],
    lastEngaged: null,
  };
}

// ============================================
// ALERT CHECKERS
// ============================================

/**
 * Check SAT time threshold
 */
export function checkSatTime(
  state: AlertState,
  satMs: number,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  const key = 'SAT_TIME';

  if (satMs > cfg.satTimeMs) {
    const count = (state.consecutiveCounts[key] ?? 0) + 1;

    if (count >= cfg.consecutiveThreshold) {
      pushAlert({
        alertType: 'SAT_TIME_HIGH',
        value: satMs,
        threshold: cfg.satTimeMs,
        message: `SAT check time ${satMs.toFixed(1)}ms exceeds ${cfg.satTimeMs}ms (scene may be too dense)`,
        consecutiveCount: count,
      });
    }

    return {
      ...state,
      consecutiveCounts: { ...state.consecutiveCounts, [key]: count },
      lastBreachMs: { ...state.lastBreachMs, [key]: nowMs() },
    };
  }

  // Reset consecutive count
  return {
    ...state,
    consecutiveCounts: { ...state.consecutiveCounts, [key]: 0 },
  };
}

/**
 * Check candidate count threshold
 */
export function checkCandidateCount(
  state: AlertState,
  candidateCount: number,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  const key = 'CANDIDATE_COUNT';

  if (candidateCount > cfg.maxCandidates) {
    const count = (state.consecutiveCounts[key] ?? 0) + 1;

    if (count >= cfg.consecutiveThreshold) {
      pushAlert({
        alertType: 'CANDIDATE_COUNT_HIGH',
        value: candidateCount,
        threshold: cfg.maxCandidates,
        message: `${candidateCount} candidates exceeds ${cfg.maxCandidates} (cellSize may be too large)`,
        consecutiveCount: count,
      });
    }

    return {
      ...state,
      consecutiveCounts: { ...state.consecutiveCounts, [key]: count },
      lastBreachMs: { ...state.lastBreachMs, [key]: nowMs() },
    };
  }

  return {
    ...state,
    consecutiveCounts: { ...state.consecutiveCounts, [key]: 0 },
  };
}

/**
 * Check FPS threshold
 */
export function checkFps(
  state: AlertState,
  fps: number,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  const key = 'FPS_LOW';

  if (fps > 0 && fps < cfg.minFps) {
    const count = (state.consecutiveCounts[key] ?? 0) + 1;

    if (count >= cfg.consecutiveThreshold) {
      pushAlert({
        alertType: 'FPS_LOW',
        value: fps,
        threshold: cfg.minFps,
        message: `FPS ${fps.toFixed(1)} below ${cfg.minFps} (performance issue)`,
        consecutiveCount: count,
      });
    }

    return {
      ...state,
      consecutiveCounts: { ...state.consecutiveCounts, [key]: count },
      lastBreachMs: { ...state.lastBreachMs, [key]: nowMs() },
    };
  }

  return {
    ...state,
    consecutiveCounts: { ...state.consecutiveCounts, [key]: 0 },
  };
}

/**
 * Check engage/disengage flip-flop (jitter detection)
 */
export function checkFlipFlop(
  state: AlertState,
  engaged: boolean,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  const now = nowMs();

  // Prune old timestamps
  const recentFlips = state.flipFlopTimes.filter(t => now - t < cfg.flipFlopWindowMs);

  // Detect state change
  if (state.lastEngaged !== null && state.lastEngaged !== engaged) {
    recentFlips.push(now);
  }

  // Check threshold
  if (recentFlips.length >= cfg.maxFlipFlopsPerWindow) {
    pushAlert({
      alertType: 'FLIP_FLOP',
      value: recentFlips.length,
      threshold: cfg.maxFlipFlopsPerWindow,
      message: `Snap jitter detected: ${recentFlips.length} state changes in ${cfg.flipFlopWindowMs}ms`,
      consecutiveCount: recentFlips.length,
    });

    // Clear after alert
    return {
      ...state,
      flipFlopTimes: [],
      lastEngaged: engaged,
    };
  }

  return {
    ...state,
    flipFlopTimes: recentFlips,
    lastEngaged: engaged,
  };
}

/**
 * Check predictive delta clamping (overspeed)
 */
export function checkClamp(
  state: AlertState,
  wasClamped: boolean,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  const now = nowMs();

  // Prune old timestamps
  const recentClamps = state.clampTimes.filter(t => now - t < cfg.clampWindowMs);

  if (wasClamped) {
    recentClamps.push(now);
  }

  // Check threshold
  if (recentClamps.length >= cfg.maxClampsPerWindow) {
    pushAlert({
      alertType: 'PREDICTIVE_CLAMP',
      value: recentClamps.length,
      threshold: cfg.maxClampsPerWindow,
      message: `Predictive delta clamped ${recentClamps.length} times in ${cfg.clampWindowMs}ms (overspeed)`,
      consecutiveCount: recentClamps.length,
    });

    // Clear after alert
    return {
      ...state,
      clampTimes: [],
    };
  }

  return {
    ...state,
    clampTimes: recentClamps,
  };
}

// ============================================
// PUSH ALERT
// ============================================

function pushAlert(args: {
  alertType: string;
  value: number;
  threshold: number;
  message: string;
  consecutiveCount: number;
}): void {
  if (!TELEMETRY.isEnabled()) return;

  const alert: TelemetryAlert = {
    ts: nowMs(),
    level: 'WARN',
    kind: 'THRESHOLD_ALERT',
    alertType: args.alertType,
    value: args.value,
    threshold: args.threshold,
    message: args.message,
    consecutiveCount: args.consecutiveCount,
  };

  TELEMETRY.push(alert);
  TELEMETRY.inc(`alert:${args.alertType}`);
}

// ============================================
// COMBINED CHECK
// ============================================

export interface AlertCheckArgs {
  satMs?: number;
  candidateCount?: number;
  fps?: number;
  engaged?: boolean;
  wasClamped?: boolean;
}

/**
 * Run all applicable threshold checks
 */
export function checkAllThresholds(
  state: AlertState,
  args: AlertCheckArgs,
  cfg: ThresholdConfig = DEFAULT_THRESHOLDS
): AlertState {
  let newState = state;

  if (args.satMs !== undefined) {
    newState = checkSatTime(newState, args.satMs, cfg);
  }

  if (args.candidateCount !== undefined) {
    newState = checkCandidateCount(newState, args.candidateCount, cfg);
  }

  if (args.fps !== undefined) {
    newState = checkFps(newState, args.fps, cfg);
  }

  if (args.engaged !== undefined) {
    newState = checkFlipFlop(newState, args.engaged, cfg);
  }

  if (args.wasClamped !== undefined) {
    newState = checkClamp(newState, args.wasClamped, cfg);
  }

  return newState;
}

// ============================================
// ALERT BADGE COLORS
// ============================================

export function getAlertColor(alertType: string): string {
  switch (alertType) {
    case 'SAT_TIME_HIGH':
      return '#f87171'; // Red
    case 'CANDIDATE_COUNT_HIGH':
      return '#fb923c'; // Orange
    case 'FPS_LOW':
      return '#ef4444'; // Red
    case 'FLIP_FLOP':
      return '#a78bfa'; // Purple
    case 'PREDICTIVE_CLAMP':
      return '#facc15'; // Yellow
    default:
      return '#94a3b8'; // Gray
  }
}

export function getAlertIcon(alertType: string): string {
  switch (alertType) {
    case 'SAT_TIME_HIGH':
      return '⏱️';
    case 'CANDIDATE_COUNT_HIGH':
      return '📦';
    case 'FPS_LOW':
      return '🐢';
    case 'FLIP_FLOP':
      return '🔄';
    case 'PREDICTIVE_CLAMP':
      return '⚡';
    default:
      return '⚠️';
  }
}
