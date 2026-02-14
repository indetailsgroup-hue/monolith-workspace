/**
 * Manifest Signing
 *
 * Signs manifest JSON (canonical) and verifies signatures.
 *
 * Policy:
 * - We sign the final manifest JSON (with files[] hashes already set)
 * - signature.sigBase64 covers the entire manifestJson bytes
 * - Only ACTIVE keys can sign (enforced by getSignerCryptoKey)
 * - Verification rejects REVOKED/EXPIRED keys (factory safety)
 * - Scope enforcement: FACTORY mode requires factoryId-bound keys (v0.5)
 */

import { ed25519Sign, ed25519Verify } from '../../crypto/ed25519';
import { getSignerCryptoKey, getVerifierCryptoKey } from '../keys/keyRegistry';
import { DEFAULT_KEY_POLICY, isExpired, canVerify, isTrusted, isQuarantined } from '../keys/policy';
import { guardVerifyKey } from '../keys/guards';
import { isKeyRevokedForManifest } from '../keys/revocationPolicy';
import { audit } from '../keys/audit';

/**
 * Get current ISO timestamp
 */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Sign manifest JSON content
 *
 * @param manifestJson - Canonical JSON string to sign
 * @returns keyId and Base64-encoded signature
 * @throws Error if active key is not ACTIVE/valid
 */
export async function signManifestJson(manifestJson: string): Promise<{
  keyId: string;
  sigBase64: string;
}> {
  const { keyId, privateKey } = await getSignerCryptoKey();
  const sigBase64 = await ed25519Sign(privateKey, manifestJson);
  return { keyId, sigBase64 };
}

/**
 * Verification result with reason
 */
export type VerifySignatureResult = {
  valid: boolean;
  /** Reason if invalid */
  reason?: string;
  /** Key status at verification time */
  keyStatus?: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NOT_FOUND';
  /** Key trust status at verification time */
  keyTrust?: 'TRUSTED' | 'QUARANTINED' | 'REJECTED' | 'NOT_FOUND';
};

/**
 * Verify manifest JSON signature
 *
 * Checks:
 * 1. Key exists in registry
 * 2. Key is not REVOKED (factory safety)
 * 3. Key is not EXPIRED
 * 4. Cryptographic signature is valid
 *
 * @param input - manifestJson, keyId, and sigBase64
 * @returns True if signature is valid AND key is trusted
 */
export async function verifyManifestJsonSignature(input: {
  manifestJson: string;
  keyId: string;
  sigBase64: string;
}): Promise<boolean> {
  const result = await verifyManifestJsonSignatureWithReason(input);
  return result.valid;
}

/**
 * Verify manifest JSON signature with detailed result
 *
 * Use this when you need to know why verification failed.
 */
export async function verifyManifestJsonSignatureWithReason(input: {
  manifestJson: string;
  keyId: string;
  sigBase64: string;
}): Promise<VerifySignatureResult> {
  try {
    const { record, publicKey } = await getVerifierCryptoKey(input.keyId);
    const now = nowIso();

    // Apply scope guard first (FACTORY mode enforces factoryId binding)
    const scopeGuard = guardVerifyKey(record);
    if (!scopeGuard.ok) {
      return {
        valid: false,
        reason: scopeGuard.reason,
        keyStatus: record.status,
        keyTrust: record.trust,
      };
    }

    // Check revocation policy (offline-friendly time-based revocation)
    // Blocks manifests created AFTER the key's revocation time
    const revocationCheck = isKeyRevokedForManifest(input.keyId, now);
    if (revocationCheck.revoked) {
      audit('VERIFY_BLOCKED_REVOCATION', 'system', {
        keyId: input.keyId,
        manifestCreatedAt: now,
        revokedAt: revocationCheck.rule?.revokedAtIso,
        reason: revocationCheck.reason,
      });
      return {
        valid: false,
        reason: revocationCheck.reason ?? 'Key is revoked for this manifest timestamp',
        keyStatus: 'REVOKED',
        keyTrust: record.trust,
      };
    }

    // Check trust status (multi-machine trust workflow)
    if (DEFAULT_KEY_POLICY.requireTrustedKeyForVerify && !isTrusted(record)) {
      const trustReason = isQuarantined(record)
        ? 'Key is QUARANTINED and pending approval. Trust this key before verification.'
        : `Key is ${record.trust} and cannot be used for verification.`;
      return {
        valid: false,
        reason: trustReason,
        keyStatus: record.status,
        keyTrust: record.trust,
      };
    }

    // Check key status policy
    if (record.status === 'REVOKED') {
      if (!DEFAULT_KEY_POLICY.allowVerifyWithRevokedKey) {
        return {
          valid: false,
          reason: `Key was revoked${record.revokedAtIso ? ` on ${record.revokedAtIso}` : ''}${record.revokedReason ? `: ${record.revokedReason}` : ''}`,
          keyStatus: 'REVOKED',
          keyTrust: record.trust,
        };
      }
    }

    if (isExpired(record, now)) {
      if (!DEFAULT_KEY_POLICY.allowVerifyWithExpiredKey) {
        return {
          valid: false,
          reason: `Key expired on ${record.expiresAtIso}`,
          keyStatus: 'EXPIRED',
          keyTrust: record.trust,
        };
      }
    }

    // For strict factory verification, require ACTIVE
    if (!canVerify(record, now, DEFAULT_KEY_POLICY)) {
      return {
        valid: false,
        reason: `Key is not active. Status: ${record.status}`,
        keyStatus: record.status,
        keyTrust: record.trust,
      };
    }

    // Verify cryptographic signature
    const sigValid = await ed25519Verify(
      publicKey,
      input.manifestJson,
      input.sigBase64
    );

    if (!sigValid) {
      return {
        valid: false,
        reason: 'Cryptographic signature verification failed',
        keyStatus: 'ACTIVE',
        keyTrust: record.trust,
      };
    }

    return {
      valid: true,
      keyStatus: 'ACTIVE',
      keyTrust: 'TRUSTED',
    };
  } catch (e) {
    // Key not found in registry
    return {
      valid: false,
      reason: e instanceof Error ? e.message : 'Key not found or verification error',
      keyStatus: 'NOT_FOUND',
      keyTrust: 'NOT_FOUND',
    };
  }
}
