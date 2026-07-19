/**
 * seatingOverhang.test.ts — knee clearance at a seated island.
 *
 * Two things under test, and the second matters more than the first:
 *   1. that seating is a DISTINCT quantity from the decorative backOverhang;
 *   2. that a counter height off the published ladder is REPORTED as such
 *      rather than quietly resolved into a number that looks sourced.
 */

import { describe, expect, it } from 'vitest';
import {
  NKBA_KNEE_CLEARANCE_LADDER,
  resolveSeatingOverhang,
} from '../seatingOverhang';
import {
  DEFAULT_WORKTOP_CONFIG,
  ISLAND_WORKTOP_CONFIG,
  NO_SEATING,
  SEATED_ISLAND_WORKTOP_CONFIG,
} from '../types';
import { DEFAULT_COUNTER_HEIGHT_MM } from '../../catalog/CabinetTaxonomy';
import { deriveWorktopPanels } from '../deriveWorktopPanels';
import type { CabinetPlacement } from '../types';

// A single free-standing 600x600 base cabinet — an island as far as this code
// can tell, which is exactly the point: it cannot tell.
function island(): CabinetPlacement[] {
  return [
    {
      cabinetId: 'i1',
      origin: [0, 0, 0],
      yaw: 0,
      width: 600,
      depth: 600,
      height: 760,
      toeKickHeight: 70,
      carcassTopY: 830,
      u: [1, 0],
      n: [0, 1],
      uc: 0,
      nc: 0,
      frontProud: 18,
    },
  ];
}

describe('the NKBA knee-clearance ladder', () => {
  it('has overhang DECREASING as the counter gets taller', () => {
    // The direction is the sanity check that rejected the blueprint's 250/300
    // figures: they gave the LARGER clearance to the TALLER counter. A sitter
    // perched at a 1050mm bar is more upright and reaches in LESS far, not more.
    for (let i = 1; i < NKBA_KNEE_CLEARANCE_LADDER.length; i++) {
      const lower = NKBA_KNEE_CLEARANCE_LADDER[i - 1];
      const higher = NKBA_KNEE_CLEARANCE_LADDER[i];
      expect(higher.counterHeightMm).toBeGreaterThan(lower.counterHeightMm);
      expect(higher.overhangMm).toBeLessThan(lower.overhangMm);
    }
  });

  it('carries the rungs this lane was given: 900→380 and 1050→305', () => {
    expect(resolveSeatingOverhang(900).overhangMm).toBe(380);
    expect(resolveSeatingOverhang(1050).overhangMm).toBe(305);
  });

  it('does NOT contain the uncited 250/300 blueprint figures', () => {
    const values = NKBA_KNEE_CLEARANCE_LADDER.map(r => r.overhangMm);
    expect(values).not.toContain(250);
    expect(values).not.toContain(300);
  });

  it('marks its evidence MEDIUM, never higher', () => {
    // No clause number is held in-repo, so the figures are second-hand even
    // though the body is real. Anything claiming HIGH here would be overstating.
    expect(resolveSeatingOverhang(900).evidence).toBe('MEDIUM');
  });
});

describe('resolveSeatingOverhang — heights off the ladder', () => {
  it('reports an exact rung as EXACT', () => {
    const f = resolveSeatingOverhang(900);
    expect(f.match).toBe('EXACT');
    expect(f.isLowerBound).toBe(false);
  });

  it('never returns a value that is not a published rung', () => {
    // The anti-interpolation guarantee. Sweep the whole plausible range; every
    // answer must be a number someone actually published.
    const published = NKBA_KNEE_CLEARANCE_LADDER.map(r => r.overhangMm);
    for (let h = 700; h <= 1200; h += 10) {
      expect(published).toContain(resolveSeatingOverhang(h).overhangMm);
    }
  });

  it('takes the LOWER rung between rungs, not the nearer one', () => {
    // 1000mm is nearer to the 1050 rung, but rounding there would hand a seated
    // user 305mm where the published figure for a shorter counter is 380mm.
    // Nearest is not safest.
    const f = resolveSeatingOverhang(1000);
    expect(f.match).toBe('BETWEEN_RUNGS');
    expect(f.overhangMm).toBe(380);
    expect(f.note).toContain('rather than interpolated');
  });

  it('holds at the top rung above the ladder rather than extrapolating down', () => {
    const f = resolveSeatingOverhang(1200);
    expect(f.match).toBe('ABOVE_HIGHEST_RUNG');
    expect(f.overhangMm).toBe(305);
    expect(f.isLowerBound).toBe(false);
  });

  // ============================================
  // THE THAI CASE — the one this lane had to answer.
  // ============================================
  describe('the Thai 850mm counter is BELOW the whole ladder', () => {
    const f = resolveSeatingOverhang(850);

    it('is genuinely below the lowest rung — this is not hypothetical', () => {
      expect(DEFAULT_COUNTER_HEIGHT_MM).toBe(850);
      expect(850).toBeLessThan(NKBA_KNEE_CLEARANCE_LADDER[0].counterHeightMm);
      expect(f.match).toBe('BELOW_LOWEST_RUNG');
    });

    it('returns the 900mm rung figure FLAGGED AS A LOWER BOUND, not as an answer', () => {
      expect(f.overhangMm).toBe(380);
      expect(f.isLowerBound).toBe(true);
      expect(f.note).toContain('LOWER BOUND, not an answer');
    });

    it('does NOT extrapolate the two-point slope to 405mm', () => {
      // The slope is -0.5mm per mm, so 850 would "give" 380 + 25 = 405. That is
      // arithmetic wearing a source's clothes: two second-hand points do not
      // define an ergonomic curve. If it ever appears here, someone fabricated
      // a figure — which is the defect class this whole effort exists to remove.
      expect(f.overhangMm).not.toBe(405);
      expect(f.note).toContain('NOT extrapolated');
    });

    it('says which direction the real figure lies in, so the gap is actionable', () => {
      expect(f.note).toContain('LARGER');
      expect(f.note).toContain('sourced');
    });
  });
});

