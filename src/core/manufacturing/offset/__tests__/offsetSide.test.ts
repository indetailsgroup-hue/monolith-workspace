/**
 * offsetSide.test.ts - Tests for offset side calculation
 *
 * Tests the direction-safety invariant:
 * - When a path is reversed, winding flips but physical relationship preserved
 * - OUTSIDE cuts offset away from material
 * - INSIDE cuts offset toward material (into hole)
 */

import { describe, it, expect } from 'vitest';
import {
  Winding,
  CutSide,
  interiorSideFromWinding,
  exteriorSideFromWinding,
  offsetSideForProfile,
  offsetSideForGroove,
  offsetSideForPocket,
  flipOffsetSide,
  flipWinding,
} from '../offsetSide';
import type { OffsetSide } from '../offsetSpec.v1';

describe('offsetSide', () => {
  describe('interiorSideFromWinding', () => {
    it('should return LEFT for CCW winding (standard convention)', () => {
      expect(interiorSideFromWinding('CCW')).toBe('LEFT');
    });

    it('should return RIGHT for CW winding', () => {
      expect(interiorSideFromWinding('CW')).toBe('RIGHT');
    });
  });

  describe('exteriorSideFromWinding', () => {
    it('should return RIGHT for CCW winding', () => {
      expect(exteriorSideFromWinding('CCW')).toBe('RIGHT');
    });

    it('should return LEFT for CW winding', () => {
      expect(exteriorSideFromWinding('CW')).toBe('LEFT');
    });

    it('should be opposite of interiorSideFromWinding', () => {
      const windings: Winding[] = ['CW', 'CCW'];
      for (const w of windings) {
        const interior = interiorSideFromWinding(w);
        const exterior = exteriorSideFromWinding(w);
        expect(interior).not.toBe(exterior);
      }
    });
  });

  describe('offsetSideForProfile', () => {
    describe('OUTSIDE cuts', () => {
      it('should offset RIGHT for CCW path (away from interior)', () => {
        // CCW: interior is LEFT, so OUTSIDE cut goes RIGHT
        expect(offsetSideForProfile('CCW', 'OUTSIDE')).toBe('RIGHT');
      });

      it('should offset LEFT for CW path (away from interior)', () => {
        // CW: interior is RIGHT, so OUTSIDE cut goes LEFT
        expect(offsetSideForProfile('CW', 'OUTSIDE')).toBe('LEFT');
      });
    });

    describe('INSIDE cuts (holes)', () => {
      it('should offset LEFT for CCW path (toward interior)', () => {
        // CCW: interior is LEFT, so INSIDE cut goes LEFT
        expect(offsetSideForProfile('CCW', 'INSIDE')).toBe('LEFT');
      });

      it('should offset RIGHT for CW path (toward interior)', () => {
        // CW: interior is RIGHT, so INSIDE cut goes RIGHT
        expect(offsetSideForProfile('CW', 'INSIDE')).toBe('RIGHT');
      });
    });

    describe('direction-safety invariant', () => {
      /**
       * When path is reversed:
       * - Winding flips (CW ↔ CCW)
       * - The physical offset direction should remain the same
       *   relative to the material
       *
       * This test verifies the invariant holds.
       */
      it('should preserve physical offset when path is reversed', () => {
        const cutSides: CutSide[] = ['OUTSIDE', 'INSIDE'];

        for (const cutSide of cutSides) {
          // Original: CCW path
          const originalSide = offsetSideForProfile('CCW', cutSide);

          // Reversed: CW path (winding flipped)
          const reversedSide = offsetSideForProfile('CW', cutSide);

          // The sides should be OPPOSITE because:
          // - When path reverses, LEFT becomes RIGHT from the path's POV
          // - But the physical material location is unchanged
          expect(originalSide).not.toBe(reversedSide);
        }
      });
    });
  });

  describe('offsetSideForGroove', () => {
    it('should return LEFT for centerline groove (no side specified)', () => {
      // When no side specified, defaults to LEFT
      expect(offsetSideForGroove()).toBe('LEFT');
      expect(offsetSideForGroove(undefined)).toBe('LEFT');
    });

    it('should return specified side when provided', () => {
      expect(offsetSideForGroove('LEFT')).toBe('LEFT');
      expect(offsetSideForGroove('RIGHT')).toBe('RIGHT');
    });
  });

  describe('offsetSideForPocket', () => {
    it('should offset toward interior for clearing', () => {
      // Pocket clearing goes toward interior (material side)
      expect(offsetSideForPocket('CCW')).toBe('LEFT'); // CCW interior is LEFT
      expect(offsetSideForPocket('CW')).toBe('RIGHT'); // CW interior is RIGHT
    });
  });

  describe('flipOffsetSide', () => {
    it('should flip LEFT to RIGHT', () => {
      expect(flipOffsetSide('LEFT')).toBe('RIGHT');
    });

    it('should flip RIGHT to LEFT', () => {
      expect(flipOffsetSide('RIGHT')).toBe('LEFT');
    });

    it('should be its own inverse', () => {
      const sides: OffsetSide[] = ['LEFT', 'RIGHT'];
      for (const side of sides) {
        expect(flipOffsetSide(flipOffsetSide(side))).toBe(side);
      }
    });
  });

  describe('flipWinding', () => {
    it('should flip CW to CCW', () => {
      expect(flipWinding('CW')).toBe('CCW');
    });

    it('should flip CCW to CW', () => {
      expect(flipWinding('CCW')).toBe('CW');
    });

    it('should be its own inverse', () => {
      const windings: Winding[] = ['CW', 'CCW'];
      for (const w of windings) {
        expect(flipWinding(flipWinding(w))).toBe(w);
      }
    });
  });

  describe('integration: winding flip preserves offset semantics', () => {
    /**
     * Key invariant: When you reverse a path:
     * 1. Winding flips
     * 2. What was "LEFT" from path POV is now "RIGHT"
     * 3. Physical material relationship is preserved
     *
     * This means: flipWinding + flipOffsetSide = same physical location
     */
    it('should maintain physical consistency when both winding and side flip', () => {
      const cutSides: CutSide[] = ['OUTSIDE', 'INSIDE'];

      for (const cutSide of cutSides) {
        // Original configuration
        const originalWinding: Winding = 'CCW';
        const originalSide = offsetSideForProfile(originalWinding, cutSide);

        // After path reversal
        const reversedWinding = flipWinding(originalWinding);
        const reversedSide = offsetSideForProfile(reversedWinding, cutSide);

        // The sides should be opposite (from path POV)
        // but represent the same physical location
        expect(reversedSide).toBe(flipOffsetSide(originalSide));
      }
    });
  });
});
