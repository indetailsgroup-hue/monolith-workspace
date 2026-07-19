/**
 * General Tabs System
 *
 * Step 10.5.4: Split paths by tabs for general polyline geometry
 *
 * Tabs create gaps in the toolpath to hold parts in place during cutting.
 * This module handles tabs on arbitrary geometry (not just rectangles).
 *
 * Strategy:
 * 1. Calculate tab center positions uniformly along path length
 * 2. Create blocked intervals around each tab center
 * 3. Merge overlapping intervals
 * 4. Split path into sub-paths excluding blocked intervals
 */

import type { Path, Pt, SegLine, TabConfig } from './planTypes.js';
import { buildSegMeta, totalLengthFromMeta, sampleRange, pointAtDistance } from './pathParam.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A blocked interval on the path (where tabs prevent cutting).
 */
interface BlockedInterval {
  /** Start distance along path */
  start: number;
  /** End distance along path */
  end: number;
}

/**
 * Result of tab splitting.
 */
export interface TabSplitResult {
  /** Sub-paths to cut (between tabs) */
  subPaths: Path[];
  /** Tab positions for visualization/verification */
  tabPositions: Array<{ center: number; start: number; end: number }>;
}

// ============================================================================
// Tab Position Calculation
// ============================================================================

/**
 * Calculate tab center positions along path.
 *
 * @param totalLength - Total path length
 * @param count - Number of tabs
 * @param inset - Minimum distance from path start/end for tabs
 * @returns Array of tab center distances
 */
function calculateTabCenters(
  totalLength: number,
  count: number,
  inset: number
): number[] {
  if (count <= 0) return [];

  const effectiveLength = totalLength - 2 * inset;
  if (effectiveLength <= 0) {
    // Path too short for inset, place single tab at center
    return [totalLength / 2];
  }

  const centers: number[] = [];
  const spacing = effectiveLength / count;

  for (let i = 0; i < count; i++) {
    // Uniform distribution: center of each segment
    const center = inset + spacing * (i + 0.5);
    centers.push(Math.min(Math.max(center, inset), totalLength - inset));
  }

  return centers;
}

/**
 * Create blocked intervals from tab centers.
 *
 * @param centers - Tab center positions
 * @param tabLength - Length of each tab
 * @param totalLength - Total path length (for clamping)
 * @returns Array of blocked intervals
 */
function createBlockedIntervals(
  centers: number[],
  tabLength: number,
  totalLength: number
): BlockedInterval[] {
  const halfLen = tabLength / 2;

  return centers.map(center => ({
    start: Math.max(0, center - halfLen),
    end: Math.min(totalLength, center + halfLen),
  }));
}

/**
 * Merge overlapping intervals.
 *
 * @param intervals - Unsorted intervals
 * @returns Merged, sorted intervals
 */
