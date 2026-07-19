/**
 * seatingOverhang.ts — KNEE CLEARANCE AT A SEATED ISLAND.
 *
 * Dependency-free leaf. Pure functions over numbers.
 *
 * ── WHY THIS IS NOT `backOverhang` ───────────────────────────────────────────
 * ISLAND_WORKTOP_CONFIG used to be defined as a GEOMETRIC MIRROR of the front:
 *
 *     backOverhang: DEFAULT_WORKTOP_CONFIG.frontOverhang,
 *     endOverhang:  DEFAULT_WORKTOP_CONFIG.frontOverhang,
 *
 * That is a reasonable way to describe a slab that floats symmetrically over its
 * carcasses, and it is a completely wrong way to describe a slab someone SITS AT.
 * A 20-25mm projection is a drip edge. It is not knee space. Any stool pulled up
 * to a MONOLITH island built to that config puts the sitter's knees against the
 * carcass, and no amount of edge banding fixes it.
 *
 * So seating is a DISTINCT parameter with its own units, its own evidence and its
 * own datum. Mirroring the front overhang is still available and still correct
 * for an unseated island; asking for seating is a separate, explicit request.
 *
 * ── DATUM (declared, per this lane's whole point) ────────────────────────────
 * The seating overhang is measured from the CARCASS BACK FACE. There is no door
 * on the seating side of an island to measure from, so unlike the front datum
 * there is no proudness term — but the datum is stated here rather than left to
 * be inferred, because that inference is the defect this lane exists to remove.
 * See src/core/geometry/appliedPartDatum.ts.
 *
 * ── EVIDENCE: MEDIUM ─────────────────────────────────────────────────────────
 * The rungs below are the NKBA knee-clearance ladder as supplied to this lane.
 * Marked MEDIUM, not HIGH: this codebase holds no copy of the NKBA publication
 * to cite a clause number against, so the figures are second-hand even though
 * the source is a real standards body.
 *
 * DELIBERATELY NOT USED: the 250/300mm figures in monolith-blueprint.md. The
 * document audit found them both uncited AND inverted (they gave the LARGER
 * clearance to the TALLER counter, which is backwards — a taller seat puts the
 * sitter more upright and needs LESS depth, not more). An uncited number that
 * also fails a sanity check is not evidence at any level.
 */

/** One published counter-height / knee-clearance pair. */
export interface KneeClearanceRung {
  /** Finished counter height at the seat, mm. */
  readonly counterHeightMm: number;
  /** Required overhang past the carcass back face, mm. */
  readonly overhangMm: number;
  /** What kind of seat this rung describes. */
  readonly seatKind: 'COUNTER' | 'BAR';
}

/**
 * The ladder, ascending by counter height.
 *
 * Note the direction: overhang DECREASES as the counter gets taller. A 900mm
 * counter is sat at on a chair-height stool with the thighs roughly horizontal,
 * so the knees reach far in. A 1050mm bar is perched at, more upright, so they
 * reach in less. Any interpolation or extrapolation that inverts this direction
 * is wrong — which is why the blueprint figures were rejected.
 *
 * EVIDENCE: MEDIUM (NKBA knee-clearance guidance, no clause held in-repo).
 */
export const NKBA_KNEE_CLEARANCE_LADDER: readonly KneeClearanceRung[] = [
  { counterHeightMm: 900, overhangMm: 380, seatKind: 'COUNTER' },
  { counterHeightMm: 1050, overhangMm: 305, seatKind: 'BAR' },
];

/** How the queried counter height related to the published ladder. */
export type KneeClearanceMatch =
  | 'EXACT'
  | 'BETWEEN_RUNGS'
  | 'BELOW_LOWEST_RUNG'
  | 'ABOVE_HIGHEST_RUNG';

export interface SeatingOverhangFinding {
  /** The counter height asked about, mm. */
  readonly counterHeightMm: number;
  /** The overhang to build, mm. Always a published rung value — never interpolated. */
  readonly overhangMm: number;
  /** The rung the figure was taken from. */
  readonly rung: KneeClearanceRung;
  readonly match: KneeClearanceMatch;
  readonly evidence: 'MEDIUM';
  /**
   * True when the ladder's own trend says the correct figure for this height is
   * LARGER than the one returned, i.e. the returned number is a floor and not an
   * answer. Only happens below the lowest rung — which is exactly where the Thai
   * 850mm counter sits.
   */
  readonly isLowerBound: boolean;
  /** Human-readable statement of the above, for spec emission. */
  readonly note: string;
}

