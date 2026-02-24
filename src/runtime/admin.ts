/**
 * Admin Control Module
 *
 * MVP admin authentication using passphrase (dev/mock).
 * Production should use SSO/role-based + hardware token.
 *
 * Features:
 * - Admin session with time-limited access
 * - SHA-256 passphrase verification
 * - Session expiry for security
 *
 * G9 COMPLIANCE: Uses unsafeStorage boundary for localStorage access.
 */

import {
  readString,
  readBooleanFlag,
  readTimestamp,
  writeRaw,
  writeBooleanFlag,
  remove,
} from '../core/persistence/unsafeStorage';

const LS_ADMIN_HASH = 'monolith.admin.pass.sha256';
const LS_ADMIN_ON = 'monolith.admin.session.on';
const LS_ADMIN_UNTIL = 'monolith.admin.session.until';

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Add minutes to current time
 */
function addMinutesIso(minutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/**
 * Compute SHA-256 hash as hex string
 */
async function sha256Hex(s: string): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error('crypto.subtle not available.');
  }
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Bootstrap admin with initial passphrase
 * Call this once to set up admin credentials
 *
 * @param passphrase - Admin passphrase to set
 */
export async function adminBootstrap(passphrase: string): Promise<void> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Admin passphrase must be at least 8 characters.');
  }
  const hash = await sha256Hex(passphrase);
  writeRaw(LS_ADMIN_HASH, hash);
}

/**
 * Check if admin has been bootstrapped
 */
export function isAdminBootstrapped(): boolean {
  return !!readString(LS_ADMIN_HASH);
}

/**
 * Check if admin session is currently active
 */
export function isAdminSessionActive(): boolean {
  const on = readBooleanFlag(LS_ADMIN_ON);
  const until = readTimestamp(LS_ADMIN_UNTIL);
  if (!on || !until) return false;
  return until > nowIso();
}

/**
 * Get admin session expiry time
 */
export function getAdminSessionExpiry(): string | null {
  if (!isAdminSessionActive()) return null;
  return readTimestamp(LS_ADMIN_UNTIL);
}

/**
 * Attempt admin login
 *
 * @param passphrase - Admin passphrase
 * @param minutes - Session duration in minutes (default 15)
 * @returns True if login successful
 */
export async function adminLogin(passphrase: string, minutes = 15): Promise<boolean> {
  const expected = readString(LS_ADMIN_HASH);
  if (!expected) {
    throw new Error('Admin bootstrap not set. Call adminBootstrap() first.');
  }

  const hash = await sha256Hex(passphrase);
  if (hash !== expected) {
    return false;
  }

  writeBooleanFlag(LS_ADMIN_ON, true);
  writeRaw(LS_ADMIN_UNTIL, addMinutesIso(minutes));
  return true;
}

/**
 * End admin session
 */
export function adminLogout(): void {
  writeBooleanFlag(LS_ADMIN_ON, false);
  remove(LS_ADMIN_UNTIL);
}

/**
 * Clear admin credentials (for reset)
 */
export function adminClearCredentials(): void {
  adminLogout();
  remove(LS_ADMIN_HASH);
}

/**
 * Get admin session info for display
 */
export function getAdminSessionInfo(): {
  bootstrapped: boolean;
  active: boolean;
  expiresAt: string | null;
} {
  return {
    bootstrapped: isAdminBootstrapped(),
    active: isAdminSessionActive(),
    expiresAt: getAdminSessionExpiry(),
  };
}
