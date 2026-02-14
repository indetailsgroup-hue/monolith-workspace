/**
 * useMaterialFavoritesStore.test.ts - Tests for Material Favorites Store
 *
 * @version 1.0.0 - Phase 4 T013
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMaterialFavoritesStore } from '../useMaterialFavoritesStore';

describe('useMaterialFavoritesStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useMaterialFavoritesStore.setState({ favoriteIds: [] });
  });

  describe('addFavorite', () => {
    it('adds a material to favorites', () => {
      const { addFavorite, favoriteIds } = useMaterialFavoritesStore.getState();

      addFavorite('mat-001');

      expect(useMaterialFavoritesStore.getState().favoriteIds).toContain('mat-001');
    });

    it('does not add duplicates', () => {
      const { addFavorite } = useMaterialFavoritesStore.getState();

      addFavorite('mat-001');
      addFavorite('mat-001');

      expect(useMaterialFavoritesStore.getState().favoriteIds.length).toBe(1);
    });

    it('adds multiple unique materials', () => {
      const { addFavorite } = useMaterialFavoritesStore.getState();

      addFavorite('mat-001');
      addFavorite('mat-002');
      addFavorite('mat-003');

      const favorites = useMaterialFavoritesStore.getState().favoriteIds;
      expect(favorites).toContain('mat-001');
      expect(favorites).toContain('mat-002');
      expect(favorites).toContain('mat-003');
      expect(favorites.length).toBe(3);
    });
  });

  describe('removeFavorite', () => {
    it('removes a material from favorites', () => {
      useMaterialFavoritesStore.setState({ favoriteIds: ['mat-001', 'mat-002'] });
      const { removeFavorite } = useMaterialFavoritesStore.getState();

      removeFavorite('mat-001');

      const favorites = useMaterialFavoritesStore.getState().favoriteIds;
      expect(favorites).not.toContain('mat-001');
      expect(favorites).toContain('mat-002');
    });

    it('does nothing when removing non-existent material', () => {
      useMaterialFavoritesStore.setState({ favoriteIds: ['mat-001'] });
      const { removeFavorite } = useMaterialFavoritesStore.getState();

      removeFavorite('mat-999');

      expect(useMaterialFavoritesStore.getState().favoriteIds).toEqual(['mat-001']);
    });
  });

  describe('toggleFavorite', () => {
    it('adds material when not favorited', () => {
      const { toggleFavorite, isFavorite } = useMaterialFavoritesStore.getState();

      toggleFavorite('mat-001');

      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(true);
    });

    it('removes material when already favorited', () => {
      useMaterialFavoritesStore.setState({ favoriteIds: ['mat-001'] });
      const { toggleFavorite } = useMaterialFavoritesStore.getState();

      toggleFavorite('mat-001');

      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(false);
    });

    it('toggles back and forth correctly', () => {
      const { toggleFavorite, isFavorite } = useMaterialFavoritesStore.getState();

      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(false);

      toggleFavorite('mat-001');
      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(true);

      toggleFavorite('mat-001');
      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(false);

      toggleFavorite('mat-001');
      expect(useMaterialFavoritesStore.getState().isFavorite('mat-001')).toBe(true);
    });
  });

  describe('isFavorite', () => {
    it('returns true for favorited materials', () => {
      useMaterialFavoritesStore.setState({ favoriteIds: ['mat-001'] });
      const { isFavorite } = useMaterialFavoritesStore.getState();

      expect(isFavorite('mat-001')).toBe(true);
    });

    it('returns false for non-favorited materials', () => {
      const { isFavorite } = useMaterialFavoritesStore.getState();
      expect(isFavorite('mat-unknown')).toBe(false);
    });
  });

  describe('clearFavorites', () => {
    it('clears all favorites', () => {
      useMaterialFavoritesStore.setState({
        favoriteIds: ['mat-001', 'mat-002', 'mat-003'],
      });
      const { clearFavorites } = useMaterialFavoritesStore.getState();

      clearFavorites();

      expect(useMaterialFavoritesStore.getState().favoriteIds).toEqual([]);
    });
  });

  describe('getFavoriteCount', () => {
    it('returns 0 when no favorites', () => {
      const { getFavoriteCount } = useMaterialFavoritesStore.getState();
      expect(getFavoriteCount()).toBe(0);
    });

    it('returns correct count', () => {
      useMaterialFavoritesStore.setState({
        favoriteIds: ['mat-001', 'mat-002', 'mat-003'],
      });
      const { getFavoriteCount } = useMaterialFavoritesStore.getState();

      expect(getFavoriteCount()).toBe(3);
    });
  });
});
