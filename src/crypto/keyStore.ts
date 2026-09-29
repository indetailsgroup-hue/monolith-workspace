/**
 * Key Store - Dev-friendly key storage in localStorage
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - Stores keypairs in localStorage (dev/test mode)
 * - Auto-generates keypair on first use
 *
 * WARNING: Production should use HSM/KMS, not localStorage!
 *
 * v1.0: Initial key store
 */

import { readRaw, remove, writeJson } from '../core/persistence/unsafeStorage';

/** JWK key pair for storage */
export interface JwkPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  algorithm: string;
  createdAtIso: string;
}

const LS_PREFIX = 'monolith.keys.';

/**
 * Load key pair from localStorage.
 */
export function loadKeyPair(keyId: string): JwkPair | null {
  try {
    const raw = readRaw(LS_PREFIX + keyId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save key pair to localStorage.
 */
export function saveKeyPair(keyId: string, pair: JwkPair): void {
  writeJson(LS_PREFIX + keyId, pair);
}

/**
 * Delete key pair from localStorage.
 */
export function deleteKeyPair(keyId: string): void {
  remove(LS_PREFIX + keyId);
}

/**
 * List all stored key IDs.
 */
export function listKeyIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LS_PREFIX)) {
      ids.push(key.slice(LS_PREFIX.length));
    }
  }
  return ids;
}

/**
 * Check if key pair exists.
 */
export function hasKeyPair(keyId: string): boolean {
  return readRaw(LS_PREFIX + keyId) !== null;
}
