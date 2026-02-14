/**
 * Post-Processing Module
 *
 * Step 10.5: G-code generation from toolpath plans
 * Step 10.5.1: Lead-in/out + Peck drilling
 * Step 10.5.2: Ramp entry + Finishing pass
 * Step 10.5.3: Corner smoothing + Onion skin + Compression tools
 * Step 10.5.4: General polyline geometry (LINE + ARC paths)
 * Step 10.5.5: Arc-preserving tabs + Arc-aware offset for finishing
 *
 * Exports:
 * - Machine profiles (KDT_MVP, HOMAG_MVP)
 * - Tool table management
 * - G-code writer class
 * - Coordinate transforms
 * - Lead-in/out geometry helpers
 * - Ramp entry geometry helpers
 * - Offset geometry helpers
 * - Corner smoothing geometry helpers
 * - Path types and geometry builder (Step 10.5.4)
 * - Path transformation and emission
 * - Path parameterization for tabs
 * - General tabs system
 * - Line-only path offset
 * - Arc-preserving tabs (Step 10.5.5)
 * - Arc-aware path offset (Step 10.5.5)
 * - Toolpath compiler (including compileProfileGeneral)
 */

// Machine profiles
export {
  type Units,
  type ToolType,
  type Tool,
  type MachineProfile,
  type MaterialFeedSpeed,
  type LeadMode,
  type CutDirection,
  type RampConfig,
  type FinishingConfig,
  type SmoothingConfig,
  type HoldDownConfig,
  type LaminateTag,
  type ToolingPolicyConfig,
  type CutTuning,
  KDT_MVP_PROFILE,
  HOMAG_MVP_PROFILE,
  DEFAULT_TOOL_TABLE,
  MATERIAL_DEFAULTS,
  getMachineProfile,
  getToolByNumber,
  findToolByDiameter,
  getDefaultToolForOperation,
  calculateFeedRate,
  calculateRpm,
  getMaterialDefaults,
} from './machineProfile.js';

// G-code writer
export {
  type GCodeOptions,
  GCode,
  createGCode,
} from './gcodeWriter.js';

// Transforms
export {
  type Rotation,
  type Point2D,
  type Point3D,
  type PartPlacement,
  type TransformContext,
  type BoundingBox,
  partLocalToSheet,
  partLocalToSheet3D,
  transformDrill,
  transformLine,
  transformPolyline,
  rotatedDimensions,
  createTransformContext,
  boundingBox,
  partBoundingBox,
  optimizeDrillOrder,
  calculateZLevels,
  isThroughCut,
} from './transform.js';

// Lead-in/out geometry
export {
  type LeadConfig,
  type LeadResult,
  leadInLine,
  leadInArc,
  leadOutLine,
  leadOutArc,
  pathAngle,
  averageAngle,
  calculateLeadIn,
  calculateLeadOut,
} from './lead.js';

// Ramp entry geometry
export {
  type RampMove,
  type RampResult,
  rampLengthForDepth,
  rampEndPoint,
  calculateRamp,
  calculatePassRamp,
  segmentDirection,
  segmentLength,
} from './ramp.js';

// Offset geometry
export {
  type InsetResult,
  type OffsetRectPoints,
  insetRect,
  outsetRect,
  insetRectPoints,
  offsetRectPoints,
  toolRadiusOffset,
  roughingOffset,
} from './offset.js';

// Corner smoothing geometry
export {
  type MoveType,
  type PathSegment,
  type SmoothedPath,
  smoothedRectPath,
  sharpRectPath,
  generateProfilePath,
  arcTangentPoint,
  getCornerArc,
} from './cornerArcsRect.js';

// Compiler
export {
  type CompileOptions,
  type CompileResult,
  type SheetGCode,
  type GeneralProfileOptions,
  compileSheetToGcode,
  compileToolpathPlan,
  compileProfileGeneral,
  formatCompileSummary,
} from './compiler.js';

// ============================================================================
// Step 10.5.4: General Polyline Geometry (LINE + ARC paths)
// ============================================================================

