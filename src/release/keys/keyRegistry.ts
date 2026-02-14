/**
 * Key Registry
 *
 * Ed25519 key management with persistent storage and rotation support.
 *
 * Features:
 * - Persistent public key registry (localStorage-backed for dev)
 * - Key rotation with automatic activation
 * - Trust policy enforcement (only ACTIVE keys can sign)
 *
 * In production:
 * - Private keys should be in HSM or OS keystore
 * - Public keys should be stored in a database/KMS
 */

import {
  generateEd25519KeyPair,
  exportEd25519PublicKey,
  exportEd25519PrivateKey,
  importEd25519PrivateKey,
  importEd25519PublicKey,
  type ExportedEd25519PublicKey,
  type ExportedEd25519PrivateKey,
} from '../../crypto/ed25519';
import { persistentKeyRegistry } from './persistentRegistry';
import type { PublicKeyRecord, KeyScope } from './types';
import { DEFAULT_KEY_POLICY, isActiveNow } from './policy';

// ============================================
// LOCAL STORAGE KEYS (active private key - mock/dev)
// ============================================

const LS_PRIV = 'monolith.signing.privateKey.pkcs8.base64';
const LS_KEYID = 'monolith.signing.keyId';
const LS_PUB = 'monolith.signing.publicKey.raw.base64';

// ============================================
// TYPES (backwards compatibility)
// ============================================

export type KeyRegistryRecord = {
  keyId: string;
  publicKey: ExportedEd25519PublicKey;
  createdAt?: string;
  status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
};

export type SigningIdentity = {
  keyId: string;
  publicKey: ExportedEd25519PublicKey;
  privateKey: ExportedEd25519PrivateKey;
};

// ============================================
// HELPERS
// ============================================

function nowIso(): string {
  return new Date().toISOString();
}

function getLocalStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

// ============================================
// LEGACY IN-MEMORY REGISTRY (for backwards compat)
// ============================================

class InMemoryKeyRegistry {
  private keys = new Map<string, KeyRegistryRecord>();

  upsertPublicKey(
    pub: ExportedEd25519PublicKey,
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' = 'ACTIVE'
  ): void {
    this.keys.set(pub.keyId, {
      keyId: pub.keyId,
      publicKey: pub,
      createdAt: nowIso(),
      status,
    });

    // Also register in persistent registry
    const existing = persistentKeyRegistry.get(pub.keyId);
    if (!existing) {
      persistentKeyRegistry.createRecord({
        keyId: pub.keyId,
        publicKeyBase64: pub.publicKeyBase64,
        createdBy: 'local',
        scope: 'ORG',
        label: 'Auto-registered key',
      });
    }
  }

  getPublicKey(keyId: string): ExportedEd25519PublicKey | undefined {
    // First check persistent registry
    const persistent = persistentKeyRegistry.get(keyId);
    if (persistent && persistent.status !== 'REVOKED') {
      return {
        format: 'raw',
        keyId: persistent.keyId,
        publicKeyBase64: persistent.publicKeyBase64,
      };
    }

    // Fallback to in-memory
    const record = this.keys.get(keyId);
    if (!record || record.status === 'REVOKED') return undefined;
    return record.publicKey;
  }

  getRecord(keyId: string): KeyRegistryRecord | undefined {
    return this.keys.get(keyId);
  }

  listKeyIds(): string[] {
    return Array.from(this.keys.keys());
  }

  revokeKey(keyId: string): boolean {
    const record = this.keys.get(keyId);
    if (!record) return false;
    record.status = 'REVOKED';
    return true;
  }
}

/**
 * Global key registry singleton (backwards compat)
 */
export const keyRegistry = new InMemoryKeyRegistry();

// ============================================
// SIGNING IDENTITY MANAGEMENT
// ============================================

export type EnsureSigningIdentityInput = {
  createdBy?: string;
  scope?: KeyScope;
  scopeId?: string;
  label?: string;
  expiresAtIso?: string;
};

/**
 * Creates or loads a local signing identity
 *
 * - Registers public key in persistent registry
 * - Stores private key in localStorage (mock/dev only)
 *
 * @returns Signing identity with keyId, public key, and private key
 */