describe('seating is DISTINCT from backOverhang', () => {
  it('is off by default everywhere, including on the island config', () => {
    // Auto-detecting a seated island is impossible: this codebase has no walls,
    // so a free-standing island and a galley run are the same shape to it.
    expect(DEFAULT_WORKTOP_CONFIG.seating).toEqual(NO_SEATING);
    expect(ISLAND_WORKTOP_CONFIG.seating.side).toBe('NONE');
  });

  it('the unseated island still just mirrors the front — a drip edge, not knee space', () => {
    const p = deriveWorktopPanels(island(), ISLAND_WORKTOP_CONFIG).panelsByHostId.get('i1')![0];
    // 600 carcass + 18 door + 25 front + 25 mirrored back = 668.
    expect(p.finishHeight).toBeCloseTo(668, 6);
  });

  it('the seated island projects the KNEE figure at the back instead', () => {
    const p = deriveWorktopPanels(island(), SEATED_ISLAND_WORKTOP_CONFIG)
      .panelsByHostId.get('i1')![0];
    // 600 carcass + 18 door + 25 front + 380 seating = 1023.
    expect(p.finishHeight).toBeCloseTo(1023, 6);
  });

  it('REPLACES backOverhang rather than adding to it', () => {
    const seated = deriveWorktopPanels(island(), SEATED_ISLAND_WORKTOP_CONFIG)
      .panelsByHostId.get('i1')![0];
    const unseated = deriveWorktopPanels(island(), ISLAND_WORKTOP_CONFIG)
      .panelsByHostId.get('i1')![0];
    // If the two were summed the difference would be 380, not 380 - 25 = 355.
    // They are different quantities measured for different reasons; a slab built
    // to their sum answers to neither.
    expect(seated.finishHeight - unseated.finishHeight).toBeCloseTo(355, 6);
  });

  it('is a 15x bigger projection than the mirror it replaces — the mirror was unusable', () => {
    const knee = resolveSeatingOverhang(850).overhangMm;
    expect(knee / ISLAND_WORKTOP_CONFIG.backOverhang).toBeGreaterThan(15);
  });

  it('surfaces a SEATING_OVERHANG note carrying the lower-bound caveat', () => {
    const notes = deriveWorktopPanels(island(), SEATED_ISLAND_WORKTOP_CONFIG).notes;
    const note = notes.find(n => n.code === 'SEATING_OVERHANG');
    expect(note).toBeDefined();
    expect(note!.message).toContain('LOWER BOUND');
    expect(note!.message).toContain('MEDIUM');
    expect(note!.message).toContain('not summed');
  });

  it('emits no seating note when nobody sits there', () => {
    const notes = deriveWorktopPanels(island(), ISLAND_WORKTOP_CONFIG).notes;
    expect(notes.some(n => n.code === 'SEATING_OVERHANG')).toBe(false);
  });

  it('keys the default seated config to the real Thai counter height', () => {
    // The literal in types.ts cannot import DEFAULT_COUNTER_HEIGHT_MM without
    // creating a cycle (CabinetTaxonomy imports DEFAULT_WORKTOP_CONFIG). This
    // assertion is what keeps the duplicate honest.
    expect(SEATED_ISLAND_WORKTOP_CONFIG.seating.counterHeightMm).toBe(DEFAULT_COUNTER_HEIGHT_MM);
    expect(NO_SEATING.counterHeightMm).toBe(DEFAULT_COUNTER_HEIGHT_MM);
  });
});

describe('the datum is declared on every derivation', () => {
  it('emits DATUM_DECLARED even when nothing is unusual', () => {
    // Unconditional by design. A note that only fires on an exception teaches a
    // reader that silence means CARCASS — which is the assumption that made a
    // 50mm setback and a 20mm overhang look comparable when they were measured
    // from planes 18mm apart.
    const notes = deriveWorktopPanels(island(), DEFAULT_WORKTOP_CONFIG).notes;
    const note = notes.find(n => n.code === 'DATUM_DECLARED');
    expect(note).toBeDefined();
    expect(note!.message).toContain('FRONT datum');
    expect(note!.message).toContain('PLINTH');
  });
});
