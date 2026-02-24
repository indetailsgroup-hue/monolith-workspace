/**
 * Verify Types - TrustReport-style verification
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - VerifyReport: Trust verification result
 * - VerifyIssue: Individual verification issue
 *
 * v1.0: Initial verify types
 */

/** Issue severity levels */
export type VerifySeverity = 'INFO' | 'WARN' | 'ERROR';

/**
 * Individual verification issue.
 */
export interface VerifyIssue {
  /** Severity level */
  severity: VerifySeverity;
  /** Issue code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** File path if applicable */
  path?: string;
}

/**
 * Verification report.
 */
export interface VerifyReport {
  /** Overall verification result (true if no ERROR issues) */
  ok: boolean;
  /** All verification issues */
  issues: VerifyIssue[];
}
