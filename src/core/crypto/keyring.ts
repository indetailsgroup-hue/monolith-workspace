/**
 * keyring.ts - Public Key Management for Trust Chain
 *
 * ARCHITECTURE:
 * - KeyInfo: metadata about a public key (id, purpose, key)
 * - Keyring: interface for retrieving public keys by ID
 * - Pinned keys: hardcoded trusted keys (for factory verification)
 *
 * SECURITY POLICY:
 * - Private keys are NEVER stored in the keyring
 * - Private keys live in secure storage (HSM, KMS, encrypted secrets)
 * - Only public keys are pinned for verification
 *
 * KEY PURPOSES:
 * - APPROVAL: signs TrustReport (designer/PM workstation)
 * - EXPORT: signs manifest (CI/server)
 * - FACTORY: (optional) factory acceptance signature
 */

// ============================================
// KEY INFO
// ============================================

/**
 * Purpose of a signing key
 */
export type KeyPurpose = 'APPROVAL' | 'EXPORT' | 'FACTORY';

/**
 * Public key information
 */
export interface KeyInfo {
  /** Unique key identifier (e.g., "monolith-prod-001") */
  keyId: string;
  /** Ed25519 public key as hex string (64 chars) */
  publicKeyHex: string;
  /** Key purpose */
  purpose: KeyPurpose;
  /** Human-readable description */
  description?: string;
  /** Key creation date (ISO) */
  createdIso?: string;
  /** Key expiration date (ISO), null = no expiration */
  expiresIso?: string | null;
  /** Whether key is currently active */
  active: boolean;
}

// ============================================
// KEYRING INTERFACE
// ============================================

/**
 * Keyring interface for public key retrieval
 */
export interface Keyring {
  /**
   * Get public key by ID
   * @param keyId - Key identifier
   * @returns KeyInfo or null if not found
   */
  getPublicKey(keyId: string): KeyInfo | null;

  /**
   * Get all keys for a purpose
   * @param purpose - Key purpose filter
   * @returns Array of matching KeyInfo
   */
  getKeysByPurpose(purpose: KeyPurpose): KeyInfo[];

  /**
   * List all key IDs
   */
  listKeyIds(): string[];
}

// ============================================
// PINNED KEYRING (HARDCODED TRUSTED KEYS)
// ============================================

/**
 * Pinned public keys for verification
 *
 * IMPORTANT: In production, replace these with your actual public keys.
 * Private keys should be stored securely and NEVER in code.
 */
const PINNED_KEYS: KeyInfo[] = [
  // Example key for development/testing (REPLACE IN PRODUCTION)
  // {
  //   keyId: 'monolith-dev-001',
  //   publicKeyHex: '0123456789abcdef...',  // 64 chars
  //   purpose: 'APPROVAL',
  //   description: 'Development approval key',
  //   active: true,
  // },
];

/**
 * Create keyring from pinned keys
 */
export function createPinnedKeyring(keys: KeyInfo[]): Keyring {
  const byId = new Map<string, KeyInfo>();
  for (const key of keys) {
    byId.set(key.keyId, key);
  }

  return {
    getPublicKey(keyId: string): KeyInfo | null {
      const key = byId.get(keyId);
      if (!key) return null;
      if (!key.active) return null;

      // Check expiration
      if (key.expiresIso) {
        const expires = new Date(key.expiresIso);
        if (new Date() > expires) return null;
      }

      return key;
    },

    getKeysByPurpose(purpose: KeyPurpose): KeyInfo[] {
      return keys.filter(k =>
        k.purpose === purpose &&
        k.active &&
        (!k.expiresIso || new Date() <= new Date(k.expiresIso))
      );
    },

    listKeyIds(): string[] {
      return Array.from(byId.keys());
    },
  };
}

/**
 * Default pinned keyring (use createPinnedKeyring for custom keys)
 */
export const pinnedKeyring: Keyring = createPinnedKeyring(PINNED_KEYS);

