/**
 * Direction-aware Tab Generation
 *
 * Step 10.6.5: Deterministic tab placement with arc-length parameterization.
 *
 * This module generates tabs (holding tabs) for CNC profile cuts:
 * - Arc-length parameterization for uniform spacing
 * - Deterministic seed-based jitter to avoid predictable patterns
 * - Filter tabs from corners and tight arcs
 * - Cut closed paths into open subpaths at tab locations
 * - Tag endpoints with TAB_ENTRY/TAB_EXIT roles
 *
 * All algorithms are deterministic with stable fingerprints for Gate audit.
 */

import type { Path, Segment, SegLine, SegArc, Pt } from '../planTypes.js';
import { segmentStart, segmentEnd } from '../planTypes.js';
import {
  type Vec2,
  EPS_POS,
  dist,
  degToRad,
  normDeg,
  ccwDeltaDeg,
  cwDeltaDeg,
  pointAtAngleDeg,
} from './mathCore.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Tab specification - how to generate tabs.
 */
export interface TabSpec {
  /** Tab length in mm */
  lengthMm: number;
  /** Target number of tabs */
  count: number;
  /** Minimum spacing between tabs (arc-length mm) */
  minSpacingMm: number;
  /** Maximum spacing between tabs (arc-length mm) */
  maxSpacingMm?: number;
  /** Random seed for deterministic jitter */
  seed: number;
  /** Jitter factor (0-1), default 0.1 */
  jitterFactor?: number;
  /** Avoid tabs within this distance from corners (mm) */
  cornerAvoidMm: number;
  /** Avoid tabs on arcs tighter than this radius (mm) */
  minArcRadiusMm: number;
}

/**
 * Travel/machining context.
 */
export interface TravelContext {
  /** Tool is in contact (cutting vs rapid) */
  inCut: boolean;
  /** Tab is raised (tool lifts over tab) */
  tabRaised: boolean;
}

/**
 * Arc-length index for efficient parameterization.
 */
export interface ArcLenIndex {
  /** Cumulative arc-length at start of each segment */
  cumulative: number[];
  /** Length of each segment */
  segLens: number[];
  /** Total path length */
  totalLen: number;
}

/**
 * Location on a path (segment index + parameter t).
 */
export interface Loc {
  /** Segment index */
  segIdx: number;
  /** Parameter t in [0, 1] along segment */
  t: number;
}

/**
 * Arc-length interval for tab placement.
 */
export interface Interval {
  /** Start arc-length (mm) */
  startArcLen: number;
  /** End arc-length (mm) */
  endArcLen: number;
}

/**
 * Tab window - where a tab is placed.
 */
export interface TabWindow extends Interval {
  /** Unique tab ID */
  id: string;
  /** Start location on path */
  startLoc: Loc;
  /** End location on path */
  endLoc: Loc;
  /** Whether tab was filtered out */
  filtered: boolean;
  /** Filter reason if filtered */
  filterReason?: string;
}

/**
 * Endpoint role for open subpaths.
 */
export type EndpointRole = 'TAB_ENTRY' | 'TAB_EXIT' | 'PATH_START' | 'PATH_END';

/**
 * Open subpath - continuous segment of cutting between tabs.
 */
export interface OpenSubpath {
  /** Subpath ID */
  id: string;
  /** Segments in this subpath */
  segs: Segment[];
  /** Index of first segment in original path */
  startSegIdx: number;
  /** Index of last segment in original path */
  endSegIdx: number;
  /** Arc-length range this subpath covers */
  arcLenRange: Interval;
}

/**
 * Extended open subpath with endpoint tags.
 */
export interface OpenSubpathEx extends OpenSubpath {
  /** Role of start endpoint */
  startRole: EndpointRole;
  /** Role of end endpoint */
  endRole: EndpointRole;
  /** Tab window at start (if TAB_EXIT) */
  tabAtStart?: TabWindow;
  /** Tab window at end (if TAB_ENTRY) */
  tabAtEnd?: TabWindow;
}

/**
 * Report item for tab generation.
 */
