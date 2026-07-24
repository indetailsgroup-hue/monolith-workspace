/**
 * types.ts - Independent protocol + verifier types (design §11, §13, §14)
 *
 * These types are a SEPARATELY AUTHORED restatement of the FactoryPacket V3
 * protocol shapes the verifier consumes. They deliberately import NOTHING from
 * the builder (`server/src`, `src/factory/packet`, `src/core/manufacturing`); the
 * only shared contract is the normative protocol text and the golden vectors.
 *
 * The stable reason-code strings are copied here AS DATA (not imported), exactly
 * as the plan's independence contract expects: "a local copy of the code strings
 * is fine and expected for independence."
 *
 * Phase: NOT_FOR_PRODUCTION. Types + constants only.
 */

export type Sha256Hex = string;
export type Iso8601 = string;
export type SignatureAlgorithm = 'ed25519';
export type KeyPurpose = 'RELEASE' | 'PROFILE_ATTESTATION' | 'WARNING_EXCEPTION';
export type TrustBundleKeyPurpose = 'TRUST_BUNDLE';
export type RevocationMode = 'ALL_SIGNATURES' | 'SIGNED_AT_OR_AFTER' | 'ISSUANCE_DISABLED';
export type TrustBundleType = 'TRUST' | 'RELEASE_STATUS';

export interface SignatureEnvelopeV1 {
  alg: SignatureAlgorithm;
  keyId: string;
  sig: string;
}

export interface TenantScopeV1 {
  tenantId: string;
  orgId: string;
  siteId: string;
  policyVersion: string;
}

export interface TrustedKeyV1 {
  keyId: string;
  purpose: KeyPurpose;
  algorithm: SignatureAlgorithm;
  validFrom: Iso8601;
  validUntil: Iso8601;
  /** Optional pinned raw public key (hex) for real Ed25519 verification of a production cert. */
  publicKeyHex?: string;
}

export interface KeyRevocationV1 {
  keyId: string;
  revocationMode: RevocationMode;
  effectiveAt: Iso8601;
  reason: string;
}

export interface RevocationEntryV1 {
  id: string;
  hash: Sha256Hex;
  effectiveAt: Iso8601;
  reason: string;
}

export interface TrustBundleV1 {
  bundleType: 'TRUST';
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  trustedKeys: TrustedKeyV1[];
  keyRevocations: KeyRevocationV1[];
  profileAttestationRevocations: RevocationEntryV1[];
  warningExceptionGrantRevocations: RevocationEntryV1[];
  signature: SignatureEnvelopeV1;
}

export interface ReleaseStatusBundleV1 {
  bundleType: 'RELEASE_STATUS';
  trustScope: TenantScopeV1;
  sequence: number;
  issuedAt: Iso8601;
  expiresAt: Iso8601;
  revokedReleaseRevisionIds: string[];
  signature: SignatureEnvelopeV1;
}

export interface PacketFileEntryV3 {
  path: string;
  sha256: Sha256Hex;
  bytes: number;
}

export interface FactoryPacketManifestV3 {
  schemaVersion: 'V3';
  tenantScope: TenantScopeV1;
  releaseRevisionId: string;
  candidateHash: Sha256Hex;
  files: PacketFileEntryV3[];
  contentHash: Sha256Hex;
}

export interface ReleaseCertificateV1 {
  releaseRevisionId: string;
  tenantScope: TenantScopeV1;
  candidateHash: Sha256Hex;
  releaseAuthorizationHash: Sha256Hex;
  sortedGrantHashes: Sha256Hex[];
  attestationId: string;
  attestationHash: Sha256Hex;
  contentHash: Sha256Hex;
  expectedPacketHash: Sha256Hex;
  signerKeyId: string;
  algorithm: SignatureAlgorithm;
  releaseSequence: number;
  releasedAt: Iso8601;
  signature: SignatureEnvelopeV1;
}

// ---------------------------------------------------------------------------
// Verifier policy, state, and resource limits
// ---------------------------------------------------------------------------

export interface VerifierResourceLimits {
  /** Maximum uncompressed bytes for any single packet entry. */
  maxFileBytes: number;
  /** Maximum total uncompressed bytes across all entries. */
  maxTotalUncompressedBytes: number;
  /** Maximum uncompressed/compressed ratio for any entry (zip-bomb guard). */
  maxCompressionRatio: number;
  /** Maximum number of entries in the packet. */
  maxEntryCount: number;
}

export const DEFAULT_RESOURCE_LIMITS: VerifierResourceLimits = {
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 32 * 1024 * 1024,
  maxCompressionRatio: 50,
  maxEntryCount: 64,
};