/**
 * Resolve the knee-clearance overhang for a counter height.
 *
 * ── HOW A HEIGHT BETWEEN RUNGS IS HANDLED, STATED RATHER THAN SILENT ─────────
 * The ladder has two rungs. Real counters do not land on them. Three things this
 * function refuses to do:
 *
 *   1. INTERPOLATE. A linear blend between 380 and 305 produces a number that
 *      appears in no publication. It would look sourced and would not be.
 *   2. ROUND TO THE NEAREST RUNG. Nearest is not safest. Rounding 940mm up to the
 *      1050 rung would hand a seated user 305mm of knee space where the published
 *      figure for the height BELOW them is 380.
 *   3. EXTRAPOLATE BELOW 900mm. See below.
 *
 * What it does instead: take the value from the nearest rung AT OR BELOW the
 * queried height — the conservative direction, since overhang falls as height
 * rises, so this never returns less knee space than a published figure for a
 * counter of that height or lower.
 *
 * ── THE THAI 850mm COUNTER IS BELOW THE WHOLE LADDER ─────────────────────────
 * The owner-confirmed Thai finished counter height is 850mm (leg 70 + carcass 760
 * + worktop 20). The lowest published rung is 900mm. 850 is off the bottom of the
 * ladder, and the trend — lower counter, deeper knees — says the correct figure
 * for 850mm is MORE than 380mm, not less.
 *
 * We do not invent that number. Extrapolating the two-rung slope (-0.5mm of
 * overhang per mm of height) would give 380 + 25 = 405mm, which is arithmetic
 * dressed up as a source; a two-point line through second-hand figures is not a
 * standard and knee clearance is an ergonomic curve, not a straight line.
 *
 * So 850mm returns the 900mm rung's 380mm with `isLowerBound: true` and a note
 * saying plainly that this is a FLOOR and the true figure is larger. A caller
 * building a seated Thai island should treat 380 as the minimum to beat and get
 * the real figure sourced. Reporting the gap is the honest move; filling it with
 * a computed number is not.
 */
export function resolveSeatingOverhang(counterHeightMm: number): SeatingOverhangFinding {
  const ladder = NKBA_KNEE_CLEARANCE_LADDER;
  const lowest = ladder[0];
  const highest = ladder[ladder.length - 1];

  // Nearest rung at or below the query; the lowest rung when there is none.
  let rung = lowest;
  for (const r of ladder) {
    if (r.counterHeightMm <= counterHeightMm) rung = r;
  }

  const exact = ladder.find(r => r.counterHeightMm === counterHeightMm);
  let match: KneeClearanceMatch;
  if (exact) match = 'EXACT';
  else if (counterHeightMm < lowest.counterHeightMm) match = 'BELOW_LOWEST_RUNG';
  else if (counterHeightMm > highest.counterHeightMm) match = 'ABOVE_HIGHEST_RUNG';
  else match = 'BETWEEN_RUNGS';

  const isLowerBound = match === 'BELOW_LOWEST_RUNG';

  const base =
    `Seating overhang ${rung.overhangMm}mm past the CARCASS BACK FACE for a ` +
    `${counterHeightMm}mm counter. Evidence MEDIUM (NKBA knee-clearance ladder: ` +
    ladder.map(r => `${r.counterHeightMm}mm→${r.overhangMm}mm`).join(', ') +
    `).`;

  let note: string;
  switch (match) {
    case 'EXACT':
      note = `${base} Lands exactly on the ${rung.counterHeightMm}mm ${rung.seatKind} rung.`;
      break;
    case 'BETWEEN_RUNGS':
      note =
        `${base} ${counterHeightMm}mm sits BETWEEN published rungs. Taken from the ` +
        `${rung.counterHeightMm}mm rung below it rather than interpolated — a blended ` +
        `figure would appear in no publication, and rounding up to the next rung would ` +
        `hand a seated user less knee space than the published figure for their height.`;
      break;
    case 'BELOW_LOWEST_RUNG':
      note =
        `${base} ${counterHeightMm}mm is BELOW the lowest published rung ` +
        `(${lowest.counterHeightMm}mm) — the Thai 850mm counter is in this band. The ` +
        `ladder's trend (lower counter, deeper knees) says the correct figure here is ` +
        `LARGER than ${rung.overhangMm}mm, so this is a LOWER BOUND, not an answer. ` +
        `NOT extrapolated: a two-point slope through second-hand figures is arithmetic, ` +
        `not a source. Treat ${rung.overhangMm}mm as the minimum to beat and get a real ` +
        `figure sourced before building a seated island at this height.`;
      break;
    case 'ABOVE_HIGHEST_RUNG':
      note =
        `${base} ${counterHeightMm}mm is ABOVE the highest published rung ` +
        `(${highest.counterHeightMm}mm). Held at the ${rung.counterHeightMm}mm rung's ` +
        `figure rather than continuing the downward trend, which is the conservative ` +
        `direction: it gives more knee space than extrapolation would, and no published ` +
        `figure is undercut.`;
      break;
  }

  return {
    counterHeightMm,
    overhangMm: rung.overhangMm,
    rung,
    match,
    evidence: 'MEDIUM',
    isLowerBound,
    note,
  };
}
