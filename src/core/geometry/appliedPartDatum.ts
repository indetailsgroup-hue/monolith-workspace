/**
 * appliedPartDatum.ts — WHICH FACE AN APPLIED PART IS MEASURED FROM.
 *
 * Dependency-free leaf. Imports nothing, so both the plinth lane
 * (manufacturing/kickboard) and the worktop lane (core/worktop) can share one
 * vocabulary without either importing the other.
 *
 * ── THE BUG THIS MODULE EXISTS TO CLOSE ──────────────────────────────────────
 * Two applied parts bracket the same cabinet front: the PLINTH below it and the
 * WORKTOP above it. Both are specified as a distance "from the front". Until
 * now they measured that distance from DIFFERENT faces and nothing in the code,
 * the comments or the emitted spec said so:
 *
 *   - plinth setback  50mm, datum CARCASS  (kickboardGeometry.resolveKickboardSetbackDatum
 *                                           defaulted to 'CARCASS')
 *   - worktop overhang 20mm, datum FRONT   (WorktopConfig.frontDatum defaulted to 'FRONT')
 *
 * With an 18mm door those two numbers are not comparable at all: they are
 * measured from planes 18mm apart. A reviewer reading "50" and "20" off the same
 * elevation has no way to know they do not share an origin.
 *
 * It is worse than an internal inconsistency. NO published setback figure the
 * document audit found states its own datum — not one. So the widely quoted UK
 * literature figure of 70mm cannot be compared to our 50mm, because we do not
 * know whether the 70 is from the door face or the carcass face, and neither did
 * whoever wrote the 50. Numbers without a declared datum are not evidence.
 *
 * ── THE FIX IS THE DECLARATION, NOT THE NUMBER ───────────────────────────────
 * Both applied parts are now unified on the FRONT datum, and the datum is stated
 * explicitly in the type, in every call site, and in the emitted spec:
 *
 *   PLINTH_SETBACK_FROM_FRONT_MM           65mm from the FRONT datum
 *   WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM   25mm from the FRONT datum
 *
 * The GEOMETRIC change is deliberately small. Under the default 18mm door,
 * 65 from the front is 65 - 18 = 47 from the carcass, against the 50 from the
 * carcass that shipped before — a 3mm move. We did NOT take the tempting route
 * of "the literature says 70, so set setback = 70 from the carcass": that yields
 * 70 + 18 = 88mm of recess measured from the door face, deeper than ANY figure in
 * any source the audit read. Adopting an undeclared number under the wrong datum
 * is how the 88mm would have got in.
 *
 * Pinned by src/core/geometry/__tests__/appliedPartDatum.test.ts so a future
 * change cannot silently switch reference faces again.
 */

/**
 * The face an applied part's front dimension is measured from.
 *
 * - 'CARCASS' — the cabinet front face, local Z = +D/2. Stable: toggling doors
 *   on or off does not move the part. Retained because it is genuinely the right
 *   datum for a doorless carcass and because existing per-cabinet overrides may
 *   still select it.
 * - 'FRONT' — the door / drawer-front OUTER face, i.e. the carcass face plus the
 *   front's proudness. This is the joinery convention and the DEFAULT for both
 *   applied parts: a setback or an overhang is a distance from the plane a
 *   person's knees and hands actually meet.
 */
export type AppliedPartDatum = 'CARCASS' | 'FRONT';

/**
 * Datum both applied parts default to. Named rather than repeated so the two
 * lanes cannot drift apart again by editing one default and not the other.
 */
export const DEFAULT_APPLIED_PART_DATUM: AppliedPartDatum = 'FRONT';

/**
 * Front proudness assumed under the 'FRONT' datum when the real value is
 * UNKNOWN. 18 = DEFAULT_DOOR_CONFIG.doorThickness.
 *
 * Unknown is not the same as zero. saveProject drops `structure` for every
 * non-active cabinet (useProjectStore.ts:233-241), so after a save/load
 * round-trip the door thickness is simply not there to read. Treating that
 * absence as 0 would silently demote the part to the CARCASS datum — which is
 * exactly the undeclared datum switch this module exists to prevent. A cabinet
 * that genuinely has no door reports frontProud === 0 explicitly, and 0 is
 * honoured as 0.
 */
export const DEFAULT_ASSUMED_FRONT_PROUD_MM = 18;

/**
 * Plinth (kickboard) setback from the FRONT datum, mm.
 *
 * Under the default 18mm door this is ~47mm from the carcass face, close to the
 * 50mm-from-carcass that shipped before, so the parts move ~3mm. See the header:
 * the value is chosen to keep the geometry where it was while making the datum
 * explicit — the declaration is the fix.
 */
export const PLINTH_SETBACK_FROM_FRONT_MM = 65;

/**
 * Worktop front overhang past the FRONT datum, mm.
 *
 * The slab projects 25mm past the door face — i.e. 25 + doorThickness past the
 * carcass. Previously 20mm past the same datum.
 */
export const WORKTOP_FRONT_OVERHANG_FROM_FRONT_MM = 25;

/**
 * Distance from the CARCASS front face out to the chosen datum plane, mm.
 *
 * The single arithmetic definition of what a datum MEANS. Both lanes call it, so
 * "measured from the front" cannot mean two different things in two files.
 *
 * @param datum       Which face the dimension is measured from.
 * @param frontProud  How far the front sits proud of the carcass face, mm.
 *                    `undefined` = UNKNOWN (falls back to `assumedFrontProud`);
 *                    `0` = KNOWN to have no proud front, and is honoured as 0.
 */
export function frontDatumOffsetMm(
  datum: AppliedPartDatum,
  frontProud?: number,
  assumedFrontProud: number = DEFAULT_ASSUMED_FRONT_PROUD_MM
): number {
  if (datum === 'CARCASS') return 0;
  return frontProud ?? assumedFrontProud;
}

/**
 * One line of spec text naming the datum, for anywhere a dimension is emitted
 * to a human — notes, spec sheets, packet headers.
 *
 * Emitting the datum alongside the number is the whole point: a spec that says
 * "plinth setback 65mm" is not checkable, and a spec that says "plinth setback
 * 65mm from FRONT (door face), = 47mm from carcass at 18mm front" is.
 */
export function describeAppliedPartDatum(
  partName: string,
  dimensionName: string,
  valueMm: number,
  datum: AppliedPartDatum,
  frontProud?: number,
  assumedFrontProud: number = DEFAULT_ASSUMED_FRONT_PROUD_MM
): string {
  const offset = frontDatumOffsetMm(datum, frontProud, assumedFrontProud);
  if (datum === 'CARCASS') {
    return (
      `${partName} ${dimensionName} ${valueMm}mm measured from the CARCASS datum ` +
      `(cabinet front face, Z = +D/2). Front proudness is not part of this dimension.`
    );
  }
  const proudSource =
    frontProud === undefined
      ? `assumed ${assumedFrontProud}mm front (structure unavailable — UNKNOWN, not zero)`
      : `${frontProud}mm front`;
  return (
    `${partName} ${dimensionName} ${valueMm}mm measured from the FRONT datum ` +
    `(door / drawer-front outer face) at ${proudSource}, ` +
    `= ${valueMm - offset}mm from the carcass face.`
  );
}
