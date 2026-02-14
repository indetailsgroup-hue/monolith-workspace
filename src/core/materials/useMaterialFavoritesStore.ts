/**
 * useMaterialFavoritesStore - Bookmarked Materials
 *
 * Allows users to favorite/bookmark materials for quick access.
 * Persisted to localStorage for cross-session persistence.
 *
 * @version 1.0.0 - Phase 4 T013
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MaterialFavoritesState {
  /** Array of favorited material IDs */
  favoriteIds: string[];

  /**
   * Add a material to favorites
   */
  addFavorite: (materialId: string) => void;

  /**
   * Remove a material from favorites
   */
  removeFavorite: (materialId: string) => void;

  /**
   * Toggle favorite status
   */
  toggleFavorite: (materialId: string) => void;

  /**
   * Check if a material is favorited
   */
  isFavorite: (materialId: string) => boolean;

  /**
   * Clear all favorites
   */
  clearFavorites: () => void;

  /**
   * Get count of favorites
   */
  getFavoriteCount: () => number;
}

export const useMaterialFavoritesStore = create<MaterialFavoritesState>()(
  persist(
    (set, get) => ({
      favoriteIds: [],

      addFavorite: (materialId) => {
        set((state) => ({
          favoriteIds: state.favoriteIds.includes(materialId)
            ? state.favoriteIds
            : [...state.favoriteIds, materialId],
        }));
      },

      removeFavorite: (materialId) => {
        set((state) => ({
          favoriteIds: state.favoriteIds.filter((id) => id !== materialId),
        }));
      },

      toggleFavorite: (materialId) => {
        const { isFavorite, addFavorite, removeFavorite } = get();
        if (isFavorite(materialId)) {
          removeFavorite(materialId);
        } else {
          addFavorite(materialId);
        }
      },

      isFavorite: (materialId) => get().favoriteIds.includes(materialId),

      clearFavorites: () => set({ favoriteIds: [] }),

      getFavoriteCount: () => get().favoriteIds.length,
    }),
    {
      name: 'monolith:material-favorites',
      version: 1,
    }
  )
);
