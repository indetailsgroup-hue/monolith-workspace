/**
 * MinifixSet - Häfele S200 Minifix Connector Specifications
 *
 * Specifications and 3D model data for rendering Minifix hardware.
 */

/** S200 Minifix specifications per Häfele catalog */
export const S200_SPECS = {
  camHousingDia: 15,
  camHousingDepth: 13.5,
  camDiameter: 15,
  camDepth: 13.5,
  camHeight: 9,
  camRimDia: 18,
  camRimHeight: 2,
  ballHeadDia: 6.5,
  ballHeadOffset: 3.25,
  neckShaftDia: 6.5,
  neckShaftLength: 6.5,
  sleeveDia: 10,
  sleeveLength: 17.5,
  shaftDia: 5,
  shaftLength: 11,
  drillingDistanceB: 24,
  dowelDia: 8,
  dowelLength: 30,
};

/** Minifix set for 3D rendering */
export class MinifixSet {
  specs: typeof S200_SPECS;

  constructor(specs?: Partial<typeof S200_SPECS>) {
    this.specs = { ...S200_SPECS, ...specs };
  }

  getCamRadius(): number {
    return this.specs.camHousingDia / 2;
  }

  getBoltTotalLength(): number {
    return this.specs.ballHeadOffset + this.specs.neckShaftLength + this.specs.sleeveLength + this.specs.shaftLength;
  }
}

export function createMinifixSet(specs?: Partial<typeof S200_SPECS>): MinifixSet {
  return new MinifixSet(specs);
}
