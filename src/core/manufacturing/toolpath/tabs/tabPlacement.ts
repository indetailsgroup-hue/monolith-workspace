// src/core/manufacturing/toolpath/tabs/tabPlacement.ts
/**
 * Automatic Tab Placement Algorithm.
 *
 * Places tabs deterministically on paths following constraints:
 * - Avoid corners (minCornerClearMm)
 * - Avoid lead-in/out zones (avoidLeadInMm)
 * - Prefer straight segments over arcs
 * - Distribute evenly along usable regions
 *
 * Direction-aware: Uses path AFTER direction policy is applied,
 * so tab positions are correct relative to final cutting direction.
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

import {
  TabPolicy,
  TabInterval,
  TabsOnPath,
  TabPlacementRequest,
  DEFAULT_TAB_POLICY,
} from "./tabTypes";
import {
  Path,
  PathParam,
  SegParam,
  buildParam,
  clamp,
} from "./pathParam";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Candidate position for tab placement.
 */
interface TabCandidate {
  /** Center position (arc-length) */
  s: number;

  /** Score (higher = better placement) */
  score: number;

  /** Segment index */
  segIndex: number;

  /** Segment kind */
  kind: "LINE" | "ARC";

  /** Segment length */
  segLen: number;
}

/**
 * Extended placement request with path data.
 */
export interface AutoPlaceTabsRequest extends TabPlacementRequest {
  /** Path to place tabs on (after direction policy applied) */
  path: Path;
}

// =============================================================================
// SCORING
// =============================================================================

/**
 * Score a segment for tab placement.
 *
 * Higher score = better for tab placement.
 * Prefers: LINE > ARC, longer segments > shorter
 */
function scoreSegment(row: SegParam): number {
  // Base score by type (LINE preferred for cleaner cuts)
  const typeScore = row.kind === "LINE" ? 1_000_000 : 100_000;

  // Length bonus (longer segments = more room for tab)
  const lengthScore = row.length;

  return typeScore + lengthScore;
}

// =============================================================================
// CANDIDATE GENERATION
// =============================================================================

/**
 * Generate tab placement candidates from path segments.
 *
 * Filters out segments that are too short or in avoid zones.
 *
 * @param param Path parameterization
 * @param policy Tab policy
 * @param tabWidthMm Width of each tab
 * @returns Sorted array of candidates (best first)
 */
function generateCandidates(
  param: PathParam,
  policy: TabPolicy,
  tabWidthMm: number
): TabCandidate[] {
  const L = param.totalLen;
  const avoid0 = policy.avoidLeadInMm;
  const avoid1 = L - policy.avoidLeadInMm;

  const candidates: TabCandidate[] = [];

  // Minimum segment length to be considered
  const minSegLen = Math.max(
    tabWidthMm * 2,
    policy.minCornerClearMm * 2,
    policy.minSpanMm
  );

  for (const row of param.table) {
    // Skip short segments
    if (row.length < minSegLen) continue;

    // Segment midpoint
    const mid = (row.sStart + row.sEnd) * 0.5;

    // Skip if in lead-in/out avoid zone
    if (mid <= avoid0 || mid >= avoid1) continue;

    // Skip if too close to path boundaries
    const halfTab = tabWidthMm * 0.5;
    if (mid - halfTab < avoid0 || mid + halfTab > avoid1) continue;

    // Add candidate
    candidates.push({
      s: mid,
      score: scoreSegment(row),
      segIndex: row.segIndex,
      kind: row.kind,
      segLen: row.length,
    });
  }

  // Sort by score (descending), then by position (ascending) for determinism
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.s - b.s;
  });

  return candidates;
}

/**
 * Generate additional candidates at segment-interior positions.
 *
 * For long segments, add multiple candidate positions.
 */
