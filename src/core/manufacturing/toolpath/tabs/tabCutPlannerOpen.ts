// src/core/manufacturing/toolpath/tabs/tabCutPlannerOpen.ts
/**
 * Tab Cut Planner - Open Subpaths Mode.
 *
 * Converts a closed path + tab intervals into open cut spans.
 * Each span is a continuous cutting segment between tabs.
 *
 * The machine will:
 * 1. Cut span 1
 * 2. Retract Z
 * 3. Rapid to span 2 start
 * 4. Plunge/ramp to cut depth
 * 5. Cut span 2
 * ... repeat
 *
 * This preserves the material tabs (gaps) as physical connections
 * between the part and the stock.
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

import {
  TabsOnPath,
  TabInterval,
  CutSpan,
  TabCutPlanResult,
  TabIssue,
  PathSegment,
} from "./tabTypes";
import {
  Path,
  buildParam,
  splitPathAtMultipleS,
  segLen,
  segStartPoint,
  segEndPoint,
  clamp,
} from "./pathParam";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Internal segment with arc-length tracking.
 */
interface SegWithS {
  seg: PathSegment;
  sStart: number;
  sEnd: number;
  sMid: number;
}

// =============================================================================
// SPAN BUILDING
// =============================================================================

/**
 * Check if arc-length position is inside a gap (tab interval).
 *
 * @param s Arc-length position
 * @param gaps Sorted tab intervals
 * @returns True if s is inside any gap
 */
function isInGap(s: number, gaps: TabInterval[]): boolean {
  for (const g of gaps) {
    if (s >= g.s0 && s <= g.s1) return true;
    // Early exit if past all gaps (sorted)
    if (s < g.s0) return false;
  }
  return false;
}

/**
 * Get the gap containing position s.
 */
function getGapAt(s: number, gaps: TabInterval[]): TabInterval | null {
  for (const g of gaps) {
    if (s >= g.s0 && s <= g.s1) return g;
  }
  return null;
}

/**
 * Build segments with arc-length tracking.
 */
function buildSegsWithS(path: Path): SegWithS[] {
  let s = 0;
  const result: SegWithS[] = [];

  for (const seg of path.segs) {
    const len = segLen(seg);
    result.push({
      seg,
      sStart: s,
      sEnd: s + len,
      sMid: s + len * 0.5,
    });
    s += len;
  }

  return result;
}

/**
 * Extract segment range from split path for a span.
 *
 * @param segsWithS Segments with arc-length data
 * @param s0 Span start (arc-length)
 * @param s1 Span end (arc-length)
 * @returns Segments in this span
 */
function extractSpanSegments(
  segsWithS: SegWithS[],
  s0: number,
  s1: number
): PathSegment[] {
  const result: PathSegment[] = [];

  for (const sw of segsWithS) {
    // Segment is fully inside span
    if (sw.sStart >= s0 && sw.sEnd <= s1) {
      result.push(sw.seg);
    }
    // Segment overlaps span start
    else if (sw.sStart < s0 && sw.sEnd > s0 && sw.sEnd <= s1) {
      // This should not happen after proper splitting
      // but include for robustness
      result.push(sw.seg);
    }
    // Segment overlaps span end
    else if (sw.sStart >= s0 && sw.sStart < s1 && sw.sEnd > s1) {
      result.push(sw.seg);
    }
    // Segment contains entire span
    else if (sw.sStart < s0 && sw.sEnd > s1) {
      result.push(sw.seg);
    }
  }

  return result;
}

// =============================================================================
// MAIN PLANNER
// =============================================================================

/**
 * Build open cut spans from a path and tab intervals.
 *
 * Algorithm:
 * 1. Split path at all tab interval boundaries
 * 2. Walk through segments, accumulating spans
 * 3. When entering a gap, flush current span
 * 4. When exiting a gap, start new span
 * 5. Return list of open cut spans
 *
 * @param inputPath Closed path (after direction policy applied)
 * @param tabs Tab specification with intervals
 * @returns Tab cut plan result with spans
 */
