/**
 * Offset Kernel Module
 *
 * Step 10.5.6: CAM-grade offset calculations with analytic joins.
 * Step 10.5.7: Analytic constraints + arc sweep membership + true ROUND caps.
 * Step 10.5.8: FILLET fallback for tool radius arcs (LINE-LINE, LINE-ARC, ARC-ARC).
 * Step 10.5.9: Self-intersection detection (O(n²) deterministic).
 * Step 10.5.10: Auto-repair offset topology (split, graph, loop extraction).
 * Step 10.6.3: Inside/Outside cut logic (containment, nesting, winding).
 * Step 10.6.4: Climb/Conventional policy engine (material-aware direction).
 * Step 10.6.5: Direction-aware tabs (arc-length parameterization, deterministic jitter).
 * Step 10.6.6: Entry/Exit strategy per material (lead-in/out, micro arcs).
 * Step 10.6.2: Variable offset by tool radius (per-op, pass planning).
 * Step 10.6.7: Multi-tool routing (rough→finish, priority-based sequencing).
 * Step 10.6.9: Tool change planner (minimize swaps, deterministic scheduling).
 * Step 10.6.8: Z-aware path planning (depth schedule, ramp/peck, onion-skin).
 *
 * This module provides:
 * - Basic geometry utilities (vectors, intersections)
 * - Offset primitives (LINE and ARC offset)
 * - Analytic join solver (L-L, L-A, A-L, A-A)
 * - Constrained join solver with arc sweep membership (Step 10.5.7)
 * - FILLET fallback with tool radius arcs (Step 10.5.8)
 * - Self-intersection detection with Gate policy (Step 10.5.9)
 * - Auto-repair topology (split, graph, loop extraction) (Step 10.5.10)
 * - Inside/Outside cut plan with containment graph (Step 10.6.3)
 * - Climb/Conventional direction policy engine (Step 10.6.4)
 * - Direction-aware tabs with arc-length parameterization (Step 10.6.5)
 * - Entry/Exit strategy with material-aware lead-in/out (Step 10.6.6)
 * - Variable offset by tool radius with pass planning (Step 10.6.2)
 * - Multi-tool routing with rough→finish sequencing (Step 10.6.7)
 * - Tool change planner with constraint-aware scheduling (Step 10.6.9)
 * - Z-aware path planning with depth layers and motion IR (Step 10.6.8)
 * - Closed path offset with joins
 * - Open path offset with caps (including true round caps)
 * - Geometry guards (self-intersection, winding validation)
 */

// ============================================================================
// Geometry Utilities
// ============================================================================

export {
  type Pt,
  type Vec,
  type LineIntersectResult,
  type ProjectResult,
  EPS,
  TOLERANCE,
  // Vector operations
  add,
  sub,
  mul,
  dot,
  cross,
  len,
  dist,
  unit,
  perpLeft,
  perpRight,
  negate,
  nearly,
  nearlyPt,
  clamp,
  // Angle operations
  degToRad,
  radToDeg,
  normalizeAngle,
  angle,
  angleBetween,
  // Line operations
  intersectLines,
  intersectSegments,
  projectPointToLine,
  projectPointToSegment,
  // Circle operations
  circleCircleIntersections,
  lineCircleIntersections,
  segmentCircleIntersections,
  // Arc operations
  arcPoint,
  arcSweep,
  angleInArcSweep,
  arcLength,
} from './geom.js';

// ============================================================================
// Offset Primitives
// ============================================================================

export {
  type OffsetMode,
  type CapStyle,
  type Winding,
  type OffsetSegment,
  // Normal calculations
  interiorNormal,
  offsetNormal,
  // Segment offset
  offsetLine,
  offsetArc,
  offsetSegment,
  // Segment accessors
  segStart,
  segEnd,
  setSegStart,
  setSegEnd,
  segDirAtStart,
  segDirAtEnd,
  // Arc utilities
  arcTangentAt,
  // Validation
  wouldCollapseArc,
  maxArcInset,
} from './offsetPrimitives.js';

