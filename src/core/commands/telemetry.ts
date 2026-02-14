/**
 * telemetry.ts - Command Usage Telemetry
 *
 * Tracks command execution counts locally (localStorage).
 * Used for "Frequent" section in Command Palette.
 *
 * @version 1.0.0
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

interface CommandStat {
  id: string;
  count: number;
  lastUsed: number;
}

interface TelemetryState {
  /** Command ID → execution count */
  stats: Record<string, { count: number; lastUsed: number }>;
}

interface TelemetryActions {
  /** Increment execution count for a command */
  bump: (commandId: string) => void;

  /** Get most frequently used commands */
  mostUsed: (n: number) => CommandStat[];

  /** Get recently used commands */
  recentlyUsed: (n: number) => CommandStat[];

  /** Reset all stats */
  reset: () => void;
}

// ============================================================================
// Store
// ============================================================================

const STORAGE_KEY = 'monolith.command.telemetry.v1';

export const useCommandTelemetry = create<TelemetryState & TelemetryActions>()(
  persist(
    (set, get) => ({
      stats: {},

      bump: (commandId) => {
        set((state) => ({
          stats: {
            ...state.stats,
            [commandId]: {
              count: (state.stats[commandId]?.count || 0) + 1,
              lastUsed: Date.now(),
            },
          },
        }));
      },

      mostUsed: (n) => {
        const { stats } = get();
        const entries = Object.entries(stats)
          .map(([id, { count, lastUsed }]) => ({ id, count, lastUsed }))
          .sort((a, b) => b.count - a.count);
        return entries.slice(0, n);
      },

      recentlyUsed: (n) => {
        const { stats } = get();
        const entries = Object.entries(stats)
          .map(([id, { count, lastUsed }]) => ({ id, count, lastUsed }))
          .sort((a, b) => b.lastUsed - a.lastUsed);
        return entries.slice(0, n);
      },

      reset: () => {
        set({ stats: {} });
      },
    }),
    {
      name: STORAGE_KEY,
    }
  )
);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get frequent command IDs for Command Palette
 */
export function getFrequentCommandIds(limit = 5): string[] {
  return useCommandTelemetry.getState().mostUsed(limit).map((s) => s.id);
}

/**
 * Get recent command IDs
 */
export function getRecentCommandIds(limit = 5): string[] {
  return useCommandTelemetry.getState().recentlyUsed(limit).map((s) => s.id);
}
