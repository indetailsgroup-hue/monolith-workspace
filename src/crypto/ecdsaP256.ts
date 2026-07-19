/**
 * ECDSA P-256 WebCrypto Signer
 *
 * Step 8 of Plasticity-Style Modeling Layer:
 * - Real cryptographic signing with ECDSA P-256
 * - SHA-256 hash for signature
 * - Auto-generates keypair on first use
 *
 * Browser Support: ECDSA P-256 is widely supported
 * (Chrome 37+, Firefox 34+, Safari 11+, Edge 12+)
 *
 * v1.0: Initial ECDSA P-256 signer
 */

import type { Signer, SignatureEnvelope } from './signerTypes';
import { loadKeyPair, saveKeyPair, type JwkPair } from './keyStore';
import { bytesToBase64, base64ToBytes } from './base64';

/**
 * Get current ISO timestamp.
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Ensure crypto.subtle is available.
 */
function requireSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'crypto.subtle is not available. Use HTTPS/localhost.'
    );
  }
  return crypto.subtle;
}

/**
 * Convert Uint8Array to BufferSource for WebCrypto compatibility.
 * TypeScript strict mode requires explicit casting.
 */
function toBufferSource(arr: Uint8Array): BufferSource {
  return arr as unknown as BufferSource;
}

/**
 * Ensure key pair exists for keyId, generating if needed.
 */
async function ensureKeyPair(keyId: string): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const subtle = requireSubtle();
  const existing = loadKeyPair(keyId);

  // Generate new keypair if not exists
  if (!existing) {
    const kp = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true, // extractable for localStorage storage
      ['sign', 'verify']
    );

    const publicJwk = await subtle.exportKey('jwk', kp.publicKey);
    const privateJwk = await subtle.exportKey('jwk', kp.privateKey);

    const pair: JwkPair = {
      publicJwk,
      privateJwk,
      algorithm: 'ECDSA_P256_SHA256',
      createdAtIso: nowIso(),
    };

    saveKeyPair(keyId, pair);
  }

  // Load and import keys
  const pair = loadKeyPair(keyId);
  if (!pair) {
    throw new Error(`KeyStore failure: could not load keypair for ${keyId}`);
  }

  const publicKey = await subtle.importKey(
    'jwk',
    pair.publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );

  const privateKey = await subtle.importKey(
    'jwk',
    pair.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );

  return { publicKey, privateKey };
}

/**
 * Export public key for a keyId (for external verification).
 */
export async function exportPublicKeyJwk(keyId: string): Promise<JsonWebKey | null> {
  const pair = loadKeyPair(keyId);
  return pair?.publicJwk ?? null;
}

/**
 * WebCrypto ECDSA P-256 Signer implementation.
 */
export class WebCryptoEcdsaSigner implements Signer {
  alg = 'ECDSA_P256_SHA256' as const;

  /**
   * Sign payload with ECDSA P-256.
   */
  async sign(payload: string, keyId: string): Promise<SignatureEnvelope> {
    const subtle = requireSubtle();
    const { privateKey } = await ensureKeyPair(keyId);

    const data = new TextEncoder().encode(payload);
    const sigBuf = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      data
    );

    const signatureB64 = bytesToBase64(new Uint8Array(sigBuf));

    return {
      alg: this.alg,
      keyId,
      signedAtIso: nowIso(),
      signatureB64,
    };
  }

  /**
   * Verify signature with ECDSA P-256.
   */
  async verify(payload: string, env: SignatureEnvelope): Promise<boolean> {
    if (env.alg !== this.alg) {
      console.warn(`[EcdsaSigner] Algorithm mismatch: expected ${this.alg}, got ${env.alg}`);
      return false;
    }

    try {
      const subtle = requireSubtle();
      const { publicKey } = await ensureKeyPair(env.keyId);

      const data = new TextEncoder().encode(payload);
      const sigBytes = base64ToBytes(env.signatureB64);

      return await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        toBufferSource(sigBytes),
        toBufferSource(data)
      );
    } catch (err) {
      console.error('[EcdsaSigner] Verification error:', err);
      return false;
    }
  }
}

/** Default ECDSA signer instance */
export const ecdsaSigner = new WebCryptoEcdsaSigner();
