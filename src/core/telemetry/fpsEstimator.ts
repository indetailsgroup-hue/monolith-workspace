/**
 * fpsEstimator.ts - Stable FPS Estimation
 *
 * PURPOSE:
 * - Compute stable FPS for UI display
 * - Use windowed average to avoid flicker
 * - Cheap computation (no array storage)
 */

// ============================================
// TYPES
// ============================================

export interface FpsState {
  /** Current estimated FPS */
  fps: number;

  /** Accumulated time in current window (seconds) */
  accumulator: number;

  /** Frame count in current window */
  frames: number;

  /** Total frames since reset */
  totalFrames: number;
}

// ============================================
// LIFECYCLE
// ============================================

/**
 * Create new FPS state
 */
export function createFpsState(): FpsState {
  return {
    fps: 0,
    accumulator: 0,
    frames: 0,
    totalFrames: 0,
  };
}

/**
 * Reset FPS state
 */
export function resetFpsState(): FpsState {
  return createFpsState();
}

// ============================================
// UPDATE
// ============================================

/**
 * Window size for FPS averaging (seconds)
 * 0.25s = 4 updates per second (stable but responsive)
 */
const FPS_WINDOW = 0.25;

/**
 * Update FPS estimate with new frame
 *
 * @param st - Current FPS state
 * @param dtSec - Time since last frame (seconds)
 * @returns Updated FPS state
 */
export function updateFps(st: FpsState, dtSec: number): FpsState {
  const accumulator = st.accumulator + dtSec;
  const frames = st.frames + 1;
  const totalFrames = st.totalFrames + 1;

  // Window complete: compute average FPS
  if (accumulator >= FPS_WINDOW) {
    const fps = frames / accumulator;
    return {
      fps,
      accumulator: 0,
      frames: 0,
      totalFrames,
    };
  }

  // Window not complete: keep accumulating
  return {
    ...st,
    accumulator,
    frames,
    totalFrames,
  };
}

// ============================================
// QUERY
// ============================================

/**
 * Get current FPS
 */
export function getFps(st: FpsState): number {
  return st.fps;
}

/**
 * Get FPS as string (1 decimal)
 */
export function getFpsString(st: FpsState): string {
  return st.fps.toFixed(1);
}

/**
 * Check if FPS is below threshold (performance issue)
 */
export function isFpsLow(st: FpsState, threshold: number = 30): boolean {
  return st.fps > 0 && st.fps < threshold;
}

/**
 * Check if FPS is stable (has samples)
 */
export function isFpsStable(st: FpsState): boolean {
  return st.totalFrames >= 4;
}

// ============================================
// FPS CLASSIFICATION
// ============================================

export type FpsClass = 'excellent' | 'good' | 'acceptable' | 'poor';

/**
 * Classify FPS for UI display
 */
export function classifyFps(st: FpsState): FpsClass {
  const fps = st.fps;

  if (fps >= 55) return 'excellent';  // Near 60fps
  if (fps >= 45) return 'good';       // Acceptable
  if (fps >= 30) return 'acceptable'; // Playable
  return 'poor';                       // Performance issue
}

/**
 * Get color for FPS class (for UI)
 */
export function getFpsColor(fpsClass: FpsClass): string {
  switch (fpsClass) {
    case 'excellent':
      return '#4ade80'; // Green
    case 'good':
      return '#a3e635'; // Lime
    case 'acceptable':
      return '#facc15'; // Yellow
    case 'poor':
      return '#f87171'; // Red
  }
}

// ============================================
// FRAME TIME ANALYSIS
// ============================================

/**
 * Get average frame time (ms)
 */
export function getAvgFrameTimeMs(st: FpsState): number {
  if (st.fps === 0) return 0;
  return 1000 / st.fps;
}

/**
 * Check for frame time spike
 */
export function isFrameSpike(dtSec: number, threshold: number = 0.05): boolean {
  return dtSec > threshold; // > 50ms
}
