/**
 * Persistent Key Registry
 *
 * localStorage-backed registry for Ed25519 public keys.
 * Stores public keys with governance metadata for trust policy enforcement.
 *
 * Trust workflow:
 * - Locally generated keys: TRUSTED by default
 * - Imported keys: QUARANTINED until explicitly trusted
 * - Factory verification requires TRUSTED + ACTIVE
 *
 * NOTE: This is for dev/mock usage. Production should use a database
 * or key management service (KMS).
 */

import type { PublicKeyRecord, KeyScope, KeyTrust } from './types';

// localStorage keys
const LS_KEYS = 'monolith.keys.public.registry.v1';
const LS_ACTIVE = 'monolith.keys.active.keyId';

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Load all keys from localStorage
 */
function loadAll(): PublicKeyRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    // Migration: add trust field if missing (for existing keys)
    return Array.isArray(parsed)
      ? (parsed as PublicKeyRecord[]).map((k) => ({
          ...k,
          trust: k.trust ?? 'TRUSTED', // existing keys default to TRUSTED
        }))
      : [];
  } catch {
    return [];
  }
}

/**
 * Save all keys to localStorage
 */
function saveAll(keys: PublicKeyRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LS_KEYS, JSON.stringify(keys, null, 2));
}

/**
 * Persistent Key Registry
 *
 * Manages Ed25519 public key records with lifecycle and trust state.
 */
export class PersistentKeyRegistry {
  /**
   * List all registered keys (sorted by creation date, newest first)
   */
  list(): PublicKeyRecord[] {
    return loadAll().sort((a, b) =>
      b.createdAtIso.localeCompare(a.createdAtIso)
    );
  }

  /**
   * Get a key record by keyId
   */
  get(keyId: string): PublicKeyRecord | undefined {
    return loadAll().find((k) => k.keyId === keyId);
  }

  /**
   * Insert or update a key record
   */
  upsert(record: PublicKeyRecord): void {
    const cur = loadAll();
    const idx = cur.findIndex((k) => k.keyId === record.keyId);
    const next =
      idx >= 0
        ? [...cur.slice(0, idx), record, ...cur.slice(idx + 1)]
        : [...cur, record];
    saveAll(next);
  }

