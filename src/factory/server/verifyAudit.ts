/**
 * Verify Audit Logger - Operational Tracing
 * PR-P1.1-B.3 Real Verifier Integration
 *
 * Records all verification runs for:
 * - Operational monitoring
 * - Security auditing
 * - Performance analysis
 *
 * @version 0.12.0
 */

import type { VerifyVerdict } from "../types/job";

// ============================================================================
// Audit Entry Interface
// ============================================================================

export interface VerifyAuditEntry {
  /** Unique audit entry ID */
  id: string;
  /** Job ID that was verified */
  jobId: string;
  /** Verification verdict */
  verdict: VerifyVerdict;
  /** Error/status code */
  code: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
  /** Whether mock mode was used */
  mockMode?: boolean;
  /** Error type if applicable */
  error?: string;
  /** Whether output was truncated */
  truncated?: boolean;
  /** Security alert flag */
  securityAlert?: boolean;
}

export interface RecordVerifyRunParams {
  jobId: string;
  verdict: VerifyVerdict;
  code: string;
  durationMs: number;
  mockMode?: boolean;
  error?: string;
  truncated?: boolean;
  securityAlert?: boolean;
}

// ============================================================================
// In-Memory Audit Store (for development/testing)
// ============================================================================

const auditLog: VerifyAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

// ============================================================================
// Audit ID Generation
// ============================================================================

function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `audit_${timestamp}_${random}`;
}

// ============================================================================
// Main Audit Function
// ============================================================================

/**
 * Record a verification run in the audit log.
 *
 * In production, this should:
 * 1. Write to structured logs (JSON format)
 * 2. Optionally persist to database
 * 3. Send security alerts for flagged entries
 */
export async function recordVerifyRun(
  params: RecordVerifyRunParams
): Promise<VerifyAuditEntry> {
  const entry: VerifyAuditEntry = {
    id: generateAuditId(),
    jobId: params.jobId,
    verdict: params.verdict,
    code: params.code,
    durationMs: params.durationMs,
    timestamp: new Date().toISOString(),
    mockMode: params.mockMode,
    error: params.error,
    truncated: params.truncated,
    securityAlert: params.securityAlert,
  };

  // 1. Add to in-memory log (for dev/testing)
  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.length = MAX_AUDIT_ENTRIES;
  }

  // 2. Write to structured logs
  writeStructuredLog(entry);

  // 3. Handle security alerts
  if (params.securityAlert) {
    await handleSecurityAlert(entry);
  }

  return entry;
}

// ============================================================================
// Structured Logging
// ============================================================================

interface StructuredLogEntry {
  level: "info" | "warn" | "error";
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Write structured JSON log entry.
 * In production, this would go to a logging service.
 */
function writeStructuredLog(entry: VerifyAuditEntry): void {
  const level = entry.securityAlert
    ? "error"
    : entry.verdict === "FAIL"
    ? "warn"
    : "info";

  const logEntry: StructuredLogEntry = {
    level,
    event: "verify_run",
    data: {
      auditId: entry.id,
      jobId: entry.jobId,
      verdict: entry.verdict,
      code: entry.code,
      durationMs: entry.durationMs,
      mockMode: entry.mockMode ?? false,
      error: entry.error,
      truncated: entry.truncated ?? false,
      securityAlert: entry.securityAlert ?? false,
    },
    timestamp: entry.timestamp,
  };

  // In production: send to logging service
  // For now: console output in JSON format
  if (process.env.NODE_ENV !== "test") {
    console.log(JSON.stringify(logEntry));
  }
}

// ============================================================================
// Security Alerts
// ============================================================================

/**
 * Handle security alert entries.
 * These require immediate attention.
 */
async function handleSecurityAlert(entry: VerifyAuditEntry): Promise<void> {
  const alertEntry = {
    level: "SECURITY_ALERT",
    event: "verify_security_alert",
    data: {
      auditId: entry.id,
      jobId: entry.jobId,
      error: entry.error,
      timestamp: entry.timestamp,
    },
  };

  // In production: send to security monitoring system
  console.error(JSON.stringify(alertEntry));

  // TODO: Implement actual alerting
  // - Send to Slack/PagerDuty
  // - Create incident ticket
  // - Block further operations
}

// ============================================================================
// Query Functions (for monitoring/debugging)
// ============================================================================

/**
 * Get recent audit entries
 */
export function getRecentAuditEntries(limit = 100): VerifyAuditEntry[] {
  return auditLog.slice(0, limit);
}

/**
 * Get audit entries for a specific job
 */
export function getJobAuditEntries(jobId: string): VerifyAuditEntry[] {
  return auditLog.filter((entry) => entry.jobId === jobId);
}

/**
 * Get audit entries with errors
 */
export function getErrorAuditEntries(): VerifyAuditEntry[] {
  return auditLog.filter((entry) => entry.error !== undefined);
}

/**
 * Get security alert entries
 */
export function getSecurityAlertEntries(): VerifyAuditEntry[] {
  return auditLog.filter((entry) => entry.securityAlert === true);
}

/**
 * Get audit statistics
 */
export function getAuditStats(): {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: number;
  securityAlerts: number;
  avgDurationMs: number;
} {
  const stats = {
    total: auditLog.length,
    passed: 0,
    failed: 0,
    warnings: 0,
    errors: 0,
    securityAlerts: 0,
    avgDurationMs: 0,
  };

  let totalDuration = 0;

  for (const entry of auditLog) {
    totalDuration += entry.durationMs;

    switch (entry.verdict) {
      case "PASS":
        stats.passed++;
        break;
      case "FAIL":
        stats.failed++;
        break;
      case "PASS_WITH_WARN":
        stats.warnings++;
        break;
    }

    if (entry.error) {
      stats.errors++;
    }
    if (entry.securityAlert) {
      stats.securityAlerts++;
    }
  }

  stats.avgDurationMs = stats.total > 0 ? Math.round(totalDuration / stats.total) : 0;

  return stats;
}

/**
 * Clear audit log (for testing)
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}
