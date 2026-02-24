// src/core/manufacturing/toolpath/tabs/index.ts
/**
 * Direction-aware Tabs Module.
 *
 * Provides tab placement and cut planning for CNC profile cuts.
 *
 * Key concepts:
 * - Tabs specified by arc-length position (not segment index)
 * - Direction-aware: tabs stay at physical position when path reverses
 * - OPEN_SUBPATHS mode: cut spans with gaps, rapid across tabs
 *
 * Usage:
 * ```ts
 * import { autoPlaceTabs, buildOpenCutSpans } from '@/core/manufacturing/toolpath/tabs';
 *
 * const tabs = autoPlaceTabs({
 *   pathId: 'profile_1',
 *   path: myPath,
 *   tabCount: 4,
 *   tabWidthMm: 8,
 *   policy: DEFAULT_TAB_POLICY,
 * });
 *
 * const cutPlan = buildOpenCutSpans(myPath, tabs);
 * ```
 *
 * v0.10.6.5 - Direction-aware Tabs
 */

// Types
export type {
  TabMode,
  TabPolicy,
  TabInterval,
  TabsOnPath,
  TabPlacementRequest,
  CutSpan,
  PathSegment,
  LineSegment,
  ArcSegment,
  TabCutPlanResult,
  TabIssue,
  TabIssueCode,
  SpanTransition,
} from "./tabTypes";

// Constants
export {
  DEFAULT_TAB_POLICY,
  DEFAULT_SPAN_TRANSITION,
} from "./tabTypes";

// Path parameterization
export type {
  Path,
  PathParam,
  SegParam,
} from "./pathParam";

export {
  segLen,
  lineSegLen,
  arcSegLen,
  arcSweepRad,
  buildParam,
  findSegAtS,
  splitLineAtT,
  splitArcAtTheta,
  arcThetaAtS,
  splitSegAtS,
  splitPathAtS,
  splitPathAtMultipleS,
  segStartPoint,
  segEndPoint,
  pointAtS,
  clamp,
  approxEqual,
} from "./pathParam";

// Tab placement
export type {
  AutoPlaceTabsRequest,
} from "./tabPlacement";

export {
  autoPlaceTabs,
  placeTabsDefault,
  validatePlacementRequest,
} from "./tabPlacement";

// Tab cut planner
export {
  buildOpenCutSpans,
  validateTabCutPlan,
  isTabCutPlanValid,
  generateTabCutAudit,
} from "./tabCutPlannerOpen";
