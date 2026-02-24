/**
 * Key Audit Log
 *
 * Tracks key management events for security auditing.
 * Stores events in localStorage (MVP); production should use
 * append-only storage or remote audit service.
 *
 * All key operations (import, trust, revoke, override) are logged.
 */

const LS_AUDIT = 'monolith.audit.keys.v1';
const MAX_EVENTS = 500;

/**
 * Audit event actions
 */
export type AuditAction =
  | 'KEY_IMPORT_BLOCKED'
  | 'KEY_IMPORTED_QUARANTINED'
  | 'KEY_IMPORTED'
  | 'KEY_TRUSTED'
  | 'KEY_REJECTED'
  | 'KEY_ACTIVATED'
  | 'KEY_REVOKED'
  | 'KEY_OVERRIDE_TRUST'
  | 'KEY_OVERRIDE_ACTIVATE'
  | 'POLICY_REVOKE_SET'
  | 'POLICY_REVOKE_CLEAR'
  | 'VERIFY_BLOCKED_REVOCATION'
  | 'VERIFY_BLOCKED_SCOPE';

/**
 * Audit event record
 */
export type AuditEvent = {
  /** ISO timestamp of event */
  atIso: string;
  /** Actor who performed the action */
  actor: string;
  /** Action type */
  action: AuditAction;
  /** Additional details */
  details: Record<string, unknown>;
};

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Load audit events from storage
 */
function load(): AuditEvent[] {
  const raw = localStorage.getItem(LS_AUDIT);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Save audit events to storage
 */
function save(events: AuditEvent[]): void {
  // Keep only last MAX_EVENTS entries
  const trimmed = events.slice(-MAX_EVENTS);
  localStorage.setItem(LS_AUDIT, JSON.stringify(trimmed, null, 2));
}

/**
 * Log an audit event
 *
 * @param action - The action being audited
 * @param actor - Who performed the action (e.g., "local", "local-admin")
 * @param details - Additional context
 */
export function audit(
  action: AuditAction,
  actor: string,
  details: Record<string, unknown>
): void {
  const events = load();
  events.push({
    atIso: nowIso(),
    actor,
    action,
    details,
  });
  save(events);
}

/**
 * Get audit events (newest first)
 *
 * @param limit - Maximum events to return (default all)
 * @returns Audit events
 */
export function listAudit(limit?: number): AuditEvent[] {
  const events = load().slice().reverse();
  return limit ? events.slice(0, limit) : events;
}

/**
 * Get audit events for a specific key
 *
 * @param keyId - Key ID to filter by
 * @returns Audit events for that key
 */
export function listAuditForKey(keyId: string): AuditEvent[] {
  return load()
    .filter((e) => e.details.keyId === keyId)
    .reverse();
}

/**
 * Clear all audit events (use with caution)
 */
export function clearAudit(): void {
  localStorage.removeItem(LS_AUDIT);
}

/**
 * Export audit log as JSON string
 */
export function exportAuditLog(): string {
  return JSON.stringify(load(), null, 2);
}