export async function ensureSigningIdentity(
  input?: EnsureSigningIdentityInput
): Promise<SigningIdentity> {
  const ls = getLocalStorage();
  if (!ls) {
    throw new Error('localStorage not available. Cannot manage signing identity.');
  }

  // Check for existing identity in localStorage
  const existingKeyId = ls.getItem(LS_KEYID);
  const existingPriv = ls.getItem(LS_PRIV);
  const existingPub = ls.getItem(LS_PUB);

  if (existingKeyId && existingPriv && existingPub) {
    // Ensure key exists in persistent registry
    const reg = persistentKeyRegistry.get(existingKeyId);
    if (!reg) {
      persistentKeyRegistry.createRecord({
        keyId: existingKeyId,
        publicKeyBase64: existingPub,
        createdBy: input?.createdBy ?? 'local',
        scope: input?.scope ?? 'ORG',
        scopeId: input?.scopeId,
        label: input?.label ?? 'Local signing key (imported)',
        expiresAtIso: input?.expiresAtIso,
      });
    }

    const pub: ExportedEd25519PublicKey = {
      format: 'raw',
      keyId: existingKeyId,
      publicKeyBase64: existingPub,
    };
    const priv: ExportedEd25519PrivateKey = {
      format: 'pkcs8',
      keyId: existingKeyId,
      privateKeyBase64: existingPriv,
    };

    // Register in memory (backwards compat)
    keyRegistry.upsertPublicKey(pub);

    return { keyId: existingKeyId, publicKey: pub, privateKey: priv };
  }

  // No existing identity - generate new via rotation
  return await rotateSigningKey({
    createdBy: input?.createdBy ?? 'local',
    scope: input?.scope ?? 'ORG',
    scopeId: input?.scopeId,
    label: input?.label ?? 'Local signing key',
    expiresAtIso: input?.expiresAtIso,
  });
}

/**
 * Rotate the signing key
 *
 * Generates a new key pair, registers in persistent registry,
 * and stores private key in localStorage.
 *
 * The previous key remains in registry (for verification) but
 * is no longer the active signing key.
 */
export async function rotateSigningKey(input: {
  createdBy: string;
  scope: KeyScope;
  scopeId?: string;
  label?: string;
  expiresAtIso?: string;
}): Promise<SigningIdentity> {
  const ls = getLocalStorage();
  if (!ls) {
    throw new Error('localStorage not available. Cannot rotate signing key.');
  }

  // Generate new key pair
  const kp = await generateEd25519KeyPair();
  const pub = await exportEd25519PublicKey(kp.publicKey);
  const priv = await exportEd25519PrivateKey(kp.privateKey, pub.keyId);

  // Store active private key in localStorage (mock/dev)
  ls.setItem(LS_KEYID, pub.keyId);
  ls.setItem(LS_PUB, pub.publicKeyBase64);
  ls.setItem(LS_PRIV, priv.privateKeyBase64);

  // Register public key in persistent registry + set active
  persistentKeyRegistry.createRecord({
    keyId: pub.keyId,
    publicKeyBase64: pub.publicKeyBase64,
    createdBy: input.createdBy,
    scope: input.scope,
    scopeId: input.scopeId,
    label: input.label,
    expiresAtIso: input.expiresAtIso,
  });

  // Also register in memory (backwards compat)
  keyRegistry.upsertPublicKey(pub);

  return { keyId: pub.keyId, publicKey: pub, privateKey: priv };
}

/**
 * Get the signer's CryptoKey for signing operations
 *
 * Enforces trust policy: only ACTIVE keys can sign.
 *
 * @throws Error if active key is not ACTIVE/valid
 */
export async function getSignerCryptoKey(): Promise<{
  keyId: string;
  privateKey: CryptoKey;
}> {
  const identity = await ensureSigningIdentity({ createdBy: 'local', scope: 'ORG' });

  // Enforce trust policy
  if (DEFAULT_KEY_POLICY.requireActiveKeyForSigning) {
    const record = persistentKeyRegistry.get(identity.keyId);
    if (!record || !isActiveNow(record, nowIso())) {
      throw new Error(
        'Active signing key is not ACTIVE/valid. Rotate or activate a key.'
      );
    }
  }

  const privateKey = await importEd25519PrivateKey(identity.privateKey);
  return { keyId: identity.keyId, privateKey };
}

/**
 * Get a CryptoKey for verifying signatures
 *
 * Also returns the key record for policy checks.
 *
 * @param keyId - The key ID to look up in the registry
 * @throws Error if key is not found in registry
 */
export async function getVerifierCryptoKey(keyId: string): Promise<{
  record: PublicKeyRecord;
  publicKey: CryptoKey;
}> {
  const record = persistentKeyRegistry.get(keyId);
  if (!record) {
    throw new Error(`Public key not found in registry: ${keyId}`);
  }

  const exported: ExportedEd25519PublicKey = {
    format: 'raw',
    keyId: record.keyId,
    publicKeyBase64: record.publicKeyBase64,
  };
  const publicKey = await importEd25519PublicKey(exported);

  return { record, publicKey };
}

/**
 * Clear the local signing identity (for testing/rotation)
 */
export function clearSigningIdentity(): void {
  const ls = getLocalStorage();
  if (!ls) return;

  ls.removeItem(LS_KEYID);
  ls.removeItem(LS_PUB);
  ls.removeItem(LS_PRIV);
}