export interface TabReportItem {
  /** Issue code */
  code: string;
  /** Human-readable detail */
  detail: string;
  /** Stable fingerprint */
  fingerprint: string;
  /** Severity level */
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

/**
 * Complete result of tab generation.
 */
export interface TabsResult {
  /** All proposed tab windows (including filtered) */
  allTabs: TabWindow[];
  /** Active tabs (not filtered) */
  activeTabs: TabWindow[];
  /** Open subpaths with endpoint tags */
  subpaths: OpenSubpathEx[];
  /** Arc-length index */
  arcLenIndex: ArcLenIndex;
  /** Processing report */
  report: TabReportItem[];
  /** Whether result is valid */
  valid: boolean;
}

/**
 * Configuration for tab generation.
 */
export interface TabsConfig {
  /** Tab specification */
  spec: TabSpec;
  /** Loop ID for fingerprinting */
  loopId: string;
  /** Whether to skip filtering (for testing) */
  skipFiltering?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_JITTER_FACTOR = 0.1;
const DEFAULT_TAB_LENGTH_MM = 5;
const DEFAULT_CORNER_AVOID_MM = 10;
const DEFAULT_MIN_ARC_RADIUS_MM = 5;
const MIN_SUBPATH_LENGTH_MM = 1;

// ============================================================================
// Segment Length Calculation
// ============================================================================

/**
 * Get arc sweep total in degrees.
 */
function arcSweepTotalDeg(arc: SegArc): number {
  const s = normDeg(arc.startDeg);
  const e = normDeg(arc.endDeg);
  return arc.cw ? cwDeltaDeg(s, e) : ccwDeltaDeg(s, e);
}

/**
 * Calculate length of a segment.
 */
export function segLength(seg: Segment): number {
  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return dist(line.a, line.b);
  }

