/**
 * auditTelemetry.ts - Tuning Audit Event System
 *
 * PURPOSE:
 * - Log all tuning apply/rollback/reject actions
 * - Provide audit trail for configuration changes
 * - Support compliance and debugging
 *
 * AUDIT EVENTS:
 * - APPLY: Tuning patch was applied
 * - ROLLBACK: Tuning was rolled back
 * - REJECT: Apply was rejected by policy
 *
 * USAGE:
 * import { pushTuningAudit, getRecentAudits } from './auditTelemetry';
 *
 * pushTuningAudit({
 *   action: 'APPLY',
 *   reportId: 'shadow-123',
 *   sessionId: 'tuning-456',
 *   patch: { nearPaddingMm: { from: 150, to: 120 } },
 * });
 */

import type { TelemetryEventBase, TelemetryLevel } from './telemetryTypes';
import type { RuntimeTuningPatch } from '../config/runtimeTuningTypes';
import { TELEMETRY } from './telemetrySingleton';
import { nowMs } from './timer';

// ============================================
// AUDIT EVENT TYPE
// ============================================

export type TuningAuditAction = 'APPLY' | 'ROLLBACK' | 'REJECT';

export interface TuningAuditEvent extends TelemetryEventBase {
  kind: 'TUNING_AUDIT';

  /** Action that was performed */
  action: TuningAuditAction;

  /** Session ID for this tuning session */
  sessionId: string | null;

  /** Shadow report ID that led to this action */
  reportId: string | null;

  /** The patch that was applied/rejected/rolled-back */
  patch?: RuntimeTuningPatch;

  /** Reasons for rejection (if action is REJECT) */
  reasons?: string[];

  /** Warnings (even for successful actions) */
  warnings?: string[];

  /** Config snapshot after action */
  configSnapshot?: Record<string, number>;

  /** Duration tuning was active (for ROLLBACK) */
  activeDurationMs?: number;
}

// ============================================
// PUSH AUDIT EVENT
// ============================================

export interface PushAuditArgs {
  action: TuningAuditAction;
  sessionId: string | null;
  reportId: string | null;
  patch?: RuntimeTuningPatch;
  reasons?: string[];
  warnings?: string[];
  configSnapshot?: Record<string, number>;
  activeDurationMs?: number;
}

/**
 * Push tuning audit event to telemetry
 */
export function pushTuningAudit(args: PushAuditArgs): void {
  if (!TELEMETRY.isEnabled()) return;

  // Determine level based on action
  let level: TelemetryLevel = 'INFO';
  if (args.action === 'REJECT') {
    level = 'WARN';
  }

  const event: TuningAuditEvent = {
    ts: nowMs(),
    level,
    kind: 'TUNING_AUDIT',
    action: args.action,
    sessionId: args.sessionId,
    reportId: args.reportId,
    patch: args.patch,
    reasons: args.reasons,
    warnings: args.warnings,
    configSnapshot: args.configSnapshot,
    activeDurationMs: args.activeDurationMs,
  };

  // Push to ring buffer
  TELEMETRY.push(event as any);

  // Increment counters
  TELEMETRY.inc('audit.total');
  TELEMETRY.inc(`audit.${args.action.toLowerCase()}`);

  // Log to console for visibility
  const icon = args.action === 'APPLY' ? 'v' :
    args.action === 'ROLLBACK' ? '<-' : 'x';
  console.log(`[TuningAudit] ${icon} ${args.action} (session: ${args.sessionId ?? 'none'})`);
}

// ============================================
// QUERY AUDITS
// ============================================

/**
 * Get recent audit events from telemetry
 */
export function getRecentAudits(limit: number = 10): TuningAuditEvent[] {
  const events = TELEMETRY.snapshot(200);
  return events
    .filter((e): e is TuningAuditEvent => e.kind === 'TUNING_AUDIT')
    .slice(0, limit);
}

/**
 * Get latest audit event
 */
export function getLatestAudit(): TuningAuditEvent | null {
  const audits = getRecentAudits(1);
  return audits[0] ?? null;
}

/**
 * Get audits for a specific session
 */
export function getAuditsForSession(sessionId: string): TuningAuditEvent[] {
  const events = TELEMETRY.snapshot(200);
  return events
    .filter((e): e is TuningAuditEvent =>
      e.kind === 'TUNING_AUDIT' && e.sessionId === sessionId
    );
}

// ============================================
// AUDIT STATISTICS
// ============================================

/**
 * Get audit statistics
 */
export function getAuditStats(): {
  total: number;
  applies: number;
  rollbacks: number;
  rejects: number;
} {
  return {
    total: TELEMETRY.counters['audit.total'] ?? 0,
    applies: TELEMETRY.counters['audit.apply'] ?? 0,
    rollbacks: TELEMETRY.counters['audit.rollback'] ?? 0,
    rejects: TELEMETRY.counters['audit.reject'] ?? 0,
  };
}

// ============================================
// FORMAT HELPERS
// ============================================

/**
 * Get color for audit action
 */
export function getAuditActionColor(action: TuningAuditAction): string {
  switch (action) {
    case 'APPLY':
      return '#4ade80'; // Green
    case 'ROLLBACK':
      return '#60a5fa'; // Blue
    case 'REJECT':
      return '#f87171'; // Red
    default:
      return '#94a3b8'; // Gray
  }
}

/**
 * Get icon for audit action
 */
export function getAuditActionIcon(action: TuningAuditAction): string {
  switch (action) {
    case 'APPLY':
      return '✓';
    case 'ROLLBACK':
      return '↩';
    case 'REJECT':
      return '✗';
    default:
      return '•';
  }
}

/**
 * Format audit event for display
 */
export function formatAuditEvent(audit: TuningAuditEvent): string {
  const lines: string[] = [];

  lines.push(`[${audit.action}] Session: ${audit.sessionId ?? 'N/A'}`);
  lines.push(`  Report: ${audit.reportId ?? 'N/A'}`);

  if (audit.patch) {
    const params = Object.keys(audit.patch);
    lines.push(`  Params: ${params.join(', ')}`);
  }

  if (audit.reasons?.length) {
    lines.push(`  Reasons: ${audit.reasons.join('; ')}`);
  }

  if (audit.activeDurationMs != null) {
    lines.push(`  Active Duration: ${(audit.activeDurationMs / 1000).toFixed(1)}s`);
  }

  return lines.join('\n');
}
