// src/core/manufacturing/offset/validateOffsetSpec.ts
/**
 * Offset Spec Validation.
 *
 * Gate checks for offset specifications:
 * - Tool diameter > 0
 * - Distance >= 0
 * - Stock doesn't exceed radius
 * - Inputs match calculated distance
 *
 * v0.10.6.2 - Variable Offset by Tool Radius
 */

import {
  OffsetSpec,
  OffsetIssue,
  OffsetIssueCode,
} from "./offsetSpec.v1";
import { Path, hasOffsetSpec, extractOffsetSpec } from "./offsetKernel";

// =============================================================================
// VALIDATION RESULT
// =============================================================================

/**
 * Result of offset spec validation.
 */
export interface OffsetValidationResult {
  /** Is the spec valid? */
  valid: boolean;

  /** List of issues found */
  issues: OffsetIssue[];

  /** Blocking issues (must fix) */
  blocks: OffsetIssue[];

  /** Warning issues (should review) */
  warnings: OffsetIssue[];

  /** Info issues (for audit) */
  info: OffsetIssue[];
}

// =============================================================================
// SPEC VALIDATION
// =============================================================================

/**
 * Validate an offset specification.
 *
 * Checks for:
 * - Valid tool diameter (> 0)
 * - Non-negative distance
 * - Stock doesn't exceed radius
 * - Inputs consistency
 *
 * @param spec Offset specification to validate
 * @returns Validation result with issues
 */
export function validateOffsetSpec(spec: OffsetSpec): OffsetValidationResult {
  const issues: OffsetIssue[] = [];

  // Check tool diameter
  if (spec.inputs.toolDiameterMm <= 0) {
    issues.push({
      code: "OFFSET_TOOL_DIAMETER_ZERO",
      severity: "BLOCK",
      message: `Tool diameter must be > 0, got ${spec.inputs.toolDiameterMm}mm`,
      data: { toolDiameterMm: spec.inputs.toolDiameterMm },
    });
  }

  // Check tool radius consistency
  const expectedRadius = spec.inputs.toolDiameterMm * 0.5;
  if (Math.abs(spec.inputs.toolRadiusMm - expectedRadius) > 0.001) {
    issues.push({
      code: "OFFSET_INPUTS_MISMATCH",
      severity: "WARN",
      message: `Tool radius (${spec.inputs.toolRadiusMm}) doesn't match diameter/2 (${expectedRadius})`,
      data: {
        toolRadiusMm: spec.inputs.toolRadiusMm,
        expectedRadius,
      },
    });
  }

  // Check distance is non-negative
  if (spec.distanceMm < 0) {
    issues.push({
      code: "OFFSET_DISTANCE_NEGATIVE",
      severity: "BLOCK",
      message: `Offset distance must be >= 0, got ${spec.distanceMm}mm`,
      data: { distanceMm: spec.distanceMm },
    });
  }

  // Check stock vs radius relationship
  const R = spec.inputs.toolRadiusMm;
  const stock = spec.inputs.stockToLeaveMm;
  const base = R + spec.inputs.userAllowanceMm + spec.inputs.kerfAllowanceMm;

  if (stock > 0 && stock >= base) {
    issues.push({
      code: "OFFSET_STOCK_EXCEEDS_RADIUS",
      severity: "WARN",
      message: `Stock to leave (${stock}mm) >= base offset (${base}mm). Rough pass may be on centerline.`,
      data: {
        stockToLeaveMm: stock,
        baseOffset: base,
        toolRadiusMm: R,
      },
    });
  }

  // Check if rough pass has zero distance (risky)
  if (
    spec.why.includes("FINISH_ALLOWANCE") &&
    spec.distanceMm === 0 &&
    R > 0
  ) {
    issues.push({
      code: "OFFSET_ROUGH_ZERO_DIST",
      severity: "WARN",
      message: "Rough pass has zero offset distance. Tool will follow centerline.",
      data: {
        distanceMm: spec.distanceMm,
        stockToLeaveMm: stock,
        why: spec.why,
      },
    });
  }

  // Verify formula consistency (basic check)
  if (spec.distanceMm > 0) {
    const expectedDist = spec.why.includes("FINISH_ALLOWANCE")
      ? Math.max(0, base - stock)
      : base;

    if (Math.abs(spec.distanceMm - expectedDist) > 0.01) {
      issues.push({
        code: "OFFSET_INPUTS_MISMATCH",
        severity: "INFO",
        message: `Distance (${spec.distanceMm}mm) differs from calculated (${expectedDist}mm). Custom formula may be used.`,
        data: {
          distanceMm: spec.distanceMm,
          expectedDist,
          formula: spec.formula,
        },
      });
    }
  }

  // Categorize issues
  const blocks = issues.filter((i) => i.severity === "BLOCK");
  const warnings = issues.filter((i) => i.severity === "WARN");
  const info = issues.filter((i) => i.severity === "INFO");

  return {
    valid: blocks.length === 0,
    issues,
    blocks,
    warnings,
    info,
  };
}

// =============================================================================
// PATH VALIDATION
// =============================================================================

