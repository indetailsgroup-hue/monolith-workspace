/**
 * Manifest Signature Verification
 *
 * Step 9: Server-side signature verification using Node.js crypto
 *
 * Features:
 * - ECDSA P-256 with SHA-256 verification
 * - Ed25519 verification
 * - Key lookup from JwkStore
 */

import { createVerify, createPublicKey, verify as ed25519Verify } from 'crypto';
import type { SignatureEnvelope, VerifyIssue } from '../types.js';
import { getPublicKey, isKeyValid } from './jwkStore.js';

// ============================================================================
// Signature Verification
// ============================================================================

export interface VerifyManifestSigResult {
  ok: boolean;
  issues: VerifyIssue[];
}

/**
 * Verify a manifest signature.
 *
 * @param manifestJson - The manifest JSON string (what was signed)
 * @param sigEnvelope - The signature envelope containing the signature
 */
export async function verifyManifestSig(
  manifestJson: string,
  sigEnvelope: SignatureEnvelope
): Promise<VerifyManifestSigResult> {
  const issues: VerifyIssue[] = [];

  // 1. Look up the public key
  const storedKey = getPublicKey(sigEnvelope.keyId);
  if (!storedKey) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'KEY_NOT_FOUND',
          message: `Public key not found: ${sigEnvelope.keyId}`,
        },
      ],
    };
  }

  // 2. Check key validity (not expired, not revoked)
  if (!isKeyValid(sigEnvelope.keyId)) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'KEY_INVALID',
          message: `Key is expired or revoked: ${sigEnvelope.keyId}`,
        },
      ],
    };
  }

  // 3. Check algorithm match
  if (storedKey.algorithm !== sigEnvelope.alg) {
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'ALG_MISMATCH',
          message: `Algorithm mismatch: key=${storedKey.algorithm}, sig=${sigEnvelope.alg}`,
        },
      ],
    };
  }

  // 4. Verify signature based on algorithm
  try {
    const signatureBuffer = Buffer.from(sigEnvelope.signatureB64, 'base64');
    const dataBuffer = Buffer.from(manifestJson, 'utf-8');

    let isValid = false;

    if (sigEnvelope.alg === 'ECDSA_P256_SHA256') {
      isValid = await verifyEcdsaP256(dataBuffer, signatureBuffer, storedKey.publicJwk);
    } else if (sigEnvelope.alg === 'ED25519') {
      isValid = await verifyEd25519(dataBuffer, signatureBuffer, storedKey.publicJwk);
    } else {
      return {
        ok: false,
        issues: [
          {
            severity: 'ERROR',
            code: 'UNSUPPORTED_ALG',
            message: `Unsupported algorithm: ${sigEnvelope.alg}`,
          },
        ],
      };
    }

    if (!isValid) {
      return {
        ok: false,
        issues: [
          {
            severity: 'ERROR',
            code: 'SIG_INVALID',
            message: 'Signature verification failed',
          },
        ],
      };
    }

    // Success
    return { ok: true, issues: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'VERIFY_ERROR',
          message: `Verification error: ${message}`,
        },
      ],
    };
  }
}

// ============================================================================
// Algorithm-Specific Verification
// ============================================================================

async function verifyEcdsaP256(
  data: Buffer,
  signature: Buffer,
  publicJwk: JsonWebKey
): Promise<boolean> {
  // Create public key from JWK
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });

  // ECDSA with SHA-256 uses DER-encoded signature
  // Browser WebCrypto uses raw (r || s) format, so we may need to convert
  const derSignature = rawToDer(signature);

  // Create verifier
  const verifier = createVerify('SHA256');
  verifier.update(data);

  return verifier.verify(publicKey, derSignature);
}

async function verifyEd25519(
  data: Buffer,
  signature: Buffer,
  publicJwk: JsonWebKey
): Promise<boolean> {
  // Create public key from JWK
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });

  // Ed25519 uses the verify function directly
  return ed25519Verify(undefined, data, publicKey, signature);
}

// ============================================================================
// Signature Format Conversion
// ============================================================================

/**
 * Convert raw ECDSA signature (r || s) to DER format.
 * WebCrypto uses raw format, Node.js expects DER.
 */
function rawToDer(raw: Buffer): Buffer {
  // For P-256, each component is 32 bytes
  if (raw.length !== 64) {
    // Already DER format or invalid
    return raw;
  }

  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);

  return encodeAsnSequence([encodeAsnInteger(r), encodeAsnInteger(s)]);
}

function encodeAsnInteger(value: Buffer): Buffer {
  // Remove leading zeros
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) {
    start++;
  }
  let trimmed = value.slice(start);

  // Add leading zero if high bit is set (to indicate positive number)
  if (trimmed[0] & 0x80) {
    trimmed = Buffer.concat([Buffer.from([0]), trimmed]);
  }

  return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
}

function encodeAsnSequence(elements: Buffer[]): Buffer {
  const content = Buffer.concat(elements);
  return Buffer.concat([Buffer.from([0x30, content.length]), content]);
}
