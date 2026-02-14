/**
 * gateBundleTypes.ts - Gate Bundle Result Types
 *
 * Defines the structure of gate validation results.
 * Gate checking verifies that all cabinet configurations meet
 * manufacturing requirements before allowing export.
 *
 * @version 1.0.0
 */

/**
 * Single gate issue (error or warning)
 */
export interface GateIssue {
  /** Issue code (e.g., 'MINIFIX_DISTANCE', 'PANEL_THICKNESS') */
  code: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Affected cabinet ID */
  cabinetId?: string;
  /** Affected panel ID */
  panelId?: string;
}

/**
 * Gate result for a single cabinet
 */
export interface GateResultPerCabinet {
  /** Cabinet ID */
  cabinetId: string;
  /** Whether this cabinet passed gate */
  ok: boolean;
  /** Issues found for this cabinet */
  issues: GateIssue[];
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
}

/**
 * Complete gate bundle result across all cabinets
 */
export interface GateBundleResult {
  /** Whether ALL cabinets passed gate (no errors) */
  ok: boolean;
  /** Per-cabinet results */
  perCabinet: GateResultPerCabinet[];
  /** Global issues (not cabinet-specific) */
  globalIssues: GateIssue[];
  /** Total issue count (errors + warnings) */
  totalIssues: number;
  /** Error count across all cabinets */
  errorCount: number;
  /** Warning count across all cabinets */
  warningCount: number;
}