// ============================================================================
// Join Solver
// ============================================================================

export {
  type JoinResult,
  join,
  joinSegments,
  joinConstrained,
  joinOffsetConstrained,
} from './joinSolver.js';

// ============================================================================
// Closed Path Offset
// ============================================================================

export {
  type OffsetPathResult,
  offsetClosedPath,
  insetClosedPath,
  outsetClosedPath,
  roughingOffset,
  canOffsetWithKernel,
  estimateMaxInset,
  validateOffsetResult,
} from './offsetPath.js';

// ============================================================================
// Open Path Offset
// ============================================================================

export {
  type OffsetOpenResult,
  type OpenCenterlineResult,
  offsetOpenPath,
  finishingOffsetOpen,
  canOffsetOpenPath,
  offsetOpenPaths,
  // Step 10.5.7: Mode A - Open centerline caps (180° loop at endpoint)
  offsetOpenPathCenterline,
  createCenterlineCapArc,
  // Step 10.5.7: Mode B - True round caps (stroke outline)
  offsetOpenPathWithTrueRoundCaps,
  offsetOpenPathsWithTrueRoundCaps,
} from './offsetOpen.js';

// ============================================================================
// Step 10.5.7: Math Core (Stable Tolerances)
// ============================================================================

export {
  type Vec2,
  EPS_POS,
  EPS_ANG,
  EPS_PARAM,
  // Vector operations (mathCore versions)
  add as addVec2,
  sub as subVec2,
  mul as mulVec2,
  dot as dotVec2,
  cross as crossVec2,
  len as lenVec2,
  dist as distVec2,
  norm as normVec2,
  perpLeft as perpLeftVec2,
  perpRight as perpRightVec2,
  negate as negateVec2,
  // Numeric utilities
  almostEq,
  clamp as clampNum,
  clamp01,
  // Angle operations (degrees)
  degToRad as degToRadCore,
  radToDeg as radToDegCore,
  normDeg,
  normDeg180,
  ccwDeltaDeg,
  cwDeltaDeg,
  angleDeg,
  angleOfPointDeg,
  pointAtAngleDeg,
  // Angle operations (radians)
  normRad,
  signedAngleBetween,
  // Stable sorting
  stableSortPoints,
  comparePoints,
} from './mathCore.js';

// ============================================================================
// Step 10.5.7: Arc Sweep Membership
// ============================================================================

export {
  angleOnArcSweepDeg,
  pointOnArcSweep,
  pointOnArcSweepVec,
  arcPointAtDeg,
  arcStartPoint,
  arcEndPoint,
  arcTangentDirAtDeg,
  arcTangentAtStart,
  arcTangentAtEnd,
  arcSweepDeg,
  arcLength as arcLengthSweep,
  arcMidpoint,
  arcMidpointVec,
  arcDistanceToAngle,
  arcParamForPoint,
} from './arcSweep.js';

// ============================================================================
// Step 10.5.7: Forward Extension Constraints
// ============================================================================

export {
  type LineDirLen,
  lineDirLen,
  lineParam,
  lineParamNormalized,
  pointOnLineInfinite,
  pointOnLineSegment,
  forwardOkLine_AEnd,
  forwardOkLine_BStart,
  forwardOkArc_End,
  forwardOkArc_Start,
  forwardOkSegment_AEnd,
  forwardOkSegment_BStart,
  segmentStartPoint,
  segmentEndPoint,
  segmentTangentAtStart,
  segmentTangentAtEnd,
} from './constraints.js';

// ============================================================================
// Step 10.5.7: Constrained Join Solver
// Step 10.5.8: Added FILLET fallback functions
// ============================================================================

export {
  type JoinCandidate,
  type JoinResult as ConstrainedJoinResultType,
  type ConstrainedJoinResult,
  type FilletArc,
  intersectLineLineInfinite,
  intersectLineCircle,
  intersectCircleCircle,
  intersectSegsInfinite,
  solveJoinConstrained,
  solveConstrainedJoin,
  // Step 10.5.8: FILLET fallback functions
  tryFilletLineLine,
  tryFilletLineArc,
  tryFilletArcLine,
  tryFilletArcArc,
} from './joinConstrained.js';

