// src/core/manufacturing/sim/simReport.v1.ts
/**
 * Simulation Report Contracts.
 *
 * Types for IR program simulation and verification.
 * Gate uses SimulationReport to determine PASS/FAIL.
 *
 * v0.10.7.3 - Simulation Kernel
 */

// =============================================================================
// SEVERITY & ISSUES
// =============================================================================

/**
 * Simulation issue severity.
 */
export type SimSeverity = "ERROR" | "WARN" | "INFO";

/**
 * Simulation issue code.
 *
 * ERROR codes block export; WARN codes allow with flag.
 */
export type SimIssueCode =
  // Safety (ERROR)
  | "RAPID_XY_BELOW_SAFEZ"
  | "TOOLCHANGE_WITH_SPINDLE_ON"
  | "CUT_MOVE_WITHOUT_SPINDLE"
  | "JUMP_WITHOUT_RETRACT"
  | "OUT_OF_SHEET_BOUNDS"
  | "ENTER_FORBIDDEN_ZONE"
  // Quality (WARN)
  | "EXCESSIVE_PLUNGE_RATE"
  | "TINY_SEGMENTS"
  | "ARC_RADIUS_MISMATCH"
  | "FEED_ZERO_OR_NEG"
  | "TOO_MANY_MOVES"
  // Info
  | "SIMULATION_COMPLETE";

/**
 * Simulation issue.
 */
export interface SimIssue {
  /** Issue code */
  code: SimIssueCode;

  /** Severity level */
  severity: SimSeverity;

  /** Human-readable message */
  message: string;

  /** Move index where issue occurred */
  atMoveIndex: number;

  /** Additional context data */
  context?: Record<string, unknown>;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Simulation statistics.
 */
export interface SimStats {
  /** Total number of moves */
  totalMoves: number;

  /** Total rapid distance (mm) */
  rapidDistanceMm: number;

  /** Total cutting distance (mm) */
  cutDistanceMm: number;

  /** Estimated machining time (seconds) */
  estimatedTimeSec: number;

  /** Minimum Z reached */
  minZ: number;

  /** Maximum Z reached */
  maxZ: number;

  /** XY bounding box */
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  /** Tool change count */
  toolChanges?: number;

  /** Total arc count */
  arcCount?: number;
}

// =============================================================================
// SHEET & ZONES
// =============================================================================

/**
 * Sheet XY bounds.
 */
export interface SheetBounds {
  /** Minimum X (mm) */
  minX: number;

  /** Minimum Y (mm) */
  minY: number;

  /** Maximum X (mm) */
  maxX: number;

  /** Maximum Y (mm) */
  maxY: number;
}

/**
 * Forbidden zone kind.
 */
export type ForbiddenZoneKind = "CLAMP" | "NO_CUT" | "KEEP_OUT" | "VACUUM_POD";

/**
 * Forbidden zone definition.
 *
 * Rectangular region where cutting is not allowed.
 */
export interface ForbiddenZone {
  /** Zone identifier */
  id: string;

  /** Zone kind */
  kind: ForbiddenZoneKind;

  /** Zone rectangle (XY) */
  rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  /** Minimum Z if zone protrudes (e.g., clamp height) */
  zMin?: number;

  /** Maximum Z (usually 0 or above sheet) */
  zMax?: number;

  /** Optional description */
  description?: string;
}

// =============================================================================
// SIMULATION REPORT
// =============================================================================

/**
 * Simulation verdict.
 */
export type SimVerdict = "PASS" | "FAIL";

/**
 * Simulation audit info.
 */
export interface SimAudit {
  /** Rules version used */
  rulesVersion: string;

  /** Report fingerprint (SHA-256 of report excluding this field) */
  reportFp: string;

  /** Simulation timestamp */
  simulatedAt?: string;

  /** Simulator version */
  simulatorVersion?: string;
}

/**
 * Simulation Report.
 *
 * Complete result of IR program simulation.
 * Gate uses verdict to determine PASS/FAIL.
 */
export interface SimulationReport {
  /** Report version */
  version: "1.0";

  /** Job ID */
  jobId: string;

  /** Sheet ID */
  sheetId: string;

  /** IR program fingerprint */
  programFp: string;

  /** All issues found */
  issues: SimIssue[];

  /** Simulation statistics */
  stats: SimStats;

  /** Overall verdict */
  verdict: SimVerdict;

  /** Audit information */
  audit: SimAudit;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create empty simulation stats.
 */
export function createEmptyStats(): SimStats {
  return {
    totalMoves: 0,
    rapidDistanceMm: 0,
    cutDistanceMm: 0,
    estimatedTimeSec: 0,
    minZ: 0,
    maxZ: 0,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    toolChanges: 0,
    arcCount: 0,
  };
}

/**
 * Create default sheet bounds.
 */
export function createDefaultSheetBounds(
  width: number,
  height: number
): SheetBounds {
  return {
    minX: 0,
    minY: 0,
    maxX: width,
    maxY: height,
  };
}

/**
 * Check if point is inside rectangle.
 */
export function isInRect(
  x: number,
  y: number,
  rect: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/**
 * Check if point is inside bounds (with tolerance).
 */
export function isInBounds(
  x: number,
  y: number,
  bounds: SheetBounds,
  tolerance: number = 0.01
): boolean {
  return (
    x >= bounds.minX - tolerance &&
    x <= bounds.maxX + tolerance &&
    y >= bounds.minY - tolerance &&
    y <= bounds.maxY + tolerance
  );
}

/**
 * Get error issues from report.
 */
export function getErrorIssues(report: SimulationReport): SimIssue[] {
  return report.issues.filter((i) => i.severity === "ERROR");
}

/**
 * Get warning issues from report.
 */
export function getWarningIssues(report: SimulationReport): SimIssue[] {
  return report.issues.filter((i) => i.severity === "WARN");
}

/**
 * Format simulation report for display.
 */
export function formatSimulationReport(report: SimulationReport): string[] {
  const lines: string[] = [];

  lines.push(`=== Simulation Report ===`);
  lines.push(`Job: ${report.jobId} | Sheet: ${report.sheetId}`);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(``);

  // Stats
  lines.push(`--- Statistics ---`);
  lines.push(`Total moves: ${report.stats.totalMoves}`);
  lines.push(`Rapid distance: ${report.stats.rapidDistanceMm.toFixed(1)} mm`);
  lines.push(`Cut distance: ${report.stats.cutDistanceMm.toFixed(1)} mm`);
  lines.push(`Estimated time: ${report.stats.estimatedTimeSec.toFixed(1)} sec`);
  lines.push(`Z range: ${report.stats.minZ.toFixed(2)} to ${report.stats.maxZ.toFixed(2)} mm`);
  lines.push(``);

  // Issues
  if (report.issues.length > 0) {
    lines.push(`--- Issues (${report.issues.length}) ---`);
    for (const issue of report.issues) {
      const prefix = issue.severity === "ERROR" ? "❌" : issue.severity === "WARN" ? "⚠️" : "ℹ️";
      lines.push(`${prefix} [${issue.code}] at move ${issue.atMoveIndex}: ${issue.message}`);
    }
  } else {
    lines.push(`--- No issues found ---`);
  }

  return lines;
}