  const arc = seg as SegArc;
  const sweep = arcSweepTotalDeg(arc);
  return (sweep * Math.PI * arc.r) / 180;
}

// ============================================================================
// Arc-Length Parameterization
// ============================================================================

/**
 * Build arc-length index for a path.
 *
 * Creates cumulative length array for O(1) arc-length lookups.
 */
export function buildArcLenIndex(path: Path): ArcLenIndex {
  const segLens: number[] = [];
  const cumulative: number[] = [0];
  let total = 0;

  for (const seg of path.segs) {
    const len = segLength(seg);
    segLens.push(len);
    total += len;
    cumulative.push(total);
  }

  return {
    cumulative,
    segLens,
    totalLen: total,
  };
}

/**
 * Find location on path for given arc-length.
 *
 * Uses binary search for efficiency.
 */
export function locateByArcLen(arcLen: number, index: ArcLenIndex): Loc {
  // Clamp to valid range
  const s = Math.max(0, Math.min(arcLen, index.totalLen - EPS_POS));

  // Binary search for segment
  let lo = 0;
  let hi = index.cumulative.length - 2;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (index.cumulative[mid] <= s) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const segIdx = lo;
  const segLen = index.segLens[segIdx];

  // Parameter t within segment
  let t = 0;
  if (segLen > EPS_POS) {
    t = (s - index.cumulative[segIdx]) / segLen;
    t = Math.max(0, Math.min(1, t));
  }

  return { segIdx, t };
}

/**
 * Get arc-length at location.
 */
export function arcLenAtLoc(loc: Loc, index: ArcLenIndex): number {
  return index.cumulative[loc.segIdx] + loc.t * index.segLens[loc.segIdx];
}

// ============================================================================
// Deterministic Jitter
// ============================================================================

/**
 * Generate deterministic pseudo-random value in [0, 1] from seed.
 *
 * Uses simple xorshift for reproducibility.
 */
export function jitter01(seed: number, idx: number): number {
  // Combine seed and index
  let x = (seed * 2654435761 + idx * 1597334677) >>> 0;

  // xorshift
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;

  return (x >>> 0) / 0xffffffff;
}

// ============================================================================
// Tab Window Proposal
// ============================================================================

/**
 * Propose tab windows based on spec.
 *
 * Algorithm:
 * 1. Compute ideal spacing from path length and count
 * 2. Apply deterministic jitter to avoid patterns
 * 3. Create tab window for each position
 */
export function proposeTabWindows(
  index: ArcLenIndex,
  spec: TabSpec,
  loopId: string
): TabWindow[] {
  const tabs: TabWindow[] = [];
  const { count, lengthMm, seed, jitterFactor = DEFAULT_JITTER_FACTOR } = spec;

  if (count <= 0 || index.totalLen < lengthMm) {
    return tabs;
  }

  // Ideal spacing
  const idealSpacing = index.totalLen / count;
  const halfTab = lengthMm / 2;

  for (let i = 0; i < count; i++) {
    // Base position (center of tab)
    const basePos = (i + 0.5) * idealSpacing;

    // Add jitter
    const jitterRange = idealSpacing * jitterFactor;
    const jitterValue = (jitter01(seed, i) - 0.5) * 2 * jitterRange;
    const centerPos = basePos + jitterValue;

    // Tab interval
    let startArcLen = centerPos - halfTab;
    let endArcLen = centerPos + halfTab;

    // Wrap around for closed paths
    if (startArcLen < 0) {
      startArcLen += index.totalLen;
    }
    if (endArcLen > index.totalLen) {
      endArcLen -= index.totalLen;
    }

    // Ensure valid interval
    startArcLen = Math.max(0, Math.min(index.totalLen, startArcLen));
    endArcLen = Math.max(0, Math.min(index.totalLen, endArcLen));

    tabs.push({
      id: `${loopId}:TAB${i}`,
      startArcLen,
      endArcLen,
      startLoc: locateByArcLen(startArcLen, index),
      endLoc: locateByArcLen(endArcLen, index),
      filtered: false,
    });
  }

  return tabs;
}

// ============================================================================
// Tab Filtering
// ============================================================================

/**
 * Check if location is near a corner (segment boundary).
 */
function isNearCorner(
  loc: Loc,
  index: ArcLenIndex,
  cornerAvoidMm: number
): boolean {
  const segLen = index.segLens[loc.segIdx];

  // Distance from segment start
  const distFromStart = loc.t * segLen;
  // Distance from segment end
  const distFromEnd = (1 - loc.t) * segLen;

  return distFromStart < cornerAvoidMm || distFromEnd < cornerAvoidMm;
}

/**
 * Check if location is on a tight arc.
 */
function isOnTightArc(
  loc: Loc,
  path: Path,
  minArcRadiusMm: number
): boolean {
  const seg = path.segs[loc.segIdx];

  if (seg.kind === 'ARC') {
    const arc = seg as SegArc;
    return arc.r < minArcRadiusMm;
  }

  return false;
}

/**
 * Filter tab windows to avoid corners and tight arcs.
 */
export function filterTabWindows(
  tabs: TabWindow[],
  path: Path,
  index: ArcLenIndex,
  spec: TabSpec
): TabWindow[] {
  const { cornerAvoidMm, minArcRadiusMm } = spec;

  return tabs.map((tab) => {
    // Check start location
    if (isNearCorner(tab.startLoc, index, cornerAvoidMm)) {
      return {
        ...tab,
        filtered: true,
        filterReason: `Start near corner (within ${cornerAvoidMm}mm)`,
      };
    }

    if (isNearCorner(tab.endLoc, index, cornerAvoidMm)) {
      return {
        ...tab,
        filtered: true,
        filterReason: `End near corner (within ${cornerAvoidMm}mm)`,
      };
    }

    // Check tight arc
    if (isOnTightArc(tab.startLoc, path, minArcRadiusMm)) {
      return {
        ...tab,
        filtered: true,
        filterReason: `Start on tight arc (r < ${minArcRadiusMm}mm)`,
      };
    }

    if (isOnTightArc(tab.endLoc, path, minArcRadiusMm)) {
      return {
        ...tab,
        filtered: true,
        filterReason: `End on tight arc (r < ${minArcRadiusMm}mm)`,
      };
    }

    return tab;
  });
}

// ============================================================================
// Segment Splitting
// ============================================================================

/**
 * Get point at parameter t on a line segment.
 */
function pointOnLine(line: SegLine, t: number): Pt {
  return {
    x: line.a.x + t * (line.b.x - line.a.x),
    y: line.a.y + t * (line.b.y - line.a.y),
  };
}

/**
 * Get angle at parameter t on an arc segment.
 */
function angleAtArcParam(arc: SegArc, t: number): number {
  const sweep = arcSweepTotalDeg(arc);
  const s = normDeg(arc.startDeg);
  return arc.cw ? normDeg(s - sweep * t) : normDeg(s + sweep * t);
}

/**
 * Get point at parameter t on an arc segment.
 */
function pointOnArc(arc: SegArc, t: number): Pt {
  const ang = angleAtArcParam(arc, t);
  return pointAtAngleDeg(arc.c, arc.r, ang);
}

/**
 * Get point at parameter t on a segment.
 */
function pointOnSegment(seg: Segment, t: number): Pt {
  if (seg.kind === 'LINE') {
    return pointOnLine(seg as SegLine, t);
  }
  return pointOnArc(seg as SegArc, t);
}

/**
 * Split a line segment at parameter t.
 */
function splitLineAt(line: SegLine, t: number): [SegLine, SegLine] {
  const mid = pointOnLine(line, t);

  return [
    { kind: 'LINE', a: line.a, b: mid },
    { kind: 'LINE', a: mid, b: line.b },
  ];
}

/**
 * Split an arc segment at parameter t.
 */
function splitArcAt(arc: SegArc, t: number): [SegArc, SegArc] {
  const midAngle = angleAtArcParam(arc, t);
  const midPt = pointAtAngleDeg(arc.c, arc.r, midAngle);

  return [
    {
      kind: 'ARC',
      c: arc.c,
      r: arc.r,
      startDeg: arc.startDeg,
      endDeg: midAngle,
      cw: arc.cw,
      start: arc.start,
      end: midPt,
    },
    {
      kind: 'ARC',
      c: arc.c,
      r: arc.r,
      startDeg: midAngle,
      endDeg: arc.endDeg,
      cw: arc.cw,
      start: midPt,
      end: arc.end,
    },
  ];
}

/**
 * Split a segment at parameter t.
 */
function splitSegmentAt(seg: Segment, t: number): [Segment, Segment] {
  if (seg.kind === 'LINE') {
    return splitLineAt(seg as SegLine, t);
  }
  return splitArcAt(seg as SegArc, t);
}

// ============================================================================
// Path Cutting
// ============================================================================

/**
 * Cut point on path (segment index + parameter).
 */
interface CutPoint {
  loc: Loc;
  arcLen: number;
  tabId: string | null; // null for start/end of unfiltered regions
  role: 'TAB_START' | 'TAB_END';
}

/**
 * Sort cut points by arc-length.
 */
function sortCutPoints(cuts: CutPoint[]): CutPoint[] {
  return cuts.slice().sort((a, b) => a.arcLen - b.arcLen);
}

/**
 * Cut closed path into open subpaths at tab locations.
 *
 * Algorithm:
 * 1. Collect all cut points (tab starts and ends)
 * 2. Sort by arc-length
 * 3. Split path at each cut point
 * 4. Create subpaths between cuts
 */
export function cutClosedPathIntoOpenSubpaths(
  path: Path,
  tabs: TabWindow[],
  index: ArcLenIndex,
  loopId: string
): OpenSubpath[] {
  // Only active tabs
  const activeTabs = tabs.filter((t) => !t.filtered);

  if (activeTabs.length === 0) {
    // No tabs - return single open path (path start to end)
    return [{
      id: `${loopId}:SUB0`,
      segs: path.segs.slice(),
      startSegIdx: 0,
      endSegIdx: path.segs.length - 1,
      arcLenRange: { startArcLen: 0, endArcLen: index.totalLen },
    }];
  }

  // Collect cut points
  const cuts: CutPoint[] = [];
  for (const tab of activeTabs) {
    cuts.push({
      loc: tab.startLoc,
      arcLen: tab.startArcLen,
      tabId: tab.id,
      role: 'TAB_START',
    });
    cuts.push({
      loc: tab.endLoc,
      arcLen: tab.endArcLen,
      tabId: tab.id,
      role: 'TAB_END',
    });
  }

  // Sort by arc-length
  const sortedCuts = sortCutPoints(cuts);

  // Build subpaths
  const subpaths: OpenSubpath[] = [];
  let subpathId = 0;

  for (let i = 0; i < sortedCuts.length; i++) {
    const cut = sortedCuts[i];
    const nextCut = sortedCuts[(i + 1) % sortedCuts.length];

    // Skip if this is a TAB_START (entering tab region)
    if (cut.role === 'TAB_START') {
      continue;
    }

    // This is TAB_END - start of cutting region
    // Next is either TAB_START or wrap-around

    // Calculate arc-length range
    let startArcLen = cut.arcLen;
    let endArcLen = nextCut.arcLen;

    // Handle wrap-around
    if (endArcLen <= startArcLen && nextCut !== sortedCuts[0]) {
      endArcLen += index.totalLen;
    }

    // Skip very short subpaths
    const subpathLen = endArcLen - startArcLen;
    if (subpathLen < MIN_SUBPATH_LENGTH_MM) {
      continue;
    }

    // Extract segments for this subpath
    const segs = extractSegmentRange(path, cut.loc, nextCut.loc, index);

    if (segs.length > 0) {
      subpaths.push({
        id: `${loopId}:SUB${subpathId++}`,
        segs,
        startSegIdx: cut.loc.segIdx,
        endSegIdx: nextCut.loc.segIdx,
        arcLenRange: {
          startArcLen: cut.arcLen,
          endArcLen: nextCut.arcLen,
        },
      });
    }
  }

  return subpaths;
}

/**
 * Extract segment range from path between two locations.
 */
function extractSegmentRange(
  path: Path,
  startLoc: Loc,
  endLoc: Loc,
  index: ArcLenIndex
): Segment[] {
  const segs: Segment[] = [];
  const n = path.segs.length;

  // Same segment
  if (startLoc.segIdx === endLoc.segIdx && startLoc.t < endLoc.t) {
    const seg = path.segs[startLoc.segIdx];
    segs.push(extractSubsegment(seg, startLoc.t, endLoc.t));
    return segs;
  }

  // First partial segment
  if (startLoc.t < 1 - EPS_POS) {
    const seg = path.segs[startLoc.segIdx];
    segs.push(extractSubsegment(seg, startLoc.t, 1));
  }

  // Full middle segments
  let idx = (startLoc.segIdx + 1) % n;
  while (idx !== endLoc.segIdx) {
    segs.push(path.segs[idx]);
    idx = (idx + 1) % n;

    // Safety: prevent infinite loop
    if (segs.length > n) break;
  }

  // Last partial segment
  if (endLoc.t > EPS_POS) {
    const seg = path.segs[endLoc.segIdx];
    segs.push(extractSubsegment(seg, 0, endLoc.t));
  }

  return segs;
}

/**
 * Extract subsegment from t0 to t1.
 */
function extractSubsegment(seg: Segment, t0: number, t1: number): Segment {
  if (t0 <= EPS_POS && t1 >= 1 - EPS_POS) {
    return seg;
  }

  if (seg.kind === 'LINE') {
    const line = seg as SegLine;
    return {
      kind: 'LINE',
      a: pointOnLine(line, t0),
      b: pointOnLine(line, t1),
    };
  }

  const arc = seg as SegArc;
  const startAngle = angleAtArcParam(arc, t0);
  const endAngle = angleAtArcParam(arc, t1);

  return {
    kind: 'ARC',
    c: arc.c,
    r: arc.r,
    startDeg: startAngle,
    endDeg: endAngle,
    cw: arc.cw,
    start: pointOnArc(arc, t0),
    end: pointOnArc(arc, t1),
  };
}

// ============================================================================
// Endpoint Tagging
// ============================================================================

/**
 * Tag subpath endpoints with roles.
 *
 * - TAB_ENTRY: entering a tab (tool will lift)
 * - TAB_EXIT: exiting a tab (tool plunges back)
 */
export function tagTabEndpoints(
  subpaths: OpenSubpath[],
  tabs: TabWindow[],
  index: ArcLenIndex
): OpenSubpathEx[] {
  const activeTabs = tabs.filter((t) => !t.filtered);

  return subpaths.map((sp, idx) => {
    // Find tab at start (this subpath exits a tab)
    const tabAtStart = activeTabs.find((t) =>
      Math.abs(t.endArcLen - sp.arcLenRange.startArcLen) < EPS_POS
    );

    // Find tab at end (this subpath enters a tab)
    const tabAtEnd = activeTabs.find((t) =>
      Math.abs(t.startArcLen - sp.arcLenRange.endArcLen) < EPS_POS
    );

    const startRole: EndpointRole = tabAtStart ? 'TAB_EXIT' : 'PATH_START';
    const endRole: EndpointRole = tabAtEnd ? 'TAB_ENTRY' : 'PATH_END';

    return {
      ...sp,
      startRole,
      endRole,
      tabAtStart,
      tabAtEnd,
    };
  });
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Build direction-aware tabs for a closed path.
 *
 * Complete pipeline:
 * 1. Build arc-length index
 * 2. Propose tab windows with jitter
 * 3. Filter tabs from corners and tight arcs
 * 4. Cut path into open subpaths
 * 5. Tag endpoints with roles
 *
 * @param path - Closed path to add tabs to
 * @param config - Tab configuration
 * @returns Complete tabs result
 */
export function buildDirectionAwareTabs(
  path: Path,
  config: TabsConfig
): TabsResult {
  const { spec, loopId, skipFiltering } = config;
  const report: TabReportItem[] = [];
  let valid = true;

  // Step 1: Build arc-length index
  const arcLenIndex = buildArcLenIndex(path);

  report.push({
    code: 'ARC_LEN_INDEX_BUILT',
    detail: `Path length: ${arcLenIndex.totalLen.toFixed(2)}mm, ${path.segs.length} segment(s)`,
    fingerprint: `10.6.5:INDEX:${loopId}:${arcLenIndex.totalLen.toFixed(1)}`,
    severity: 'INFO',
  });

  // Validate minimum length for tabs
  const minLengthForTabs = spec.count * (spec.lengthMm + spec.minSpacingMm);
  if (arcLenIndex.totalLen < minLengthForTabs) {
    report.push({
      code: 'PATH_TOO_SHORT_FOR_TABS',
      detail: `Path ${arcLenIndex.totalLen.toFixed(1)}mm < ${minLengthForTabs.toFixed(1)}mm needed for ${spec.count} tab(s)`,
      fingerprint: `10.6.5:SHORT:${loopId}`,
      severity: 'WARN',
    });
  }

  // Step 2: Propose tab windows
  let allTabs = proposeTabWindows(arcLenIndex, spec, loopId);

  report.push({
    code: 'TABS_PROPOSED',
    detail: `Proposed ${allTabs.length} tab(s)`,
    fingerprint: `10.6.5:PROPOSE:${loopId}:${allTabs.length}`,
    severity: 'INFO',
  });

  // Step 3: Filter tabs
  if (!skipFiltering) {
    allTabs = filterTabWindows(allTabs, path, arcLenIndex, spec);
  }

  const activeTabs = allTabs.filter((t) => !t.filtered);
  const filteredTabs = allTabs.filter((t) => t.filtered);

  if (filteredTabs.length > 0) {
    report.push({
      code: 'TABS_FILTERED',
      detail: `Filtered ${filteredTabs.length} tab(s): ${filteredTabs.map((t) => t.filterReason).join('; ')}`,
      fingerprint: `10.6.5:FILTER:${loopId}:${filteredTabs.length}`,
      severity: 'INFO',
    });
  }

  // Warn if too few tabs remain
  if (activeTabs.length === 0 && spec.count > 0) {
    report.push({
      code: 'NO_ACTIVE_TABS',
      detail: 'All tabs were filtered out; part may not be held during cutting',
      fingerprint: `10.6.5:NO_TABS:${loopId}`,
      severity: 'WARN',
    });
  }

  // Step 4: Cut path into open subpaths
  const subpaths = cutClosedPathIntoOpenSubpaths(path, allTabs, arcLenIndex, loopId);

  report.push({
    code: 'SUBPATHS_CREATED',
    detail: `Created ${subpaths.length} open subpath(s) from ${activeTabs.length} active tab(s)`,
    fingerprint: `10.6.5:SUBPATHS:${loopId}:${subpaths.length}`,
    severity: 'INFO',
  });

  // Step 5: Tag endpoints
  const taggedSubpaths = tagTabEndpoints(subpaths, allTabs, arcLenIndex);

  // Summary
  report.push({
    code: 'TABS_COMPLETE',
    detail: `Tabs complete: ${activeTabs.length} active, ${filteredTabs.length} filtered, ${taggedSubpaths.length} subpath(s)`,
    fingerprint: `10.6.5:COMPLETE:${loopId}:${activeTabs.length}:${taggedSubpaths.length}`,
    severity: 'INFO',
  });

  return {
    allTabs,
    activeTabs,
    subpaths: taggedSubpaths,
    arcLenIndex,
    report,
    valid,
  };
}

// ============================================================================
// Safety Checks
// ============================================================================

/**
 * Safety check for tab generation.
 *
 * Checks:
 * - Minimum tab count for part size
 * - Maximum spacing between tabs
 * - Tab placement stability
 */
export function tabsSafetyCheck(
  result: TabsResult,
  partAreaMm2: number,
  _loopId: string
): { severity: 'OK' | 'WARN' | 'BLOCK'; issues: TabReportItem[] } {
  const issues: TabReportItem[] = [];

  // Check minimum tabs for part size
  const minTabsForArea = Math.ceil(Math.sqrt(partAreaMm2) / 200); // Rough heuristic
  if (result.activeTabs.length < minTabsForArea && partAreaMm2 > 10000) {
    issues.push({
      code: 'INSUFFICIENT_TABS',
      detail: `${result.activeTabs.length} tab(s) may be insufficient for part area ${partAreaMm2.toFixed(0)}mm²`,
      fingerprint: `10.6.5:INSUFF:${result.activeTabs.length}:${partAreaMm2.toFixed(0)}`,
      severity: 'WARN',
    });
  }

  // Check maximum spacing
  if (result.subpaths.length > 0) {
    const maxSubpathLen = Math.max(
      ...result.subpaths.map((sp) =>
        Math.abs(sp.arcLenRange.endArcLen - sp.arcLenRange.startArcLen)
      )
    );

    if (maxSubpathLen > 500) {
      issues.push({
        code: 'LARGE_TAB_SPACING',
        detail: `Maximum distance between tabs ${maxSubpathLen.toFixed(0)}mm exceeds 500mm; part may shift`,
        fingerprint: `10.6.5:SPACING:${maxSubpathLen.toFixed(0)}`,
        severity: 'WARN',
      });
    }
  }

  const hasBlock = issues.some((i) => i.severity === 'BLOCK');
  const hasWarn = issues.some((i) => i.severity === 'WARN');

  return {
    severity: hasBlock ? 'BLOCK' : hasWarn ? 'WARN' : 'OK',
    issues,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create default tab spec for typical cabinet parts.
 */
export function defaultTabSpec(count: number = 4, seed: number = 12345): TabSpec {
  return {
    lengthMm: DEFAULT_TAB_LENGTH_MM,
    count,
    minSpacingMm: 50,
    maxSpacingMm: 300,
    seed,
    jitterFactor: DEFAULT_JITTER_FACTOR,
    cornerAvoidMm: DEFAULT_CORNER_AVOID_MM,
    minArcRadiusMm: DEFAULT_MIN_ARC_RADIUS_MM,
  };
}

/**
 * Get all blocking issues from tabs result.
 */
export function getTabsBlockingIssues(result: TabsResult): TabReportItem[] {
  return result.report.filter((r) => r.severity === 'BLOCK');
}

/**
 * Check if tabs result is valid for machining.
 */
export function isTabsResultValid(result: TabsResult): boolean {
  return result.valid && getTabsBlockingIssues(result).length === 0;
}

/**
 * Get fingerprints of all tab issues.
 */
export function getTabsFingerprints(result: TabsResult): string[] {
  return result.report.map((r) => r.fingerprint);
}