export function buildOpenCutSpans(
  inputPath: Path,
  tabs: TabsOnPath
): TabCutPlanResult {
  const issues: TabIssue[] = [];

  // Validate input
  if (!inputPath.segs || inputPath.segs.length === 0) {
    issues.push({
      code: "TAB_INTERVAL_INVALID",
      severity: "BLOCK",
      message: "Input path has no segments",
    });
    return {
      pathId: tabs.pathId,
      spans: [],
      totalCutLength: 0,
      totalGapLength: 0,
      transitionCount: 0,
      tabs,
      issues,
    };
  }

  // Get all split points from tab intervals
  const splitPoints: number[] = [];
  for (const iv of tabs.intervals) {
    splitPoints.push(iv.s0);
    splitPoints.push(iv.s1);
  }

  // Split path at all tab boundaries
  const splitPath = splitPathAtMultipleS(inputPath, splitPoints);
  const param = buildParam(splitPath);
  const L = param.totalLen;

  // Sort gaps by start position
  const gaps = [...tabs.intervals].sort((a, b) => a.s0 - b.s0);

  // Validate gaps
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];

    // Check interval validity
    if (g.s0 >= g.s1) {
      issues.push({
        code: "TAB_INTERVAL_INVALID",
        severity: "BLOCK",
        message: `Tab interval ${i} has invalid range: s0=${g.s0} >= s1=${g.s1}`,
        data: { intervalIndex: i, s0: g.s0, s1: g.s1 },
      });
    }

    // Check for overlaps
    if (i > 0 && g.s0 < gaps[i - 1].s1) {
      issues.push({
        code: "TAB_INTERVAL_OVERLAP",
        severity: "WARN",
        message: `Tab intervals ${i - 1} and ${i} overlap`,
        data: { interval1: i - 1, interval2: i },
      });
    }
  }

  // Build segments with arc-length tracking
  const segsWithS = buildSegsWithS(splitPath);

  // Walk through segments building spans
  const spans: CutSpan[] = [];
  let currentSegments: PathSegment[] = [];
  let spanStart: number | null = null;
  let totalCutLength = 0;
  let totalGapLength = 0;

  // Calculate total gap length
  for (const g of gaps) {
    totalGapLength += g.s1 - g.s0;
  }

  for (const sw of segsWithS) {
    const inGap = isInGap(sw.sMid, gaps);

    if (!inGap) {
      // Segment is in a cutting region
      if (spanStart === null) {
        spanStart = sw.sStart;
      }
      currentSegments.push(sw.seg);
    } else {
      // Segment is in a gap (tab)
      // Flush current span if any
      if (currentSegments.length > 0 && spanStart !== null) {
        const spanEnd = sw.sStart;
        const spanLength = spanEnd - spanStart;

        if (spanLength >= tabs.policy.minSpanMm) {
          const span = createSpan(
            spans.length,
            tabs.pathId,
            currentSegments,
            spanStart,
            spanEnd
          );
          spans.push(span);
          totalCutLength += spanLength;
        } else {
          issues.push({
            code: "TAB_SPAN_TOO_SHORT",
            severity: "WARN",
            message: `Span ${spans.length} is too short (${spanLength.toFixed(2)}mm < ${tabs.policy.minSpanMm}mm)`,
            data: { spanIndex: spans.length, length: spanLength },
          });
        }
      }

      // Reset for next span
      currentSegments = [];
      spanStart = null;
    }
  }

  // Flush final span
  if (currentSegments.length > 0 && spanStart !== null) {
    const spanEnd = L;
    const spanLength = spanEnd - spanStart;

    if (spanLength >= tabs.policy.minSpanMm) {
      const span = createSpan(
        spans.length,
        tabs.pathId,
        currentSegments,
        spanStart,
        spanEnd
      );
      spans.push(span);
      totalCutLength += spanLength;
    }
  }

  // Check if tabs consumed everything
  if (spans.length === 0) {
    issues.push({
      code: "TAB_CONSUMED_ALL",
      severity: "BLOCK",
      message: "Tab intervals consumed entire path - no cutting spans remain",
      data: { pathLength: L, totalGapLength },
    });
  }

  // Check for lead-in overlap
  if (gaps.length > 0) {
    const firstGap = gaps[0];
    if (firstGap.s0 < tabs.policy.avoidLeadInMm) {
      issues.push({
        code: "TAB_GAP_OVERLAPS_LEADIN",
        severity: "WARN",
        message: `First tab overlaps lead-in zone (${firstGap.s0.toFixed(2)}mm < ${tabs.policy.avoidLeadInMm}mm)`,
        data: { gapStart: firstGap.s0, avoidZone: tabs.policy.avoidLeadInMm },
      });
    }

    const lastGap = gaps[gaps.length - 1];
    const leadOutStart = L - tabs.policy.avoidLeadInMm;
    if (lastGap.s1 > leadOutStart) {
      issues.push({
        code: "TAB_GAP_OVERLAPS_LEADIN",
        severity: "WARN",
        message: `Last tab overlaps lead-out zone`,
        data: { gapEnd: lastGap.s1, leadOutStart },
      });
    }
  }

  return {
    pathId: tabs.pathId,
    spans,
    totalCutLength,
    totalGapLength,
    transitionCount: Math.max(0, spans.length - 1),
    tabs,
    issues,
  };
}