// ============================================
// KEYRING BUILDERS
// ============================================

/**
 * Create keyring from array of keys
 */
export function keyringFromArray(keys: KeyInfo[]): Keyring {
  return createPinnedKeyring(keys);
}

/**
 * Create empty keyring (for testing)
 */
export function emptyKeyring(): Keyring {
  return createPinnedKeyring([]);
}

/**
 * Merge multiple keyrings (later keys override earlier)
 */
export function mergeKeyrings(...keyrings: Keyring[]): Keyring {
  const allKeys: KeyInfo[] = [];

  for (const kr of keyrings) {
    for (const keyId of kr.listKeyIds()) {
      const key = kr.getPublicKey(keyId);
      if (key) {
        // Remove any existing key with same ID
        const idx = allKeys.findIndex(k => k.keyId === keyId);
        if (idx >= 0) allKeys.splice(idx, 1);
        allKeys.push(key);
      }
    }
  }

  return createPinnedKeyring(allKeys);
}

// ============================================
// KEY VALIDATION
// ============================================

/**
 * Validate key info structure
 */
export function validateKeyInfo(key: KeyInfo): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!key.keyId || key.keyId.length === 0) {
    errors.push('keyId is required');
  }

  if (!key.publicKeyHex || key.publicKeyHex.length !== 64) {
    errors.push('publicKeyHex must be 64 hex characters');
  }

  if (!/^[0-9a-f]+$/i.test(key.publicKeyHex || '')) {
    errors.push('publicKeyHex must be valid hex');
  }

  if (!['APPROVAL', 'EXPORT', 'FACTORY'].includes(key.purpose)) {
    errors.push('purpose must be APPROVAL, EXPORT, or FACTORY');
  }

  return { ok: errors.length === 0, errors };
}

// ============================================
// DEVELOPMENT HELPERS
// ============================================

/**
 * Create development keyring with auto-generated key
 *
 * WARNING: For development/testing only. Not for production use.
 */
export async function createDevKeyring(): Promise<{
  keyring: Keyring;
  keyId: string;
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  // Dynamic import to avoid bundling in production
  const { generateKeypair } = await import('./ed25519');

  const keypair = await generateKeypair();
  const keyId = `dev-${Date.now()}`;

  const key: KeyInfo = {
    keyId,
    publicKeyHex: keypair.publicKeyHex,
    purpose: 'APPROVAL',
    description: 'Development key (auto-generated)',
    active: true,
  };

  return {
    keyring: createPinnedKeyring([key]),
    keyId,
    privateKeyHex: keypair.privateKeyHex,
    publicKeyHex: keypair.publicKeyHex,
  };
}

/**
 * Create development factory keyring with auto-generated key
 *
 * WARNING: For development/testing only. Not for production use.
 * In production, factory keys should be generated and stored securely.
 */
export async function createDevFactoryKeyring(): Promise<{
  keyring: Keyring;
  keyId: string;
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  const { generateKeypair } = await import('./ed25519');

  const keypair = await generateKeypair();
  const keyId = `factory-dev-${Date.now()}`;

  const key: KeyInfo = {
    keyId,
    publicKeyHex: keypair.publicKeyHex,
    purpose: 'FACTORY',
    description: 'Development factory key (auto-generated)',
    active: true,
  };

  return {
    keyring: createPinnedKeyring([key]),
    keyId,
    privateKeyHex: keypair.privateKeyHex,
    publicKeyHex: keypair.publicKeyHex,
  };
}

/**
 * Create factory key info (for adding to keyring)
 */
export function createFactoryKeyInfo(args: {
  keyId: string;
  publicKeyHex: string;
  description?: string;
  expiresIso?: string | null;
}): KeyInfo {
  return {
    keyId: args.keyId,
    publicKeyHex: args.publicKeyHex,
    purpose: 'FACTORY',
    description: args.description ?? 'Factory QC key',
    active: true,
    expiresIso: args.expiresIso,
  };
}
