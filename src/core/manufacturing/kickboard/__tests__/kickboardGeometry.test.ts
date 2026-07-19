/**
 * kickboardGeometry.test.ts - Unit tests for plinth / kickboard geometry
 *
 * The kickboard closes the toe-kick void that `dimensions.toeKickHeight` (Leg)
 * currently leaves as open air under every base cabinet.
 */

import { describe, expect, it } from 'vitest';
import {
  computeKickboardSize,
  computeKickboardFrontZ,
  computeKickboardZ,
  resolveKickboardSetback,
  shouldGenerateKickboard,
  DEFAULT_KICK_SETBACK,
  NO_TOE_KICK_CABINET_TYPES,
} from '../kickboardGeometry';

// Worked example from the approved design
const W = 600;
const H = 720;
const D = 560;
const LEG = 100;
const S = 50;
const T = 18.6; // 18mm core + 2 x 0.3mm surface

const DIMS = { width: W, height: H, depth: D, toeKickHeight: LEG };

describe('kickboardGeometry', () => {
  // ============================================
  // computeKickboardSize
  // ============================================
  describe('computeKickboardSize', () => {
    it('spans the FULL cabinet width, not the internal width', () => {
      // kickW = W (not W - 2T): the plinth is applied to the OUTSIDE of the
      // carcass footprint so neighbouring cabinets' kicks butt with no notch.
      const size = computeKickboardSize(DIMS);
      expect(size.width).toBe(600);
    });

    it('is exactly toeKickHeight tall', () => {
      expect(computeKickboardSize(DIMS).height).toBe(LEG);
    });

    it('tracks a different toe kick height', () => {
      const size = computeKickboardSize({ ...DIMS, toeKickHeight: 150 });
      expect(size.height).toBe(150);
    });
  });

  // ============================================
  // computeKickboardFrontZ / computeKickboardZ
  // ============================================
  describe('computeKickboardFrontZ', () => {
    it('recesses the front face by the setback from the carcass front face', () => {
      // D/2 = 280, minus 50mm setback = 230
      expect(computeKickboardFrontZ(D, S, 'CARCASS')).toBe(230);
    });

    it('ignores doorThickness entirely under the CARCASS datum', () => {
      expect(computeKickboardFrontZ(D, S, 'CARCASS', 18)).toBe(230);
    });

    it('measures from the door outer face under the FRONT datum', () => {
      // door face = D/2 + doorThickness = 298, minus 50 = 248
      expect(computeKickboardFrontZ(D, S, 'FRONT', 18)).toBe(248);
    });

    it('falls back to the carcass datum when FRONT is asked for but there are no doors', () => {
      expect(computeKickboardFrontZ(D, S, 'FRONT')).toBe(230);
      expect(computeKickboardFrontZ(D, S, 'FRONT', 0)).toBe(230);
    });
  });

  describe('computeKickboardZ', () => {
    it('returns the panel CENTRE, half a thickness behind the front face', () => {
      // 230 - 9.3 = 220.7
      expect(computeKickboardZ(D, T, S, 'CARCASS')).toBeCloseTo(220.7, 6);
    });

    it('moves the plinth forward by the door thickness under the FRONT datum', () => {
      // 248 - 9.3 = 238.7
      expect(computeKickboardZ(D, T, S, 'FRONT', 18)).toBeCloseTo(238.7, 6);
    });

    it('does NOT apply the carcass back-panel Z offset', () => {
      // The kickboard is referenced to the FRONT face, so the back construction
      // must not move it. Same depth in, same Z out.
      const a = computeKickboardZ(D, T, S, 'CARCASS');
      const b = computeKickboardZ(D, T, S, 'CARCASS');
      expect(a).toBe(b);
      expect(a).toBeCloseTo(D / 2 - S - T / 2, 6);
    });
  });

  // ============================================
  // Flush-with-carcass invariant (both joint modes)
  // ============================================
  describe('carcass underside is at Y = Leg in BOTH joint modes', () => {
    // Mirrors useCabinetStore generatePanels bottom-panel Y:
    //   INSET:   T/2 + Leg
    //   OVERLAY: bottomReduction - T/2 + Leg,  bottomReduction = T
    const bottomCentreY = (joint: 'INSET' | 'OVERLAY') =>
      joint === 'INSET' ? T / 2 + LEG : T - T / 2 + LEG;

    it.each(['INSET', 'OVERLAY'] as const)(
      '%s bottom panel underside lands exactly on the kickboard top face',
      (joint) => {
        const underside = bottomCentreY(joint) - T / 2;
        expect(underside).toBeCloseTo(LEG, 6);

        // Kickboard spans Y 0..height, so its top face meets the underside:
        const { height } = computeKickboardSize(DIMS);
        expect(height).toBeCloseTo(underside, 6); // no gap, no interference
      }
    );
  });

  // ============================================
  // shouldGenerateKickboard
  // ============================================
  describe('shouldGenerateKickboard', () => {
    it('is true for a base cabinet with a toe kick and no explicit config', () => {
      expect(shouldGenerateKickboard(DIMS, {})).toBe(true);
    });

    // NOTE the retitle. This used to read "(e.g. WALL cabinets)", which was
    // untrue about the product and made the suite look like it covered the
    // wall-cabinet case when it covered nothing of the sort: no WALL cabinet
    // the store can build has toeKickHeight 0 — createCabinet always applies
    // DEFAULT_DIMENSIONS, which carries 100. The real coverage is the
    // store-level negative test in kickboardCosting.test.ts.
    it('is false when toeKickHeight is 0', () => {
      expect(shouldGenerateKickboard({ ...DIMS, toeKickHeight: 0 }, {})).toBe(false);
    });

    it('is false for a WALL cabinet even when toeKickHeight is nonzero', () => {
      // The bug this pins: createCabinet('WALL') produces toeKickHeight 100, so
      // gating on height alone put a fully-costed 600x100 plinth in the BOM and
      // the cut list for a cabinet that hangs on a wall over open floor.
      expect(shouldGenerateKickboard(DIMS, {}, 'WALL')).toBe(false);
    });

    it('is TRUE for a TALL cabinet — a pantry stands on the floor', () => {
      // Deliberately not excluded alongside WALL. CabinetTaxonomy declares
      // TALL_PANTRY and TALL_BROOM with hasToeKick: true and toeKickHeight 100
      // (CabinetTaxonomy.ts:509, 528), so a TALL unit does get a plinth.
      expect(shouldGenerateKickboard(DIMS, {}, 'TALL')).toBe(true);
    });

    it('derives the excluded set from the taxonomy rather than hard-coding it', () => {
      expect([...NO_TOE_KICK_CABINET_TYPES].sort()).toEqual(['WALL']);
    });

    it('is false when the user turns the kickboard off', () => {
      expect(
        shouldGenerateKickboard(DIMS, { kickboardConfig: { hasKickboard: false } })
      ).toBe(false);
    });

    it('is true when the user turns it explicitly on', () => {
      expect(
        shouldGenerateKickboard(DIMS, { kickboardConfig: { hasKickboard: true } })
      ).toBe(true);
    });

    it('stays false with toeKickHeight 0 even if hasKickboard is true (nothing to close)', () => {
      expect(
        shouldGenerateKickboard(
          { ...DIMS, toeKickHeight: 0 },
          { kickboardConfig: { hasKickboard: true } }
        )
      ).toBe(false);
    });
  });

  // ============================================
  // resolveKickboardSetback
  // ============================================
  describe('resolveKickboardSetback', () => {
    it('defaults to the manufacturing param', () => {
      expect(resolveKickboardSetback({}, 50)).toBe(50);
    });

    it('honours a per-cabinet override', () => {
      expect(
        resolveKickboardSetback({ kickboardConfig: { hasKickboard: true, setback: 80 } }, 50)
      ).toBe(80);
    });

    it('falls back to the module default when no param is supplied', () => {
      expect(resolveKickboardSetback({})).toBe(DEFAULT_KICK_SETBACK);
    });
  });
});
