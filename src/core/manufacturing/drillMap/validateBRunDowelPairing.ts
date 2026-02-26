/**
 * validateBRunDowelPairing — B-run dowel contract guard
 *
 * Contract (LOCKED — see bRunDowelGeneration.test.ts):
 *   Every B-run dowel pair must consist of exactly 2 bores:
 *     1. HORIZ face bore (depth ≤ 12mm) on a TOP/BOTTOM panel
 *     2. SIDE edge bore (depth ≤ 18mm) on a LEFT_SIDE/RIGHT_SIDE panel
 *
 *   Within each pair:
 *     a) Diameters MUST match
 *     b) Normals MUST be opposing (dot ≈ -1)
 *     c) World X and Z MUST be identical (within tolerance)
 *
 * Pure tuple math — no THREE dependency.
 */

import type { Vec3Tuple } from './types';
import { isRunAxis } from './pairKeyV2';

// ─────────────────────────────────────────────────────────────────────────────
// Issue types (consistent with BoltPocketLinkageIssue)
// ─────────────────────────────────────────────────────────────────────────────

export type BRunDowelIssueCode =
  | 'DRILLMAP:BRUN_ODD_PAIR_COUNT'
  | 'DRILLMAP:BRUN_DIAMETER_MISMATCH'
  | 'DRILLMAP:BRUN_NORMALS_NOT_OPPOSING'
  | 'DRILLMAP:BRUN_POSITION_MISMATCH';

export interface BRunDowelIssue {
  code: BRunDowelIssueCode;
  pairKeyV2: string;              // consistent with BoltPocketLinkageIssue
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuple math (no THREE)
// ─────────────────────────────────────────────────────────────────────────────

const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ─────────────────────────────────────────────────────────────────────────────
// Minimal point shape
// ─────────────────────────────────────────────────────────────────────────────

export interface BRunPointLike {
  purpose: string;
  position: Vec3Tuple;
  normal: Vec3Tuple;
  diameter: number;
  pairKeyV2?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate B-run dowel pairing invariants.
 *
 * @param points  Array of ALL drill map points (only B-run DOWELs are checked)
 * @param posTolerance  Max X/Z mismatch in mm (default 0.5mm)
 * @returns Array of issues (empty = all good)
 */
export function validateBRunDowelPairing(
  points: BRunPointLike[],
  posTolerance = 0.5,
): BRunDowelIssue[] {
  const issues: BRunDowelIssue[] = [];

  // Collect B-run DOWELs, grouped by pair root key
  // e.g. "pair2-TOP_LEFT-B-37" → [horiz, side]
  const groups = new Map<string, BRunPointLike[]>();
  for (const p of points) {
    if (p.purpose !== 'DOWEL') continue;
    const key = p.pairKeyV2 ?? '';
    if (!isRunAxis(key, 'B')) continue;

    // Strip suffix to get group key: "pair2-...-B-37-dowel-brun-horiz" → "pair2-...-B-37"
    const groupKey = key.replace(/-dowel-brun-(horiz|side)$/, '');
    const arr = groups.get(groupKey) || [];
    arr.push(p);
    groups.set(groupKey, arr);
  }

  for (const [pairKeyV2, pair] of groups) {
    // (a) Pair must have exactly 2 members
    if (pair.length !== 2) {
      issues.push({
        code: 'DRILLMAP:BRUN_ODD_PAIR_COUNT',
        pairKeyV2,
        details: { count: pair.length },
      });
      continue;
    }

    const [a, b] = pair;

    // (b) Diameters must match
    if (Math.abs(a!.diameter - b!.diameter) > 0.001) {
      issues.push({
        code: 'DRILLMAP:BRUN_DIAMETER_MISMATCH',
        pairKeyV2,
        details: { diaA: a!.diameter, diaB: b!.diameter },
      });
    }

    // (c) Normals must be opposing (dot ≈ -1)
    const d = dot(a!.normal, b!.normal);
    if (d > -0.99) {
      issues.push({
        code: 'DRILLMAP:BRUN_NORMALS_NOT_OPPOSING',
        pairKeyV2,
        details: { dot: d },
      });
    }

    // (d) X and Z must match (same joint position)
    const xDiff = Math.abs(a!.position[0] - b!.position[0]);
    const zDiff = Math.abs(a!.position[2] - b!.position[2]);
    if (xDiff > posTolerance || zDiff > posTolerance) {
      issues.push({
        code: 'DRILLMAP:BRUN_POSITION_MISMATCH',
        pairKeyV2,
        details: { xDiff, zDiff, tolerance: posTolerance },
      });
    }
  }

  return issues;
}