function mergeIntervals(intervals: BlockedInterval[]): BlockedInterval[] {
  if (intervals.length <= 1) return intervals;

  // Sort by start position
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: BlockedInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.start <= last.end) {
      // Overlapping: extend the last interval
      last.end = Math.max(last.end, curr.end);
    } else {
      // Non-overlapping: add new interval
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Calculate keep intervals (areas to cut) from blocked intervals.
 *
 * @param blocked - Merged blocked intervals
 * @param totalLength - Total path length
 * @returns Array of keep intervals
 */
function calculateKeepIntervals(
  blocked: BlockedInterval[],
  totalLength: number
): BlockedInterval[] {
  const keeps: BlockedInterval[] = [];
  let pos = 0;

  for (const block of blocked) {
    if (block.start > pos + 1e-6) {
      keeps.push({ start: pos, end: block.start });
    }
    pos = block.end;
  }

  // Add final segment if any
  if (totalLength > pos + 1e-6) {
    keeps.push({ start: pos, end: totalLength });
  }

  return keeps;
}

// ============================================================================
// Path Splitting
// ============================================================================

/**
 * Convert a keep interval to a sampled polyline path.
 *
 * MVP approach: Sample points along the interval and create LINE segments.
 * This handles both LINE and ARC original segments uniformly.
 *
 * @param path - Original path
 * @param interval - Keep interval
 * @param sampleStep - Sampling resolution (mm)
 * @returns Open path of LINE segments
 */
function intervalToPath(
  path: Path,
  interval: BlockedInterval,
  sampleStep: number
): Path {
  const metas = buildSegMeta(path);
  const points = sampleRange(metas, interval.start, interval.end, sampleStep);

  if (points.length < 2) {
    return { closed: false, segs: [], winding: path.winding };
  }

  // Build LINE segments from sampled points
  const segs: SegLine[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push({
      kind: 'LINE',
      a: points[i],
      b: points[i + 1],
    });
  }

  return {
    closed: false,
    segs,
    winding: path.winding,
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Split a path by tabs for general geometry.
 *
 * @param path - Path to split
 * @param tab - Tab configuration
 * @param sampleStep - Sampling resolution for sub-paths (default: 2mm)
 * @returns Tab split result with sub-paths
 */
export function splitPathByTabs(
  path: Path,
  tab: TabConfig,
  sampleStep: number = 2.0
): TabSplitResult {
  // If tabs disabled or count <= 0, return original path
  if (!tab.enabled || tab.count <= 0) {
    return {
      subPaths: [path],
      tabPositions: [],
    };
  }

  const metas = buildSegMeta(path);
  const totalLen = totalLengthFromMeta(metas);

  // Calculate tab parameters
  const count = Math.max(1, Math.floor(tab.count));
  const length = Math.max(2, tab.lengthMm);
  const inset = Math.max(0, tab.insetMm);

  // Calculate tab centers
  const centers = calculateTabCenters(totalLen, count, inset);

  // Create and merge blocked intervals
  const blocked = createBlockedIntervals(centers, length, totalLen);
  const merged = mergeIntervals(blocked);

  // Calculate keep intervals
  const keeps = calculateKeepIntervals(merged, totalLen);

  // Convert keep intervals to sub-paths
  const subPaths = keeps.map(interval =>
    intervalToPath(path, interval, sampleStep)
  );

  // Build tab position info
  const tabPositions = centers.map(center => ({
    center,
    start: Math.max(0, center - length / 2),
    end: Math.min(totalLen, center + length / 2),
  }));

  return {
    subPaths: subPaths.filter(p => p.segs.length > 0),
    tabPositions,
  };
}

/**
 * Check if a path needs tab splitting.
 */
export function needsTabSplitting(tab: TabConfig | undefined): boolean {
  return tab !== undefined && tab.enabled && tab.count > 0;
}

/**
 * Get the sub-paths to cut, handling both tabbed and non-tabbed cases.
 *
 * @param path - Original path
 * @param tab - Tab configuration (optional)
 * @returns Array of paths to cut
 */
export function getPathsForCutting(
  path: Path,
  tab?: TabConfig
): Path[] {
  if (!needsTabSplitting(tab)) {
    return [path];
  }

  const result = splitPathByTabs(path, tab!);
  return result.subPaths;
}

// ============================================================================
// Tab Visualization Helpers
// ============================================================================

/**
 * Get tab center points for visualization.
 */
export function getTabCenterPoints(
  path: Path,
  tab: TabConfig
): Pt[] {
  if (!tab.enabled || tab.count <= 0) return [];

  const metas = buildSegMeta(path);
  const totalLen = totalLengthFromMeta(metas);
  const centers = calculateTabCenters(totalLen, tab.count, tab.insetMm);

  return centers.map(c => pointAtDistance(metas, c));
}

/**
 * Calculate total cut length (excluding tabs).
 */
export function totalCutLength(
  path: Path,
  tab: TabConfig
): number {
  if (!tab.enabled || tab.count <= 0) {
    return totalLengthFromMeta(buildSegMeta(path));
  }

  const result = splitPathByTabs(path, tab);
  return result.subPaths.reduce((sum, subPath) => {
    const metas = buildSegMeta(subPath);
    return sum + totalLengthFromMeta(metas);
  }, 0);
}
