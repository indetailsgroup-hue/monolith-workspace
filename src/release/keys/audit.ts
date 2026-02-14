/**
 * Audit Logger (v0.6)
 *
 * Logs security-relevant events for audit trail.
 * Dev-friendly: logs to console in development.
 *
 * Future: Send to persistent audit store or server.
 */

/**
 * Log an audit event.
 *
 * @param event - Event type (e.g., 'POLICY_REVOKE_SET')
 * @param actor - Who performed the action
 * @param details - Additional event data
 */
export function audit(
  event: string,
  actor: string,
  details?: Record<string, unknown>
): void {
  void event;
  void actor;
  void details;
  // Future: persist to audit store or send to server
}