// Path types (canonical geometry types for toolpath plans)
export {
  type Pt,
  type SegLine,
  type SegArc,
  type Segment,
  type Path,
  type PartGeometry,
  type TabConfig,
  type ToolpathPart,
  type ToolpathPlanV2,
  isLineOnlyPath,
  pathStart,
  pathEnd,
  segmentStart,
  segmentEnd,
} from './planTypes.js';

// Geometry builder (construct paths with validation)
export {
  type BuildPathOptions,
  type PathValidation,
  buildPathFromSegments,
  validatePath,
  reversePath,
  createRectPath,
  createRoundedRectPath,
} from './geometryBuilder.js';

// Path transformation (part-local to sheet-global)
export {
  type PathTransformContext,
  transformPath,
  transformPathPartToSheet,
  inverseTransformPath,
  transformPoint,
  inverseTransformPoint,
} from './pathTransform.js';

// Path emission (emit paths as G1/G2/G3)
export {
  type PositionState,
  type MultiPassOptions,
  rapidToPathStart,
  moveToPoint,
  emitPathAtCurrentZ,
  emitPathWithSetup,
  emitPathMultiPass,
  pathStartTangent,
  pathEndTangent,
} from './pathEmit.js';

// Path parameterization (length-based sampling)
export {
  type SegMeta,
  buildSegMeta,
  totalPathLength,
  totalLengthFromMeta,
  pointAtDistance,
  pointAt,
  tangentAtDistance,
  samplePath,
  sampleRange,
} from './pathParam.js';

// General tabs system (split paths by tabs)
export {
  type TabSplitResult,
  splitPathByTabs,
  needsTabSplitting,
  getPathsForCutting,
  getTabCenterPoints,
  totalCutLength,
} from './tabsGeneral.js';

// Line-only path offset (for finishing passes)
export {
  type OffsetResult,
  offsetClosedLinePath,
  insetPath,
  outsetPath,
  finishingOffset,
  canOffsetPath,
  minSafeInset,
} from './offsetLinePath.js';

// ============================================================================
// Step 10.5.5: Arc-Preserving Tabs + Arc-Aware Offset
// ============================================================================

// Arc-preserving tabs (split paths while keeping LINE/ARC types)
export {
  type TabPositionInfo,
  splitPathByTabsKeepArcs,
  hasArcSegments,
  getPathsForCuttingKeepArcs,
  getTabPositionsKeepArcs,
} from './tabsSplitKeepArcs.js';

// Arc-aware path offset (for finishing passes on curved geometry)
export {
  type OffsetMode,
  type ArcOffsetResult,
  offsetClosedPathArcAware,
  insetPathArcAware,
  outsetPathArcAware,
  finishingOffsetArcAware,
  canOffsetPathArcAware,
  estimateMinSafeInsetArcAware,
} from './offsetArcAware.js';

// ============================================================================
// Step 10.5.6: Analytic Offset Kernel (CAM-grade)
// ============================================================================

// Re-export from kernel module for convenience
export {
  // Types
  type Pt as KernelPt,
  type Vec,
  type OffsetSegment,
  type JoinResult,
  type OffsetPathResult,
  type OffsetOpenResult,
  type CapStyle,
  // Closed path offset (analytic joins)
  offsetClosedPath,
  insetClosedPath,
  outsetClosedPath,
  roughingOffset as kernelRoughingOffset,
  canOffsetWithKernel,
  estimateMaxInset,
  validateOffsetResult,
  // Open path offset (with caps)
  offsetOpenPath,
  finishingOffsetOpen,
  canOffsetOpenPath,
  offsetOpenPaths,
  // Join solver
  join as analyticJoin,
  joinSegments,
  // Geometry utilities
  intersectLines,
  circleCircleIntersections,
  lineCircleIntersections,
} from './offsetKernel/index.js';

// ============================================================================
// Step 10.7.1: G-Code Dialects
// ============================================================================

export {
  // Types
  type DialectId,
  type PostContext,
  type PostResult,
  type PostReportItem,
  type Dialect,
  type PostHooks,
  // Constants
  DEFAULT_POST_CONTEXT,
  // Classes
  BaseIsoDialect,
  KdtIsoDialect,
  BiesseIsoDialect,
  HomagIsoDialect,
  // Emitter
  emitGcode,
  // Utilities
  getDialect,
  listDialects,
  wrapDialectWithHooks,
  createPostContext,
  createSimpleToolTable,
  validateGcode,
  countGcodeLines,
  extractToolChanges,
  summarizeGcode,
} from './gcodeDialects.js';

