/**
 * timer.ts - Timing Utilities for Telemetry
 *
 * PURPOSE:
 * - High-resolution timing (performance.now when available)
 * - Measure elapsed time for operations
 * - Time blocks of code with automatic measurement
 */

// ============================================
// NOW FUNCTIONS
// ============================================

/**
 * Get current time in milliseconds
 * Uses performance.now when available (higher precision)
 */
export function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Get current time in seconds
 */
export function nowSec(): number {
  return nowMs() / 1000;
}

// ============================================
// TIMING MEASUREMENT
// ============================================

/**
 * Measure elapsed time for a synchronous function
 */
export function timeBlock<T>(fn: () => T): { ms: number; value: T } {
  const t0 = nowMs();
  const value = fn();
  const t1 = nowMs();
  return { ms: t1 - t0, value };
}

/**
 * Measure elapsed time for an async function
 */
export async function timeBlockAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = nowMs();
  const value = await fn();
  const t1 = nowMs();
  return { ms: t1 - t0, value };
}

// ============================================
// STOPWATCH
// ============================================

export interface Stopwatch {
  /** Start time (ms) */
  startMs: number;

  /** Lap times (ms) */
  laps: number[];

  /** Is running */
  running: boolean;
}

/**
 * Create new stopwatch
 */
export function createStopwatch(): Stopwatch {
  return {
    startMs: nowMs(),
    laps: [],
    running: true,
  };
}

/**
 * Record a lap
 */
export function lap(sw: Stopwatch): Stopwatch {
  if (!sw.running) return sw;

  const now = nowMs();
  const lastTime = sw.laps.length > 0 ? sw.laps[sw.laps.length - 1] : sw.startMs;
  const lapTime = now - lastTime;

  return {
    ...sw,
    laps: [...sw.laps, lapTime],
  };
}

/**
 * Stop stopwatch and get total time
 */
export function stop(sw: Stopwatch): { sw: Stopwatch; totalMs: number } {
  const totalMs = nowMs() - sw.startMs;
  return {
    sw: { ...sw, running: false },
    totalMs,
  };
}

/**
 * Get elapsed time without stopping
 */
export function elapsed(sw: Stopwatch): number {
  return nowMs() - sw.startMs;
}

// ============================================
// RATE LIMITER (for throttled logging)
// ============================================

export interface RateLimiter {
  /** Last allowed time (ms) */
  lastAllowedMs: number;

  /** Minimum interval between allows (ms) */
  intervalMs: number;
}

/**
 * Create rate limiter
 */
export function createRateLimiter(intervalMs: number): RateLimiter {
  return {
    lastAllowedMs: 0,
    intervalMs,
  };
}

/**
 * Check if action is allowed (and update state)
 */
export function rateLimit(rl: RateLimiter): { allowed: boolean; rl: RateLimiter } {
  const now = nowMs();

  if (now - rl.lastAllowedMs >= rl.intervalMs) {
    return {
      allowed: true,
      rl: { ...rl, lastAllowedMs: now },
    };
  }

  return { allowed: false, rl };
}

// ============================================
// DEBOUNCE STATE
// ============================================

export interface DebounceState {
  /** Pending value */
  pending: boolean;

  /** Last trigger time (ms) */
  lastTriggerMs: number;

  /** Debounce delay (ms) */
  delayMs: number;
}

/**
 * Create debounce state
 */
export function createDebounceState(delayMs: number): DebounceState {
  return {
    pending: false,
    lastTriggerMs: 0,
    delayMs,
  };
}

/**
 * Trigger debounce
 */
export function debounceTrigger(st: DebounceState): DebounceState {
  return {
    ...st,
    pending: true,
    lastTriggerMs: nowMs(),
  };
}

/**
 * Check if debounce should fire
 */
export function debounceCheck(st: DebounceState): { shouldFire: boolean; st: DebounceState } {
  if (!st.pending) {
    return { shouldFire: false, st };
  }

  const now = nowMs();
  if (now - st.lastTriggerMs >= st.delayMs) {
    return {
      shouldFire: true,
      st: { ...st, pending: false },
    };
  }

  return { shouldFire: false, st };
}
