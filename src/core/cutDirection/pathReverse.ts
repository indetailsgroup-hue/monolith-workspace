// src/core/cutDirection/pathReverse.ts
/**
 * Path Reversal Utility.
 *
 * Reverses path winding direction for cut direction policy.
 *
 * Operations:
 * - Reverse segment order
 * - Swap segment endpoints
 * - Flip arc direction (CW ↔ CCW)
 * - Remap tab intervals for reversed paths (v0.10.6.5)
 *
 * v0.10.6.4 - Climb / Conventional Policy Engine
 * v0.10.6.5 - Direction-aware Tabs (interval remapping)
 */

import {
  PathSegment,
  LineSegment,
  ArcSegment,
  ToolPath,
} from "./cutDirectionTypes";

// =============================================================================
// SEGMENT REVERSAL
// =============================================================================

/**
 * Reverse a line segment (swap endpoints).
 *
 * @param seg Line segment to reverse
 * @returns Reversed line segment
 */
export function reverseLineSegment(seg: LineSegment): LineSegment {
  return {
    kind: "LINE",
    x1: seg.x2,
    y1: seg.y2,
    x2: seg.x1,
    y2: seg.y1,
  };
}

/**
 * Reverse an arc segment (swap angles, flip direction).
 *
 * @param seg Arc segment to reverse
 * @returns Reversed arc segment
 */
export function reverseArcSegment(seg: ArcSegment): ArcSegment {
  return {
    kind: "ARC",
    cx: seg.cx,
    cy: seg.cy,
    r: seg.r,
    startDeg: seg.endDeg,
    endDeg: seg.startDeg,
    cw: !seg.cw,
  };
}

/**
 * Reverse any path segment.
 *
 * @param seg Segment to reverse
 * @returns Reversed segment
 */
export function reverseSegment(seg: PathSegment): PathSegment {
  if (seg.kind === "LINE") {
    return reverseLineSegment(seg);
  }
  return reverseArcSegment(seg);
}

// =============================================================================
// PATH REVERSAL
// =============================================================================

/**
 * Reverse a path (reverse order and all segments).
 *
 * This changes path winding: CCW ↔ CW.
 *
 * @param path Path to reverse
 * @returns Reversed path with inverted winding
 */
export function reversePath(path: ToolPath): ToolPath {
  const reversedSegs = path.segs
    .slice()
    .reverse()
    .map((seg) => reverseSegment(seg));

  // Calculate new winding (inverted)
  let newWinding: "CW" | "CCW" | undefined;
  if (path.winding) {
    newWinding = path.winding === "CW" ? "CCW" : "CW";
  }

  // Signed area inverts sign
  let newSignedArea: number | undefined;
  if (path.signedArea !== undefined) {
    newSignedArea = -path.signedArea;
  }

  return {
    id: path.id,
    segs: reversedSegs,
    winding: newWinding,
    signedArea: newSignedArea,
  };
}

/**
 * Reverse path segments in place (mutating).
 *
 * Use when you need to modify existing path data.
 *
 * @param segs Segments array to reverse in place
 */
export function reverseSegmentsInPlace(segs: PathSegment[]): void {
  // Reverse array
  segs.reverse();

  // Reverse each segment
  for (let i = 0; i < segs.length; i++) {
    segs[i] = reverseSegment(segs[i]);
  }
}

// =============================================================================
// WINDING DETECTION
// =============================================================================

/**
 * Calculate signed area of path using shoelace formula.
 *
 * Positive = CCW winding
 * Negative = CW winding
 *
 * For paths with arcs, this uses linear approximation
 * (samples arc endpoints only, not full arc).
 *
 * @param path Path to analyze
 * @returns Signed area (positive=CCW, negative=CW)
 */
