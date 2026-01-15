/**
 * JWK Store - Public Key Registry
 *
 * Step 9: Server-side public key store for signature verification
 *
 * Features:
 * - Store public keys by keyId
 * - Support ECDSA P-256 and Ed25519 keys
 * - Key metadata (factoryId, scope, expiration)
 */

import { KeyObject, createPublicKey } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type KeyAlgorithm = 'ECDSA_P256_SHA256' | 'ED25519';

export interface StoredPublicKey {
  keyId: string;
  algorithm: KeyAlgorithm;
  publicJwk: JsonWebKey;
  publicKeyObject?: KeyObject;
  factoryId?: string;
  scope?: string;
  createdAtIso: string;
  expiresAtIso?: string;
  revoked?: boolean;
  revokedAtIso?: string;
}

// ============================================================================
// In-Memory Store
// ============================================================================

const keyStore = new Map<string, StoredPublicKey>();

/**
 * Register a public key.
 */
export function registerPublicKey(
  keyId: string,
  publicJwk: JsonWebKey,
  options?: {
    factoryId?: string;
    scope?: string;
    expiresAtIso?: string;
  }
): StoredPublicKey {
  // Determine algorithm from JWK
  const algorithm = detectAlgorithm(publicJwk);

  // Convert JWK to KeyObject for Node.js crypto
  let publicKeyObject: KeyObject | undefined;
  try {
    publicKeyObject = createPublicKey({ key: publicJwk, format: 'jwk' });
  } catch (err) {
    console.warn(`[JwkStore] Failed to create KeyObject for ${keyId}:`, err);
  }

  const storedKey: StoredPublicKey = {
    keyId,
    algorithm,
    publicJwk,
    publicKeyObject,
    factoryId: options?.factoryId,
    scope: options?.scope,
    createdAtIso: new Date().toISOString(),
    expiresAtIso: options?.expiresAtIso,
    revoked: false,
  };

  keyStore.set(keyId, storedKey);
  return storedKey;
}

/**
 * Get a public key by ID.
 */
export function getPublicKey(keyId: string): StoredPublicKey | null {
  return keyStore.get(keyId) ?? null;
}

/**
 * Check if a key exists and is valid (not expired, not revoked).
 */
export function isKeyValid(keyId: string): boolean {
  const key = keyStore.get(keyId);
  if (!key) return false;

  // Check revocation
  if (key.revoked) return false;

  // Check expiration
  if (key.expiresAtIso) {
    const now = new Date();
    const expires = new Date(key.expiresAtIso);
    if (now > expires) return false;
  }

  return true;
}

/**
 * Revoke a key.
 */
export function revokeKey(keyId: string): boolean {
  const key = keyStore.get(keyId);
  if (!key) return false;

  key.revoked = true;
  key.revokedAtIso = new Date().toISOString();
  return true;
}

/**
 * List all registered key IDs.
 */
export function listKeyIds(): string[] {
  return Array.from(keyStore.keys());
}

/**
 * List all keys for a specific factory.
 */
export function listKeysForFactory(factoryId: string): StoredPublicKey[] {
  return Array.from(keyStore.values()).filter((k) => k.factoryId === factoryId);
}

/**
 * Clear all keys (for testing).
 */
export function clearKeys(): void {
  keyStore.clear();
}

// ============================================================================
// Helpers
// ============================================================================

function detectAlgorithm(jwk: JsonWebKey): KeyAlgorithm {
  // ECDSA P-256
  if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return 'ECDSA_P256_SHA256';
  }

  // Ed25519 (OKP with crv Ed25519)
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    return 'ED25519';
  }

  // Default to ECDSA
  console.warn('[JwkStore] Unknown key type, defaulting to ECDSA:', jwk.kty, jwk.crv);
  return 'ECDSA_P256_SHA256';
}
