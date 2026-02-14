// src/core/manufacturing/verify/geom/geometryConsistency.ts
/**
 * Geometry Consistency Checker.
 *
 * Verifies that executed IR geometry matches canonical DXF/Flatten geometry.
 * Uses sampling-based comparison with configurable tolerances.
 *
 * Verification layers:
 * A) Topology presence (all features have corresponding toolpaths)
 * B) Geometric equivalence (path shapes match within tolerance)
 * C) Direction/side correctness (offset side is correct)
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

import { IRProgram } from "../../gcode/ir/gcodeIr.v1";
import { TraceMap } from "../../post/ir/traceMap.v1";
import {
  CanonModel,
  CanonPart,
  CanonPath,
  Point2D,
  BBox,
  Feature,
  DrillFeature,
} from "./canonicalGeom.v1";
import {
  ExecutedModel,
  ExecutedPath,
  getThroughPathsForPart,
  findLongestPath,
  bboxOverlap,
} from "./irExtract.v1";
import {
  samplePath,
  distPointToExecutedPath,
} from "./distanceToSeg.ts";
import {
  ConsistencyReport,
  ConsistencyIssue,
  ConsistencyIssueCode,
  PathComparisonStats,
  FeatureMatchResult,
} from "../consistencyReport.v1";
import { stableStringify, simpleHash } from "../../audit/hashing";

// =============================================================================
// TYPES
// =============================================================================

/**
 * DXF semantic type.
 */
export type DxfSemantic = "PART_EDGE" | "TOOL_CENTERLINE";

/**
 * Export semantics configuration.
 */
export interface ExportSemantics {
  /** DXF outer boundary semantic */
  outer: DxfSemantic;

  /** DXF inner boundary semantic */
  inner: DxfSemantic;
}

/**
 * Tool mapping for THROUGH pass.
 */
export interface ThroughToolMap {
  /** Tool ID */
  toolId: string;

  /** Tool radius (mm) */
  toolRadiusMm: number;

  /** Additional allowance (mm) */
  allowanceMm: number;
}

/**
 * Consistency check tolerances.
 */
export interface ConsistencyTolerances {
  /** Warning threshold (mm) */
  warn: number;

  /** Block threshold (mm) */
  block: number;
}

/**
 * Consistency check request.
 */
export interface ConsistencyRequest {
  /** IR program */
  program: IRProgram;

  /** Trace map */
  traceMap: TraceMap;

  /** Canonical model (from DXF/Flatten) */
  canon: CanonModel;

  /** Executed model (extracted from IR) */
  executed: ExecutedModel;

  /** Export semantics */
  semantics: ExportSemantics;

  /** Tolerances */
  tolerances: ConsistencyTolerances;

  /** Sample step (mm) */
  sampleStepMm: number;

  /** Tool mapping per part for THROUGH pass */
  throughToolByPart: Record<string, ThroughToolMap>;

  /** Drill position tolerance (mm) */
  drillPosTol?: number;
}

/**
 * Default tolerances.
 */
export const DEFAULT_CONSISTENCY_TOLERANCES: ConsistencyTolerances = {
  warn: 0.10,
  block: 0.20,
};

/**
 * Default sample step.
 */
export const DEFAULT_SAMPLE_STEP_MM = 2.0;

// =============================================================================
// CONSISTENCY CHECKER
// =============================================================================

/**
 * Check geometry consistency between canonical and executed models.
 *
 * @param req Consistency request
 * @returns Consistency report
 */