/**
 * Validate that a path has an offset spec attached.
 *
 * @param path Path to validate
 * @returns Validation result
 */
export function validatePathHasOffsetSpec(path: Path): OffsetValidationResult {
  if (!hasOffsetSpec(path)) {
    return {
      valid: false,
      issues: [
        {
          code: "OFFSET_SPEC_MISSING",
          severity: "BLOCK",
          message: `Path ${path.id} is missing offset specification`,
          data: { pathId: path.id },
        },
      ],
      blocks: [
        {
          code: "OFFSET_SPEC_MISSING",
          severity: "BLOCK",
          message: `Path ${path.id} is missing offset specification`,
          data: { pathId: path.id },
        },
      ],
      warnings: [],
      info: [],
    };
  }

  const spec = extractOffsetSpec(path)!;
  return validateOffsetSpec(spec);
}

/**
 * Validate multiple paths for offset specs.
 *
 * @param paths Paths to validate
 * @returns Combined validation result
 */
export function validatePathsHaveOffsetSpecs(paths: Path[]): {
  allValid: boolean;
  results: Map<string, OffsetValidationResult>;
  totalIssues: OffsetIssue[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    blocks: number;
    warnings: number;
  };
} {
  const results = new Map<string, OffsetValidationResult>();
  const totalIssues: OffsetIssue[] = [];

  let valid = 0;
  let invalid = 0;
  let blocks = 0;
  let warnings = 0;

  for (const path of paths) {
    const result = validatePathHasOffsetSpec(path);
    results.set(path.id, result);
    totalIssues.push(...result.issues);

    if (result.valid) {
      valid++;
    } else {
      invalid++;
    }

    blocks += result.blocks.length;
    warnings += result.warnings.length;
  }

  return {
    allValid: invalid === 0,
    results,
    totalIssues,
    summary: {
      total: paths.length,
      valid,
      invalid,
      blocks,
      warnings,
    },
  };
}

// =============================================================================
// AUDIT HELPERS
// =============================================================================

/**
 * Generate audit report for offset spec.
 *
 * @param spec Offset specification
 * @returns Audit report object
 */
export function generateOffsetAuditReport(spec: OffsetSpec): Record<string, unknown> {
  const validation = validateOffsetSpec(spec);

  return {
    version: spec.version,
    distance: {
      mm: spec.distanceMm,
      side: spec.side,
    },
    reasons: spec.why,
    inputs: {
      toolDiameter: spec.inputs.toolDiameterMm,
      toolRadius: spec.inputs.toolRadiusMm,
      stockToLeave: spec.inputs.stockToLeaveMm,
      kerfAllowance: spec.inputs.kerfAllowanceMm,
      userAllowance: spec.inputs.userAllowanceMm,
    },
    formula: spec.formula,
    fingerprint: spec.fingerprint,
    validation: {
      valid: validation.valid,
      blockCount: validation.blocks.length,
      warnCount: validation.warnings.length,
      issues: validation.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    },
  };
}

/**
 * Generate audit report for multiple paths.
 *
 * @param paths Paths with offset specs
 * @returns Audit report object
 */
export function generatePathsOffsetAuditReport(
  paths: Path[]
): Record<string, unknown> {
  const validation = validatePathsHaveOffsetSpecs(paths);

  const pathReports = paths.map((path) => {
    const spec = extractOffsetSpec(path);
    return {
      pathId: path.id,
      hasSpec: !!spec,
      spec: spec
        ? {
            distance: spec.distanceMm,
            side: spec.side,
            why: spec.why,
            formula: spec.formula,
          }
        : null,
    };
  });

  return {
    summary: validation.summary,
    allValid: validation.allValid,
    paths: pathReports,
  };
}

// =============================================================================
// FINGERPRINT
// =============================================================================

/**
 * Generate stable fingerprint for offset spec.
 *
 * Uses stable JSON stringification for deterministic hashing.
 *
 * @param spec Offset specification
 * @returns SHA-256 fingerprint (placeholder - needs crypto import)
 */
export function generateOffsetSpecFingerprint(spec: OffsetSpec): string {
  // Stable stringify (sort keys)
  const stableObj = {
    version: spec.version,
    distanceMm: spec.distanceMm,
    side: spec.side,
    why: [...spec.why].sort(),
    inputs: {
      toolDiameterMm: spec.inputs.toolDiameterMm,
      toolRadiusMm: spec.inputs.toolRadiusMm,
      stockToLeaveMm: spec.inputs.stockToLeaveMm,
      kerfAllowanceMm: spec.inputs.kerfAllowanceMm,
      userAllowanceMm: spec.inputs.userAllowanceMm,
    },
    formula: spec.formula,
  };

  const json = JSON.stringify(stableObj);

  // Placeholder: in production, use SHA-256
  // For now, return a simple hash
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `offset_${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

/**
 * Add fingerprint to offset spec.
 *
 * @param spec Offset specification (mutated in place)
 * @returns Spec with fingerprint
 */
export function addFingerprintToSpec(spec: OffsetSpec): OffsetSpec {
  spec.fingerprint = generateOffsetSpecFingerprint(spec);
  return spec;
}