// ============================================================================
// Step 10.7.2: Post-Processor Profiles
// ============================================================================

export {
  // Types
  type MachineFamily,
  type MachineProfileId,
  type SpeedSet,
  type FeedSet,
  type StepdownSet,
  type ClearanceSet,
  type PeckSet,
  type EntryExitParams,
  type LimitsSet,
  type MaterialProfile as PostMaterialProfile,
  type ToolProfile,
  type MachiningPolicy,
  type MachineProfile as PostMachineProfile,
  type ResolutionFingerprints,
  type ResolvedMachiningParams,
  type ProfilePin,
  type StepPin,
  // Profile resolution
  resolveParams,
  resolveParamsSafe,
  makePostContext as makePostContextFromProfile,
  makePostContextForTool,
  makeZProfile,
  makeZProfileFor,
  // Pin management
  createProfilePin,
  createStepPin,
  validateProfilePin,
  // Validation
  validateMachineProfile,
  // Example profiles
  KDT_MVP_PROFILE as KDT_POST_PROFILE,
  GENERIC_PROFILE,
  // Utilities
  listProfileMaterials,
  listProfileTools,
  summarizeProfile,
  cloneProfile,
  addToolToProfile,
  getToolIds,
} from './machineProfiles.js';

// ============================================================================
// Step 10.7.3: Simulation Kernel
// ============================================================================

export {
  // Types
  type SimSheet,
  type SimZRules,
  type SimToolInfo,
  type SimLimits,
  type SimContext,
  type SimSeverity,
  type SimIssue,
  type SimStats,
  type SimReport,
  type GateSimArtifact,
  // Constants
  DEFAULT_SIM_LIMITS,
  DEFAULT_Z_RULES,
  SIM_ISSUE_CODES,
  // Simulation
  simulateMotionPlan,
  normalizeIssues,
  createSimContext,
  createSimContextFromProfile,
  // Gate integration
  createGateSimArtifact,
  // Utilities
  isSimulationPassed,
  getBlockingIssues as getSimBlockingIssues,
  getWarningIssues as getSimWarningIssues,
  summarizeSimReport,
  formatSimTime,
  getIssueSummaryByCode,
  hasDepthViolations,
  hasBoundsViolations,
  hasArcIssues,
} from './simulationKernel.js';

// ============================================================================
// Step 10.8.1: Toolpath Verifier
// ============================================================================

export {
  // Types: Geometry Truth
  type PartTruth,
  type GeometryTruth,
  // Types: Step Truth
  type OpKind,
  type PassKind,
  type CutIntent,
  type EndpointRole,
  type CenterlineSubpath,
  type StepZBand,
  type StepFingerprints,
  type StepTruth,
  // Types: Machine & Policy
  type VerifierMachineConfig,
  type VerifierPolicy,
  // Types: Motion (re-exported)
  type XYZ as VerifierXYZ,
  type MotionKind,
  type Motion as VerifierMotion,
  type MotionBlock as VerifierMotionBlock,
  type MotionPlanV1 as VerifierMotionPlanV1,
  // Types: Input/Output
  type VerifierInput,
  type VerifySeverity,
  type VerifyIssue,
  type VerifyStats,
  type ToolpathVerifyReport,
  type GateVerifyArtifact,
  // Constants
  DEFAULT_VERIFIER_POLICY,
  VERIFY_CODE,
  // Verification
  verifyToolpath,
  verifyProfileGouge,
  checkRapidAtLowZ,
  checkAirPlunge,
  checkBounds,
  checkDepth,
  // Gate integration
  createGateVerifyArtifact,
  // Utilities
  isVerifyPassed,
  getBlockingIssues,
  getWarningIssues,
  summarizeVerifyReport,
  createVerifierPolicy,
  createMachineConfig,
  createGeometryTruth,
  createStepTruth,
  createVerifierInput,
  // Geometry sampling
  sampleLine,
  sampleArc,
  samplePath2D,
  flattenPath,
  pointInPoly,
  extractStepIdFromComment,
} from './toolpathVerifier.js';

