// src/core/manufacturing/verify/index.ts
/**
 * Verify Module.
 *
 * Manufacturing-grade toolpath verification and geometry consistency.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

// Verifier report types
export {
  // Types
  type VerifySeverity,
  type VerifyIssueCode,
  type VerifyIssue,
  type SafetyGrade,
  type SafetyStatus,
  type SafetyBadge,
  type VerifierAudit,
  type VerifierReport,

  // Helpers
  createEmptyVerifierReport,
  getBlockingIssues,
  getWarningIssues,
  isReportPassing,
  requiresManualReview,
  formatVerifierReport,
  calculateBadge,
} from "./verifierReport.v1";

// Verifier rules
export {
  // Types
  type VerifyRule,
  type VerifyThresholds,
  type VerifyRuleOverride,
  type VerifyConfig,

  // Constants
  VERIFY_RULES,
  DEFAULT_VERIFY_THRESHOLDS,
  DEFAULT_VERIFY_CONFIG,
  VERIFY_RULES_VERSION,

  // Functions
  getEffectiveVerifySeverity,
  shouldApplyVerifyRule,
  getVerifyRulesVersion,
} from "./verifyRules";

// Toolpath verifier
export {
  // Types
  type OpKind,
  type OpLimits,
  type ToolSpec,
  type ForbiddenZone,
  type VerifyRequest,

  // Main verifier
  verifyToolpath,

  // Quick helpers
  quickVerify,
  getBlockingIssuesOnly,

  // Factory helpers
  createProfileOpLimits,
  createPocketOpLimits,
  createGrooveOpLimits,
  createDrillOpLimits,
  createToolSpec,
} from "./toolpathVerifier";

// Consistency report types
export {
  // Types
  type ConsistencySeverity,
  type ConsistencyIssueCode,
  type ConsistencyIssue,
  type PathComparisonStats,
  type FeatureMatchResult,
  type ConsistencyVerdict,
  type ConsistencyAudit,
  type ConsistencyReport,

  // Helpers
  createEmptyConsistencyReport,
  getConsistencyBlockingIssues,
  getConsistencyWarningIssues,
  isConsistencyPassing,
  formatConsistencyReport,
} from "./consistencyReport.v1";

// Geometry submodule
export {
  // Canonical geometry
  type Point2D,
  type BBox,
  type LineSeg,
  type ArcSeg,
  type Seg,
  type CanonPath,
  type FeatureKind,
  type DrillFeature,
  type SlotFeature,
  type PocketFeature,
  type CounterboreFeature,
  type Feature,
  type CanonPart,
  type CanonModel,

  // IR extraction
  type CutTraceSeg,
  type ExecutedPath,
  type ExecutedModel,
  type ExtractionOptions,

  // Consistency types
  type DxfSemantic,
  type ExportSemantics,
  type ThroughToolMap,
  type ConsistencyTolerances,
  type ConsistencyRequest,

  // Distance types
  type DistanceResult,

  // Constants
  DEFAULT_EXTRACTION_OPTIONS,
  DEFAULT_CONSISTENCY_TOLERANCES,
  DEFAULT_SAMPLE_STEP_MM,

  // Canonical helpers
  lineSegLength,
  arcSegLength,
  segLength,
  calculatePathLength,
  calculatePathBBox,
  isAngleInSweep,
  getSegStart,
  getSegEnd,
  isPathClosed,
  calculateWinding,
  createCanonPath,

  // IR extraction
  extractExecutedGeometry,
  getPathsForPart,
  getPathsForStage,
  getThroughPathsForPart,
  findLongestPath,
  bboxOverlap,

  // Distance calculations
  distPointToLineSeg,
  distPointToArcSeg,
  distPointToSeg,
  distPointToCutSeg,
  distPointToPath,
  distPointToExecutedPath,

  // Sampling
  sampleLineSeg,
  sampleArcSeg,
  sampleSeg,
  samplePath,
  sampleCutPath,

  // Consistency checker
  checkGeometryConsistency,
  quickConsistencyCheck,
  getConsistencyFingerprints,
} from "./geom";
