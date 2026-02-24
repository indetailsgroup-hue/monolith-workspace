/**
 * Unit tests for selectConnectorPositions()
 *
 * Verifies Häfele CAD specification for dowel placement:
 * - B < 400mm: 2 CORNER positions (front + back), each gets 1 dowel
 * - A >= 400mm: 2 CORNER + 1 MIDDLE position, middle gets 2 dowels
 */

import { describe, it, expect } from 'vitest';
import {
  selectConnectorPositions,
  type ConnectorPosition,
  type ConnectorPositionType,
} from '../generateDrillMap';
import { buildSystem32PositionsAuto } from '../panelBasis';

/** System32 default params for testing */
const SYS32_PARAMS = {
  firstHole: 37,
  pitch: 32,
  endOffset: 40,
  maxConnectors: undefined,
};

describe('selectConnectorPositions', () => {
  // ========================================
  // B < 400mm: CORNERS ONLY
  // ========================================
  describe('B < 400mm (short depth, corners only)', () => {
    it('returns 2 CORNER positions for 350mm depth', () => {
      const positions = buildSystem32PositionsAuto(350, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 350);

      expect(selected.length).toBe(2);
      expect(selected[0].type).toBe('CORNER');
      expect(selected[1].type).toBe('CORNER');
    });

    it('first position is smallest S32 (37mm)', () => {
      const positions = buildSystem32PositionsAuto(350, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 350);

      expect(selected[0].sys32Z).toBe(37);
    });

    it('last position is largest S32 within bounds', () => {
      const positions = buildSystem32PositionsAuto(350, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 350);

      // 350 - 40 = 310 maxPos → positions: 37, 69, 101, ..., 293
      const lastAvailable = positions[positions.length - 1];
      expect(selected[1].sys32Z).toBe(lastAvailable);
    });

    it('returns 2 positions for 300mm depth', () => {
      const positions = buildSystem32PositionsAuto(300, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 300);

      expect(selected.length).toBe(2);
      expect(selected.every(p => p.type === 'CORNER')).toBe(true);
    });

    it('returns 2 positions for 399mm depth (just under threshold)', () => {
      const positions = buildSystem32PositionsAuto(399, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 399);

      expect(selected.length).toBe(2);
      expect(selected.every(p => p.type === 'CORNER')).toBe(true);
    });

    it('no MIDDLE positions exist', () => {
      const positions = buildSystem32PositionsAuto(350, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 350);

      expect(selected.filter(p => p.type === 'MIDDLE').length).toBe(0);
    });
  });

  // ========================================
  // A >= 400mm: CORNERS + 1 MIDDLE
  // ========================================
  describe('A >= 400mm (deep cabinet, corners + middle)', () => {
    it('returns 3 positions for 560mm depth', () => {
      const positions = buildSystem32PositionsAuto(560, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 560);

      expect(selected.length).toBe(3);
    });

    it('first and last are CORNER, middle is MIDDLE', () => {
      const positions = buildSystem32PositionsAuto(560, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 560);

      expect(selected[0].type).toBe('CORNER');
      expect(selected[1].type).toBe('MIDDLE');
      expect(selected[2].type).toBe('CORNER');
    });

    it('returns 3 positions for exactly 400mm depth', () => {
      const positions = buildSystem32PositionsAuto(400, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 400);

      expect(selected.length).toBe(3);
      expect(selected[1].type).toBe('MIDDLE');
    });

    it('middle position is closest to geometric center', () => {
      const positions = buildSystem32PositionsAuto(560, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 560);

      const firstZ = selected[0].sys32Z;
      const lastZ = selected[2].sys32Z;
      const centerZ = (firstZ + lastZ) / 2;
      const middleZ = selected[1].sys32Z;

      // Middle should be the S32 position closest to center
      const availableMiddles = positions.filter(
        z => z !== firstZ && z !== lastZ
      );
      for (const z of availableMiddles) {
        expect(Math.abs(middleZ - centerZ)).toBeLessThanOrEqual(
          Math.abs(z - centerZ) + 0.001 // floating point tolerance
        );
      }
    });

    it('returns 3 positions for 600mm depth', () => {
      const positions = buildSystem32PositionsAuto(600, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 600);

      expect(selected.length).toBe(3);
      expect(selected[0].type).toBe('CORNER');
      expect(selected[1].type).toBe('MIDDLE');
      expect(selected[2].type).toBe('CORNER');
    });

    it('returns 3 positions for 800mm depth (large cabinet)', () => {
      const positions = buildSystem32PositionsAuto(800, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 800);

      // Still only 3 positions — 1 middle always
      expect(selected.length).toBe(3);
      expect(selected.filter(p => p.type === 'MIDDLE').length).toBe(1);
    });
  });

  // ========================================
  // EDGE CASES
  // ========================================
  describe('edge cases', () => {
    it('empty S32 positions returns empty array', () => {
      const selected = selectConnectorPositions([], 500);
      expect(selected).toEqual([]);
    });

    it('single S32 position returns 1 CORNER', () => {
      const selected = selectConnectorPositions([37], 100);
      expect(selected.length).toBe(1);
      expect(selected[0].type).toBe('CORNER');
      expect(selected[0].sys32Z).toBe(37);
    });

    it('two S32 positions with depth >= 400 returns 2 CORNERs (no room for middle)', () => {
      // Only 2 positions available — cannot create a distinct middle
      const selected = selectConnectorPositions([37, 69], 450);

      // Should have 2 corners since there's no distinct middle position
      expect(selected.length).toBe(2);
      expect(selected[0].type).toBe('CORNER');
      expect(selected[1].type).toBe('CORNER');
    });

    it('indexes are sequential', () => {
      const positions = buildSystem32PositionsAuto(560, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 560);

      expect(selected[0].index).toBe(0);
      expect(selected[1].index).toBe(1);
      expect(selected[2].index).toBe(2);
    });

    it('very short depth (100mm) still returns at least 1 position', () => {
      const positions = buildSystem32PositionsAuto(100, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 100);

      expect(selected.length).toBeGreaterThanOrEqual(1);
      expect(selected[0].type).toBe('CORNER');
    });
  });

  // ========================================
  // POSITION TYPE SUMMARY
  // ========================================
  describe('connector count summary per edge', () => {
    it('B<400mm: total connectors = 2 per edge', () => {
      const positions = buildSystem32PositionsAuto(350, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 350);

      // 2 Minifix + 2 Dowels (1 per corner) = 4 total per edge, per panel side
      expect(selected.length).toBe(2);
    });

    it('A>=400mm: total connectors = 3 per edge', () => {
      const positions = buildSystem32PositionsAuto(560, SYS32_PARAMS);
      const selected = selectConnectorPositions(positions, 560);

      // 3 Minifix + 4 Dowels (1+2+1) = 7 total per edge, per panel side
      expect(selected.length).toBe(3);
    });
  });
});
