// src/core/manufacturing/verify/consistencyReport.v1.ts
/**
 * Consistency Report Contracts.
 *
 * Types for DXF vs IR geometry consistency verification.
 * Proves that exported G-code matches declared manufacturing intent.
 *
 * v0.10.8.2 - Geometry Consistency Check
 */

// =============================================================================
// SEVERITY & CODES
// =============================================================================

/**
 * Consistency issue severity.
 */
export type ConsistencySeverity = "BLOCK" | "WARN" | "INFO";

/**
 * Consistency issue codes.
 */
export type ConsistencyIssueCode =
  // Presence (BLOCK)
  | "MISSING_PROFILE_THROUGH"
  | "MISSING_DRILL_FEATURE"
  | "MISSING_SLOT_FEATURE"
  | "MISSING_POCKET_FEATURE"
  | "EXTRA_TOOLPATH"
  // Geometry equivalence (BLOCK/WARN)
  | "OUTER_MISMATCH"
  | "OUTER_MISMATCH_WARN"
  | "INNER_MISMATCH"
  | "INNER_MISMATCH_WARN"
  | "FEATURE_MISMATCH"
  // Tool/offset (BLOCK)
  | "MISSING_THROUGH_TOOL_MAP"
  | "TOOL_RADIUS_MISMATCH"
  | "OFFSET_SIDE_WRONG"
  // Drill specific
  | "DRILL_POSITION_MISMATCH"
  | "DRILL_DIAMETER_MISMATCH"
  | "DRILL_DEPTH_MISMATCH"
  // Topology
  | "WINDING_DIRECTION_WRONG"
  | "PATH_NOT_CLOSED"
  // Info
  | "CONSISTENCY_COMPLETE";

// =============================================================================
// ISSUES
// =============================================================================

/**
 * Consistency issue.
 */
export interface ConsistencyIssue {
  /** Issue code */
  code: ConsistencyIssueCode;

  /** Severity level */
  severity: ConsistencySeverity;

  /** Human-readable message */
  message: string;

  /** Part ID */
  partId?: string;

  /** Operation ID */
  opId?: string;

  /** Feature ID */
  featureId?: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

// =============================================================================
// COMPARISON STATS
// =============================================================================

/**
 * Path comparison statistics.
 */
export interface PathComparisonStats {
  /** Maximum absolute error (mm) */
  maxAbsErr: number;

  /** Mean absolute error (mm) */
  meanAbsErr: number;

  /** Number of samples taken */
  sampleCount: number;

  /** Expected distance (mm) */
  expectedDist: number;

  /** Actual mean distance (mm) */
  actualMeanDist: number;

  /** Samples with error > warn threshold */
  warnCount: number;

  /** Samples with error > block threshold */
  blockCount: number;
}

/**
 * Feature match result.
 */
export interface FeatureMatchResult {
  /** Feature ID from canonical */
  canonFeatureId: string;

  /** Matched executed path ID (if found) */
  execPathId?: string;

  /** Match status */
  status: "MATCHED" | "MISSING" | "MISMATCH";

  /** Comparison stats (if matched) */
  stats?: PathComparisonStats;
}

// =============================================================================
// REPORT
// =============================================================================

/**
 * Consistency verdict.
 */
export type ConsistencyVerdict = "PASS" | "FAIL";

/**
 * Consistency audit info.
 */
export interface ConsistencyAudit {
  /** Rules version */
  rulesVersion: string;

  /** Report fingerprint */
  reportFp: string;

  /** Verification timestamp */
  verifiedAt?: string;

  /** Checker version */
  checkerVersion?: string;
}

/**
 * Consistency Report.
 *
 * Complete DXF vs IR geometry consistency result.
 */
export interface ConsistencyReport {
  /** Report version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** DXF/canonical model fingerprint */
  dxfFp: string;

  /** IR program fingerprint */
  irFp: string;

  /** All issues found */
  issues: ConsistencyIssue[];

  /** Overall verdict */
  verdict: ConsistencyVerdict;

  /** Per-part match results */
  partResults?: Record<string, {
    outerMatch: PathComparisonStats | null;
    innerMatches: FeatureMatchResult[];
    featureMatches: FeatureMatchResult[];
  }>;

  /** Audit information */
  audit: ConsistencyAudit;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create empty consistency report.
 */
export function createEmptyConsistencyReport(
  jobId: string,
  sheetId: string,
  dxfFp: string,
  irFp: string
): ConsistencyReport {
  return {
    version: "1.0",
    jobId,
    sheetId,
    dxfFp,
    irFp,
    issues: [],
    verdict: "PASS",
    audit: {
      rulesVersion: "10.8.2.v1",
      reportFp: "",
    },
  };
}

/**
 * Get blocking issues.
 */
export function getConsistencyBlockingIssues(
  report: ConsistencyReport
): ConsistencyIssue[] {
  return report.issues.filter((i) => i.severity === "BLOCK");
}

/**
 * Get warning issues.
 */
export function getConsistencyWarningIssues(
  report: ConsistencyReport
): ConsistencyIssue[] {
  return report.issues.filter((i) => i.severity === "WARN");
}

/**
 * Check if report is passing.
 */
export function isConsistencyPassing(report: ConsistencyReport): boolean {
  return report.verdict === "PASS";
}

/**
 * Format consistency report for display.
 */
export function formatConsistencyReport(report: ConsistencyReport): string[] {
  const lines: string[] = [];

  lines.push(`=== Consistency Report ===`);
  lines.push(`Job: ${report.jobId} | Sheet: ${report.sheetId}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(``);

  lines.push(`--- Fingerprints ---`);
  lines.push(`DXF: ${report.dxfFp.substring(0, 16)}...`);
  lines.push(`IR:  ${report.irFp.substring(0, 16)}...`);
  lines.push(``);

  const blocks = getConsistencyBlockingIssues(report);
  const warnings = getConsistencyWarningIssues(report);

  if (blocks.length > 0) {
    lines.push(`--- Blocking Issues (${blocks.length}) ---`);
    for (const issue of blocks) {
      lines.push(`  ❌ [${issue.code}] ${issue.message}`);
      if (issue.partId) {
        lines.push(`     part: ${issue.partId}`);
      }
    }
    lines.push(``);
  }

  if (warnings.length > 0) {
    lines.push(`--- Warnings (${warnings.length}) ---`);
    for (const issue of warnings) {
      lines.push(`  ⚠️ [${issue.code}] ${issue.message}`);
    }
    lines.push(``);
  }

  if (blocks.length === 0 && warnings.length === 0) {
    lines.push(`--- No issues found ---`);
  }

  return lines;
}