function generateInteriorCandidates(
  param: PathParam,
  policy: TabPolicy,
  tabWidthMm: number,
  spacing: number
): TabCandidate[] {
  const L = param.totalLen;
  const avoid0 = policy.avoidLeadInMm;
  const avoid1 = L - policy.avoidLeadInMm;

  const candidates: TabCandidate[] = [];
  const halfTab = tabWidthMm * 0.5;

  for (const row of param.table) {
    // Only consider segments long enough for multiple tabs
    if (row.length < spacing * 2) continue;

    // Generate interior positions
    const segStart = Math.max(row.sStart + policy.minCornerClearMm, avoid0 + halfTab);
    const segEnd = Math.min(row.sEnd - policy.minCornerClearMm, avoid1 - halfTab);

    if (segEnd <= segStart) continue;

    // Sample positions within this segment
    let s = segStart;
    while (s <= segEnd) {
      candidates.push({
        s,
        score: scoreSegment(row) - Math.abs(s - (row.sStart + row.sEnd) / 2), // Slight preference for center
        segIndex: row.segIndex,
        kind: row.kind,
        segLen: row.length,
      });
      s += spacing;
    }
  }

  // Sort by score descending, position ascending
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.s - b.s;
  });

  return candidates;
}

// =============================================================================
// TAB SELECTION
// =============================================================================

/**
 * Select N tab positions from candidates, ensuring minimum spacing.
 *
 * @param candidates Sorted candidate array
 * @param count Number of tabs to select
 * @param minGap Minimum gap between tab centers
 * @returns Selected positions
 */
function selectTabPositions(
  candidates: TabCandidate[],
  count: number,
  minGap: number
): number[] {
  const selected: number[] = [];

  for (const c of candidates) {
    if (selected.length >= count) break;

    // Check spacing against already selected
    const hasConflict = selected.some((s) => Math.abs(s - c.s) < minGap);
    if (!hasConflict) {
      selected.push(c.s);
    }
  }

  // Sort by position for deterministic output
  selected.sort((a, b) => a - b);

  return selected;
}

/**
 * Fill remaining slots with evenly distributed positions.
 *
 * Used when not enough candidates pass the filters.
 */
function fillEvenlyDistributed(
  existing: number[],
  count: number,
  avoid0: number,
  avoid1: number,
  minGap: number
): number[] {
  const result = [...existing];
  const usableLen = avoid1 - avoid0;

  if (usableLen <= 0 || count <= 0) return result;

  // Calculate ideal spacing
  const targetCount = Math.max(count - result.length, 0);
  if (targetCount === 0) return result;

  const spacing = usableLen / (targetCount + 1);

  for (let i = 1; i <= targetCount && result.length < count; i++) {
    const s = avoid0 + i * spacing;

    // Check against existing positions
    const hasConflict = result.some((pos) => Math.abs(pos - s) < minGap);
    if (!hasConflict) {
      result.push(s);
    }
  }

  result.sort((a, b) => a - b);
  return result;
}

// =============================================================================
// INTERVAL CREATION
// =============================================================================

/**
 * Create tab intervals from center positions.
 *
 * @param positions Tab center positions
 * @param tabWidthMm Tab width
 * @param pathLen Total path length
 * @returns Array of tab intervals
 */
function createIntervals(
  positions: number[],
  tabWidthMm: number,
  pathLen: number
): TabInterval[] {
  const halfWidth = tabWidthMm * 0.5;

  return positions.map((center) => ({
    s0: clamp(center - halfWidth, 0, pathLen),
    s1: clamp(center + halfWidth, 0, pathLen),
    reason: "AUTO" as const,
  }));
}

/**
 * Merge overlapping intervals.
 *
 * Ensures no overlaps in final interval list.
 */
