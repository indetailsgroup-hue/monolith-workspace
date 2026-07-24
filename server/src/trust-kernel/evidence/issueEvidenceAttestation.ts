/**
 * issueEvidenceAttestation.ts — sign the evidence attestation with a SEPARATE
 * evidence key (design §16.4, plan Task 12 Step 2).
 *
 * `EvidenceAttestationV1` is signed by a CI/workload identity key that is distinct
 * from the release key (purpose `EVIDENCE`), and binds the Git state of both roots,
 * the exact command/report digests, the CI run/workflow identity, the builder and
 * verifier binary hashes, issuedAt, the retention policy, and the evidence root hash.
 *
 * Fail-closed contract (design §16.4, plan Task 12 Step 2):
 *   - No signer config (`EVIDENCE_SIGNER_URL` / `EVIDENCE_SIGNER_KEY_ID`) → refuse.
 *   - Signature verification unavailable (no verifier port) → refuse.
 *   - The verifier rejects the signature → refuse.
 *   - The evidence key equals a release key → refuse (separation, §16.4/§20).
 *   - The evidence manifest is incomplete (failure/skip/empty/non-zero exit) → refuse.
 * CI therefore cannot claim a pass without a verifiable signature over COMPLETE
 * evidence.
 *
 * NO PRIVATE KEY: signing goes through the digest-only managed signer port (Task 8);
 * verification goes through an injected verifier port that holds only the evidence
 * PUBLIC key / a managed verify endpoint. This module never receives, derives, or
 * stores private key material.
 *
 * Shadow limitation (mirrors Task 10): in this phase the evidence signature is an
 * integrity-by-hash + authority-by-separate-key scheme, not production authenticity;
 * production assurance needs the real managed evidence signer + pinned public key.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import { canonicalJson } from '../canonical/canonicalJson.js';
import { sha256Hex } from '../canonical/hash.js';
import { ok, err, type TrustResult } from '../result.js';
import type { ManagedSignerPort } from '../signing/managedSignerPort.js';
import type { KeyPurpose } from '../contracts/protocolV3.js';
import {
  checkEvidenceComplete,
  type EvidenceManifestV1,
  type DigestRef,
  type GitState,
} from './buildEvidenceManifest.js';

// Local KeyPurpose widening (Task-1 contract delta owned by Tasks 9/12; the same
// documented-cast precedent as Task 9's TRUST_BUNDLE). Task 1's exported KeyPurpose
// is 3-valued; the evidence signing purpose crosses the digest-only port with a
// single documented cast, leaving the Task-1 contract untouched (reported delta).
export const EVIDENCE_KEY_PURPOSE = 'EVIDENCE' as const;
export type EvidenceAuthorityKeyPurpose = KeyPurpose | typeof EVIDENCE_KEY_PURPOSE;

/** The signed evidence attestation (plan Task 12 Step 2; design §16.4). */
export interface EvidenceAttestationV1 {
  schema: 'EvidenceAttestationV1';
  parentGit: GitState;
  productGit: GitState;
  commandReportDigests: readonly DigestRef[];
  ciRunId: string;
  workflowIdentity: string;
  builderBinaryHash: string;
  verifierBinaryHash: string;
  evidenceRootHash: string;
  issuedAt: string;
  retentionDays: number;
  keyId: string;
  signatureBase64: string;
}

/** The attestation body signed over — every field except the signature itself. */
export type UnsignedEvidenceAttestation = Omit<EvidenceAttestationV1, 'signatureBase64'>;

/** Signer configuration sourced from EVIDENCE_SIGNER_URL / EVIDENCE_SIGNER_KEY_ID. */
export interface EvidenceSignerConfig {
  signerUrl?: string;
  keyId?: string;
}

/**
 * Verifies an evidence signature over a digest with the evidence PUBLIC key (or a
 * managed verify endpoint). Never holds a private key. Its absence is treated as
 * "verification unavailable" and fails closed.
 */
export interface EvidenceSignatureVerifier {
  verify(input: {
    digestSha256: string;
    keyId: string;
    signatureBase64: string;
  }): Promise<TrustResult<boolean>>;
}

export interface IssueEvidenceAttestationOptions {
  signer: ManagedSignerPort;
  verifier?: EvidenceSignatureVerifier;
  config: EvidenceSignerConfig;
  /** Release key ids the evidence key must never collide with (separation, §16.4). */
  releaseKeyIds: readonly string[];
}

export type EvidenceIssueCode =
  | 'CRYPTO_SIGNER_UNAVAILABLE'
  | 'CRYPTO_SIGNATURE_INVALID'
  | 'CRYPTO_ALGORITHM_DENIED'
  | 'EVIDENCE_INCOMPLETE';

export type EvidenceIssueResult =
  | { ok: true; attestation: EvidenceAttestationV1 }
  | { ok: false; code: EvidenceIssueCode; detail: string };

