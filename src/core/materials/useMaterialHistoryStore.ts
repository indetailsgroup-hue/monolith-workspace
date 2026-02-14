/**
 * useMaterialHistoryStore - Recent Materials History
 *
 * Tracks recently used materials with LRU eviction.
 * Persisted to localStorage for cross-session persistence.
 *
 * @version 1.0.0 - Phase 4 T012
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY_SIZE = 15;

interface HistoryEntry {
  materialId: string;
  timestamp: number;
}

interface MaterialHistoryState {
  /** History entries ordered by most recent first */
  history: HistoryEntry[];

  /**
   * Add a material to history (LRU: moves existing to front)
   */
  addToHistory: (materialId: string) => void;

  /**
   * Clear all history
   */
  clearHistory: () => void;

  /**
   * Get recent material IDs
   * @param limit - Maximum number to return (default: 10)
   */
  getRecentIds: (limit?: number) => string[];

  /**
   * Check if a material is in recent history
   */
  isRecent: (materialId: string) => boolean;
}

export const useMaterialHistoryStore = create<MaterialHistoryState>()(
  persist(
    (set, get) => ({
      history: [],

      addToHistory: (materialId) => {
        set((state) => {
          // Remove existing entry if present (LRU behavior)
          const filtered = state.history.filter(
            (h) => h.materialId !== materialId
          );

          // Add to front with current timestamp
          const newHistory = [
            { materialId, timestamp: Date.now() },
            ...filtered,
          ].slice(0, MAX_HISTORY_SIZE);

          return { history: newHistory };
        });
      },

      clearHistory: () => set({ history: [] }),

      getRecentIds: (limit = 10) => {
        return get()
          .history.slice(0, limit)
          .map((h) => h.materialId);
      },

      isRecent: (materialId) => {
        return get().history.some((h) => h.materialId === materialId);
      },
    }),
    {
      name: 'monolith:material-history',
      version: 1,
    }
  )
);
