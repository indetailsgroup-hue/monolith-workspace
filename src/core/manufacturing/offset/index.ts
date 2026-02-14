// src/core/manufacturing/offset/index.ts
/**
 * Offset Module.
 *
 * Variable offset by tool radius with audit trail.
 *
 * Key features:
 * - Per-op offset (PROFILE/GROOVE/POCKET)
 * - Per-pass offset (ROUGH/FINISH)
 * - Tool-aware (diameter, class)
 * - Direction-safe (works with reversed paths)
 * - Audit-friendly (formula documentation)
 *
 * Usage:
 * ```typescript
 * import {
 *   buildOffsetSpec,
 *   offsetClosedPathBySpec,
 *   validateOffsetSpec,
 * } from './offset';
 *
 * // Build spec for outside profile, rough pass
 * const { spec } = buildOffsetSpec({
 *   opKind: 'PROFILE',
 *   pass: 'ROUGH',
 *   cutSide: 'OUTSIDE',
 *   pathWinding: 'CCW',
 *   toolDiameterMm: 6,
 *   stockToLeaveMm: 0.5,
 * });
 *
 * // Apply to path
 * const result = offsetClosedPathBySpec(path, spec);
 *
 * // Validate
 * const validation = validateOffsetSpec(spec);
 * ```
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

// =============================================================================
// TYPES
// =============================================================================

// Offset Spec Types
export type {
  OffsetSide,
  OffsetWhy,
  OffsetInputs,
  OffsetSpec,
  PathOffsetMeta,
  OffsetIssueCode,
  OffsetIssue,
} from "./offsetSpec.v1";

export {
  DEFAULT_OFFSET_INPUTS,
  createZeroOffsetSpec,
} from "./offsetSpec.v1";

// Offset Side Types
export type {
  Winding,
  CutSide,
} from "./offsetSide";

// Build Types
export type {
  OffsetOpKind,
  OffsetPassKind,
  BuildOffsetRequest,
  BuildOffsetResult,
} from "./buildOffsetSpec";

// Kernel Types
export type {
  Point2D,
  LineSegment,
  ArcSegment,
  PathSegment,
  Path,
  CapStyle,
  OffsetResult,
  OffsetKernelFn,
} from "./offsetKernel";

// Validation Types
export type {
  OffsetValidationResult,
} from "./validateOffsetSpec";

// =============================================================================
// OFFSET SIDE
// =============================================================================

export {
  interiorSideFromWinding,
  exteriorSideFromWinding,
  offsetSideForProfile,
  offsetSideForProfileWithReason,
  offsetSideForGroove,
  offsetSideForPocket,
  flipOffsetSide,
  flipWinding,
  verifyOffsetSideAfterReverse,
} from "./offsetSide";

// =============================================================================
// BUILD OFFSET SPEC
// =============================================================================

export {
  buildOffsetSpec,
  buildOffsetSpecSimple,
  buildRoughFinishOffsetSpecs,
  addOnionSkinToSpec,
} from "./buildOffsetSpec";

// =============================================================================
// OFFSET KERNEL
// =============================================================================

export {
  specToSignedDistance,
  signedDistanceToSpec,
  offsetClosedPathBySpec,
  offsetOpenPathBySpec,
  offsetPathsBySpec,
  extractOffsetSpec,
  hasOffsetSpec,
} from "./offsetKernel";

// =============================================================================
// VALIDATION
// =============================================================================

export {
  validateOffsetSpec,
  validatePathHasOffsetSpec,
  validatePathsHaveOffsetSpecs,
  generateOffsetAuditReport,
  generatePathsOffsetAuditReport,
  generateOffsetSpecFingerprint,
  addFingerprintToSpec,
} from "./validateOffsetSpec";