export function calculateSignedArea(path: ToolPath): number {
  const segs = path.segs;
  if (segs.length === 0) return 0;

  let area = 0;

  for (const seg of segs) {
    let x1: number, y1: number, x2: number, y2: number;

    if (seg.kind === "LINE") {
      x1 = seg.x1;
      y1 = seg.y1;
      x2 = seg.x2;
      y2 = seg.y2;
    } else {
      // ARC: use endpoints for area calculation
      const a0 = (seg.startDeg * Math.PI) / 180;
      const a1 = (seg.endDeg * Math.PI) / 180;
      x1 = seg.cx + seg.r * Math.cos(a0);
      y1 = seg.cy + seg.r * Math.sin(a0);
      x2 = seg.cx + seg.r * Math.cos(a1);
      y2 = seg.cy + seg.r * Math.sin(a1);

      // Add arc sector contribution (approximate)
      // For better accuracy, integrate arc area properly
      const arcArea = calculateArcSectorArea(seg);
      area += arcArea;
    }

    // Shoelace term
    area += (x2 - x1) * (y2 + y1);
  }

  return area / 2;
}

/**
 * Calculate arc sector area contribution.
 *
 * Uses signed sector area formula for accurate winding.
 *
 * @param seg Arc segment
 * @returns Signed area contribution
 */
function calculateArcSectorArea(seg: ArcSegment): number {
  const r = seg.r;
  const a0 = (seg.startDeg * Math.PI) / 180;
  const a1 = (seg.endDeg * Math.PI) / 180;

  // Calculate sweep angle
  let sweep: number;
  if (seg.cw) {
    // CW: from a0 to a1 going clockwise
    sweep = a0 - a1;
    if (sweep < 0) sweep += 2 * Math.PI;
  } else {
    // CCW: from a0 to a1 going counter-clockwise
    sweep = a1 - a0;
    if (sweep < 0) sweep += 2 * Math.PI;
  }

  // Sector area = r² × θ / 2
  // Sign depends on direction
  const sectorArea = (r * r * sweep) / 2;

  return seg.cw ? -sectorArea : sectorArea;
}

/**
 * Detect path winding direction.
 *
 * @param path Path to analyze
 * @returns "CW" | "CCW" based on signed area
 */
export function detectWinding(path: ToolPath): "CW" | "CCW" {
  // Use cached value if available
  if (path.signedArea !== undefined) {
    return path.signedArea >= 0 ? "CCW" : "CW";
  }

  const area = calculateSignedArea(path);
  return area >= 0 ? "CCW" : "CW";
}

// =============================================================================
// ENSURE WINDING
// =============================================================================

/**
 * Ensure path has specified winding direction.
 *
 * Reverses path if current winding doesn't match target.
 *
 * @param path Path to check/reverse
 * @param targetWinding Desired winding direction
 * @returns Path with correct winding (may be reversed copy)
 */
export function ensureWinding(
  path: ToolPath,
  targetWinding: "CW" | "CCW"
): ToolPath {
  const currentWinding = path.winding ?? detectWinding(path);

  if (currentWinding === targetWinding) {
    return path;
  }

  return reversePath(path);
}

/**
 * Ensure path has specified winding direction (mutating).
 *
 * Reverses path in place if needed.
 *
 * @param path Path to check/reverse
 * @param targetWinding Desired winding direction
 * @returns True if path was reversed
 */
