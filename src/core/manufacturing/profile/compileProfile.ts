// src/core/manufacturing/profile/compileProfile.ts
/**
 * Profile Compilation Pipeline.
 *
 * Wires together the direction policy (10.6.4) and tabs (10.6.5)
 * to produce final cut operations.
 *
 * Pipeline:
 * 1. Apply direction policy → determine climb/conventional
 * 2. Reverse path if needed → update winding
 * 3. Place tabs → determine gap positions
 * 4. Remap tabs if path was reversed → preserve physical positions
 * 5. Build open cut spans → segments between tabs
 * 6. Return compiled profile with all metadata
 *
 * Key rule: Direction is applied FIRST, then tabs are placed on
 * the direction-resolved path. This ensures tab positions are
 * correct relative to the final cutting direction.
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

import {
  CutContext,
  CutDirectionPolicy,
  DirectionDecision,
  MaterialTag,
  ToolClass,
  CutSide,
  ToolPath,
} from "../../cutDirection/cutDirectionTypes";
import {
  defaultCutDirectionPolicy,
} from "../../cutDirection/cutDirectionPolicy";
import {
  detectWinding,
  ensureWinding,
  remapTabsForReversedPath,
  RemappableTabsOnPath,
} from "../../cutDirection/pathReverse";
import {
  TabPolicy,
  TabsOnPath,
  TabPlacementRequest,
  CutSpan,
  TabCutPlanResult,
  TabIssue,
  DEFAULT_TAB_POLICY,
  PathSegment,
} from "../toolpath/tabs/tabTypes";
import { Path, buildParam } from "../toolpath/tabs/pathParam";
import { autoPlaceTabs, AutoPlaceTabsRequest } from "../toolpath/tabs/tabPlacement";
import { buildOpenCutSpans } from "../toolpath/tabs/tabCutPlannerOpen";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input for profile compilation.
 */
export interface ProfileCompileInput {
  /** Unique identifier for this profile */
  profileId: string;

  /** Path to compile (may be closed contour or open path) */
  path: Path;

  /** Material being cut */
  material: MaterialTag;

  /** Tool being used */
  tool: ToolClass;

  /** Cut side (outside = part stays, inside = cutout) */
  side: CutSide;

  /** Whether to use tabs */
  useTabs: boolean;

  /** Number of tabs (if useTabs) */
  tabCount?: number;

  /** Tab width in mm (if useTabs) */
  tabWidthMm?: number;

  /** Custom tab policy (optional) */
  tabPolicy?: Partial<TabPolicy>;

  /** User-defined tab intervals (optional, merged with auto) */
  userTabIntervals?: Array<{ s0: number; s1: number }>;

  /** Custom direction policy (optional) */
  directionPolicy?: CutDirectionPolicy;

  /** Laminate face orientation */
  laminateFace?: "TOP" | "BOTTOM" | "BOTH" | "NONE";
}

/**
 * Compiled profile result.
 */
export interface CompiledProfile {
  /** Profile identifier */
  profileId: string;

  /** Final path (after direction applied) */
  finalPath: Path;

  /** Cut spans (if tabs used, otherwise single span) */
  spans: CutSpan[];

  /** Direction decision applied */
  direction: DirectionDecision;

  /** Whether path was reversed */
  wasReversed: boolean;

  /** Tab information (if tabs used) */
  tabs: TabsOnPath | null;

  /** Tab cut plan result (if tabs used) */
  tabPlan: TabCutPlanResult | null;

  /** Total cut length */
  totalCutLength: number;

  /** Total gap length (tabs) */
  totalGapLength: number;

  /** Number of transitions between spans */
  transitionCount: number;

  /** Compilation issues */
  issues: CompileIssue[];

  /** Audit metadata */
  audit: ProfileAudit;
}

/**
 * Compilation issue.
 */
export interface CompileIssue {
  code: string;
  severity: "BLOCK" | "WARN" | "INFO";
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Audit metadata for traceability.
 */
export interface ProfileAudit {
  /** Direction policy used */
  directionPolicy: string;

  /** Direction decision reason */
  directionReason: string;

  /** Original path winding */
  originalWinding: "CW" | "CCW";

  /** Final path winding */
  finalWinding: "CW" | "CCW";

