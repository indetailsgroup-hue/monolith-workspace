/**
 * validateBoltPocketLinkage — Manufacturing-layer contract guard
 *
 * Contract (LOCKED — see minifixRenderInvariant.test.ts):
 *   If BOLT has targetPocketCenter, boltDirection MUST exist
 *   and point from bolt entry toward cam pocket center.
 *
 * Pure tuple math — no THREE dependency.
 */

import type { Vec3Tuple } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Issue types
// ─────────────────────────────────────────────────────────────────────────────

export type BoltPocketLinkageIssueCode =
  | 'DRILLMAP:BOLT_POCKET_LINKAGE_MISSING_DIR'
  | 'DRILLMAP:BOLT_POCKET_LINKAGE_BAD_DOT';

export interface BoltPocketLinkageIssue {
  code: BoltPocketLinkageIssueCode;
  pointId: string;
  pairKeyV2?: string;
  cornerType?: string;
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuple math (no THREE)
// ─────────────────────────────────────────────────────────────────────────────

const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v: Vec3Tuple) => Math.hypot(v[0], v[1], v[2]);
const norm = (v: Vec3Tuple): Vec3Tuple => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal point shape accepted by this validator (subset of DrillMapPoint) */
export interface BoltPointLike {
  id: string;
  purpose: string;
  position: Vec3Tuple;
  boltDirection?: Vec3Tuple | null;
  targetPocketCenter?: Vec3Tuple | null;
  pairKeyV2?: string;
  cornerType?: string;
}

/**
 * Validate that every BOLT point with a targetPocketCenter has a
 * boltDirection that points from entry toward pocket center.
 *
 * @param points  Array of drill map points (only BOLT with tpc are checked)
 * @param threshold  Minimum dot product (default 0.99 = ~8° tolerance)
 * @returns Array of issues (empty = all good)
 */
export function validateBoltPocketLinkage(
  points: BoltPointLike[],
  threshold = 0.99,
): BoltPocketLinkageIssue[] {
  const issues: BoltPocketLinkageIssue[] = [];

  for (const p of points) {
    if (p.purpose !== 'BOLT') continue;
    if (!p.targetPocketCenter) continue;

    const dir = p.boltDirection ?? null;
    if (!dir || dir.length !== 3) {
      issues.push({
        code: 'DRILLMAP:BOLT_POCKET_LINKAGE_MISSING_DIR',
        pointId: p.id,
        pairKeyV2: p.pairKeyV2,
        cornerType: p.cornerType,
      });
      continue;
    }

    const toPocket = norm(sub(p.targetPocketCenter, p.position));
    const d = dot(toPocket, norm(dir));

    if (!(d > threshold)) {
      issues.push({
        code: 'DRILLMAP:BOLT_POCKET_LINKAGE_BAD_DOT',
        pointId: p.id,
        pairKeyV2: p.pairKeyV2,
        cornerType: p.cornerType,
        details: { dot: d, threshold },
      });
    }
  }

  return issues;
}
