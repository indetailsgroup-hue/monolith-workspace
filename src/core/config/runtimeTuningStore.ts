/**
 * runtimeTuningStore.ts - Runtime Tuning State Store
 *
 * PURPOSE:
 * - Manage runtime configuration overrides
 * - Support apply/rollback operations
 * - Notify listeners of state changes
 *
 * USAGE:
 * import { RUNTIME_TUNING } from './runtimeTuningStore';
 *
 * // Check if tuning is active
 * const isActive = RUNTIME_TUNING.getState().active;
 *
 * // Subscribe to changes
 * const unsubscribe = RUNTIME_TUNING.subscribe(() => {
 *   console.log('Tuning state changed');
 * });
 *
 * // Apply patch
 * RUNTIME_TUNING.applyPatch(patch, previousValues, reportId);
 *
 * // Rollback
 * RUNTIME_TUNING.rollback();
 */

import {
  type RuntimeTuningState,
  type RuntimeTuningPatch,
  type TuningApplyPolicy,
  INITIAL_TUNING_STATE,
  generateSessionId,
} from './runtimeTuningTypes';
import { nowMs } from '../telemetry/timer';

// ============================================
// LISTENER TYPE
// ============================================

type TuningListener = () => void;

// ============================================
// STORE CLASS
// ============================================

class RuntimeTuningStore {
  private state: RuntimeTuningState;
  private listeners: Set<TuningListener>;

  constructor() {
    this.state = { ...INITIAL_TUNING_STATE };
    this.listeners = new Set();
  }

  // ============================================
  // GETTERS
  // ============================================

  /**
   * Get current state (immutable copy)
   */
  getState(): RuntimeTuningState {
    return { ...this.state };
  }

  /**
   * Check if tuning is currently active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get current patch
   */
  getPatch(): RuntimeTuningPatch | null {
    return this.state.patch ? { ...this.state.patch } : null;
  }

  /**
   * Get policy
   */
  getPolicy(): TuningApplyPolicy {
    return { ...this.state.policy };
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.state.sessionId;
  }

  /**
   * Get applied value for a specific key
   */
  getAppliedValue(key: string): number | undefined {
    return this.state.patch?.[key]?.to;
  }

  // ============================================
  // SETTERS
  // ============================================

  /**
   * Update apply policy
   */
  setPolicy(policy: Partial<TuningApplyPolicy>): void {
    this.state = {
      ...this.state,
      policy: { ...this.state.policy, ...policy },
    };
    this.emit();
  }

  // ============================================
  // APPLY PATCH
  // ============================================

  /**
   * Apply a tuning patch
   *
   * @param patch - Parameter changes to apply
   * @param previous - Previous values for rollback
   * @param reportId - Shadow report ID that led to this patch
   * @returns Session ID for this tuning session
   */
  applyPatch(
    patch: RuntimeTuningPatch,
    previous: Record<string, number>,
    reportId: string
  ): string {
    const sessionId = generateSessionId();

    this.state = {
      ...this.state,
      active: true,
      patch: { ...patch },
      previous: { ...previous },
      appliedAtTs: nowMs(),
      lastShadowReportId: reportId,
      sessionId,
    };

    this.emit();

    console.log(`[RuntimeTuning] Applied patch (session: ${sessionId})`);

    return sessionId;
  }

  // ============================================
  // ROLLBACK
  // ============================================

  /**
   * Rollback to previous configuration
   *
   * @returns Previous values that were restored
   */
  rollback(): Record<string, number> | null {
    if (!this.state.active) {
      console.log('[RuntimeTuning] Nothing to rollback');
      return null;
    }

    const previousSnapshot = this.state.previous;
    const sessionId = this.state.sessionId;

    this.state = {
      ...this.state,
      active: false,
      patch: null,
      previous: null,
      appliedAtTs: null,
      lastShadowReportId: null,
      sessionId: null,
    };

    this.emit();

    console.log(`[RuntimeTuning] Rolled back (was session: ${sessionId})`);

    return previousSnapshot;
  }

  // ============================================
  // RESET
  // ============================================

  /**
   * Reset to initial state (including policy)
   */
  reset(): void {
    this.state = { ...INITIAL_TUNING_STATE };
    this.emit();
    console.log('[RuntimeTuning] Reset to initial state');
  }

  // ============================================
  // SUBSCRIPTION
  // ============================================

  /**
   * Subscribe to state changes
   *
   * @param listener - Callback to invoke on state change
   * @returns Unsubscribe function
   */
  subscribe(listener: TuningListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ============================================
  // EMIT
  // ============================================

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[RuntimeTuning] Listener error:', err);
      }
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

/**
 * Global runtime tuning store instance
 */
export const RUNTIME_TUNING = new RuntimeTuningStore();

// ============================================
// REACT HOOK (optional helper)
// ============================================

/**
 * React hook for runtime tuning state
 *
 * Usage:
 * const tuningState = useRuntimeTuning();
 */
export function useRuntimeTuningSubscription(
  callback: () => void
): () => void {
  return RUNTIME_TUNING.subscribe(callback);
}
