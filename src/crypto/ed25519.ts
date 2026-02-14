/**
 * Ed25519 WebCrypto Utilities
 *
 * WebCrypto-first implementation for Ed25519 digital signatures.
 *
 * Browser Support:
 * - Ed25519 is supported in modern Chromium-based browsers and recent Firefox
 * - Safari support may vary
 * - Falls back with clear error if not available (add tweetnacl if needed)
 */

import { sha256Hex } from './sha256';
import { bytesToBase64, base64ToBytes, utf8ToBytes } from './base64';

// ============================================
// TYPES
// ============================================

export type Ed25519KeyPair = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
};

export type ExportedEd25519PublicKey = {
  format: 'raw';
  /** 32 bytes raw public key in Base64 */
  publicKeyBase64: string;
  /** sha256(rawPublicKey) - unique identifier */
  keyId: string;
};

export type ExportedEd25519PrivateKey = {
  /**
   * PKCS8 format for localStorage (mock/dev only)
   * In production, private key should be in HSM or OS keystore
   */
  format: 'pkcs8';
  privateKeyBase64: string;
  keyId: string;
};

// ============================================
// HELPERS
// ============================================

function requireSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'crypto.subtle is not available. Use HTTPS/localhost or add a server-side fallback.'
    );
  }
  return crypto.subtle;
}

/**
 * Convert Uint8Array to BufferSource for WebCrypto compatibility
 * TypeScript strict mode requires explicit casting due to ArrayBufferLike union
 */
function toBufferSource(arr: Uint8Array): BufferSource {
  // Safe cast: our Uint8Arrays are always backed by regular ArrayBuffer (not SharedArrayBuffer)
  return arr as unknown as BufferSource;
}

// ============================================
// FEATURE DETECTION
// ============================================

/**
 * Check if Ed25519 is supported by WebCrypto in this browser
 */
export async function isEd25519Supported(): Promise<boolean> {
  try {
    const subtle = requireSubtle();
    // Quick feature probe: attempt to generate a key pair
    await subtle.generateKey(
      { name: 'Ed25519' } as EcKeyGenParams,
      true,
      ['sign', 'verify']
    );
    return true;
  } catch {
    return false;
  }
}

// ============================================
// KEY GENERATION
// ============================================

/**
 * Generate a new Ed25519 key pair
 *
 * @throws Error if Ed25519 is not supported by WebCrypto
 */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  const subtle = requireSubtle();
  try {
    const kp = (await subtle.generateKey(
      { name: 'Ed25519' } as EcKeyGenParams,
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    return { privateKey: kp.privateKey, publicKey: kp.publicKey };
  } catch (e) {
    throw new Error(
      'Ed25519 not supported by WebCrypto in this browser. Add tweetnacl fallback if required.'
    );
  }
}

// ============================================
// KEY EXPORT
// ============================================

/**
 * Export public key to portable format
 */
export async function exportEd25519PublicKey(
  publicKey: CryptoKey
): Promise<ExportedEd25519PublicKey> {
  const subtle = requireSubtle();
  const raw = new Uint8Array(await subtle.exportKey('raw', publicKey));
  const keyId = await sha256Hex(raw);
  return {
    format: 'raw',
    publicKeyBase64: bytesToBase64(raw),
    keyId,
  };
}

/**
 * Export private key to portable format (dev/mock only)
 *
 * WARNING: In production, private keys should NEVER be exported to browser storage.
 * Use HSM, OS keystore, or server-side signing.
 */
export async function exportEd25519PrivateKey(
  privateKey: CryptoKey,
  keyId: string
): Promise<ExportedEd25519PrivateKey> {
  const subtle = requireSubtle();
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', privateKey));
  return {
    format: 'pkcs8',
    privateKeyBase64: bytesToBase64(pkcs8),
    keyId,
  };
}

// ============================================
// KEY IMPORT
// ============================================

/**
 * Import public key from exported format
 */
export async function importEd25519PublicKey(
  exported: ExportedEd25519PublicKey
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const raw = base64ToBytes(exported.publicKeyBase64);
  return await subtle.importKey(
    'raw',
    toBufferSource(raw),
    { name: 'Ed25519' } as EcKeyImportParams,
    true,
    ['verify']
  );
}

/**
 * Import private key from exported format
 */
export async function importEd25519PrivateKey(
  exported: ExportedEd25519PrivateKey
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const pkcs8 = base64ToBytes(exported.privateKeyBase64);
  return await subtle.importKey(
    'pkcs8',
    toBufferSource(pkcs8),
    { name: 'Ed25519' } as EcKeyImportParams,
    true,
    ['sign']
  );
}

// ============================================
// SIGNING & VERIFICATION
// ============================================

/**
 * Sign a UTF-8 message with Ed25519 private key
 *
 * @param privateKey - CryptoKey for signing
 * @param messageUtf8 - UTF-8 string to sign
 * @returns Base64-encoded signature
 */
export async function ed25519Sign(
  privateKey: CryptoKey,
  messageUtf8: string
): Promise<string> {
  const subtle = requireSubtle();
  const sig = new Uint8Array(
    await subtle.sign(
      { name: 'Ed25519' } as EcdsaParams,
      privateKey,
      toBufferSource(utf8ToBytes(messageUtf8))
    )
  );
  return bytesToBase64(sig);
}

/**
 * Verify an Ed25519 signature
 *
 * @param publicKey - CryptoKey for verification
 * @param messageUtf8 - Original UTF-8 message
 * @param sigBase64 - Base64-encoded signature
 * @returns True if signature is valid
 */
export async function ed25519Verify(
  publicKey: CryptoKey,
  messageUtf8: string,
  sigBase64: string
): Promise<boolean> {
  const subtle = requireSubtle();
  const sig = base64ToBytes(sigBase64);
  return await subtle.verify(
    { name: 'Ed25519' } as EcdsaParams,
    publicKey,
    toBufferSource(sig),
    toBufferSource(utf8ToBytes(messageUtf8))
  );
}