// ============================================================================
// Step 10.8.2: Geometry Consistency Check
// ============================================================================

export {
  // Types: 2D Geometry
  type Vec2 as ConsistencyVec2,
  type XYZ as ConsistencyXYZ,
  // Types: Policy
  type ConsistencyPolicy,
  // Types: Input/Output
  type ConsistencyInput,
  type ConsistencySeverity,
  type ConsistencyIssue,
  type ConsistencyStats,
  type ConsistencyReport,
  type GateConsistencyArtifact,
  // Types: G-code parsing
  type GCmd,
  type Seg2D,
  type SegmentBucket,
  // Constants
  DEFAULT_CONSISTENCY_POLICY,
  CONSISTENCY_CODE,
  // G-code parsing
  parseGcodeISO,
  gcodeToSegments,
  // Consistency check
  checkGeometryConsistency,
  // Gate integration
  createGateConsistencyArtifact,
  // Utilities
  isConsistencyPassed,
  getConsistencyBlockingIssues,
  getConsistencyWarningIssues,
  summarizeConsistencyReport,
  createConsistencyPolicy,
  createConsistencyInput,
  getGcodeStats,
  validateGcodeFormat,
} from './geometryConsistency.js';

// ============================================================================
// Step 10.8.3: Signed Toolpath Manifest
// ============================================================================

export {
  // Types: Core primitives
  type Hash256,
  type SpecState,
  type SigningMethod,
  // Types: Manifest structure
  type ManifestJob,
  type ManifestMachine,
  type ManifestStepPin,
  type ManifestPlanning,
  type ManifestReportSummary,
  type ManifestArtifacts,
  type ManifestDecision,
  type ManifestSignatures,
  type ManifestV1,
  type UnsignedManifestV1,
  // Types: Building & verification
  type BuildManifestInput,
  type ManifestVerifyResult,
  type GateDecisionInput,
  type FullVerifyInput,
  type FullVerifyResult,
  // Constants
  BLOCK_REASON,
  // Stable serialization
  stableJson,
  normalizeGcode,
  // Hashing utilities
  sha256Hex,
  hmacSha256Hex,
  hashJson,
  // Gate decision
  computeGateDecision,
  // Manifest building
  buildManifestV1,
  // Manifest verification
  verifyManifestHmac,
  verifyGcodeHash,
  verifyMotionPlanHash,
  verifyManifestFull,
  // Export ID generation
  generateExportId,
  generateExportPath,
  // Utilities
  canExport,
  getBlockReasons,
  isSimPassed as isManifestSimPassed,
  isVerifyPassed as isManifestVerifyPassed,
  isConsistencyPassed as isManifestConsistencyPassed,
  summarizeManifest,
  createManifestJob,
  createManifestMachine,
  createStepPin as createManifestStepPin,
  createHmacSigningConfig,
  extractManifestSummary,
  manifestsEqual,
  parseManifest,
  serializeManifest,
} from './toolpathManifest.js';

// ============================================================================
// Step 10.8.4: Export Gate Enforcement
// ============================================================================

export {
  // Types: Export request/result
  type ExportKind,
  type ExportActor,
  type ExportRequest,
  type ExportFile,
  type ExportResultOK,
  type ExportResultBlock,
  type ExportResult,
  // Types: Job snapshot
  type MachinePin,
  type GateRunResult,
  type JobSnapshot,
  // Types: Audit
  type ExportAuditEntry,
  // Types: Store interfaces (for DI)
  type IJobStore,
  type IArtifactStore,
  type ISigningService,
  type IAuditLog,
  type IGatePipeline,
  type GatePipelineInput,
  type GatePipelineOutput,
  type ExportGateContext,
  // Constants
  EXPORT_BLOCK_REASON,
  // Main export function
  exportJob,
  // Utilities
  validateExportRequest,
  createExportRequest,
  createJobSnapshot,
  canExportSnapshot,
  getExportFilePath,
  parseExportPath,
  summarizeExportResult,
  isExportSuccessful,
  getExportFiles,
  getExportSize,
} from './exportGate.js';