// ============================================================================
// Step 10.5.7: True Round Caps
// ============================================================================

export {
  type RoundCapResult,
  type SegHint,
  type SegEx,
  // Mode A: Open centerline caps
  makeOpenRoundCapArc,
  addOpenCapsCenterline,
  // Mode B: Stroke outline caps
  makeRoundCapArc,
  chooseCapCW,
  offsetOpenPathTrueRoundCaps,
  createStartCapArc,
  createEndCapArc,
  // Path utilities
  pathStartPoint,
  pathEndPoint,
  pathStartTangent,
  pathEndTangent,
  reversePath,
} from './roundCaps.js';

// ============================================================================
// Step 10.5.7: Geometry Guards
// ============================================================================

export {
  type PreflightIssue,
  type GuardResult,
  guardNoSelfIntersect,
  guardWindingConsistent,
  guardNoDegenerateSegments,
  guardNoGaps,
  validatePathGeometry,
  isPathValid,
} from './guards.js';

// ============================================================================
// Step 10.5.9: Self-Intersection Detection
// ============================================================================

export {
  type HitKind,
  type IntersectionHit,
  type PathForIntersect,
  type SelfIntersectResult,
  // Main detector
  detectSelfIntersections,
  // Gate policy helpers
  checkSelfIntersections,
  hasSelfIntersections,
  getSelfIntersectFingerprints,
} from './selfIntersect.js';

// ============================================================================
// Step 10.5.10: Topology Repair
// ============================================================================

export {
  type CutIntent,
  type Winding as RepairWinding,
  type RepairPolicy,
  type SplitPoint,
  type SegmentSplitPlan,
  type SplitPlan,
  type HalfEdge,
  type Vertex,
  type PlanarGraph,
  type Loop,
  type RepairReportItem,
  type RepairResult,
  // Split plan builder
  buildSplitPlanFromHits,
  // Segment splitting
  splitLine,
  splitArc,
  splitPathSegments,
  // Planar graph builder
  buildPlanarGraph,
  // Loop extraction
  extractLoops,
  // Loop selection
  selectLoopsForIntent,
  // Main repair function
  repairOffsetTopology,
  // Convenience functions
  repairForOutsideCut,
  repairForInsideCut,
  needsRepair,
} from './topologyRepair.js';

// ============================================================================
// Step 10.6.3: Inside/Outside Cut Logic
// ============================================================================

export {
  type CutIntent as CutSideIntent,
  type LoopRole,
  type Winding as CutSideWinding,
  type LoopInfo,
  type ContainmentEdge,
  type CutSideReportItem,
  type CutSidePlan,
  type CutSidePlanConfig,
  // Geometry utilities
  flattenPathToPolygon,
  computeBoundingBox,
  computePolygonArea,
  windingFromArea,
  computePolygonCentroid,
  // Point-in-polygon
  pointInPolygon,
  pickInteriorSamplePoint,
  // Path operations
  reversePath as reversePathForCut,
  normalizeLoopWinding,
  // Loop characterization
  characterizeLoop,
  // Main plan builder
  buildCutSidePlan,
  // Convenience functions
  buildOutsideCutPlan,
  buildInsideCutPlan,
  getBlockingIssues,
  isPlanValid,
  getPlanFingerprints,
} from './cutSidePlan.js';

// ============================================================================
// Step 10.6.4: Climb/Conventional Policy Engine
// ============================================================================

export {
  type MaterialKind,
  type ToolKind,
  type CutIntent as DirectionCutIntent,
  type LoopRole as DirectionLoopRole,
  type MillingMode,
  type CutDirectionDecision,
  type DirectionPolicyConfig,
  type DirectionAppliedLoop,
  type DirectionReportItem,
  type DirectionAppliedPlan,
  // Constants
  DEFAULT_DIRECTION_CONFIG,
  REASON_CODES,
  // Core functions
  windingForMilling,
  decideCutDirection,
  // Plan integration
  applyDirectionPolicyToPlan,
  // Safety checks
  directionSafetyChecks,
  // Convenience functions
  decideForHPLCompression,
  decideForMelamineCompression,
  decideForPlywoodDowncut,
  getDirectionBlockingIssues,
  isDirectionPlanValid,
} from './directionPolicy.js';

