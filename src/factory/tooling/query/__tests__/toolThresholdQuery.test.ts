/**
 * toolThresholdQuery.test.ts - Tool Threshold Query Tests
 *
 * Tests for D6.1 threshold query helpers.
 * Uses fake-indexeddb for consistent testing.
 *
 * @version 1.0.0 - Phase D6.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetToolingDb, setToolWearThreshold } from '../../storage';
import { DEFAULT_MAX_WEAR_UNITS } from '../../wearModel';
import {
  getEffectiveThreshold,
  hasCustomThreshold,
  listCustomThresholds,
  updateThreshold,
  removeThreshold,
  THRESHOLD_PRESETS,
  getPresetValue,
  suggestPreset,
} from '../toolThresholdQuery';

describe('D6.1 toolThresholdQuery', () => {
  beforeEach(async () => {
    await resetToolingDb();
  });

  describe('getEffectiveThreshold', () => {
    it('returns default when no custom threshold', async () => {
      const threshold = await getEffectiveThreshold('DRILL_5');
      expect(threshold).toBe(DEFAULT_MAX_WEAR_UNITS);
    });

    it('returns custom threshold when set', async () => {
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 7500 });

      const threshold = await getEffectiveThreshold('DRILL_5');
      expect(threshold).toBe(7500);
    });
  });

  describe('hasCustomThreshold', () => {
    it('returns false when no custom threshold', async () => {
      const has = await hasCustomThreshold('DRILL_5');
      expect(has).toBe(false);
    });

    it('returns true when custom threshold exists', async () => {
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });

      const has = await hasCustomThreshold('DRILL_5');
      expect(has).toBe(true);
    });
  });

  describe('listCustomThresholds', () => {
    it('returns empty array when no thresholds', async () => {
      const list = await listCustomThresholds();
      expect(list).toEqual([]);
    });

    it('returns all custom thresholds sorted', async () => {
      await setToolWearThreshold({ toolId: 'DRILL_8', maxWearUnits: 8000 });
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });

      const list = await listCustomThresholds();

      expect(list).toHaveLength(2);
      expect(list[0].toolId).toBe('DRILL_5');
      expect(list[1].toolId).toBe('DRILL_8');
    });
  });

  describe('updateThreshold', () => {
    it('creates new threshold', async () => {
      await updateThreshold('DRILL_5', 6000);

      const threshold = await getEffectiveThreshold('DRILL_5');
      expect(threshold).toBe(6000);
    });

    it('updates existing threshold', async () => {
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });
      await updateThreshold('DRILL_5', 7000);

      const threshold = await getEffectiveThreshold('DRILL_5');
      expect(threshold).toBe(7000);
    });

    it('throws on invalid value', async () => {
      await expect(updateThreshold('DRILL_5', 0)).rejects.toThrow(
        'maxWearUnits must be greater than 0'
      );
      await expect(updateThreshold('DRILL_5', -100)).rejects.toThrow(
        'maxWearUnits must be greater than 0'
      );
    });
  });

  describe('removeThreshold', () => {
    it('removes existing threshold', async () => {
      await setToolWearThreshold({ toolId: 'DRILL_5', maxWearUnits: 5000 });

      const removed = await removeThreshold('DRILL_5');
      expect(removed).toBe(true);

      // Should now return default
      const threshold = await getEffectiveThreshold('DRILL_5');
      expect(threshold).toBe(DEFAULT_MAX_WEAR_UNITS);
    });

    it('returns false for non-existent threshold', async () => {
      const removed = await removeThreshold('NON_EXISTENT');
      expect(removed).toBe(false);
    });
  });

  describe('THRESHOLD_PRESETS', () => {
    it('has expected preset values', () => {
      expect(THRESHOLD_PRESETS.LIGHT).toBe(5000);
      expect(THRESHOLD_PRESETS.STANDARD).toBe(DEFAULT_MAX_WEAR_UNITS);
      expect(THRESHOLD_PRESETS.HEAVY).toBe(20000);
      expect(THRESHOLD_PRESETS.EXTRA_HEAVY).toBe(50000);
    });
  });

  describe('getPresetValue', () => {
    it('returns correct preset value', () => {
      expect(getPresetValue('LIGHT')).toBe(5000);
      expect(getPresetValue('STANDARD')).toBe(DEFAULT_MAX_WEAR_UNITS);
      expect(getPresetValue('HEAVY')).toBe(20000);
    });
  });

  describe('suggestPreset', () => {
    it('suggests LIGHT for low values', () => {
      expect(suggestPreset(4000)).toBe('LIGHT');
      expect(suggestPreset(5000)).toBe('LIGHT');
      expect(suggestPreset(6000)).toBe('LIGHT');
    });

    it('suggests STANDARD for medium values', () => {
      expect(suggestPreset(10000)).toBe('STANDARD');
      expect(suggestPreset(9000)).toBe('STANDARD');
      expect(suggestPreset(11000)).toBe('STANDARD');
    });

    it('suggests HEAVY for high values', () => {
      expect(suggestPreset(20000)).toBe('HEAVY');
      expect(suggestPreset(18000)).toBe('HEAVY');
    });

    it('suggests EXTRA_HEAVY for very high values', () => {
      expect(suggestPreset(50000)).toBe('EXTRA_HEAVY');
      expect(suggestPreset(40000)).toBe('EXTRA_HEAVY');
    });
  });
});
