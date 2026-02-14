// src/core/manufacturing/verify/geom/index.ts
/**
 * Geometry Module.
 *
 * Canonical geometry, IR extraction, and consistency checking.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

// Canonical geometry types
export {
  // Types
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

  // Helpers
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
} from "./canonicalGeom.v1";

// IR extraction
export {
  // Types
  type CutTraceSeg,
  type ExecutedPath,
  type ExecutedModel,
  type ExtractionOptions,

  // Constants
  DEFAULT_EXTRACTION_OPTIONS,

  // Functions
  extractExecutedGeometry,
  getPathsForPart,
  getPathsForStage,
  getThroughPathsForPart,
  findLongestPath,
  bboxOverlap,
} from "./irExtract.v1";

// Distance calculations
export {
  // Types
  type DistanceResult,

  // Line/arc distance
  distPointToLineSeg,
  distPointToArcSeg,
  distPointToSeg,
  distPointToCutSeg,

  // Path distance
  distPointToPath,
  distPointToExecutedPath,

  // Sampling
  sampleLineSeg,
  sampleArcSeg,
  sampleSeg,
  samplePath,
  sampleCutPath,
} from "./distanceToSeg";

// Consistency checker
export {
  // Types
  type DxfSemantic,
  type ExportSemantics,
  type ThroughToolMap,
  type ConsistencyTolerances,
  type ConsistencyRequest,

  // Constants
  DEFAULT_CONSISTENCY_TOLERANCES,
  DEFAULT_SAMPLE_STEP_MM,

  // Functions
  checkGeometryConsistency,
  quickConsistencyCheck,
  getConsistencyFingerprints,
} from "./geometryConsistency";
