/**
 * stickySnapState.ts - Sticky Candidate Selection with Hysteresis
 *
 * ARCHITECTURE:
 * - Prevents rapid candidate switching
 * - Uses hysteresis for engage/disengage
 * - Respects user Tab override
 *
 * HYSTERESIS:
 * - Engage: distance < 50mm
 * - Disengage: distance > 60mm
 * - Prevents jitter at threshold boundary
 *
 * STICKY:
 * - Current candidate stays selected unless:
 *   1. User presses Tab (explicit override)
 *   2. New candidate is significantly better (margin > 0.08)
 */

import type { SnapCandidate } from '../types/SnapTypes';
import type { AxisLock } from './axisLock';
import { CONSTRAINT_CONFIG } from './constraintConfig';

// ============================================
// TYPES
// ============================================

/**
 * Sticky snap state
 */
export interface StickySnapState {
  /** Whether snap is engaged */
  engaged: boolean;

  /** Current axis lock */
  axisLock: AxisLock;

  /** ID of currently selected candidate */
  activeCandidateId: string | null;

  /** Index in candidates array */
  activeIndex: number;

  /** Last engage/disengage timestamp */
  lastTransitionMs: number;
}

// ============================================
// CANDIDATE ID
// ============================================

/**
 * Generate unique ID for a candidate
 * Based on type + anchor IDs
 */
export function makeStickyId(c: SnapCandidate): string {
  return `${c.type}:${c.aAnchorId}:${c.bAnchorId}`;
}

// ============================================
// STATE MANAGEMENT
// ============================================

/**
 * Create initial sticky state
 */
export function createStickySnapState(): StickySnapState {
  return {
    engaged: false,
    axisLock: 'NONE',
    activeCandidateId: null,
    activeIndex: 0,
    lastTransitionMs: 0,
  };
}

/**
 * Update engagement based on best distance (hysteresis)
 */
export function updateStickyEngagement(
  state: StickySnapState,
  bestDistanceMm: number,
  nowMs: number = Date.now()
): StickySnapState {
  const { engageMm, disengageMm } = CONSTRAINT_CONFIG;

  if (!state.engaged) {
    // Not engaged: check if should engage
    if (bestDistanceMm <= engageMm) {
      return {
        ...state,
        engaged: true,
        lastTransitionMs: nowMs,
      };
    }
    return state;
  } else {
    // Engaged: check if should disengage
    if (bestDistanceMm >= disengageMm) {
      return {
        engaged: false,
        axisLock: 'NONE',
        activeCandidateId: null,
        activeIndex: 0,
        lastTransitionMs: nowMs,
      };
    }
    return state;
  }
}

/**
 * Choose candidate with sticky logic
 *
 * @param state - Current sticky state
 * @param candidates - Sorted candidates (best first)
 * @param axisHint - Axis hint from intent
 * @param userForcedIndex - If set, user explicitly chose this index (Tab)
 */
export function chooseStickyCandidate(
  state: StickySnapState,
  candidates: SnapCandidate[],
  axisHint: AxisLock,
  userForcedIndex?: number
): StickySnapState {
  // No candidates: reset
  if (!candidates.length) {
    return {
      engaged: false,
      axisLock: 'NONE',
      activeCandidateId: null,
      activeIndex: 0,
      lastTransitionMs: state.lastTransitionMs,
    };
  }

  // User explicitly chose via Tab: respect that
  if (typeof userForcedIndex === 'number') {
    const idx = Math.max(0, Math.min(userForcedIndex, candidates.length - 1));
    const chosen = candidates[idx];

    return {
      ...state,
      axisLock: state.engaged ? (axisHint === 'NONE' ? state.axisLock : axisHint) : 'NONE',
      activeCandidateId: makeStickyId(chosen),
      activeIndex: idx,
    };
  }

  // Not engaged: just take best
  if (!state.engaged) {
    const best = candidates[0];
    return {
      ...state,
      axisLock: 'NONE',
      activeCandidateId: makeStickyId(best),
      activeIndex: 0,
    };
  }

  // Engaged: prefer keeping current candidate
  const currentId = state.activeCandidateId;

  // No current: take best
  if (!currentId) {
    const best = candidates[0];
    return {
      ...state,
      axisLock: axisHint === 'NONE' ? state.axisLock : axisHint,
      activeCandidateId: makeStickyId(best),
      activeIndex: 0,
    };
  }

  // Find current in candidates
  const currentIdx = candidates.findIndex(c => makeStickyId(c) === currentId);
  const current = currentIdx >= 0 ? candidates[currentIdx] : null;
  const best = candidates[0];

  // Current not found: switch to best
  if (!current) {
    return {
      ...state,
      axisLock: axisHint === 'NONE' ? state.axisLock : axisHint,
      activeCandidateId: makeStickyId(best),
      activeIndex: 0,
    };
  }

  // Check if best is significantly better
  const { stickyScoreMargin } = CONSTRAINT_CONFIG;
  if (best.score > current.score + stickyScoreMargin) {
    // Switch to better candidate
    return {
      ...state,
      axisLock: axisHint === 'NONE' ? state.axisLock : axisHint,
      activeCandidateId: makeStickyId(best),
      activeIndex: 0,
    };
  }

  // Keep current
  return {
    ...state,
    axisLock: axisHint === 'NONE' ? state.axisLock : axisHint,
    activeCandidateId: currentId,
    activeIndex: currentIdx,
  };
}

// ============================================
// TAB CYCLING
// ============================================

/**
 * Cycle to next/previous candidate (Tab/Shift+Tab)
 */
export function cycleCandidate(
  state: StickySnapState,
  candidates: SnapCandidate[],
  direction: 1 | -1
): StickySnapState {
  if (!candidates.length) return state;

  const n = candidates.length;
  const newIdx = ((state.activeIndex + direction) % n + n) % n;
  const chosen = candidates[newIdx];

  return {
    ...state,
    activeCandidateId: makeStickyId(chosen),
    activeIndex: newIdx,
  };
}

// ============================================
// QUERY
// ============================================

/**
 * Get active candidate from state
 */
export function getActiveCandidate(
  state: StickySnapState,
  candidates: SnapCandidate[]
): SnapCandidate | null {
  if (!state.activeCandidateId || !candidates.length) return null;

  const idx = candidates.findIndex(c => makeStickyId(c) === state.activeCandidateId);
  return idx >= 0 ? candidates[idx] : candidates[0];
}