  /**
   * Set the active signing key ID
   */
  setActiveKey(keyId: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_ACTIVE, keyId);
  }

  /**
   * Get the active signing key ID
   */
  getActiveKeyId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LS_ACTIVE);
  }

  /**
   * Clear the active signing key
   */
  clearActiveKey(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LS_ACTIVE);
  }

  // ============================================
  // TRUST WORKFLOW
  // ============================================

  /**
   * Set trust status for a key
   *
   * @param keyId - Key to update
   * @param trust - New trust status
   * @param by - User ID making the change
   * @param note - Optional note about trust decision
   */
  setTrust(keyId: string, trust: KeyTrust, by: string, note?: string): void {
    const k = this.get(keyId);
    if (!k) throw new Error(`Key not found: ${keyId}`);

    const next: PublicKeyRecord = {
      ...k,
      trust,
      trustedAtIso: trust === 'TRUSTED' ? nowIso() : k.trustedAtIso,
      trustedBy: trust === 'TRUSTED' ? by : k.trustedBy,
      trustNote: note ?? k.trustNote,
    };
    this.upsert(next);
  }

  /**
   * Get all TRUSTED keys
   */
  getTrustedKeys(): PublicKeyRecord[] {
    return loadAll().filter((k) => k.trust === 'TRUSTED');
  }

  /**
   * Get all QUARANTINED keys (pending approval)
   */
  getQuarantinedKeys(): PublicKeyRecord[] {
    return loadAll().filter((k) => k.trust === 'QUARANTINED');
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /**
   * Revoke a key
   *
   * @param keyId - Key to revoke
   * @param by - User ID who is revoking
   * @param reason - Reason for revocation
   */
  revokeKey(keyId: string, by: string, reason: string): void {
    const k = this.get(keyId);
    if (!k) throw new Error(`Key not found: ${keyId}`);

    const next: PublicKeyRecord = {
      ...k,
      status: 'REVOKED',
      revokedAtIso: nowIso(),
      revokedBy: by,
      revokedReason: reason,
    };
    this.upsert(next);

    // If this was the active key, clear it
    if (this.getActiveKeyId() === keyId) {
      this.clearActiveKey();
    }
  }

  /**
   * Set expiration date for a key
   */
  expireKey(keyId: string, expiresAtIso: string): void {
    const k = this.get(keyId);
    if (!k) throw new Error(`Key not found: ${keyId}`);

    const next: PublicKeyRecord = { ...k, expiresAtIso };
    this.upsert(next);
  }

  /**
   * Activate a key (set status to ACTIVE and mark as active signing key)
   *
   * NOTE: Key must be TRUSTED before it can be activated
   */
  activateKey(keyId: string, by: string): void {
    const k = this.get(keyId);
    if (!k) throw new Error(`Key not found: ${keyId}`);

    // Require TRUSTED status for activation
    if (k.trust !== 'TRUSTED') {
      throw new Error('Key must be TRUSTED before activation.');
    }

    const next: PublicKeyRecord = {
      ...k,
      status: 'ACTIVE',
      activatedAtIso: nowIso(),
      createdBy: k.createdBy || by,
    };
    this.upsert(next);
    this.setActiveKey(keyId);
  }

  // ============================================
  // KEY CREATION & IMPORT
  // ============================================

  /**
   * Create and register a new key record (locally generated)
   *
   * Locally generated keys are TRUSTED by default.
   *
   * @returns The created record
   */
  createRecord(input: {
    keyId: string;
    publicKeyBase64: string;
    createdBy: string;
    scope: KeyScope;
    scopeId?: string;
    label?: string;
    expiresAtIso?: string;
  }): PublicKeyRecord {
    const rec: PublicKeyRecord = {
      keyId: input.keyId,
      alg: 'ed25519',
      format: 'raw',
      publicKeyBase64: input.publicKeyBase64,
      status: 'ACTIVE',
      trust: 'TRUSTED', // locally generated = auto-trusted
      trustedAtIso: nowIso(),
      trustedBy: input.createdBy,
      trustNote: 'Locally generated key',
      scope: input.scope,
      scopeId: input.scopeId,
      label: input.label,
      createdAtIso: nowIso(),
      createdBy: input.createdBy,
      activatedAtIso: nowIso(),
      expiresAtIso: input.expiresAtIso,
    };
    this.upsert(rec);
    this.setActiveKey(rec.keyId);
    return rec;
  }

  /**
   * Import a public key from external source
   *
   * Imported keys are QUARANTINED by default until explicitly trusted.
   * Use setTrust() to approve or reject the key.
   *
   * @param input - Key data and import metadata
   * @returns The imported record
   */
  importPublicKey(input: {
    keyId: string;
    publicKeyBase64: string;
    scope: KeyScope;
    scopeId?: string;
    label?: string;
    importedBy: string;
    note?: string;
  }): PublicKeyRecord {
    const existing = this.get(input.keyId);

    if (existing) {
      // Update existing key but preserve trust status
      const updated: PublicKeyRecord = {
        ...existing,
        publicKeyBase64: input.publicKeyBase64,
        scope: input.scope,
        scopeId: input.scopeId,
        label: input.label ?? existing.label,
      };
      this.upsert(updated);
      return updated;
    }

    // New imported key: QUARANTINED by default
    const rec: PublicKeyRecord = {
      keyId: input.keyId,
      alg: 'ed25519',
      format: 'raw',
      publicKeyBase64: input.publicKeyBase64,
      status: 'ACTIVE',
      trust: 'QUARANTINED', // imported = quarantined until approved
      trustNote: input.note,
      scope: input.scope,
      scopeId: input.scopeId,
      label: input.label ?? 'Imported key',
      createdAtIso: nowIso(),
      createdBy: input.importedBy,
    };
    this.upsert(rec);
    // Note: Don't set as active - imported keys are for verification only
    return rec;
  }

  /**
   * Delete a key from registry (use with caution)
   *
   * Typically you should revoke instead of delete.
   */
  deleteKey(keyId: string): void {
    const cur = loadAll();
    const next = cur.filter((k) => k.keyId !== keyId);
    saveAll(next);

    if (this.getActiveKeyId() === keyId) {
      this.clearActiveKey();
    }
  }

  /**
   * Get all ACTIVE keys
   */
  getActiveKeys(): PublicKeyRecord[] {
    const now = nowIso();
    return loadAll().filter(
      (k) => k.status === 'ACTIVE' && (!k.expiresAtIso || k.expiresAtIso > now)
    );
  }

  /**
   * Get all TRUSTED + ACTIVE keys (for factory verification)
   */
  getTrustedActiveKeys(): PublicKeyRecord[] {
    const now = nowIso();
    return loadAll().filter(
      (k) =>
        k.trust === 'TRUSTED' &&
        k.status === 'ACTIVE' &&
        (!k.expiresAtIso || k.expiresAtIso > now)
    );
  }

  /**
   * Check if registry has any keys
   */
  hasKeys(): boolean {
    return loadAll().length > 0;
  }
}

/**
 * Singleton instance of PersistentKeyRegistry
 */
export const persistentKeyRegistry = new PersistentKeyRegistry();