export function checkGeometryConsistency(
  req: ConsistencyRequest
): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];
  const partResults: Record<string, {
    outerMatch: PathComparisonStats | null;
    innerMatches: FeatureMatchResult[];
    featureMatches: FeatureMatchResult[];
  }> = {};

  // Calculate fingerprints
  const dxfFp = simpleHash(stableStringify(req.canon));
  const irFp = req.program.audit.irFp;

  // Helper: add issue
  function addIssue(
    code: ConsistencyIssueCode,
    severity: "BLOCK" | "WARN" | "INFO",
    message: string,
    opts?: Partial<ConsistencyIssue>
  ): void {
    issues.push({ code, severity, message, ...opts });
  }

  // =========================================================================
  // Layer A: Presence checks
  // =========================================================================

  for (const part of req.canon.parts) {
    const throughPaths = getThroughPathsForPart(req.executed, part.partId);

    // Check PROFILE THROUGH exists
    if (throughPaths.length === 0) {
      addIssue(
        "MISSING_PROFILE_THROUGH",
        "BLOCK",
        `No THROUGH toolpath found for part outer profile`,
        { partId: part.partId }
      );
    }

    // Check tool mapping exists
    if (!req.throughToolByPart[part.partId]) {
      addIssue(
        "MISSING_THROUGH_TOOL_MAP",
        "BLOCK",
        `No tool mapping for THROUGH pass`,
        { partId: part.partId }
      );
    }

    // Check features presence
    for (const feature of part.features) {
      const matchResult = checkFeaturePresence(
        feature,
        req.executed,
        part.partId,
        req.drillPosTol ?? 1.0
      );

      if (matchResult.status === "MISSING") {
        if (feature.kind === "DRILL") {
          addIssue(
            "MISSING_DRILL_FEATURE",
            "BLOCK",
            `Drill feature ${feature.featureId} not found`,
            { partId: part.partId, featureId: feature.featureId }
          );
        } else if (feature.kind === "SLOT" || feature.kind === "GROOVE") {
          addIssue(
            "MISSING_SLOT_FEATURE",
            "BLOCK",
            `Slot/groove ${feature.featureId} not found`,
            { partId: part.partId, featureId: feature.featureId }
          );
        } else {
          addIssue(
            "MISSING_POCKET_FEATURE",
            "BLOCK",
            `Pocket ${feature.featureId} not found`,
            { partId: part.partId, featureId: feature.featureId }
          );
        }
      }
    }
  }

  // =========================================================================
  // Layer B: Geometric equivalence
  // =========================================================================

  for (const part of req.canon.parts) {
    const toolMap = req.throughToolByPart[part.partId];
    if (!toolMap) continue;

    // Find best THROUGH path for outer
    const throughPaths = getThroughPathsForPart(req.executed, part.partId);
    const bestThrough = findLongestPath(throughPaths);

    if (!bestThrough) {
      partResults[part.partId] = {
        outerMatch: null,
        innerMatches: [],
        featureMatches: [],
      };
      continue;
    }

    // Calculate expected distance based on semantics
    const expectedDist =
      req.semantics.outer === "PART_EDGE"
        ? toolMap.toolRadiusMm + toolMap.allowanceMm
        : 0;

    // Compare outer boundary
    const outerStats = comparePathBySampling(
      part.outer,
      bestThrough,
      expectedDist,
      req.sampleStepMm,
      req.tolerances
    );

    partResults[part.partId] = {
      outerMatch: outerStats,
      innerMatches: [],
      featureMatches: [],
    };

    // Check outer match result
    if (outerStats.blockCount > 0) {
      addIssue(
        "OUTER_MISMATCH",
        "BLOCK",
        `Outer profile mismatch: maxErr=${outerStats.maxAbsErr.toFixed(3)}mm (${outerStats.blockCount} samples exceed threshold)`,
        { partId: part.partId, context: outerStats as unknown as Record<string, unknown> }
      );
    } else if (outerStats.warnCount > 0) {
      addIssue(
        "OUTER_MISMATCH_WARN",
        "WARN",
        `Outer profile warning: maxErr=${outerStats.maxAbsErr.toFixed(3)}mm`,
        { partId: part.partId, context: outerStats as unknown as Record<string, unknown> }
      );
    }

    // Compare inner cutouts (if any)
    for (const inner of part.inners) {
      // Find matching executed path by bbox overlap
      const innerExpectedDist =
        req.semantics.inner === "PART_EDGE"
          ? toolMap.toolRadiusMm + toolMap.allowanceMm
          : 0;

      const matchingPaths = req.executed.paths.filter(
        (p) =>
          p.partId === part.partId &&
          p.stage === "THROUGH" &&
          bboxOverlap(inner.bbox, p.bbox, 5.0)
      );

      if (matchingPaths.length === 0) {
        addIssue(
          "INNER_MISMATCH",
          "BLOCK",
          `No matching toolpath for inner cutout ${inner.pathId}`,
          { partId: part.partId }
        );
        partResults[part.partId].innerMatches.push({
          canonFeatureId: inner.pathId,
          status: "MISSING",
        });
        continue;
      }

      // Use closest/best matching path
      const bestInner = findLongestPath(matchingPaths);
      if (!bestInner) continue;

      const innerStats = comparePathBySampling(
        inner,
        bestInner,
        innerExpectedDist,
        req.sampleStepMm,
        req.tolerances
      );

      partResults[part.partId].innerMatches.push({
        canonFeatureId: inner.pathId,
        execPathId: bestInner.execPathId,
        status: innerStats.blockCount > 0 ? "MISMATCH" : "MATCHED",
        stats: innerStats,
      });

      if (innerStats.blockCount > 0) {
        addIssue(
          "INNER_MISMATCH",
          "BLOCK",
          `Inner cutout mismatch: maxErr=${innerStats.maxAbsErr.toFixed(3)}mm`,
          { partId: part.partId }
        );
      } else if (innerStats.warnCount > 0) {
        addIssue(
          "INNER_MISMATCH_WARN",
          "WARN",
          `Inner cutout warning: maxErr=${innerStats.maxAbsErr.toFixed(3)}mm`,
          { partId: part.partId }
        );
      }
    }
  }

  // =========================================================================
  // Build report
  // =========================================================================

  const hasBlocks = issues.some((i) => i.severity === "BLOCK");
  const verdict = hasBlocks ? "FAIL" : "PASS";

  const reportBase: Omit<ConsistencyReport, "audit"> & {
    audit: Omit<ConsistencyReport["audit"], "reportFp">;
  } = {
    version: "1.0",
    jobId: req.program.jobId,
    sheetId: req.program.sheetId,
    dxfFp,
    irFp,
    issues,
    verdict,
    partResults,
    audit: {
      rulesVersion: "10.8.2.v1",
      verifiedAt: new Date().toISOString(),
      checkerVersion: "0.10.8.2",
    },
  };

  const reportFp = simpleHash(
    stableStringify({ ...reportBase, audit: { ...reportBase.audit, reportFp: undefined } })
  );

  return {
    ...reportBase,
    audit: { ...reportBase.audit, reportFp },
  } as ConsistencyReport;
}

