/**
 * appliedPartDatum.test.ts — THE DATUM PIN.
 *
 * The point of this file is NOT to check arithmetic; frontDatumOffsetMm is three
 * lines. It is to make a future silent change of reference face impossible.
 *
 * The bug this lane fixed did not look like a bug. Nothing threw, nothing was
 * out of range, and both numbers were individually defensible: the plinth set
 * back 50mm and the worktop hung over 20mm. They were simply measured from
 * different planes, 18mm apart, and no code, comment or emitted spec said so.
 * A change like that leaves no trace unless something is watching the DATUM
 * itself rather than the numbers. That is what these tests do.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPLIED_PART_DATUM,
  DEFAULT_ASSUMED_FRONT_PROUD_MM,
  PLINTH_SETBACK_FROM_FRONT_MM,
  WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM,
  describeAppliedPartDatum,
  frontDatumOffsetMm,
} from '../appliedPartDatum';
import {
  DEFAULT_KICK_SETBACK,
  DEFAULT_KICK_SETBACK_DATUM,
  computeKickboardFrontZ,
  resolveKickboardSetbackDatum,
} from '../../manufacturing/kickboard/kickboardGeometry';
import { DEFAULT_WORKTOP_CONFIG } from '../../worktop/types';

describe('applied-part datum — THE PIN', () => {
  // ============================================
  // The two parts agree. This is the whole lane.
  // ============================================
  describe('the plinth and the worktop measure from the SAME face', () => {
    it('both default to FRONT', () => {
      // If either of these ever changes alone, this assertion fails and whoever
      // changed it has to say why the two applied parts bracketing one cabinet
      // front should answer to different reference planes.
      expect(DEFAULT_KICK_SETBACK_DATUM).toBe('FRONT');
      expect(DEFAULT_WORKTOP_CONFIG.frontDatum).toBe('FRONT');
      expect(DEFAULT_KICK_SETBACK_DATUM).toBe(DEFAULT_WORKTOP_CONFIG.frontDatum);
    });

    it('both read that default from the one shared constant, not from two literals', () => {
      // Two independently-written 'FRONT' literals would satisfy the test above
      // and still drift the moment someone edits one file. Identity with the
      // shared constant is what actually prevents the drift.
      expect(DEFAULT_KICK_SETBACK_DATUM).toBe(DEFAULT_APPLIED_PART_DATUM);
      expect(DEFAULT_WORKTOP_CONFIG.frontDatum).toBe(DEFAULT_APPLIED_PART_DATUM);
    });

    it('a cabinet with no explicit config resolves to the shared datum', () => {
      expect(resolveKickboardSetbackDatum({})).toBe(DEFAULT_APPLIED_PART_DATUM);
    });

    it('assumes the same front proudness on both sides when it is unknown', () => {
      expect(DEFAULT_WORKTOP_CONFIG.assumedDoorThickness).toBe(DEFAULT_ASSUMED_FRONT_PROUD_MM);
    });
  });

  // ============================================
  // The numbers, and what they are measured from.
  // ============================================
  describe('the declared figures', () => {
    it('pins plinth setback at 65mm FROM THE FRONT', () => {
      expect(PLINTH_SETBACK_FROM_FRONT_MM).toBe(65);
      expect(DEFAULT_KICK_SETBACK).toBe(PLINTH_SETBACK_FROM_FRONT_MM);
    });

    it('pins worktop front overhang at 25mm FROM THE FRONT', () => {
      expect(WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM).toBe(25);
      expect(DEFAULT_WORKTOP_CONFIG.frontOverhang).toBe(WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM);
    });

    it('keeps the plinth geometrically close to where it was: ~47 from the carcass', () => {
      // 65 from the front, under an 18mm door, is 47 from the carcass — against
      // the 50-from-carcass that shipped before. The part moves 3mm. The
      // DECLARATION is the change; the geometry is almost untouched, which is
      // exactly what makes this a safe correction rather than a redesign.
      const fromCarcass =
        PLINTH_SETBACK_FROM_FRONT_MM -
        frontDatumOffsetMm('FRONT', undefined, DEFAULT_ASSUMED_FRONT_PROUD_MM);
      expect(fromCarcass).toBe(47);
      expect(Math.abs(fromCarcass - 50)).toBeLessThanOrEqual(3);
    });

    it('REJECTS the 70-from-carcass reading that would have given an 88mm recess', () => {
      // The UK literature figure is 70, and it does not state its datum. Taking
      // it as a CARCASS dimension yields 70 + 18 = 88mm measured from the door
      // face — deeper than any figure in any source the audit read. This test
      // exists so that "the literature says 70" cannot be applied without
      // someone first deciding what the 70 was measured from.
      const ifTakenAsCarcass = 70 + DEFAULT_ASSUMED_FRONT_PROUD_MM;
      expect(ifTakenAsCarcass).toBe(88);
      expect(PLINTH_SETBACK_FROM_FRONT_MM).toBeLessThan(ifTakenAsCarcass);
    });
  });

  // ============================================
  // frontDatumOffsetMm: unknown is not zero.
  // ============================================
  describe('frontDatumOffsetMm', () => {
    it('is zero under CARCASS regardless of what the front does', () => {
      expect(frontDatumOffsetMm('CARCASS')).toBe(0);
      expect(frontDatumOffsetMm('CARCASS', 18)).toBe(0);
      expect(frontDatumOffsetMm('CARCASS', 0)).toBe(0);
    });

    it('is the real proudness under FRONT when it is known', () => {
      expect(frontDatumOffsetMm('FRONT', 22)).toBe(22);
    });

    it('honours an EXPLICIT zero — a doorless carcass is a fact, not an absence', () => {
      expect(frontDatumOffsetMm('FRONT', 0)).toBe(0);
    });

    it('falls back to the ASSUMED proudness when the value is UNKNOWN', () => {
      // saveProject drops `structure` for every non-active cabinet, so undefined
      // is the normal post-reload state. Treating it as 0 would silently demote
      // the part to CARCASS while still reporting its datum as FRONT.
      expect(frontDatumOffsetMm('FRONT', undefined)).toBe(DEFAULT_ASSUMED_FRONT_PROUD_MM);
    });

    it('distinguishes UNKNOWN from ZERO — they must never collapse', () => {
      expect(frontDatumOffsetMm('FRONT', undefined)).not.toBe(frontDatumOffsetMm('FRONT', 0));
    });
  });

  // ============================================
  // The plinth actually uses it.
  // ============================================
  describe('the plinth honours the datum end to end', () => {
    const D = 560;

    it('recesses 65 from the door face by default, = 47 from the carcass', () => {
      // D/2 (280) + 18 door - 65 = 233. Carcass face is at 280, so 47 behind it.
      expect(computeKickboardFrontZ(D, DEFAULT_KICK_SETBACK)).toBe(233);
      expect(D / 2 - computeKickboardFrontZ(D, DEFAULT_KICK_SETBACK)).toBe(47);
    });

    it('an explicit CARCASS override still works and is visibly different', () => {
      // Same setback number, different datum, 18mm apart. That gap is the whole
      // reason the datum has to be declared rather than inferred.
      const front = computeKickboardFrontZ(D, DEFAULT_KICK_SETBACK, 'FRONT');
      const carcass = computeKickboardFrontZ(D, DEFAULT_KICK_SETBACK, 'CARCASS');
      expect(front - carcass).toBe(DEFAULT_ASSUMED_FRONT_PROUD_MM);
    });
  });

  // ============================================
  // Spec emission.
  // ============================================
  describe('describeAppliedPartDatum — the spec must NAME its datum', () => {
    it('names the FRONT datum and shows the carcass equivalent', () => {
      const text = describeAppliedPartDatum('Plinth', 'setback', 65, 'FRONT', 18);
      expect(text).toContain('FRONT datum');
      expect(text).toContain('65mm');
      // The reader must be able to cross-check against a carcass-referenced
      // drawing without doing the subtraction themselves.
      expect(text).toContain('47mm from the carcass face');
    });

    it('says out loud when the proudness was ASSUMED rather than known', () => {
      const text = describeAppliedPartDatum('Plinth', 'setback', 65, 'FRONT');
      expect(text).toContain('assumed');
      expect(text).toContain('UNKNOWN, not zero');
    });

    it('names the CARCASS datum and does not pretend a front term exists', () => {
      const text = describeAppliedPartDatum('Plinth', 'setback', 50, 'CARCASS', 18);
      expect(text).toContain('CARCASS datum');
      expect(text).not.toContain('from the carcass face');
    });

    it('never emits a bare number with no datum named', () => {
      for (const datum of ['FRONT', 'CARCASS'] as const) {
        const text = describeAppliedPartDatum('Worktop', 'front overhang', 25, datum, 18);
        expect(text).toMatch(/FRONT datum|CARCASS datum/);
      }
    });
  });
});
