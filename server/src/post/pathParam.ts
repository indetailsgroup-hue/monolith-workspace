/**
 * Path Parameterization
 *
 * Step 10.5.4: Length-based parameterization for paths
 *
 * Enables:
 * - Calculating total path length
 * - Sampling points at any distance along the path
 * - Tab placement on arbitrary geometry
 */

import type { Path, Pt, SegLine, SegArc } from './planTypes.js';

// ============================================================================
// Segment Metadata
// ============================================================================

/**
 * Metadata for a segment including computed length.
 */
export interface SegMeta {
  kind: 'LINE' | 'ARC';
  /** Length of segment in mm */
  len: number;
  /** Cumulative start distance from path start */
  startDist: number;
  /** Original segment data for LINE */
  line?: { a: Pt; b: Pt };
  /** Original segment data for ARC */
  arc?: {
    c: Pt;
    r: number;
    startRad: number;
    endRad: number;
    sweep: number; // Signed sweep angle in radians
    cw: boolean;
    start: Pt;
    end: Pt;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert degrees to radians.
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate distance between two points.
 */
function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Calculate arc length from radius and sweep angle.
 */
function arcLength(radius: number, sweepRad: number): number {
  return Math.abs(radius * sweepRad);
}

/**
 * Normalize angle to [-π, π] range.
 */
function normalizeAngle(rad: number): number {
  while (rad > Math.PI) rad -= 2 * Math.PI;
  while (rad < -Math.PI) rad += 2 * Math.PI;
  return rad;
}

// ============================================================================
// Segment Metadata Building
// ============================================================================

/**
 * Build metadata array for all segments in a path.
 * Includes cumulative distances for efficient point sampling.
 */
export function buildSegMeta(path: Path): SegMeta[] {
  const metas: SegMeta[] = [];
  let cumDist = 0;

  for (const seg of path.segs) {
    if (seg.kind === 'LINE') {
      const len = dist(seg.a, seg.b);
      metas.push({
        kind: 'LINE',
        len,
        startDist: cumDist,
        line: { a: seg.a, b: seg.b },
      });
      cumDist += len;
    } else {
      const arc = seg as SegArc;
      const startRad = degToRad(arc.startDeg);
      const endRad = degToRad(arc.endDeg);

      // Calculate sweep angle considering direction
      let sweep = endRad - startRad;

      // Adjust for CW/CCW direction
      if (arc.cw) {
        // Clockwise: sweep should be negative
        if (sweep > 0) sweep -= 2 * Math.PI;
      } else {
        // Counter-clockwise: sweep should be positive
        if (sweep < 0) sweep += 2 * Math.PI;
      }

      const len = arcLength(arc.r, sweep);

      metas.push({
        kind: 'ARC',
        len,
        startDist: cumDist,
        arc: {
          c: arc.c,
          r: arc.r,
          startRad,
          endRad,
          sweep,
          cw: arc.cw,
          start: arc.start,
          end: arc.end,
        },
      });
      cumDist += len;
    }
  }

  return metas;
}

// ============================================================================
// Path Length
// ============================================================================

/**
 * Calculate total path length.
 */
export function totalPathLength(path: Path): number {
  const metas = buildSegMeta(path);
  if (metas.length === 0) return 0;
  const last = metas[metas.length - 1];
  return last.startDist + last.len;
}

/**
 * Calculate total length from pre-computed metadata.
 */
export function totalLengthFromMeta(metas: SegMeta[]): number {
  if (metas.length === 0) return 0;
  const last = metas[metas.length - 1];
  return last.startDist + last.len;
}

// ============================================================================
// Point Sampling
// ============================================================================

/**
 * Sample a point at distance s along the path.
 *
 * @param metas - Pre-computed segment metadata
 * @param s - Distance from path start (0 to totalLength)
 * @returns Point at the specified distance
 */
export function pointAtDistance(metas: SegMeta[], s: number): Pt {
  if (metas.length === 0) {
    return { x: 0, y: 0 };
  }

  // Clamp s to valid range
  const totalLen = totalLengthFromMeta(metas);
  s = Math.max(0, Math.min(s, totalLen));

  // Find the segment containing this distance
  for (const meta of metas) {
    const segEnd = meta.startDist + meta.len;

    if (s <= segEnd || meta === metas[metas.length - 1]) {
      // This segment contains the point
      const localDist = s - meta.startDist;
      const t = meta.len > 0 ? Math.max(0, Math.min(1, localDist / meta.len)) : 0;

      if (meta.kind === 'LINE' && meta.line) {
        const { a, b } = meta.line;
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
      }

      if (meta.kind === 'ARC' && meta.arc) {
        const { c, r, startRad, sweep } = meta.arc;
        const angle = startRad + sweep * t;
        return {
          x: c.x + r * Math.cos(angle),
          y: c.y + r * Math.sin(angle),
        };
      }
    }
  }

  // Fallback: return end of last segment
  const last = metas[metas.length - 1];
  if (last.kind === 'LINE' && last.line) {
    return last.line.b;
  }
  if (last.kind === 'ARC' && last.arc) {
    return last.arc.end;
  }

  return { x: 0, y: 0 };
}

/**
 * Sample a point at distance s along a path.
 * Convenience function that builds metadata internally.
 */
export function pointAt(path: Path, s: number): Pt {
  const metas = buildSegMeta(path);
  return pointAtDistance(metas, s);
}

// ============================================================================
// Tangent at Distance
// ============================================================================

/**
 * Get tangent direction at distance s along the path.
 *
 * @param metas - Pre-computed segment metadata
 * @param s - Distance from path start
 * @returns Unit vector in direction of travel
 */
export function tangentAtDistance(metas: SegMeta[], s: number): Pt {
  if (metas.length === 0) {
    return { x: 1, y: 0 };
  }

  const totalLen = totalLengthFromMeta(metas);
  s = Math.max(0, Math.min(s, totalLen));

  for (const meta of metas) {
    const segEnd = meta.startDist + meta.len;

    if (s <= segEnd || meta === metas[metas.length - 1]) {
      if (meta.kind === 'LINE' && meta.line) {
        const { a, b } = meta.line;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len };
      }

      if (meta.kind === 'ARC' && meta.arc) {
        const { c, r, startRad, sweep, cw } = meta.arc;
        const localDist = s - meta.startDist;
        const t = meta.len > 0 ? localDist / meta.len : 0;
        const angle = startRad + sweep * t;

        // Tangent is perpendicular to radius
        // Direction depends on CW/CCW
        const rx = Math.cos(angle);
        const ry = Math.sin(angle);

        let tx: number, ty: number;
        if (cw) {
          // CW: tangent is 90° CW from radius
          tx = ry;
          ty = -rx;
        } else {
          // CCW: tangent is 90° CCW from radius
          tx = -ry;
          ty = rx;
        }

        return { x: tx, y: ty };
      }
    }
  }

  return { x: 1, y: 0 };
}

// ============================================================================
// Path Sampling
// ============================================================================

/**
 * Sample multiple points along a path at regular intervals.
 *
 * @param path - Path to sample
 * @param step - Distance between samples (mm)
 * @returns Array of sampled points
 */
export function samplePath(path: Path, step: number): Pt[] {
  const metas = buildSegMeta(path);
  const totalLen = totalLengthFromMeta(metas);
  const points: Pt[] = [];

  for (let s = 0; s < totalLen; s += step) {
    points.push(pointAtDistance(metas, s));
  }

  // Always include the end point
  points.push(pointAtDistance(metas, totalLen));

  return points;
}

/**
 * Sample points along a path within a distance range.
 *
 * @param metas - Pre-computed segment metadata
 * @param startDist - Start distance
 * @param endDist - End distance
 * @param step - Sampling step (mm)
 * @returns Array of sampled points
 */
export function sampleRange(
  metas: SegMeta[],
  startDist: number,
  endDist: number,
  step: number
): Pt[] {
  const points: Pt[] = [];

  for (let s = startDist; s < endDist - 1e-6; s += step) {
    points.push(pointAtDistance(metas, s));
  }

  // Always include the end point
  points.push(pointAtDistance(metas, endDist));

  return points;
}
