// src/core/manufacturing/export/sigVerify.ts
/**
 * Signature Verification.
 *
 * Ed25519 signature verification with pinned public keys.
 * Browser-compatible using Web Crypto API.
 *
 * MUST match monolith-verify CLI verification logic exactly.
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// =============================================================================
// PINNED KEY TYPES
// =============================================================================

/**
 * Pinned public key.
 *
 * Matches monolith-verify key format.
 */
export interface PinnedKey {
  /** Public key identifier */
  publicKeyId: string;

  /** Signature scheme (only ED25519 supported) */
  scheme: "ED25519";

  /** SPKI PEM format public key */
  spkiPem: string;

  /** Human-readable note */
  note?: string;

  /** Key creation timestamp */
  createdAt?: string;

  /** Key expiration timestamp (optional) */
  expiresAt?: string;
}

/**
 * Pinned key set.
 *
 * Collection of allowed public keys.
 */
export interface PinnedKeySetV1 {
  /** Schema version */
  version: "1.0";

  /** Allowed public keys */
  allowed: PinnedKey[];

  /** Key set note */
  note?: string;

  /** Last updated timestamp */
  updatedAt?: string;
}

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Signature verification result.
 */
export type SignatureVerifyResult =
  | { ok: true; publicKeyId: string; note?: string }
  | { ok: false; code: SignatureVerifyErrorCode; detail?: Record<string, unknown> };

/**
 * Signature verification error codes.
 */
export type SignatureVerifyErrorCode =
  | "KEY_NOT_ALLOWED"
  | "SIGNATURE_INVALID"
  | "KEY_EXPIRED"
  | "SCHEME_UNSUPPORTED"
  | "INVALID_INPUT"
  | "CRYPTO_ERROR";

// =============================================================================
// WEB CRYPTO VERIFICATION
// =============================================================================

/**
 * Import SPKI PEM as CryptoKey.
 *
 * @param spkiPem SPKI PEM format public key
 * @returns CryptoKey for Ed25519 verification
 */
async function importEd25519PublicKey(spkiPem: string): Promise<CryptoKey> {
  // Extract base64 from PEM
  const pemLines = spkiPem.split("\n");
  const base64 = pemLines
    .filter(
      (line) =>
        !line.startsWith("-----BEGIN") && !line.startsWith("-----END")
    )
    .join("")
    .trim();

  // Decode base64 to binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Import as Ed25519 public key
  return crypto.subtle.importKey(
    "spki",
    bytes,
    { name: "Ed25519" },
    true,
    ["verify"]
  );
}

/**
 * Verify Ed25519 signature using Web Crypto API.
 *
 * @param message Message bytes (typically manifestHash as 32 bytes)
 * @param signature Signature bytes (64 bytes)
 * @param publicKey CryptoKey for verification
 * @returns true if signature is valid
 */
async function verifyEd25519(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    // Create fresh ArrayBuffers to ensure Web Crypto API compatibility
    // This avoids SharedArrayBuffer issues with TypeScript strict typing
    const sigCopy = new Uint8Array(signature.byteLength);
    sigCopy.set(signature);
    const msgCopy = new Uint8Array(message.byteLength);
    msgCopy.set(message);
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      sigCopy.buffer,
      msgCopy.buffer
    );
  } catch {
    return false;
  }
}

/**
 * Convert hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// =============================================================================
// MAIN VERIFICATION FUNCTION
// =============================================================================

/**
 * Verify signature against pinned keys.
 *
 * @param manifestHashHex SHA-256 hash of manifest (64 hex chars)
 * @param signatureHex Ed25519 signature (128 hex chars)
 * @param publicKeyId Key ID used for signing
 * @param keySet Pinned key set
 * @returns Verification result
 */
