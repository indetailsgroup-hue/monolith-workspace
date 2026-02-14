// src/core/manufacturing/toolpath/tabs/tabTypes.ts
/**
 * Tab Type Definitions for Direction-aware Tabs.
 *
 * Tabs are specified by arc-length position (s) on the path,
 * not segment index. This allows:
 * - Deterministic remap when path is reversed
 * - Precise LINE/ARC splitting (preserves arc geometry)
 * - Position stability across direction policy changes
 *
 * Key concepts:
 * - TabInterval: [s0, s1] range along path length
 * - OPEN_SUBPATHS mode: Cut spans with gaps, rapid across tabs
 * - Direction-aware: Tabs stay at physical position when path reverses
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

// =============================================================================
// TAB MODE
// =============================================================================

/**
 * Tab cutting mode.
 *
 * - OPEN_SUBPATHS: Cut spans with gaps, Z-retract + rapid across tabs (MVP)
 * - BRIDGE: Cut through at reduced depth (future)
 * - DONT_CUT: Skip tab regions entirely (future)
 */
export type TabMode = "OPEN_SUBPATHS" | "BRIDGE" | "DONT_CUT";

// =============================================================================
// TAB POLICY
// =============================================================================

/**
 * Tab policy configuration.
 *
 * Defines how tabs are placed and handled during cutting.
 */
export interface TabPolicy {
  /** Tab cutting mode */
  mode: TabMode;

  /** Tab height remaining after cut (mm) - for BRIDGE mode */
  tabHeightMm: number;

  /** Z height for retract before rapid (mm) - typically safeZ */
  retractZMm: number;

  /** Rapid feed rate (mm/min) - dialect will map to G0/G1 */
  rapidFeed: number;

  /** Minimum distance from corners to place tabs (mm) */
  minCornerClearMm: number;

  /** Avoid zone from path start/end for lead-in/out (mm) */
  avoidLeadInMm: number;

  /** Minimum cut span length (mm) - prevents tiny subpaths */
  minSpanMm: number;

  /** Maximum number of tabs per path */
  maxTabCount?: number;

  /** Target tab spacing (mm) - alternative to tabCount */
  targetSpacingMm?: number;
}

/**
 * Default tab policy for general use.
 */
export const DEFAULT_TAB_POLICY: TabPolicy = {
  mode: "OPEN_SUBPATHS",
  tabHeightMm: 2.0,
  retractZMm: 5.0,
  rapidFeed: 10000,
  minCornerClearMm: 8.0,
  avoidLeadInMm: 20.0,
  minSpanMm: 10.0,
  maxTabCount: 8,
};

// =============================================================================
// TAB INTERVAL
// =============================================================================

/**
 * Tab interval specified by arc-length position.
 *
 * s0, s1 are absolute distances along path from start.
 * Path length L: s ∈ [0, L)
 *
 * When path is reversed (direction policy), intervals remap:
 * [s0, s1] → [L - s1, L - s0]
 */
export interface TabInterval {
  /** Start position along path length [0, L) */
  s0: number;

  /** End position along path length (s1 > s0, no wrap for MVP) */
  s1: number;

  /** Reason for tab placement */
  reason?: "AUTO" | "USER" | "CORNER_AVOID";

  /** Optional segment index hint (for debugging) */
  segHint?: number;
}

// =============================================================================
// TABS ON PATH
// =============================================================================

/**
 * Complete tab specification for a single path.
 */
export interface TabsOnPath {
  /** Path identifier */
  pathId: string;

  /** Total path length (mm) */
  totalLen: number;

  /** Tab intervals (gaps in cutting) */
  intervals: TabInterval[];

  /** Policy used for this path */
  policy: TabPolicy;

  /** Whether path was reversed (for audit) */
  wasReversed?: boolean;

  /** Original intervals before remap (for audit) */
  originalIntervals?: TabInterval[];
}

// =============================================================================
// TAB PLACEMENT REQUEST
// =============================================================================

/**
 * Request for automatic tab placement.
 */
export interface TabPlacementRequest {
  /** Path identifier */
  pathId: string;

  /** Number of tabs to place */
  tabCount: number;

  /** Width of each tab (gap length along perimeter, mm) */
  tabWidthMm: number;

  /** Tab policy configuration */
  policy: TabPolicy;

  /** User-defined intervals (optional, merged with auto) */
  userIntervals?: TabInterval[];
}

// =============================================================================
// CUT SPAN (Output)
// =============================================================================

/**
 * A single cut span (open subpath) after tab processing.
 *
 * The path is open (not closed) and represents a continuous
 * cutting segment between tabs.
 */
export interface CutSpan {
  /** Span identifier (e.g., "span_1", "span_2") */
  spanId: string;

  /** Span index in sequence */
  index: number;

  /** Arc-length range on original path */
  sRange: {
    s0: number;
    s1: number;
  };

  /** Span length (mm) */
  length: number;

  /** Start point (x, y) */
  startPoint: { x: number; y: number };

  /** End point (x, y) */
  endPoint: { x: number; y: number };

  /** Segments for this span (open path) */
  segs: PathSegment[];
}

/**
 * Path segment types (compatible with cutDirectionTypes).
 */
export interface LineSegment {
  kind: "LINE";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArcSegment {
  kind: "ARC";
  cx: number;
  cy: number;
  r: number;
  startDeg: number;
  endDeg: number;
  cw: boolean;
}

export type PathSegment = LineSegment | ArcSegment;

// =============================================================================
// CUT PLAN RESULT
// =============================================================================

/**
 * Result of tab cut planning.
 */
export interface TabCutPlanResult {
  /** Original path ID */
  pathId: string;

  /** Cut spans (open subpaths to execute) */
  spans: CutSpan[];

  /** Total cut length (sum of span lengths) */
  totalCutLength: number;

  /** Total gap length (sum of tab widths) */
  totalGapLength: number;

  /** Number of transitions (retract + rapid + re-entry) */
  transitionCount: number;

  /** Tab intervals used */
  tabs: TabsOnPath;

  /** Validation issues (if any) */
  issues: TabIssue[];
}

/**
 * Tab-related issue for gate/audit.
 */
export interface TabIssue {
  code: TabIssueCode;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Tab issue codes.
 */
export type TabIssueCode =
  | "TAB_GAP_OVERLAPS_LEADIN"
  | "TAB_SPAN_TOO_SHORT"
  | "TAB_COUNT_INVALID"
  | "TAB_INTERVAL_INVALID"
  | "TAB_INTERVAL_OVERLAP"
  | "TAB_CONSUMED_ALL"
  | "TAB_PLACEMENT_FAILED";

// =============================================================================
// SPAN TRANSITION
// =============================================================================

/**
 * Transition strategy between cut spans.
 */
export interface SpanTransition {
  /** Z height to retract to before rapid */
  retractZ: number;

  /** Use rapid move (G0) for XY */
  rapidXY: boolean;

  /** Re-entry strategy at span start */
  plungeStrategy: "RAMP" | "PLUNGE" | "HELIX";

  /** Ramp angle (degrees) for RAMP strategy */
  rampAngleDeg?: number;

  /** Ramp length (mm) for RAMP strategy */
  rampLengthMm?: number;
}

/**
 * Default span transition for general use.
 */
export const DEFAULT_SPAN_TRANSITION: SpanTransition = {
  retractZ: 5.0,
  rapidXY: true,
  plungeStrategy: "PLUNGE",
};
