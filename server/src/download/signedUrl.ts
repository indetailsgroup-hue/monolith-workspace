/**
 * Signed URL Utilities
 *
 * Step 10: Time-limited, HMAC-signed download URLs
 *
 * Features:
 * - HMAC-SHA256 signature
 * - Time-to-live (TTL) expiration
 * - Path/hash binding (prevents URL tampering)
 * - Constant-time comparison (timing attack safe)
 */

import crypto from 'node:crypto';

// ============================================================================
// Configuration
// ============================================================================

function getSecret(): string {
  const secret = process.env.SIGNED_URL_SECRET ?? '';
  // Fail closed: never fall back to a shared/public default secret, which would
  // let anyone forge signed download URLs (FS-B0-02). The server startup guard
  // (loadServerSecretsOrExit) enforces this before serving; this throw is the
  // last line of defence for any code path that reaches here unconfigured.
  if (!secret || secret === 'dev-secret-change-in-production' || secret.length < 16) {
    throw new Error('SIGNED_URL_SECRET is not configured with a strong value (>= 16 chars)');
  }
  return secret;
}

function getDefaultTTL(): number {
  return Number(process.env.SIGNED_URL_TTL_SECONDS) || 600; // 10 minutes
}

function getBaseUrl(): string {
  return process.env.BASE_URL || 'http://localhost:3001';
}

// ============================================================================
// HMAC Helpers
// ============================================================================

function hmacHex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// ============================================================================
// Signed URL Generation
// ============================================================================

export interface SignedUrlInput {
  sha256: string;
  mime: string;
  filename?: string;
  ttlSeconds?: number;
  baseUrl?: string;
}

export interface SignedUrlOutput {
  url: string;
  expiresAt: Date;
  expiresAtIso: string;
}

/**
 * Generate a signed download URL.
 *
 * URL format: /download?sha256=<hash>&exp=<timestamp>&mime=<type>&fn=<filename>&sig=<signature>
 *
 * The signature covers: sha256, exp, mime, fn
 */
export function makeSignedDownloadUrl(input: SignedUrlInput): SignedUrlOutput {
  const exp = Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? getDefaultTTL());
  const secret = getSecret();
  const baseUrl = input.baseUrl ?? getBaseUrl();

  const filename = input.filename || input.sha256.slice(0, 16);

  // Canonical string for signing (order matters!)
  const canonical = [
    `sha256=${input.sha256}`,
    `exp=${exp}`,
    `mime=${encodeURIComponent(input.mime)}`,
    `fn=${encodeURIComponent(filename)}`,
  ].join('&');

  const sig = hmacHex(secret, canonical);

  const url = `${baseUrl}/download?${canonical}&sig=${sig}`;

  const expiresAt = new Date(exp * 1000);

  return {
    url,
    expiresAt,
    expiresAtIso: expiresAt.toISOString(),
  };
}

// ============================================================================
// Signed URL Verification
// ============================================================================

export interface VerifyResult {
  ok: boolean;
  reason?: 'MISSING_PARAMS' | 'EXPIRED' | 'SIG_INVALID';
  sha256?: string;
  mime?: string;
  filename?: string;
}

/**
 * Verify a signed download URL query parameters.
 *
 * @param query - Express req.query object
 */
export function verifySignedDownloadQuery(query: Record<string, unknown>): VerifyResult {
  const sha256 = String(query.sha256 || '');
  const exp = Number(query.exp || 0);
  const mime = String(query.mime || '');
  const fn = String(query.fn || '');
  const sig = String(query.sig || '');

  // Check required params
  if (!sha256 || !exp || !mime || !sig) {
    return { ok: false, reason: 'MISSING_PARAMS' };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { ok: false, reason: 'EXPIRED' };
  }

  // Reconstruct canonical string
  const canonical = [
    `sha256=${sha256}`,
    `exp=${exp}`,
    `mime=${encodeURIComponent(mime)}`,
    `fn=${encodeURIComponent(fn)}`,
  ].join('&');

  // Verify signature
  const secret = getSecret();
  const expected = hmacHex(secret, canonical);

  if (!timingSafeCompare(expected, sig)) {
    return { ok: false, reason: 'SIG_INVALID' };
  }

  return {
    ok: true,
    sha256,
    mime,
    filename: fn || undefined,
  };
}

// ============================================================================
// URL Revocation (Optional - for future use)
// ============================================================================

// In production, you might want to track revoked URLs/hashes
// This is a simple in-memory implementation for reference

const revokedHashes = new Set<string>();

/**
 * Revoke all URLs for a specific hash.
 */
export function revokeHash(sha256: string): void {
  revokedHashes.add(sha256);
}

/**
 * Check if a hash has been revoked.
 */
export function isHashRevoked(sha256: string): boolean {
  return revokedHashes.has(sha256);
}

/**
 * Clear all revocations (for testing).
 */
export function clearRevocations(): void {
  revokedHashes.clear();
}
