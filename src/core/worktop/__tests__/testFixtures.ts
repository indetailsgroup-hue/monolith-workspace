/**
 * Shared fixtures for the worktop lane tests.
 *
 * Builds the minimal structural shape resolvePlacement reads, so the run/slab
 * maths can be exercised without standing up the whole cabinet store.
 */

import type { CabinetType } from '../../types/Cabinet';
import { resolvePlacement, type PlaceableCabinet } from '../placement';
import type { CabinetPlacement } from '../types';

export interface FixtureSpec {
  id: string;
  /** Footprint CENTRE x, floor y, footprint CENTRE z. */
  pos: [number, number, number];
  /** Yaw in radians. */
  yaw?: number;
  width?: number;
  height?: number;
  depth?: number;
  toeKickHeight?: number;
  type?: CabinetType;
}

export function makeCabinet(spec: FixtureSpec): PlaceableCabinet {
  return {
    id: spec.id,
    type: spec.type ?? 'BASE',
    dimensions: {
      width: spec.width ?? 600,
      height: spec.height ?? 720,
      depth: spec.depth ?? 560,
      toeKickHeight: spec.toeKickHeight ?? 100,
    },
    scenePosition: spec.pos,
    sceneRotation: [0, spec.yaw ?? 0, 0],
  };
}

export function makePlacements(specs: FixtureSpec[]): CabinetPlacement[] {
  return specs.map(s => resolvePlacement(makeCabinet(s))!).filter(Boolean);
}

/**
 * The design's worked example: three 600×720×560 base cabinets in a row at
 * yaw 0, centres at x = 0, 600, 1200. Expected: one run, one segment,
 * u-extent [-300, 1500], L = 1800.
 */
export const STRAIGHT_RUN_OF_THREE: FixtureSpec[] = [
  { id: 'c1', pos: [0, 0, 0] },
  { id: 'c2', pos: [600, 0, 0] },
  { id: 'c3', pos: [1200, 0, 0] },
];
