/**
 * receiptKeyStore.ts - P13.1 Receipt Key Management
 *
 * Manages Ed25519 signing keys for export receipts:
 * - Server signing key (loaded from env/file)
 * - Pinned public keys for verification
 * - Key rotation support with keyId
 *
 * @version 0.13.1
 */

import { createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ReceiptKeyPair {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyBase64: string;
  algorithm: 'ed25519';
  createdAt: string;
  expiresAt?: string;
}

export interface PinnedPublicKey {
  keyId: string;
  publicKeyBase64: string;
  algorithm: 'ed25519';
  validFrom: string;
  validUntil?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
}

export interface KeyStoreState {
  initialized: boolean;
  activeKeyId: string | null;
  pinnedKeys: Map<string, PinnedPublicKey>;
}

// ============================================================================
// Key Store Singleton
// ============================================================================

let signingKey: ReceiptKeyPair | null = null;
const pinnedKeys = new Map<string, PinnedPublicKey>();
let initialized = false;

// ============================================================================
// Key Loading
// ============================================================================

/**
 * Initialize key store from environment or file.
 *
 * Environment variables:
 * - RECEIPT_SIGNING_KEY_BASE64: Base64-encoded Ed25519 private key (PKCS8)
 * - RECEIPT_SIGNING_KEY_ID: Key identifier (default: 'receipt-key-v1')
 *
 * Or file-based:
 * - RECEIPT_SIGNING_KEY_FILE: Path to PEM file
 */
export function initializeKeyStore(): void {
  if (initialized) return;

  // Try environment variable first
  const keyBase64 = process.env.RECEIPT_SIGNING_KEY_BASE64;
  const keyId = process.env.RECEIPT_SIGNING_KEY_ID || 'receipt-key-v1';

  if (keyBase64) {
    try {
      const keyBuffer = Buffer.from(keyBase64, 'base64');
      const privateKey = createPrivateKey({
        key: keyBuffer,
        format: 'der',
        type: 'pkcs8',
      });

      const publicKey = createPublicKey(privateKey);
      const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyBase64 = publicKeyDer.toString('base64');

      signingKey = {
        keyId,
        privateKey,
        publicKey,
        publicKeyBase64,
        algorithm: 'ed25519',
        createdAt: new Date().toISOString(),
      };

      console.log(`[KeyStore] Loaded signing key: ${keyId}`);
    } catch (err) {
      console.error('[KeyStore] Failed to load key from env:', err);
    }
  }

  // Try file-based key
  const keyFile = process.env.RECEIPT_SIGNING_KEY_FILE;
  if (!signingKey && keyFile && existsSync(keyFile)) {
    try {
      const keyPem = readFileSync(keyFile, 'utf-8');
      const privateKey = createPrivateKey(keyPem);

      const publicKey = createPublicKey(privateKey);
      const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
      const publicKeyBase64 = publicKeyDer.toString('base64');

      signingKey = {
        keyId,
        privateKey,
        publicKey,
        publicKeyBase64,
        algorithm: 'ed25519',
        createdAt: new Date().toISOString(),
      };

      console.log(`[KeyStore] Loaded signing key from file: ${keyId}`);
    } catch (err) {
      console.error('[KeyStore] Failed to load key from file:', err);
    }
  }

  // Load pinned public keys
  loadPinnedPublicKeys();

  initialized = true;
}

/**
 * Load pinned public keys from JSON file.
 */
function loadPinnedPublicKeys(): void {
  const pinnedKeysPath = join(__dirname, 'production.receipt.pubkeys.v1.json');

  if (existsSync(pinnedKeysPath)) {
    try {
      const data = readFileSync(pinnedKeysPath, 'utf-8');
      const keys: PinnedPublicKey[] = JSON.parse(data);

      for (const key of keys) {
        pinnedKeys.set(key.keyId, key);
      }

      console.log(`[KeyStore] Loaded ${keys.length} pinned public keys`);
    } catch (err) {
      console.error('[KeyStore] Failed to load pinned keys:', err);
    }
  }

  // Also pin current signing key if available
  if (signingKey) {
    pinnedKeys.set(signingKey.keyId, {
      keyId: signingKey.keyId,
      publicKeyBase64: signingKey.publicKeyBase64,
      algorithm: 'ed25519',
      validFrom: signingKey.createdAt,
    });
  }
}

// ============================================================================
// Key Access
// ============================================================================

/**
 * Get the active signing key for creating new receipts.
 */
export function getSigningKey(): ReceiptKeyPair | null {
  if (!initialized) initializeKeyStore();
  return signingKey;
}

/**
 * Get a pinned public key by ID for verification.
 */
export function getPinnedPublicKey(keyId: string): PinnedPublicKey | null {
  if (!initialized) initializeKeyStore();
  return pinnedKeys.get(keyId) || null;
}

/**
 * Check if a key is valid (not expired, not revoked).
 */
export function isKeyValid(keyId: string, asOfDate?: Date): boolean {
  const key = getPinnedPublicKey(keyId);
  if (!key) return false;

  const checkDate = asOfDate || new Date();

  // Check revocation
  if (key.revoked) return false;

  // Check validity period
  const validFrom = new Date(key.validFrom);
  if (checkDate < validFrom) return false;

  if (key.validUntil) {
    const validUntil = new Date(key.validUntil);
    if (checkDate > validUntil) return false;
  }

  return true;
}

/**
 * Get key store state for debugging.
 */
export function getKeyStoreState(): KeyStoreState {
  if (!initialized) initializeKeyStore();

  return {
    initialized,
    activeKeyId: signingKey?.keyId || null,
    pinnedKeys,
  };
}

/**
 * Check if signing is available.
 */
export function isSigningAvailable(): boolean {
  if (!initialized) initializeKeyStore();
  return signingKey !== null;
}

// ============================================================================
// Key Generation (Development Only)
// ============================================================================

/**
 * Generate a new Ed25519 key pair (for development/testing).
 * In production, keys should be generated externally and imported.
 */
export async function generateKeyPair(keyId: string): Promise<{
  privateKeyBase64: string;
  publicKeyBase64: string;
}> {
  const { generateKeyPairSync } = await import('crypto');

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  const privateKeyDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });

  return {
    privateKeyBase64: privateKeyDer.toString('base64'),
    publicKeyBase64: publicKeyDer.toString('base64'),
  };
}

// ============================================================================
// Reset (Testing Only)
// ============================================================================

/**
 * Reset key store state (for testing).
 */
export function resetKeyStore(): void {
  signingKey = null;
  pinnedKeys.clear();
  initialized = false;
}

/**
 * Inject pinned public keys directly (testing only).
 *
 * Populates the in-memory pinned-key map and marks the store initialized so
 * getPinnedPublicKey() never falls back to reading the on-disk production key
 * file. This keeps tests hermetic — they must never mutate
 * production.receipt.pubkeys.v1.json (which may be read-only and is a
 * production artifact). Pass [] to isolate a test with no trusted keys.
 */
export function __setPinnedKeysForTest(keys: PinnedPublicKey[]): void {
  signingKey = null;
  pinnedKeys.clear();
  for (const key of keys) {
    pinnedKeys.set(key.keyId, key);
  }
  initialized = true;
}
