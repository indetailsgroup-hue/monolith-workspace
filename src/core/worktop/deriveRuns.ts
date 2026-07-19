/**
 * deriveRuns — the missing cabinet-run entity, computed rather than stored.
 *
 * There is no run/group object in CabinetState (a flat cabinets[] plus an
 * activeCabinetId), and saveProject drops panels for every non-active cabinet.
 * So a run is derived on demand from placements, which are built purely from
 * fields that survive a save/load round-trip.
 *
 * Pipeline: adjacency graph -> connected components (RUNS) -> per-yaw,
 * per-front-plane, contiguous grouping (SEGMENTS). One slab per segment.
 */

import {
  ANGLE_TOL,
  GAP_TOL,
  PLANE_TOL,
  Y_BAND_TOL,
  type CabinetPlacement,
  type CabinetRun,
  type RunSegment,
} from './types';

const HALF_PI = Math.PI / 2;

/** Half-extent of a placement's footprint projected onto an arbitrary unit axis. */
function projectedRadius(p: CabinetPlacement, axis: readonly [number, number]): number {
  return (
    (p.width / 2) * Math.abs(p.u[0] * axis[0] + p.u[1] * axis[1]) +
    (p.depth / 2) * Math.abs(p.n[0] * axis[0] + p.n[1] * axis[1])
  );
}

/** Footprint centre projected onto an arbitrary axis. */
function projectedCentre(p: CabinetPlacement, axis: readonly [number, number]): number {
  return p.origin[0] * axis[0] + p.origin[2] * axis[1];
}

/** True when the two yaws differ by a multiple of 90 degrees. */
function isOrthogonal(a: number, b: number): boolean {
  const d = Math.abs(a - b) % HALF_PI;
  return d <= ANGLE_TOL || HALF_PI - d <= ANGLE_TOL;
}

/** True when the two yaws differ by a multiple of 180 degrees (same run axis). */
function isParallel(a: number, b: number): boolean {
  const d = Math.abs(a - b) % Math.PI;
  return d <= ANGLE_TOL || Math.PI - d <= ANGLE_TOL;
}

/**
 * Separating Axis Test over the four box axes, with GAP_TOL slack so that
 * cabinets which merely touch (or sit a few mm apart) still count as adjacent.
 */
function footprintsTouch(a: CabinetPlacement, b: CabinetPlacement): boolean {
  const axes: Array<readonly [number, number]> = [a.u, a.n, b.u, b.n];
  for (const axis of axes) {
    const gap = Math.abs(projectedCentre(a, axis) - projectedCentre(b, axis));
    if (gap > projectedRadius(a, axis) + projectedRadius(b, axis) + GAP_TOL) {
      return false; // separating axis found
    }
  }
  return true;
}

/**
 * Adjacency between two cabinets:
 *   1. same horizontal band (carcass tops within Y_BAND_TOL);
 *   2. yaws a multiple of 90 degrees apart;
 *   3. footprints touching (inflated SAT);
 *   4. if the two are PARALLEL, their front planes must coincide.
 *
 * Rule 4 is what keeps two back-to-back rows apart. The approved design stated
 * it only for identical yaws; that leaves the anti-parallel (yaw + pi) case —
 * the actual back-to-back arrangement — falling through. It is generalised here
 * by expressing B's front plane along A's normal: for yaw + pi, n_B = -n_A, so
 * B's front offset measured along n_A is -nFront_B.
 */
function areAdjacent(a: CabinetPlacement, b: CabinetPlacement): boolean {
  if (Math.abs(a.carcassTopY - b.carcassTopY) > Y_BAND_TOL) return false;
  if (!isOrthogonal(a.yaw, b.yaw)) return false;
  if (!footprintsTouch(a, b)) return false;

  if (isParallel(a.yaw, b.yaw)) {
    const sign = a.n[0] * b.n[0] + a.n[1] * b.n[1]; // +1 same way, -1 opposed
    const frontA = a.nc + a.depth / 2;
    const frontBAlongA = sign * (b.nc + b.depth / 2);
    if (Math.abs(frontA - frontBAlongA) > PLANE_TOL) return false;
  }

  return true;
}

