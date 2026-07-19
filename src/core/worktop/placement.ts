/**
 * The single place that reads scenePosition / sceneRotation off a cabinet.
 *
 * Those two fields live on the cabinet as an untyped extension (the store
 * assigns them through `as any` — useCabinetStore.ts:2405, 2439, 2461), so this
 * module owns the one narrow structural read and hands the rest of the worktop
 * lane a fully typed CabinetPlacement.
 */

import type { CabinetDimensions, CabinetType } from '../types/Cabinet';
import { NON_WORKTOP_CABINET_TYPES, type CabinetPlacement } from './types';

/** The slice of CabinetStructure that affects where the slab's front edge lands. */
interface PlaceableStructure {
  doorConfig?: { hasDoors?: boolean; doorThickness?: number };
}

/** The minimal shape resolvePlacement needs — everything a saved project keeps. */
export interface PlaceableCabinet {
  id: string;
  type?: CabinetType;
  dimensions: CabinetDimensions;
  /** Optional: absent for every non-active cabinet after a save/load round-trip. */
  structure?: PlaceableStructure;
  scenePosition?: readonly number[];
  sceneRotation?: readonly number[];
}

/**
 * How far this cabinet's fronts stand proud of the carcass face, mm.
 *
 * Returns undefined when structure is unavailable — "unknown", not "flush".
 * generateDoorPanels.ts:185 centres the door at D/2 + doorThickness/2, so its
 * OUTER face sits at D/2 + doorThickness.
 */
function resolveFrontProud(cabinet: PlaceableCabinet): number | undefined {
  const doorConfig = cabinet.structure?.doorConfig;
  if (!doorConfig) return undefined;
  if (!doorConfig.hasDoors) return 0;
  return doorConfig.doorThickness;
}

const TWO_PI = Math.PI * 2;

/** Normalise an angle into [0, 2π), collapsing -0 and values a hair under 2π. */
export function normaliseYaw(radians: number): number {
  const wrapped = ((radians % TWO_PI) + TWO_PI) % TWO_PI;
  // Snap values within ~0.5° of a full turn back to 0 so that -1e-16 and 2π-1e-16
  // do not end up in different yaw buckets.
  return TWO_PI - wrapped < 0.0087 ? 0 : wrapped;
}

/**
 * Resolve a cabinet into world-space run coordinates.
 *
 * Returns null for cabinet types that never carry a worktop (WALL, TALL), so
 * callers can map-and-filter in one pass.
 *
 * CONVENTION (pinned by __tests__/conventionPin.test.ts): scenePosition X/Z are
 * the footprint CENTRE, Y is the FLOOR.
 */
export function resolvePlacement(cabinet: PlaceableCabinet): CabinetPlacement | null {
  if (cabinet.type && NON_WORKTOP_CABINET_TYPES.has(cabinet.type)) return null;

  const p = cabinet.scenePosition ?? [0, 0, 0];
  const origin: [number, number, number] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

  const r = cabinet.sceneRotation ?? [0, 0, 0];
  const yaw = normaliseYaw(r[1] ?? 0);

  // three.js Ry(θ): local (1,0,0) -> world (cosθ, 0, -sinθ)
  //                 local (0,0,1) -> world (sinθ, 0,  cosθ)
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const u: [number, number] = [cos, -sin];  // run direction
  const n: [number, number] = [sin, cos];   // front normal

  const { width, height, depth, toeKickHeight } = cabinet.dimensions;

  return {
    cabinetId: cabinet.id,
    origin,
    yaw,
    width,
    depth,
    height,
    toeKickHeight,
    carcassTopY: origin[1] + toeKickHeight + height,
    u,
    n,
    uc: origin[0] * u[0] + origin[2] * u[1],
    nc: origin[0] * n[0] + origin[2] * n[1],
    frontProud: resolveFrontProud(cabinet),
  };
}

/** Resolve a whole scene, dropping cabinets that never carry a worktop. */
export function resolvePlacements(cabinets: readonly PlaceableCabinet[]): CabinetPlacement[] {
  const out: CabinetPlacement[] = [];
  for (const c of cabinets) {
    const placement = resolvePlacement(c);
    if (placement) out.push(placement);
  }
  return out;
}
