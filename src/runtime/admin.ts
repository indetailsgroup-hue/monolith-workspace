/**
 * Admin Session Management (v0.6)
 *
 * Tracks whether an admin session is currently active.
 * Admin sessions gate:
 * - Installing/clearing revocation policies
 * - Managing revocation rules
 * - Exporting signed artifacts
 *
 * Default: inactive (no admin session)
 *
 * Note: Production should use passphrase verification.
 * This is a dev-friendly localStorage implementation.
 */

const LS_ADMIN_SESSION = 'iimos.admin.sessionActive';

/**
 * Check if admin session is currently active.
 */
export function isAdminSessionActive(): boolean {
  return localStorage.getItem(LS_ADMIN_SESSION) === 'true';
}

/**
 * Start admin session.
 */
export function startAdminSession(): void {
  localStorage.setItem(LS_ADMIN_SESSION, 'true');
}

/**
 * End admin session.
 */
export function endAdminSession(): void {
  localStorage.removeItem(LS_ADMIN_SESSION);
}
