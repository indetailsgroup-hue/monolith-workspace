// src/core/manufacturing/verify/verifierReport.v1.ts
/**
 * Verifier Report Contracts.
 *
 * Types for manufacturing-grade toolpath verification.
 * Goes beyond kinematic simulation to validate:
 * - Depth vs material thickness (no gouge)
 * - Tool-feature compatibility
 * - Tab integrity across stages
 * - Clamp/fixture collision
 *
 * v0.10.8.1 - Toolpath Verifier
 */

// =============================================================================
// SEVERITY & CODES
// =============================================================================

/**
 * Verify issue severity.
 *
 * - BLOCK: Prevents export, factory-safety critical
 * - WARN: Allows export with review flag
 * - INFO: Informational only
 */
export type VerifySeverity = "BLOCK" | "WARN" | "INFO";

/**
 * Verify issue codes.
 */
export type VerifyIssueCode =
  // Depth & thickness (BLOCK)
  | "Z_BELOW_ALLOWED"
  | "Z_BELOW_ONION_PLANE"
  | "FLUTE_TOO_SHORT"
  | "DEPTH_EXCEEDS_THICKNESS"
  // Tool compatibility (BLOCK/WARN)
  | "FEATURE_TOO_SMALL_FOR_TOOL"
  | "INNER_RADIUS_LIMIT"
  | "STEPDOWN_EXCEEDS_LIMIT"
  // Tab integrity (BLOCK)
  | "TAB_ZONE_VIOLATION"
  | "THROUGH_HAS_GAPS"
  | "PREMATURE_THROUGH_CUT"
  // Clamp/fixture (BLOCK)
  | "CUT_IN_CLAMP_ZONE"
  | "RAPID_IN_CLAMP_ZONE_BELOW_SAFEZ"
  | "FIXTURE_COLLISION"
  // Continuity (BLOCK)
  | "DISCONTINUITY_WITHOUT_RETRACT"
  | "PATH_JUMP_IN_CUT"
  // Trace map (BLOCK)
  | "TRACE_MAP_MISMATCH"
  | "MISSING_TRACE_DATA"
  // Warnings
  | "PLUNGE_WITHOUT_SPINDLE"
  | "STEEP_PLUNGE_ANGLE"
  | "EXCESSIVE_STEPOVER"
  // Info
  | "VERIFICATION_COMPLETE";

// =============================================================================
// ISSUES
// =============================================================================

/**
 * Verification issue.
 */
export interface VerifyIssue {
  /** Issue code */
  code: VerifyIssueCode;

  /** Severity level */
  severity: VerifySeverity;

  /** Human-readable message */
  message: string;

  /** Move index where issue occurred */
  atMoveIndex?: number;

  /** Operation ID */
  opId?: string;

  /** Pass ID */
  passId?: string;

  /** Tool ID */
  toolId?: string;

  /** Part ID */
  partId?: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

// =============================================================================
// SAFETY BADGE
// =============================================================================

/**
 * Safety badge grade.
 *
 * - A: Clean pass, no issues
 * - B: Pass with warnings, review recommended
 * - C: Fail or manual review required
 */
export type SafetyGrade = "A" | "B" | "C";

/**
 * Safety badge status.
 */
export type SafetyStatus = "PASS" | "FAIL";

/**
 * Safety badge.
 *
 * Summary of verification result for Gate decision.
 */
export interface SafetyBadge {
  /** Overall status */
  status: SafetyStatus;

  /** Grade (A/B/C) */
  grade: SafetyGrade;

  /** Summary points */
  summary: string[];

  /** Requires manual review */
  requiresReview?: boolean;

  /** Timestamp */
  issuedAt?: string;
}

// =============================================================================
// VERIFIER REPORT
// =============================================================================

/**
 * Verifier audit info.
 */
export interface VerifierAudit {
  /** Rules version */
  rulesVersion: string;

  /** Report fingerprint */
  reportFp: string;