// ============================================================================
// Step 10.6.5: Direction-aware Tabs
// ============================================================================

export {
  // Types
  type TabSpec,
  type TravelContext,
  type ArcLenIndex,
  type Loc,
  type Interval,
  type TabWindow,
  type EndpointRole,
  type OpenSubpath,
  type OpenSubpathEx,
  type TabReportItem,
  type TabsResult,
  type TabsConfig,
  // Segment utilities
  segLength,
  // Arc-length parameterization
  buildArcLenIndex,
  locateByArcLen,
  arcLenAtLoc,
  // Deterministic jitter
  jitter01,
  // Tab window operations
  proposeTabWindows,
  filterTabWindows,
  // Path cutting
  cutClosedPathIntoOpenSubpaths,
  // Endpoint tagging
  tagTabEndpoints,
  // Main function
  buildDirectionAwareTabs,
  // Safety checks
  tabsSafetyCheck,
  // Convenience functions
  defaultTabSpec,
  getTabsBlockingIssues,
  isTabsResultValid,
  getTabsFingerprints,
} from './directionAwareTabs.js';

// ============================================================================
// Step 10.6.6: Entry/Exit Strategy per Material
// ============================================================================

export {
  // Types
  type EntryExitKind,
  type ZHint,
  type EntryExitPolicy,
  type EntryExitDecision,
  type TravelContext as EntryExitTravelContext,
  type Side,
  type DecoratedSubpath,
  type EntryExitReportItem,
  type EntryExitAudit,
  type EntryExitResult,
  // Geometry helpers
  tangentAtSubpathStart,
  tangentAtSubpathEnd,
  // Side detection
  interiorSideFromWinding,
  scrapSide,
  normalFromSide,
  // Geometry primitives
  makeTangentialLine,
  makeMicroArc,
  makeEntryTangentialLine,
  makeExitTangentialLine,
  // Decision engine
  decideEntryExit,
  // Subpath decoration
  decorateSubpathWithEntryExit,
  // Batch processing
  applyEntryExitStrategy,
  // Safety checks
  entryExitSafetyCheck,
  // Convenience functions
  defaultHPLContext,
  defaultPlywoodContext,
  flattenDecoratedSubpath,
  getEntryExitBlockingIssues,
  isEntryExitResultValid,
  getEntryExitFingerprints,
} from './entryExitStrategy.js';

// ============================================================================
// Step 10.6.2: Variable Offset by Tool Radius
// ============================================================================

export {
  // Types
  type Tool,
  type StockAllowance,
  type OffsetMode as VariableOffsetMode,
  type OffsetRequest,
  type OffsetResolved,
  type PassKind,
  type PassPlan,
  type OffsetReportItem,
  type OffsetPassResult,
  type OffsetAudit,
  type OffsetPipelineConfig,
  type CollapseGuardResult,
  // Constants
  DEFAULT_OFFSET_CONFIG,
  // Offset resolution
  resolveOffsetDistance,
  getToolRadius,
  // Pass planning
  buildRoughFinishPasses,
  buildFinishOnlyPass,
  buildMultiStepPasses,
  // Geometry utilities
  bboxOfPathApprox,
  // Safety guards
  offsetCollapseGuard,
  toolOffsetCompatibilityGuard,
  // Pipeline
  runOffsetForPass,
  // Audit
  generateOffsetAudit,
  // Convenience functions
  createTool,
  createOutsideProfileRequest,
  createInsideProfileRequest,
  getOffsetBlockingIssues,
  isOffsetResultValid,
  getOffsetFingerprints,
  summarizePasses,
} from './variableOffset.js';

// ============================================================================
// Step 10.6.7: Multi-Tool Routing Planner
// ============================================================================