export interface PinnedTrustBundleKeyV1 {
  keyId: string;
  algorithm: SignatureAlgorithm;
  purpose: TrustBundleKeyPurpose;
  /** Optional raw public key (hex). When present, bundle signatures are verified with real Ed25519. */
  publicKeyHex?: string;
  note?: string;
}

export interface VerifierPolicyV1 {
  schema: string;
  permittedTrustScope: TenantScopeV1;
  pinnedTrustBundleKey: PinnedTrustBundleKeyV1;
  freshness: {
    maxOfflineStalenessSeconds: number;
    maxBundleAgeSeconds: number;
  };
  archive: {
    maxArchiveAgeSeconds: number;
    requireBootstrapCheckpoint: boolean;
  };
  resourceLimits?: VerifierResourceLimits;
}

/**
 * The verifier's persistent state (plan Task 10 Step 4). Both maps are keyed by
 * `${bundleType}:${canonical(trustScope)}` via `stateKey`. `bootstrapCheckpoint`
 * carries the pinned first-use minimum sequences; `highWaterMarks` advance only
 * after a full PASS.
 */
export interface VerifierStateV1 {
  bootstrapCheckpoint: Readonly<Record<string, number>>;
  highWaterMarks: Readonly<Record<string, number>>;
}

export type VerificationVerdict = 'PASS' | 'FAIL';

export interface VerificationReportV1 {
  verdict: VerificationVerdict;
  /** Stable reason codes; empty on PASS, exactly one on a fail-fast FAIL. */
  codes: TrustReasonCode[];
  checkedHashes: Record<string, Sha256Hex>;
  bundleSequences: Record<string, number>;
  verifierBuildHash: Sha256Hex;
  /** The instant this verification is anchored to (the staler of the two bundles' issuedAt). */
  validAsOf: Iso8601 | null;
  freshnessAgeSeconds: number | null;
  checkpoint: string | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Local copy of the stable reason-code registry (design §13). DATA, not import.
// ---------------------------------------------------------------------------

export const TRUST_REASON_CODES = [
  'AUTH_REQUIRED',
  'AUTH_ANON_NOT_ALLOWED',
  'AUTH_MEMBERSHIP_REVOKED',
  'AUTH_SCOPE_DENIED',
  'AUTH_SOD_VIOLATION',
  'AUTH_ACTION_CONTEXT_INVALID',
  'AUTH_ACTION_CONTEXT_EXPIRED',
  'STATE_CANDIDATE_STALE',
  'STATE_RELEASE_AUTHORIZATION_STALE',
  'STATE_CONFLICT',
  'STATE_RELEASE_REVOKED',
  'STATE_IDEMPOTENCY_MISMATCH',
  'GATE_HARD_BLOCKER',
  'GATE_WARNING_EXCEPTION_EXPIRED',
  'GATE_WARNING_EXCEPTION_MISMATCH',
  'CAP_UNKNOWN_TOOL',
  'CAP_UNSUPPORTED_OPERATION',
  'CAP_PROFILE_MISMATCH',
  'CAP_PROFILE_ATTESTATION_INVALID',
  'CAP_PROFILE_ATTESTATION_EXPIRED',
  'CAP_PARAMETER_RANGE',
  'PACKET_SCHEMA_UNSUPPORTED',
  'PACKET_HASH_MISMATCH',
  'PACKET_EXTRA_FILE',
  'PACKET_RESOURCE_LIMIT',
  'CRYPTO_SIGNER_UNAVAILABLE',
  'CRYPTO_SIGNATURE_INVALID',
  'CRYPTO_ALGORITHM_DENIED',
  'TRUST_BUNDLE_EXPIRED',
  'TRUST_SEQUENCE_ROLLBACK',
  'TRUST_SCOPE_MISMATCH',
  'TRUST_CLOCK_UNAVAILABLE',
  'TRUST_CHECKPOINT_REQUIRED',
  'TRUST_FRESHNESS_UNPROVEN',
  'STORE_QUARANTINE_FAILED',
  'STORE_HASH_MISMATCH',
  'STORE_ARTIFACT_UNAVAILABLE',
  'STORE_PLAINTEXT_ACCESS_DENIED',
] as const;

export type TrustReasonCode = (typeof TRUST_REASON_CODES)[number];

export function isTrustReasonCode(value: unknown): value is TrustReasonCode {
  return typeof value === 'string' && (TRUST_REASON_CODES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Total result type (the verifier never throws across a check boundary).
// ---------------------------------------------------------------------------

export type VResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: TrustReasonCode; readonly detail?: Readonly<Record<string, string>> };

export function vok<T>(value: T): VResult<T> {
  return { ok: true, value };
}

export function verr<T>(code: TrustReasonCode, detail?: Readonly<Record<string, string>>): VResult<T> {
  return detail === undefined ? { ok: false, code } : { ok: false, code, detail };
}