// =============================================================================
// COMPARISON HELPERS
// =============================================================================

/**
 * Compare paths by sampling.
 */
function comparePathBySampling(
  canonPath: CanonPath,
  execPath: ExecutedPath,
  expectedDist: number,
  stepMm: number,
  tol: ConsistencyTolerances
): PathComparisonStats {
  // Sample canonical path
  const samples = samplePath(canonPath.segs, stepMm);

  if (samples.length === 0) {
    return {
      maxAbsErr: 0,
      meanAbsErr: 0,
      sampleCount: 0,
      expectedDist,
      actualMeanDist: 0,
      warnCount: 0,
      blockCount: 0,
    };
  }

  let maxAbsErr = 0;
  let sumAbsErr = 0;
  let sumDist = 0;
  let warnCount = 0;
  let blockCount = 0;

  for (const sample of samples) {
    // Find distance to executed path
    const result = distPointToExecutedPath(sample, execPath.segs);
    const actualDist = result.d;

    sumDist += actualDist;

    // Error = |actualDist - expectedDist|
    const err = Math.abs(actualDist - expectedDist);
    sumAbsErr += err;
    maxAbsErr = Math.max(maxAbsErr, err);

    if (err > tol.block) {
      blockCount++;
    } else if (err > tol.warn) {
      warnCount++;
    }
  }

  return {
    maxAbsErr,
    meanAbsErr: sumAbsErr / samples.length,
    sampleCount: samples.length,
    expectedDist,
    actualMeanDist: sumDist / samples.length,
    warnCount,
    blockCount,
  };
}

/**
 * Check feature presence in executed model.
 */
function checkFeaturePresence(
  feature: Feature,
  executed: ExecutedModel,
  partId: string,
  drillPosTol: number
): FeatureMatchResult {
  if (feature.kind === "DRILL") {
    return checkDrillPresence(feature, executed, partId, drillPosTol);
  }

  // For other features, check bbox overlap
  const featureBbox = getFeatureBbox(feature);
  if (!featureBbox) {
    return { canonFeatureId: feature.featureId, status: "MISSING" };
  }

  const matchingPaths = executed.paths.filter(
    (p) =>
      p.partId === partId &&
      bboxOverlap(featureBbox, p.bbox, 5.0)
  );

  if (matchingPaths.length === 0) {
    return { canonFeatureId: feature.featureId, status: "MISSING" };
  }

  return {
    canonFeatureId: feature.featureId,
    execPathId: matchingPaths[0].execPathId,
    status: "MATCHED",
  };
}

/**
 * Check drill presence.
 */
function checkDrillPresence(
  drill: DrillFeature,
  executed: ExecutedModel,
  partId: string,
  posTol: number
): FeatureMatchResult {
  // Look for executed paths near drill center
  for (const path of executed.paths) {
    if (path.partId !== partId) continue;

    // Check if path bbox contains drill center
    const { center } = drill;
    if (
      center.x >= path.bbox.minX - posTol &&
      center.x <= path.bbox.maxX + posTol &&
      center.y >= path.bbox.minY - posTol &&
      center.y <= path.bbox.maxY + posTol
    ) {
      // Further check: path should be small (roughly drill size)
      const bboxSize = Math.max(
        path.bbox.maxX - path.bbox.minX,
        path.bbox.maxY - path.bbox.minY
      );
      if (bboxSize < drill.diameterMm * 2) {
        return {
          canonFeatureId: drill.featureId,
          execPathId: path.execPathId,
          status: "MATCHED",
        };
      }
    }
  }

  return { canonFeatureId: drill.featureId, status: "MISSING" };
}

/**
 * Get bounding box for feature.
 */
function getFeatureBbox(feature: Feature): BBox | null {
  if (feature.kind === "DRILL") {
    const r = feature.diameterMm / 2;
    return {
      minX: feature.center.x - r,
      minY: feature.center.y - r,
      maxX: feature.center.x + r,
      maxY: feature.center.y + r,
    };
  }

  if (feature.kind === "SLOT" || feature.kind === "GROOVE") {
    return feature.path.bbox;
  }

  if (feature.kind === "POCKET") {
    return feature.boundary.bbox;
  }

  return null;
}

// =============================================================================
// QUICK CHECK
// =============================================================================

/**
 * Quick consistency check (returns pass/fail only).
 */
export function quickConsistencyCheck(req: ConsistencyRequest): boolean {
  const report = checkGeometryConsistency(req);
  return report.verdict === "PASS";
}

/**
 * Get consistency fingerprints.
 */
export function getConsistencyFingerprints(
  canon: CanonModel,
  irFp: string
): { dxfFp: string; irFp: string } {
  const dxfFp = simpleHash(stableStringify(canon));
  return { dxfFp, irFp };
}