export {
  // Types
  type ToolRef,
  type OperationKind,
  type RoutePassKind,
  type RouteStep,
  type RouteReportItem,
  type ToolRoutePlan,
  type MultiToolStrategy,
  type ProfileOpInput,
  type DrillOpInput,
  type GrooveOpInput,
  type BuildPlanInput,
  type CompiledToolpath,
  type CompileContext,
  // Constants
  PRIORITY,
  // Tool selection
  pickDrillTool,
  pickGrooveTool,
  // Strategy building
  defaultStrategyForMaterial,
  mergeStrategy,
  // Plan building
  buildMultiToolRoutePlan,
  // Validation
  validateMultiToolStrategy,
  // Utilities
  getStepsForTool,
  getStepsForOp,
  countToolChanges,
  getRouteBlockingIssues,
  isRoutePlanValid,
  getRouteFingerprints,
  summarizeRoutePlan,
  createToolRef,
  createStandardToolLibrary,
} from './multiToolRouting.js';

// ============================================================================
// Step 10.6.9: Tool Change Planner
// ============================================================================

export {
  // Types
  type DepEdge,
  type ToolBlock,
  type ScheduleReportItem,
  type ScheduledPlan,
  type ToolChangePlannerPolicy,
  type ScheduleResult,
  // Constants
  DEFAULT_PLANNER_POLICY,
  DEP_REASON,
  // Dependency graph building
  buildDependencyEdges,
  // Scheduling
  scheduleStepsMinToolChanges,
  scheduleWithCycleCheck,
  // High-level API
  createScheduledPlan,
  optimizeRoutePlan,
  // Utilities
  getScheduleBlockingIssues,
  isScheduledPlanValid,
  getScheduleFingerprints,
  summarizeScheduledPlan,
  getStepsInBlock,
  getBlockForStep,
  theoreticalMinToolChanges,
  optimizationRatio,
  validateDependencyEdges,
  deduplicateEdges,
  createPlannerPolicy,
  groupEdgesByReason,
  explainDependency,
} from './toolChangePlanner.js';

// ============================================================================
// Step 10.6.8: Z-Aware Path Planning
// ============================================================================

export {
  // Types: 3D coordinates
  type XYZ,
  type XY,
  // Types: Motion primitives
  type MotionRapid,
  type MotionFeed,
  type MotionArc,
  type MotionDwell,
  type MotionToolChange,
  type MotionSpindle,
  type MotionComment,
  type Motion,
  // Types: Motion blocks and plans
  type MotionBlock,
  type MotionReportItem,
  type MotionPlanV1,
  // Types: Z profile
  type ZProfile,
  type ProfileOpZ,
  type DrillOpZ,
  type GrooveOpZ,
  // Types: Depth layers
  type DepthLayerKind,
  type DepthLayer,
  // Types: Compile inputs
  type ProfileCompileInput,
  type DrillCompileInput,
  type GrooveCompileInput,
  // Types: Verification
  type MotionVerifyResult,
  // Constants
  DEFAULT_Z_VALUES,
  DEFAULT_SCORE_DEPTH_MM,
  DEFAULT_PECK,
  // Z profile factory
  defaultZProfile,
  createZProfile,
  // Depth schedule builder
  planProfileDepthLayers,
  planDrillPeckLayers,
  planGrooveDepthLayers,
  // Segment to motion conversion
  segToMotionsAtZ,
  segsToMotionsAtZ,
  // Subpath motion building
  motionsForSubpathAtLayer,
  motionsForSegmentsAtLayer,
  // Compilation
  compileProfileToMotionBlock,
  compileDrillPeck,
  compileGroove,
  defaultDrillOpZ,
  defaultGrooveOpZ,
  // Plan assembly
  assembleMotionPlan,
  // Verification
  verifyMotionPlan,
  isMotionPlanValid,
  // Utilities
  countMotions,
  countMotionsByKind,
  getMotionPlanFingerprints,
  summarizeMotionPlan,
  estimateMachiningTime,
  formatMachiningTime,
} from './zAwarePlanning.js';