export async function verifySignatureWithPinnedKeys(
  manifestHashHex: string,
  signatureHex: string,
  publicKeyId: string,
  keySet: PinnedKeySetV1
): Promise<SignatureVerifyResult> {
  // Validate inputs
  if (!/^[a-f0-9]{64}$/i.test(manifestHashHex)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      detail: { field: "manifestHashHex", message: "must be 64 hex chars" },
    };
  }

  if (!/^[a-f0-9]{128}$/i.test(signatureHex)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      detail: { field: "signatureHex", message: "must be 128 hex chars" },
    };
  }

  // Find key in allowlist
  const pinnedKey = keySet.allowed.find((k) => k.publicKeyId === publicKeyId);
  if (!pinnedKey) {
    return {
      ok: false,
      code: "KEY_NOT_ALLOWED",
      detail: {
        publicKeyId,
        allowedKeys: keySet.allowed.map((k) => k.publicKeyId),
      },
    };
  }

  // Check scheme
  if (pinnedKey.scheme !== "ED25519") {
    return {
      ok: false,
      code: "SCHEME_UNSUPPORTED",
      detail: { scheme: pinnedKey.scheme, expected: "ED25519" },
    };
  }

  // Check expiration
  if (pinnedKey.expiresAt) {
    const expiresAt = new Date(pinnedKey.expiresAt);
    if (expiresAt < new Date()) {
      return {
        ok: false,
        code: "KEY_EXPIRED",
        detail: { publicKeyId, expiresAt: pinnedKey.expiresAt },
      };
    }
  }

  // Import public key
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importEd25519PublicKey(pinnedKey.spkiPem);
  } catch (error) {
    return {
      ok: false,
      code: "CRYPTO_ERROR",
      detail: { message: "Failed to import public key", error: String(error) },
    };
  }

  // Verify signature
  const messageBytes = hexToBytes(manifestHashHex.toLowerCase());
  const signatureBytes = hexToBytes(signatureHex.toLowerCase());

  try {
    const isValid = await verifyEd25519(messageBytes, signatureBytes, cryptoKey);

    if (!isValid) {
      return {
        ok: false,
        code: "SIGNATURE_INVALID",
        detail: { publicKeyId },
      };
    }

    return {
      ok: true,
      publicKeyId,
      note: pinnedKey.note,
    };
  } catch (error) {
    return {
      ok: false,
      code: "CRYPTO_ERROR",
      detail: { message: "Verification failed", error: String(error) },
    };
  }
}

// =============================================================================
// KEY SET HELPERS
// =============================================================================

/**
 * Validate pinned key set.
 */
export function validatePinnedKeySet(
  keySet: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!keySet || typeof keySet !== "object") {
    errors.push("keySet must be an object");
    return { valid: false, errors };
  }

  const ks = keySet as Record<string, unknown>;

  if (ks.version !== "1.0") {
    errors.push(`version must be "1.0", got ${ks.version}`);
  }

  if (!Array.isArray(ks.allowed)) {
    errors.push("allowed must be an array");
    return { valid: false, errors };
  }

  for (let i = 0; i < ks.allowed.length; i++) {
    const key = ks.allowed[i] as Record<string, unknown>;

    if (!key.publicKeyId || typeof key.publicKeyId !== "string") {
      errors.push(`allowed[${i}].publicKeyId must be a string`);
    }

    if (key.scheme !== "ED25519") {
      errors.push(`allowed[${i}].scheme must be "ED25519"`);
    }

    if (!key.spkiPem || typeof key.spkiPem !== "string") {
      errors.push(`allowed[${i}].spkiPem must be a string`);
    } else if (!(key.spkiPem as string).includes("-----BEGIN PUBLIC KEY-----")) {
      errors.push(`allowed[${i}].spkiPem must be in PEM format`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Find key by ID in key set.
 */
export function findKeyById(
  keySet: PinnedKeySetV1,
  publicKeyId: string
): PinnedKey | null {
  return keySet.allowed.find((k) => k.publicKeyId === publicKeyId) ?? null;
}

/**
 * Check if key is in allowlist.
 */
export function isKeyAllowed(
  keySet: PinnedKeySetV1,
  publicKeyId: string
): boolean {
  return keySet.allowed.some((k) => k.publicKeyId === publicKeyId);
}

/**
 * Check if key is expired.
 */
export function isKeyExpired(key: PinnedKey): boolean {
  if (!key.expiresAt) {
    return false;
  }
  return new Date(key.expiresAt) < new Date();
}

/**
 * Get all non-expired keys from key set.
 */
export function getValidKeys(keySet: PinnedKeySetV1): PinnedKey[] {
  return keySet.allowed.filter((k) => !isKeyExpired(k));
}

// =============================================================================
// KEY SET CREATION
// =============================================================================

/**
 * Create empty pinned key set.
 */
export function createEmptyKeySet(note?: string): PinnedKeySetV1 {
  return {
    version: "1.0",
    allowed: [],
    note,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add key to key set.
 */
export function addKeyToSet(
  keySet: PinnedKeySetV1,
  key: PinnedKey
): PinnedKeySetV1 {
  // Check for duplicate
  if (keySet.allowed.some((k) => k.publicKeyId === key.publicKeyId)) {
    throw new Error(`Key ${key.publicKeyId} already exists in key set`);
  }

  return {
    ...keySet,
    allowed: [...keySet.allowed, key],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove key from key set.
 */
export function removeKeyFromSet(
  keySet: PinnedKeySetV1,
  publicKeyId: string
): PinnedKeySetV1 {
  return {
    ...keySet,
    allowed: keySet.allowed.filter((k) => k.publicKeyId !== publicKeyId),
    updatedAt: new Date().toISOString(),
  };
}