  /** Verification timestamp */
  verifiedAt?: string;

  /** Verifier version */
  verifierVersion?: string;
}

/**
 * Verifier Report.
 *
 * Complete manufacturing verification result.
 * Gate uses badge to determine PASS/FAIL.
 */
export interface VerifierReport {
  /** Report version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** IR program fingerprint */
  irFp: string;

  /** All issues found */
  issues: VerifyIssue[];

  /** Safety badge */
  badge: SafetyBadge;

  /** Audit information */
  audit: VerifierAudit;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create empty verifier report.
 */
export function createEmptyVerifierReport(
  jobId: string,
  sheetId: string,
  irFp: string
): VerifierReport {
  return {
    version: "1.0",
    jobId,
    sheetId,
    irFp,
    issues: [],
    badge: {
      status: "PASS",
      grade: "A",
      summary: ["No issues found"],
    },
    audit: {
      rulesVersion: "10.8.1.v1",
      reportFp: "",
    },
  };
}

/**
 * Get blocking issues.
 */
export function getBlockingIssues(report: VerifierReport): VerifyIssue[] {
  return report.issues.filter((i) => i.severity === "BLOCK");
}

/**
 * Get warning issues.
 */
export function getWarningIssues(report: VerifierReport): VerifyIssue[] {
  return report.issues.filter((i) => i.severity === "WARN");
}

/**
 * Check if report is passing.
 */
export function isReportPassing(report: VerifierReport): boolean {
  return report.badge.status === "PASS";
}

/**
 * Check if report requires review.
 */
export function requiresManualReview(report: VerifierReport): boolean {
  return report.badge.grade === "B" || report.badge.requiresReview === true;
}

/**
 * Format verifier report for display.
 */
export function formatVerifierReport(report: VerifierReport): string[] {
  const lines: string[] = [];

  lines.push(`=== Verifier Report ===`);
  lines.push(`Job: ${report.jobId} | Sheet: ${report.sheetId}`);
  lines.push(`Status: ${report.badge.status} | Grade: ${report.badge.grade}`);
  lines.push(``);

  // Badge summary
  lines.push(`--- Safety Badge ---`);
  for (const s of report.badge.summary) {
    lines.push(`  ${s}`);
  }
  lines.push(``);

  // Issues
  const blocks = getBlockingIssues(report);
  const warnings = getWarningIssues(report);

  if (blocks.length > 0) {
    lines.push(`--- Blocking Issues (${blocks.length}) ---`);
    for (const issue of blocks) {
      lines.push(`  ❌ [${issue.code}] ${issue.message}`);
      if (issue.atMoveIndex !== undefined) {
        lines.push(`     at move ${issue.atMoveIndex}`);
      }
      if (issue.opId) {
        lines.push(`     op: ${issue.opId}`);
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

/**
 * Calculate badge from issues.
 */
export function calculateBadge(issues: VerifyIssue[]): SafetyBadge {
  const hasBlock = issues.some((i) => i.severity === "BLOCK");
  const hasWarn = issues.some((i) => i.severity === "WARN");

  if (hasBlock) {
    return {
      status: "FAIL",
      grade: "C",
      summary: [
        "Verification FAILED",
        `${issues.filter((i) => i.severity === "BLOCK").length} blocking issue(s)`,
      ],
      requiresReview: true,
      issuedAt: new Date().toISOString(),
    };
  }

  if (hasWarn) {
    return {
      status: "PASS",
      grade: "B",
      summary: [
        "PASS with warnings",
        `${issues.filter((i) => i.severity === "WARN").length} warning(s) - review recommended`,
      ],
      requiresReview: true,
      issuedAt: new Date().toISOString(),
    };
  }

  return {
    status: "PASS",
    grade: "A",
    summary: ["Factory-safe", "No issues detected"],
    requiresReview: false,
    issuedAt: new Date().toISOString(),
  };
}
