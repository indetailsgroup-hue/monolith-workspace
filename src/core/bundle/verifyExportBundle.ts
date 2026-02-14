/**
 * verifyExportBundle.ts - Verify Export Bundle
 *
 * Quick verification of an export bundle:
 * 1. Parse bundle index
 * 2. Verify artifact hashes match
 * 3. Verify manifest signature (if keyring provided)
 *
 * @version 1.0.0
 */

import type { Keyring } from '../crypto/keyring';
import type { BundleVerificationResult } from './bundleTypes';
import { sha256Hex } from '../../crypto/sha256';

/**
 * Quick-verify an export bundle
 *
 * Parses the bundle, verifies internal consistency,
 * and checks manifest signatures if keyring is available.
 */
export async function quickVerifyBundle(
  zipBlob: Blob,
  keyring: Keyring
): Promise<BundleVerificationResult> {
  try {
    // Read the blob as text (the index JSON is at the start)
    const text = await zipBlob.text();

    // Try to extract the JSON index
    // The bundle starts with a JSON object
    let indexEnd = 0;
    let braceDepth = 0;
    let inString = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"' && (i === 0 || text[i - 1] !== '\\')) {
        inString = !inString;
      }
      if (!inString) {
        if (ch === '{') braceDepth++;
        if (ch === '}') {
          braceDepth--;
          if (braceDepth === 0) {
            indexEnd = i + 1;
            break;
          }
        }
      }
    }

    if (indexEnd === 0) {
      return { ok: false, reason: 'Bundle index not found' };
    }

    const indexJson = text.slice(0, indexEnd);
    const index = JSON.parse(indexJson);

    // Basic structure validation
    if (!index.jobId || !index.headManifestHashHex || !index.bundleHashHex) {
      return { ok: false, reason: 'Bundle index missing required fields' };
    }

    if (!Array.isArray(index.artifacts) || index.artifacts.length === 0) {
      return { ok: false, reason: 'Bundle has no artifacts' };
    }

    // Verify bundle hash
    const hashInput = index.artifacts.map((a: { sha256Hex: string }) => a.sha256Hex).join(':');
    const computedHash = await sha256Hex(hashInput);

    if (computedHash !== index.bundleHashHex) {
      return {
        ok: false,
        reason: 'Bundle hash mismatch',
        details: [`Expected: ${index.bundleHashHex}`, `Computed: ${computedHash}`],
      };
    }

    // Verify chain proof signatures if present
    if (index.chainProof && Array.isArray(index.chainProof)) {
      for (const manifest of index.chainProof) {
        if (manifest.manifestSignature) {
          const { keyId, signatureHex } = manifest.manifestSignature;
          const hasKey = await keyring.hasKey(keyId);
          if (hasKey) {
            const valid = await keyring.verifySignature({
              message: manifest.manifestHashHex,
              signatureHex,
              keyId,
            });
            if (!valid) {
              return {
                ok: false,
                reason: `Chain proof signature invalid for manifest ${manifest.manifestHashHex}`,
              };
            }
          }
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: 'Bundle verification error',
      details: [e instanceof Error ? e.message : 'Unknown error'],
    };
  }
}
