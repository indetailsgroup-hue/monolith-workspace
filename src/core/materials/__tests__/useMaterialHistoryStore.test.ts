/**
 * useMaterialHistoryStore.test.ts - Tests for Recent Materials History Store
 *
 * @version 1.0.0 - Phase 4 T012
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useMaterialHistoryStore } from '../useMaterialHistoryStore';

describe('useMaterialHistoryStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useMaterialHistoryStore.setState({ history: [] });
  });

  describe('addToHistory', () => {
    it('adds a material to history', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      addToHistory('mat-001');

      expect(getRecentIds()).toContain('mat-001');
    });

    it('adds materials in reverse order (most recent first)', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      addToHistory('mat-001');
      addToHistory('mat-002');
      addToHistory('mat-003');

      const recent = getRecentIds();
      expect(recent[0]).toBe('mat-003');
      expect(recent[1]).toBe('mat-002');
      expect(recent[2]).toBe('mat-001');
    });

    it('moves existing material to front (LRU behavior)', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      addToHistory('mat-001');
      addToHistory('mat-002');
      addToHistory('mat-003');
      addToHistory('mat-001'); // Re-add mat-001

      const recent = getRecentIds();
      expect(recent[0]).toBe('mat-001');
      expect(recent[1]).toBe('mat-003');
      expect(recent[2]).toBe('mat-002');
      expect(recent.length).toBe(3); // No duplicates
    });

    it('limits history to MAX_HISTORY_SIZE (15)', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      // Add 20 materials
      for (let i = 1; i <= 20; i++) {
        addToHistory(`mat-${i.toString().padStart(3, '0')}`);
      }

      const recent = getRecentIds(20); // Request more than limit
      expect(recent.length).toBe(15);
      expect(recent[0]).toBe('mat-020'); // Most recent
      expect(recent[14]).toBe('mat-006'); // Oldest kept
    });

    it('adds timestamp to history entry', () => {
      const { addToHistory } = useMaterialHistoryStore.getState();
      const before = Date.now();

      addToHistory('mat-001');

      const after = Date.now();
      const history = useMaterialHistoryStore.getState().history;
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getRecentIds', () => {
    it('returns empty array when no history', () => {
      const { getRecentIds } = useMaterialHistoryStore.getState();
      expect(getRecentIds()).toEqual([]);
    });

    it('respects limit parameter', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      for (let i = 1; i <= 10; i++) {
        addToHistory(`mat-${i}`);
      }

      expect(getRecentIds(5).length).toBe(5);
      expect(getRecentIds(3).length).toBe(3);
    });

    it('defaults to limit of 10', () => {
      const { addToHistory, getRecentIds } = useMaterialHistoryStore.getState();

      for (let i = 1; i <= 15; i++) {
        addToHistory(`mat-${i}`);
      }

      expect(getRecentIds().length).toBe(10);
    });
  });

  describe('isRecent', () => {
    it('returns true for materials in history', () => {
      const { addToHistory, isRecent } = useMaterialHistoryStore.getState();

      addToHistory('mat-001');

      expect(isRecent('mat-001')).toBe(true);
    });

    it('returns false for materials not in history', () => {
      const { isRecent } = useMaterialHistoryStore.getState();
      expect(isRecent('mat-unknown')).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('clears all history', () => {
      const { addToHistory, clearHistory, getRecentIds } = useMaterialHistoryStore.getState();

      addToHistory('mat-001');
      addToHistory('mat-002');

      clearHistory();

      expect(getRecentIds()).toEqual([]);
    });
  });
});