function digestOf(unsigned: UnsignedEvidenceAttestation): string {
  return sha256Hex(canonicalJson(unsigned));
}

/**
 * Build, sign, and self-verify the evidence attestation. Fails closed on every
 * missing precondition; on success returns the signed `EvidenceAttestationV1`.
 */
export async function issueEvidenceAttestation(
  manifest: EvidenceManifestV1,
  opts: IssueEvidenceAttestationOptions,
): Promise<EvidenceIssueResult> {
  // (1) Complete evidence only — a failure/skip/empty/non-zero-exit manifest is
  // never signed (design §16.4).
  const complete = checkEvidenceComplete(manifest);
  if (!complete.ok) {
    const c = complete as { reason: string; detail: string };
    return { ok: false, code: 'EVIDENCE_INCOMPLETE', detail: `${c.reason}: ${c.detail}` };
  }

  // (2) Signer configuration must be present, else fail closed.
  const { signerUrl, keyId } = opts.config;
  if (!signerUrl || !keyId) {
    return {
      ok: false,
      code: 'CRYPTO_SIGNER_UNAVAILABLE',
      detail: 'EVIDENCE_SIGNER_URL and EVIDENCE_SIGNER_KEY_ID must both be configured',
    };
  }

  // (3) The evidence key must be separate from every release key (§16.4, §20).
  if (opts.releaseKeyIds.includes(keyId)) {
    return {
      ok: false,
      code: 'CRYPTO_ALGORITHM_DENIED',
      detail: 'the evidence signing key must be separate from the release key',
    };
  }

  // (4) Build the unsigned attestation bound to the manifest and its root hash.
  const unsigned: UnsignedEvidenceAttestation = {
    schema: 'EvidenceAttestationV1',
    parentGit: manifest.parentGit,
    productGit: manifest.productGit,
    commandReportDigests: manifest.layers,
    ciRunId: manifest.ciRunId,
    workflowIdentity: manifest.workflowIdentity,
    builderBinaryHash: manifest.builderBinaryHash,
    verifierBinaryHash: manifest.verifierBinaryHash,
    evidenceRootHash: manifest.evidenceRootHash,
    issuedAt: manifest.issuedAt,
    retentionDays: manifest.retentionDays,
    keyId,
  };
  const attestationDigest = digestOf(unsigned);

  // (5) Sign the DIGEST through the managed signer port (no private key here). The
  // widened EVIDENCE purpose crosses the Task-1-typed port with a documented cast.
  const signed = await opts.signer.sign({
    keyId,
    purpose: EVIDENCE_KEY_PURPOSE as unknown as KeyPurpose,
    digestSha256: attestationDigest,
  });
  if (!signed.ok) {
    const sf = signed as { code: string };
    const code: EvidenceIssueCode =
      sf.code === 'CRYPTO_SIGNATURE_INVALID' ? 'CRYPTO_SIGNATURE_INVALID' : 'CRYPTO_SIGNER_UNAVAILABLE';
    return { ok: false, code, detail: `managed signer refused: ${sf.code}` };
  }

  const attestation: EvidenceAttestationV1 = { ...unsigned, signatureBase64: signed.value.signatureBase64 };

  // (6) Signature verification is MANDATORY and fails closed when unavailable.
  const verified = await verifyEvidenceAttestation(attestation, opts.verifier);
  if (!verified.ok) {
    // strictNullChecks is off in this package; `!verified.ok` does not narrow the
    // union, so read the failure code through the codebase's documented cast idiom.
    const vf = verified as { code: string };
    return { ok: false, code: 'CRYPTO_SIGNATURE_INVALID', detail: `verification unavailable: ${vf.code}` };
  }
  if (verified.value !== true) {
    return { ok: false, code: 'CRYPTO_SIGNATURE_INVALID', detail: 'evidence signature did not verify' };
  }

  return { ok: true, attestation };
}

/**
 * Self-verify an evidence attestation: recompute the digest over the attestation body
 * (minus signature) and verify the signature through the verifier port. Fails closed
 * (CRYPTO_SIGNER_UNAVAILABLE) when no verifier is available — this is exactly the
 * check the CI "evidence self-verification" job runs.
 */
export async function verifyEvidenceAttestation(
  attestation: EvidenceAttestationV1,
  verifier: EvidenceSignatureVerifier | undefined,
): Promise<TrustResult<boolean>> {
  if (!verifier) {
    return err('CRYPTO_SIGNER_UNAVAILABLE', { reason: 'evidence signature verification is unavailable (fail-closed)' });
  }
  const { signatureBase64, ...unsigned } = attestation;
  const digest = digestOf(unsigned);
  return verifier.verify({ digestSha256: digest, keyId: attestation.keyId, signatureBase64 });
}
