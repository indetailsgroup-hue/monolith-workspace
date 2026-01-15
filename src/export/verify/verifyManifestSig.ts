/**
 * Verify Manifest Signature
 *
 * Step 7 of Plasticity-Style Modeling Layer:
 * - Verifies manifest.sig.json matches manifest.json
 * - Uses same mock signing recipe as signer.ts
 *
 * v1.0: Initial manifest signature verification
 */

import { fnv1aHash } from '../../core/manufacturing/release/signer';
import type { VerifyIssue } from './verifyTypes';

/** Signature payload structure */
interface SigPayload {
  alg: string;
  keyId: string;
  signedAtIso: string;
  signature: string;
}

/**
 * Verify manifest signature (mock).
 * Uses same recipe as signManifest in signer.ts.
 */
export function verifyManifestSigMock(input: {
  manifestJson: string;
  sigJson: string;
}): { ok: boolean; issues: VerifyIssue[] } {
  const issues: VerifyIssue[] = [];
  let sig: SigPayload | null = null;

  // Parse signature JSON
  try {
    sig = JSON.parse(input.sigJson);
  } catch {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_PARSE_FAIL',
      message: 'manifest.sig.json is not valid JSON',
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  // Validate signature schema
  if (!sig || typeof sig.signature !== 'string' || typeof sig.keyId !== 'string') {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_SCHEMA_INVALID',
      message: 'manifest.sig.json schema invalid (missing signature or keyId)',
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  // Recompute expected signature using same recipe as signer.ts
  // signPayloadMock uses: fnv1aHash(`${keyId}::${signedAtIso}::${payload}`)
  const toSign = `${sig.keyId}::${sig.signedAtIso}::${input.manifestJson}`;
  const expected = fnv1aHash(toSign);

  if (expected !== sig.signature) {
    issues.push({
      severity: 'ERROR',
      code: 'SIG_MISMATCH',
      message: `Manifest signature mismatch: expected ${expected}, got ${sig.signature}`,
      path: 'manifest.sig.json',
    });
    return { ok: false, issues };
  }

  issues.push({
    severity: 'INFO',
    code: 'SIG_OK',
    message: `Signature OK (alg=${sig.alg ?? 'MOCK'}, keyId=${sig.keyId})`,
    path: 'manifest.sig.json',
  });

  return { ok: true, issues };
}