export function ensureWindingInPlace(
  path: ToolPath,
  targetWinding: "CW" | "CCW"
): boolean {
  const currentWinding = path.winding ?? detectWinding(path);

  if (currentWinding === targetWinding) {
    return false;
  }

  // Reverse in place
  reverseSegmentsInPlace(path.segs);

  // Update winding metadata
  path.winding = targetWinding;
  if (path.signedArea !== undefined) {
    path.signedArea = -path.signedArea;
  }

  return true;
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Reverse multiple paths.
 *
 * @param paths Paths to reverse
 * @returns Array of reversed paths
 */
export function reversePaths(paths: ToolPath[]): ToolPath[] {
  return paths.map((p) => reversePath(p));
}

/**
 * Ensure winding for multiple paths.
 *
 * @param paths Paths to process
 * @param targetWinding Desired winding direction
 * @returns Paths with correct winding
 */
export function ensureWindingAll(
  paths: ToolPath[],
  targetWinding: "CW" | "CCW"
): ToolPath[] {
  return paths.map((p) => ensureWinding(p, targetWinding));
}

// =============================================================================
// INTERVAL REMAPPING (v0.10.6.5 - Direction-aware Tabs)
// =============================================================================

/**
 * Tab interval type for remapping.
 *
 * Matches the TabInterval type from tabs module.
 */
export interface RemappableInterval {
  /** Start position along path length [0, L) */
  s0: number;
  /** End position along path length (s1 > s0) */
  s1: number;
  /** Optional reason tag */
  reason?: string;
}

/**
 * Tabs on path structure for remapping.
 */
export interface RemappableTabsOnPath {
  pathId: string;
  totalLen: number;
  intervals: RemappableInterval[];
  wasReversed?: boolean;
  originalIntervals?: RemappableInterval[];
}

/**
 * Remap a single interval for reversed path.
 *
 * When a path is reversed, arc-length positions flip:
 * Original: [s0, s1] on path of length L
 * Reversed: [L - s1, L - s0]
 *
 * This ensures tab positions stay at the same physical location
 * on the material, even though the cutting direction changed.
 *
 * @param interval Original interval
 * @param pathLength Total path length
 * @returns Remapped interval
 */
export function remapIntervalForReverse(
  interval: RemappableInterval,
  pathLength: number
): RemappableInterval {
  const L = pathLength;

  // Clamp to valid range
  const s0 = Math.max(0, Math.min(L, interval.s0));
  const s1 = Math.max(0, Math.min(L, interval.s1));

  // Remap: [s0, s1] → [L - s1, L - s0]
  return {
    s0: Math.max(0, L - s1),
    s1: Math.max(0, L - s0),
    reason: interval.reason,
  };
}

/**
 * Remap all tab intervals for a reversed path.
 *
 * Key rule for direction-aware tabs:
 * - Tabs are specified as physical positions on the path
 * - When direction policy reverses the path, tabs must stay
 *   at the same physical location
 * - This function transforms the arc-length coordinates
 *
 * @param tabs Original tabs specification
 * @returns Tabs with remapped intervals
 */
export function remapTabsForReversedPath(
  tabs: RemappableTabsOnPath
): RemappableTabsOnPath {
  const L = tabs.totalLen;

  // Remap each interval
  const remappedIntervals = tabs.intervals
    .map((iv) => remapIntervalForReverse(iv, L))
    .sort((a, b) => a.s0 - b.s0);

  return {
    ...tabs,
    intervals: remappedIntervals,
    wasReversed: true,
    originalIntervals: tabs.intervals,
  };
}

/**
 * Apply direction decision to path and tabs together.
 *
 * This is the main integration point between direction policy (10.6.4)
 * and tabs (10.6.5).
 *
 * Usage:
 * 1. Get direction decision from policy
 * 2. If decision requires path reversal, call this function
 * 3. Both path and tabs are updated consistently
 *
 * @param path Path to potentially reverse
 * @param tabs Tab specification (if any)
 * @param shouldReverse Whether direction policy requires reversal
 * @returns Object with potentially reversed path and remapped tabs
 */
export function applyDirectionWithTabs(
  path: ToolPath,
  tabs: RemappableTabsOnPath | null,
  shouldReverse: boolean
): {
  path: ToolPath;
  tabs: RemappableTabsOnPath | null;
  wasReversed: boolean;
} {
  if (!shouldReverse) {
    return {
      path,
      tabs,
      wasReversed: false,
    };
  }

  // Reverse the path
  const reversedPath = reversePath(path);

  // Remap tabs if present
  const remappedTabs = tabs ? remapTabsForReversedPath(tabs) : null;

  return {
    path: reversedPath,
    tabs: remappedTabs,
    wasReversed: true,
  };
}

/**
 * Calculate path length from segments.
 *
 * Utility for when path doesn't have pre-calculated length.
 */
export function calculatePathLength(segs: PathSegment[]): number {
  let length = 0;

  for (const seg of segs) {
    if (seg.kind === "LINE") {
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      length += Math.hypot(dx, dy);
    } else {
      // ARC: length = r * sweep_angle
      const a0 = (seg.startDeg * Math.PI) / 180;
      const a1 = (seg.endDeg * Math.PI) / 180;
      let sweep: number;
      if (seg.cw) {
        sweep = a0 - a1;
        if (sweep <= 0) sweep += 2 * Math.PI;
      } else {
        sweep = a1 - a0;
        if (sweep <= 0) sweep += 2 * Math.PI;
      }
      length += Math.abs(seg.r) * sweep;
    }
  }

  return length;
}