/**
 * Create a CutSpan from segments and range.
 */
function createSpan(
  index: number,
  pathId: string,
  segments: PathSegment[],
  s0: number,
  s1: number
): CutSpan {
  const startPoint =
    segments.length > 0 ? segStartPoint(segments[0]) : { x: 0, y: 0 };

  const endPoint =
    segments.length > 0
      ? segEndPoint(segments[segments.length - 1])
      : { x: 0, y: 0 };

  return {
    spanId: `${pathId}_span_${index + 1}`,
    index,
    sRange: { s0, s1 },
    length: s1 - s0,
    startPoint,
    endPoint,
    segs: segments,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a tab cut plan.
 *
 * @param plan Plan to validate
 * @returns Array of blocking issues (empty if valid)
 */
export function validateTabCutPlan(plan: TabCutPlanResult): TabIssue[] {
  const blockingIssues = plan.issues.filter((i) => i.severity === "BLOCK");

  // Additional validation
  if (plan.spans.length === 0 && blockingIssues.length === 0) {
    blockingIssues.push({
      code: "TAB_CONSUMED_ALL",
      severity: "BLOCK",
      message: "No cutting spans generated",
    });
  }

  // Check for invalid tab count
  if (plan.tabs.intervals.length === 0 && plan.spans.length === 0) {
    blockingIssues.push({
      code: "TAB_COUNT_INVALID",
      severity: "BLOCK",
      message: "No tabs and no spans - invalid configuration",
    });
  }

  return blockingIssues;
}

/**
 * Check if a tab cut plan is valid for execution.
 */
export function isTabCutPlanValid(plan: TabCutPlanResult): boolean {
  return validateTabCutPlan(plan).length === 0;
}

// =============================================================================
// AUDIT
// =============================================================================

/**
 * Generate audit report for tab cut plan.
 */
export function generateTabCutAudit(plan: TabCutPlanResult): Record<string, unknown> {
  return {
    pathId: plan.pathId,
    tabCount: plan.tabs.intervals.length,
    spanCount: plan.spans.length,
    totalCutLength: Math.round(plan.totalCutLength * 100) / 100,
    totalGapLength: Math.round(plan.totalGapLength * 100) / 100,
    transitionCount: plan.transitionCount,
    policy: plan.tabs.policy,
    intervals: plan.tabs.intervals.map((iv) => ({
      s0: Math.round(iv.s0 * 100) / 100,
      s1: Math.round(iv.s1 * 100) / 100,
      width: Math.round((iv.s1 - iv.s0) * 100) / 100,
      reason: iv.reason,
    })),
    spans: plan.spans.map((sp) => ({
      id: sp.spanId,
      length: Math.round(sp.length * 100) / 100,
      segCount: sp.segs.length,
    })),
    issues: plan.issues,
    wasReversed: plan.tabs.wasReversed,
  };
}