/** Union-find over placement indices. */
function connectedComponents(placements: readonly CabinetPlacement[]): number[][] {
  const parent = placements.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
  };

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (areAdjacent(placements[i], placements[j])) union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < placements.length; i++) {
    const root = find(i);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(i);
    else byRoot.set(root, [i]);
  }
  return [...byRoot.values()];
}

/**
 * Stable id from a set of cabinet ids. Sorting first makes it independent of
 * scene ordering; the FNV-1a digest keeps it short enough to read in the UI.
 */
function stableId(prefix: string, parts: readonly string[]): string {
  const joined = [...parts].sort().join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

/** Quantise to 0.1mm / 0.001rad so float noise cannot split a group. */
const q = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Split a run's members into segments: same yaw, same front plane, contiguous
 * along u. Contiguity matters because a Z-shaped layout can put two same-yaw
 * sub-runs in one component while a single slab between them would span thin
 * air.
 */
function segmentsForRun(members: readonly CabinetPlacement[], runId: string): RunSegment[] {
  const buckets = new Map<string, CabinetPlacement[]>();
  for (const m of members) {
    const key = `${q(m.yaw, 0.001)}|${q(m.nc + m.depth / 2, 0.1)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(m);
    else buckets.set(key, [m]);
  }

  const segments: RunSegment[] = [];

  for (const bucket of buckets.values()) {
    // Sort along the run axis; ties (identical uc) break on cabinetId so that
    // the host choice never depends on input order.
    const sorted = [...bucket].sort((a, b) =>
      a.uc !== b.uc ? a.uc - b.uc : a.cabinetId.localeCompare(b.cabinetId)
    );

    // Break wherever consecutive members are further apart than GAP_TOL.
    let current: CabinetPlacement[] = [sorted[0]];
    const groups: CabinetPlacement[][] = [current];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      const gap = (next.uc - next.width / 2) - (prev.uc + prev.width / 2);
      if (gap > GAP_TOL) {
        current = [next];
        groups.push(current);
      } else {
        current.push(next);
      }
    }

    for (const group of groups) {
      const u0 = Math.min(...group.map(m => m.uc - m.width / 2));
      const u1 = Math.max(...group.map(m => m.uc + m.width / 2));
      // Mixed depth: the slab must cover the DEEPEST member, so take the
      // extreme back and the extreme front rather than any single member's.
      const nBack = Math.min(...group.map(m => m.nc - m.depth / 2));
      const nFront = Math.max(...group.map(m => m.nc + m.depth / 2));
      const depths = new Set(group.map(m => q(m.depth, 0.1)));
      // The slab must clear the PROUDEST front in the group. Members that
      // cannot report one (no structure after a save/load) are skipped rather
      // than counted as 0, so one reloaded cabinet cannot drag the slab back.
      const knownProud = group.map(m => m.frontProud).filter((v): v is number => v !== undefined);

      segments.push({
        segmentId: stableId('seg', group.map(m => m.cabinetId)),
        yaw: group[0].yaw,
        members: group,
        hostCabinetId: group[0].cabinetId,
        u0,
        u1,
        nBack,
        nFront,
        carcassTopY: group[0].carcassTopY,
        mixedDepth: depths.size > 1,
        maxFrontProud: knownProud.length > 0 ? Math.max(...knownProud) : undefined,
      });
    }
  }

  // Deterministic ordering: longest first, then by yaw, then by id. The corner
  // butt rule reads "longest is the through slab" straight off this order.
  segments.sort(
    (a, b) =>
      (b.u1 - b.u0) - (a.u1 - a.u0) ||
      a.yaw - b.yaw ||
      a.segmentId.localeCompare(b.segmentId)
  );

  void runId;
  return segments;
}

/**
 * Derive every cabinet run in the scene.
 *
 * Pure: same input always yields the same runIds, segmentIds and member order.
 */
export function deriveRuns(placements: readonly CabinetPlacement[]): CabinetRun[] {
  if (placements.length === 0) return [];

  const runs: CabinetRun[] = [];

  for (const component of connectedComponents(placements)) {
    const members = component.map(i => placements[i]);
    const cabinetIds = members.map(m => m.cabinetId).sort();
    const runId = stableId('run', cabinetIds);
    runs.push({
      runId,
      cabinetIds,
      segments: segmentsForRun(members, runId),
    });
  }

  runs.sort((a, b) => a.runId.localeCompare(b.runId));
  return runs;
}