  /** Tab policy used (if any) */
  tabPolicy: TabPolicy | null;

  /** Tab placement method */
  tabPlacement: "AUTO" | "USER" | "MIXED" | "NONE";

  /** Total path length */
  pathLength: number;

  /** Compilation timestamp */
  timestamp: string;
}

// =============================================================================
// COMPILATION
// =============================================================================

/**
 * Compile a profile path with direction and tabs.
 *
 * This is the main entry point for profile compilation.
 *
 * @param input Profile compilation input
 * @returns Compiled profile with spans and metadata
 */
export function compileProfile(input: ProfileCompileInput): CompiledProfile {
  const issues: CompileIssue[] = [];
  const policy = input.directionPolicy ?? defaultCutDirectionPolicy;

  // Build cut context
  const ctx: CutContext = {
    material: input.material,
    tool: input.tool,
    op: "PROFILE",
    side: input.side,
    pass: "FINISH",
    laminateFace: input.laminateFace,
  };

  // Step 1: Get direction decision
  const direction = policy.decide(ctx);

  // Collect direction warnings
  if (direction.warnings) {
    for (const w of direction.warnings) {
      issues.push({
        code: "DIRECTION_WARNING",
        severity: "WARN",
        message: w,
      });
    }
  }

  // Step 2: Detect original winding and apply direction
  const originalWinding = detectWindingFromPath(input.path);
  const needsReverse = originalWinding !== direction.pathWinding;

  let finalPath: Path;
  let wasReversed = false;

  if (needsReverse) {
    finalPath = reversePathGeometry(input.path);
    wasReversed = true;
  } else {
    finalPath = input.path;
  }

  const finalWinding = direction.pathWinding;

  // Calculate path length
  const param = buildParam(finalPath);
  const pathLength = param.totalLen;

  // Step 3: Handle tabs
  let tabs: TabsOnPath | null = null;
  let tabPlan: TabCutPlanResult | null = null;
  let spans: CutSpan[] = [];
  let totalCutLength = pathLength;
  let totalGapLength = 0;
  let transitionCount = 0;
  let tabPlacement: "AUTO" | "USER" | "MIXED" | "NONE" = "NONE";

  if (input.useTabs && input.tabCount && input.tabCount > 0) {
    // Build tab policy
    const tabPolicy: TabPolicy = {
      ...DEFAULT_TAB_POLICY,
      ...input.tabPolicy,
    };

    // Prepare user intervals if any
    const userIntervals = input.userTabIntervals?.map((iv) => ({
      s0: iv.s0,
      s1: iv.s1,
      reason: "USER" as const,
    }));

    // If path was reversed, remap user intervals
    let finalUserIntervals = userIntervals;
    if (wasReversed && userIntervals && userIntervals.length > 0) {
      const tempTabs: RemappableTabsOnPath = {
        pathId: input.profileId,
        totalLen: pathLength,
        intervals: userIntervals,
      };
      const remapped = remapTabsForReversedPath(tempTabs);
      finalUserIntervals = remapped.intervals.map((iv) => ({
        s0: iv.s0,
        s1: iv.s1,
        reason: iv.reason as "USER",
      }));
    }

    // Place tabs
    const tabRequest: AutoPlaceTabsRequest = {
      pathId: input.profileId,
      path: finalPath,
      tabCount: input.tabCount,
      tabWidthMm: input.tabWidthMm ?? 8.0,
      policy: tabPolicy,
      userIntervals: finalUserIntervals,
    };

    tabs = autoPlaceTabs(tabRequest);
    tabs.wasReversed = wasReversed;

    // Determine placement method
    if (finalUserIntervals && finalUserIntervals.length > 0) {
      tabPlacement = tabs.intervals.length > finalUserIntervals.length ? "MIXED" : "USER";
    } else {
      tabPlacement = "AUTO";
    }

    // Build cut spans
    tabPlan = buildOpenCutSpans(finalPath, tabs);

    // Collect tab issues
    for (const issue of tabPlan.issues) {
      issues.push({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        data: issue.data,
      });
    }

    spans = tabPlan.spans;
    totalCutLength = tabPlan.totalCutLength;
    totalGapLength = tabPlan.totalGapLength;
    transitionCount = tabPlan.transitionCount;
  } else {
    // No tabs: single span covering entire path
    spans = [
      {
        spanId: `${input.profileId}_span_1`,
        index: 0,
        sRange: { s0: 0, s1: pathLength },
        length: pathLength,
        startPoint: getPathStartPoint(finalPath),
        endPoint: getPathEndPoint(finalPath),
        segs: finalPath.segs,
      },
    ];
  }

  // Build audit
  const audit: ProfileAudit = {
    directionPolicy: policy.name,
    directionReason: direction.reason,
    originalWinding,
    finalWinding,
    tabPolicy: tabs?.policy ?? null,
    tabPlacement,
    pathLength,
    timestamp: new Date().toISOString(),
  };

  return {
    profileId: input.profileId,
    finalPath,
    spans,
    direction,
    wasReversed,
    tabs,
    tabPlan,
    totalCutLength,
    totalGapLength,
    transitionCount,
    issues,
    audit,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Detect winding direction from path geometry.
 */
function detectWindingFromPath(path: Path): "CW" | "CCW" {
  const toolPath: ToolPath = {
    segs: path.segs,
  };
  return detectWinding(toolPath);
}

/**
 * Reverse path geometry (segments order and segment direction).
 */
function reversePathGeometry(path: Path): Path {
  const reversedSegs: PathSegment[] = [];

  // Reverse order and flip each segment
  for (let i = path.segs.length - 1; i >= 0; i--) {
    const seg = path.segs[i];

    if (seg.kind === "LINE") {
      reversedSegs.push({
        kind: "LINE",
        x1: seg.x2,
        y1: seg.y2,
        x2: seg.x1,
        y2: seg.y1,
      });
    } else {
      reversedSegs.push({
        kind: "ARC",
        cx: seg.cx,
        cy: seg.cy,
        r: seg.r,
        startDeg: seg.endDeg,
        endDeg: seg.startDeg,
        cw: !seg.cw,
      });
    }
  }

  return {
    ...path,
    segs: reversedSegs,
  };
}

/**
 * Get start point of path.
 */
function getPathStartPoint(path: Path): { x: number; y: number } {
  if (path.segs.length === 0) return { x: 0, y: 0 };

  const seg = path.segs[0];
  if (seg.kind === "LINE") {
    return { x: seg.x1, y: seg.y1 };
  }

  const a = seg.startDeg * (Math.PI / 180);
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
  };
}

/**
 * Get end point of path.
 */
function getPathEndPoint(path: Path): { x: number; y: number } {
  if (path.segs.length === 0) return { x: 0, y: 0 };

  const seg = path.segs[path.segs.length - 1];
  if (seg.kind === "LINE") {
    return { x: seg.x2, y: seg.y2 };
  }

  const a = seg.endDeg * (Math.PI / 180);
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Check if a compiled profile is valid for execution.
 */
export function isProfileValid(profile: CompiledProfile): boolean {
  const blockingIssues = profile.issues.filter((i) => i.severity === "BLOCK");
  return blockingIssues.length === 0 && profile.spans.length > 0;
}

/**
 * Get blocking issues from a compiled profile.
 */
export function getBlockingIssues(profile: CompiledProfile): CompileIssue[] {
  return profile.issues.filter((i) => i.severity === "BLOCK");
}

// =============================================================================
// CONVENIENCE
// =============================================================================

/**
 * Compile an outside profile cut (part stays, scrap removed).
 */
export function compileOutsideProfile(
  profileId: string,
  path: Path,
  material: MaterialTag,
  tool: ToolClass,
  tabCount: number = 4,
  tabWidthMm: number = 8.0
): CompiledProfile {
  return compileProfile({
    profileId,
    path,
    material,
    tool,
    side: "OUTSIDE",
    useTabs: tabCount > 0,
    tabCount,
    tabWidthMm,
  });
}

/**
 * Compile an inside profile cut (cutout/pocket).
 */
export function compileInsideProfile(
  profileId: string,
  path: Path,
  material: MaterialTag,
  tool: ToolClass,
  tabCount: number = 0 // Inside cuts usually don't need tabs
): CompiledProfile {
  return compileProfile({
    profileId,
    path,
    material,
    tool,
    side: "INSIDE",
    useTabs: tabCount > 0,
    tabCount,
    tabWidthMm: 8.0,
  });
}