function mergeOverlappingIntervals(intervals: TabInterval[]): TabInterval[] {
  if (intervals.length === 0) return [];

  // Sort by start position
  const sorted = [...intervals].sort((a, b) => a.s0 - b.s0);

  const merged: TabInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.s0 <= last.s1) {
      // Overlap: extend last interval
      last.s1 = Math.max(last.s1, current.s1);
      // Combine reasons
      if (current.reason === "USER" || last.reason === "USER") {
        last.reason = "USER";
      }
    } else {
      // No overlap: add new interval
      merged.push(current);
    }
  }

  return merged;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Automatically place tabs on a path.
 *
 * Algorithm:
 * 1. Generate candidates from segment midpoints
 * 2. Score and sort candidates (prefer LINE, longer segments)
 * 3. Select N positions with minimum spacing
 * 4. Fill remaining slots with even distribution
 * 5. Merge with user-defined intervals if any
 * 6. Create final interval list
 *
 * @param req Placement request with path and policy
 * @returns TabsOnPath with placed intervals
 */
export function autoPlaceTabs(req: AutoPlaceTabsRequest): TabsOnPath {
  const param = buildParam(req.path);
  const L = param.totalLen;
  const policy = req.policy;

  // Usable region
  const avoid0 = policy.avoidLeadInMm;
  const avoid1 = L - policy.avoidLeadInMm;
  const usableLen = Math.max(0, avoid1 - avoid0);

  // Calculate minimum gap between tabs
  const minGap = Math.max(
    req.tabWidthMm * 2,
    usableLen / (req.tabCount * 2),
    policy.minSpanMm
  );

  // Generate candidates
  const candidates = generateCandidates(param, policy, req.tabWidthMm);

  // If not enough candidates, add interior candidates
  let allCandidates = candidates;
  if (candidates.length < req.tabCount) {
    const interiorCandidates = generateInteriorCandidates(
      param,
      policy,
      req.tabWidthMm,
      minGap
    );
    allCandidates = [...candidates, ...interiorCandidates];
    // Re-sort
    allCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.s - b.s;
    });
  }

  // Select tab positions
  let positions = selectTabPositions(allCandidates, req.tabCount, minGap);

  // Fill remaining with even distribution
  if (positions.length < req.tabCount) {
    positions = fillEvenlyDistributed(
      positions,
      req.tabCount,
      avoid0,
      avoid1,
      minGap
    );
  }

  // Create intervals from positions
  let intervals = createIntervals(positions, req.tabWidthMm, L);

  // Merge with user-defined intervals
  if (req.userIntervals && req.userIntervals.length > 0) {
    intervals = [...intervals, ...req.userIntervals];
  }

  // Merge overlapping intervals
  intervals = mergeOverlappingIntervals(intervals);

  return {
    pathId: req.pathId,
    totalLen: L,
    intervals,
    policy,
  };
}

/**
 * Place tabs with default policy.
 *
 * Convenience function for simple use cases.
 */
export function placeTabsDefault(
  path: Path,
  pathId: string,
  tabCount: number = 4,
  tabWidthMm: number = 8.0
): TabsOnPath {
  return autoPlaceTabs({
    pathId,
    path,
    tabCount,
    tabWidthMm,
    policy: DEFAULT_TAB_POLICY,
  });
}

/**
 * Validate tab placement request.
 *
 * @returns Array of error messages (empty if valid)
 */
export function validatePlacementRequest(req: AutoPlaceTabsRequest): string[] {
  const errors: string[] = [];
  const param = buildParam(req.path);
  const L = param.totalLen;

  // Check path length
  if (L <= 0) {
    errors.push("Path has zero length");
  }

  // Check usable length
  const usableLen = L - 2 * req.policy.avoidLeadInMm;
  if (usableLen <= 0) {
    errors.push("Path too short for lead-in/out zones");
  }

  // Check tab count feasibility
  const minRequired = req.tabCount * req.tabWidthMm;
  const maxTabs = usableLen - req.tabCount * req.policy.minSpanMm;
  if (minRequired > maxTabs) {
    errors.push("Tab count too high for path length");
  }

  // Check tab width
  if (req.tabWidthMm <= 0) {
    errors.push("Tab width must be positive");
  }

  // Check tab count
  if (req.tabCount <= 0) {
    errors.push("Tab count must be positive");
  }

  return errors;
}
